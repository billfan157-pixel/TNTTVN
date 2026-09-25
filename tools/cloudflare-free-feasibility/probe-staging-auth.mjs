// One synthetic account in the disposable database exercises real Catevia
// login/session routes. Do not print the password, database token or JWTs.
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
const username = `cf-staging-${nonce}`
const userId = `CFP-${nonce}`
const password = `${randomBytes(20).toString('base64url')}Aa1!`
const hash = await bcrypt.hash(password, 12)
const observations = []

try {
  await db.execute({
    sql: `INSERT INTO users (id, username, password_hash, full_name, role, status, token_version, failed_attempts, must_change_password, parish_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`,
    args: [userId, username, hash, 'Synthetic Cloudflare Staging', 'phuta', 'ACTIVE', 'gia-ton', new Date().toISOString()],
  })

  const base = 'https://catevia-api-staging.billfan157.workers.dev'
  async function call(label, path, init) {
    const start = performance.now()
    let response
    try {
      response = await fetch(base + path, { ...init, signal: AbortSignal.timeout(35_000) })
    } catch (error) {
      observations.push({ label, status: 'transport-error', errorClass: error?.name || 'UnknownError', elapsedMs: Math.round(performance.now() - start) })
      return null
    }
    observations.push({ label, status: response.status, elapsedMs: Math.round(performance.now() - start) })
    return response
  }

  await call('invalid-existing-login', '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: `${password}wrong` }),
  })
  const afterFailure = await db.execute({ sql: 'SELECT failed_attempts FROM users WHERE parish_id = ? AND id = ?', args: ['gia-ton', userId] })
  observations.push({ label: 'failed-attempts-after-invalid', value: Number(afterFailure.rows[0]?.failed_attempts) })

  const login = await call('valid-login', '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (login?.status === 200) {
    const afterSuccess = await db.execute({ sql: 'SELECT failed_attempts FROM users WHERE parish_id = ? AND id = ?', args: ['gia-ton', userId] })
    observations.push({ label: 'failed-attempts-after-valid', value: Number(afterSuccess.rows[0]?.failed_attempts) })
    const body = await login.json()
    const accessToken = body?.data?.accessToken
    const setCookie = login.headers.get('set-cookie') || ''
    const cookie = setCookie.split(';')[0]
    observations.push({ label: 'login-artifacts', accessToken: Boolean(accessToken), refreshCookie: Boolean(cookie),
      httpOnly: /;\s*httponly/i.test(setCookie), secure: /;\s*secure/i.test(setCookie), sameSiteNone: /;\s*samesite=none/i.test(setCookie) })
    if (accessToken) {
      await call('authenticated-me', '/api/auth/me', { headers: { authorization: `Bearer ${accessToken}` } })
      await call('students-empty-list', '/api/students', { headers: { authorization: `Bearer ${accessToken}` } })
      await call('classes-empty-list', '/api/classes', { headers: { authorization: `Bearer ${accessToken}` } })
      await call('notifications-role-denied', '/api/notifications', { headers: { authorization: `Bearer ${accessToken}` } })
    }
    if (cookie) {
      const refresh = await call('refresh', '/api/auth/refresh', { method: 'POST', headers: { cookie } })
      const rotatedCookie = refresh?.headers.get('set-cookie')?.split(';')[0]
      observations.push({ label: 'refresh-rotation', rotatedCookie: Boolean(rotatedCookie && rotatedCookie !== cookie) })
      const logout = await call('logout', '/api/auth/logout', { method: 'POST', headers: { cookie: rotatedCookie || cookie } })
      if (logout?.status === 200) {
        const logoutBody = await logout.json()
        observations.push({ label: 'logout-revocation', serverConfirmed: Boolean(logoutBody?.data?.serverConfirmed), sessionRevoked: Boolean(logoutBody?.data?.sessionRevoked) })
      }
    }
  }
} finally {
  db.close()
  const artifact = { capturedAt: new Date().toISOString(), userType: 'synthetic-disposable-only', observations }
  writeFileSync(new URL('./results/2026-09-24-catevia-staging-auth.json', import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(artifact)}\n`)
}
