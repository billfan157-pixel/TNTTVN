import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { and, eq, inArray } from 'drizzle-orm'
import authRouter from '../routes/auth.js'
import passwordResetRequestsRouter from '../routes/passwordResetRequests.js'
import verificationRouter from '../routes/verification.js'
import { db } from '../db/index.js'
import { passwordResetRequests, refreshTokens, users } from '../db/schema.js'
import { assertSingleParishDeploymentData } from '../db/deploymentParishHealth.js'
import {
  assertDeploymentParishConfiguration,
  assertDeploymentParishScope,
  getDeploymentParishId,
  getEnforcedDeploymentParishId,
  resolvePublicParishId,
} from '../utils/deploymentParish.js'
import { generateTokens } from '../middleware/auth.js'
import { signReportPayload } from '../utils/hmacSigner.js'

const PARISH = 'single-parish-deployment'
const FOREIGN = 'single-parish-foreign'
const USER_ID = 'single-parish-user'
const FOREIGN_USER_ID = 'single-parish-foreign-user'
const PHONE = '0904555666'
const PASSWORD = 'SingleParish@456'
const FOREIGN_PASSWORD = 'ForeignParish@456'

const app = new Hono()
app.route('/api/auth', authRouter)
app.route('/api/password-reset-requests', passwordResetRequestsRouter)
app.route('/api/verification', verificationRouter)

