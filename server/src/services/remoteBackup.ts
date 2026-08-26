import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { gzipSync, gunzipSync } from 'zlib'
import type { Client, InStatement, ResultSet } from '@libsql/client'
import { isR2Enabled, putObject } from './blobStorage.js'

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
  for (const table of snapshot.tables) {
    quoteIdentifier(table.name)
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
export async function restoreLogicalSnapshot(client: Client, snapshot: LogicalBackupSnapshot): Promise<number> {
  verifyLogicalSnapshot(snapshot)
  const targetTables = await client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%'",
  )
  const available = new Set(targetTables.rows.map(row => String(row.name)))
  for (const table of snapshot.tables) {
    if (!available.has(table.name)) throw new Error(`Restore target is missing table ${table.name}; run migrations first`)
  }

  await client.execute('PRAGMA foreign_keys=OFF')
  const tx = await client.transaction('write')
  try {
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
    await tx.commit()
    return restored
  } catch (error) {
    try { await tx.rollback() } catch { /* transaction may already be closed */ }
    throw error
  } finally {
    await client.execute('PRAGMA foreign_keys=ON')
  }
}
