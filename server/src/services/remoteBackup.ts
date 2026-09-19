import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { gzipSync, gunzipSync } from 'zlib'
import type { Client, InStatement, ResultSet } from '@libsql/client'
import { isR2Enabled, putObject } from './blobStorage.js'
import { createRecoveryQuarantine, RECOVERY_QUARANTINE_KEY, type RecoveryQuarantineTarget } from '../db/recoveryQuarantine.js'

const BACKUP_FORMAT = 'tnttvn-logical-backup-v1'
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

type SqlExecutor = { execute(statement: InStatement): Promise<ResultSet> }

export interface LogicalTableSnapshot {
  name: string
  columns: string[]
  rows: unknown[][]
}

export interface LogicalBackupSnapshot {
  format: typeof BACKUP_FORMAT
  createdAt: string
  source: 'turso'
  tables: LogicalTableSnapshot[]
  rowCount: number
  checksum: string
}

export interface LogicalRestoreResult {
  restoredRows: number
  tableCounts: Record<string, number>
  foreignKeyViolations: number
  quarantined?: true
}

interface EncryptedBackupEnvelope {
  format: typeof BACKUP_FORMAT
  encryption: 'aes-256-gcm'
  compression: 'gzip'
  iv: string
  authTag: string
  ciphertext: string
}

function quoteIdentifier(value: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`Unsafe SQL identifier in backup: ${value}`)
  return `"${value}"`
}

function encodeCell(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $blob: Buffer.from(value).toString('base64') }
  if (typeof value === 'bigint') return { $bigint: value.toString() }
  return value
}

function decodeCell(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  if ('$blob' in value && typeof value.$blob === 'string') return Buffer.from(value.$blob, 'base64')
  if ('$bigint' in value && typeof value.$bigint === 'string') return BigInt(value.$bigint)
  return value
}

function snapshotPayload(snapshot: Omit<LogicalBackupSnapshot, 'checksum'>): string {
  return JSON.stringify(snapshot)
}

function parseEncryptionKey(raw = process.env.BACKUP_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error('BACKUP_ENCRYPTION_KEY is required for remote backups')
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)')
  return key
}

export async function createLogicalSnapshot(executor: SqlExecutor, createdAt = new Date().toISOString()): Promise<LogicalBackupSnapshot> {
  const tableResult = await executor.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' ORDER BY name",
  )
  const tables: LogicalTableSnapshot[] = []
  let rowCount = 0
  for (const resultRow of tableResult.rows) {
    const name = String(resultRow.name)
    const result = await executor.execute(`SELECT * FROM ${quoteIdentifier(name)}`)
    const columns = [...result.columns]
    const rows = result.rows.map(row => columns.map(column => encodeCell(row[column])))
    tables.push({ name, columns, rows })
    rowCount += rows.length
  }
  const withoutChecksum: Omit<LogicalBackupSnapshot, 'checksum'> = {
    format: BACKUP_FORMAT,
    createdAt,
    source: 'turso',
    tables,
    rowCount,
  }
  return {
    ...withoutChecksum,
    checksum: createHash('sha256').update(snapshotPayload(withoutChecksum)).digest('hex'),
  }
}

export function encryptLogicalSnapshot(snapshot: LogicalBackupSnapshot, rawKey?: string): Buffer {
  verifyLogicalSnapshot(snapshot)
  const key = parseEncryptionKey(rawKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(gzipSync(JSON.stringify(snapshot))), cipher.final()])
  const envelope: EncryptedBackupEnvelope = {
    format: BACKUP_FORMAT,
    encryption: 'aes-256-gcm',
    compression: 'gzip',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
  return Buffer.from(JSON.stringify(envelope), 'utf8')
}

export function decryptLogicalSnapshot(encrypted: Buffer, rawKey?: string): LogicalBackupSnapshot {
  const envelope = JSON.parse(encrypted.toString('utf8')) as EncryptedBackupEnvelope
  if (envelope.format !== BACKUP_FORMAT || envelope.encryption !== 'aes-256-gcm' || envelope.compression !== 'gzip') {
    throw new Error('Unsupported backup envelope')
  }
  const decipher = createDecipheriv('aes-256-gcm', parseEncryptionKey(rawKey), Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))
  const compressed = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ])
  const snapshot = JSON.parse(gunzipSync(compressed).toString('utf8')) as LogicalBackupSnapshot
  verifyLogicalSnapshot(snapshot)
  return snapshot
}