describe('single-parish deployment boundary', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: USER_ID, parishId: PARISH, username: 'same-login', fullName: 'Configured parent', phone: PHONE, role: 'phuhuynh', status: 'ACTIVE', mustChangePassword: 0, passwordHash: await bcrypt.hash(PASSWORD, 4) },
      { id: FOREIGN_USER_ID, parishId: FOREIGN, username: 'same-login', fullName: 'Foreign parent', phone: PHONE, role: 'phuhuynh', status: 'ACTIVE', mustChangePassword: 0, passwordHash: await bcrypt.hash(FOREIGN_PASSWORD, 4) },
    ]).onConflictDoNothing()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await db.delete(passwordResetRequests).where(and(eq(passwordResetRequests.userId, USER_ID), eq(passwordResetRequests.parishId, PARISH)))
    await db.delete(refreshTokens).where(and(inArray(refreshTokens.userId, [USER_ID, FOREIGN_USER_ID]), inArray(refreshTokens.parishId, [PARISH, FOREIGN])))
    await db.delete(users).where(and(inArray(users.id, [USER_ID, FOREIGN_USER_ID]), inArray(users.parishId, [PARISH, FOREIGN])))
  })

  it('requires a valid deployment parish in production but preserves dev/test isolation fixtures', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEPLOYMENT_PARISH_ID', '')
    expect(() => getDeploymentParishId()).toThrow(/required in production/)

    vi.stubEnv('NODE_ENV', 'test')
    expect(getEnforcedDeploymentParishId()).toBeNull()
    expect(resolvePublicParishId(FOREIGN)).toBe(FOREIGN)

    vi.stubEnv('DEPLOYMENT_PARISH_ID', 'invalid parish/id')
    expect(() => getDeploymentParishId()).toThrow(/1-64 character slug/)
  })

  it('rejects conflicting legacy configuration and internal foreign-parish work', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DEPLOYMENT_PARISH_ID', PARISH)
    vi.stubEnv('PARISH_ID', FOREIGN)
    expect(() => assertDeploymentParishConfiguration()).toThrow(/PARISH_ID must match/)

    vi.stubEnv('PARISH_ID', PARISH)
    vi.stubEnv('SUPER_ADMIN_PARISH_ID', FOREIGN)
    expect(() => assertDeploymentParishConfiguration()).toThrow(/SUPER_ADMIN_PARISH_ID must match/)

    expect(() => assertDeploymentParishScope(FOREIGN)).toThrow(/outside this deployment scope/)
    expect(() => assertDeploymentParishScope(PARISH)).not.toThrow()
  })

  it('ignores the legacy login parish selector and authenticates only the configured parish', async () => {
    vi.stubEnv('DEPLOYMENT_PARISH_ID', PARISH)
    const foreignPassword = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'same-login', password: FOREIGN_PASSWORD, parishId: FOREIGN }),
    })
    expect(foreignPassword.status).toBe(401)

    const configuredPassword = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'same-login', password: PASSWORD, parishId: FOREIGN }),
    })
    expect(configuredPassword.status).toBe(200)
    expect(await configuredPassword.json()).toMatchObject({ data: { user: { id: USER_ID, parishId: PARISH } } })
  })

  it('rejects an already-issued token from a different parish', async () => {
    const foreignToken = generateTokens({ userId: FOREIGN_USER_ID, username: 'same-login', role: 'phuhuynh', parishId: FOREIGN, tokenVersion: 1 }).accessToken
    vi.stubEnv('DEPLOYMENT_PARISH_ID', PARISH)
    const response = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${foreignToken}` } })
    expect(response.status).toBe(401)
  })

  it('routes a public reset request to configured parish even when legacy body requests another', async () => {
    vi.stubEnv('DEPLOYMENT_PARISH_ID', PARISH)
    const response = await app.request('/api/password-reset-requests', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: PHONE, parishId: FOREIGN }),
    })
    expect(response.status).toBe(202)
    expect(await db.select().from(passwordResetRequests).where(and(eq(passwordResetRequests.userId, USER_ID), eq(passwordResetRequests.parishId, PARISH)))).toHaveLength(1)
    expect(await db.select().from(passwordResetRequests).where(and(eq(passwordResetRequests.userId, FOREIGN_USER_ID), eq(passwordResetRequests.parishId, FOREIGN)))).toHaveLength(0)
  })

  it('rejects a validly signed public QR from another deployment parish', async () => {
    const query = new URLSearchParams({
      parishId: FOREIGN,
      studentId: 'foreign-child',
      academicYear: '2026-2027',
      certId: 'foreign-cert',
      sig: signReportPayload(FOREIGN, 'foreign-child', '2026-2027', 'foreign-cert'),
    })
    vi.stubEnv('DEPLOYMENT_PARISH_ID', PARISH)
    const response = await app.request(`/api/verification/verify?${query}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { verified: false } })
  })

  it('preflight accepts one parish and reports tables containing another without exposing row data', async () => {
    const accepted = createClient({ url: ':memory:' })
    try {
      await accepted.execute('CREATE TABLE scoped_a (id TEXT PRIMARY KEY, parish_id TEXT NOT NULL)')
      await accepted.execute('CREATE TABLE unscoped (id TEXT PRIMARY KEY)')
      await accepted.execute({ sql: 'INSERT INTO scoped_a (id, parish_id) VALUES (?, ?)', args: ['ok', PARISH] })
      await expect(assertSingleParishDeploymentData(accepted, PARISH)).resolves.toBeUndefined()
    } finally {
      accepted.close()
    }

    const rejected = createClient({ url: ':memory:' })
    try {
      await rejected.execute('CREATE TABLE scoped_a (id TEXT PRIMARY KEY, parish_id TEXT NOT NULL)')
      await rejected.execute({ sql: 'INSERT INTO scoped_a (id, parish_id) VALUES (?, ?)', args: ['foreign', FOREIGN] })
      await expect(assertSingleParishDeploymentData(rejected, PARISH)).rejects.toThrow(/unexpected parish scope in tables: scoped_a/)
    } finally {
      rejected.close()
    }
  })

  it('checks all scoped tables with two database statements', async () => {
    const client = createClient({ url: ':memory:' })
    try {
      await client.execute('CREATE TABLE scoped_a (id TEXT PRIMARY KEY, parish_id TEXT)')
      await client.execute('CREATE TABLE scoped_b (id TEXT PRIMARY KEY, parish_id TEXT)')
      await client.execute('CREATE TABLE unscoped (id TEXT PRIMARY KEY)')
      await client.execute({ sql: 'INSERT INTO scoped_a VALUES (?, ?)', args: ['a', PARISH] })
      await client.execute({ sql: 'INSERT INTO scoped_b VALUES (?, ?)', args: ['b', null] })
      let statements = 0
      const countedClient = {
        transaction: async () => {
          const tx = await client.transaction('read')
          return new Proxy(tx, {
            get(target, key) {
              const value = Reflect.get(target, key)
              if (key === 'execute') return (...args: unknown[]) => {
                statements++
                return (value as (...args: unknown[]) => unknown).apply(target, args)
              }
              return typeof value === 'function' ? value.bind(target) : value
            },
          })
        },
      } as unknown as Parameters<typeof assertSingleParishDeploymentData>[0]

      await expect(assertSingleParishDeploymentData(countedClient, PARISH))
        .rejects.toThrow(/unexpected parish scope in tables: scoped_b/)
      expect(statements).toBe(2)
    } finally {
      client.close()
    }
  })
})
