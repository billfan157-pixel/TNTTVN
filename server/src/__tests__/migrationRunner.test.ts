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
})
