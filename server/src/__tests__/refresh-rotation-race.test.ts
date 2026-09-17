import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import authApp from '../routes/auth.js'
import { db } from '../db/index.js'
import { users, refreshTokens } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const PREFIX = Date.now()
const parishId = `parish-refresh-race-${PREFIX}`
const userId = `usr-refresh-race-${PREFIX}`
const username = `race_${PREFIX}`
const STRONG = 'Parish@123456'

const jsonHeaders = { 'Content-Type': 'application/json' }

function extractRefreshCookie(res: Response): string | null {
  const header = res.headers.get('set-cookie') ?? ''
  const m = header.match(/parish_refresh=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

describe('A-NEW-13: refresh rotation client-mutex is not enough — server race', () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      username,
      fullName: 'Race User',
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

  it('10 concurrent /refresh với CÙNG một token: chỉ ĐÚNG 1 thành công, các request còn lại bị reject (SESSION_REUSE_DETECTED/INVALID)', async () => {
    const login = await authApp.request('/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ username, password: STRONG, parishId }),
    })
    expect(login.status).toBe(200)
    const cookie = extractRefreshCookie(login)!
    expect(cookie).not.toBeNull()

    // Mô phỏng 2+ tab / device cùng lúc refresh bằng cùng refresh token
    // (client mutex chỉ bảo vệ trong 1 JS context — server không được biết đến nó).
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        authApp.request('/refresh', {
          method: 'POST',
          headers: { Cookie: `parish_refresh=${encodeURIComponent(cookie)}` },
        }),
      ),
    )

    const ok = attempts.filter((r) => r.status === 200)
    const rejected = attempts.filter((r) => r.status !== 200)
    console.log(`A-NEW-13: statuses = [${attempts.map((r) => r.status).join(', ')}]`)

    expect(ok.length).toBe(1)

    const active = await db.select().from(refreshTokens)
      .where(eq(refreshTokens.parishId, parishId))
    const activeCount = active.filter((s) => s.revokedAt === null).length
    expect(activeCount).toBe(0)
    const winner = await ok[0].json() as { data: { accessToken: string } }
    expect((await authApp.request('/me', {
      headers: { Authorization: `Bearer ${winner.data.accessToken}` },
    })).status).toBe(401)

    if (rejected.length > 0) {
      const bodies = await Promise.all(rejected.map((r) => r.json().catch(() => null)))
      const codes = bodies.map((b: any) => b?.error?.code)
      console.log(`A-NEW-13: reject codes = [${codes.join(', ')}]`)
      expect(codes.every((c) => c === 'SESSION_REUSE_DETECTED' || c === 'INVALID_REFRESH_TOKEN' || c === 'SESSION_INVALID')).toBe(true)
    }
  }, 30000)
})
