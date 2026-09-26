import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { academicYears, branches, classes, notifications, students, telegramLinks, telegramLinkTokens, users } from '../../db/schema.js'
import { generateId } from '../../utils/id.js'

vi.mock('../../services/appPushService.js', () => ({
  sendAppPushToUsers: vi.fn(),
}))

const parishId = `queue-${Date.now()}`
const parentId = `${parishId}-parent`
const lockedId = `${parishId}-locked`
const studentId = `${parishId}-student`
const branchId = `${parishId}-branch`
const yearId = `${parishId}-year`
const classId = `${parishId}-class`
const successResult: Awaited<ReturnType<typeof import('../../services/appPushService.js')['sendAppPushToUsers']>> = {
  configured: true,
  sent: 1,
  failed: 0,
  total: 1,
  removed: 0,
  skipped: 0,
  deliveredEndpoints: [],
  lastProviderError: undefined,
  channels: {
    web: { configured: true, sent: 1, failed: 0, total: 1, removed: 0 },
    native: { configured: false, sent: 0, failed: 0, total: 0, removed: 0, skipped: 0, platforms: { android: false, ios: false } },
  },
}

describe('notificationQueue web/native delivery and Telegram retirement', () => {
  beforeAll(async () => {
    await db.insert(branches).values({ id: branchId, name: 'Synthetic', scarfColor: '#fff', ageMin: 6, ageMax: 12, parishId })
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-06-30', parishId })
    await db.insert(classes).values({ id: classId, code: classId, name: 'Synthetic', branchId, academicYearId: yearId, parishId })
    await db.insert(users).values([
      { id: parentId, username: parentId, parishId, fullName: 'Synthetic Parent', passwordHash: 'unused', role: 'phuhuynh', phone: '0900000201', status: 'ACTIVE' },
      { id: lockedId, username: lockedId, parishId, fullName: 'Locked staff', passwordHash: 'unused', role: 'phuta', status: 'LOCKED' },
    ])
    await db.insert(students).values({
      id: studentId, code: studentId, parishId, classId, fullName: 'Synthetic Child', holyName: 'Giuse', gender: 'Nam',
      dateOfBirth: '2015-01-01', parentName: 'Synthetic', parentPhone: '0900000201', address: 'Synthetic', branch: 'AuNhi',
    })
  })

  afterAll(async () => {
    delete process.env.DEPLOYMENT_PARISH_ID
    await db.delete(notifications).where(eq(notifications.parishId, parishId))
    await db.delete(telegramLinks).where(eq(telegramLinks.parishId, parishId))
    await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
    await db.delete(classes).where(eq(classes.parishId, parishId))
    await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
    await db.delete(branches).where(eq(branches.parishId, parishId))
  })

  beforeEach(async () => {
    const { getQueueLength } = await import('../../services/notificationQueue.js')
    await vi.waitFor(() => expect(getQueueLength()).toBe(0), { timeout: 3000 })
    vi.clearAllMocks()
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    vi.mocked(sendAppPushToUsers).mockResolvedValue(successResult)
    await db.delete(notifications).where(eq(notifications.parishId, parishId))
    await db.delete(telegramLinks).where(eq(telegramLinks.parishId, parishId))
    await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.parishId, parishId))
  })

  it('durably persists and delivers a targeted Web/Native Push item', async () => {
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    const id = await enqueueNotification('webpush', 'info', 'Tin {studentName}', { studentName: 'A' }, parishId, undefined, { webpushUserIds: [parentId] })
    await vi.waitFor(() => expect(sendAppPushToUsers).toHaveBeenCalledWith(
      parishId, [parentId], expect.objectContaining({ title: 'Thông báo Giáo Xứ', body: 'Tin A' }),
    ), { timeout: 3000 })
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(row).toMatchObject({ type: 'web_push', status: 'sent', targetUserIds: JSON.stringify([parentId]) })
    }, { timeout: 3000 })
  })

  it('leaves delivery to the Worker when Render no longer owns maintenance', async () => {
    const previousOwner = process.env.CATEVIA_MAINTENANCE_OWNER
    process.env.CATEVIA_MAINTENANCE_OWNER = 'cloudflare'
    try {
      const { enqueueNotification, runNotificationDeliveryCycle } = await import('../../services/notificationQueue.js')
      const { sendAppPushToUsers } = await import('../../services/appPushService.js')
      const id = await enqueueNotification('webpush', 'info', 'Scheduled item', {}, parishId, undefined, { webpushUserIds: [parentId] })
      const [pending] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(pending.status).toBe('retrying')
      expect(sendAppPushToUsers).not.toHaveBeenCalled()

      await runNotificationDeliveryCycle()
      const [sent] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(sent.status).toBe('sent')
      expect(sendAppPushToUsers).toHaveBeenCalledTimes(1)
    } finally {
      if (previousOwner === undefined) delete process.env.CATEVIA_MAINTENANCE_OWNER
      else process.env.CATEVIA_MAINTENANCE_OWNER = previousOwner
    }
  })

  it('persists a Worker push batch and resumes without consuming retry attempts or resending devices', async () => {
    const previousRuntime = process.env.CATEVIA_RUNTIME
    const previousWebSocketPair = (globalThis as { WebSocketPair?: unknown }).WebSocketPair
    process.env.CATEVIA_RUNTIME = 'cloudflare-worker'
    Object.defineProperty(globalThis, 'WebSocketPair', { configurable: true, value: function WebSocketPair() {} })
    try {
      const { enqueueNotification, runNotificationDeliveryCycle } = await import('../../services/notificationQueue.js')
      const { sendAppPushToUsers } = await import('../../services/appPushService.js')
      const firstEndpoint = 'https://push.example/first'
      const secondEndpoint = 'https://push.example/second'
      vi.mocked(sendAppPushToUsers)
        .mockResolvedValueOnce({ ...successResult, deliveredEndpoints: [firstEndpoint], deferred: 1 })
        .mockResolvedValueOnce({ ...successResult, deliveredEndpoints: [secondEndpoint], deferred: 0 })
      const id = await enqueueNotification('webpush', 'info', 'Batched', {}, parishId, 3, { webpushUserIds: [parentId] })

      await runNotificationDeliveryCycle()
      const [partial] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(partial).toMatchObject({ status: 'retrying', attemptCount: 0, deliveredEndpoints: JSON.stringify([firstEndpoint]) })
      expect(partial.nextAttemptAt).toBeTruthy()

      await db.update(notifications).set({ nextAttemptAt: null }).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      await runNotificationDeliveryCycle()
      const [completed] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(completed).toMatchObject({ status: 'sent', attemptCount: 1, deliveredEndpoints: JSON.stringify([firstEndpoint, secondEndpoint]) })
      expect(sendAppPushToUsers).toHaveBeenNthCalledWith(2, parishId, [parentId], expect.anything(), [firstEndpoint])
    } finally {
      if (previousRuntime === undefined) delete process.env.CATEVIA_RUNTIME
      else process.env.CATEVIA_RUNTIME = previousRuntime
      if (previousWebSocketPair === undefined) delete (globalThis as { WebSocketPair?: unknown }).WebSocketPair
      else Object.defineProperty(globalThis, 'WebSocketPair', { configurable: true, value: previousWebSocketPair })
    }
  })

  it('records an item as failed without dispatch when max attempts is zero', async () => {
    const { enqueueNotification, getFailedItems } = await import('../../services/notificationQueue.js')
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    const id = await enqueueNotification('webpush', 'alert', 'Fail test', {}, parishId, 0, { webpushUserIds: [parentId] })
    expect(getFailedItems().some(item => item.id === id)).toBe(true)
    expect(sendAppPushToUsers).not.toHaveBeenCalled()
    const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
    expect(row.status).toBe('failed')
  })

  it('recovers the original child recipient scope and revalidates ownership', async () => {
    const id = generateId('NOT')
    await db.insert(notifications).values({
      id, type: 'web_push', channel: 'absence', deliveryKind: 'absence', status: 'retrying', recipient: 'Parent',
      message: 'legacy private detail must not leave', studentId, triggeredByType: 'system', targetUserIds: JSON.stringify([parentId]), parishId,
    })
    const { recoverQueueFromDb, enqueueNotification } = await import('../../services/notificationQueue.js')
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    await recoverQueueFromDb()
    await enqueueNotification('webpush', 'info', 'kick', {}, parishId, undefined, { webpushUserIds: [parentId] })
    await vi.waitFor(() => expect(sendAppPushToUsers).toHaveBeenCalledWith(
      parishId, [parentId], expect.objectContaining({ body: 'Có cập nhật học vụ trong ứng dụng Catevia. Vui lòng đăng nhập để xem.' }),
    ), { timeout: 3000 })
  })

  it('propagates durable recovery failures so startup cannot bind as healthy', async () => {
    const updateSpy = vi.spyOn(db as any, 'update').mockImplementationOnce(() => {
      throw new Error('synthetic recovery failure')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { recoverQueueFromDb } = await import('../../services/notificationQueue.js')
      await expect(recoverQueueFromDb()).rejects.toThrow('synthetic recovery failure')
    } finally {
      updateSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })

  it('fails closed on malformed persisted target JSON instead of broadcasting', async () => {
    const id = generateId('NOT')
    await db.insert(notifications).values({
      id, type: 'web_push', channel: 'absence', deliveryKind: 'info', status: 'retrying', recipient: 'Parent',
      message: 'Không được broadcast', triggeredByType: 'system', targetUserIds: '{bad-json', parishId,
    })
    const { recoverQueueFromDb, enqueueNotification } = await import('../../services/notificationQueue.js')
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    await recoverQueueFromDb()
    await enqueueNotification('webpush', 'info', 'kick', {}, parishId, undefined, { webpushUserIds: [parentId] })
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(row).toMatchObject({ status: 'failed', error: 'DELIVERY_TARGET_NOT_ACTIVE' })
    }, { timeout: 3000 })
    expect(sendAppPushToUsers).not.toHaveBeenCalledWith(parishId, expect.anything(), expect.objectContaining({ body: 'Không được broadcast' }))
  })

  it('fails closed on a persisted row without target IDs instead of broadcasting', async () => {
    const id = generateId('NOT')
    await db.insert(notifications).values({
      id, type: 'web_push', channel: 'reminder', deliveryKind: 'reminder', status: 'retrying', recipient: 'Legacy',
      message: 'Không được gửi toàn giáo xứ', triggeredByType: 'system', targetUserIds: null, parishId,
    })
    const { recoverQueueFromDb, enqueueNotification } = await import('../../services/notificationQueue.js')
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    await recoverQueueFromDb()
    await enqueueNotification('webpush', 'info', 'kick', {}, parishId, undefined, { webpushUserIds: [parentId] })
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(row).toMatchObject({ status: 'failed', error: 'DELIVERY_TARGET_NOT_ACTIVE' })
    }, { timeout: 3000 })
    expect(sendAppPushToUsers).not.toHaveBeenCalledWith(parishId, expect.anything(), expect.objectContaining({ body: 'Không được gửi toàn giáo xứ' }))
  })

  it('suppresses a targeted reminder when its user is no longer active', async () => {
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    const id = await enqueueNotification('webpush', 'reminder', 'Nhắc việc riêng', {}, parishId, undefined, { webpushUserIds: [lockedId] })
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(row).toMatchObject({ status: 'failed', error: 'DELIVERY_TARGET_NOT_ACTIVE' })
    }, { timeout: 3000 })
    expect(sendAppPushToUsers).not.toHaveBeenCalled()
  })

  it('does not recover or enqueue work outside the enforced deployment parish', async () => {
    const foreignParish = `${parishId}-foreign`
    const id = generateId('NOT')
    await db.insert(notifications).values({
      id, type: 'web_push', channel: 'absence', deliveryKind: 'info', status: 'retrying', recipient: 'System',
      message: 'Foreign deployment message', triggeredByType: 'system', parishId: foreignParish,
    })
    process.env.DEPLOYMENT_PARISH_ID = parishId
    try {
      const { recoverQueueFromDb, enqueueNotification } = await import('../../services/notificationQueue.js')
      const { sendAppPushToUsers } = await import('../../services/appPushService.js')
      await expect(enqueueNotification('webpush', 'info', 'Foreign direct enqueue', {}, foreignParish, undefined, { webpushUserIds: [parentId] })).rejects.toThrow(/outside this deployment scope/)
      await recoverQueueFromDb()
      await enqueueNotification('webpush', 'info', 'Local kick', {}, parishId, undefined, { webpushUserIds: [parentId] })
      await vi.waitFor(async () => {
        const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, foreignParish)))
        expect(row.status).toBe('retrying')
      }, { timeout: 3000 })
      expect(sendAppPushToUsers).not.toHaveBeenCalledWith(foreignParish, expect.anything(), expect.anything())
    } finally {
      delete process.env.DEPLOYMENT_PARISH_ID
      await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, foreignParish)))
    }
  })

  it('does not claim success when no app-push provider is configured', async () => {
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    vi.mocked(sendAppPushToUsers).mockResolvedValue({ ...successResult, configured: false, sent: 0, total: 0 })
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'info', 'Provider test', {}, parishId, undefined, { webpushUserIds: [parentId] })
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(row).toMatchObject({ status: 'failed', error: 'PUSH_PROVIDER_NOT_CONFIGURED' })
    }, { timeout: 3000 })
  })

  it('does not claim targeted delivery when the active user has no push endpoint', async () => {
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    vi.mocked(sendAppPushToUsers).mockResolvedValue({ ...successResult, sent: 0, failed: 0, total: 0 })
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'reminder', 'Endpoint test', {}, parishId, undefined, { webpushUserIds: [parentId] })
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(row).toMatchObject({ status: 'failed', error: 'DELIVERY_TARGET_UNAVAILABLE' })
    }, { timeout: 3000 })
  })

  it('terminalizes a partial provider failure at the configured attempt limit', async () => {
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    vi.mocked(sendAppPushToUsers).mockResolvedValue({ ...successResult, sent: 1, failed: 1, total: 2 })
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'info', 'Partial test', {}, parishId, 1, { webpushUserIds: [parentId] })
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(row.status).toBe('failed')
      expect(row.error).toContain('APP_PUSH_PARTIAL_FAILURE')
    }, { timeout: 3000 })
  })

  it('persists deliveredEndpoints on partial delivery failure so retries exclude them', async () => {
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    const delivered = ['https://push.example/delivered-1']
    vi.mocked(sendAppPushToUsers).mockResolvedValueOnce({
      ...successResult,
      sent: 1,
      failed: 1,
      total: 2,
      deliveredEndpoints: delivered,
    })
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'info', 'Partial delivered test', {}, parishId, 1, { webpushUserIds: [parentId] })
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(row.status).toBe('failed')
      expect(row.deliveredEndpoints).toBe(JSON.stringify(delivered))
    }, { timeout: 3000 })
  })

  it('suppresses delivery when class enrollment check finds no active students for parent in class', async () => {
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'reminder', 'Class reminder', { classId: 'non-existent-class' }, parishId, 1, { webpushUserIds: [parentId] })
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(row).toMatchObject({ status: 'failed', error: 'DELIVERY_TARGET_NOT_ACTIVE' })
    }, { timeout: 3000 })
    expect(sendAppPushToUsers).not.toHaveBeenCalled()
  })

  it('does not retry healthy endpoints when every provider failure was permanently removed', async () => {
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    vi.mocked(sendAppPushToUsers).mockResolvedValue({ ...successResult, sent: 1, failed: 1, total: 2, removed: 1 })
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'info', 'Dead endpoint test', {}, parishId, 3, { webpushUserIds: [parentId] })
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, parishId)))
      expect(row).toMatchObject({ status: 'sent', attemptCount: 1, error: null })
    }, { timeout: 3000 })
    expect(sendAppPushToUsers).toHaveBeenCalledTimes(1)
  })

  it('revokes legacy links/tokens and terminalizes only undelivered Telegram work', async () => {
    const pendingId = generateId('NOT')
    const sentId = generateId('NOT')
    await db.insert(telegramLinkTokens).values({ id: `${parishId}-token`, userId: parentId, parishId, tokenHash: `${parishId}-hash`, expiresAt: '2099-01-01T00:00:00.000Z' })
    await db.insert(telegramLinks).values({ id: `${parishId}-link`, userId: parentId, parishId, chatId: `${parishId}-chat`, status: 'ACTIVE', notificationsEnabled: 1 })
    await db.insert(notifications).values([
      { id: pendingId, type: 'telegram', channel: 'absence', status: 'retrying', recipient: 'Parent', message: 'pending', triggeredByType: 'system', parishId },
      { id: sentId, type: 'telegram', channel: 'absence', status: 'sent', recipient: 'Parent', message: 'history', triggeredByType: 'system', parishId },
    ])
    const retiredAt = new Date('2026-09-08T00:00:00.000Z')
    const { retireLegacyTelegramChannelData } = await import('../../services/notificationQueue.js')
    await retireLegacyTelegramChannelData(retiredAt)
    const [token] = await db.select().from(telegramLinkTokens).where(eq(telegramLinkTokens.parishId, parishId))
    const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.parishId, parishId))
    const rows = await db.select().from(notifications).where(eq(notifications.parishId, parishId))
    expect(token.consumedAt).toBe(retiredAt.toISOString())
    expect(link).toMatchObject({ status: 'REVOKED', notificationsEnabled: 0, revokedAt: retiredAt.toISOString() })
    expect(rows.find(row => row.id === pendingId)).toMatchObject({ status: 'failed', error: 'CHANNEL_RETIRED' })
    expect(rows.find(row => row.id === sentId)).toMatchObject({ status: 'sent', message: 'history' })
  })

  it('shutdown waits for an active app-push delivery before resolving', async () => {
    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    const { enqueueNotification, getQueueLength, stopNotificationQueue } = await import('../../services/notificationQueue.js')
    let release!: () => void
    vi.mocked(sendAppPushToUsers).mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(successResult) }))
    await enqueueNotification('webpush', 'info', 'Shutdown drain', {}, parishId, undefined, { webpushUserIds: [parentId] })
    await vi.waitFor(() => expect(sendAppPushToUsers).toHaveBeenCalled(), { timeout: 3000 })
    let stopped = false
    const stopPromise = stopNotificationQueue().then(() => { stopped = true })
    await Promise.resolve()
    expect(stopped).toBe(false)
    release()
    await stopPromise
    expect(stopped).toBe(true)
    expect(getQueueLength()).toBe(0)
  })
})
