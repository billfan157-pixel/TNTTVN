import { describe, it, expect, beforeAll } from 'vitest'
import authApp from '../routes/auth.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

describe('Server Auth Routes Handler Tests', () => {
  const parishId = 'parish-auth-test'
  const userId = 'usr-auth-logout'

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(users).values({
      id: userId,
      username: 'logout_user',
      fullName: 'Logout User',
      passwordHash: 'hash',
      role: 'chunhiem',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      createdAt: now,
    }).onConflictDoNothing()

    await db.update(users).set({ tokenVersion: 1, status: 'ACTIVE' }).where(eq(users.id, userId))
  })

  it('rejects login with missing body or invalid credentials', async () => {
    const res = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexistent', password: 'wrongpassword' }),
    })
    expect(res.status).toBe(401)
    const json = (await res.json()) as any
    expect(json.success).toBe(false)
  })

  it('rejects refresh request with invalid token', async () => {
    const res = await authApp.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'invalid_token_string' }),
    })
    expect(res.status).toBe(401)
  })

  it('POST /logout invalidates tokenVersion', async () => {
    const { accessToken } = generateTokens({ userId, username: 'logout_user', role: 'chunhiem', parishId, tokenVersion: 1 })

    const res = await authApp.request('/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)

    // Second request with original token must be rejected because tokenVersion incremented to 2
    const res2 = await authApp.request('/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res2.status).toBe(401)
  })
})
