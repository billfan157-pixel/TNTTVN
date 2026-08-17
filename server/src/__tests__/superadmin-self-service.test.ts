import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import authApp from '../routes/auth.js'
import { generateTokens, getSuperAdminId } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { decryptPassword } from '../utils/passwordCipher.js'

// Test cipher key (hex 64 chars) — bật mã hóa pass tạm (password_encrypted)
process.env.PASSWORD_CIPHER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

// A-NEW-41 (2026-08-12): Admin trưởng (superadmin) phải TỰ đổi được mật khẩu chính mình
// qua admin-change-password (vẫn re-auth mật khẩu hiện tại + rate limit + audit), trong
// khi admin KHÁC nhắm vào Admin trưởng vẫn bị chặn 403.
const PREFIX = Date.now()
const parishId = `parish-sa-${PREFIX}`
const SA_ID = `sa-self-${PREFIX}`
const SA_USERNAME = `sa_self_${PREFIX}`
const SA_PASSWORD = 'Parish@Sadmin1'
const SA_NEW_PASSWORD = 'Parish@Sadmin2'
const REG_ADMIN_ID = `reg-admin-${PREFIX}`
const REG_ADMIN_USERNAME = `reg_admin_${PREFIX}`
const REG_ADMIN_PASSWORD = 'Parish@Radmin1'

const jsonHeaders = { 'Content-Type': 'application/json' }

describe('Superadmin self-service password change (A-NEW-41)', () => {
  let saToken: string
  let regAdminToken: string

  beforeAll(async () => {
    process.env.SUPER_ADMIN_ID = SA_ID
    const now = new Date().toISOString()
    await db.insert(users).values({
      id: SA_ID,
      username: SA_USERNAME,
      fullName: 'Admin Truong Test',
      passwordHash: bcrypt.hashSync(SA_PASSWORD, 4),
      role: 'admin',
      status: 'ACTIVE',
      tokenVersion: 1,
      mustChangePassword: 0,
      parishId,
      createdAt: now,
    }).onConflictDoNothing()
    await db.insert(users).values({
      id: REG_ADMIN_ID,
      username: REG_ADMIN_USERNAME,
      fullName: 'Regular Admin Test',
      passwordHash: bcrypt.hashSync(REG_ADMIN_PASSWORD, 4),
      role: 'admin',
      status: 'ACTIVE',
      tokenVersion: 1,
      mustChangePassword: 0,
      parishId,
      createdAt: now,
    }).onConflictDoNothing()
    saToken = generateTokens({ userId: SA_ID, username: SA_USERNAME, role: 'admin', parishId, tokenVersion: 1 }).accessToken
    regAdminToken = generateTokens({ userId: REG_ADMIN_ID, username: REG_ADMIN_USERNAME, role: 'admin', parishId, tokenVersion: 1 }).accessToken
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, SA_ID))
    await db.delete(users).where(eq(users.id, REG_ADMIN_ID))
    delete process.env.SUPER_ADMIN_ID
  })

  it('Admin khác (không phải Admin trưởng) nhắm target = Admin trưởng → 403 FORBIDDEN', async () => {
    const res = await authApp.request('/admin-change-password', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${regAdminToken}` },
      body: JSON.stringify({ userId: SA_ID, newPassword: SA_NEW_PASSWORD, adminPassword: REG_ADMIN_PASSWORD }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as any
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.message).toContain('Admin trưởng')
    // Hash của Admin trưởng không bị đổi
    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, SA_ID))
    expect(await bcrypt.compare(SA_PASSWORD, row?.passwordHash ?? '')).toBe(true)
  })

  it('Admin trưởng tự đổi mật khẩu với adminPassword SAI → 401 + audit FAILED, hash không đổi', async () => {
    const res = await authApp.request('/admin-change-password', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${saToken}` },
      body: JSON.stringify({ userId: SA_ID, newPassword: SA_NEW_PASSWORD, adminPassword: 'SaiMatKhau@123' }),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as any
    expect(body.error.code).toBe('INVALID_ADMIN_PASSWORD')

    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, SA_ID))
    expect(await bcrypt.compare(SA_PASSWORD, row?.passwordHash ?? '')).toBe(true)

    const [auditRow] = await db
      .select({ action: auditLogs.action, entityId: auditLogs.entityId })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, SA_ID), eq(auditLogs.action, 'ADMIN_CHANGE_PASSWORD_FAILED')))
      .orderBy(auditLogs.createdAt)
      .limit(1)
    expect(auditRow?.entityId).toBe(SA_ID)
  })

  it('Admin trưởng TỰ đổi mật khẩu chính mình với mật khẩu hiện tại đúng → 200 + audit + đổi toàn bộ trạng thái', async () => {
    const res = await authApp.request('/admin-change-password', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${saToken}` },
      body: JSON.stringify({ userId: SA_ID, newPassword: SA_NEW_PASSWORD, adminPassword: SA_PASSWORD }),
    })
    expect(res.status).toBe(200)

    const [row] = await db.select({
      passwordHash: users.passwordHash,
      passwordEncrypted: users.passwordEncrypted,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      tokenVersion: users.tokenVersion,
    }).from(users).where(eq(users.id, SA_ID))
    expect(await bcrypt.compare(SA_NEW_PASSWORD, row?.passwordHash ?? '')).toBe(true)
    expect(decryptPassword(row?.passwordEncrypted)).toBe(SA_NEW_PASSWORD)
    expect(row?.status).toBe('FORCE_PASSWORD_CHANGE')
    expect(row?.mustChangePassword).toBe(1)
    expect(row?.tokenVersion).toBe(2)

    const [auditRow] = await db
      .select({ action: auditLogs.action, entityId: auditLogs.entityId })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, SA_ID), eq(auditLogs.action, 'ADMIN_CHANGE_PASSWORD')))
      .orderBy(auditLogs.createdAt)
      .limit(1)
    expect(auditRow?.action).toBe('ADMIN_CHANGE_PASSWORD')
    expect(auditRow?.entityId).toBe(SA_ID)
  })

  it('Access token cũ của Admin trưởng bị vô hiệu sau khi đổi mật khẩu (tokenVersion bump)', async () => {
    const res = await authApp.request('/me', { headers: { Authorization: `Bearer ${saToken}` } })
    expect(res.status).toBe(401)
  })

  it('Admin trưởng bị LOCKED vẫn tự đổi được mật khẩu (miễn trừ lockout duy nhất)', async () => {
    await db.update(users).set({ status: 'LOCKED', tokenVersion: 2 }).where(eq(users.id, SA_ID))
    const newSaToken = generateTokens({ userId: SA_ID, username: SA_USERNAME, role: 'admin', parishId, tokenVersion: 2 }).accessToken
    const res = await authApp.request('/admin-change-password', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${newSaToken}` },
      body: JSON.stringify({ userId: SA_ID, newPassword: 'Parish@Sadmin3', adminPassword: SA_NEW_PASSWORD }),
    })
    expect(res.status).toBe(200)
    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, SA_ID))
    expect(await bcrypt.compare('Parish@Sadmin3', row?.passwordHash ?? '')).toBe(true)
    expect(getSuperAdminId()).toBe(SA_ID)
  })
})
