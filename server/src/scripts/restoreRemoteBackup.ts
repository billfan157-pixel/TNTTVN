import { createClient } from '@libsql/client'
import { getObject } from '../services/blobStorage.js'
import { decryptLogicalSnapshot, restoreLogicalSnapshot } from '../services/remoteBackup.js'

const objectKey = process.argv[2]
const targetUrl = process.env.RESTORE_DATABASE_URL
const targetToken = process.env.RESTORE_DATABASE_AUTH_TOKEN

function normalizeDatabaseUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '')
  return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${url.pathname}`
}

if (!objectKey?.startsWith('backups/')) throw new Error('Usage: npm --prefix server run db:restore:remote -- backups/<object-key>')
if (process.env.ALLOW_BACKUP_RESTORE !== 'true') throw new Error('Set ALLOW_BACKUP_RESTORE=true for an explicit restore drill')
if (!targetUrl) throw new Error('RESTORE_DATABASE_URL is required')
if (process.env.TURSO_URL && normalizeDatabaseUrl(targetUrl) === normalizeDatabaseUrl(process.env.TURSO_URL)) {
  throw new Error('Refusing to restore into the configured production TURSO_URL')
}

const encrypted = await getObject(objectKey)
if (!encrypted) throw new Error(`Backup object not found: ${objectKey}`)

const target = createClient({ url: targetUrl, authToken: targetToken })
try {
  const snapshot = decryptLogicalSnapshot(encrypted)
  const restored = await restoreLogicalSnapshot(target, snapshot)
  console.log(`Restore drill completed: ${restored} rows from ${snapshot.createdAt}`)
} finally {
  target.close()
}
