// Creates one encrypted backup through the closed production Worker, then checks
// that the same Worker can read, decrypt, and verify the R2 object. No DB writes.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyProductionBoundary } from './verify-production-boundary.mjs'

const WORKER = 'https://catevia-api.billfan157.workers.dev'

export async function probeProductionBackup({ expectedWorkerRelease, expectedRenderRelease, token, fetcher = fetch }) {
  if (!/^[a-f0-9]{40}$/.test(expectedWorkerRelease || '')) throw new Error('Exact Worker release SHA required')
  if (typeof token !== 'string' || token.length < 32) throw new Error('Operator token unavailable')
  const boundary = await verifyProductionBoundary(expectedRenderRelease, fetcher)
  if (!boundary.ok) throw new Error('Render routing or closed Worker boundary failed')

  const canaryHeaders = { 'x-catevia-canary-token': token }
  const health = await fetcher(`${WORKER}/health`, {
    headers: canaryHeaders, signal: AbortSignal.timeout(30_000),
  })
  if (health.status !== 200) throw new Error('Worker canary health failed')
  const healthBody = await health.json()
  if (healthBody.releaseId !== expectedWorkerRelease || healthBody.database !== 'connected') {
    throw new Error('Worker release or database health mismatch')
  }

  const created = await fetcher(`${WORKER}/__ops/precutover-backup`, {
    method: 'POST', headers: canaryHeaders, signal: AbortSignal.timeout(90_000),
  })
  if (created.status !== 200) throw new Error(`Backup creation failed (HTTP ${created.status})`)
  const backup = await created.json()
  const isSetManifest = /^backups\/v2\/[^/]+\/manifest\.json$/.test(backup.objectKey || '')
  const isLegacyObject = /^backups\/turso-[A-Za-z0-9-]+\.json\.gz\.enc$/.test(backup.objectKey || '')
  if ((!isSetManifest && !isLegacyObject) || !Number.isSafeInteger(backup.rowCount) || backup.rowCount < 0) {
    throw new Error('Backup creation returned invalid metadata')
  }

  const verified = await fetcher(`${WORKER}/__ops/precutover-backup/verify`, {
    method: 'POST',
    headers: { ...canaryHeaders, 'x-catevia-backup-key': backup.objectKey },
    signal: AbortSignal.timeout(90_000),
  })
  if (verified.status !== 200) throw new Error(`Backup verification failed (HTTP ${verified.status})`)
  const result = await verified.json()
  if (result.objectKey !== backup.objectKey || result.rowCount !== backup.rowCount
    || !Number.isSafeInteger(result.tableCount) || result.tableCount <= 0
    || !Number.isSafeInteger(result.encryptedBytes) || result.encryptedBytes <= 0
    || !/^[a-f0-9]{64}$/.test(result.checksum || '')) {
    throw new Error('Backup verification metadata mismatch')
  }
  if (isSetManifest && (result.format !== 'tnttvn-backup-set-v2'
    || !Number.isSafeInteger(result.archiveObjectCount) || result.archiveObjectCount < 0
    || !Number.isSafeInteger(result.manifestBytes) || result.manifestBytes <= 0)) {
    throw new Error('Backup set verification metadata mismatch')
  }
  return { ok: true, scope: 'production-worker-encrypted-r2-object-only',
    workerRelease: expectedWorkerRelease, checkedAt: new Date().toISOString(),
    objectKey: result.objectKey, format: result.format || 'tnttvn-logical-backup-v1',
    encryptedBytes: result.encryptedBytes, rowCount: result.rowCount,
    tableCount: result.tableCount, archiveObjectCount: result.archiveObjectCount || 0,
    checksum: result.checksum, isolatedRestoreVerified: false }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await probeProductionBackup({ expectedWorkerRelease: process.argv[2],
      expectedRenderRelease: process.argv[3], token: process.env.OPS_TOKEN })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, errorClass: error?.name || 'UnknownError',
      message: error?.message || 'Unknown failure' })}\n`)
    process.exitCode = 1
  }
}
