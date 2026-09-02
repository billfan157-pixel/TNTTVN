import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { nativePushTokens, users } from '../../db/schema.js'

const providers = vi.hoisted(() => ({
  fcm: vi.fn(),
  apns: vi.fn(),
}))

vi.mock('../../services/fcmPushProvider.js', () => ({
  isFcmConfigured: () => true,
  sendFcmPush: providers.fcm,
}))

vi.mock('../../services/apnsPushProvider.js', () => ({
  isApnsConfigured: () => true,
  sendApnsPush: providers.apns,
}))

const suffix = Date.now()
const parishA = `native-push-a-${suffix}`
const parishB = `native-push-b-${suffix}`
const userA1 = `native-user-a1-${suffix}`
const userA2 = `native-user-a2-${suffix}`
const userB = `native-user-b-${suffix}`

async function insertToken(id: string, installationId: string, platform: 'android' | 'ios', token: string, userId: string, parishId: string) {
  await db.insert(nativePushTokens).values({ id, installationId, platform, token, userId, parishId })
}

describe('nativePushService — targeting, tenant isolation and dead-token cleanup', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: userA1, username: `native_a1_${suffix}`, passwordHash: 'hash', fullName: 'Native A1', role: 'phuhuynh', parishId: parishA },
      { id: userA2, username: `native_a2_${suffix}`, passwordHash: 'hash', fullName: 'Native A2', role: 'phuhuynh', parishId: parishA },
      { id: userB, username: `native_b_${suffix}`, passwordHash: 'hash', fullName: 'Native B', role: 'phuhuynh', parishId: parishB },
    ])
  })

  beforeEach(async () => {
    providers.fcm.mockReset().mockResolvedValue({ sent: 0, failed: 0, deadTokens: [] })
    providers.apns.mockReset().mockResolvedValue({ sent: 0, failed: 0, deadTokens: [] })
    await db.delete(nativePushTokens).where(eq(nativePushTokens.parishId, parishA))
    await db.delete(nativePushTokens).where(eq(nativePushTokens.parishId, parishB))
  })

  afterAll(async () => {
    await db.delete(nativePushTokens).where(eq(nativePushTokens.parishId, parishA))
    await db.delete(nativePushTokens).where(eq(nativePushTokens.parishId, parishB))
    await db.delete(users).where(eq(users.parishId, parishA))
    await db.delete(users).where(eq(users.parishId, parishB))
  })

  it('gửi đúng user trong đúng parish và loại URL ngoài app khỏi payload native', async () => {
    await insertToken(`npt-a1-${suffix}`, `installation_a1_${suffix}`, 'android', `token-android-a1-${suffix}`, userA1, parishA)
    await insertToken(`npt-a2-${suffix}`, `installation_a2_${suffix}`, 'ios', `token-ios-a2-${suffix}`, userA2, parishA)
    await insertToken(`npt-b-${suffix}`, `installation_b_${suffix}`, 'android', `token-android-b-${suffix}`, userB, parishB)
    providers.fcm.mockResolvedValue({ sent: 1, failed: 0, deadTokens: [] })

    const { sendNativePushToUsers } = await import('../../services/nativePushService.js')
    const result = await sendNativePushToUsers(parishA, [userA1], { title: 'T', body: 'B', url: 'https://evil.example' })

    expect(providers.fcm).toHaveBeenCalledWith(
      [`token-android-a1-${suffix}`],
      { title: 'T', body: 'B', url: undefined },
    )
    expect(providers.apns).toHaveBeenCalledWith([], expect.any(Object))
    expect(result.total).toBe(1)
    expect(result.sent).toBe(1)
  })

  it('xóa token chết nhưng giữ token còn sống và token của parish khác', async () => {
    const dead = `token-dead-a-${suffix}`
    const alive = `token-alive-a-${suffix}`
    const otherParish = `token-b-${suffix}`
    await insertToken(`npt-dead-${suffix}`, `installation_dead_${suffix}`, 'android', dead, userA1, parishA)
    await insertToken(`npt-alive-${suffix}`, `installation_alive_${suffix}`, 'android', alive, userA2, parishA)
    await insertToken(`npt-other-${suffix}`, `installation_other_${suffix}`, 'android', otherParish, userB, parishB)
    providers.fcm.mockResolvedValue({ sent: 1, failed: 1, deadTokens: [dead] })

    const { sendNativePushToParish } = await import('../../services/nativePushService.js')
    const result = await sendNativePushToParish(parishA, { title: 'T', body: 'B', url: '/notices' })

    expect(result.removed).toBe(1)
    expect(await db.select().from(nativePushTokens).where(and(eq(nativePushTokens.parishId, parishA), eq(nativePushTokens.token, dead)))).toHaveLength(0)
    expect(await db.select().from(nativePushTokens).where(eq(nativePushTokens.token, alive))).toHaveLength(1)
    expect(await db.select().from(nativePushTokens).where(eq(nativePushTokens.token, otherParish))).toHaveLength(1)
  })
})
