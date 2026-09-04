import { isTelegramEnabled, sendTelegramAlert, sendTelegramInfo } from './telegram.js'
import { renderTemplate, type TemplateContext } from './templateEngine.js'
import { sendAppPushToParish, sendAppPushToUsers } from './appPushService.js'
import { db } from '../db/index.js'
import { notifications } from '../db/schema.js'
import { eq, and, isNull, lte, or, sql } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { randomUUID } from 'crypto'

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
const failedItems: NotificationQueueItem[] = []
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000
const LEASE_MS = 5 * 60 * 1000
const POLL_MS = 30 * 1000
const WORKER_ID = `${process.pid}-${randomUUID()}`
let recovered = false
let workerPollTimer: ReturnType<typeof setInterval> | null = null
let stopping = false
let processingPromise: Promise<void> | null = null
const retryTimers = new Set<ReturnType<typeof setTimeout>>()

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
  stopping = false
  recovered = true
  await recoverQueueFromDb()
  void processQueue().catch((error) => console.error('[notificationQueue] initial drain failed:', error))
  if (!workerPollTimer && process.env.NODE_ENV !== 'test') {
    workerPollTimer = setInterval(() => {
      recoverQueueFromDb()
        .then(() => processQueue())
        .catch((error) => console.error('[notificationQueue] worker poll failed:', error))
    }, POLL_MS)
    workerPollTimer.unref?.()
  }
}

