import { createHash } from 'node:crypto'
import { createClient, type Transaction } from '@libsql/client'
import { getDbConfig } from '../db/dbConfig.js'

const SETTINGS_KEY = 'parish_system_settings'
const configured = getDbConfig()
const auditUrl = process.env.AUDIT_DATABASE_URL
const url = auditUrl || configured.url
// Never forward the default database credential to an explicitly different
// audit endpoint. A local file audit may intentionally omit a token.
const authToken = auditUrl ? process.env.AUDIT_DATABASE_AUTH_TOKEN : configured.authToken
const includeParishId = process.env.SUNDAY_READINESS_INCLUDE_PARISH_ID === 'true'
const client = createClient(authToken ? { url, authToken } : { url })

function parishReference(parishId: string): string {
  if (includeParishId) return parishId
  return `sha256:${createHash('sha256').update(parishId).digest('hex').slice(0, 12)}`
}

async function count(tx: Transaction, sql: string, parishId: string): Promise<number> {
  const result = await tx.execute({ sql, args: [parishId] })
  return Number(result.rows[0]?.count ?? 0)
}

try {
  const tx = await client.transaction('read')
  try {
    const settingsRows = await tx.execute({
      sql: 'SELECT parish_id, value FROM system_settings WHERE key = ? ORDER BY parish_id',
      args: [SETTINGS_KEY],
    })
    const parishes = []
    for (const row of settingsRows.rows) {
      const parishId = String(row.parish_id)
      let settings: Record<string, unknown>
      try {
        const parsed = JSON.parse(String(row.value))
        settings = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        settings = {}
      }
      if (settings.sundayReminderEnabled !== true) continue

      const parentRecipients = await count(tx, `
        SELECT COUNT(DISTINCT id) AS count FROM users
        WHERE parish_id = ? AND role = 'phuhuynh' AND status = 'ACTIVE' AND deleted_at IS NULL
      `, parishId)
      const webPushSubscriptions = await count(tx, `
        SELECT COUNT(DISTINCT ps.id) AS count
        FROM push_subscriptions ps
        JOIN users u ON u.parish_id = ps.parish_id AND u.id = ps.user_id
        WHERE ps.parish_id = ? AND u.role = 'phuhuynh' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
      `, parishId)
      const nativePushTokens = await count(tx, `
        SELECT COUNT(DISTINCT n.id) AS count
        FROM native_push_tokens n
        JOIN users u ON u.parish_id = n.parish_id AND u.id = n.user_id
        WHERE n.parish_id = ? AND u.role = 'phuhuynh' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
      `, parishId)
      parishes.push({
        parishRef: parishReference(parishId),
        sundayMassTime: typeof settings.sundayMassTime === 'string' ? settings.sundayMassTime : '08:00',
        parentRecipients,
        deliveryEndpoints: { webPushSubscriptions, nativePushTokens },
        hasAnyDeliveryEndpoint: webPushSubscriptions + nativePushTokens > 0,
      })
    }
    await tx.commit()

    console.log(JSON.stringify({
      status: 'read_only_readiness_complete',
      targetFingerprint: createHash('sha256').update(url).digest('hex').slice(0, 16),
      parishIdentifiers: includeParishId ? 'plain_explicit_opt_in' : 'sha256_truncated',
      providerConfiguration: {
        webPush: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
        android: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
        ios: Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY),
      },
      enabledParishCount: parishes.length,
      parishes,
    }, null, 2))
  } catch (error) {
    try { await tx.rollback() } catch { /* read transaction may already be closed */ }
    throw error
  }
} finally {
  client.close()
}
