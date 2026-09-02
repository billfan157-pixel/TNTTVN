import { sendTelegramAlert, sendTelegramInfo } from './telegram.js'
import { renderTemplate, type TemplateContext } from './templateEngine.js'
import { sendAppPushToParish, sendAppPushToUsers } from './appPushService.js'
import { db } from '../db/index.js'
import { notifications } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

interface NotificationQueueItem {
  id: string
  channel: 'telegram' | 'webpush'
  type: 'alert' | 'info' | 'absence' | 'report' | 'reminder'
  template: string
  context: TemplateContext
  renderedMessage: string
  retryCount: number
  maxRetries: number
  lastError: string | null
  createdAt: string
  parishId: string
  /** Web push CÓ CHỦ ĐÍCH: chỉ gửi tới subscriptions của các userId này. */
  webpushUserIds?: string[]
  telegramUserIds?: string[]
}

/** Tiêu đề mặc định cho web push theo loại (template không có field title). */
function webPushTitle(item: NotificationQueueItem): string {
  if (item.context.title) return item.context.title
  switch (item.type) {
    case 'absence': return 'Vắng học'
    case 'report': return 'Phiếu điểm'
    case 'reminder': return 'Nhắc nhở'
    case 'alert': return 'Cảnh báo'
    default: return 'Thông báo Giáo Xứ'
  }
}

const queue: NotificationQueueItem[] = []
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000
let recovered = false

async function ensureRecovered(): Promise<void> {
  if (!recovered) {
    recovered = true
    await recoverQueueFromDb()
  }
}

/**
 * ADR-016 (S24): Khởi tạo queue ở bootstrap — recover ngay các notification đang
 * 'retrying' sau restart mà KHÔNG cần đợi một notification mới được enqueue.
 * (Audit finding #8: trước đây ensureRecovered chỉ chạy trong processQueue, mà
 * processQueue chỉ trigger sau enqueueNotification → các tin kẹt vĩnh viễn nếu
 * server restart và không có hoạt động mới.)
 */
export async function initNotificationQueue(): Promise<void> {
  recovered = true
  await recoverQueueFromDb()
}

export async function recoverQueueFromDb(): Promise<void> {
  try {
    // ADR-016 (S14): Recover ALL parishes' retrying notifications, not just a
    // hardcoded one. The old filter `eq(notifications.parishId, process.env.PARISH_ID || 'thanh-gia')`
    // silently dropped notifications from parishes whose ID didn't match the env.
    const pending = await db.select().from(notifications).where(eq(notifications.status, 'retrying'))
    for (const row of pending) {
      const item: NotificationQueueItem = {
        id: row.id,
        channel: row.type === 'telegram' ? 'telegram' : 'webpush',
        type: row.channel === 'report_card' ? 'report' : row.channel === 'reminder' ? 'reminder' : 'absence',
        template: '',
        context: {},
        renderedMessage: row.message || '',
        retryCount: 0,
        maxRetries: MAX_RETRIES,
        lastError: row.error || null,
        createdAt: row.createdAt,
        parishId: row.parishId,
        ...(row.type === 'telegram'
          ? { telegramUserIds: row.targetUserIds ? (safeParseUserIds(row.targetUserIds) ?? []) : undefined }
          : { webpushUserIds: row.targetUserIds ? safeParseUserIds(row.targetUserIds) : undefined }),
      }
      queue.push(item)
    }
    if (pending.length > 0) {
      console.log(`[notificationQueue] recovered ${pending.length} pending notifications from DB`)
    }
  } catch (err) {
    console.error('[notificationQueue] failed to recover queue from DB:', err)
  }
}

export function enqueueNotification(
  channel: NotificationQueueItem['channel'],
  type: NotificationQueueItem['type'],
  template: string,
  context: TemplateContext,
  parishId: string,
  maxRetries: number = MAX_RETRIES,
  options?: { webpushUserIds?: string[]; telegramUserIds?: string[] },
): string {
  const id = generateId('NOT')
  const renderedMessage = renderTemplate(template, context)
  const item: NotificationQueueItem = {
    id,
    channel,
    type,
    template,
    context,
    renderedMessage,
    retryCount: 0,
    maxRetries,
    lastError: null,
    createdAt: new Date().toISOString(),
    parishId,
    webpushUserIds: options?.webpushUserIds,
    telegramUserIds: options?.telegramUserIds,
  }
  queue.push(item)

  // Task 6.7 & 6.8: Persist to notifications history table in DB
  // ADR-016 (S10): Persist synchronously via .then() so that DB write failures
  // are logged (not silently swallowed). The function signature stays sync to
  // preserve the existing API contract; processQueue() is triggered after the
  // DB write settles.
  db.insert(notifications)
    .values({
      id,
      type: channel === 'telegram' ? 'telegram' : 'web_push',
      channel: type === 'report' ? 'report_card' : type === 'reminder' ? 'reminder' : 'absence',
      status: 'retrying',
      recipient: context.parentPhone || context.studentName || 'System',
      message: renderedMessage,
      triggeredByType: 'system',
      createdAt: item.createdAt,
      parishId,
      targetUserIds: (item.webpushUserIds && item.webpushUserIds.length > 0)
        ? JSON.stringify(item.webpushUserIds)
        : (item.telegramUserIds && item.telegramUserIds.length > 0)
          ? JSON.stringify(item.telegramUserIds)
          : null,
    })
    .then(() => {
      // Only start processing after DB persistence succeeds.
      processQueue().catch(() => {})
    })
    .catch((err) => {
      console.error(`[notificationQueue] failed to persist notification ${id}:`, err)
      // Still process the queue — the in-memory item exists and will be retried.
      processQueue().catch(() => {})
    })

  return id
}

