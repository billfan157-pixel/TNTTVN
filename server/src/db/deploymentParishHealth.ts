import type { Client, Transaction } from '@libsql/client'

const SAFE_TABLE_NAME = /^[A-Za-z0-9_]+$/

/**
 * Read-only production preflight. It discovers every persisted parish_id column
 * instead of maintaining a second table manifest that can drift from schema.
 */
async function findMismatchedTables(executor: Transaction, parishId: string): Promise<string[]> {
  // Discover scoped tables in one query. A per-table PRAGMA plus a per-table
  // mismatch query caused two remote DB round trips for every table on each
  // cold start (and this preflight runs before and after seed).
  const tables = await executor.execute(`
    SELECT name FROM sqlite_master AS m
    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
      AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'parish_id')
  `)
  const scopedTables: string[] = []
  for (const row of tables.rows) {
    const tableName = String((row as Record<string, unknown>).name || '')
    if (!SAFE_TABLE_NAME.test(tableName)) throw new Error('Unsafe database table name discovered during parish preflight')
    scopedTables.push(tableName)
  }
  if (scopedTables.length === 0) return []

  // EXISTS short-circuits each table at its first offending row. UNION ALL
  // returns only table names, preserving the previous privacy-safe error.
  const checks = scopedTables.map((tableName) =>
    `SELECT '${tableName}' AS name WHERE EXISTS (SELECT 1 FROM "${tableName}" WHERE parish_id IS NULL OR parish_id <> ?)`
  ).join(' UNION ALL ')
  const mismatches = await executor.execute({ sql: checks, args: scopedTables.map(() => parishId) })
  return mismatches.rows.map((row) => String((row as Record<string, unknown>).name))
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
