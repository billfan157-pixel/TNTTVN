import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import authApp from '../routes/auth.js'
import usersApp from '../routes/users.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

const PREFIX = Date.now()
const parishId = `parish-lockout-${PREFIX}`
const userId = `usr-lockout-${PREFIX}`
const username = `lockout_${PREFIX}`
const adminId = `usr-lockout-admin-${PREFIX}`
const adminUsername = `lockout_admin_${PREFIX}`
const STRONG = 'Parish@123456'
const STRONG_2 = 'Parish@abcdef9'
const WEAK = 'weak1'

const jsonHeaders = { 'Content-Type': 'application/json' }

function login(user: string, password: string) {
  return authApp.request('/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ username: user, password, parishId }),
  })
}

describe('Server Auth Lockout & Password Policy Tests', () => {
  let adminToken: string
  let userToken: string

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(users).values({
      id: adminId,
      username: adminUsername,
      fullName: 'Lockout Admin',
      passwordHash: await bcrypt.hash(STRONG, 4),
      role: 'admin',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      createdAt: now,
    }).onConflictDoNothing()

    await db.insert(users).values({
      id: userId,
      username,
      fullName: 'Lockout User',
      passwordHash: await bcrypt.hash(STRONG, 4),
      role: 'phuta',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      createdAt: now,
    }).onConflictDoNothing()

    await db.update(users).set({ tokenVersion: 1, status: 'ACTIVE', failedAttempts: 0 }).where(eq(users.id, userId))

    const { accessToken } = generateTokens({ userId: adminId, username: adminUsername, role: 'admin', parishId, tokenVersion: 1 })
    adminToken = accessToken
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(users).where(eq(users.id, adminId))
  })

  it('locks the account after 5 failed login attempts', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await login(username, 'WrongPass1!')
      expect(res.status).toBe(401)
      const body = (await res.json()) as any
      if (i === 5) expect(body.error.message).toContain('5/5')
    }
    const [row] = await db.select({ status: users.status, failedAttempts: users.failedAttempts }).from(users).where(eq(users.id, userId))
    expect(row?.status).toBe('LOCKED')
    expect(row?.failedAttempts).toBe(5)
  })

  it('rejects login of a locked account even with the correct password', async () => {
    const res = await login(username, STRONG)
    expect(res.status).toBe(403)
    const body = (await res.json()) as any
    expect(body.error.code).toBe('ACCOUNT_LOCKED')
  })

  it('rejects admin change-password with a weak password', async () => {
    const res = await authApp.request('/admin-change-password', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${adminToken}` },
      // A06: adminPassword bắt buộc — gửi kèm để test đúng lý do (weak newPassword)
      body: JSON.stringify({ userId, newPassword: WEAK, adminPassword: STRONG }),
    })
    expect(res.status).toBe(400)
  })

  it('A06: admin change-password với adminPassword SAI → 401 + audit ADMIN_CHANGE_PASSWORD_FAILED, pass target không đổi', async () => {
    const res = await authApp.request('/admin-change-password', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ userId, newPassword: STRONG_2, adminPassword: 'SaiMatKhau@123' }),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as any
    expect(body.error.code).toBe('INVALID_ADMIN_PASSWORD')

    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId))
    expect(await bcrypt.compare(STRONG, row?.passwordHash ?? '')).toBe(true)

    const [auditRow] = await db
      .select({ action: auditLogs.action, entityId: auditLogs.entityId })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, adminId), eq(auditLogs.action, 'ADMIN_CHANGE_PASSWORD_FAILED')))
      .orderBy(auditLogs.createdAt)
      .limit(1)
    expect(auditRow?.entityId).toBe(userId)
  })

  it('admin change-password forces FORCE_PASSWORD_CHANGE status and invalidates old tokens', async () => {
    const oldToken = generateTokens({ userId, username, role: 'phuta', parishId, tokenVersion: 1 }).accessToken

    const res = await authApp.request('/admin-change-password', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${adminToken}` },
      // A06 (2026-08-10): re-authentication — admin phải gửi kèm mật khẩu của chính mình
      body: JSON.stringify({ userId, newPassword: STRONG_2, adminPassword: STRONG }),
    })
    expect(res.status).toBe(200)

    const [row] = await db.select({ status: users.status, mustChangePassword: users.mustChangePassword, tokenVersion: users.tokenVersion, passwordEncrypted: users.passwordEncrypted }).from(users).where(eq(users.id, userId))
    expect(row?.status).toBe('FORCE_PASSWORD_CHANGE')
    expect(row?.mustChangePassword).toBe(1)
    expect(row?.passwordEncrypted).toBeNull()

    // Token issued with the old tokenVersion must be rejected
    const oldRes = await authApp.request('/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${oldToken}` },
    })
    expect(oldRes.status).toBe(401)

    // Login succeeds with the new password but user stays FORCE
    const loginRes = await login(username, STRONG_2)
    expect(loginRes.status).toBe(200)
    const loginBody = (await loginRes.json()) as any
    expect(loginBody.data.user.status).toBe('FORCE_PASSWORD_CHANGE')
    userToken = loginBody.data.accessToken
  })

  it('blocks non-password endpoints while FORCE_PASSWORD_CHANGE is active', async () => {
    const blocked = await usersApp.request('/', {
      method: 'GET',
      headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(blocked.status).toBe(403)
  })

  it('still allows profile update while FORCE_PASSWORD_CHANGE is active', async () => {
    const res = await authApp.request('/profile', {
      method: 'PUT',
      headers: { ...jsonHeaders, Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ fullName: 'Lockout User' }),
    })
    expect(res.status).toBe(200)
  })

  it('rejects user change-password with a weak new password', async () => {
    const res = await authApp.request('/change-password', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ currentPassword: STRONG_2, newPassword: WEAK }),
    })
    expect(res.status).toBe(400)
  })

  it('allows user to complete the forced change with a strong password and clears the flag', async () => {
    const res = await authApp.request('/change-password', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ currentPassword: STRONG_2, newPassword: STRONG }),
    })
    expect(res.status).toBe(200)

    const [row] = await db.select({ status: users.status, mustChangePassword: users.mustChangePassword, passwordEncrypted: users.passwordEncrypted }).from(users).where(eq(users.id, userId))
    expect(row?.status).toBe('ACTIVE')
    expect(row?.mustChangePassword).toBe(0)
    // ADR-021 rewrite: user tự đổi mật khẩu → passwordEncrypted phải NULL —
    // mật khẩu user-chọn không bao giờ tồn tại dạng reversible (không xem lại được).
    expect(row?.passwordEncrypted).toBeNull()
  })
})
