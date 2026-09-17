import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { applyBootstrapSchema } from '../db/bootstrapSchema.js'
import { applyMigrations } from '../db/migrationRunner.js'
import { assertSingleParishDeploymentData } from '../db/deploymentParishHealth.js'

describe('fresh non-default parish provisioning', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('repairs the isolated legacy gia-ton fund seed before deployment preflight', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEPLOYMENT_PARISH_ID', 'fresh-nondefault')
    vi.resetModules()
    const { MIGRATIONS } = await import('../db/migrations.js')
    const repairIndex = MIGRATIONS.findIndex(migration => migration.version === '20260917-261')
    expect(repairIndex).toBeGreaterThan(0)

    const testDatabasePath = process.env.DB_PATH
    expect(testDatabasePath).toBeTruthy()
    const client = createClient({
      url: `file:${join(dirname(testDatabasePath!), `fresh-nondefault-${randomUUID()}.db`)}`,
    })
    try {
      await client.execute('PRAGMA foreign_keys=ON')
      await applyBootstrapSchema(client)
      await applyMigrations(client, MIGRATIONS.slice(0, repairIndex))

      await expect(assertSingleParishDeploymentData(client, 'fresh-nondefault'))
        .rejects.toThrow(/unexpected parish scope in tables: funds/)

      const prerequisiteTables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'financial_transactions', 'funds') ORDER BY name",
      )
      expect(prerequisiteTables.rows.map(row => String(row.name))).toEqual([
        'financial_transactions',
        'funds',
        'users',
      ])

      await applyMigrations(client, [MIGRATIONS[repairIndex]])
      await expect(assertSingleParishDeploymentData(client, 'fresh-nondefault')).resolves.toBeUndefined()

      const funds = await client.execute('SELECT parish_id, code FROM funds ORDER BY code')
      expect(funds.rows).toHaveLength(4)
      expect(funds.rows.every(row => String(row.parish_id) === 'fresh-nondefault')).toBe(true)
    } finally {
      await client.close()
    }
  }, 30_000)

  it('keeps established foreign-parish data fail-closed for operator review', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEPLOYMENT_PARISH_ID', 'fresh-nondefault')
    vi.resetModules()
    const { MIGRATIONS } = await import('../db/migrations.js')
    const repairIndex = MIGRATIONS.findIndex(migration => migration.version === '20260917-261')
    const testDatabasePath = process.env.DB_PATH
    expect(testDatabasePath).toBeTruthy()
    const client = createClient({
      url: `file:${join(dirname(testDatabasePath!), `foreign-parish-guard-${randomUUID()}.db`)}`,
    })

    try {
      await client.execute('PRAGMA foreign_keys=ON')
      await applyBootstrapSchema(client)
      await applyMigrations(client, MIGRATIONS.slice(0, repairIndex))
      await client.execute({
        sql: `INSERT INTO users
          (id, username, password_hash, full_name, role, status, parish_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ['established-user', 'established-user', 'hash', 'Established user', 'admin', 'ACTIVE', 'gia-ton', new Date().toISOString()],
      })

      await applyMigrations(client, [MIGRATIONS[repairIndex]])

      await expect(assertSingleParishDeploymentData(client, 'fresh-nondefault'))
        .rejects.toThrow(/unexpected parish scope in tables: funds, users|unexpected parish scope in tables: users, funds/)
      const funds = await client.execute('SELECT parish_id FROM funds')
      expect(funds.rows).toHaveLength(4)
      expect(funds.rows.every(row => String(row.parish_id) === 'gia-ton')).toBe(true)
    } finally {
      await client.close()
    }
  }, 30_000)
})
