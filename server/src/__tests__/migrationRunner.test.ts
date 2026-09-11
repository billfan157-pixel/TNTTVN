import { describe, expect, it } from 'vitest'
import { createClient } from '@libsql/client'
import {
  applyMigrations,
  isTolerableMigrationError,
  type MigrationClient,
} from '../db/migrationRunner.js'
import { MIGRATIONS } from '../db/migrations.js'

function makeClient(options: { failSql?: string; failMessage?: string } = {}) {
  const executed: string[] = []
  const marked: string[] = []

  const client: MigrationClient = {
    async execute(statement: string) {
      executed.push(statement)
      if (statement === 'SELECT version FROM schema_migrations') return { rows: [] }
      if (statement.startsWith('INSERT OR IGNORE INTO schema_migrations')) {
        const match = statement.match(/VALUES \('([^']+)'\)/)
        if (match) marked.push(match[1])
        return { rows: [] }
      }
      if (options.failSql && statement === options.failSql) {
        throw new Error(options.failMessage || 'synthetic migration failure')
      }
      return { rows: [] }
    },
    async executeMultiple(statement: string) {
      executed.push(statement)
      if (options.failSql && statement.includes(options.failSql)) {
        throw new Error(options.failMessage || 'synthetic migration failure')
      }
      const matches = statement.matchAll(/INSERT OR IGNORE INTO schema_migrations \(version\) VALUES \('([^']+)'\)/g)
      for (const match of matches) marked.push(match[1])
      return { rows: [] }
    },
  }

  return { client, executed, marked }
}

