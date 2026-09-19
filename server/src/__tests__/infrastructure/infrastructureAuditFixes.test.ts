import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { runBackupNow, runAutoBackupCheck, getAutoBackupStatus, stopBackupScheduler } from '../../services/backupScheduler.js'
import { client, db } from '../../db/index.js'
import { systemSettings } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import healthRouter from '../../routes/health.js'

const TEST_BACKUP_DIR = path.join(process.cwd(), 'backups-test-infra')

describe('Infrastructure Audit Fixes (INF-01 .. INF-06)', () => {
  beforeEach(async () => {
    vi.stubEnv('AUTO_BACKUP_HOUR', '2')
    vi.stubEnv('AUTO_BACKUP_ENABLED', 'true')
    process.env.BACKUP_DIR = TEST_BACKUP_DIR
    process.env.BACKUP_RETENTION_COUNT = '3'
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
    fs.mkdirSync(TEST_BACKUP_DIR, { recursive: true })
    // The scheduled-check tests below must start from "not yet backed up today".
    // The marker row lives in the shared test DB, so a leftover row from another
    // file would silently turn the first check into a no-op. Clear it here, the
    // same way afterEach does, to keep the file order-independent.
    await db.delete(systemSettings).where(
      and(eq(systemSettings.key, 'auto_backup_last_date'), eq(systemSettings.parishId, 'gia-ton'))
    )
  })

  afterEach(async () => {
    await stopBackupScheduler()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      })
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

    const snapshotPath = path.resolve(res.destFile!).replace(/\\/g, '/').replace(/'/g, "''")
    await client.execute(`ATTACH DATABASE '${snapshotPath}' AS backup_verify`)
    try {
      const integrity = await client.execute('PRAGMA backup_verify.integrity_check')
      expect((integrity.rows[0] as Record<string, unknown>).integrity_check).toBe('ok')
    } finally {
      await client.execute('DETACH DATABASE backup_verify')
    }
  })

  it('D2: aborts without publishing or marking success when checkpoint and VACUUM INTO fail', async () => {
    const originalExecute = client.execute.bind(client)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(client, 'execute').mockImplementation((async (statement: any) => {
      const sqlText = typeof statement === 'string' ? statement : String(statement?.sql || '')
      if (sqlText.startsWith('PRAGMA wal_checkpoint') || sqlText.startsWith('VACUUM INTO')) {
        throw new Error(`forced backup failure: ${sqlText}`)
      }
      return originalExecute(statement)
    }) as any)

    const direct = await runBackupNow()
    expect(direct.success).toBe(false)
    expect(direct.error).toMatch(/VACUUM INTO failed; backup aborted/)

    const now = new Date()
    now.setHours(2, 15, 0, 0)
    expect(await runAutoBackupCheck(now)).toBe(false)

    const [marker] = await db
      .select()
      .from(systemSettings)
      .where(and(eq(systemSettings.key, 'auto_backup_last_date'), eq(systemSettings.parishId, 'gia-ton')))
      .limit(1)
    expect(marker).toBeUndefined()

    const artifacts = fs.readdirSync(TEST_BACKUP_DIR)
      .filter((name) => name.endsWith('.sqlite') || name.includes('.partial-'))
    expect(artifacts).toEqual([])
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
  it.each([3, 12, 23])('catches up after missing the scheduled window at hour %s', async hour => {
    const now = new Date(2026, 8, 19, hour)
    expect((await getAutoBackupStatus(now)).overdue).toBe(true)
    expect(await runAutoBackupCheck(now)).toBe(true)
    expect(await getAutoBackupStatus(now)).toMatchObject({ isCurrent: true, overdue: false, lastAutoBackupDate: '2026-09-19' })
    expect(await runAutoBackupCheck(now)).toBe(false)
  })

  it('waits before the window, accepts yesterday until then, and supports hour zero/disabled', async () => {
    const before = new Date(2026, 8, 19, 1)
    expect(await runAutoBackupCheck(before)).toBe(false)
    await db.insert(systemSettings).values({ key: 'auto_backup_last_date', parishId: 'gia-ton', value: '2026-09-18' })
    expect((await getAutoBackupStatus(before)).overdue).toBe(false)
    expect((await getAutoBackupStatus(new Date(2026, 8, 19, 3))).overdue).toBe(true)
    vi.stubEnv('AUTO_BACKUP_ENABLED', 'false')
    expect(await runAutoBackupCheck(new Date(2026, 8, 19, 12))).toBe(false)
    expect((await getAutoBackupStatus(before)).overdue).toBe(false)
    vi.stubEnv('AUTO_BACKUP_ENABLED', 'true')
    vi.stubEnv('AUTO_BACKUP_HOUR', '0')
    expect(await runAutoBackupCheck(new Date(2026, 8, 19, 0))).toBe(true)
  })

  it('keeps failed catch-up overdue and exposes status only behind ops authentication', async () => {
    const execute = client.execute.bind(client)
    vi.spyOn(client, 'execute').mockImplementation((async (statement: any) => {
      if (String(typeof statement === 'string' ? statement : statement?.sql || '').startsWith('VACUUM INTO')) throw new Error('Synthetic disk error')
      return execute(statement)
    }) as any)
    expect(await runAutoBackupCheck(new Date(2026, 8, 19, 12))).toBe(false)
    expect((await getAutoBackupStatus(new Date(2026, 8, 19, 12))).overdue).toBe(true)
    vi.stubEnv('OPS_TOKEN', 'synthetic-ops')
    expect((await healthRouter.request('/ready')).status).toBe(403)
    const ready = await healthRouter.request('/ready', { headers: { Authorization: 'Bearer synthetic-ops' } })
    expect((await ready.json() as any).backup.overdue).toBe(true)
    const metrics = await healthRouter.request('/metrics', { headers: { Authorization: 'Bearer synthetic-ops' } })
    expect(await metrics.text()).toContain('catevia_backup_overdue 1')
    expect((await (await healthRouter.request('/health')).json() as any).backup).toBeUndefined()
  })

  it('INF-04: GET /health returns database connected status on healthy server', async () => {
    const res = await healthRouter.request('/health')
    expect(res.status).toBe(200)

    const data = (await res.json()) as any
    expect(data.status).toBe('ok')
    expect(data.database).toBe('connected')
    expect(data.service).toBe('parish-lms-backend')
  })
})
