import { describe, it, expect, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import authApp from '../../routes/auth.js'
import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

// SECURITY_AUDIT_A01 + A-NEW-01/A-NEW-02: refresh token CHỈ qua HttpOnly cookie.
// Coverage: login set cookie (KHÔNG còn refreshToken trong JSON), /refresh từ cookie
// (body ignored), rotation set cookie mới, CSRF origin guard, logout xóa cookie +
// revoke phiên, revisit-token cũ bị từ chối qua cookie.

const PREFIX = Date.now()
const parishId = `parish-cookie-${PREFIX}`
const userId = `usr-cookie-${PREFIX}`
const username = `cookie_user_${PREFIX}`
const password = 'Cookie@123!'

function getSetCookieValue(res: Response): string | null {
  const header = res.headers.get('set-cookie')
  if (!header) return null
  const m = header.match(/parish_refresh=([^;]+)/)
  return m ? m[1] : null
}

async function login() {
  const res = await authApp.request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, parishId }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: { accessToken: string } }
  // A-NEW-01: refreshToken KHÔNG được trả trong JSON — chỉ Set-Cookie.
  expect((body.data as any).refreshToken).toBeUndefined()
  const refreshToken = getSetCookieValue(res)!
  expect(refreshToken).toBeTruthy()
  return { res, accessToken: body.data.accessToken, refreshToken }
}

describe('A01 Phase 1 + A-NEW-01/02 — refresh token HttpOnly cookie (cookie-only)', () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      username,
      fullName: 'Cookie User',
      passwordHash: bcrypt.hashSync(password, 10),
      role: 'admin',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
    }).onConflictDoNothing()
    await db.update(users).set({ tokenVersion: 1, status: 'ACTIVE' }).where(eq(users.id, userId))
  })

  it('login set cookie parish_refresh (HttpOnly, SameSite=Lax ở dev) — refresh token KHÔNG trong JSON', async () => {
    const { res, refreshToken } = await login()
    const cookie = getSetCookieValue(res)
    expect(cookie).toBe(refreshToken)
    expect(cookie).toBeTruthy()
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
  })

  it('/refresh từ COOKIE (body rỗng) vẫn rotate & set cookie mới; response KHÔNG chứa refreshToken trong JSON', async () => {
    const { refreshToken } = await login()
    const res = await authApp.request('/refresh', {
      method: 'POST',
      headers: { Cookie: `parish_refresh=${refreshToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { accessToken: string } }
    expect(body.data.accessToken).toBeTruthy()
    // A-NEW-01: JSON chỉ có accessToken.
    expect((body.data as any).refreshToken).toBeUndefined()
    const newCookie = getSetCookieValue(res)
    expect(newCookie).toBeTruthy()
    expect(newCookie).not.toBe(refreshToken)

    // Token cũ (vừa rotate) dùng lại → REUSE DETECTED: mọi phiên bị thu hồi + bump
    // tokenVersion (thiết kế SSOT/rotation) → cả phiên mới cũng chết, buộc login lại
    const reuse = await authApp.request('/refresh', {
      method: 'POST',
      headers: { Cookie: `parish_refresh=${refreshToken}` },
    })
    expect(reuse.status).toBe(401)

    const again = await authApp.request('/refresh', {
      method: 'POST',
      headers: { Cookie: `parish_refresh=${newCookie}` },
    })
    expect(again.status).toBe(401)
  })

  it('/refresh IGNORE body hoàn toàn — body rác + cookie hợp lệ vẫn 200', async () => {
    const { refreshToken } = await login()
    const res = await authApp.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `parish_refresh=${refreshToken}` },
      body: JSON.stringify({ refreshToken: 'garbage-body-token' }),
    })
    expect(res.status).toBe(200)
  })

  it('A-NEW-02: /refresh chặn Origin ngoài allowlist (CSRF) — Origin hợp lệ cho qua', async () => {
    const { refreshToken } = await login()
    const evil = await authApp.request('/refresh', {
      method: 'POST',
      headers: { Cookie: `parish_refresh=${refreshToken}`, Origin: 'https://evil.example.com' },
    })
    expect(evil.status).toBe(403)

    const legit = await authApp.request('/refresh', {
      method: 'POST',
      headers: { Cookie: `parish_refresh=${refreshToken}`, Origin: 'https://tnttvn.vercel.app' },
    })
    expect(legit.status).toBe(200)
  })

  it('logout xóa cookie (Max-Age=0) + revoke phiên; token trong cookie hết hiệu lực', async () => {
    const { res: _loginRes, accessToken, refreshToken } = await login()
    const res = await authApp.request('/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, Cookie: `parish_refresh=${refreshToken}` },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/parish_refresh=;/)
    expect(setCookie).toContain('Max-Age=0')

    const after = await authApp.request('/refresh', {
      method: 'POST',
      headers: { Cookie: `parish_refresh=${refreshToken}` },
    })
    expect(after.status).toBe(401)
  })

  it('/refresh với cookie rác → 401 (không phải 500, không leak thông tin)', async () => {
    const res = await authApp.request('/refresh', {
      method: 'POST',
      headers: { Cookie: 'parish_refresh=not-a-real-token' },
    })
    expect(res.status).toBe(401)
  })

  it('/refresh không có token (không cookie, không body) → 401 REFRESH_TOKEN_REQUIRED', async () => {
    const res = await authApp.request('/refresh', { method: 'POST' })
    expect(res.status).toBe(401)
  })
})
