import { describe, it, expect, beforeAll } from 'vitest'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import operationsRouter from '../routes/operations.js'

// Guards the composition-root wiring at operations.ts:44-45
// (authMiddleware + roleMiddleware('admin','chunhiem','phuta')).
// A role-list edit here must turn this file red before any E2E run.
const PREFIX = Date.now()
const parish = `ops-guard-${PREFIX}`

const adminToken = generateTokens({ userId: `guard-adm-${PREFIX}`, username: `guard_adm_${PREFIX}`, role: 'admin', parishId: parish }).accessToken
const parentToken = generateTokens({ userId: `guard-par-${PREFIX}`, username: `guard_par_${PREFIX}`, role: 'phuhuynh', parishId: parish }).accessToken

describe('Operations router guard (auth + staff roles)', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: `guard-adm-${PREFIX}`, username: `guard_adm_${PREFIX}`, fullName: 'Guard Admin', passwordHash: 'hash', role: 'admin', parishId: parish },
      { id: `guard-par-${PREFIX}`, username: `guard_par_${PREFIX}`, fullName: 'Guard Parent', passwordHash: 'hash', role: 'phuhuynh', parishId: parish },
    ]).onConflictDoNothing()
  })

  it('rejects requests without a token with 401', async () => {
    const response = await operationsRouter.request('/events', { method: 'GET' })
    expect(response.status).toBe(401)
  })

  it('rejects requests with an invalid token with 401', async () => {
    const response = await operationsRouter.request('/events', {
      method: 'GET',
      headers: { Authorization: 'Bearer not-a-real-token' },
    })
    expect(response.status).toBe(401)
  })

  it('rejects the phuhuynh role with 403 on reads', async () => {
    const response = await operationsRouter.request('/events', {
      method: 'GET',
      headers: { Authorization: `Bearer ${parentToken}` },
    })
    expect(response.status).toBe(403)
  })

  it('rejects the phuhuynh role with 403 on writes before validation runs', async () => {
    const response = await operationsRouter.request('/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${parentToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(403)
  })

  it('lets staff baseline traffic through the guard', async () => {
    const response = await operationsRouter.request('/events?page=1&limit=1', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(response.status).toBe(200)
  })
})
