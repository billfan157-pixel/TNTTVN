import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import authApp from '../routes/auth.js'
import usersApp from '../routes/users.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const PREFIX = Date.now()
const parishId = `parish-user-mgmt-${PREFIX}`
const adminId = `usr-um-admin-${PREFIX}`
const adminUsername = `um_admin_${PREFIX}`
const targetId = `usr-um-${PREFIX}`
const targetUsername = `um_target_${PREFIX}`
const parentId = `usr-um-parent-${PREFIX}`
const parentPhone = '0905550001'
const parentPhoneNew = '0905550002'
const otherParentId = `usr-um-parent2-${PREFIX}`
const otherParentPhone = '0905550003'
const PASSWORD = 'Parish@123456'

const jsonHeaders = { 'Content-Type': 'application/json' }

function adminHeaders() {
  const { accessToken } = generateTokens({ userId: adminId, username: adminUsername, role: 'admin', parishId, tokenVersion: 1 })
  return { ...jsonHeaders, Authorization: `Bearer ${accessToken}` }
}

function login(user: string, password: string) {
  return authApp.request('/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ username: user, password, parishId }),
  })
}

describe('Server User Profile & Management Tests', () => {
  let targetToken: string

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(users).values({
      id: adminId,
      username: adminUsername,
      fullName: 'UM Admin',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: 'admin',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      createdAt: now,
    }).onConflictDoNothing()

    await db.insert(users).values({
      id: targetId,
      username: targetUsername,
      fullName: 'Original Name',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: 'phuta',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      phone: '0901112222',
      createdAt: now,
    }).onConflictDoNothing()

    await db.update(users).set({ tokenVersion: 1, status: 'ACTIVE' }).where(eq(users.id, targetId))

    // ADR-039 (2026-08-15): phụ huynh — SĐT = identity liên kết con (ADR-026)
    await db.insert(users).values({
      id: parentId,
      username: parentPhone,
      fullName: 'UM Parent',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: 'phuhuynh',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      phone: parentPhone,
      createdAt: now,
    }).onConflictDoNothing()

    await db.insert(users).values({
      id: otherParentId,
      username: otherParentPhone,
      fullName: 'UM Other Parent',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: 'phuhuynh',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      phone: otherParentPhone,
      createdAt: now,
    }).onConflictDoNothing()

    const loginRes = await login(targetUsername, PASSWORD)
    const body = (await loginRes.json()) as any
    targetToken = body.data.accessToken
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, targetId))
    await db.delete(users).where(eq(users.id, parentId))
    await db.delete(users).where(eq(users.id, otherParentId))
    await db.delete(users).where(eq(users.id, adminId))
  })

  it('returns phone in /me after login', async () => {
    const res = await authApp.request('/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${targetToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.phone).toBe('0901112222')
    expect(body.data.fullName).toBe('Original Name')
  })

  it('updates fullName and phone via PUT /auth/profile', async () => {
    const res = await authApp.request('/profile', {
      method: 'PUT',
      headers: { ...jsonHeaders, Authorization: `Bearer ${targetToken}` },
      body: JSON.stringify({ fullName: 'Updated Name', phone: '0987654321' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.fullName).toBe('Updated Name')
    expect(body.data.phone).toBe('0987654321')

    const me = await authApp.request('/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${targetToken}` },
    })
    const meBody = (await me.json()) as any
    expect(meBody.data.fullName).toBe('Updated Name')
    expect(meBody.data.phone).toBe('0987654321')
  })

  it('rejects profile update with too-short fullName', async () => {
    const res = await authApp.request('/profile', {
      method: 'PUT',
      headers: { ...jsonHeaders, Authorization: `Bearer ${targetToken}` },
      body: JSON.stringify({ fullName: 'X' }),
    })
    expect(res.status).toBe(400)
  })

  it('allows updating only phone, keeping the previous fullName', async () => {
    const res = await authApp.request('/profile', {
      method: 'PUT',
      headers: { ...jsonHeaders, Authorization: `Bearer ${targetToken}` },
      body: JSON.stringify({ phone: '0900000000' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.fullName).toBe('Updated Name')
    expect(body.data.phone).toBe('0900000000')
  })

  it('admin can lock an account and locked users cannot log in', async () => {
    const lockRes = await usersApp.request(`/${targetId}/status`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ status: 'LOCKED' }),
    })
    expect(lockRes.status).toBe(200)

    const loginRes = await login(targetUsername, PASSWORD)
    expect(loginRes.status).toBe(401)
    const body = (await loginRes.json()) as any
    expect(body.error.code).toBe('INVALID_CREDENTIALS')
  })

  describe('ADR-039 — phụ huynh KHÔNG tự đổi SĐT', () => {
    it('rejects phone change via PUT /auth/profile for phuhuynh with 403 PHONE_CHANGE_NOT_ALLOWED', async () => {
      const loginRes = await login(parentPhone, PASSWORD)
      const body = (await loginRes.json()) as any
      const parentToken = body.data.accessToken

      const res = await authApp.request('/profile', {
        method: 'PUT',
        headers: { ...jsonHeaders, Authorization: `Bearer ${parentToken}` },
        body: JSON.stringify({ phone: parentPhoneNew }),
      })
      expect(res.status).toBe(403)
      const err = (await res.json()) as any
      expect(err.error.code).toBe('PHONE_CHANGE_NOT_ALLOWED')

      // SĐT vẫn nguyên trong DB
      const [row] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, parentId)).limit(1)
      expect(row?.phone).toBe(parentPhone)
    })

    it('allows phuhuynh to update fullName via PUT /auth/profile', async () => {
      const loginRes = await login(parentPhone, PASSWORD)
      const body = (await loginRes.json()) as any
      const parentToken = body.data.accessToken

      const res = await authApp.request('/profile', {
        method: 'PUT',
        headers: { ...jsonHeaders, Authorization: `Bearer ${parentToken}` },
        body: JSON.stringify({ fullName: 'UM Parent Updated' }),
      })
      expect(res.status).toBe(200)
      const b = (await res.json()) as any
      expect(b.data.fullName).toBe('UM Parent Updated')
      expect(b.data.phone).toBe(parentPhone)
    })
  })

  describe('ADR-039 — admin đổi SĐT (PUT /users/:id/phone)', () => {
    it('updates parent phone and syncs username to the new phone', async () => {
      const res = await usersApp.request(`/${parentId}/phone`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ phone: parentPhoneNew, adminPassword: PASSWORD }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as any
      expect(body.data.phone).toBe(parentPhoneNew)
      expect(body.data.username).toBe(parentPhoneNew)
      expect(body.data.usernameChanged).toBe(true)

      const [row] = await db.select({ phone: users.phone, username: users.username }).from(users).where(eq(users.id, parentId)).limit(1)
      expect(row?.phone).toBe(parentPhoneNew)
      expect(row?.username).toBe(parentPhoneNew)
    })

    it('rejects with 409 when new phone collides with another parent username', async () => {
      const res = await usersApp.request(`/${parentId}/phone`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ phone: otherParentPhone, adminPassword: PASSWORD }),
      })
      expect(res.status).toBe(409)
      const body = (await res.json()) as any
      expect(body.error.code).toBe('USERNAME_EXISTS')
    })

    it('rejects with 401 on wrong admin re-auth password', async () => {
      const res = await usersApp.request(`/${parentId}/phone`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ phone: '0905550004', adminPassword: 'WrongPass123' }),
      })
      expect(res.status).toBe(401)
      const body = (await res.json()) as any
      expect(body.error.code).toBe('INVALID_ADMIN_PASSWORD')
    })

    it('rejects invalid phone format with 400', async () => {
      const res = await usersApp.request(`/${parentId}/phone`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ phone: 'not-a-phone', adminPassword: PASSWORD }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 for unknown user id', async () => {
      const res = await usersApp.request('/usr-um-nonexistent/phone', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ phone: '0905550004', adminPassword: PASSWORD }),
      })
      expect(res.status).toBe(404)
    })

    it('does not sync username for non-parent users (custom username stays)', async () => {
      const res = await usersApp.request(`/${targetId}/phone`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ phone: '0906660001', adminPassword: PASSWORD }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as any
      expect(body.data.phone).toBe('0906660001')
      expect(body.data.username).toBe(targetUsername)
      expect(body.data.usernameChanged).toBe(false)
    })
  })
})
