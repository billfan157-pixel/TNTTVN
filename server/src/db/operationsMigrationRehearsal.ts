import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { copyFileSync, createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createClient, type Client } from '@libsql/client'
import { applyDefensiveSync } from './defensiveSync.js'
import { applyIndices } from './bootstrapIndices.js'
import { applyMigrations } from './migrationRunner.js'
import { MIGRATIONS } from './migrations.js'
import { assertDatabaseReady } from './schemaHealth.js'

type OperationTableSnapshot = {
  table: string
  columns: string[]
  rowCount: number
  digest: string
}

const execFileAsync = promisify(execFile)

export type OperationsMigrationRehearsalManifest = {
  status: 'verified'
  sourceBackup: string
  sourceSha256: string
  sourceUnchanged: true
  migrationMarkers: { before: number; after: number; latest: string }
  operationTables: Array<{ table: string; rowsBefore: number | null; rowsAfter: number; digestSha256: string; preservedDigest: boolean | null }>
  recoverySnapshot: { operationTableCount: number; operationRowCount: number; matchesMigratedCopy: true }
  phaseDurationMs: { copy: number; preflight: number; migrate: number; verify: number; recovery: number; total: number }
}

function fileUrl(path: string): string {
  return `file:${path.replace(/\\/g, '/')}`
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQLite identifier: ${value}`)
  return `"${value}"`
}

function rowField(row: unknown, key: string, index: number): unknown {
  if (Array.isArray(row)) return row[index]
  return row && typeof row === 'object' ? (row as Record<string, unknown>)[key] : undefined
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === 'bigint') return `bigint:${value.toString()}`
  if (value instanceof Uint8Array) return `bytes:${Buffer.from(value).toString('base64')}`
  return value
}

async function sha256File(path: string): Promise<string> {
  return await new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolveHash(hash.digest('hex')))
  })
}

async function assertSqliteIntegrity(client: Client, phase: string): Promise<void> {
  const integrity = await client.execute('PRAGMA integrity_check')
  const messages = integrity.rows.map(row => String(rowField(row, 'integrity_check', 0) ?? '')).filter(Boolean)
  if (messages.length !== 1 || messages[0].toLowerCase() !== 'ok') {
    throw new Error(`${phase} integrity_check failed with ${messages.length || 1} finding(s)`)
  }
  const foreignKeys = await client.execute('PRAGMA foreign_key_check')
  if (foreignKeys.rows.length > 0) throw new Error(`${phase} foreign_key_check reported ${foreignKeys.rows.length} violation(s)`)
}

async function migrationMarkerCount(client: Client): Promise<number> {
  const result = await client.execute('SELECT COUNT(*) AS total FROM schema_migrations')
  return Number(rowField(result.rows[0], 'total', 0) ?? 0)
}

async function assertBoardMigrationReady(client: Client): Promise<void> {
  const table = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'parish_organization_units'")
  if (table.rows.length === 0) return // Older backups create this table during migration.
  const duplicates = await client.execute(`
    SELECT COUNT(*) AS total FROM (
      SELECT parish_id FROM parish_organization_units
      WHERE unit_type = 'BOARD' AND is_active = 1 AND deleted_at IS NULL
      GROUP BY parish_id HAVING COUNT(*) > 1
    )
  `)
  const count = Number(rowField(duplicates.rows[0], 'total', 0) ?? 0)
  if (count > 0) {
    throw new Error(`Pre-migration authority check: ${count} parish(es) have duplicate active BOARD units. Run audit:operations-authority on the selected backup and resolve reviewed findings before migration 20260910-251; no automatic repair was performed.`)
  }
}

async function snapshotOperationTables(client: Client): Promise<Map<string, OperationTableSnapshot>> {
  const tableResult = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'operation_%' ORDER BY name")
  const snapshots = new Map<string, OperationTableSnapshot>()
  for (const row of tableResult.rows) {
    const table = String(rowField(row, 'name', 0) ?? '')
    const quotedTable = quoteIdentifier(table)
    const info = await client.execute(`PRAGMA table_info(${quotedTable})`)
    const columns = info.rows.map(column => String(rowField(column, 'name', 1) ?? '')).filter(Boolean)
    const selectColumns = columns.map(quoteIdentifier).join(', ')
    const data = await client.execute(`SELECT ${selectColumns} FROM ${quotedTable}`)
    const canonicalRows = data.rows.map(rowValue => JSON.stringify(columns.map((column, index) => canonicalValue(rowField(rowValue, column, index))))).sort()
    const digest = createHash('sha256').update(canonicalRows.join('\n')).digest('hex')
    snapshots.set(table, { table, columns, rowCount: canonicalRows.length, digest })
  }
  return snapshots
}

async function snapshotWithOriginalColumns(client: Client, original: OperationTableSnapshot): Promise<OperationTableSnapshot> {
  const quotedTable = quoteIdentifier(original.table)
  const currentInfo = await client.execute(`PRAGMA table_info(${quotedTable})`)
  const currentColumns = new Set(currentInfo.rows.map(column => String(rowField(column, 'name', 1) ?? '')))
  const missing = original.columns.filter(column => !currentColumns.has(column))
  if (missing.length > 0) throw new Error(`Migration removed columns from ${original.table}: ${missing.join(', ')}`)
  const data = await client.execute(`SELECT ${original.columns.map(quoteIdentifier).join(', ')} FROM ${quotedTable}`)
  const canonicalRows = data.rows.map(rowValue => JSON.stringify(original.columns.map((column, index) => canonicalValue(rowField(rowValue, column, index))))).sort()
  return {
    table: original.table,
    columns: original.columns,
    rowCount: canonicalRows.length,
    digest: createHash('sha256').update(canonicalRows.join('\n')).digest('hex'),
  }
}

function compareSnapshots(expected: Map<string, OperationTableSnapshot>, actual: Map<string, OperationTableSnapshot>, label: string): void {
  for (const [table, snapshot] of expected) {
    const current = actual.get(table)
    if (!current || current.rowCount !== snapshot.rowCount || current.digest !== snapshot.digest) {
      throw new Error(`${label} changed Operations data in ${table}`)
    }
  }
}

function validateSourcePaths(sourceBackupPath: string, liveDatabasePath?: string) {
  const sourcePath = resolve(sourceBackupPath)
  // Resolve from this module so the guard is stable whether invoked from the
  // repository root, `npm --prefix server`, source TS or compiled server/dist.
  const defaultLivePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/parish.db')
  const configuredLivePath = resolve(liveDatabasePath ?? process.env.DB_PATH ?? defaultLivePath)
  if (sourcePath === configuredLivePath || sourcePath === defaultLivePath) {
    throw new Error('Operations migration rehearsal refuses the live/default database path; provide a finalized backup artifact.')
  }
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) throw new Error('Operations migration rehearsal source backup does not exist or is not a file.')
  return { sourcePath, configuredLivePath }
}

export async function rehearseOperationsMigrationsInWorker(options: {
  sourceBackupPath: string
  liveDatabasePath?: string
  workingDirectory: string
}): Promise<OperationsMigrationRehearsalManifest> {
  const startedAt = performance.now()
  const { sourcePath } = validateSourcePaths(options.sourceBackupPath, options.liveDatabasePath)
  const tempDirectory = resolve(options.workingDirectory)
  const rehearsalPath = join(tempDirectory, 'rehearsal.sqlite')
  const recoveryPath = join(tempDirectory, 'recovery.sqlite')
  let rehearsalClient: Client | null = null
  let recoveryClient: Client | null = null
  try {
    const sourceSha256 = await sha256File(sourcePath)
    copyFileSync(sourcePath, rehearsalPath)
    const copiedAt = performance.now()

    rehearsalClient = createClient({ url: fileUrl(rehearsalPath) })
    await rehearsalClient.execute('PRAGMA foreign_keys = ON')
    await assertSqliteIntegrity(rehearsalClient, 'Pre-migration backup')
    await assertBoardMigrationReady(rehearsalClient)
    const beforeMarkers = await migrationMarkerCount(rehearsalClient)
    const beforeTables = await snapshotOperationTables(rehearsalClient)
    const preflightAt = performance.now()

    await applyMigrations(rehearsalClient, MIGRATIONS)
    await applyDefensiveSync(rehearsalClient)
    await applyIndices(rehearsalClient)
    const migratedAt = performance.now()

    await assertDatabaseReady(rehearsalClient)
    await assertSqliteIntegrity(rehearsalClient, 'Post-migration copy')
    const afterMarkers = await migrationMarkerCount(rehearsalClient)
    const afterTables = await snapshotOperationTables(rehearsalClient)
    for (const snapshot of beforeTables.values()) {
      const preserved = await snapshotWithOriginalColumns(rehearsalClient, snapshot)
      if (preserved.rowCount !== snapshot.rowCount || preserved.digest !== snapshot.digest) {
        throw new Error(`Migration changed pre-existing Operations data in ${snapshot.table}`)
      }
    }
    const verifiedAt = performance.now()

    const normalizedRecoveryPath = recoveryPath.replace(/\\/g, '/').replace(/'/g, "''")
    await rehearsalClient.execute(`VACUUM INTO '${normalizedRecoveryPath}'`)
    rehearsalClient.close()
    rehearsalClient = null
    recoveryClient = createClient({ url: fileUrl(recoveryPath) })
    await recoveryClient.execute('PRAGMA foreign_keys = ON')
    await assertDatabaseReady(recoveryClient)
    await assertSqliteIntegrity(recoveryClient, 'Recovery snapshot')
    const recoveryTables = await snapshotOperationTables(recoveryClient)
    compareSnapshots(afterTables, recoveryTables, 'Recovery snapshot')
    const recoveredAt = performance.now()

    if (await sha256File(sourcePath) !== sourceSha256) throw new Error('Source backup changed during rehearsal; discard this result.')
    const operationTables = [...afterTables.values()].map(after => {
      const before = beforeTables.get(after.table)
      return { table: after.table, rowsBefore: before?.rowCount ?? null, rowsAfter: after.rowCount, digestSha256: after.digest, preservedDigest: before ? true : null }
    })
    return {
      status: 'verified',
      sourceBackup: basename(sourcePath),
      sourceSha256,
      sourceUnchanged: true,
      migrationMarkers: { before: beforeMarkers, after: afterMarkers, latest: MIGRATIONS.at(-1)?.version ?? 'UNKNOWN' },
      operationTables,
      recoverySnapshot: {
        operationTableCount: recoveryTables.size,
        operationRowCount: [...recoveryTables.values()].reduce((sum, table) => sum + table.rowCount, 0),
        matchesMigratedCopy: true,
      },
      phaseDurationMs: {
        copy: Math.round(copiedAt - startedAt),
        preflight: Math.round(preflightAt - copiedAt),
        migrate: Math.round(migratedAt - preflightAt),
        verify: Math.round(verifiedAt - migratedAt),
        recovery: Math.round(recoveredAt - verifiedAt),
        total: Math.round(recoveredAt - startedAt),
      },
    }
  } finally {
    recoveryClient?.close()
    rehearsalClient?.close()
  }
}

export async function rehearseOperationsMigrations(options: {
  sourceBackupPath: string
  liveDatabasePath?: string
}): Promise<OperationsMigrationRehearsalManifest> {
  const { sourcePath, configuredLivePath } = validateSourcePaths(options.sourceBackupPath, options.liveDatabasePath)
  const tempDirectory = mkdtempSync(join(tmpdir(), 'catevia-operations-migration-'))
  const modulePath = fileURLToPath(import.meta.url)
  const sourceRuntime = modulePath.endsWith('.ts')
  const workerPath = resolve(dirname(modulePath), `../scripts/operationsMigrationRehearsalWorker.${sourceRuntime ? 'ts' : 'js'}`)
  const args = [
    ...(sourceRuntime ? ['--import', 'tsx'] : []),
    workerPath,
    sourcePath,
    tempDirectory,
    configuredLivePath,
  ]
  try {
    const { stdout } = await execFileAsync(process.execPath, args, { maxBuffer: 2 * 1024 * 1024 })
    return JSON.parse(stdout) as OperationsMigrationRehearsalManifest
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : ''
    throw new Error(stderr.trim() || (error instanceof Error ? error.message : 'Operations migration rehearsal worker failed.'))
  } finally {
    // libSQL local connections can retain native handles until their process exits
    // on Windows. The parent owns cleanup only after the isolated worker is gone.
    rmSync(tempDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}
