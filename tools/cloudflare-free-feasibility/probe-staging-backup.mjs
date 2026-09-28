// Guarded full-schema backup probe against disposable Turso and test R2 only.
// The OPS secret is never printed or placed in shell arguments.
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const values = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (!values.TURSO_URL?.includes('catevia-cloudflare-probe-20260924') || values.OPS_TOKEN?.length < 32) {
  throw new Error('Disposable database and staging OPS token required')
}

const start = performance.now()
let result
try {
  const response = await fetch('https://catevia-api-staging.billfan157.workers.dev/__staging/encrypted-backup-probe', {
    method: 'POST',
    headers: { authorization: `Bearer ${values.OPS_TOKEN}` },
    signal: AbortSignal.timeout(120_000),
  })
  const body = await response.json().catch(() => ({}))
  result = {
    status: response.status,
    elapsedMs: Math.round(performance.now() - start),
    ok: body.ok === true,
    ...(body.ok === true ? { rowCount: body.rowCount, objectKey: body.objectKey } : {}),
  }
} catch (error) {
  result = {
    status: 'transport-error',
    elapsedMs: Math.round(performance.now() - start),
    errorClass: error?.name || 'UnknownError',
    causeCode: error?.cause?.code,
  }
}
const artifact = { capturedAt: new Date().toISOString(), scope: 'disposable-turso-and-test-r2-only', result }
writeFileSync(new URL('./results/2026-09-24-catevia-staging-backup.json', import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(artifact)}\n`)
