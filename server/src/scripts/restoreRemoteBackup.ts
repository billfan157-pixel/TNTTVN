import { createClient } from '@libsql/client'
import { createHash } from 'crypto'
import { getObject } from '../services/blobStorage.js'
import { decryptLogicalSnapshot, restoreLogicalSnapshot } from '../services/remoteBackup.js'
import { assertDatabaseReady } from '../db/schemaHealth.js'
import { assertDeploymentParishConfiguration } from '../utils/deploymentParish.js'

const objectKey = process.argv[2]
const targetUrl = process.env.RESTORE_DATABASE_URL
const targetToken = process.env.RESTORE_DATABASE_AUTH_TOKEN
const targetConfirmation = process.env.RESTORE_TARGET_FINGERPRINT
const parishId = assertDeploymentParishConfiguration()

function normalizeDatabaseUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '')
  return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${url.pathname}`
}

function targetFingerprint(value: string): string {
  return createHash('sha256').update(normalizeDatabaseUrl(value)).digest('hex')
}

if (!objectKey?.startsWith('backups/')) throw new Error('Usage: npm --prefix server run db:restore:remote -- backups/<object-key>')
if (process.env.ALLOW_BACKUP_RESTORE !== 'true') throw new Error('Set ALLOW_BACKUP_RESTORE=true for an explicit restore drill')
if (!targetUrl) throw new Error('RESTORE_DATABASE_URL is required')
const fingerprint = targetFingerprint(targetUrl)
if (!targetConfirmation || targetConfirmation.toLowerCase() !== fingerprint) {
  throw new Error(`RESTORE_TARGET_FINGERPRINT must exactly match SHA-256 of the normalized restore target URL (${fingerprint})`)
}
if (process.env.TURSO_URL && normalizeDatabaseUrl(targetUrl) === normalizeDatabaseUrl(process.env.TURSO_URL)) {
  throw new Error('Refusing to restore into the configured production TURSO_URL')
}

const target = createClient({ url: targetUrl, authToken: targetToken })
try {
  const startedAt = Date.now()
  const downloadStartedAt = Date.now()
  const encrypted = await getObject(objectKey)
  const downloadMs = Date.now() - downloadStartedAt
  if (!encrypted) throw new Error(`Backup object not found: ${objectKey}`)

  const decryptStartedAt = Date.now()
  const snapshot = decryptLogicalSnapshot(encrypted)
  const decryptMs = Date.now() - decryptStartedAt

  const restoreStartedAt = Date.now()
  const result = await restoreLogicalSnapshot(target, snapshot, { parishId, targetFingerprint: fingerprint })
  const restoreMs = Date.now() - restoreStartedAt

  const readinessStartedAt = Date.now()
  await assertDatabaseReady(target)
  const readinessMs = Date.now() - readinessStartedAt
  console.log(JSON.stringify({
    status: 'verified',
    purpose: 'isolated-data-fidelity-drill',
    cutoverReady: false,
    quarantined: result.quarantined,
    metadataDelta: 'One system_settings recovery quarantine marker; restoredRows excludes this marker, tableCounts includes it',
    requiredCutoverGates: ['traffic-and-worker-quarantine', 'credential-and-session-invalidation', 'client-generation-and-offline-reconciliation', 'delivery-reconciliation', 'owner-approval'],
    targetFingerprint: fingerprint,
    sourceCreatedAt: snapshot.createdAt,
    restoredRows: result.restoredRows,
    tableCounts: result.tableCounts,
    foreignKeyViolations: result.foreignKeyViolations,
    phaseDurationMs: { download: downloadMs, decrypt: decryptMs, restore: restoreMs, readiness: readinessMs },
    durationMs: Date.now() - startedAt,
  }))
} finally {
  target.close()
}
