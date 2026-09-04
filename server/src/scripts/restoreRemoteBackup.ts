import { createClient } from '@libsql/client'
import { createHash } from 'crypto'
import { getObject } from '../services/blobStorage.js'
import { decryptLogicalSnapshot, restoreLogicalSnapshot } from '../services/remoteBackup.js'
import { assertDatabaseReady } from '../db/schemaHealth.js'

const objectKey = process.argv[2]
const targetUrl = process.env.RESTORE_DATABASE_URL
const targetToken = process.env.RESTORE_DATABASE_AUTH_TOKEN
const targetConfirmation = process.env.RESTORE_TARGET_FINGERPRINT

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

const encrypted = await getObject(objectKey)
if (!encrypted) throw new Error(`Backup object not found: ${objectKey}`)

const target = createClient({ url: targetUrl, authToken: targetToken })
try {
  const startedAt = Date.now()
  const snapshot = decryptLogicalSnapshot(encrypted)
  const result = await restoreLogicalSnapshot(target, snapshot)
  await assertDatabaseReady(target)
  console.log(JSON.stringify({
    status: 'verified',
    targetFingerprint: fingerprint,
    sourceCreatedAt: snapshot.createdAt,
    restoredRows: result.restoredRows,
    tableCounts: result.tableCounts,
    foreignKeyViolations: result.foreignKeyViolations,
    durationMs: Date.now() - startedAt,
  }))
} finally {
  target.close()
}
