export interface MigrationDefinition {
  version: string
  sql: string
}

export interface MigrationClient {
  execute(statement: string): Promise<{ rows: readonly unknown[] }>
  executeMultiple(statement: string): Promise<unknown>
}

function rowVersion(row: unknown): string | undefined {
  if (Array.isArray(row)) return typeof row[0] === 'string' ? row[0] : undefined
  if (row && typeof row === 'object') {
    const value = (row as Record<string, unknown>).version
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function isTolerableMigrationError(err: unknown, isMultiStatement: boolean): boolean {
  if (isMultiStatement) return false
  const message = String(err).toLowerCase()
  return message.includes('duplicate column') || message.includes('already exists')
}

/**
 * D3 migration boundary. Every non-tolerable migration failure aborts bootstrap.
 * Only the historical single-statement duplicate-column/already-exists recovery
 * path is accepted, and even that path records the migration marker explicitly.
 */
export async function applyMigrations(
  client: MigrationClient,
  migrations: readonly MigrationDefinition[],
): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const { rows } = await client.execute('SELECT version FROM schema_migrations')
  const applied = new Set(rows.map(rowVersion).filter((version): version is string => Boolean(version)))

  const markApplied = (version: string) =>
    client.execute(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (${quoteSqlLiteral(version)})`)

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue

    const isMultiStatement = migration.sql.includes(';')
    try {
      if (isMultiStatement) {
        const cleanSql = migration.sql.trim().replace(/;+$/, '')
        const batchSql = `PRAGMA foreign_keys = OFF;\n${cleanSql};\nPRAGMA foreign_keys = ON;`
        try {
          await client.executeMultiple(batchSql)
        } catch (err) {
          try {
            await client.execute('PRAGMA foreign_keys = ON;')
          } catch {
            // Preserve the original migration failure. Startup will abort below.
          }
          throw err
        }
      } else {
        await client.execute(migration.sql)
      }

      await markApplied(migration.version)
    } catch (err) {
      if (isTolerableMigrationError(err, isMultiStatement)) {
        await markApplied(migration.version)
        continue
      }

      const wrapped = new Error(`Migration failed: ${migration.version}`, { cause: err })
      console.error(wrapped.message, err)
      throw wrapped
    }
  }
}
