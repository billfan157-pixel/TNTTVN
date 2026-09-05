import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { db, client, dbConfig } from '../db/index.js'
import { systemSettings } from '../db/schema.js'
import { and, eq } from 'drizzle-orm'
import { putObject, listObjects, deleteObject } from './blobStorage.js'
import { createAndStoreRemoteBackup } from './remoteBackup.js'
import { getDeploymentParishId } from '../utils/deploymentParish.js'

const CHECK_INTERVAL_MS = 60 * 1000 // Check every minute
const MARKER_KEY = 'auto_backup_last_date'

function getParishId(): string {
  return getDeploymentParishId()
}

function getBackupDir(): string {
  return process.env.BACKUP_DIR || path.join(process.cwd(), 'backups')
}

function getRetentionCount(): number {
  return Number(process.env.BACKUP_RETENTION_COUNT) || 5
}

function getTargetHour(): number {
  return Number(process.env.AUTO_BACKUP_HOUR) || 2 // 02:00 AM default
}

let timer: NodeJS.Timeout | null = null
let running = false
let activeRun: Promise<boolean> | null = null

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Performs snapshot-consistent database backup.
 * INF-01 / INF-02 / INF-03 (2026-08-14): Tự động sao lưu định kỳ với VACUUM INTO + WAL checkpoint.
 */
export async function runBackupNow(): Promise<{ success: boolean; destFile?: string; error?: string }> {
  if (dbConfig.isRemote) {
    try {
      const result = await createAndStoreRemoteBackup(client)
      console.log(`[BACKUP SUCCESS] Encrypted Turso logical backup stored at ${result.objectKey} (${result.rowCount} rows)`)
      await enforceRetention(getRetentionCount())
      return { success: true, destFile: result.objectKey }
    } catch (err: any) {
      console.error('[BACKUP ERROR] Remote backup failed:', err)
      return { success: false, error: err?.message || 'Remote backup failed' }
    }
  }

  try {
    const backupDir = getBackupDir()
    const retentionCount = getRetentionCount()

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const destFile = path.join(backupDir, `parish-backup-${timestamp}.sqlite`)
    const partialFile = `${destFile}.partial-${process.pid}-${randomUUID()}`

    // 1. Flush WAL pages to main database file
    try {
      await client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (e: any) {
      console.warn('[BACKUP WARNING] Pre-backup WAL checkpoint failed; continuing with VACUUM INTO snapshot:', e?.message || e)
    }

    // 2. Snapshot-safe backup via VACUUM INTO. Never fall back to copying only
    // the main SQLite file: committed pages may still live in WAL. Write to a
    // unique partial path and publish the artifact only after VACUUM succeeds.
    const normalizedPartial = path.resolve(partialFile).replace(/\\/g, '/').replace(/'/g, "''")
    try {
      await client.execute(`VACUUM INTO '${normalizedPartial}'`)
      fs.renameSync(partialFile, destFile)
    } catch (vacuumErr: any) {
      try {
        if (fs.existsSync(partialFile)) fs.unlinkSync(partialFile)
      } catch (cleanupErr: any) {
        console.warn('[BACKUP WARNING] Failed to remove incomplete backup artifact:', cleanupErr?.message || cleanupErr)
      }
      throw new Error(`Snapshot-safe VACUUM INTO failed; backup aborted: ${vacuumErr?.message || vacuumErr}`)
    }

    console.log(`[BACKUP SUCCESS] Automatic backup created at ${destFile}`)

    // 3. Đẩy lên blob storage (R2 nếu cấu hình, fallback local — ADR-041).
    const buf = fs.readFileSync(destFile)
    await putObject(`backups/${path.basename(destFile)}`, buf, 'application/x-sqlite3')

    // 4. Retention policy: Keep only last retentionCount files (qua abstraction).
    await enforceRetention(retentionCount)

    return { success: true, destFile }
  } catch (err: any) {
    console.error('[BACKUP ERROR] Automatic backup failed:', err)
    return { success: false, error: err?.message || 'Backup failed' }
  }
}

async function enforceRetention(retentionCount: number): Promise<void> {
  try {
    const objects = (await listObjects('backups/')).sort(
      (a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0),
    )
    if (objects.length > retentionCount) {
      for (const old of objects.slice(retentionCount)) {
        await deleteObject(old.key)
        console.log(`[BACKUP CLEANUP] Removed old backup ${old.key}`)
      }
    }
  } catch (cleanupErr: any) {
    console.warn('[BACKUP WARNING] Cleanup old backups encountered an issue:', cleanupErr?.message || cleanupErr)
  }
}

/**
 * Scheduled check for automated daily backup.
 */
export async function runAutoBackupCheck(now: Date = new Date()): Promise<boolean> {
  const currentHour = now.getHours()
  if (currentHour !== getTargetHour()) return false

  const today = dateKey(now)
  const parishId = getParishId()
  try {
    const [marker] = await db
      .select()
      .from(systemSettings)
      .where(and(eq(systemSettings.key, MARKER_KEY), eq(systemSettings.parishId, parishId)))
      .limit(1)

    if (marker && marker.value === today) {
      return false // Already backed up today
    }

    const res = await runBackupNow()
    if (res.success) {
      const nowIso = new Date().toISOString()
      if (marker) {
        await db
          .update(systemSettings)
          .set({ value: today, updatedAt: nowIso })
          .where(and(eq(systemSettings.key, MARKER_KEY), eq(systemSettings.parishId, parishId)))
      } else {
        await db.insert(systemSettings).values({
          key: MARKER_KEY,
          value: today,
          description: 'Ngày gần nhất đã tự động sao lưu CSDL (auto daily backup marker)',
          updatedAt: nowIso,
          parishId: parishId,
        }).onConflictDoNothing()
      }
      return true
    }
    return false
  } catch (err) {
    console.error('[BACKUP CHECK ERROR]', err)
    return false
  }
}

export function initBackupScheduler(intervalMs = CHECK_INTERVAL_MS): void {
  if (process.env.AUTO_BACKUP_ENABLED === 'false') {
    console.log('[BACKUP SCHEDULER] Auto backup disabled via AUTO_BACKUP_ENABLED=false')
    return
  }

  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    if (running) return
    running = true
    activeRun = runAutoBackupCheck().finally(() => {
      running = false
      activeRun = null
    })
  }, intervalMs)

  if (typeof timer.unref === 'function') timer.unref()
  console.log(`[BACKUP SCHEDULER] Started automated daily backup scheduler (target hour: ${getTargetHour()}:00 AM)`)
}

export async function stopBackupScheduler(): Promise<void> {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (activeRun) await activeRun
}
