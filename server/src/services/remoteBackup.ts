import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { gzipSync, gunzipSync } from 'zlib'
import type { Client, InStatement, ResultSet } from '@libsql/client'
import { deleteObject, getObject, hasDurableBlobStorage, putObject } from './blobStorage.js'


import { createRecoveryQuarantine, RECOVERY_QUARANTINE_KEY, type RecoveryQuarantineTarget } from '../db/recoveryQuarantine.js'
import { isCloudflareWorkerRuntime } from '../utils/cloudflareRuntime.js'

const BACKUP_FORMAT = 'tnttvn-logical-backup-v1'
const BACKUP_SET_FORMAT = 'tnttvn-backup-set-v2'
const BACKUP_SET_PREFIX = 'backups/v2/'
const BACKUP_PART_PREFIX = 'parts/'
const BACKUP_DB_OBJECT = 'db.enc'
const BACKUP_MANIFEST_OBJECT = 'manifest.json'
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

type SqlExecutor = {
  execute(statement: InStatement): Promise<ResultSet>
  batch?(statements: InStatement[]): Promise<ResultSet[]>
}

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

interface EncryptedArchivePartEnvelope {
  format: 'tnttvn-archive-part-v2'
  encryption: 'aes-256-gcm'
  compression: 'gzip'
  iv: string
  authTag: string
  ciphertext: string
}

export interface BackupSetManifest {
  format: typeof BACKUP_SET_FORMAT
  backupId: string
  createdAt: string
  database: {
    objectKey: string
    encryptedSha256: string
    rowCount: number
  }
  archive: {
    count: number
    totalPlaintextBytes: number
    parts: Array<{
      assetId: string
      sourceObjectKey: string
      objectKey: string
      plaintextSha256: string
      plaintextBytes: number
      mimeType: string | null
    }>
  }
  checksum: string
}

export interface RemoteBackupSetResult {
  objectKey: string
  manifestKey: string
  databaseObjectKey: string
  rowCount: number
  archiveObjectCount: number
  archiveBytes: number
}

export interface RemoteBackupSetContents {
  manifest: BackupSetManifest
  snapshot: LogicalBackupSnapshot
  encryptedDatabaseBytes: number
  manifestBytes: number
  archiveBytes: Map<string, Buffer>
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
  const tableNames = tableResult.rows.map(row => String(row.name))
  const tableQueries = tableNames.map(name => `SELECT * FROM ${quoteIdentifier(name)}`)
  // Hrana sends a batch over one external subrequest while preserving the
  // caller's read transaction. A table-by-table Worker backup exceeds Free's
  // 50 external-subrequest cap on the current Catevia schema.
  const batched = isCloudflareWorkerRuntime() && executor.batch && tableQueries.length
    ? await executor.batch(tableQueries)
    : null
  if (batched && batched.length !== tableNames.length) throw new Error('Incomplete logical backup read batch')
  const tables: LogicalTableSnapshot[] = []
  let rowCount = 0
  for (let index = 0; index < tableNames.length; index++) {
    const name = tableNames[index]
    const result = batched ? batched[index] : await executor.execute(tableQueries[index])
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

function encryptArchivePart(bytes: Buffer, rawKey?: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', parseEncryptionKey(rawKey), iv)
  const ciphertext = Buffer.concat([cipher.update(gzipSync(bytes)), cipher.final()])
  const envelope: EncryptedArchivePartEnvelope = {
    format: 'tnttvn-archive-part-v2',
    encryption: 'aes-256-gcm',
    compression: 'gzip',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
  return Buffer.from(JSON.stringify(envelope), 'utf8')
}

function decryptArchivePart(encrypted: Buffer, rawKey?: string): Buffer {
  const envelope = JSON.parse(encrypted.toString('utf8')) as EncryptedArchivePartEnvelope
  if (envelope.format !== 'tnttvn-archive-part-v2' || envelope.encryption !== 'aes-256-gcm' || envelope.compression !== 'gzip') {
    throw new Error('Unsupported archive part envelope')
  }
  const decipher = createDecipheriv('aes-256-gcm', parseEncryptionKey(rawKey), Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))
  return gunzipSync(Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]))
}

