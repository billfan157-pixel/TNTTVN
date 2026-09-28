// Snapshot volatile Render counters. These reset on restart/sleep and are not
// a substitute for 24-hour request logs or Cloudflare account quota data.
import { readFileSync } from 'node:fs'

const values = new Map(readFileSync(new URL('../../.render-env-paste.txt', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').split(/\r?\n/).map(line => {
    const separator = line.indexOf('=')
    return separator > 0 ? [line.slice(0, separator), line.slice(separator + 1)] : null
  }).filter(Boolean))
if (!values.get('OPS_TOKEN') || values.get('OPS_TOKEN').length < 32) throw new Error('Local OPS token unavailable')
const headers = { authorization: `Bearer ${values.get('OPS_TOKEN')}` }
const [healthResponse, metricsResponse] = await Promise.all([
  fetch('https://tnttvn.onrender.com/health', { signal: AbortSignal.timeout(60_000) }),
  fetch('https://tnttvn.onrender.com/metrics', { headers, signal: AbortSignal.timeout(60_000) }),
])
if (healthResponse.status !== 200 || metricsResponse.status !== 200) throw new Error('Production metrics unavailable')
const health = await healthResponse.json()
const metrics = await metricsResponse.text()
const requestCounts = metrics.split('\n').filter(line => line.startsWith('http_requests_total{'))
  .map(line => Number(line.match(/\s(\d+)$/)?.[1] || 0))
process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'render-volatile-counters-only',
  releaseId: health.releaseId, uptimeSeconds: health.uptimeSeconds,
  requestsSinceProcessStart: requestCounts.reduce((a, b) => a + b, 0),
  representativeOfFullDay: false })}\n`)
