import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { refreshTokens, users } from '../db/schema.js'
import { createUser, forceLogoutUser } from '../services/userService.js'

const PREFIX = Date.now()
const parishId = `parish-user-atomic-${PREFIX}`

describe('account lifecycle transaction boundaries', () => {
  it('rolls back a newly inserted user when a later class assignment fails', async () => {
    const username = `atomic_glv_${PREFIX}`

    await expect(createUser(
      {
        username,
        holyName: 'Phêrô',
        fullName: 'Atomic Rollback User',
        role: 'chunhiem',
        assignedClasses: [`missing-class-${PREFIX}`],
      },
      `admin-${PREFIX}`,
      parishId,
      '127.0.0.1',
      'AtomicityTest',
    )).rejects.toThrow()

    const orphanUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.parishId, parishId), eq(users.username, username)))

    expect(orphanUsers).toHaveLength(0)
  })

  it('force logout revokes active refresh sessions and bumps tokenVersion together', async () => {
    const id = `usr-force-logout-${PREFIX}`
    const now = new Date().toISOString()

    await db.insert(users).values({
      id,
      username: `force_logout_${PREFIX}`,
      passwordHash: 'hash',
      fullName: 'Force Logout User',
      role: 'phuta',
      parishId,
      status: 'ACTIVE',
      tokenVersion: 4,
      createdAt: now,
    })
    await db.insert(refreshTokens).values({
      id: `rts-force-logout-${PREFIX}`,
      userId: id,
      parishId,
      tokenHash: `hash-${PREFIX}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })

    await expect(forceLogoutUser(
      id,
      `admin-${PREFIX}`,
      parishId,
      '127.0.0.1',
      'AtomicityTest',
    )).resolves.toBe(true)

    const [user] = await db
      .select({ tokenVersion: users.tokenVersion })
      .from(users)
      .where(and(eq(users.id, id), eq(users.parishId, parishId)))
      .limit(1)
    const [session] = await db
      .select({ revokedAt: refreshTokens.revokedAt })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, id), eq(refreshTokens.parishId, parishId)))
      .limit(1)

    expect(user?.tokenVersion).toBe(5)
    expect(session?.revokedAt).toBeTruthy()

    await db.delete(refreshTokens).where(and(eq(refreshTokens.userId, id), eq(refreshTokens.parishId, parishId)))
    await db.delete(users).where(and(eq(users.id, id), eq(users.parishId, parishId)))
  })
})
