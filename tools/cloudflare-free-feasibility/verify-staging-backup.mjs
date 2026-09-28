// Independently verify the downloaded encrypted R2 fixture without printing data.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { decryptLogicalSnapshot } from '../../server/src/services/remoteBackup.ts'

const values = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (!values.TURSO_URL?.includes('catevia-cloudflare-probe-20260924') || !values.BACKUP_ENCRYPTION_KEY) {
  throw new Error('Disposable staging credentials required')
}

const encrypted = readFileSync(new URL('./.backup-probe.enc', import.meta.url))
const snapshot = decryptLogicalSnapshot(encrypted, values.BACKUP_ENCRYPTION_KEY)
const result = {
  capturedAt: new Date().toISOString(),
  scope: 'downloaded-disposable-r2-object',
  envelopeSha256: createHash('sha256').update(encrypted).digest('hex'),
  encryptedBytes: encrypted.length,
  verified: true,
  tableCount: snapshot.tables.length,
  rowCount: snapshot.rowCount,
  snapshotChecksum: snapshot.checksum,
}
writeFileSync(new URL('./results/2026-09-24-catevia-staging-backup-verified.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(result)}\n`)
