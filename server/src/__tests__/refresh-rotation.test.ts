import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import authApp from '../routes/auth.js'
import { db } from '../db/index.js'
import { users, refreshTokens } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const PREFIX = Date.now()
const parishId = `parish-refresh-rotation-${PREFIX}`
const userId = `usr-refresh-rotation-${PREFIX}`
const username = `rotation_${PREFIX}`
const STRONG = 'Parish@123456'

const jsonHeaders = { 'Content-Type': 'application/json' }

// A-NEW-01: refresh token chỉ nằm trong Set-Cookie — không bao giờ trong JSON body.
function extractRefreshCookie(res: Response): string | null {
  const header = res.headers.get('set-cookie') ?? ''
  const m = header.match(/parish_refresh=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function login() {
  return authApp.request('/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ username, password: STRONG, parishId }),
  })
}

function refreshWithCookie(cookie: string, extra?: RequestInit) {
  return authApp.request('/refresh', {
    method: 'POST',
    headers: { Cookie: `parish_refresh=${encodeURIComponent(cookie)}` },
    ...extra,
  })
}

async function loginToken() {
  const res = await login()
  expect(res.status).toBe(200)
  const cookie = extractRefreshCookie(res)
  expect(cookie).not.toBeNull()
  const body = (await res.json()) as any
  // A-NEW-01 acceptance: refreshToken KHÔNG xuất hiện trong JSON response.
  expect(body.data.refreshToken).toBeUndefined()
  expect(body.data.accessToken).toBeTruthy()
  return { res, accessToken: body.data.accessToken, refreshToken: cookie! }
}

function logoutWith(refreshToken: string, accessToken: string) {
  return authApp.request('/logout', {
    method: 'POST',
    headers: { ...jsonHeaders, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ refreshToken }),
  })
}

describe('Server JWT Refresh Token Rotation & Reuse Detection Tests', () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      username,
      fullName: 'Rotation User',
      passwordHash: await bcrypt.hash(STRONG, 4),
      role: 'chunhiem',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    }).onConflictDoNothing()
    await db.update(users).set({ tokenVersion: 1, status: 'ACTIVE', failedAttempts: 0 }).where(eq(users.id, userId))
  })

  beforeEach(async () => {
    await db.delete(refreshTokens).where(eq(refreshTokens.parishId, parishId))
  })

  afterAll(async () => {
    await db.delete(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    await db.delete(users).where(eq(users.id, userId))
  })

  it('login tạo refresh session + /refresh ROTATE qua cookie: token cũ hết hiệu lực, token mới hoạt động', async () => {
    const first = await loginToken()
    const sessionRows = await db.select().from(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    expect(sessionRows.length).toBe(1)
    expect(sessionRows[0].revokedAt).toBeNull()
    expect(sessionRows[0].tokenHash).not.toBe(first.refreshToken)

    const res = await refreshWithCookie(first.refreshToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    // A-NEW-01 acceptance: refresh response KHÔNG trả refreshToken trong JSON.
    expect(body.data.refreshToken).toBeUndefined()
    expect(body.data.accessToken).toBeTruthy()
    const freshCookie = extractRefreshCookie(res)!
    expect(freshCookie).not.toBe(first.refreshToken)

    const after = await db.select().from(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    expect(after.length).toBe(2)
    const old = after.find((s) => s.replacedBy)!
    const fresh = after.find((s) => !s.replacedBy)!
    expect(old.revokedAt).not.toBeNull()
    expect(fresh.revokedAt).toBeNull()
    expect(old.replacedBy).toBe(fresh.id)
  })

  it('REUSE DETECTION: dùng lại token đã rotate → thu hồi TẤT CẢ phiên, token mới nhất cũng chết', async () => {
    const first = await loginToken()
    const second = await loginToken()
    expect(second.refreshToken).not.toBe(first.refreshToken)
    const sessionRows = await db.select().from(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    expect(sessionRows.length).toBe(2)

    const res = await refreshWithCookie(second.refreshToken)
    expect(res.status).toBe(200)
    const freshCookie = extractRefreshCookie(res)!

    // Dùng LẠI token vừa rotate (second) — dấu hiệu đánh cắp
    const reuse = await refreshWithCookie(second.refreshToken)
    expect(reuse.status).toBe(401)
    const reuseBody = (await reuse.json()) as any
    expect(reuseBody.error.code).toBe('SESSION_REUSE_DETECTED')

    // Toàn bộ phiên đã bị thu hồi + tokenVersion bumped:
    // token mới nhất (S3) và token chưa dùng (first) đều chết
    const afterReuse = await refreshWithCookie(freshCookie)
    expect(afterReuse.status).toBe(401)
    const afterFirst = await refreshWithCookie(first.refreshToken)
    expect(afterFirst.status).toBe(401)
  })

  it('logout gửi refreshToken: chỉ thu hồi phiên ĐÓ (per-session), phiên khác vẫn refresh được', async () => {
    const first = await loginToken()
    const second = await loginToken()

    const res = await logoutWith(first.refreshToken, first.accessToken)
    expect(res.status).toBe(200)

    // Phiên B vẫn sống
    const resB = await refreshWithCookie(second.refreshToken)
    expect(resB.status).toBe(200)

    // Phiên A đã bị revoke → dùng lại bị chặn
    const resA = await refreshWithCookie(first.refreshToken)
    expect(resA.status).toBe(401)
  })

  it('logout KHÔNG có refreshToken → revoke toàn bộ + bump tokenVersion (backward compatible)', async () => {
    const { accessToken } = await loginToken()
    const res = await authApp.request('/logout', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${accessToken}` },
    })
    expect(res.status).toBe(200)

    const res2 = await authApp.request('/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res2.status).toBe(401)
  })

  it('A-NEW-01: body refreshToken bị IGNORE — chỉ cookie được chấp nhận; không cookie → 401', async () => {
    const { refreshToken } = await loginToken()

    // Body chứa token hợp lệ NHƯNG không có cookie → 401 (body không còn là kênh auth)
    const bodyOnly = await authApp.request('/refresh', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ refreshToken }),
    })
    expect(bodyOnly.status).toBe(401)

    // Cookie hợp lệ kèm body rác → vẫn 200 (body bị bỏ qua hoàn toàn)
    const withCookie = await refreshWithCookie(refreshToken, {
      headers: { ...jsonHeaders, Cookie: `parish_refresh=${encodeURIComponent(refreshToken)}` },
      body: JSON.stringify({ refreshToken: 'garbage-body-token' }),
    })
    expect(withCookie.status).toBe(200)
  })

  it('A-NEW-02: /refresh chặn Origin lạ (CSRF guard khi SameSite=None)', async () => {
    const { refreshToken } = await loginToken()
    const evil = await refreshWithCookie(refreshToken, {
      headers: { Cookie: `parish_refresh=${encodeURIComponent(refreshToken)}`, Origin: 'https://evil.example.com' },
    })
    expect(evil.status).toBe(403)

    const legit = await refreshWithCookie(refreshToken, {
      headers: { Cookie: `parish_refresh=${encodeURIComponent(refreshToken)}`, Origin: 'http://localhost:5173' },
    })
    expect(legit.status).toBe(200)
  })
})