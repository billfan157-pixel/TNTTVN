import { describe, expect, it } from 'vitest'
import { createClient } from '@libsql/client'
import {
  applyMigrations,
  isTolerableMigrationError,
  type MigrationClient,
} from '../db/migrationRunner.js'

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
})