export function verifyLogicalSnapshot(snapshot: LogicalBackupSnapshot): void {
  if (snapshot?.format !== BACKUP_FORMAT || !Array.isArray(snapshot.tables)) throw new Error('Invalid logical backup format')
  const { checksum, ...withoutChecksum } = snapshot
  const actual = createHash('sha256').update(snapshotPayload(withoutChecksum)).digest('hex')
  if (!/^[a-f0-9]{64}$/i.test(checksum) || actual !== checksum) throw new Error('Logical backup checksum mismatch')
  const rows = snapshot.tables.reduce((sum, table) => sum + table.rows.length, 0)
  if (rows !== snapshot.rowCount) throw new Error('Logical backup row count mismatch')
  if (new Set(snapshot.tables.map(table => table.name)).size !== snapshot.tables.length) throw new Error('Duplicate table in logical backup')
  for (const table of snapshot.tables) {
    quoteIdentifier(table.name)
    if (new Set(table.columns).size !== table.columns.length) throw new Error(`Duplicate column in ${table.name}`)
    table.columns.forEach(quoteIdentifier)
    if (table.rows.some(row => row.length !== table.columns.length)) throw new Error(`Invalid row width in ${table.name}`)
  }
}

export async function createAndStoreRemoteBackup(client: Client): Promise<{ objectKey: string; rowCount: number }> {
  if (!isR2Enabled) throw new Error('Remote database backup requires independent R2 storage')
  parseEncryptionKey()
  const tx = await client.transaction('read')
  try {
    const snapshot = await createLogicalSnapshot(tx)
    await tx.commit()
    const objectKey = `backups/turso-${snapshot.createdAt.replace(/[:.]/g, '-')}.json.gz.enc`
    await putObject(objectKey, encryptLogicalSnapshot(snapshot), 'application/octet-stream')
    return { objectKey, rowCount: snapshot.rowCount }
  } catch (error) {
    try { await tx.rollback() } catch { /* transaction may already be closed */ }
    throw error
  }
}

