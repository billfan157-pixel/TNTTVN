import { renderTemplate, type TemplateContext } from './templateEngine.js'
import { sendAppPushToUsers } from './appPushService.js'
import { db, runDbTransaction } from '../db/index.js'
import { notifications, students, telegramLinks, telegramLinkTokens, users } from '../db/schema.js'
import { phoneMatchVariants } from '../utils/phone.js'
import { eq, and, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { randomUUID } from 'crypto'
import { assertDeploymentParishScope, getEnforcedDeploymentParishId } from '../utils/deploymentParish.js'

interface NotificationQueueItem {
  id: string
  channel: 'webpush'
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
  webpushUserIds: string[]
  studentId?: string
}

export const ACADEMIC_NOTIFICATION_MESSAGE = 'Có cập nhật học vụ trong ứng dụng Catevia. Vui lòng đăng nhập để xem.'

function isChildNotification(item: Pick<NotificationQueueItem, 'type'>): boolean {
  return item.type === 'report' || item.type === 'absence'
}

/** Never retarget an old rendered item to a new owner. No network in this check. */
async function currentChildRecipients(item: NotificationQueueItem): Promise<string[]> {
  return getCurrentChildRecipientIds(item.parishId, item.studentId, item.webpushUserIds)
}

/** Revalidate every targeted non-child notification immediately before provider delivery. */
export async function getCurrentActiveRecipientIds(parishId: string, originalIds: string[] | undefined): Promise<string[]> {
  if (!originalIds?.length) return []
  const rows = await db.select({ id: users.id }).from(users).where(and(
    eq(users.parishId, parishId),
    inArray(users.id, [...new Set(originalIds)]),
    eq(users.status, 'ACTIVE'),
    isNull(users.deletedAt),
  ))
  const allowed = new Set(rows.map(row => row.id))
  return originalIds.filter((id, index) => allowed.has(id) && originalIds.indexOf(id) === index)
}

/** Shared eligibility for child-sensitive delivery, including non-queued leave reviews. */
export async function getCurrentChildRecipientIds(parishId: string, studentId: string | undefined, originalIds: string[] | undefined): Promise<string[]> {
  if (!studentId || !originalIds?.length) return []
  const [student] = await db.select({ phone: students.parentPhone }).from(students)
    .where(and(eq(students.id, studentId), eq(students.parishId, parishId), isNull(students.deletedAt))).limit(1)
  if (!student) return []
  const phones = new Set(phoneMatchVariants(student.phone))
  if (!phones.size) return []
  const candidates = await db.select({ id: users.id, phone: users.phone }).from(users).where(and(
    eq(users.parishId, parishId), inArray(users.id, originalIds), eq(users.role, 'phuhuynh'),
    eq(users.status, 'ACTIVE'), isNull(users.deletedAt),
  ))
  return candidates.filter(user => user.phone && phoneMatchVariants(user.phone).some(phone => phones.has(phone))).map(user => user.id)
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
  await retireLegacyTelegramChannelData()
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

/**
 * Telegram was retired as a product channel in ADR-111. Keep historical rows,
 * but revoke live links/tokens and terminalize undelivered Telegram work so a
 * restore or rolling deployment cannot restart bot delivery.
 */
export async function retireLegacyTelegramChannelData(now = new Date()): Promise<void> {
  const nowIso = now.toISOString()
  await runDbTransaction(async (tx) => {
    await tx.update(telegramLinkTokens).set({ consumedAt: nowIso }).where(isNull(telegramLinkTokens.consumedAt))
    await tx.update(telegramLinks).set({
      status: 'REVOKED',
      notificationsEnabled: 0,
      revokedAt: sql`coalesce(${telegramLinks.revokedAt}, ${nowIso})`,
      updatedAt: nowIso,
    }).where(or(eq(telegramLinks.status, 'ACTIVE'), eq(telegramLinks.notificationsEnabled, 1)))
    await tx.update(notifications).set({
      status: 'failed',
      error: 'CHANNEL_RETIRED',
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    }).where(and(eq(notifications.type, 'telegram'), eq(notifications.status, 'retrying')))
  })
}

export async function recoverQueueFromDb(): Promise<void> {
  try {
    // ADR-016 (S14): Recover ALL parishes' retrying notifications, not just a
    // hardcoded one. The old filter `eq(notifications.parishId, process.env.PARISH_ID || 'thanh-gia')`
    // silently dropped notifications from parishes whose ID didn't match the env.
    const now = new Date().toISOString()
    const deploymentParishId = getEnforcedDeploymentParishId()
    await db.update(notifications).set({
      status: 'failed',
      error: 'CHANNEL_RETIRED',
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    }).where(and(
      eq(notifications.type, 'telegram'),
      eq(notifications.status, 'retrying'),
      deploymentParishId ? eq(notifications.parishId, deploymentParishId) : undefined,
    ))
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
      deploymentParishId ? eq(notifications.parishId, deploymentParishId) : undefined,
    ))
    const pending = await db.select().from(notifications).where(and(
      eq(notifications.type, 'web_push'),
      eq(notifications.status, 'retrying'),
      or(isNull(notifications.nextAttemptAt), lte(notifications.nextAttemptAt, now)),
      or(isNull(notifications.leaseExpiresAt), lte(notifications.leaseExpiresAt, now)),
      deploymentParishId ? eq(notifications.parishId, deploymentParishId) : undefined,
    ))
    for (const row of pending) {
      if (queue.some((queued) => queued.id === row.id && queued.parishId === row.parishId)) continue
      const item: NotificationQueueItem = {
        id: row.id,
        channel: 'webpush',
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
        studentId: row.studentId ?? undefined,
        // Durable queue delivery is always explicitly targeted. Historical or
        // malformed rows without a target fail closed during recipient checks.
        webpushUserIds: row.targetUserIds ? (safeParseUserIds(row.targetUserIds) ?? []) : [],
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
  channel: 'webpush',
  type: NotificationQueueItem['type'],
  template: string,
  context: TemplateContext,
  parishId: string,
  maxRetries: number | undefined,
  options: { webpushUserIds: string[]; studentId?: string },
): Promise<string> {
  assertDeploymentParishScope(parishId)
  const id = generateId('NOT')
  const renderedMessage = isChildNotification({ type }) ? ACADEMIC_NOTIFICATION_MESSAGE : renderTemplate(template, context)
  const item: NotificationQueueItem = {
    id,
    channel,
    type,
    template,
    context,
    renderedMessage,
    retryCount: 0,
    maxRetries: maxRetries ?? MAX_RETRIES,
    lastError: null,
    createdAt: new Date().toISOString(),
    parishId,
    webpushUserIds: options.webpushUserIds,
    studentId: options.studentId,
  }
  // ADR-102: persistence is the enqueue acknowledgement. If the process exits
  // after this INSERT but before the in-memory projection is populated, the
  // startup/poll worker can still recover the durable row.
  await db.insert(notifications)
    .values({
      id,
      type: 'web_push',
      channel: type === 'report' ? 'report_card' : type === 'reminder' ? 'reminder' : 'absence',
      deliveryKind: type,
      status: item.maxRetries > 0 ? 'retrying' : 'failed',
      recipient: isChildNotification(item) ? 'Parent' : context.parentPhone || context.studentName || 'System',
      studentId: item.studentId ?? null,
      message: renderedMessage,
      triggeredByType: 'system',
      createdAt: item.createdAt,
      parishId,
      attemptCount: 0,
      maxAttempts: item.maxRetries,
      targetUserIds: JSON.stringify(item.webpushUserIds),
    })

  if (item.maxRetries <= 0) {
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

async function suppressNotification(item: NotificationQueueItem, reason: string): Promise<void> {
  item.lastError = reason
  await db.update(notifications).set({
    status: 'failed', error: reason, leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: null,
  }).where(and(eq(notifications.id, item.id), eq(notifications.parishId, item.parishId), eq(notifications.leaseOwner, WORKER_ID)))
  rememberFailed(item)
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
        const childNotification = isChildNotification(item)
        const message = childNotification ? ACADEMIC_NOTIFICATION_MESSAGE : item.renderedMessage
        if (childNotification) {
          const recipients = await currentChildRecipients(item)
          if (!recipients.length) {
            // Includes pre-migration rows without an explicit child/target scope.
            await suppressNotification(item, 'ACADEMIC_RECIPIENT_NOT_AUTHORIZED')
            queue.shift()
            continue
          }
          item.webpushUserIds = recipients
        } else {
          const recipients = await getCurrentActiveRecipientIds(item.parishId, item.webpushUserIds)
          if (!recipients.length) {
            await suppressNotification(item, 'DELIVERY_TARGET_NOT_ACTIVE')
            queue.shift()
            continue
          }
          item.webpushUserIds = recipients
        }

        // Persisted type remains `web_push` for compatibility; appPushService
        // fans out to configured browser Web Push and native FCM/APNs providers.
        const payload = { title: childNotification ? 'Catevia' : webPushTitle(item), body: message, url: '/' }
        const result = await sendAppPushToUsers(item.parishId, item.webpushUserIds, payload)
        if (!result.configured) {
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
        const retryableFailed = Math.max(0, result.failed - result.removed)
        if (result.failed > 0) {
          console.warn(`[notificationQueue] app push ${item.id}: ${result.sent}/${result.total} sent, ${result.failed} failed, ${result.removed} dead subscriptions removed, ${result.skipped} skipped`)
        }
        if (retryableFailed > 0) {
          // The aggregate item is retried when any configured provider reports
          // a transient failure. Permanently dead endpoints were already removed
          // and must not cause a duplicate resend to healthy endpoints.
          throw new Error(`APP_PUSH_PARTIAL_FAILURE:${retryableFailed}`)
        }
        if (result.sent === 0) {
          await suppressNotification(item, childNotification ? 'ACADEMIC_DELIVERY_TARGET_UNAVAILABLE' : 'DELIVERY_TARGET_UNAVAILABLE')
          queue.shift()
          continue
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
