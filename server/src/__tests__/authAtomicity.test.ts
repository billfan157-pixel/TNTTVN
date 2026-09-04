import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import bcrypt from 'bcryptjs'

vi.mock('../services/refreshSessionService.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/refreshSessionService.js')>()
  return {
    ...mod,
    issueTokensWithSessionIn: vi.fn((...args: Parameters<typeof mod.issueTokensWithSessionIn>) =>
      mod.issueTokensWithSessionIn(...args),
    ),
  }
})

import authApp from '../routes/auth.js'
import { issueTokensWithSessionIn } from '../services/refreshSessionService.js'
import { db } from '../db/index.js'
import { users, refreshTokens, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

// Phase 1 (Auth split-tx): password/tokenVersion + revoke + session mới + audit
// commit cùng 1 transaction. Test dưới chứng minh rollback toàn phần khi
// session-issue fail giữa chừng — code cũ để lại pass mới + sessions chết.
const PREFIX = Date.now()
const parishId = `parish-authatom-${PREFIX}`
const userId = `usr-authatom-${PREFIX}`
const username = `authatom_${PREFIX}`
const OLD_PASS = 'Oldpass@111'
const NEW_PASS = 'Newpass@222'

const jsonHeaders = { 'Content-Type': 'application/json' }

async function authedChangePassword(accessToken: string, currentPassword: string, newPassword: string) {
  return authApp.request('/change-password', {
    method: 'POST',
    headers: { ...jsonHeaders, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

describe('Phase 1 — Auth command atomicity', () => {
  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(users).values({
      id: userId,
      username,
      fullName: 'Atomic User',
      passwordHash: await bcrypt.hash(OLD_PASS, 4),
      role: 'phuta',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      createdAt: now,
    }).onConflictDoNothing()
  })

  afterAll(async () => {
    await db.delete(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
    await db.delete(users).where(eq(users.id, userId))
  })

  async function login(): Promise<{ accessToken: string }> {
    const res = await authApp.request('/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ username, password: OLD_PASS, parishId }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { accessToken: string } }
    return { accessToken: body.data.accessToken }
  }

  it('issue fail giữa tx → rollback toàn phần (pass cũ còn, sessions còn, không audit)', async () => {
    const { accessToken } = await login()
    const sessionsBefore = await db.select({ id: refreshTokens.id }).from(refreshTokens).where(eq(refreshTokens.parishId, parishId))

    vi.mocked(issueTokensWithSessionIn).mockRejectedValueOnce(new Error('DB down giữa chừng'))

    const res = await authedChangePassword(accessToken, OLD_PASS, NEW_PASS)
    expect(res.status).toBe(500)

    // 1. Password cũ vẫn đúng (UPDATE users đã rollback).
    const [row] = await db.select().from(users).where(eq(users.id, userId))
    expect(row.tokenVersion).toBe(1)
    expect(await bcrypt.compare(OLD_PASS, row.passwordHash)).toBe(true)
    // 2. Sessions cũ còn nguyên (revoke đã rollback).
    const sessionsAfter = await db.select({ id: refreshTokens.id }).from(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    expect(sessionsAfter.map((s) => s.id).sort()).toEqual(sessionsBefore.map((s) => s.id).sort())
    // 3. Không có audit CHANGE_PASSWORD nửa vời.
    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishId), eq(auditLogs.action, 'CHANGE_PASSWORD')))
    expect(audits).toHaveLength(0)
  })

  it('change-password thành công: version bump + revoke cũ + session mới + audit', async () => {
    const { accessToken: oldAccess } = await login()
    const res = await authedChangePassword(oldAccess, OLD_PASS, NEW_PASS)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { accessToken: string } }
    expect(body.data.accessToken).toBeTruthy()

    const [row] = await db.select().from(users).where(eq(users.id, userId))
    expect(row.tokenVersion).toBe(2)
    expect(await bcrypt.compare(NEW_PASS, row.passwordHash)).toBe(true)

    // Access token cũ chết theo version.
    const me = await authApp.request('/me', { headers: { ...jsonHeaders, Authorization: `Bearer ${oldAccess}` } })
    expect(me.status).toBe(401)
    const meNew = await authApp.request('/me', { headers: { ...jsonHeaders, Authorization: `Bearer ${body.data.accessToken}` } })
    expect(meNew.status).toBe(200)

    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishId), eq(auditLogs.action, 'CHANGE_PASSWORD')))
    expect(audits.length).toBeGreaterThanOrEqual(1)
  })
})
