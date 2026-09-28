// A synthetic durable outbox row tests Worker recovery without a real push provider.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client/web'

const vars = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (!vars.TURSO_URL?.includes('catevia-cloudflare-probe-20260924') || !vars.TURSO_AUTH_TOKEN || vars.OPS_TOKEN?.length < 32) {
  throw new Error('Disposable database and staging OPS credentials required')
}
const db = createClient({ url: vars.TURSO_URL, authToken: vars.TURSO_AUTH_TOKEN })
const nonce = randomBytes(8).toString('hex')
const userId = `CFP-${nonce}`
const notificationId = `CFN-${nonce}`
const observations = []
try {
  await db.execute({
    sql: `INSERT INTO users (id, username, password_hash, full_name, role, status, token_version, failed_attempts, must_change_password, parish_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`,
    args: [userId, `cf-push-${nonce}`, await bcrypt.hash(randomBytes(16).toString('base64url'), 4), 'Synthetic Push Target', 'phuta', 'ACTIVE', 'gia-ton', new Date().toISOString()],
  })
  await db.execute({
    sql: `INSERT INTO notifications (id, type, channel, delivery_kind, status, recipient, message, triggered_by_type,
      target_user_ids, attempt_count, max_attempts, parish_id, created_at)
      VALUES (?, 'web_push', 'reminder', 'reminder', 'retrying', 'Synthetic', 'Synthetic notification only', 'system', ?, 0, 1, 'gia-ton', ?)`,
    args: [notificationId, JSON.stringify([userId]), new Date().toISOString()],
  })
  for (let cycle = 1; cycle <= 2; cycle++) {
    const response = await fetch('https://catevia-api-staging.billfan157.workers.dev/__staging/maintenance-probe?job=notification', {
      method: 'POST', headers: { authorization: `Bearer ${vars.OPS_TOKEN}` }, signal: AbortSignal.timeout(35_000),
    })
    const row = await db.execute({
      sql: 'SELECT status, error, attempt_count, lease_owner FROM notifications WHERE parish_id = ? AND id = ?', args: ['gia-ton', notificationId],
    })
    observations.push({ cycle, httpStatus: response.status, status: String(row.rows[0]?.status),
      errorCode: String(row.rows[0]?.error), attemptCount: Number(row.rows[0]?.attempt_count),
      leaseCleared: row.rows[0]?.lease_owner === null })
  }
  const passed = observations.every(item => item.httpStatus === 200 && item.status === 'failed'
    && item.errorCode === 'PUSH_PROVIDER_NOT_CONFIGURED' && item.attemptCount === 1 && item.leaseCleared)
  const result = { capturedAt: new Date().toISOString(), scope: 'disposable-turso-no-provider-no-real-delivery', observations, passed }
  writeFileSync(new URL('./results/2026-09-24-catevia-staging-notification-recovery.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result)}\n`)
} finally {
  db.close()
}
