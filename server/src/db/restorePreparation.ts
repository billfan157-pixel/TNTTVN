import type { Client } from '@libsql/client'
import { applyBootstrapSchema } from './bootstrapSchema.js'
import { applyMigrations } from './migrationRunner.js'
import { MIGRATIONS } from './migrations.js'
import { applyDefensiveSync } from './defensiveSync.js'
import { applyIndices } from './bootstrapIndices.js'
import { assertDatabaseReady } from './schemaHealth.js'

/** Only for a disposable, never-used target. No production startup caller. */
export async function prepareEmptyRestoreTarget(client: Client): Promise<void> {
  const listTables = () => client.execute("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%'")
  if ((await listTables()).rows.length) throw new Error('Restore preparation requires a fresh target with no application tables')
  await applyBootstrapSchema(client)
  await applyMigrations(client, MIGRATIONS)
  await applyDefensiveSync(client)
  await applyIndices(client)

  // Migration 120 creates four default funds. They are not restored data.
  // Validate all freshly seeded application content before removing only those
  // seeds; new/unexpected seeds fail closed and require code/operator review.
  const tableNames = (await listTables()).rows.map(row => String(row.name))
  const tx = await client.transaction('write')
  try {
    for (const name of tableNames) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Unsafe restore target table name')
      if (name === 'schema_migrations' || name === 'funds') continue
      const count = await tx.execute(`SELECT count(*) AS count FROM "${name}"`)
      if (Number(count.rows[0]?.count) !== 0) throw new Error(`Unexpected application data during fresh target preparation: ${name}`)
    }
    const funds = await tx.execute('SELECT id, parish_id, code, initial_balance, is_default, is_active FROM funds ORDER BY id')
    const expected = [
      ['FND-001-GENERAL', 'gia-ton', 'GENERAL', 0, 1, 1],
      ['FND-002-CHARITY', 'gia-ton', 'CHARITY', 0, 0, 1],
      ['FND-003-CAMP', 'gia-ton', 'CAMP', 0, 0, 1],
      ['FND-004-LEADERS', 'gia-ton', 'LEADERS', 0, 0, 1],
    ]
    const actual = funds.rows.map(row => [row.id, row.parish_id, row.code, Number(row.initial_balance), Number(row.is_default), Number(row.is_active)])
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Unexpected default funds during fresh target preparation')
    await tx.execute("DELETE FROM funds WHERE parish_id = 'gia-ton' AND id IN ('FND-001-GENERAL','FND-002-CHARITY','FND-003-CAMP','FND-004-LEADERS')")
    await tx.commit()
  } catch (err) {
    try { await tx.rollback() } catch { /* already closed */ }
    throw err
  }
  await assertDatabaseReady(client)
}
