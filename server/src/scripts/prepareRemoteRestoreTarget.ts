import { createHash } from 'node:crypto'
import { createClient } from '@libsql/client'
import { applyBootstrapSchema } from '../db/bootstrapSchema.js'
import { applyMigrations } from '../db/migrationRunner.js'
import { MIGRATIONS } from '../db/migrations.js'
import { applyDefensiveSync } from '../db/defensiveSync.js'
import { applyIndices } from '../db/bootstrapIndices.js'
import { assertDatabaseReady } from '../db/schemaHealth.js'

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

if (process.env.ALLOW_BACKUP_RESTORE !== 'true') throw new Error('Set ALLOW_BACKUP_RESTORE=true for an explicit restore drill')
if (!targetUrl) throw new Error('RESTORE_DATABASE_URL is required')
const normalizedTarget = normalizeDatabaseUrl(targetUrl)
const fingerprint = createHash('sha256').update(normalizedTarget).digest('hex')
if (!targetConfirmation || targetConfirmation.toLowerCase() !== fingerprint) {
  throw new Error(`RESTORE_TARGET_FINGERPRINT must exactly match SHA-256 of the normalized restore target URL (${fingerprint})`)
}
if (process.env.TURSO_URL && normalizedTarget === normalizeDatabaseUrl(process.env.TURSO_URL)) {
  throw new Error('Refusing to prepare the configured production TURSO_URL')
}

const target = createClient({ url: targetUrl, authToken: targetToken })
try {
  const existing = await target.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' ORDER BY name",
  )
  if (existing.rows.length > 0) {
    throw new Error(`Restore target must be a fresh database; found ${existing.rows.length} application table(s)`)
  }

  const startedAt = Date.now()
  await applyBootstrapSchema(target)
  await applyMigrations(target, MIGRATIONS)
  await applyDefensiveSync(target)
  await applyIndices(target)
  await assertDatabaseReady(target)
  console.log(JSON.stringify({
    status: 'restore_target_prepared',
    targetFingerprint: fingerprint,
    migrationCount: MIGRATIONS.length,
    durationMs: Date.now() - startedAt,
  }))
} finally {
  target.close()
}