export async function recoverQueueFromDb(): Promise<void> {
  try {
    // ADR-016 (S14): Recover ALL parishes' retrying notifications, not just a
    // hardcoded one. The old filter `eq(notifications.parishId, process.env.PARISH_ID || 'thanh-gia')`
    // silently dropped notifications from parishes whose ID didn't match the env.
    const now = new Date().toISOString()
    await db.update(notifications).set({
      status: 'failed',
      error: 'NOTIFICATION_ATTEMPTS_EXHAUSTED',
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    }).where(and(
      eq(notifications.status, 'retrying'),
      sql`${notifications.attemptCount} >= ${notifications.maxAttempts}`,
      or(isNull(notifications.leaseExpiresAt), lte(notifications.leaseExpiresAt, now)),
    ))
    const pending = await db.select().from(notifications).where(and(
      eq(notifications.status, 'retrying'),
      or(isNull(notifications.nextAttemptAt), lte(notifications.nextAttemptAt, now)),
      or(isNull(notifications.leaseExpiresAt), lte(notifications.leaseExpiresAt, now)),
    ))
    for (const row of pending) {
      if (queue.some((queued) => queued.id === row.id && queued.parishId === row.parishId)) continue
      const item: NotificationQueueItem = {
        id: row.id,
        channel: row.type === 'telegram' ? 'telegram' : 'webpush',
        type: row.deliveryKind === 'alert' || row.deliveryKind === 'info' || row.deliveryKind === 'absence' || row.deliveryKind === 'report' || row.deliveryKind === 'reminder'
          ? row.deliveryKind
          : row.channel === 'report_card' ? 'report' : row.channel === 'reminder' ? 'reminder' : 'absence',
        template: '',
        context: {},
        renderedMessage: row.message || '',
        retryCount: row.attemptCount,
        maxRetries: row.maxAttempts,
        lastError: row.error || null,
        createdAt: row.createdAt,
        parishId: row.parishId,
        ...(row.type === 'telegram'
          ? { telegramUserIds: row.targetUserIds ? (safeParseUserIds(row.targetUserIds) ?? []) : undefined }
          : { webpushUserIds: row.targetUserIds ? (safeParseUserIds(row.targetUserIds) ?? []) : undefined }),
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

export async function enqueueNotification(
  channel: NotificationQueueItem['channel'],
  type: NotificationQueueItem['type'],
  template: string,
  context: TemplateContext,
  parishId: string,
  maxRetries: number = MAX_RETRIES,
  options?: { webpushUserIds?: string[]; telegramUserIds?: string[] },
): Promise<string> {
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
  // ADR-102: persistence is the enqueue acknowledgement. If the process exits
  // after this INSERT but before the in-memory projection is populated, the
  // startup/poll worker can still recover the durable row.
  await db.insert(notifications)
    .values({
      id,
      type: channel === 'telegram' ? 'telegram' : 'web_push',
      channel: type === 'report' ? 'report_card' : type === 'reminder' ? 'reminder' : 'absence',
      deliveryKind: type,
      status: maxRetries > 0 ? 'retrying' : 'failed',
      recipient: context.parentPhone || context.studentName || 'System',
      message: renderedMessage,
      triggeredByType: 'system',
      createdAt: item.createdAt,
      parishId,
      attemptCount: 0,
      maxAttempts: maxRetries,
      targetUserIds: item.webpushUserIds !== undefined
        ? JSON.stringify(item.webpushUserIds)
        : item.telegramUserIds !== undefined
          ? JSON.stringify(item.telegramUserIds)
          : null,
    })

  if (maxRetries <= 0) {
    failedItems.push(item)
    return id
  }

  queue.push(item)
  void processQueue().catch((error) => console.error(`[notificationQueue] drain failed after enqueue ${id}:`, error))

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
  return [...failedItems]
}

async function claimNotification(item: NotificationQueueItem): Promise<{ attemptCount: number; maxAttempts: number } | null> {
  const now = new Date()
  const nowIso = now.toISOString()
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS).toISOString()
  const [claimed] = await db
    .update(notifications)
    .set({
      leaseOwner: WORKER_ID,
      leaseExpiresAt,
      nextAttemptAt: null,
      attemptCount: sql`${notifications.attemptCount} + 1`,
    })
    .where(and(
      eq(notifications.id, item.id),
      eq(notifications.parishId, item.parishId),
      eq(notifications.status, 'retrying'),
      sql`${notifications.attemptCount} < ${notifications.maxAttempts}`,
      or(isNull(notifications.nextAttemptAt), lte(notifications.nextAttemptAt, nowIso)),
      or(isNull(notifications.leaseExpiresAt), lte(notifications.leaseExpiresAt, nowIso)),
    ))
    .returning({ attemptCount: notifications.attemptCount, maxAttempts: notifications.maxAttempts })
  return claimed ?? null
}

function rememberFailed(item: NotificationQueueItem): void {
  failedItems.push(item)
  if (failedItems.length > 100) failedItems.shift()
}

function scheduleRetry(delayMs: number): void {
  if (stopping) return
  const timer = setTimeout(() => {
    retryTimers.delete(timer)
    if (stopping) return
    recoverQueueFromDb()
      .then(() => processQueue())
      .catch((error) => console.error('[notificationQueue] retry wake-up failed:', error))
  }, delayMs)
  retryTimers.add(timer)
  timer.unref?.()
}

async function drainQueue(): Promise<void> {
  await ensureRecovered()
  while (queue.length > 0) {
      const item = queue[0]
      const claim = await claimNotification(item)
      if (!claim) {
        queue.shift()
        continue
      }
      item.retryCount = claim.attemptCount
      item.maxRetries = claim.maxAttempts

      try {
        const message = item.renderedMessage

        if (item.channel === 'telegram') {
          if (!isTelegramEnabled()) {
            item.lastError = 'TELEGRAM_PROVIDER_NOT_CONFIGURED'
            item.retryCount = item.maxRetries
            await db.update(notifications).set({
              status: 'failed',
              error: item.lastError,
              leaseOwner: null,
              leaseExpiresAt: null,
              nextAttemptAt: null,
            }).where(and(eq(notifications.id, item.id), eq(notifications.parishId, item.parishId), eq(notifications.leaseOwner, WORKER_ID)))
            rememberFailed(item)
            queue.shift()
            continue
          }
          if (item.telegramUserIds !== undefined) {
            const { getActiveTelegramLinksForUsers } = await import('./telegramLinkService.js')
            const { sendTelegramMessageToChat } = await import('./telegram.js')
            const activeLinks = await getActiveTelegramLinksForUsers(item.telegramUserIds, item.parishId)
            for (const link of activeLinks) {
              await sendTelegramMessageToChat(link.chatId, message, true)
            }
          } else {
            if (item.type === 'alert') {
              await sendTelegramAlert(message, true)
            } else {
              await sendTelegramInfo(message, true)
            }
          }
        } else {
          // ADR S1 + ADR-095: channel persisted tên legacy `webpush`, nhưng
          // bộ gửi SSOT fan-out cả browser Web Push và native FCM/APNs.
          // Có webpushUserIds → gửi CÓ CHỦ ĐÍCH tới nhóm người dùng (phụ huynh
          // theo chi đoàn); không có → gửi toàn giáo xứ như trước.
          const payload = { title: webPushTitle(item), body: message, url: '/' }
          const result = item.webpushUserIds !== undefined
            ? await sendAppPushToUsers(item.parishId, item.webpushUserIds, payload)
            : await sendAppPushToParish(item.parishId, payload)
          if (!result.configured) {
            // Không provider nào được cấu hình → không retry vô ích.
            item.lastError = 'PUSH_PROVIDER_NOT_CONFIGURED'
            item.retryCount = item.maxRetries
            await db.update(notifications).set({
              status: 'failed',
              error: item.lastError,
              leaseOwner: null,
              leaseExpiresAt: null,
              nextAttemptAt: null,
            }).where(and(eq(notifications.id, item.id), eq(notifications.parishId, item.parishId), eq(notifications.leaseOwner, WORKER_ID)))
            rememberFailed(item)
            queue.shift()
            continue
          }
          if (result.failed > 0) {
            console.warn(`[notificationQueue] app push ${item.id}: ${result.sent}/${result.total} sent, ${result.failed} failed, ${result.removed} dead subscriptions removed, ${result.skipped} skipped`)
            // The aggregate item is retried when any configured provider reports
            // a transient failure. This is intentionally at-least-once: already
            // delivered recipients can receive a duplicate after a partial send.
            throw new Error(`APP_PUSH_PARTIAL_FAILURE:${result.failed}`)
          }
        }

        const now = new Date().toISOString()
        await db.update(notifications).set({
          status: 'sent',
          sentAt: now,
          error: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
        }).where(and(
          eq(notifications.id, item.id),
          eq(notifications.parishId, item.parishId),
          eq(notifications.leaseOwner, WORKER_ID),
        ))

        queue.shift()
      } catch (err) {
        item.lastError = String(err)
        if (item.retryCount >= item.maxRetries) {
          await db.update(notifications).set({
            status: 'failed',
            error: item.lastError,
            leaseOwner: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
          }).where(and(eq(notifications.id, item.id), eq(notifications.parishId, item.parishId), eq(notifications.leaseOwner, WORKER_ID)))
          rememberFailed(item)
          queue.shift()
          continue
        }
        const backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, item.retryCount - 1), 60000)
        const nextAttemptAt = new Date(Date.now() + backoff).toISOString()
        await db.update(notifications).set({
          error: item.lastError,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt,
        }).where(and(eq(notifications.id, item.id), eq(notifications.parishId, item.parishId), eq(notifications.leaseOwner, WORKER_ID)))
        queue.shift()
        scheduleRetry(backoff)
      }
  }
}

function processQueue(): Promise<void> {
  if (stopping) return Promise.resolve()
  if (processingPromise) return processingPromise
  processingPromise = drainQueue().finally(() => {
    processingPromise = null
    // An enqueue can land after the while condition was evaluated but before
    // this hand-off. Re-kick once so the durable row is not stranded.
    if (!stopping && queue.length > 0) {
      void processQueue().catch((error) => console.error('[notificationQueue] hand-off drain failed:', error))
    }
  })
  return processingPromise
}

/** Stop new polls/retries and wait for the currently claimed/in-memory work. */
export async function stopNotificationQueue(): Promise<void> {
  stopping = true
  if (workerPollTimer) {
    clearInterval(workerPollTimer)
    workerPollTimer = null
  }
  for (const timer of retryTimers) clearTimeout(timer)
  retryTimers.clear()
  if (processingPromise) await processingPromise
}
