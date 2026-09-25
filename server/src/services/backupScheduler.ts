import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { db, client, dbConfig } from '../db/index.js'
import { systemSettings } from '../db/schema.js'
import { and, eq } from 'drizzle-orm'
import { putObject, listObjects, deleteObject } from './blobStorage.js'
import { createAndStoreRemoteBackup } from './remoteBackup.js'
import { getDeploymentParishId } from '../utils/deploymentParish.js'
import { tryChmod600 } from '../utils/safetyDir.js'

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
  const raw = process.env.AUTO_BACKUP_HOUR
  const hour = raw?.trim() ? Number(raw) : 2
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 2
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
       console.log(`[BACKUP SUCCESS] Encrypted backup set stored at ${result.objectKey} (${result.rowCount} rows, ${result.archiveObjectCount} archive objects)`)

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
    let artifact: Buffer
    try {
      await client.execute(`VACUUM INTO '${normalizedPartial}'`)
      // DR-P2-002: read the completed artifact from its partial path BEFORE
      // publishing. The blob write must never touch the published file in
      // place — a failed rewrite under the final name would leave a
      // completed-looking but corrupted backup.
      artifact = fs.readFileSync(partialFile)
      // NEW-F-02 (AUDIT04 unknowns closure): the local artifact holds the full
      // parish DB — restrict it like safety/ files. chmod before rename so the
      // published file keeps the restrictive mode (rename preserves the inode).
      tryChmod600(partialFile)
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
    await putObject(`backups/${path.basename(destFile)}`, artifact, 'application/x-sqlite3')

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
    const allObjects = await listObjects('backups/')
    const v2Manifests = allObjects
      .filter(object => /^backups\/v2\/[^/]+\/manifest\.json$/.test(object.key))
      .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
    const retainedRoots = new Set(v2Manifests.slice(0, retentionCount).map(object => object.key.slice(0, -'manifest.json'.length)))
    for (const manifest of v2Manifests.slice(retentionCount)) {
      const root = manifest.key.slice(0, -'manifest.json'.length)
      for (const object of allObjects.filter(item => item.key.startsWith(root))) {
        await deleteObject(object.key)
        console.log(`[BACKUP CLEANUP] Removed old backup set object ${object.key}`)
      }
    }
    const legacyObjects = allObjects
      .filter(object => !object.key.startsWith('backups/v2/'))
      .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
    if (legacyObjects.length > retentionCount) {
      for (const old of legacyObjects.slice(retentionCount)) {
        await deleteObject(old.key)
        console.log(`[BACKUP CLEANUP] Removed old backup ${old.key}`)
      }
    }
    if (retainedRoots.size < v2Manifests.length) {
      console.log(`[BACKUP CLEANUP] Retained ${retainedRoots.size} complete backup sets`)
    }
  } catch (cleanupErr: any) {
    console.warn('[BACKUP WARNING] Cleanup old backups encountered an issue:', cleanupErr?.message || cleanupErr)
  }
}

/**
 * Scheduled check for automated daily backup.
 *
 * DR-P2-003: the target hour is the primary window, but any check at or after
 * the window still runs a catch-up backup when the last successful marker
 * predates today — a missed window (process down, host asleep or crashed
 * through the whole target hour) must not leave the day without a backup.
 * A marker equal to today means the daily backup already succeeded, whatever
 * hour it happened at. Checks before the target hour never fire, so a fresh
 * day still waits for its scheduled window.
 */
export async function runAutoBackupCheck(now: Date = new Date()): Promise<boolean> {
  if (process.env.AUTO_BACKUP_ENABLED === 'false') return false
  if (now.getHours() < getTargetHour()) return false

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

/**
 * DR-P2-003: operational freshness signal for the daily backup. Reads the
 * durable success marker only — a schedule that fired without a completed
 * backup never counts as fresh.
 */
export async function getAutoBackupStatus(now: Date = new Date()): Promise<{
  enabled: boolean
  lastAutoBackupDate: string | null
  isCurrent: boolean
  overdue: boolean
}> {
  const enabled = process.env.AUTO_BACKUP_ENABLED !== 'false'
  try {
    const [marker] = await db
      .select()
      .from(systemSettings)
      .where(and(eq(systemSettings.key, MARKER_KEY), eq(systemSettings.parishId, getParishId())))
      .limit(1)
    const lastAutoBackupDate = marker?.value ?? null
    const deadline = new Date(now)
    if (now.getHours() < getTargetHour()) deadline.setDate(deadline.getDate() - 1)
    const validDate = lastAutoBackupDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(lastAutoBackupDate)
    const isCurrent = validDate && lastAutoBackupDate >= dateKey(deadline) && lastAutoBackupDate <= dateKey(now)
    return { enabled, lastAutoBackupDate, isCurrent, overdue: enabled && !isCurrent }
  } catch {
    return { enabled, lastAutoBackupDate: null, isCurrent: false, overdue: enabled }
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