/** Restore is intentionally generic but must only be called against an isolated drill/target DB. */
export async function restoreLogicalSnapshot(client: Client, snapshot: LogicalBackupSnapshot, quarantineTarget?: RecoveryQuarantineTarget): Promise<LogicalRestoreResult> {
  verifyLogicalSnapshot(snapshot)
  const quarantine = quarantineTarget ? createRecoveryQuarantine(quarantineTarget, snapshot.checksum) : null
  const settings = snapshot.tables.find(table => table.name === 'system_settings')
  if (quarantine) {
    if (!settings || Object.keys(quarantine).some(column => !settings.columns.includes(column))) {
      throw new Error('Recovery quarantine requires the current system_settings schema')
    }
    if (settings.rows.some(row => row[settings.columns.indexOf('key')] === RECOVERY_QUARANTINE_KEY)) {
      throw new Error('Snapshot is already recovery-quarantined; it is not a released recovery source')
    }
  }
  const targetTables = await client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%'",
  )
  const available = new Set(targetTables.rows.map(row => String(row.name)))
  const captured = new Set(snapshot.tables.map(table => table.name))
  if ([...available].some(name => !captured.has(name))) {
    throw new Error('Logical backup is missing target tables; partial or older-schema snapshots require an explicit migration/recovery procedure')
  }
  for (const table of snapshot.tables) {
    if (!available.has(table.name)) throw new Error(`Restore target is missing table ${table.name}; run migrations first`)
    const info = await client.execute(`PRAGMA table_info(${quoteIdentifier(table.name)})`)
    const targetColumns = info.rows.map((row) => String(row.name))
    if (targetColumns.length !== table.columns.length || targetColumns.some((column, index) => column !== table.columns[index])) {
      throw new Error(`Restore target columns do not exactly match snapshot table ${table.name}`)
    }
    if (table.name !== 'schema_migrations') {
      const count = await client.execute(`SELECT count(*) AS count FROM ${quoteIdentifier(table.name)}`)
      if (Number(count.rows[0]?.count ?? 0) !== 0) {
        throw new Error(`Restore target is not empty: ${table.name} already contains rows`)
      }
    }
  }

  await client.execute('PRAGMA foreign_keys=OFF')
  const tx = await client.transaction('write')
  try {
    // A snapshot restores facts, not new business commands. Cross-table guards
    // depend on rows loaded later (and may reject valid historical inactive
    // references); ordering inserts cannot solve that. Suspend ONLY the trusted
    // target's triggers, transactionally, and reinstate their exact definitions
    // before commit. Rollback also restores the schema on any load/DDL failure.
    // Preserve registration order as well as definitions; do not reorder guards.
    const triggers = await tx.execute("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY rowid")
    for (const trigger of triggers.rows) {
      if (typeof trigger.sql !== 'string' || !trigger.sql.trim()) throw new Error('Restore target has an unreadable trigger definition')
      await tx.execute(`DROP TRIGGER ${quoteIdentifier(String(trigger.name))}`)
    }
    for (const table of [...snapshot.tables].reverse()) await tx.execute(`DELETE FROM ${quoteIdentifier(table.name)}`)
    let restored = 0
    for (const table of snapshot.tables) {
      if (table.columns.length === 0) continue
      const sql = `INSERT INTO ${quoteIdentifier(table.name)} (${table.columns.map(quoteIdentifier).join(',')}) VALUES (${table.columns.map(() => '?').join(',')})`
      for (const row of table.rows) {
        await tx.execute({ sql, args: row.map(decodeCell) as any[] })
        restored++
      }
    }
    for (const trigger of triggers.rows) await tx.execute(String(trigger.sql))
    const reinstated = await tx.execute("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY rowid")
    if (JSON.stringify(reinstated.rows.map(row => [row.name, row.sql])) !== JSON.stringify(triggers.rows.map(row => [row.name, row.sql]))) {
      throw new Error('Restore target trigger definitions were not reinstated exactly')
    }
    // Commit the quarantine in the SAME transaction as restored identities,
    // refresh sessions and jobs. A crash after commit cannot expose an unmarked
    // rewind. This is the sole declared metadata delta from snapshot contents.
    if (quarantine) {
      const columns = Object.keys(quarantine)
      await tx.execute({
        sql: `INSERT INTO system_settings (${columns.map(quoteIdentifier).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        args: Object.values(quarantine),
      })
    }
    await tx.commit()

    const tableCounts: Record<string, number> = {}
    for (const table of snapshot.tables) {
      const expected = quarantine && table.name === 'system_settings'
        ? [...table.rows, table.columns.map(column => quarantine[column as keyof typeof quarantine])]
        : table.rows
      const count = await client.execute(`SELECT count(*) AS count FROM ${quoteIdentifier(table.name)}`)
      const actual = Number(count.rows[0]?.count ?? 0)
      if (actual !== expected.length) {
        throw new Error(`Post-restore row count mismatch for ${table.name}: expected ${expected.length}, got ${actual}; discard this target`)
      }
      tableCounts[table.name] = actual
      // Counts alone miss coercion/trigger corruption of historical policy,
      // effective report payloads and completion receipts. Compare row multisets
      // without relying on SQLite's unspecified SELECT order; never log contents.
      const readback = await client.execute(`SELECT * FROM ${quoteIdentifier(table.name)}`)
      const actualRows = readback.rows.map(row => JSON.stringify(table.columns.map(column => encodeCell(row[column])))).sort()
      const expectedRows = expected.map(row => JSON.stringify(row)).sort()
      if (actualRows.some((row, index) => row !== expectedRows[index])) {
        throw new Error(`Post-restore content mismatch for ${table.name}; discard this target`)
      }
    }
    const foreignKeyCheck = await client.execute('PRAGMA foreign_key_check')
    if (foreignKeyCheck.rows.length > 0) {
      throw new Error(`Post-restore foreign_key_check reported ${foreignKeyCheck.rows.length} violation(s); discard this target`)
    }
    return { restoredRows: restored, tableCounts, foreignKeyViolations: 0, ...(quarantine ? { quarantined: true as const } : {}) }
  } catch (error) {
    try { await tx.rollback() } catch { /* transaction may already be closed */ }
    throw error
  } finally {
    await client.execute('PRAGMA foreign_keys=ON')
  }
}
