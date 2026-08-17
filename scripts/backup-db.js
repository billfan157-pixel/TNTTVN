import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createClient } from '@libsql/client'

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
export async function performBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const destFile = path.join(BACKUP_DIR, `parish-backup-${timestamp}.sqlite`)

  if (!fs.existsSync(DB_FILE)) {
    console.log(`[BACKUP NOTICE] DB file ${DB_FILE} not found yet. Skipped.`)
    return false
  }

  let client = null
  try {
    const resolvedDbPath = path.resolve(DB_FILE)
    const resolvedDestPath = path.resolve(destFile)

    client = createClient({ url: `file:${resolvedDbPath}` })

    // 1. Flush uncheckpointed WAL pages to the main database file
    await client.execute('PRAGMA wal_checkpoint(TRUNCATE)')

    // 2. Snapshot-safe backup via VACUUM INTO
    const normalizedDest = resolvedDestPath.replace(/\\/g, '/')
    await client.execute(`VACUUM INTO '${normalizedDest}'`)
    console.log(`[BACKUP SUCCESS] Saved snapshot-consistent SQLite backup to ${destFile}`)

    // 3. Keep only recent backups
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.sqlite'))
      .sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtimeMs - fs.statSync(path.join(BACKUP_DIR, a)).mtimeMs)

    if (files.length > RETENTION_COUNT) {
      for (const oldFile of files.slice(RETENTION_COUNT)) {
        fs.unlinkSync(path.join(BACKUP_DIR, oldFile))
        console.log(`[BACKUP CLEANUP] Removed old backup ${oldFile}`)
      }
    }
    return true
  } catch (err) {
    console.error('[BACKUP ERROR] VACUUM INTO failed, attempting fallback checkpoint copy:', err?.message || err)
    try {
      if (client) {
        await client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
      }
      const dbBuffer = fs.readFileSync(DB_FILE)
      fs.writeFileSync(destFile, dbBuffer)
      console.log(`[BACKUP SUCCESS (FALLBACK)] Saved copy to ${destFile}`)
      return true
    } catch (fallbackErr) {
      console.error('[BACKUP FATAL] Fallback copy also failed:', fallbackErr)
      return false
    }
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
