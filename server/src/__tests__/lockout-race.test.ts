import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import authApp from '../routes/auth.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const PREFIX = Date.now()
const parishId = `parish-lockout-race-${PREFIX}`
const userId = `usr-lockout-race-${PREFIX}`
const username = `lockout_race_${PREFIX}`
const STRONG = 'Parish@123456'

const jsonHeaders = { 'Content-Type': 'application/json' }

describe('RE-AUDIT: login lockout TOCTOU — failedAttempts lost update dưới concurrency', () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      username,
      fullName: 'Lockout Race User',
      passwordHash: await bcrypt.hash(STRONG, 4),
      role: 'phuta',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      failedAttempts: 0,
      createdAt: new Date().toISOString(),
    }).onConflictDoNothing()
    await db.update(users).set({ tokenVersion: 1, status: 'ACTIVE', failedAttempts: 0 }).where(eq(users.id, userId))
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId))
  })

  it('10 concurrent sai mật khẩu: failedAttempts phải = 10 (lock) — lost update sẽ chỉ tăng ~1', async () => {
    await db.update(users).set({ failedAttempts: 0, status: 'ACTIVE' }).where(eq(users.id, userId))

    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        authApp.request('/login', {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ username, password: 'WrongPass@1', parishId }),
        }),
      ),
    )
    const statuses = attempts.map((r) => r.status)
    console.log(`lockout-race: statuses = [${statuses.join(', ')}]`)

    const [row] = await db.select({ status: users.status, failedAttempts: users.failedAttempts, tokenVersion: users.tokenVersion }).from(users).where(eq(users.id, userId))
    console.log(`lockout-race: final failedAttempts = ${row?.failedAttempts}, status = ${row?.status}`)

    // Không race: 10 lần sai liên tiếp → failedAttempts = 10, status = LOCKED (threshold 5)
    expect(row?.failedAttempts).toBe(10)
    expect(row?.status).toBe('LOCKED')
    expect(row?.tokenVersion).toBe(2)
  }, 30000)
})
