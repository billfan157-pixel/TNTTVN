import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { auditLogs, nativePushTokens, users } from '../../db/schema.js'
import { generateTokens } from '../../middleware/auth.js'
import notificationsRouter from '../../routes/notifications.js'

const suffix = Date.now()
const parishA = `native-route-a-${suffix}`
const parishB = `native-route-b-${suffix}`
const userA = `native-route-user-a-${suffix}`
const userB = `native-route-user-b-${suffix}`
const tokenA = generateTokens({ userId: userA, username: `native_route_a_${suffix}`, role: 'phuhuynh', parishId: parishA, tokenVersion: 1 }).accessToken
const tokenB = generateTokens({ userId: userB, username: `native_route_b_${suffix}`, role: 'phuhuynh', parishId: parishB, tokenVersion: 1 }).accessToken
const installationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const deviceToken = `native-device-token-${suffix}`

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

describe('native push registration security boundary', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: userA, username: `native_route_a_${suffix}`, passwordHash: 'hash', fullName: 'Native Route A', role: 'phuhuynh', parishId: parishA, tokenVersion: 1 },
      { id: userB, username: `native_route_b_${suffix}`, passwordHash: 'hash', fullName: 'Native Route B', role: 'phuhuynh', parishId: parishB, tokenVersion: 1 },
    ])
  })

  afterAll(async () => {
    await db.delete(nativePushTokens).where(eq(nativePushTokens.installationId, installationId))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishA))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishB))
    await db.delete(users).where(eq(users.parishId, parishA))
    await db.delete(users).where(eq(users.parishId, parishB))
  })

  it('rebinds one physical installation to the currently authenticated account without leaking token to audit', async () => {
    const first = await notificationsRouter.request('/native/register', {
      method: 'POST',
      headers: headers(tokenA),
      body: JSON.stringify({ installationId, platform: 'android', token: deviceToken }),
    })
    const second = await notificationsRouter.request('/native/register', {
      method: 'POST',
      headers: headers(tokenB),
      body: JSON.stringify({ installationId, platform: 'android', token: deviceToken }),
    })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const rows = await db.select().from(nativePushTokens).where(eq(nativePushTokens.installationId, installationId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ parishId: parishB, userId: userB, platform: 'android' })

    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'NATIVE_PUSH_REGISTER'), eq(auditLogs.parishId, parishB)))
    expect(JSON.stringify(audits)).not.toContain(deviceToken)
    expect(JSON.stringify(audits)).not.toContain(installationId)
  })

  it('does not let another account unregister an installation it does not own', async () => {
    const response = await notificationsRouter.request('/native/unregister', {
      method: 'POST',
      headers: headers(tokenA),
      body: JSON.stringify({ installationId }),
    })
    expect(response.status).toBe(200)
    const rows = await db.select().from(nativePushTokens).where(eq(nativePushTokens.installationId, installationId))
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(userB)
  })
})
