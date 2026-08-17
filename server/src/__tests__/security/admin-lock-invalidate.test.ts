import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'crypto'
import usersRouter from '../../routes/users.js'
import { db } from '../../db/index.js'
import { users, refreshTokens, auditLogs } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { generateTokens } from '../../middleware/auth.js'
import { updateUserStatus } from '../../services/userService.js'

/**
 * A10 (2026-08-10): Account LOCKED không invalidate Admin Session NGAY.
 *
 * Trước fix:
 *  - authMiddleware (auth.ts:79): `(status === 'LOCKED' && !isAdmin(payload))` — isAdmin
 *    chỉ check ROLE → admin bị LOCKED vẫn PASS middleware (non-admin mới bị chặn).
 *  - updateUserStatus (userService.ts): chỉ set status — KHÔNG tăng tokenVersion,
 *    KHÔNG revoke refresh sessions → access token cũ sống tiếp 15 phút + refresh còn dùng được.
 *
 * Sau fix (A10):
 *  - authMiddleware: chỉ SuperAdmin được miễn LOCKED (nhất quán login + verifyAdminReauth);
 *    mọi LOCKED khác → 401 NGAY trên mỗi request.
 *  - updateUserStatus: LOCKED → tokenVersion +1 (giết access token cũ) + revokeAllSessions
 *    (giết refresh_tokens). INACTIVE giữ nguyên hành vi phiên (A11 — trạng thái nghiệp vụ).
 */

const PREFIX = `A10-${Date.now()}`
const PARISH = `parish-a10-${PREFIX}`
const ADMIN_ID = `USR-${PREFIX}`
const TARGET_ID = `USR-${PREFIX}-T`
const SA_ID = `USR-A10-SA-${PREFIX}`

const adminToken = generateTokens({ userId: ADMIN_ID, username: 'admin_a10', role: 'admin', parishId: PARISH, tokenVersion: 1 }).accessToken
const saToken = generateTokens({ userId: SA_ID, username: 'sa_a10', role: 'admin', parishId: PARISH, tokenVersion: 1 }).accessToken
const targetTokenV3 = generateTokens({ userId: TARGET_ID, username: 'target_a10', role: 'admin', parishId: PARISH, tokenVersion: 3 }).accessToken

function seedUser(id: string, username: string, status: 'ACTIVE' | 'LOCKED' | 'INACTIVE', tokenVersion: number) {
  return db.insert(users).values({
    id,
    username,
    passwordHash: 'hash',
    fullName: `A10 User ${username}`,
    role: 'admin',
    parishId: PARISH,
    status,
    tokenVersion,
    createdAt: new Date().toISOString(),
  })
}

async function dbUser(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row
}

describe('A10 — Account LOCKED invalidates Admin Session ngay lập tức', () => {
  beforeAll(async () => {
    // SuperAdmin duy nhất: getSuperAdminId() đọc env tại thời điểm gọi → set trước mọi request.
    process.env.SUPER_ADMIN_ID = SA_ID
    await seedUser(ADMIN_ID, `admin_a10_${PREFIX}`, 'ACTIVE', 1)
    await seedUser(TARGET_ID, `target_a10_${PREFIX}`, 'ACTIVE', 3)
    await seedUser(SA_ID, `sa_a10_${PREFIX}`, 'ACTIVE', 1)
    await db.insert(refreshTokens).values({
      id: `RT-${PREFIX}-T`,
      userId: TARGET_ID,
      parishId: PARISH,
      tokenHash: createHash('sha256').update('a10-refresh-sample').digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    })
  })

  afterAll(async () => {
    await db.delete(refreshTokens).where(eq(refreshTokens.parishId, PARISH))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, PARISH))
    await db.delete(users).where(eq(users.parishId, PARISH))
    delete process.env.SUPER_ADMIN_ID
  })

  it('1. Middleware: admin LOCKED bị chặn 401 NGAY (token vẫn hợp lệ thời gian)', async () => {
    await db.update(users).set({ status: 'LOCKED' }).where(eq(users.id, TARGET_ID))
    const res = await usersRouter.request('/', { headers: { Authorization: `Bearer ${targetTokenV3}` } })
    expect(res.status).toBe(401)
  })

  it('2. Middleware: SuperAdmin LOCKED vẫn được phép (miễn trừ duy nhất)', async () => {
    await db.update(users).set({ status: 'LOCKED' }).where(eq(users.id, SA_ID))
    const res = await usersRouter.request('/', { headers: { Authorization: `Bearer ${saToken}` } })
    expect(res.status).toBe(200)
  })

  it('3. updateUserStatus(LOCKED) → tokenVersion +1 + revoke refresh sessions + audit', async () => {
    // set lại ACTIVE để service chạy đủ luồng LOCKED (không phải no-op)
    await db.update(users).set({ status: 'ACTIVE', tokenVersion: 3 }).where(eq(users.id, TARGET_ID))
    const ok = await updateUserStatus(TARGET_ID, 'LOCKED', ADMIN_ID, PARISH, '10.0.0.1', 'vitest-a10')
    expect(ok).toBe(true)

    const row = await dbUser(TARGET_ID)
    expect(row?.status).toBe('LOCKED')
    expect(row?.tokenVersion).toBe(4) // 3 + 1

    const [session] = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, TARGET_ID))
    expect(session?.revokedAt).not.toBeNull() // refresh session đã bị thu hồi

    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'UPDATE_USER_STATUS'), eq(auditLogs.entityId, TARGET_ID)))
    expect(audit).toBeDefined()
    expect(JSON.parse(audit.newValue as string)).toEqual({ status: 'LOCKED', tokenVersion: 4 })
  })

  it('4. End-to-end: admin khóa account người khác qua API → token cũ của nạn nhân chết ngay', async () => {
    const lockRes = await usersRouter.request(`/${TARGET_ID}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'LOCKED' }),
    })
    expect(lockRes.status).toBe(200)

    // Token cũ (tokenVersion 3) — DB đã bump 2 lần → 5 → 401 dù còn hạn 15 phút
    const victimRes = await usersRouter.request('/', { headers: { Authorization: `Bearer ${targetTokenV3}` } })
    expect(victimRes.status).toBe(401)
  })

  it('5. Unlock (ACTIVE) → tài khoản đăng nhập lại bình thường (không brick vĩnh viễn)', async () => {
    const ok = await updateUserStatus(TARGET_ID, 'ACTIVE', ADMIN_ID, PARISH, '10.0.0.1', 'vitest-a10')
    expect(ok).toBe(true)

    const row = await dbUser(TARGET_ID)
    expect(row?.status).toBe('ACTIVE')

    const freshToken = generateTokens({ userId: TARGET_ID, username: 'target_a10', role: 'admin', parishId: PARISH, tokenVersion: row!.tokenVersion }).accessToken
    const res = await usersRouter.request('/', { headers: { Authorization: `Bearer ${freshToken}` } })
    expect(res.status).toBe(200)
  })
})