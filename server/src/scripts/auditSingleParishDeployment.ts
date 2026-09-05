import { createHash } from 'node:crypto'
import { createClient } from '@libsql/client'
import { getDbConfig } from '../db/dbConfig.js'
import { assertSingleParishDeploymentData } from '../db/deploymentParishHealth.js'
import { getDeploymentParishId } from '../utils/deploymentParish.js'

const configured = getDbConfig()
const auditUrl = process.env.AUDIT_DATABASE_URL
const url = auditUrl || configured.url
// Never forward a production/default credential to a separately named audit DB.
const authToken = auditUrl ? process.env.AUDIT_DATABASE_AUTH_TOKEN : configured.authToken
const includeParishId = process.env.DEPLOYMENT_INVENTORY_INCLUDE_PARISH_ID === 'true'
const parishId = getDeploymentParishId()
const client = createClient(authToken ? { url, authToken } : { url })

function fingerprint(value: string, length: number): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length)
}

try {
  await assertSingleParishDeploymentData(client, parishId)
  console.log(JSON.stringify({
    status: 'single_parish_preflight_passed',
    targetFingerprint: fingerprint(url, 16),
    deploymentParish: includeParishId ? parishId : `sha256:${fingerprint(parishId, 12)}`,
    parishIdentifier: includeParishId ? 'plain_explicit_opt_in' : 'sha256_truncated',
  }, null, 2))
} catch (error) {
  const reason = error instanceof Error ? error.message : 'Single-parish deployment preflight failed'
  console.error(JSON.stringify({
    status: 'single_parish_preflight_failed',
    targetFingerprint: fingerprint(url, 16),
    deploymentParish: includeParishId ? parishId : `sha256:${fingerprint(parishId, 12)}`,
    parishIdentifier: includeParishId ? 'plain_explicit_opt_in' : 'sha256_truncated',
    reason,
  }, null, 2))
  process.exitCode = 1
} finally {
  client.close()
}
