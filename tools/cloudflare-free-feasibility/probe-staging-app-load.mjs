// Bounded real-route load against the disposable staging database only.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client/web'

const vars = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (!vars.TURSO_URL?.includes('catevia-cloudflare-probe-20260924') || !vars.TURSO_AUTH_TOKEN) {
  throw new Error('Disposable database credential required')
}
const mode = process.argv[2] === 'direct' ? 'direct-worker' : 'durable-object-shard'
if (mode === 'direct-worker' && vars.OPS_TOKEN?.length < 32) {
  throw new Error('Disposable staging OPS credential required for direct mode')
}
const withDirectProbe = (headers) => {
  if (mode !== 'direct-worker') return headers
  const authorization = headers.authorization
  return {
    ...headers,
    authorization: authorization
      ? `${authorization}; CateviaDirect ${vars.OPS_TOKEN}`
      : `CateviaDirect ${vars.OPS_TOKEN}`,
  }
}
const db = createClient({ url: vars.TURSO_URL, authToken: vars.TURSO_AUTH_TOKEN })
const nonce = randomBytes(8).toString('hex')
const username = `cf-load-${nonce}`
const password = `${randomBytes(20).toString('base64url')}Aa1!`
const origin = 'https://catevia-api-staging.billfan157.workers.dev'
const samples = []

try {
  await db.execute({
    sql: `INSERT INTO users (id, username, password_hash, full_name, role, status, token_version, failed_attempts, must_change_password, parish_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`,
    args: [`CFP-${nonce}`, username, await bcrypt.hash(password, 12), 'Synthetic Load User', 'phuta', 'ACTIVE', 'gia-ton', new Date().toISOString()],
  })
  const login = await fetch(`${origin}/api/auth/login`, {
    method: 'POST', headers: withDirectProbe({ 'content-type': 'application/json' }),
    body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(35_000),
  })
  if (login.status !== 200) throw new Error(`Staging login failed: ${login.status}`)
  const token = (await login.json())?.data?.accessToken
  if (!token) throw new Error('Staging login returned no access token')
  const paths = ['/api/auth/me', '/api/students', '/api/classes']
  let index = 0
  async function worker() {
    while (index < 30) {
      const current = index++
      const path = paths[current % paths.length]
      const start = performance.now()
      try {
        const response = await fetch(`${origin}${path}`, {
          headers: withDirectProbe({ authorization: `Bearer ${token}` }), signal: AbortSignal.timeout(35_000),
        })
        samples.push({ path, status: response.status, elapsedMs: Math.round(performance.now() - start) })
      } catch (error) {
        samples.push({ path, status: 'transport-error', errorClass: error?.name || 'UnknownError', elapsedMs: Math.round(performance.now() - start) })
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker))
  const times = samples.map(sample => sample.elapsedMs).sort((a, b) => a - b)
  const result = {
    capturedAt: new Date().toISOString(), scope: 'disposable-turso-real-hono-routes', mode,
    count: samples.length, concurrency: 5,
    statusCounts: Object.fromEntries([...new Set(samples.map(sample => String(sample.status)))].map(status => [status, samples.filter(sample => String(sample.status) === status).length])),
    p50Ms: times[Math.ceil(times.length * 0.5) - 1], p95Ms: times[Math.ceil(times.length * 0.95) - 1], maxMs: times.at(-1),
    samples,
  }
  const artifactName = mode === 'direct-worker'
    ? '2026-09-24-catevia-staging-app-load-direct.json'
    : '2026-09-24-catevia-staging-app-load-shard-repeat.json'
  writeFileSync(new URL(`./results/${artifactName}`, import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ count: result.count, concurrency: result.concurrency, statusCounts: result.statusCounts, p50Ms: result.p50Ms, p95Ms: result.p95Ms, maxMs: result.maxMs })}\n`)
} finally {
  db.close()
}
