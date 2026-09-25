// Read only scheduling evidence from the disposable Worker and database.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@libsql/client/web'

const vars = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map(line => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (!vars.TURSO_URL?.includes('catevia-cloudflare-probe-20260924') || vars.OPS_TOKEN?.length < 32) {
  throw new Error('Disposable staging OPS credential required')
}
const kinds = ['notification', 'operation-reminders', 'operation-lifecycle', 'operation-dispatch',
  'manager-reminders', 'sunday-reminders', 'import-maintenance', 'receipt-maintenance', 'backup']
const mode = process.argv[2] === 'schedule' ? 'schedule' : 'status'
const results = []
for (const kind of kinds) {
  const response = await fetch(`https://catevia-api-staging.billfan157.workers.dev/__staging/maintenance-probe?job=${kind}&mode=${mode}`, {
    method: 'POST', headers: { authorization: `Bearer ${vars.OPS_TOKEN}` }, signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json().catch(() => ({}))
  results.push({ expectedKind: kind, httpStatus: response.status, ok: body.ok, responseJob: body.job,
    ...(body.result || {}) })
}
const db = createClient({ url: vars.TURSO_URL, authToken: vars.TURSO_AUTH_TOKEN })
let backupMarker = null
try {
  const row = await db.execute({ sql: 'SELECT value FROM system_settings WHERE parish_id = ? AND key = ?',
    args: ['gia-ton', 'auto_backup_last_date'] })
  backupMarker = row.rows[0]?.value || null
} finally {
  db.close()
}
const artifact = { capturedAt: new Date().toISOString(), scope: 'disposable-staging-cron-and-alarms', mode, backupMarker, results }
writeFileSync(new URL('./results/2026-09-24-catevia-staging-schedule.json', import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(artifact)}\n`)
