import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import router from '../routes/tiniAttendanceImport.js'

const parishId = 'parish-tini-route-test'
const staffId = 'usr-tini-route-staff'
const adminId = 'usr-tini-route-admin'

beforeAll(async () => {
  await db.insert(users).values([
    { id: staffId, parishId, username: 'tini-route-staff', fullName: 'Staff',
      passwordHash: 'hash', role: 'chunhiem' },
    { id: adminId, parishId, username: 'tini-route-admin', fullName: 'Admin',
      passwordHash: 'hash', role: 'admin' },
  ]).onConflictDoNothing()
})

function token(id: string, role: 'admin' | 'chunhiem') {
  return generateTokens({ userId: id, username: id, role, parishId, tokenVersion: 1 }).accessToken
}

describe('TINI file-import HTTP authorization boundary', () => {
  it('rejects unauthenticated upload and identity review', async () => {
    expect((await router.request('/preview', { method: 'POST', body: '{}' })).status).toBe(401)
    expect((await router.request('/links')).status).toBe(401)
  })

  it('rejects a non-admin on preview, commit and mapping routes', async () => {
    const headers = { Authorization: `Bearer ${token(staffId, 'chunhiem')}`, 'Content-Type': 'application/json' }
    expect((await router.request('/preview', { method: 'POST', headers, body: '{}' })).status).toBe(403)
    expect((await router.request('/commit', { method: 'POST', headers, body: '{}' })).status).toBe(403)
    expect((await router.request('/links', { method: 'POST', headers, body: '{}' })).status).toBe(403)
    expect((await router.request('/links/bulk', { method: 'POST', headers, body: '{}' })).status).toBe(403)
  })

  it('rejects malformed source files even for an authenticated admin', async () => {
    const headers = { Authorization: `Bearer ${token(adminId, 'admin')}`, 'Content-Type': 'application/json' }
    const response = await router.request('/preview', { method: 'POST', headers,
      body: JSON.stringify({ sourceFile: '{"provider":"tini","credentials":"secret"}' }) })
    expect(response.status).toBe(400)
  })
})
