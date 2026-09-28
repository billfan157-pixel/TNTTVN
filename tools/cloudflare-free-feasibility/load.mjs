import { performance } from 'node:perf_hooks'

const [baseUrl, scenario, rawCount, rawConcurrency] = process.argv.slice(2)
const secret = process.env.PROBE_TOKEN
const count = Number(rawCount)
const concurrency = Number(rawConcurrency)
const scenarios = {
  ping: { path: '/probe/ping', method: 'GET' },
  bcrypt: { path: '/probe/bcrypt', method: 'POST' },
  'catevia-password-adapter': { path: '/probe/catevia-password-adapter', method: 'POST' },
  'bcrypt-sharded': { path: '/probe/bcrypt-sharded', method: 'POST' },
  pbkdf2: { path: '/probe/pbkdf2', method: 'POST' },
  'apns-transport': { path: '/probe/apns-transport', method: 'POST' },
  pdf: { path: '/probe/pdf', method: 'POST' },
  'turso-read': { path: '/probe/turso-read', method: 'GET' },
  'turso-transaction': { path: '/probe/turso-transaction', method: 'POST' },
  r2: { path: '/probe/r2-roundtrip', method: 'POST' },
}

let base
try { base = new URL(baseUrl) } catch {}
const remoteProbe = base?.protocol === 'https:' &&
  base.hostname.split('.')[0] === 'catevia-free-feasibility' &&
  base.hostname.endsWith('.workers.dev')
const localProbe = process.env.PROBE_ALLOW_LOCAL === 'yes' &&
  base?.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port === '8793'
if (!base || (!remoteProbe && !localProbe) ||
    base.pathname !== '/' || base.search || base.hash ||
    !scenarios[scenario] ||
    !Number.isInteger(count) || count < 1 || count > 50 ||
    !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5 ||
    !secret || secret.length < 32) {
  console.error('Usage: PROBE_TOKEN=<secret> node load.mjs https://catevia-free-feasibility.<subdomain>.workers.dev ping|bcrypt|bcrypt-sharded|pbkdf2|apns-transport|pdf|turso-read|turso-transaction|r2 <count:1-50> <concurrency:1-5>')
  process.exitCode = 2
} else {
  const samples = new Array(count)
  let nextIndex = 0
  const run = async () => {
    while (nextIndex < count) {
      const index = nextIndex++
      const started = performance.now()
      try {
        const response = await fetch(new URL(scenarios[scenario].path, base), {
          method: scenarios[scenario].method,
          headers: {
            Authorization: `Bearer ${secret}`,
            ...(scenario === 'bcrypt-sharded' ? { 'X-Probe-Shard': `load-user-${index % 10}` } : {}),
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(scenario === 'pdf' ? 45_000 : 20_000),
        })
        const responseText = await response.text()
        let body = null
        try { body = JSON.parse(responseText) } catch {}
        samples[index] = {
          status: response.status,
          wallMs: Math.round((performance.now() - started) * 100) / 100,
          ...(!response.ok ? {
            cfRay: response.headers.get('cf-ray'),
            contentType: response.headers.get('content-type'),
            errorKind: body?.error ?? null,
            responsePrefix: responseText.slice(0, 200),
          } : {}),
          ...(scenario === 'pdf' ? { pdf: {
            pdfValid: body?.pdfValid,
            bytes: body?.bytes,
            scriptRan: body?.scriptRan,
            guardrailsBlocked: body?.guardrailsBlocked,
          } } : {}),
          ...(scenario === 'pbkdf2' && body?.error ? { errorKind: body.error, errorMessage: body.message } : {}),
          valid: response.ok && (
            scenario === 'ping' ? body?.alive === true :
            scenario === 'bcrypt' ? body?.matched === true && body?.bcryptCost === 12 :
            scenario === 'catevia-password-adapter' ? body?.valid === true && body?.rpcCalls === 3 :
            scenario === 'bcrypt-sharded' ? body?.matched === true && body?.bcryptCost === 12 :
            scenario === 'pbkdf2' ? body?.verified === true && body?.iterations === 600_000 :
            scenario === 'apns-transport' ? body?.reachedApns === true && body?.status >= 400 :
            scenario === 'pdf' ? body?.pdfValid === true && body?.scriptRan === false && body?.guardrailsBlocked === true :
            scenario === 'turso-read' ? body?.connected === true :
            scenario === 'r2' ? body?.verified === true && body?.deleted === true :
            body?.rollbackPreserved === true
          ),
        }
        if (process.env.PROBE_PROGRESS === 'yes') console.error(`probe ${index}: HTTP ${response.status}`)
      } catch (error) {
        samples[index] = {
          status: null,
          wallMs: Math.round((performance.now() - started) * 100) / 100,
          valid: false,
          error: error instanceof Error ? error.name : 'UnknownError',
          causeCode: error instanceof Error && typeof error.cause === 'object' && error.cause !== null && 'code' in error.cause
            ? String(error.cause.code).slice(0, 80) : null,
        }
        if (process.env.PROBE_PROGRESS === 'yes') console.error(`probe ${index}: ${samples[index].error} ${samples[index].causeCode ?? ''}`)
      }
    }
  }
  const beganAt = new Date().toISOString()
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, run))
  const endedAt = new Date().toISOString()
  const sorted = samples.map(s => s.wallMs).sort((a, b) => a - b)
  const quantile = q => sorted[Math.ceil(q * sorted.length) - 1]
  const statusCounts = Object.fromEntries(
    [...new Set(samples.map(s => String(s.status ?? s.error)))].map(status =>
      [status, samples.filter(s => String(s.status ?? s.error) === status).length]
    )
  )
  const report = {
    worker: base.hostname,
    scenario,
    beganAt,
    endedAt,
    count,
    concurrency,
    validCount: samples.filter(s => s.valid).length,
    statusCounts,
    firstRequestMs: samples[0].wallMs,
    minMs: sorted[0],
    p50Ms: quantile(0.5),
    p95Ms: quantile(0.95),
    maxMs: sorted.at(-1),
    samples,
  }
  console.log(JSON.stringify(report, null, 2))
  if (report.validCount !== count) process.exitCode = 1
}
