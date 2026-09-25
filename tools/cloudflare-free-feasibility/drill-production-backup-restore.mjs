// Decrypt one production R2 backup in memory and restore only to a fresh local
// temporary SQLite database. This tool never opens a production Turso client.
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createClient } from '@libsql/client'

const PRODUCTION_BUCKET = 'catevia-production-blobs'
const LEGACY_OBJECT_KEY_PATTERN = /^backups\/turso-[A-Za-z0-9-]+\.json\.gz\.enc$/
const BACKUP_SET_OBJECT_KEY_PATTERN = /^backups\/v2\/[^/]+\/manifest\.json$/
const MAX_ENCRYPTED_BYTES = 64 * 1024 * 1024

export function validateRestoreInputs(env) {
  let endpoint
  try { endpoint = new URL(env.R2_ENDPOINT || '') }
  catch { throw new Error('Cloudflare R2 S3 endpoint required') }
  if (endpoint.protocol !== 'https:' || !/^[a-f0-9]+\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)
    || endpoint.username || endpoint.password || endpoint.pathname !== '/') {
    throw new Error('Cloudflare R2 S3 endpoint required')
  }
  if (env.R2_BUCKET !== PRODUCTION_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY
    || !env.BACKUP_ENCRYPTION_KEY) throw new Error('Production R2 read credentials and backup key required')
  if (!LEGACY_OBJECT_KEY_PATTERN.test(env.BACKUP_OBJECT_KEY || '') && !BACKUP_SET_OBJECT_KEY_PATTERN.test(env.BACKUP_OBJECT_KEY || '')) {
    throw new Error('Exact backup object key required')
  }
  if (!/^[a-f0-9]{64}$/.test(env.EXPECTED_SNAPSHOT_CHECKSUM || '')) {
    throw new Error('Verified snapshot checksum required')
  }
  const rowCount = Number(env.EXPECTED_ROW_COUNT)
  const encryptedBytes = Number(env.EXPECTED_ENCRYPTED_BYTES)
  if (!Number.isSafeInteger(rowCount) || rowCount < 0
    || !Number.isSafeInteger(encryptedBytes) || encryptedBytes <= 0
    || encryptedBytes > MAX_ENCRYPTED_BYTES) {
    throw new Error('Verified row count and bounded encrypted size required')
  }
  return { endpoint: endpoint.href, bucket: PRODUCTION_BUCKET,
    objectKey: env.BACKUP_OBJECT_KEY, checksum: env.EXPECTED_SNAPSHOT_CHECKSUM,
    rowCount, encryptedBytes, format: BACKUP_SET_OBJECT_KEY_PATTERN.test(env.BACKUP_OBJECT_KEY) ? 'v2' : 'legacy' }
}

function removeIsolatedTarget(targetDir, targetPath) {
  for (const path of [targetPath, `${targetPath}-wal`, `${targetPath}-shm`]) {
    if (!resolve(path).startsWith(`${resolve(targetDir)}${sep}`)) throw new Error('Unsafe restore cleanup path')
    if (existsSync(path)) rmSync(path)
  }
  rmSync(targetDir)
}