function backupSetChecksum(manifest: Omit<BackupSetManifest, 'checksum'>): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
}

function verifyBackupSetManifest(manifest: BackupSetManifest): void {
  if (manifest?.format !== BACKUP_SET_FORMAT || typeof manifest.backupId !== 'string' || !/^[A-Za-z0-9-]+$/.test(manifest.backupId)) {
    throw new Error('Invalid backup set manifest')
  }
  const root = `${BACKUP_SET_PREFIX}${manifest.backupId}`
  if (manifest.database?.objectKey !== `${root}/${BACKUP_DB_OBJECT}` || !/^[a-f0-9]{64}$/i.test(manifest.database.encryptedSha256) || !Number.isInteger(manifest.database.rowCount) || manifest.database.rowCount < 0) {
    throw new Error('Invalid backup set database object key')
  }
  if (!Array.isArray(manifest.archive?.parts) || manifest.archive.count !== manifest.archive.parts.length || !Number.isInteger(manifest.archive.totalPlaintextBytes) || manifest.archive.totalPlaintextBytes < 0) {
    throw new Error('Invalid backup set archive manifest')
  }
  const seen = new Set<string>()
  const seenAssets = new Set<string>()
  let totalPlaintextBytes = 0
  for (const part of manifest.archive.parts) {
    if (!part.assetId || !part.sourceObjectKey || !part.objectKey.startsWith(`${root}/${BACKUP_PART_PREFIX}`)) {
      throw new Error('Invalid backup set archive part reference')
    }
    assertSafeObjectKey(part.sourceObjectKey)
    assertBackupSetObjectKey(part.objectKey)
    if (seen.has(part.objectKey) || seenAssets.has(part.assetId)) throw new Error('Duplicate backup set archive part')
    seen.add(part.objectKey)
    seenAssets.add(part.assetId)
    if (!/^[a-f0-9]{64}$/i.test(part.plaintextSha256) || !Number.isInteger(part.plaintextBytes) || part.plaintextBytes < 0) {
      throw new Error('Invalid backup set archive part checksum')
    }
    totalPlaintextBytes += part.plaintextBytes
  }
  if (totalPlaintextBytes !== manifest.archive.totalPlaintextBytes) throw new Error('Backup set archive byte count mismatch')
  const { checksum, ...withoutChecksum } = manifest
  if (!/^[a-f0-9]{64}$/i.test(checksum) || checksum !== backupSetChecksum(withoutChecksum)) {
    throw new Error('Backup set manifest checksum mismatch')
  }
}

function archiveRows(snapshot: LogicalBackupSnapshot): Array<{ assetId: string; objectKey: string; checksumSha256: string | null; mimeType: string | null }> {
  const table = snapshot.tables.find(item => item.name === 'parish_archive_assets')
  if (!table) return []
  const idIndex = table.columns.indexOf('id')
  const storageIndex = table.columns.indexOf('storage_type')
  const keyIndex = table.columns.indexOf('object_key')
  const checksumIndex = table.columns.indexOf('checksum_sha256')
  const mimeIndex = table.columns.indexOf('mime_type')
  const deletedIndex = table.columns.indexOf('deleted_at')
  if (idIndex < 0 || storageIndex < 0 || keyIndex < 0) throw new Error('Archive asset table is missing required columns')
  const keys = new Set<string>()
  return table.rows.flatMap((row) => {
    if (row[storageIndex] !== 'UPLOAD' || (deletedIndex >= 0 && row[deletedIndex] !== null) || typeof row[keyIndex] !== 'string' || !row[keyIndex]) return []
    const objectKey = row[keyIndex]
    if (keys.has(objectKey)) throw new Error('Duplicate archive object key in logical snapshot')
    keys.add(objectKey)
    return [{
      assetId: String(row[idIndex]),
      objectKey,
      checksumSha256: checksumIndex >= 0 && typeof row[checksumIndex] === 'string' ? row[checksumIndex] : null,
      mimeType: mimeIndex >= 0 && typeof row[mimeIndex] === 'string' ? row[mimeIndex] : null,
    }]
  })
}

function assertSafeObjectKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\')) {
    throw new Error(`Invalid object key: ${key}`)
  }
}

function assertBackupSetObjectKey(key: string): void {
  if (!key.startsWith(BACKUP_SET_PREFIX)) {
    throw new Error(`Invalid backup set object key: ${key}`)
  }
  assertSafeObjectKey(key)
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

export async function createAndStoreRemoteBackupV1(client: Client): Promise<{ objectKey: string; rowCount: number }> {
  if (!hasDurableBlobStorage()) throw new Error('Remote database backup requires independent R2 storage')
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

export async function createAndStoreRemoteBackup(client: Client): Promise<RemoteBackupSetResult> {
  if (!hasDurableBlobStorage()) throw new Error('Remote database backup requires independent R2 storage')
  parseEncryptionKey()
  const tx = await client.transaction('read')
  let snapshot: LogicalBackupSnapshot
  try {
    snapshot = await createLogicalSnapshot(tx)
    await tx.commit()
  } catch (error) {
    try { await tx.rollback() } catch { /* transaction may already be closed */ }
    throw error
  }

  const backupId = `set-${snapshot.createdAt.replace(/[:.]/g, '-')}-${randomBytes(6).toString('hex')}`
  const root = `${BACKUP_SET_PREFIX}${backupId}`
  const databaseObjectKey = `${root}/${BACKUP_DB_OBJECT}`
  const manifestKey = `${root}/${BACKUP_MANIFEST_OBJECT}`
  const writtenKeys: string[] = []
  const parts: BackupSetManifest['archive']['parts'] = []
  let archiveBytes = 0

  try {
    const encryptedDatabase = encryptLogicalSnapshot(snapshot)
    await putObject(databaseObjectKey, encryptedDatabase, 'application/octet-stream')
    writtenKeys.push(databaseObjectKey)

    for (const [index, source] of archiveRows(snapshot).entries()) {
      const bytes = await getObject(source.objectKey)
      if (!bytes) throw new Error(`Archive object is missing from backup source: ${source.objectKey}`)
      const plaintextSha256 = createHash('sha256').update(bytes).digest('hex')
      if (source.checksumSha256 && source.checksumSha256.toLowerCase() !== plaintextSha256) {
        throw new Error(`Archive object checksum mismatch: ${source.objectKey}`)
      }
      const partKey = `${root}/${BACKUP_PART_PREFIX}${String(index + 1).padStart(6, '0')}.enc`
      assertBackupSetObjectKey(partKey)
      await putObject(partKey, encryptArchivePart(bytes), 'application/octet-stream')
      writtenKeys.push(partKey)
      parts.push({
        assetId: source.assetId,
        sourceObjectKey: source.objectKey,
        objectKey: partKey,
        plaintextSha256,
        plaintextBytes: bytes.length,
        mimeType: source.mimeType,
      })
      archiveBytes += bytes.length
    }

    const withoutChecksum: Omit<BackupSetManifest, 'checksum'> = {
      format: BACKUP_SET_FORMAT,
      backupId,
      createdAt: snapshot.createdAt,
      database: {
        objectKey: databaseObjectKey,
        encryptedSha256: createHash('sha256').update(encryptedDatabase).digest('hex'),
        rowCount: snapshot.rowCount,
      },
      archive: {
        count: parts.length,
        totalPlaintextBytes: archiveBytes,
        parts,
      },
    }
    const manifest: BackupSetManifest = { ...withoutChecksum, checksum: backupSetChecksum(withoutChecksum) }
    verifyBackupSetManifest(manifest)
    await putObject(manifestKey, Buffer.from(JSON.stringify(manifest), 'utf8'), 'application/json')
    writtenKeys.push(manifestKey)

    const [storedManifest, storedDatabase] = await Promise.all([getObject(manifestKey), getObject(databaseObjectKey)])
    if (!storedManifest || !storedDatabase) throw new Error('Backup set publish verification failed')
    const readBackManifest = JSON.parse(storedManifest.toString('utf8')) as BackupSetManifest
    verifyBackupSetManifest(readBackManifest)
    if (createHash('sha256').update(storedDatabase).digest('hex') !== manifest.database.encryptedSha256) {
      throw new Error('Backup database object checksum mismatch after publish')
    }

    return {
      objectKey: manifestKey,
      manifestKey,
      databaseObjectKey,
      rowCount: snapshot.rowCount,
      archiveObjectCount: parts.length,
      archiveBytes,
    }
  } catch (error) {
    await Promise.all(writtenKeys.map(key => deleteObject(key).catch(() => undefined)))
    throw error
  }
}

export async function readAndVerifyRemoteBackupSet(manifestKey: string, rawKey?: string): Promise<RemoteBackupSetContents> {
  assertBackupSetObjectKey(manifestKey)
  if (!manifestKey.endsWith(`/${BACKUP_MANIFEST_OBJECT}`)) throw new Error('Backup set manifest key is invalid')
  const manifestBytes = await getObject(manifestKey)
  if (!manifestBytes) throw new Error(`Backup set manifest not found: ${manifestKey}`)
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as BackupSetManifest
  verifyBackupSetManifest(manifest)
  assertBackupSetObjectKey(manifest.database.objectKey)
  const encryptedDatabase = await getObject(manifest.database.objectKey)
  if (!encryptedDatabase) throw new Error('Backup set database object not found')
  if (createHash('sha256').update(encryptedDatabase).digest('hex') !== manifest.database.encryptedSha256) {
    throw new Error('Backup set database object checksum mismatch')
  }
  const snapshot = decryptLogicalSnapshot(encryptedDatabase, rawKey)
  if (snapshot.rowCount !== manifest.database.rowCount) throw new Error('Backup set database row count mismatch')
  const expectedArchiveRows = archiveRows(snapshot)
  const expectedByAsset = new Map(expectedArchiveRows.map(row => [row.assetId, row.objectKey]))
  if (expectedArchiveRows.length !== manifest.archive.parts.length || manifest.archive.parts.some(part => expectedByAsset.get(part.assetId) !== part.sourceObjectKey)) {
    throw new Error('Backup set archive manifest does not match active archive rows')
  }
  const archiveBytes = new Map<string, Buffer>()
  for (const part of manifest.archive.parts) {
    assertBackupSetObjectKey(part.objectKey)
    const encryptedPart = await getObject(part.objectKey)
    if (!encryptedPart) throw new Error(`Backup set archive part not found: ${part.objectKey}`)
    const bytes = decryptArchivePart(encryptedPart, rawKey)
    if (bytes.length !== part.plaintextBytes || createHash('sha256').update(bytes).digest('hex') !== part.plaintextSha256) {
      throw new Error(`Backup set archive part checksum mismatch: ${part.objectKey}`)
    }
    archiveBytes.set(part.assetId, bytes)
  }
  return { manifest, snapshot, encryptedDatabaseBytes: encryptedDatabase.length, manifestBytes: manifestBytes.length, archiveBytes }
}

/** Restore is intentionally generic but must only be called against an isolated drill/target DB. */

export async function restoreLogicalSnapshot(client: Client, snapshot: LogicalBackupSnapshot, quarantineTarget?: RecoveryQuarantineTarget, quarantineSourceChecksum = snapshot.checksum): Promise<LogicalRestoreResult> {
  verifyLogicalSnapshot(snapshot)
  const quarantine = quarantineTarget ? createRecoveryQuarantine(quarantineTarget, quarantineSourceChecksum) : null
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
    for (const table of snapshot.tables) {
      if (table.name === 'schema_migrations') continue
      const count = await tx.execute(`SELECT count(*) AS count FROM ${quoteIdentifier(table.name)}`)
      if (Number(count.rows[0]?.count ?? 0) !== 0) {
        throw new Error(`Restore target is not empty: ${table.name} already contains rows`)
      }
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

function normalizeArchivePrefix(value: string | undefined): string {
  const prefix = value?.trim().replace(/^\/+|\/+$/g, '') || ''
  if (prefix && (!/^[A-Za-z0-9/_-]+$/.test(prefix) || prefix.includes('..'))) {
    throw new Error('Restore archive prefix is invalid')
  }
  return prefix
}

function rewriteSnapshotArchivePrefix(snapshot: LogicalBackupSnapshot, prefix: string): LogicalBackupSnapshot {
  if (!prefix) return snapshot
  const copy = JSON.parse(JSON.stringify(snapshot)) as LogicalBackupSnapshot
  const table = copy.tables.find(item => item.name === 'parish_archive_assets')
  if (!table) return copy
  const idIndex = table.columns.indexOf('id')
  const storageIndex = table.columns.indexOf('storage_type')
  const keyIndex = table.columns.indexOf('object_key')
  const deletedIndex = table.columns.indexOf('deleted_at')
  if (idIndex < 0 || storageIndex < 0 || keyIndex < 0) throw new Error('Archive asset table is missing required columns')
  table.rows = table.rows.map((row) => {
    if (row[storageIndex] !== 'UPLOAD' || (deletedIndex >= 0 && row[deletedIndex] !== null) || typeof row[keyIndex] !== 'string' || !row[keyIndex]) return row
    return row.map((value, index) => index === keyIndex ? `${prefix}/${value}` : value)
  })
  const { checksum: _oldChecksum, ...withoutChecksum } = copy
  return { ...copy, checksum: createHash('sha256').update(snapshotPayload(withoutChecksum)).digest('hex') }
}

export async function restoreRemoteBackupSet(
  client: Client,
  manifestKey: string,
  options: {
    quarantineTarget?: RecoveryQuarantineTarget
    archivePrefix?: string
    rawKey?: string
  } = {},
): Promise<LogicalRestoreResult & { archiveObjectCount: number; archiveBytes: number; archivePrefix: string }> {
  const contents = await readAndVerifyRemoteBackupSet(manifestKey, options.rawKey)
  const requestedPrefix = normalizeArchivePrefix(options.archivePrefix)
  if (!requestedPrefix) {
    throw new Error('Restore requires an isolated archive prefix')
  }
  const archivePrefix = `${requestedPrefix}/run-${randomBytes(8).toString('hex')}`
  const snapshot = rewriteSnapshotArchivePrefix(contents.snapshot, archivePrefix)
  const targetKeys = contents.manifest.archive.parts.map(part => `${archivePrefix}/${part.sourceObjectKey}`)
  const existing = await Promise.all(targetKeys.map(key => getObject(key)))
  if (existing.some(bytes => bytes !== null)) {
    throw new Error('Restore archive run prefix is not empty; refusing to overwrite existing objects')
  }
  for (const [index, part] of contents.manifest.archive.parts.entries()) {
    const bytes = contents.archiveBytes.get(part.assetId)
    if (!bytes) throw new Error(`Archive part payload missing for ${part.assetId}`)
    const targetKey = targetKeys[index]
    assertSafeObjectKey(targetKey)
    await putObject(targetKey, bytes, part.mimeType || 'application/octet-stream')
  }
  const result = await restoreLogicalSnapshot(client, snapshot, options.quarantineTarget, contents.manifest.checksum)
  return {
    ...result,
    archiveObjectCount: contents.manifest.archive.count,
    archiveBytes: contents.manifest.archive.totalPlaintextBytes,
    archivePrefix,
  }
}
