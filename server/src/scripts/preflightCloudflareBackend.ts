// Read-only release gate. Run with TURSO_URL/TURSO_AUTH_TOKEN from the target
// environment; never run migrations or seed from a Worker deployment.
import { createClient } from '@libsql/client'
import { assertNotRecoveryQuarantined } from '../db/recoveryQuarantine.js'
import { assertDatabaseReady } from '../db/schemaHealth.js'
import { assertSingleParishDeploymentData } from '../db/deploymentParishHealth.js'
import { getParishTimeZone } from '../utils/parishTimeZone.js'

const url = process.env.TURSO_URL
const authToken = process.env.TURSO_AUTH_TOKEN
const parishArgIndex = process.argv.indexOf('--parish')
const parishId = process.env.DEPLOYMENT_PARISH_ID || (parishArgIndex >= 0 ? process.argv[parishArgIndex + 1] : undefined)
if (!url?.startsWith('libsql://') || !authToken || !parishId) {
  throw new Error('TURSO_URL, TURSO_AUTH_TOKEN, and DEPLOYMENT_PARISH_ID are required')
}
getParishTimeZone()
const client = createClient({ url, authToken })
const checks: string[] = []
try {
  await assertNotRecoveryQuarantined(client)
  checks.push('recovery-quarantine-clear')
  await assertDatabaseReady(client)
  checks.push('schema-and-foreign-keys-ready')
  await assertSingleParishDeploymentData(client, parishId)
  checks.push('single-parish-data-scope')
  process.stdout.write(`${JSON.stringify({ ok: true, checks, checkedAt: new Date().toISOString() })}\n`)
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, checks, failedCheck: checks.length,
    errorClass: error instanceof Error ? error.name : 'UnknownError' })}\n`)
  process.exitCode = 1
} finally {
  client.close()
}