export async function drillProductionBackupRestore(env = process.env) {
  const input = validateRestoreInputs(env)
  process.env.DEPLOYMENT_PARISH_ID = 'gia-ton'
   const [{ decryptLogicalSnapshot, readAndVerifyRemoteBackupSet, restoreLogicalSnapshot }, { prepareEmptyRestoreTarget },
     { assertDatabaseReady }, { assertNotRecoveryQuarantined }] = await Promise.all([

    import('../../server/src/services/remoteBackup.ts'),
    import('../../server/src/db/restorePreparation.ts'),
    import('../../server/src/db/schemaHealth.ts'),
    import('../../server/src/db/recoveryQuarantine.ts'),
  ])
   let snapshot
   let archiveObjectCount = 0
   if (input.format === 'v2') {
     const contents = await readAndVerifyRemoteBackupSet(input.objectKey, env.BACKUP_ENCRYPTION_KEY)
     snapshot = contents.snapshot
     archiveObjectCount = contents.manifest.archive.count
     if (contents.encryptedDatabaseBytes !== input.encryptedBytes
       || contents.manifest.checksum !== input.checksum
       || snapshot.rowCount !== input.rowCount) {
       throw new Error('Backup set differs from Worker verification')
     }
     for (const bytes of contents.archiveBytes.values()) bytes.fill(0)
   } else {
     const s3 = new S3Client({ endpoint: input.endpoint, region: 'auto',
       credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } })
     let encrypted
     try {
       const object = await s3.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.objectKey }))
       if (!object.Body || Number(object.ContentLength) !== input.encryptedBytes) {
         throw new Error('R2 object size differs from Worker verification')
       }
       encrypted = Buffer.from(await object.Body.transformToByteArray())
     } finally {
       s3.destroy()
     }
     if (encrypted.length !== input.encryptedBytes) throw new Error('Incomplete R2 backup download')
     snapshot = decryptLogicalSnapshot(encrypted, env.BACKUP_ENCRYPTION_KEY)
     encrypted.fill(0)
     if (snapshot.checksum !== input.checksum || snapshot.rowCount !== input.rowCount) {
       throw new Error('Snapshot differs from Worker verification')
     }
   }


  // libSQL's executeMultiple/transaction paths do not retain a shared in-memory
  // database across calls. Encrypt the local target with a throwaway key, then
  // remove it after the drill; a crash must not leave readable student data.
  const targetDir = mkdtempSync(join(tmpdir(), 'catevia-restore-drill-'))
  if (resolve(targetDir) === resolve(tmpdir()) || !resolve(targetDir).startsWith(`${resolve(tmpdir())}${sep}`)) {
    throw new Error('Isolated restore target escaped the temporary directory')
  }
  const targetPath = join(targetDir, `${randomUUID()}.sqlite`)
  const target = createClient({ url: `file:${targetPath.replace(/\\/g, '/')}`,
    encryptionKey: randomBytes(32).toString('hex') })
  const startedAt = Date.now()
  try {
    await prepareEmptyRestoreTarget(target)
    if (readFileSync(targetPath).subarray(0, 16).toString('utf8') === 'SQLite format 3\u0000') {
      throw new Error('Isolated restore target is not encrypted')
    }
    const restored = await restoreLogicalSnapshot(target, snapshot, {
      parishId: 'gia-ton',
      targetFingerprint: createHash('sha256').update(`isolated-production-drill-${targetPath}`).digest('hex'),
    })
    await assertDatabaseReady(target)
    let quarantineBlocksStartup = false
    try { await assertNotRecoveryQuarantined(target) } catch (error) {
      quarantineBlocksStartup = String(error?.message).includes('RECOVERY_QUARANTINED')
    }
    if (restored.restoredRows !== input.rowCount || restored.foreignKeyViolations !== 0
      || Object.keys(restored.tableCounts).length !== snapshot.tables.length
      || !restored.quarantined || !quarantineBlocksStartup) {
      throw new Error('Isolated restore integrity or quarantine failed')
    }
     return { verified: true, scope: 'production-r2-to-isolated-local-sqlite',
       checkedAt: new Date().toISOString(), format: input.format,
       rowCount: restored.restoredRows, archiveObjectCount,
       tableCount: Object.keys(restored.tableCounts).length,

      foreignKeyViolations: restored.foreignKeyViolations,
      quarantineBlocksStartup, localDurationMs: Date.now() - startedAt,
      cutoverReady: false }
  } finally {
    try { await target.close() } finally {
      removeIsolatedTarget(targetDir, targetPath)
    }
  }
}

if (process.argv[1]?.endsWith('drill-production-backup-restore.mjs')) {
  try {
    process.stdout.write(`${JSON.stringify(await drillProductionBackupRestore())}\n`)
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ verified: false, errorClass: error?.name || 'UnknownError' })}\n`)
    process.exitCode = 1
  }
}
