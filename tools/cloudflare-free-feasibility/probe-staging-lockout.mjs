// Parallel wrong-password attempts against one synthetic non-admin account.
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
const db = createClient({ url: vars.TURSO_URL, authToken: vars.TURSO_AUTH_TOKEN })
const nonce = randomBytes(8).toString('hex')
const id = `CFP-${nonce}`
const username = `cf-lockout-${nonce}`
const password = `${randomBytes(20).toString('base64url')}Aa1!`
const samples = []
try {
  await db.execute({
    sql: `INSERT INTO users (id, username, password_hash, full_name, role, status, token_version, failed_attempts, must_change_password, parish_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`,
    args: [id, username, await bcrypt.hash(password, 12), 'Synthetic Lockout User', 'phuta', 'ACTIVE', 'gia-ton', new Date().toISOString()],
  })
  await Promise.all(Array.from({ length: 5 }, async () => {
    const start = performance.now()
    try {
      const response = await fetch('https://catevia-api-staging.billfan157.workers.dev/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: `${password}wrong` }), signal: AbortSignal.timeout(35_000),
      })
      samples.push({ status: response.status, elapsedMs: Math.round(performance.now() - start) })
    } catch (error) {
      samples.push({ status: 'transport-error', errorClass: error?.name || 'UnknownError', elapsedMs: Math.round(performance.now() - start) })
    }
  }))
  const row = await db.execute({
    sql: 'SELECT status, failed_attempts, token_version FROM users WHERE parish_id = ? AND id = ?', args: ['gia-ton', id],
  })
  const user = row.rows[0]
  const result = {
    capturedAt: new Date().toISOString(), scope: 'disposable-turso-synthetic-user-only',
    concurrency: 5, statusCounts: Object.fromEntries([...new Set(samples.map(sample => String(sample.status)))].map(status => [status, samples.filter(sample => String(sample.status) === status).length])),
    userStatus: String(user?.status), failedAttempts: Number(user?.failed_attempts), tokenVersion: Number(user?.token_version),
    elapsedMs: samples.map(sample => sample.elapsedMs),
    passed: samples.length === 5 && samples.every(sample => sample.status === 401)
      && user?.status === 'LOCKED' && Number(user.failed_attempts) === 5 && Number(user.token_version) === 2,
  }
  writeFileSync(new URL('./results/2026-09-24-catevia-staging-lockout.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result)}\n`)
} finally {
  db.close()
}
