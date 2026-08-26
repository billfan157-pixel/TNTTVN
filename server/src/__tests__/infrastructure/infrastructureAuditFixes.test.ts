import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { runBackupNow, runAutoBackupCheck,  stopBackupScheduler } from '../../services/backupScheduler.js'
import { db } from '../../db/index.js'
import { systemSettings } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import healthRouter from '../../routes/health.js'

const TEST_BACKUP_DIR = path.join(process.cwd(), 'backups-test-infra')

describe('Infrastructure Audit Fixes (INF-01 .. INF-06)', () => {
  beforeEach(() => {
    process.env.BACKUP_DIR = TEST_BACKUP_DIR
    process.env.BACKUP_RETENTION_COUNT = '3'
    if (!fs.existsSync(TEST_BACKUP_DIR)) {
      fs.mkdirSync(TEST_BACKUP_DIR, { recursive: true })
    }
  })

  afterEach(async () => {
    stopBackupScheduler()
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true })
    }
    await db.delete(systemSettings).where(
      and(eq(systemSettings.key, 'auto_backup_last_date'), eq(systemSettings.parishId, 'gia-ton'))
    )
  })

  // ─── INF-01 & INF-03: Snapshot-Safe SQLite Backup ───
  it('INF-01 & INF-03: runBackupNow() creates a valid snapshot-safe SQLite backup file via VACUUM INTO', async () => {
    const res = await runBackupNow()
    expect(res.success).toBe(true)
    expect(res.destFile).toBeDefined()
    expect(fs.existsSync(res.destFile!)).toBe(true)

    // Verify backup file is non-empty and starts with SQLite header
    const buffer = fs.readFileSync(res.destFile!)
    expect(buffer.length).toBeGreaterThan(0)
    const header = buffer.slice(0, 16).toString('utf8')
    expect(header).toContain('SQLite format 3')
  })

  it('INF-03: enforces retention policy keeping only latest N backup files', async () => {
    // Create 4 dummy backup files with staggered modification times
    for (let i = 1; i <= 4; i++) {
      const file = path.join(TEST_BACKUP_DIR, `parish-backup-old-${i}.sqlite`)
      fs.writeFileSync(file, 'dummy content')
      const time = new Date(Date.now() - (10 - i) * 60000)
      fs.utimesSync(file, time, time)
    }

    const res = await runBackupNow()
    expect(res.success).toBe(true)

    const remainingFiles = fs
      .readdirSync(TEST_BACKUP_DIR)
      .filter((f) => f.endsWith('.sqlite'))

    // Configured retention is 3
    expect(remainingFiles.length).toBe(3)
  })

  // ─── INF-02: Automated Backup Scheduler ───
  it('INF-02: runAutoBackupCheck() creates backup and updates system_settings marker', async () => {
    const now = new Date()
    now.setHours(2, 15, 0, 0) // Target hour is 2 AM

    const executed = await runAutoBackupCheck(now)
    expect(executed).toBe(true)

    // Second check in same day should be skipped
    const secondCheck = await runAutoBackupCheck(now)
    expect(secondCheck).toBe(false)

    // Verify marker in systemSettings
    const [marker] = await db
      .select()
      .from(systemSettings)
      .where(and(eq(systemSettings.key, 'auto_backup_last_date'), eq(systemSettings.parishId, 'gia-ton')))
      .limit(1)

    expect(marker).toBeDefined()
    expect(marker?.value).toContain(`${now.getFullYear()}`)
  })

  // ─── INF-04: DB-Aware /health Probe ───
  it('INF-04: GET /health returns database connected status on healthy server', async () => {
    const res = await healthRouter.request('/health')
    expect(res.status).toBe(200)

    const data = (await res.json()) as any
    expect(data.status).toBe('ok')
    expect(data.database).toBe('connected')
    expect(data.service).toBe('parish-lms-backend')
  })
})
