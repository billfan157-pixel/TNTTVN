import type { Client, Transaction } from '@libsql/client'

const SAFE_TABLE_NAME = /^[A-Za-z0-9_]+$/

/**
 * Read-only production preflight. It discovers every persisted parish_id column
 * instead of maintaining a second table manifest that can drift from schema.
 */
async function findMismatchedTables(executor: Transaction, parishId: string): Promise<string[]> {
  const tables = await executor.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  const mismatchedTables: string[] = []

  for (const row of tables.rows) {
    const tableName = String((row as Record<string, unknown>).name || '')
    if (!SAFE_TABLE_NAME.test(tableName)) throw new Error('Unsafe database table name discovered during parish preflight')
    const columns = await executor.execute(`PRAGMA table_info("${tableName}")`)
    const hasParishId = columns.rows.some((column) => String((column as Record<string, unknown>).name) === 'parish_id')
    if (!hasParishId) continue

    const mismatch = await executor.execute({
      sql: `SELECT 1 AS mismatch FROM "${tableName}" WHERE parish_id IS NULL OR parish_id <> ? LIMIT 1`,
      args: [parishId],
    })
    if (mismatch.rows.length > 0) mismatchedTables.push(tableName)
  }
  return mismatchedTables
}

export async function assertSingleParishDeploymentData(client: Pick<Client, 'transaction'>, parishId: string): Promise<void> {
  const tx = await client.transaction('read')
  let mismatchedTables: string[]
  try {
    mismatchedTables = await findMismatchedTables(tx, parishId)
    await tx.commit()
  } catch (error) {
    try { await tx.rollback() } catch { /* read transaction may already be closed */ }
    throw error
  } finally {
    tx.close()
  }

  if (mismatchedTables.length > 0) {
    throw new Error(`Single-parish deployment preflight failed; unexpected parish scope in tables: ${mismatchedTables.join(', ')}`)
  }
}
