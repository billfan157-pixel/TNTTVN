import { describe, expect, it } from 'vitest'
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
})
