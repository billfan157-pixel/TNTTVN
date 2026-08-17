import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { pushSubscriptions, users } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { generateId } from '../../utils/id.js'

const { webPushMock } = vi.hoisted(() => ({
  webPushMock: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}))
vi.mock('web-push', () => ({ default: webPushMock }))

const PREFIX = Date.now()
const parishId = `parish-webpush-${PREFIX}`
const userOneId = `usr-wp-1-${PREFIX}`
const userTwoId = `usr-wp-2-${PREFIX}`

async function insertSub(endpoint: string, userId: string | null = null) {
  await db.insert(pushSubscriptions).values({
    id: generateId('NOT'),
    endpoint,
    p256dh: 'p256dh-value',
    auth: 'auth-value',
    userId,
    parishId,
  }).onConflictDoNothing()
}

describe('webPushService', () => {
  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = 'PUBLIC_KEY_123'
    process.env.VAPID_PRIVATE_KEY = 'PRIVATE_KEY_123'
    // push_subscriptions.user_id có FK tới users — cần user thật cho các test có chủ đích.
    await db.insert(users).values([
      { id: userOneId, username: `wp1_${PREFIX}`, passwordHash: 'hash', fullName: 'WebPush User 1', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: userTwoId, username: `wp2_${PREFIX}`, passwordHash: 'hash', fullName: 'WebPush User 2', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
    ])
  })

  beforeEach(async () => {
    webPushMock.setVapidDetails.mockClear()
    webPushMock.sendNotification.mockClear()
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.parishId, parishId))
  })

  afterAll(async () => {
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
  })

  it('not configured khi thiếu VAPID keys (configured=false, không gửi gì)', async () => {
    delete process.env.VAPID_PRIVATE_KEY
    try {
      const { sendWebPushToParish } = await import('../../services/webPushService.js')
      const result = await sendWebPushToParish(parishId, { title: 'T', body: 'B' })
      expect(result.configured).toBe(false)
      expect(result.sent).toBe(0)
      expect(webPushMock.sendNotification).not.toHaveBeenCalled()
    } finally {
      process.env.VAPID_PRIVATE_KEY = 'PRIVATE_KEY_123'
    }
  })

  it('gửi tới mọi subscription của parish + trả counts', async () => {
    const { sendWebPushToParish } = await import('../../services/webPushService.js')
    await insertSub('https://endpoint-a.example')
    await insertSub('https://endpoint-b.example')
    webPushMock.sendNotification.mockResolvedValue(undefined as never)

    const result = await sendWebPushToParish(parishId, { title: 'Tiêu đề', body: 'Nội dung', url: '/notices' })

    expect(webPushMock.sendNotification).toHaveBeenCalledTimes(2)
    const firstPayload = webPushMock.sendNotification.mock.calls[0][1]
    const parsed = JSON.parse(firstPayload)
    expect(parsed.title).toBe('Tiêu đề')
    expect(parsed.body).toBe('Nội dung')
    expect(parsed.url).toBe('/notices')
    expect(result).toEqual({ configured: true, sent: 2, failed: 0, total: 2, removed: 0 })
  })

  it('xóa subscription chết (404/410) nhưng giữ sub lỗi tạm thời (500)', async () => {
    const { sendWebPushToParish } = await import('../../services/webPushService.js')
    const dead = 'https://endpoint-dead.example'
    const alive = 'https://endpoint-alive.example'
    const flaky = 'https://endpoint-flaky.example'
    await insertSub(dead)
    await insertSub(alive)
    await insertSub(flaky)

    webPushMock.sendNotification.mockImplementation(((_sub: { endpoint: string }) => {
      if (_sub.endpoint === dead) return Promise.reject({ statusCode: 410 })
      if (_sub.endpoint === flaky) return Promise.reject({ statusCode: 500 })
      return Promise.resolve(undefined)
    }) as never)

    const result = await sendWebPushToParish(parishId, { title: 'T', body: 'B' })

    expect(result).toEqual({ configured: true, sent: 1, failed: 2, total: 3, removed: 1 })

    const remaining = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.parishId, parishId))
    const endpoints = remaining.map((r) => r.endpoint)
    expect(endpoints).toContain(alive)
    expect(endpoints).toContain(flaky)
    expect(endpoints).not.toContain(dead)
  })

  it('configured=true ngay cả khi không có subscription nào', async () => {
    const { sendWebPushToParish } = await import('../../services/webPushService.js')
    const result = await sendWebPushToParish(parishId, { title: 'T', body: 'B' })
    expect(result).toEqual({ configured: true, sent: 0, failed: 0, total: 0, removed: 0 })
    expect(webPushMock.sendNotification).not.toHaveBeenCalled()
  })

  it('sendWebPushToUsers chỉ gửi tới subscriptions của userId mục tiêu (bỏ qua sub khác + sub không có userId)', async () => {
    const { sendWebPushToUsers } = await import('../../services/webPushService.js')
    await insertSub('https://endpoint-a.example', userOneId)
    await insertSub('https://endpoint-b.example', userTwoId)
    await insertSub('https://endpoint-anon.example', null)
    webPushMock.sendNotification.mockResolvedValue(undefined as never)

    const result = await sendWebPushToUsers(parishId, [userOneId], { title: 'T', body: 'B' })

    expect(webPushMock.sendNotification).toHaveBeenCalledTimes(1)
    const sentEndpoint = webPushMock.sendNotification.mock.calls[0][0].endpoint
    expect(sentEndpoint).toBe('https://endpoint-a.example')
    expect(result).toEqual({ configured: true, sent: 1, failed: 0, total: 1, removed: 0 })
  })

  it('sendWebPushToUsers trả zero khi userIds rỗng (không đụng subscription nào)', async () => {
    const { sendWebPushToUsers } = await import('../../services/webPushService.js')
    await insertSub('https://endpoint-c.example', userOneId)
    const result = await sendWebPushToUsers(parishId, [], { title: 'T', body: 'B' })
    expect(result).toEqual({ configured: true, sent: 0, failed: 0, total: 0, removed: 0 })
    expect(webPushMock.sendNotification).not.toHaveBeenCalled()
  })

  it('sendWebPushToUsers xóa subscription chết (410) CHỈ trong nhóm mục tiêu', async () => {
    const { sendWebPushToUsers } = await import('../../services/webPushService.js')
    const deadTarget = 'https://endpoint-dead-target.example'
    const deadOutside = 'https://endpoint-dead-outside.example'
    await insertSub(deadTarget, userOneId)
    await insertSub(deadOutside, userTwoId)

    webPushMock.sendNotification.mockImplementation(((_sub: { endpoint: string }) => {
      return Promise.reject({ statusCode: 410 })
    }) as never)

    const result = await sendWebPushToUsers(parishId, [userOneId], { title: 'T', body: 'B' })

    expect(result).toEqual({ configured: true, sent: 0, failed: 1, total: 1, removed: 1 })
    const remaining = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.parishId, parishId))
    const endpoints = remaining.map((r) => r.endpoint)
    expect(endpoints).not.toContain(deadTarget)
    expect(endpoints).toContain(deadOutside)
  })
})