export function getQueueLength(): number {
  return queue.length
}

/** Parse JSON array userIds từ cột target_user_ids — sai định dạng thì bỏ (không gửi broadcast). */
function safeParseUserIds(raw: string): string[] | undefined {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return undefined
  }
  return undefined
}

export function getFailedItems(): NotificationQueueItem[] {
  return queue.filter((item) => item.retryCount >= item.maxRetries)
}

let isProcessing = false

async function processQueue(): Promise<void> {
  if (isProcessing) return
  isProcessing = true
  try {
    await ensureRecovered()
    while (queue.length > 0) {
      const item = queue[0]
      if (item.retryCount >= item.maxRetries) {
        await db.update(notifications).set({ status: 'failed', error: item.lastError }).where(and(eq(notifications.id, item.id), eq(notifications.parishId, item.parishId))).catch((err) => console.error(`[notificationQueue] failed to mark ${item.id} failed:`, err))
        queue.shift()
        continue
      }

      try {
        const message = item.renderedMessage

        if (item.channel === 'telegram') {
          if (item.telegramUserIds !== undefined) {
            const { getActiveTelegramLinksForUsers } = await import('./telegramLinkService.js')
            const { sendTelegramMessageToChat } = await import('./telegram.js')
            const activeLinks = await getActiveTelegramLinksForUsers(item.telegramUserIds, item.parishId)
            for (const link of activeLinks) {
              await sendTelegramMessageToChat(link.chatId, message)
            }
          } else {
            if (item.type === 'alert') {
              await sendTelegramAlert(message)
            } else {
              await sendTelegramInfo(message)
            }
          }
        } else {
          // ADR S1 + ADR-095: channel persisted tên legacy `webpush`, nhưng
          // bộ gửi SSOT fan-out cả browser Web Push và native FCM/APNs.
          // Có webpushUserIds → gửi CÓ CHỦ ĐÍCH tới nhóm người dùng (phụ huynh
          // theo chi đoàn); không có → gửi toàn giáo xứ như trước.
          const payload = { title: webPushTitle(item), body: message, url: '/' }
          const result = item.webpushUserIds && item.webpushUserIds.length > 0
            ? await sendAppPushToUsers(item.parishId, item.webpushUserIds, payload)
            : await sendAppPushToParish(item.parishId, payload)
          if (!result.configured) {
            // Không provider nào được cấu hình → không retry vô ích.
            item.lastError = 'PUSH_PROVIDER_NOT_CONFIGURED'
            item.retryCount = item.maxRetries
            await db.update(notifications).set({ status: 'failed', error: item.lastError }).where(and(eq(notifications.id, item.id), eq(notifications.parishId, item.parishId))).catch((err) => console.error(`[notificationQueue] failed to mark ${item.id} failed (push provider):`, err))
            queue.shift()
            continue
          }
          if (result.failed > 0) {
            console.warn(`[notificationQueue] app push ${item.id}: ${result.sent}/${result.total} sent, ${result.failed} failed, ${result.removed} dead subscriptions removed, ${result.skipped} skipped`)
          }
        }

        const now = new Date().toISOString()
        await db.update(notifications).set({ status: 'sent', sentAt: now }).where(and(eq(notifications.id, item.id), eq(notifications.parishId, item.parishId))).catch((err) => console.error(`[notificationQueue] failed to mark ${item.id} sent:`, err))

        queue.shift()
      } catch (err) {
        item.retryCount++
        item.lastError = String(err)
        if (item.retryCount >= item.maxRetries) {
          await db.update(notifications).set({ status: 'failed', error: item.lastError }).where(and(eq(notifications.id, item.id), eq(notifications.parishId, item.parishId))).catch((err) => console.error(`[notificationQueue] failed to mark ${item.id} failed after retries:`, err))
          queue.shift()
          continue
        }
        const backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, item.retryCount - 1), 60000)
        await new Promise((r) => setTimeout(r, backoff))
      }
    }
  } finally {
    isProcessing = false
  }
}
