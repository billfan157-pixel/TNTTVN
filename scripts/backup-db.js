import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BACKUP_DIR = path.join(__dirname, '../backups')
const DB_FILE = path.join(__dirname, '../server/parish.db')

export function performBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const destFile = path.join(BACKUP_DIR, `parish-backup-${timestamp}.sqlite`)

  try {
    if (fs.existsSync(DB_FILE)) {
      // Safe write copy
      const dbBuffer = fs.readFileSync(DB_FILE)
      fs.writeFileSync(destFile, dbBuffer)
      console.log(`[BACKUP SUCCESS] Saved safe SQLite backup to ${destFile}`)

      // Keep only last 5 backups
      const files = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.endsWith('.sqlite'))
        .sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtimeMs - fs.statSync(path.join(BACKUP_DIR, a)).mtimeMs)

      if (files.length > 5) {
        for (const oldFile of files.slice(5)) {
          fs.unlinkSync(path.join(BACKUP_DIR, oldFile))
          console.log(`[BACKUP CLEANUP] Removed old backup ${oldFile}`)
        }
      }
    } else {
      console.log(`[BACKUP NOTICE] DB file ${DB_FILE} not found yet. Skipped.`)
    }
  } catch (err) {
    console.error('[BACKUP ERROR]', err)
  }
}

if (process.argv[1] && process.argv[1].endsWith('backup-db.js')) {
  performBackup()
}
