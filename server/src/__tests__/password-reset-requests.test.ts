import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import passwordResetRequestsApp from '../routes/passwordResetRequests.js'
import { db } from '../db/index.js'
import { auditLogs, passwordResetRequests, refreshTokens, users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const parishId = `password-request-${suffix}`
const otherParishId = `password-request-other-${suffix}`
const adminId = `password-admin-${suffix}`
const parentId = `password-parent-${suffix}`
const otherParentId = `password-other-parent-${suffix}`
const adminPassword = 'Admin@Test123'
const oldParentPassword = 'Parent@Test123'

function adminHeaders(targetParish = parishId) {
  const { accessToken } = generateTokens({
    userId: adminId,
    username: adminId,
    role: 'admin',
    parishId: targetParish,
    tokenVersion: 1,
  })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

describe('parent password reset request workflow', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      {
        id: adminId,
        username: adminId,
        passwordHash: await bcrypt.hash(adminPassword, 4),
        fullName: 'Admin xử lý mật khẩu',
        role: 'admin',
        parishId,
        status: 'ACTIVE',
        mustChangePassword: 0,
        tokenVersion: 1,
      },
      {
        id: parentId,
        username: '0901234567',
        phone: '0901234567',
        passwordHash: await bcrypt.hash(oldParentPassword, 4),
        fullName: 'Phụ huynh cần hỗ trợ',
        role: 'phuhuynh',
        parishId,
        status: 'ACTIVE',
        mustChangePassword: 0,
        tokenVersion: 1,
      },
      {
        id: otherParentId,
        username: '0907654321',
        phone: '0907654321',
        passwordHash: await bcrypt.hash(oldParentPassword, 4),
        fullName: 'Phụ huynh giáo xứ khác',
        role: 'phuhuynh',
        parishId: otherParishId,
        status: 'ACTIVE',
        mustChangePassword: 0,
        tokenVersion: 1,
      },
    ])
    await db.insert(refreshTokens).values({
      id: `refresh-${suffix}`,
      userId: parentId,
      parishId,
      tokenHash: `hash-${suffix}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
  })

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
    await db.delete(passwordResetRequests).where(eq(passwordResetRequests.parishId, parishId))
    await db.delete(passwordResetRequests).where(eq(passwordResetRequests.parishId, otherParishId))
    await db.delete(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, otherParishId))
  })

  it('returns the same accepted response for existing and unknown phone numbers', async () => {
    const existing = await passwordResetRequestsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0901234567', parishId }),
    })
    const unknown = await passwordResetRequestsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0999999999', parishId }),
    })

    expect(existing.status).toBe(202)
    expect(unknown.status).toBe(202)
    expect(await existing.json()).toEqual(await unknown.json())

    const stored = await db.select().from(passwordResetRequests).where(and(
      eq(passwordResetRequests.parishId, parishId),
      eq(passwordResetRequests.userId, parentId),
    ))
    expect(stored).toHaveLength(1)
  })

  it('deduplicates repeated submissions into one pending request', async () => {
    const response = await passwordResetRequestsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0901234567', parishId }),
    })
    expect(response.status).toBe(202)

    const stored = await db.select().from(passwordResetRequests).where(and(
      eq(passwordResetRequests.parishId, parishId),
      eq(passwordResetRequests.userId, parentId),
    ))
    expect(stored).toHaveLength(1)
    expect(stored[0].requestCount).toBe(2)
    expect(stored[0].status).toBe('PENDING')
  })

  it('requires an authenticated admin and keeps the inbox tenant-scoped', async () => {
    expect((await passwordResetRequestsApp.request('/admin')).status).toBe(401)

    const response = await passwordResetRequestsApp.request('/admin', { headers: adminHeaders() })
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ userId: parentId, phone: '0901234567', requestCount: 2 })

    const foreignToken = generateTokens({
      userId: adminId,
      username: adminId,
      role: 'admin',
      parishId: otherParishId,
      tokenVersion: 1,
    }).accessToken
    expect((await passwordResetRequestsApp.request('/admin', { headers: { Authorization: `Bearer ${foreignToken}` } })).status).toBe(401)
  })

  it('rejects bad admin re-auth without changing parent credentials', async () => {
    const [request] = await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.userId, parentId))
    const response = await passwordResetRequestsApp.request(`/admin/${request.id}/reset`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ adminPassword: 'Wrong@Test123' }),
    })
    expect(response.status).toBe(401)

    const [parent] = await db.select().from(users).where(and(eq(users.id, parentId), eq(users.parishId, parishId)))
    expect(await bcrypt.compare(oldParentPassword, parent.passwordHash)).toBe(true)
    expect(parent.status).toBe('ACTIVE')
  })

  it('atomically resets the password, revokes sessions and resolves the request', async () => {
    const [request] = await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.userId, parentId))
    const response = await passwordResetRequestsApp.request(`/admin/${request.id}/reset`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ adminPassword }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.data.tempPassword).toMatch(/^Reset@\d{6}$/)

    const [parent] = await db.select().from(users).where(and(eq(users.id, parentId), eq(users.parishId, parishId)))
    expect(await bcrypt.compare(body.data.tempPassword, parent.passwordHash)).toBe(true)
    expect(parent.passwordEncrypted).toBeNull()
    expect(parent.status).toBe('FORCE_PASSWORD_CHANGE')
    expect(parent.mustChangePassword).toBe(1)
    expect(parent.tokenVersion).toBe(2)

    const [resolved] = await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.id, request.id))
    expect(resolved.status).toBe('RESOLVED')
    expect(resolved.resolvedBy).toBe(adminId)
    expect(resolved.resolvedAt).toBeTruthy()

    const sessions = await db.select().from(refreshTokens).where(and(eq(refreshTokens.userId, parentId), eq(refreshTokens.parishId, parishId)))
    expect(sessions.every((session) => Boolean(session.revokedAt))).toBe(true)

    const audit = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.action, 'RESET_PASSWORD'),
      eq(auditLogs.entityId, parentId),
    ))
    expect(audit.some((row) => row.newValue?.includes(request.id))).toBe(true)

    const retry = await passwordResetRequestsApp.request(`/admin/${request.id}/reset`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ adminPassword }),
    })
    expect(retry.status).toBe(409)
  })

  it('allows only one successful reset when two admins process the same ticket concurrently', async () => {
    const reopened = await passwordResetRequestsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0901234567', parishId }),
    })
    expect(reopened.status).toBe(202)
    const [request] = await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.userId, parentId))

    const responses = await Promise.all([
      passwordResetRequestsApp.request(`/admin/${request.id}/reset`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ adminPassword }),
      }),
      passwordResetRequestsApp.request(`/admin/${request.id}/reset`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ adminPassword }),
      }),
    ])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])

    const success = responses.find((response) => response.status === 200)!
    const body = await success.json() as any
    const [parent] = await db.select().from(users).where(and(eq(users.id, parentId), eq(users.parishId, parishId)))
    expect(await bcrypt.compare(body.data.tempPassword, parent.passwordHash)).toBe(true)
  })
})
