import { describe, expect, it, afterAll, vi } from 'vitest'
import { createDisposableRestoreTarget } from './helpers/restoreTarget.js'
import { assertDatabaseReady } from '../db/schemaHealth.js'

// Migration 261 re-seeds the four default funds under DEPLOYMENT_PARISH_ID when
// it differs from the literal seed parish, and preparation must validate/remove
// exactly those seeds. setup.ts has already evaluated the shared module graph
// with the default dev parish, so reset the registry and re-import after the env
// is set to exercise the non-default deployment parish end to end.
process.env.DEPLOYMENT_PARISH_ID = 'dr-restore-parish'
vi.resetModules()
const { prepareEmptyRestoreTarget } = await import('../db/restorePreparation.js')

afterAll(() => {
  delete process.env.DEPLOYMENT_PARISH_ID
})

describe('restore target preparation (DR-P2-001)', () => {
  it('prepares a fresh target whose fund seeds follow the configured deployment parish', async () => {
    const target = createDisposableRestoreTarget()
    try {
      await prepareEmptyRestoreTarget(target)
      await assertDatabaseReady(target)

      // Every fund seed produced for the deployment parish must have been
      // removed; neither the deployment parish nor gia-ton seeds may survive.
      const funds = await target.execute('SELECT id, parish_id FROM funds')
      expect(funds.rows).toHaveLength(0)

      // Postcondition of a successful preparation: no application rows at all
      // (only the migration marker table may hold content).
      const tables = await target.execute(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%'",
      )
      for (const row of tables.rows) {
        const name = String(row.name)
        if (name === 'schema_migrations') continue
        const count = await target.execute(`SELECT count(*) AS count FROM "${name}"`)
        expect(Number((count.rows[0] as Record<string, unknown>).count), `table ${name}`).toBe(0)
      }
    } finally {
      target.close()
    }
  }, 30_000)

  it('still rejects a target that already contains application data', async () => {
    const target = createDisposableRestoreTarget()
    try {
      await target.execute('CREATE TABLE parishes (id TEXT PRIMARY KEY)')
      await target.execute("INSERT INTO parishes VALUES ('existing')")
      await expect(prepareEmptyRestoreTarget(target)).rejects.toThrow(/fresh target/)
    } finally {
      target.close()
    }
  })
})
