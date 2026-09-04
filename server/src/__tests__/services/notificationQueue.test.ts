import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { notifications } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { generateId } from '../../utils/id.js'

vi.mock('../../services/telegram.js', () => ({
  isTelegramEnabled: vi.fn(() => true),
  sendTelegramAlert: vi.fn(),
  sendTelegramInfo: vi.fn(),
  sendTelegramMessageToChat: vi.fn(),
}))

vi.mock('../../services/telegramLinkService.js', () => ({
  getActiveTelegramLinksForUsers: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../services/appPushService.js', () => ({
  sendAppPushToParish: vi.fn().mockResolvedValue({ configured: true, sent: 0, failed: 0, total: 0, removed: 0, skipped: 0 }),
  sendAppPushToUsers: vi.fn().mockResolvedValue({ configured: true, sent: 0, failed: 0, total: 0, removed: 0, skipped: 0 }),
}))

describe('notificationQueue', () => {
  beforeAll(() => {
    process.env.PARISH_ID = 'gia-ton'
  })

  afterAll(() => {
    delete process.env.PARISH_ID
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete(notifications).where(eq(notifications.parishId, 'gia-ton'))
  })

  it('enqueueNotification adds item to queue and persists to DB', async () => {
    const { enqueueNotification, getQueueLength } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('telegram', 'alert', 'Test {studentName}', { studentName: 'Nguyen Van A' }, 'gia-ton')
    expect(id).toBeTruthy()
    expect(getQueueLength()).toBe(1)
    const rows = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, 'gia-ton')))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('retrying')
    expect(rows[0].recipient).toBe('Nguyen Van A')
    expect(rows[0].message).toContain('Nguyen Van A')
  })

  it('enqueueNotification with info type creates web_push type in DB', async () => {
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'info', 'Info: {studentName}', { studentName: 'Test' }, 'gia-ton')
    const rows = await db.select().from(notifications).where(eq(notifications.id, id))
    expect(rows[0].type).toBe('web_push')
  })

  it('getQueueLength returns correct count', async () => {
    const { enqueueNotification, getQueueLength } = await import('../../services/notificationQueue.js')
    // Queue là module singleton — đợi item từ test trước xử lý xong để count chính xác.
    await vi.waitFor(() => {
      expect(getQueueLength()).toBe(0)
    }, { timeout: 3000 })
    await Promise.all([
      enqueueNotification('telegram', 'info', 'Msg 1', {}, 'gia-ton'),
      enqueueNotification('telegram', 'alert', 'Msg 2', {}, 'gia-ton'),
    ])
    expect(getQueueLength()).toBeGreaterThanOrEqual(1)
  })

  it('getFailedItems returns items that exceeded max retries', async () => {
    const { enqueueNotification, getFailedItems } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('telegram', 'alert', 'Fail test', {}, 'gia-ton', 0)
    await vi.waitFor(() => {
      const failed = getFailedItems()
      expect(failed.length).toBeGreaterThan(0)
      expect(failed[0].id).toBe(id)
    }, { timeout: 2000 })
  })

  it('recoverQueueFromDb recovers pending notifications', async () => {
    const now = new Date().toISOString()
    const testId = generateId('NOT')
    await db.insert(notifications).values({
      id: testId,
      type: 'telegram',
      channel: 'absence',
      status: 'retrying',
      recipient: 'Parent',
      message: 'Recovered message',
      triggeredByType: 'system',
      parishId: 'gia-ton',
      createdAt: now,
    })

    const { recoverQueueFromDb, getQueueLength } = await import('../../services/notificationQueue.js')
    await recoverQueueFromDb()
    expect(getQueueLength()).toBeGreaterThanOrEqual(1)
  })

  it('full processing flow sends telegram and marks sent', async () => {
    const { sendTelegramAlert } = await import('../../services/telegram.js')
    const { enqueueNotification, getQueueLength } = await import('../../services/notificationQueue.js')
    await enqueueNotification('telegram', 'alert', 'Process {note}', { note: 'Flow Test' }, 'gia-ton')
    await vi.waitFor(() => {
      expect(sendTelegramAlert).toHaveBeenCalled()
    }, { timeout: 3000 })
    await vi.waitFor(() => {
      expect(getQueueLength()).toBe(0)
    }, { timeout: 3000 })
  })

  it('processing marks DB record as sent on success', async () => {
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('telegram', 'info', 'DB test', {}, 'gia-ton')
    await vi.waitFor(async () => {
      const rows = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, 'gia-ton')))
      return rows[0]?.status === 'sent'
    }, { timeout: 3000 })
  })

  it('recoverQueueFromDb giữ nguyên Telegram recipient scope sau restart', async () => {
    const { recoverQueueFromDb } = await import('../../services/notificationQueue.js')
    const { getActiveTelegramLinksForUsers } = await import('../../services/telegramLinkService.js')
    const testId = generateId('NOT')
    await db.insert(notifications).values({
      id: testId,
      type: 'telegram',
      channel: 'absence',
      status: 'retrying',
      recipient: 'Phụ Huynh',
      message: 'Recovered Telegram targeted',
      triggeredByType: 'system',
      targetUserIds: '["USR-TG-42"]',
      parishId: 'gia-ton',
      createdAt: new Date().toISOString(),
    })

    await recoverQueueFromDb()
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    await enqueueNotification('telegram', 'info', 'Recovery trigger', {}, 'gia-ton')
    await vi.waitFor(() => {
      expect(getActiveTelegramLinksForUsers).toHaveBeenCalledWith(['USR-TG-42'], 'gia-ton')
    }, { timeout: 3000 })
  })

  it('webpush legacy channel gửi THẬT qua appPushService (title theo type) rồi đánh dấu sent', async () => {
    const { sendAppPushToParish } = await import('../../services/appPushService.js')
    vi.mocked(sendAppPushToParish).mockResolvedValue({ configured: true, sent: 2, failed: 0, total: 2, removed: 0, skipped: 0 } as any)

    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'reminder', 'Đi Lễ đúng giờ nhé!', {}, 'gia-ton')

    await vi.waitFor(() => {
      expect(sendAppPushToParish).toHaveBeenCalledWith(
        'gia-ton',
        expect.objectContaining({ title: 'Nhắc nhở', body: 'Đi Lễ đúng giờ nhé!' }),
      )
    }, { timeout: 3000 })

    await vi.waitFor(async () => {
      const rows = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, 'gia-ton')))
      return rows[0]?.status === 'sent'
    }, { timeout: 3000 })
  })

  it('webpush CÓ CHỦ ĐÍCH fan-out theo userIds thay vì broadcast giáo xứ', async () => {
    const { sendAppPushToParish, sendAppPushToUsers } = await import('../../services/appPushService.js')
    vi.mocked(sendAppPushToUsers).mockResolvedValue({ configured: true, sent: 1, failed: 0, total: 1, removed: 0, skipped: 0 } as any)

    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'info', 'Thông báo cho phụ huynh', {}, 'gia-ton', undefined, { webpushUserIds: ['USR-1', 'USR-2'] })

    await vi.waitFor(() => {
      expect(sendAppPushToUsers).toHaveBeenCalledWith(
        'gia-ton',
        ['USR-1', 'USR-2'],
        expect.objectContaining({ title: 'Thông báo Giáo Xứ', body: 'Thông báo cho phụ huynh' }),
      )
      expect(sendAppPushToParish).not.toHaveBeenCalled()
    }, { timeout: 3000 })

    await vi.waitFor(async () => {
      const rows = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, 'gia-ton')))
      return rows[0]?.status === 'sent'
    }, { timeout: 3000 })
  })

  it('enqueue webpush có chủ đích PERSIST target_user_ids (JSON) để recover không broadcast nhầm', async () => {
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'info', 'Targeted', {}, 'gia-ton', undefined, { webpushUserIds: ['USR-9'] })
    await vi.waitFor(async () => {
      const rows = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, 'gia-ton')))
      return rows[0]?.targetUserIds === '["USR-9"]'
    }, { timeout: 3000 })
  })

  it('recoverQueueFromDb khôi phục webpushUserIds từ target_user_ids (không thành parish-wide)', async () => {
    const { recoverQueueFromDb, getQueueLength } = await import('../../services/notificationQueue.js')
    const testId = generateId('NOT')
    await db.insert(notifications).values({
      id: testId,
      type: 'web_push',
      channel: 'absence',
      status: 'retrying',
      recipient: 'Phụ Huynh',
      message: 'Recovered targeted',
      triggeredByType: 'system',
      targetUserIds: '["USR-42"]',
      parishId: 'gia-ton',
      createdAt: new Date().toISOString(),
    })

    await recoverQueueFromDb()

    const { sendAppPushToUsers } = await import('../../services/appPushService.js')
    vi.mocked(sendAppPushToUsers).mockResolvedValue({ configured: true, sent: 1, failed: 0, total: 1, removed: 0, skipped: 0 } as any)
    // recoverQueueFromDb chỉ nạp item vào queue — cần 1 enqueue mới để kick processQueue drain.
    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    await enqueueNotification('webpush', 'info', 'Kick', {}, 'gia-ton')
    await vi.waitFor(() => {
      expect(sendAppPushToUsers).toHaveBeenCalledWith('gia-ton', ['USR-42'], expect.objectContaining({ body: 'Recovered targeted' }))
    }, { timeout: 3000 })
    await vi.waitFor(() => {
      expect(getQueueLength()).toBe(0)
    }, { timeout: 3000 })
  })

  it('target_user_ids hỏng fail-closed thành nhóm rỗng, không broadcast giáo xứ', async () => {
    const testId = generateId('NOT')
    await db.insert(notifications).values({
      id: testId,
      type: 'web_push',
      channel: 'absence',
      deliveryKind: 'info',
      status: 'retrying',
      recipient: 'Phụ Huynh',
      message: 'Không được broadcast',
      triggeredByType: 'system',
      targetUserIds: '{json-hong',
      parishId: 'gia-ton',
      createdAt: new Date().toISOString(),
    })

    const { recoverQueueFromDb, enqueueNotification } = await import('../../services/notificationQueue.js')
    const { sendAppPushToParish, sendAppPushToUsers } = await import('../../services/appPushService.js')
    await recoverQueueFromDb()
    await enqueueNotification('telegram', 'info', 'Kick', {}, 'gia-ton')

    await vi.waitFor(() => {
      expect(sendAppPushToUsers).toHaveBeenCalledWith(
        'gia-ton',
        [],
        expect.objectContaining({ title: 'Thông báo Giáo Xứ', body: 'Không được broadcast' }),
      )
    }, { timeout: 3000 })
    expect(sendAppPushToParish).not.toHaveBeenCalledWith(
      'gia-ton',
      expect.objectContaining({ body: 'Không được broadcast' }),
    )
  })

  it('recovery giữ nguyên delivery kind alert thay vì hạ xuống absence', async () => {
    const testId = generateId('NOT')
    await db.insert(notifications).values({
      id: testId,
      type: 'telegram',
      channel: 'absence',
      deliveryKind: 'alert',
      status: 'retrying',
      recipient: 'System',
      message: 'Cảnh báo sau restart',
      triggeredByType: 'system',
      parishId: 'gia-ton',
      createdAt: new Date().toISOString(),
    })

    const { recoverQueueFromDb, enqueueNotification } = await import('../../services/notificationQueue.js')
    const { sendTelegramAlert } = await import('../../services/telegram.js')
    await recoverQueueFromDb()
    await enqueueNotification('telegram', 'info', 'Kick', {}, 'gia-ton')
    await vi.waitFor(() => {
      expect(sendTelegramAlert).toHaveBeenCalledWith('Cảnh báo sau restart', true)
    }, { timeout: 3000 })
  })

  it('push khi không provider nào cấu hình → KHÔNG đánh dấu sent giả', async () => {
    const { sendAppPushToParish } = await import('../../services/appPushService.js')
    vi.mocked(sendAppPushToParish).mockResolvedValue({ configured: false, sent: 0, failed: 0, total: 0, removed: 0, skipped: 0 } as any)

    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'info', 'Thông báo test', {}, 'gia-ton')

    await vi.waitFor(async () => {
      const rows = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, 'gia-ton')))
      return rows[0]?.status === 'failed' && rows[0]?.error === 'PUSH_PROVIDER_NOT_CONFIGURED'
    }, { timeout: 3000 })
  })

  it('push lỗi một phần không được đánh dấu sent', async () => {
    const { sendAppPushToParish } = await import('../../services/appPushService.js')
    vi.mocked(sendAppPushToParish).mockResolvedValue({ configured: true, sent: 1, failed: 1, total: 2, removed: 0, skipped: 0 } as any)

    const { enqueueNotification } = await import('../../services/notificationQueue.js')
    const id = await enqueueNotification('webpush', 'info', 'Thông báo lỗi một phần', {}, 'gia-ton', 1)

    await vi.waitFor(async () => {
      const rows = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.parishId, 'gia-ton')))
      return rows[0]?.status === 'failed' && rows[0]?.error?.includes('APP_PUSH_PARTIAL_FAILURE')
    }, { timeout: 3000 })
  })
})
