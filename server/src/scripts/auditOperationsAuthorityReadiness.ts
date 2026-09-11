import { createHash } from 'node:crypto'
import { createClient } from '@libsql/client'
import { getDbConfig } from '../db/dbConfig.js'
import { auditOperationsAuthorityReadiness } from '../db/operationsAuthorityReadiness.js'
import { parishCalendarDate } from '../utils/parishTimeZone.js'

const configured = getDbConfig()
const auditUrl = process.env.AUDIT_DATABASE_URL
const url = auditUrl || configured.url
const authToken = auditUrl ? process.env.AUDIT_DATABASE_AUTH_TOKEN : configured.authToken
const client = createClient(authToken ? { url, authToken } : { url })

try {
  const manifest = await auditOperationsAuthorityReadiness(client, {
    today: parishCalendarDate(),
    includeParishId: process.env.OPERATIONS_AUTHORITY_INVENTORY_INCLUDE_PARISH_ID === 'true',
  })
  console.log(JSON.stringify({
    ...manifest,
    targetFingerprint: createHash('sha256').update(url).digest('hex').slice(0, 16),
  }, null, 2))
  if (manifest.requiresOperatorReview) process.exitCode = 1
} finally {
  client.close()
}
