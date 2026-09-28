// Manual, protected maintenance invocations on disposable staging only.
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const vars = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (!vars.TURSO_URL?.includes('catevia-cloudflare-probe-20260924') || vars.OPS_TOKEN?.length < 32) {
  throw new Error('Disposable staging OPS credential required')
}
const jobs = ['notification', 'operation-reminders', 'operation-lifecycle', 'operation-dispatch',
  'manager-reminders', 'sunday-reminders', 'import-maintenance', 'receipt-maintenance']
const observations = []
for (const job of jobs) {
  const start = performance.now()
  try {
    const response = await fetch(`https://catevia-api-staging.billfan157.workers.dev/__staging/maintenance-probe?job=${job}`, {
      method: 'POST', headers: { authorization: `Bearer ${vars.OPS_TOKEN}` }, signal: AbortSignal.timeout(45_000),
    })
    const body = await response.json().catch(() => ({}))
    const numeric = Object.fromEntries(Object.entries(body.result || {}).filter(([, value]) => typeof value === 'number' || typeof value === 'boolean'))
    observations.push({ job, status: response.status, ok: body.ok === true, elapsedMs: Math.round(performance.now() - start), numeric })
  } catch (error) {
    observations.push({ job, status: 'transport-error', errorClass: error?.name || 'UnknownError', elapsedMs: Math.round(performance.now() - start) })
  }
}
const result = { capturedAt: new Date().toISOString(), scope: 'disposable-turso-manual-jobs-only', observations }
writeFileSync(new URL('./results/2026-09-24-catevia-staging-maintenance.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(result)}\n`)
