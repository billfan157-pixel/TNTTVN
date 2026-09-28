import { execFileSync } from 'node:child_process'
import { createClient } from '@libsql/client'
import { applyMigrations, type MigrationClient } from '../db/migrationRunner.js'
import { MIGRATIONS } from '../db/migrations.js'
import { assertNotRecoveryQuarantined } from '../db/recoveryQuarantine.js'
import { assertDatabaseReady } from '../db/schemaHealth.js'

const PRODUCTION_DATABASE_URL = 'libsql://tnttvn-billfan157-pixel.aws-us-east-1.turso.io'
const url = process.env.TURSO_URL
const authToken = process.env.TURSO_AUTH_TOKEN
const approvedSha = process.env.MIGRATION_APPROVED_SHA?.trim()
const allow = process.env.ALLOW_PRODUCTION_MIGRATION

if (allow !== 'true') throw new Error('Set ALLOW_PRODUCTION_MIGRATION=true for an approved production migration')
if (url !== PRODUCTION_DATABASE_URL) throw new Error('Refusing to migrate a database outside the pinned production URL')
if (!authToken) throw new Error('TURSO_AUTH_TOKEN is required')
if (!approvedSha || !/^[a-f0-9]{40}$/i.test(approvedSha)) throw new Error('MIGRATION_APPROVED_SHA must be the exact 40-character release SHA')

let currentSha = ''
try {
  currentSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} catch {
  throw new Error('Unable to resolve the repository release SHA')
}
if (currentSha !== approvedSha) throw new Error(`MIGRATION_APPROVED_SHA does not match the checked-out release (${currentSha})`)

const client = createClient({ url, authToken })
try {
  await assertNotRecoveryQuarantined(client)
  const before = await client.execute('SELECT count(*) AS count FROM sqlite_schema WHERE type = \'table\' AND name = \'schema_migrations\'')
  if (Number(before.rows[0]?.count ?? 0) === 0) {
    throw new Error('Production schema_migrations table is missing; run the guarded schema preparation procedure first')
  }
  await applyMigrations(client as unknown as MigrationClient, MIGRATIONS)
  await assertDatabaseReady(client)
  const applied = await client.execute('SELECT count(*) AS count FROM schema_migrations')
  process.stdout.write(`${JSON.stringify({ ok: true, releaseSha: currentSha, appliedMigrations: Number(applied.rows[0]?.count ?? 0) })}\n`)
} finally {
  client.close()
}
