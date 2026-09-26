// Synthetic API mutation and idempotency workflow on disposable Turso only.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client/web'

const vars = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map(line => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (vars.TURSO_URL !== 'libsql://catevia-cloudflare-probe-20260924-billfan157-pixel.aws-us-east-1.turso.io'
  || !vars.TURSO_AUTH_TOKEN) throw new Error('Exact disposable Turso credential required')
const db = createClient({ url: vars.TURSO_URL, authToken: vars.TURSO_AUTH_TOKEN })
const nonce = randomBytes(7).toString('hex')
const branchId = `AuNhi-${nonce}`
const yearId = `2026-2027-${nonce}`
const username = `cf-write-${nonce}`
const password = `${randomBytes(20).toString('base64url')}Aa1!`
const origin = 'https://catevia-api-staging.billfan157.workers.dev'
const observations = []
let phase = 'setup'
async function request(label, path, method = 'GET', token, payload) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(45_000),
  })
  const body = await response.json().catch(() => ({}))
  observations.push({ label, status: response.status, code: body?.error?.code || null })
  return { response, body }
}
try {
  phase = 'insert-branch'
  await db.execute({
    sql: 'INSERT INTO branches (id, name, scarf_color, age_min, age_max, parish_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [branchId, 'Ấu Nhi', '#fff', 6, 10, 'gia-ton', new Date().toISOString(), new Date().toISOString()],
  })
  phase = 'insert-year'
  await db.execute({
    sql: 'INSERT INTO academic_years (id, start_date, end_date, parish_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [yearId, '2026-09-01', '2027-06-30', 'gia-ton', new Date().toISOString(), new Date().toISOString()],
  })
  phase = 'insert-user'
  await db.execute({
    sql: `INSERT INTO users (id, username, password_hash, full_name, role, status, token_version,
      failed_attempts, must_change_password, parish_id, created_at)
      VALUES (?, ?, ?, ?, 'admin', 'ACTIVE', 1, 0, 0, 'gia-ton', ?)`,
    args: [`CFW-${nonce}`, username, await bcrypt.hash(password, 12), 'Synthetic Write Admin', new Date().toISOString()],
  })
  phase = 'api-workflow'
  const login = await request('login', '/api/auth/login', 'POST', null, { username, password })
  const token = login.body?.data?.accessToken
  if (!token) throw new Error('Staging synthetic login failed')
  const classPayload = { code: `CF${nonce}`, name: 'Synthetic Class', branchId, academicYearId: yearId,
    idempotencyKey: `cf-class-${nonce}` }
  await request('unauthorized-create-class', '/api/classes', 'POST', null, classPayload)
  const createdClass = await request('create-class', '/api/classes', 'POST', token, classPayload)
  const classId = createdClass.body?.data?.id
  if (classId) {
    const replay = await request('replay-class', '/api/classes', 'POST', token, classPayload)
    observations.push({ label: 'class-idempotent', sameId: replay.body?.data?.id === classId })
    await request('conflicting-replay', '/api/classes', 'POST', token,
      { ...classPayload, name: 'Conflicting Class' })
    const studentPayload = { holyName: 'Giuse', fullName: 'Synthetic Student', gender: 'Nam',
      dateOfBirth: '2017-01-01', branch: 'AuNhi', classId, idempotencyKey: `cf-student-${nonce}` }
    const createdStudent = await request('create-student', '/api/students', 'POST', token, studentPayload)
    const studentId = createdStudent.body?.data?.id
    if (studentId) {
      await request('read-student', `/api/students/${studentId}`, 'GET', token)
      await request('update-student', `/api/students/${studentId}`, 'PUT', token, { notes: 'Synthetic update' })
      await request('delete-student', `/api/students/${studentId}`, 'DELETE', token)
    }
  }
} catch (error) {
  const detail = String(error?.message || '').replaceAll(nonce, '[fixture]')
    .replaceAll(vars.TURSO_AUTH_TOKEN, '[redacted]').replaceAll(password, '[redacted]').slice(0, 180)
  observations.push({ label: 'probe-error', phase, errorClass: error?.name || 'UnknownError', code: error?.code || null, detail })
} finally {
  db.close()
}
const status = Object.fromEntries(observations.filter(row => 'status' in row).map(row => [row.label, row.status]))
const passed = status.login === 200 && status['unauthorized-create-class'] === 401
  && status['create-class'] === 201 && status['replay-class'] === 201
  && status['conflicting-replay'] === 409 && status['create-student'] === 201
  && status['read-student'] === 200 && status['update-student'] === 200
  && status['delete-student'] === 200 && observations.some(row => row.label === 'class-idempotent' && row.sameId)
const artifact = { capturedAt: new Date().toISOString(), scope: 'disposable-turso-synthetic-api-mutations', passed, observations }
writeFileSync(new URL('./results/2026-09-24-catevia-staging-writes.json', import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(artifact)}\n`)
if (!passed) process.exitCode = 1
