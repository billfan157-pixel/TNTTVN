// Disposable-only recovery quarantine drill. Always remove the synthetic marker.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@libsql/client/web'

const vars = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map(line => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (vars.TURSO_URL !== 'libsql://catevia-cloudflare-probe-20260924-billfan157-pixel.aws-us-east-1.turso.io'
  || !vars.TURSO_AUTH_TOKEN || vars.OPS_TOKEN?.length < 32) {
  throw new Error('Exact disposable database and OPS token required')
}
const db = createClient({ url: vars.TURSO_URL, authToken: vars.TURSO_AUTH_TOKEN })
const origin = 'https://catevia-api-staging.billfan157.workers.dev'
const observations = {}
const marker = '__recovery_quarantine'
try {
  const existing = await db.execute({ sql: 'SELECT key FROM system_settings WHERE key = ?', args: [marker] })
  if (existing.rows.length) throw new Error('Quarantine marker already exists; refusing drill')
  await db.execute({
    sql: 'INSERT INTO system_settings (key, value, description, parish_id, updated_at) VALUES (?, ?, ?, ?, ?)',
    args: [marker, 'synthetic-probe', 'Disposable Worker quarantine drill', 'gia-ton', new Date().toISOString()],
  })
  observations.quarantinedAt = new Date().toISOString()
  const blocked = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(20_000) })
  observations.blockedHealthStatus = blocked.status
  await new Promise(resolve => setTimeout(resolve, 35_000))
  const status = await fetch(`${origin}/__staging/maintenance-probe?job=notification&mode=status`, {
    method: 'POST', headers: { authorization: `Bearer ${vars.OPS_TOKEN}` }, signal: AbortSignal.timeout(20_000),
  })
  observations.notificationAlarm = (await status.json()).result
} finally {
  await db.execute({ sql: 'DELETE FROM system_settings WHERE key = ? AND parish_id = ?', args: [marker, 'gia-ton'] })
  db.close()
}
const recovered = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(20_000) })
observations.recoveredHealthStatus = recovered.status
const passed = observations.blockedHealthStatus === 503 && observations.recoveredHealthStatus === 200
  && observations.notificationAlarm?.lastFailureAt >= observations.quarantinedAt
const artifact = { capturedAt: new Date().toISOString(), scope: 'disposable-turso-recovery-quarantine', passed, observations }
writeFileSync(new URL('./results/2026-09-24-catevia-staging-quarantine.json', import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(artifact)}\n`)
if (!passed) process.exitCode = 1