describe('migration runner fail-closed policy', () => {
  it('aborts immediately on a non-tolerable migration error and never marks it applied', async () => {
    const brokenSql = 'ALTER TABLE users ADD COLUMN impossible_column TEXT'
    const { client, executed, marked } = makeClient({
      failSql: brokenSql,
      failMessage: 'disk I/O error',
    })

    await expect(applyMigrations(client, [
      { version: 'test-001', sql: brokenSql },
      { version: 'test-002', sql: 'CREATE TABLE should_not_run (id TEXT)' },
    ])).rejects.toThrow('Migration failed: test-001')

    expect(marked).not.toContain('test-001')
    expect(executed).not.toContain('CREATE TABLE should_not_run (id TEXT)')
  })

  it('keeps the intentional single-statement duplicate-column recovery path', async () => {
    const duplicateSql = 'ALTER TABLE users ADD COLUMN holy_name TEXT'
    const { client, marked } = makeClient({
      failSql: duplicateSql,
      failMessage: 'duplicate column name: holy_name',
    })

    await expect(applyMigrations(client, [
      { version: 'test-duplicate', sql: duplicateSql },
    ])).resolves.toBeUndefined()

    expect(marked).toContain('test-duplicate')
  })

  it('never tolerates a multi-statement failure even when the error says already exists', async () => {
    expect(isTolerableMigrationError(new Error('already exists'), true)).toBe(false)

    const { client, marked } = makeClient({
      failSql: 'CREATE TABLE duplicate_table',
      failMessage: 'table duplicate_table already exists',
    })

    await expect(applyMigrations(client, [
      {
        version: 'test-multi',
        sql: 'CREATE TABLE duplicate_table (id TEXT); CREATE INDEX idx_duplicate ON duplicate_table(id);',
      },
    ])).rejects.toThrow('Migration failed: test-multi')

    expect(marked).not.toContain('test-multi')
  })

  it('wraps multi-statement SQL and its marker in one explicit transaction', async () => {
    const { client, executed, marked } = makeClient()
    await applyMigrations(client, [{
      version: 'test-atomic',
      sql: 'CREATE TABLE atomic_a (id TEXT); CREATE TABLE atomic_b (id TEXT);',
    }])

    const batch = executed.find(statement => statement.includes('CREATE TABLE atomic_a'))!
    expect(batch).toContain('PRAGMA foreign_keys = OFF;\nBEGIN IMMEDIATE;')
    expect(batch).toContain("INSERT OR IGNORE INTO schema_migrations (version) VALUES ('test-atomic');")
    expect(batch).toContain('COMMIT;\nPRAGMA foreign_keys = ON;')
    expect(marked).toContain('test-atomic')
  })

  it('rolls back partial DDL/data and leaves foreign keys enabled after a real SQLite failure', async () => {
    const client = createClient({ url: 'file::memory:' })
    await client.execute('PRAGMA foreign_keys = ON')

    await expect(applyMigrations(client, [{
      version: 'test-real-rollback',
      sql: `
        CREATE TABLE migration_partial (id TEXT PRIMARY KEY);
        INSERT INTO migration_partial (id) VALUES ('written-before-failure');
        INSERT INTO table_that_does_not_exist (id) VALUES ('boom');
      `,
    }])).rejects.toThrow('Migration failed: test-real-rollback')

    const table = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='migration_partial'")
    expect(table.rows).toHaveLength(0)
    const marker = await client.execute("SELECT version FROM schema_migrations WHERE version='test-real-rollback'")
    expect(marker.rows).toHaveLength(0)
    const foreignKeys = await client.execute('PRAGMA foreign_keys')
    const enabled = Array.isArray(foreignKeys.rows[0]) ? foreignKeys.rows[0][0] : (foreignKeys.rows[0] as any)?.foreign_keys
    expect(Number(enabled)).toBe(1)
    client.close()
  })

  it('migration 235 retires live Telegram state without deleting delivered history', async () => {
    const client = createClient({ url: 'file::memory:' })
    await client.executeMultiple(`
      CREATE TABLE telegram_link_tokens (id TEXT PRIMARY KEY, consumed_at TEXT);
      CREATE TABLE telegram_links (
        id TEXT PRIMARY KEY, status TEXT NOT NULL, notifications_enabled INTEGER NOT NULL,
        revoked_at TEXT, updated_at TEXT
      );
      CREATE TABLE notifications (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL, error TEXT,
        lease_owner TEXT, lease_expires_at TEXT, next_attempt_at TEXT, message TEXT
      );
      INSERT INTO telegram_link_tokens (id, consumed_at) VALUES ('open', NULL), ('used', '2026-01-01');
      INSERT INTO telegram_links (id, status, notifications_enabled) VALUES ('live', 'ACTIVE', 1), ('old', 'REVOKED', 0);
      INSERT INTO notifications (id, type, status, message) VALUES
        ('pending', 'telegram', 'retrying', 'pending'),
        ('history', 'telegram', 'sent', 'delivered'),
        ('push', 'web_push', 'retrying', 'push');
    `)
    const migration = MIGRATIONS.find(item => item.version === '20260908-235')
    expect(migration).toBeDefined()
    await applyMigrations(client, [migration!])

    expect((await client.execute("SELECT consumed_at FROM telegram_link_tokens WHERE id='open'" )).rows[0]?.consumed_at).toBeTruthy()
    expect((await client.execute("SELECT status, notifications_enabled, revoked_at FROM telegram_links WHERE id='live'" )).rows[0]).toMatchObject({ status: 'REVOKED', notifications_enabled: 0 })
    expect((await client.execute("SELECT status, error FROM notifications WHERE id='pending'" )).rows[0]).toMatchObject({ status: 'failed', error: 'CHANNEL_RETIRED' })
    expect((await client.execute("SELECT status, message FROM notifications WHERE id='history'" )).rows[0]).toMatchObject({ status: 'sent', message: 'delivered' })
    expect((await client.execute("SELECT status FROM notifications WHERE id='push'" )).rows[0]).toMatchObject({ status: 'retrying' })
    client.close()
  })

  it('migration 236 preserves legacy task status and defaults phase without inference', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.executeMultiple("CREATE TABLE operation_tasks (id TEXT PRIMARY KEY, status TEXT); INSERT INTO operation_tasks VALUES ('legacy', 'DONE');")
      const migration = MIGRATIONS.find(item => item.version === '20260909-236')!
      await applyMigrations(client, [migration])
      expect((await client.execute('SELECT * FROM operation_tasks')).rows[0]).toMatchObject({ id: 'legacy', status: 'DONE', phase: 'PREPARATION' })
      await expect(client.execute("INSERT INTO operation_tasks (id, phase) VALUES ('bad', 'UNKNOWN')")).rejects.toThrow()
      await client.execute("INSERT INTO operation_tasks (id, phase) VALUES ('during', 'EXECUTION'), ('after', 'FOLLOW_UP')")
      await applyMigrations(client, [migration])
      expect((await client.execute('SELECT count(*) AS total FROM operation_tasks')).rows[0].total).toBe(3)
    } finally { client.close() }
  })

  it('migration 237 preserves legacy reminders and starts OCC version at one', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.executeMultiple("CREATE TABLE operation_reminders (id TEXT PRIMARY KEY, status TEXT); INSERT INTO operation_reminders VALUES ('legacy', 'PENDING');")
      const migration = MIGRATIONS.find(item => item.version === '20260909-237')!
      await applyMigrations(client, [migration])
      expect((await client.execute('SELECT * FROM operation_reminders')).rows[0]).toMatchObject({ id: 'legacy', status: 'PENDING', version: 1 })
      await expect(client.execute("INSERT INTO operation_reminders (id, version) VALUES ('bad', 0)")).rejects.toThrow()
      await applyMigrations(client, [migration])
      expect((await client.execute('SELECT count(*) AS total FROM operation_reminders')).rows[0].total).toBe(1)
    } finally { client.close() }
  })

  it('migration 238 preserves legacy blockouts and starts OCC version at one', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.executeMultiple("CREATE TABLE operation_blockouts (id TEXT PRIMARY KEY, starts_at TEXT, ends_at TEXT); INSERT INTO operation_blockouts VALUES ('legacy', '2026-01-01', '2026-01-02');")
      const migration = MIGRATIONS.find(item => item.version === '20260909-238')!
      await applyMigrations(client, [migration])
      expect((await client.execute('SELECT * FROM operation_blockouts')).rows[0]).toMatchObject({ id: 'legacy', version: 1 })
      await expect(client.execute("INSERT INTO operation_blockouts (id, version) VALUES ('bad', 0)")).rejects.toThrow()
      await applyMigrations(client, [migration])
      expect((await client.execute('SELECT count(*) AS total FROM operation_blockouts')).rows[0].total).toBe(1)
    } finally { client.close() }
  })

  it('migration 239 creates one OCC retrospective per tenant-scoped operation event', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.execute('PRAGMA foreign_keys = ON')
      await client.execute('CREATE TABLE operation_events (parish_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (parish_id, id))')
      await client.execute("INSERT INTO operation_events VALUES ('p1', 'event-1')")
      const migration = MIGRATIONS.find(item => item.version === '20260909-239')!
      await applyMigrations(client, [migration])
      await client.execute("INSERT INTO operation_event_retrospectives (parish_id, event_id, lessons_learned, created_by, updated_by) VALUES ('p1', 'event-1', 'Bai hoc', 'u1', 'u1')")
      await expect(client.execute("INSERT INTO operation_event_retrospectives (parish_id, event_id, lessons_learned, created_by, updated_by) VALUES ('p1', 'event-1', 'Trung', 'u1', 'u1')")).rejects.toThrow()
      await expect(client.execute("INSERT INTO operation_event_retrospectives (parish_id, event_id, lessons_learned, version, created_by, updated_by) VALUES ('p1', 'missing', 'Sai event', 1, 'u1', 'u1')")).rejects.toThrow()
      await expect(client.execute("INSERT INTO operation_event_retrospectives (parish_id, event_id, lessons_learned, version, created_by, updated_by) VALUES ('p1', 'event-1', 'Sai version', 0, 'u1', 'u1')")).rejects.toThrow()
      await applyMigrations(client, [migration])
      expect((await client.execute('SELECT count(*) AS total FROM operation_event_retrospectives')).rows[0].total).toBe(1)
    } finally { client.close() }
  })

  it('migrations 240-243 preserve immutable tenant-scoped template versions, event provenance and lifecycle OCC', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.execute('PRAGMA foreign_keys = ON')
      await client.executeMultiple(`
        CREATE TABLE parish_organization_units (parish_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (parish_id, id));
        CREATE TABLE operation_events (parish_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (parish_id, id));
        INSERT INTO parish_organization_units VALUES ('p1', 'unit-1');
        INSERT INTO operation_events VALUES ('p1', 'source-1');
      `)
      const migrations = ['20260909-240', '20260909-241', '20260909-242', '20260909-243'].map(version => MIGRATIONS.find(item => item.version === version)!)
      await applyMigrations(client, migrations)
      await client.execute("INSERT INTO operation_event_templates (parish_id,id,scope_unit_id,name,created_by,updated_by) VALUES ('p1','tpl-1','unit-1','Mau trai','u1','u1')")
      await client.execute("INSERT INTO operation_event_template_versions (parish_id,template_id,version,source_event_id,snapshot_json,created_by) VALUES ('p1','tpl-1',1,'source-1','{}','u1')")
      await client.execute("INSERT INTO operation_events (parish_id,id,source_template_id,source_template_version) VALUES ('p1','copy-1','tpl-1',1)")
      await expect(client.execute("INSERT INTO operation_events (parish_id,id,source_template_id,source_template_version) VALUES ('p2','cross-parish','tpl-1',1)")).rejects.toThrow()
      await expect(client.execute("INSERT INTO operation_events (parish_id,id,source_template_id) VALUES ('p1','partial','tpl-1')")).rejects.toThrow()
      await expect(client.execute("UPDATE operation_events SET source_template_version=2 WHERE parish_id='p1' AND id='copy-1'")).rejects.toThrow()
      await expect(client.execute("DELETE FROM operation_event_template_versions WHERE parish_id='p1' AND template_id='tpl-1' AND version=1")).rejects.toThrow()
      expect((await client.execute("SELECT version FROM operation_event_templates WHERE parish_id='p1' AND id='tpl-1'")).rows[0].version).toBe(1)
      await applyMigrations(client, migrations)
      expect((await client.execute('SELECT count(*) AS total FROM operation_event_template_versions')).rows[0].total).toBe(1)
    } finally { client.close() }
  })

  it('migrations 244-247 preserve legacy tasks and enforce valid optional shift windows', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.executeMultiple(`
        CREATE TABLE operation_tasks (id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, status TEXT NOT NULL, deleted_at TEXT);
        INSERT INTO operation_tasks VALUES ('legacy', 'p1', 'TODO', NULL);
      `)
      const migrations = ['20260909-244', '20260909-245', '20260909-246', '20260909-247'].map(version => MIGRATIONS.find(item => item.version === version)!)
      await applyMigrations(client, migrations)
      expect((await client.execute("SELECT scheduled_start_at, scheduled_end_at FROM operation_tasks WHERE id='legacy'")).rows[0]).toMatchObject({ scheduled_start_at: null, scheduled_end_at: null })
      await expect(client.execute("INSERT INTO operation_tasks (id,parish_id,status,scheduled_start_at) VALUES ('partial','p1','TODO','2027-01-01T08:00:00.000Z')")).rejects.toThrow()
      await expect(client.execute("INSERT INTO operation_tasks (id,parish_id,status,scheduled_start_at,scheduled_end_at) VALUES ('reverse','p1','TODO','2027-01-01T10:00:00.000Z','2027-01-01T09:00:00.000Z')")).rejects.toThrow()
      await client.execute("INSERT INTO operation_tasks (id,parish_id,status,scheduled_start_at,scheduled_end_at) VALUES ('valid','p1','TODO','2027-01-01T08:00:00.000Z','2027-01-01T09:00:00.000Z')")
      await expect(client.execute("UPDATE operation_tasks SET scheduled_end_at=NULL WHERE id='valid'")).rejects.toThrow()
      const indexes = await client.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_operation_tasks_schedule'")
      expect(indexes.rows).toHaveLength(1)
      await applyMigrations(client, migrations)
      expect((await client.execute('SELECT count(*) AS total FROM operation_tasks')).rows[0].total).toBe(2)
    } finally { client.close() }
  })

  it('migration 248 enforces Board-rooted parallel Branch and Committee units on structural writes', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.execute(`CREATE TABLE parish_organization_units (
        parish_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, unit_type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
        PRIMARY KEY (parish_id, id)
      )`)
      const migration = MIGRATIONS.find(item => item.version === '20260909-248')!
      await applyMigrations(client, [migration])
      await client.execute("INSERT INTO parish_organization_units (parish_id,id,parent_id,unit_type) VALUES ('p1','board',NULL,'BOARD')")
      await client.execute("INSERT INTO parish_organization_units (parish_id,id,parent_id,unit_type) VALUES ('p1','branch','board','BRANCH')")
      await client.execute("INSERT INTO parish_organization_units (parish_id,id,parent_id,unit_type) VALUES ('p1','committee','board','COMMITTEE')")
      await expect(client.execute("INSERT INTO parish_organization_units (parish_id,id,parent_id,unit_type) VALUES ('p1','root-branch',NULL,'BRANCH')")).rejects.toThrow(/PARISH_UNIT_HIERARCHY_MISMATCH/)
      await expect(client.execute("INSERT INTO parish_organization_units (parish_id,id,parent_id,unit_type) VALUES ('p1','nested-committee','branch','COMMITTEE')")).rejects.toThrow(/PARISH_UNIT_HIERARCHY_MISMATCH/)
      await expect(client.execute("UPDATE parish_organization_units SET parent_id='branch' WHERE parish_id='p1' AND id='board'")).rejects.toThrow(/PARISH_UNIT_HIERARCHY_MISMATCH/)
      await applyMigrations(client, [migration])
      expect((await client.execute("SELECT count(*) AS total FROM parish_organization_units WHERE parish_id='p1'")).rows[0].total).toBe(3)
    } finally { client.close() }
  })

  it('migration 249 prevents invalidating a Board that still owns Branch or Committee units', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.execute(`CREATE TABLE parish_organization_units (
        parish_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, unit_type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
        PRIMARY KEY (parish_id, id)
      )`)
      const migration = MIGRATIONS.find(item => item.version === '20260909-249')!
      await applyMigrations(client, [migration])
      await client.execute("INSERT INTO parish_organization_units (parish_id,id,parent_id,unit_type) VALUES ('p1','board',NULL,'BOARD')")
      await client.execute("INSERT INTO parish_organization_units (parish_id,id,parent_id,unit_type) VALUES ('p1','branch','board','BRANCH')")
      await expect(client.execute("UPDATE parish_organization_units SET is_active=0 WHERE parish_id='p1' AND id='board'"))
        .rejects.toThrow(/PARISH_BOARD_HAS_CHILD_UNITS/)
      await expect(client.execute("UPDATE parish_organization_units SET unit_type='OTHER' WHERE parish_id='p1' AND id='board'"))
        .rejects.toThrow(/PARISH_BOARD_HAS_CHILD_UNITS/)
      await client.execute("UPDATE parish_organization_units SET deleted_at='2026-09-09' WHERE parish_id='p1' AND id='branch'")
      await client.execute("UPDATE parish_organization_units SET is_active=0 WHERE parish_id='p1' AND id='board'")
      await applyMigrations(client, [migration])
      expect((await client.execute("SELECT is_active FROM parish_organization_units WHERE parish_id='p1' AND id='board'")).rows[0].is_active).toBe(0)
    } finally { client.close() }
  })

  it('migration 250 prevents overlapping leader terms in one organizational scope', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.execute(`CREATE TABLE parish_service_terms (
        parish_id TEXT NOT NULL, id TEXT NOT NULL, unit_id TEXT, position_code TEXT,
        start_date TEXT NOT NULL, end_date TEXT, deleted_at TEXT,
        PRIMARY KEY (parish_id, id)
      )`)
      const migration = MIGRATIONS.find(item => item.version === '20260909-250')!
      await applyMigrations(client, [migration])
      await client.execute("INSERT INTO parish_service_terms (parish_id,id,unit_id,position_code,start_date,end_date) VALUES ('p1','committee-2026','committee','COMMITTEE_LEADER','2026-01-01','2026-12-31')")
      await expect(client.execute("INSERT INTO parish_service_terms (parish_id,id,unit_id,position_code,start_date,end_date) VALUES ('p1','committee-overlap','committee','COMMITTEE_LEADER','2026-12-31','2027-06-30')"))
        .rejects.toThrow(/PARISH_POSITION_TERM_OVERLAP/)
      await client.execute("INSERT INTO parish_service_terms (parish_id,id,unit_id,position_code,start_date,end_date) VALUES ('p1','committee-2027','committee','COMMITTEE_LEADER','2027-01-01','2027-12-31')")
      await client.execute("INSERT INTO parish_service_terms (parish_id,id,unit_id,position_code,start_date,end_date) VALUES ('p1','branch-2026','branch','BRANCH_LEADER','2026-01-01','2026-12-31')")
      await client.execute("INSERT INTO parish_service_terms (parish_id,id,unit_id,position_code,start_date,end_date) VALUES ('p1','parish-leader','board-a','PARISH_LEADER','2026-01-01','2026-12-31')")
      await expect(client.execute("INSERT INTO parish_service_terms (parish_id,id,unit_id,position_code,start_date,end_date) VALUES ('p1','parish-leader-other-board','board-b','PARISH_LEADER','2026-06-01','2026-06-30')"))
        .rejects.toThrow(/PARISH_POSITION_TERM_OVERLAP/)
      await expect(client.execute("UPDATE parish_service_terms SET start_date='2026-12-31' WHERE parish_id='p1' AND id='committee-2027'"))
        .rejects.toThrow(/PARISH_POSITION_TERM_OVERLAP/)
      await applyMigrations(client, [migration])
      expect((await client.execute("SELECT count(*) AS total FROM parish_service_terms WHERE parish_id='p1'")).rows[0].total).toBe(4)
    } finally { client.close() }
  })

  it('migration 252 protects unit position scope including history and isolates parish identities', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.execute('CREATE TABLE parish_organization_units (parish_id TEXT, id TEXT, unit_type TEXT)')
      await client.execute('CREATE TABLE parish_service_terms (parish_id TEXT, unit_id TEXT, position_code TEXT, deleted_at TEXT)')
      const migration = MIGRATIONS.find(item => item.version === '20260910-252')!
      await applyMigrations(client, [migration])
      for (const [type, code] of [['BOARD', 'PARISH_LEADER'], ['BRANCH', 'BRANCH_LEADER'], ['COMMITTEE', 'COMMITTEE_LEADER']]) {
        await client.execute({ sql: 'INSERT INTO parish_organization_units VALUES (?, ?, ?)', args: ['p1', type, type] })
        await client.execute({ sql: 'INSERT INTO parish_service_terms VALUES (?, ?, ?, NULL)', args: ['p1', type, code] })
        await expect(client.execute({ sql: "UPDATE parish_organization_units SET unit_type='OTHER' WHERE parish_id='p1' AND id=?", args: [type] }))
          .rejects.toThrow('PARISH_POSITION_SCOPE_MISMATCH')
        expect((await client.execute({ sql: "SELECT unit_type FROM parish_organization_units WHERE parish_id='p1' AND id=?", args: [type] })).rows[0].unit_type).toBe(type)
      }
      await client.execute("INSERT INTO parish_organization_units VALUES ('p2','BRANCH','BRANCH')")
      await client.execute("UPDATE parish_organization_units SET unit_type='OTHER' WHERE parish_id='p2'")
      await client.execute("UPDATE parish_organization_units SET unit_type=unit_type WHERE parish_id='p1'")
      await client.execute("UPDATE parish_service_terms SET deleted_at='2026-09-10' WHERE parish_id='p1' AND unit_id='BRANCH'")
      await client.execute("UPDATE parish_organization_units SET unit_type='OTHER' WHERE parish_id='p1' AND id='BRANCH'")
      await applyMigrations(client, [migration])
    } finally { client.close() }
  })

  it('migration 251 allows historical Boards but enforces one active Board per parish', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.execute(`CREATE TABLE parish_organization_units (
        parish_id TEXT NOT NULL, id TEXT NOT NULL, unit_type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
        PRIMARY KEY (parish_id, id)
      )`)
      const migration = MIGRATIONS.find(item => item.version === '20260910-251')!
      await applyMigrations(client, [migration])
      await client.execute("INSERT INTO parish_organization_units (parish_id,id,unit_type,is_active) VALUES ('p1','board-current','BOARD',1)")
      await expect(client.execute("INSERT INTO parish_organization_units (parish_id,id,unit_type,is_active) VALUES ('p1','board-duplicate','BOARD',1)"))
        .rejects.toThrow()
      await client.execute("INSERT INTO parish_organization_units (parish_id,id,unit_type,is_active) VALUES ('p1','board-historical','BOARD',0)")
      await client.execute("INSERT INTO parish_organization_units (parish_id,id,unit_type,is_active,deleted_at) VALUES ('p1','board-deleted','BOARD',1,'2026-09-10T00:00:00.000Z')")
      await client.execute("INSERT INTO parish_organization_units (parish_id,id,unit_type,is_active) VALUES ('p2','board-other-parish','BOARD',1)")
      await expect(client.execute("UPDATE parish_organization_units SET is_active=1 WHERE parish_id='p1' AND id='board-historical'"))
        .rejects.toThrow()
      await expect(client.execute("UPDATE parish_organization_units SET deleted_at=NULL WHERE parish_id='p1' AND id='board-deleted'"))
        .rejects.toThrow()
      await applyMigrations(client, [migration])
      expect((await client.execute("SELECT count(*) AS total FROM parish_organization_units")).rows[0].total).toBe(4)
    } finally { client.close() }
  })

  it('migration 251 rejects legacy duplicate Boards without recording success or changing their data', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      await client.execute(`CREATE TABLE parish_organization_units (
        parish_id TEXT NOT NULL, id TEXT NOT NULL, unit_type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
        PRIMARY KEY (parish_id, id)
      )`)
      await client.execute("INSERT INTO parish_organization_units VALUES ('p1','first','BOARD',1,NULL), ('p1','second','BOARD',1,NULL)")
      const before = (await client.execute('SELECT * FROM parish_organization_units ORDER BY id')).rows
      const migration = MIGRATIONS.find(item => item.version === '20260910-251')!
      await expect(applyMigrations(client, [migration])).rejects.toThrow('Migration failed: 20260910-251')
      expect((await client.execute('SELECT * FROM parish_organization_units ORDER BY id')).rows).toEqual(before)
      expect((await client.execute("SELECT version FROM schema_migrations WHERE version='20260910-251'")).rows).toHaveLength(0)
    } finally { client.close() }
  })
})
