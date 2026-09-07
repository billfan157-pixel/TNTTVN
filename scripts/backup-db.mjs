import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createClient } from '@libsql/client'
import { randomUUID } from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backups')
const DB_FILE = process.env.DB_PATH || path.join(__dirname, '../server/data/parish.db')
const RETENTION_COUNT = Number(process.env.BACKUP_RETENTION_COUNT) || 5

/**
 * Performs a snapshot-safe backup of live SQLite database.
 * INF-01 (2026-08-14): Sửa guard process.argv[1] nhận diện đúng backup-db.mjs & import.meta.url.
 * INF-03 (2026-08-14): Dùng PRAGMA wal_checkpoint(TRUNCATE) + VACUUM INTO để sao lưu
 * nhất quán trạng thái DB (snapshot-consistent) mà không copy torn-page file thô lúc WAL active.
 */
export async function performBackup({ dbFile = DB_FILE, backupDir = BACKUP_DIR, retentionCount = RETENTION_COUNT } = {}) {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const destFile = path.resolve(backupDir, `parish-backup-${timestamp}-${randomUUID()}.sqlite`)
  const partialFile = `${destFile}.partial`

  if (!fs.existsSync(dbFile)) {
    console.log(`[BACKUP NOTICE] DB file ${dbFile} not found yet. Skipped.`)
    return false
  }

  let client = null
  try {
    const resolvedDbPath = path.resolve(dbFile)

    client = createClient({ url: `file:${resolvedDbPath}` })

    // 1. Flush uncheckpointed WAL pages to the main database file
    try {
      await client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (err) {
      console.warn('[BACKUP WARNING] Checkpoint failed; requiring VACUUM snapshot:', err?.message || err)
    }

    // 2. Snapshot-safe backup via VACUUM INTO
    const normalizedPartial = partialFile.replace(/\\/g, '/').replace(/'/g, "''")
    await client.execute(`VACUUM INTO '${normalizedPartial}'`)
    fs.renameSync(partialFile, destFile)
    console.log(`[BACKUP SUCCESS] Saved snapshot-consistent SQLite backup to ${destFile}`)

    // 3. Keep only recent backups
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => /^parish-backup-.*\.sqlite$/.test(f))
      .sort((a, b) => fs.statSync(path.join(backupDir, b)).mtimeMs - fs.statSync(path.join(backupDir, a)).mtimeMs)

    const keep = Number.isInteger(retentionCount) && retentionCount > 0 ? retentionCount : 5
    if (files.length > keep) {
      for (const oldFile of files.slice(keep)) {
        fs.unlinkSync(path.join(backupDir, oldFile))
        console.log(`[BACKUP CLEANUP] Removed old backup ${oldFile}`)
      }
    }
    return true
  } catch (err) {
    console.error('[BACKUP ERROR] Snapshot backup aborted; no raw-file fallback:', err?.message || err)
    try {
      // Only our unique incomplete artifact, never the source or existing backups.
      if (fs.existsSync(partialFile)) fs.unlinkSync(partialFile)
    } catch (cleanupErr) {
      console.warn('[BACKUP WARNING] Incomplete artifact cleanup failed:', cleanupErr?.message || cleanupErr)
    }
    return false
  } finally {
    if (client) {
      client.close()
    }
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  try {
    const runFile = path.resolve(process.argv[1])
    const thisFile = path.resolve(__filename)
    if (runFile === thisFile) return true
    if (pathToFileURL(runFile).href === import.meta.url) return true
    return process.argv[1].endsWith('backup-db.mjs') || process.argv[1].endsWith('backup-db.js')
  } catch {
    return false
  }
}

if (isDirectExecution()) {
  performBackup()
    .then((ok) => {
      process.exit(ok ? 0 : 1)
    })
    .catch((err) => {
      console.error('[BACKUP UNCAUGHT]', err)
      process.exit(1)
    })
}
