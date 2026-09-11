import { and, eq, isNull, lte, or } from 'drizzle-orm'
import { db, runDbTransaction } from '../db/index.js'
import { notifications, operationEvents, operationReminders, operationTasks } from '../db/schema.js'
import { resolveOperationsUserAuthorization } from './operationsAuthorization.js'

export type OperationReminderRun = { claimed: number; enqueued: number; delivered: number; failed: number }
export type OperationReminderRunOptions = {
  /** Deterministic interleaving seam for concurrency tests; production omits it. */
  beforeClaim?: (candidate: typeof operationReminders.$inferSelect) => Promise<void> | void
}

/**
 * Persist due reminders into the shared durable notification queue atomically.
 * A reminder is SENT only after the notification worker records provider success;
 * inserting a retrying notification is an enqueue acknowledgement, not delivery.
 */
export async function processDueOperationReminders(now = new Date(), options: OperationReminderRunOptions = {}): Promise<OperationReminderRun> {
  const nowIso = now.toISOString()
  const summary: OperationReminderRun = { claimed: 0, enqueued: 0, delivered: 0, failed: 0 }

  const awaitingDelivery = await db.select().from(operationReminders).where(eq(operationReminders.status, 'ENQUEUED')).limit(200)
  for (const reminder of awaitingDelivery) {
    if (!reminder.notificationId) {
      const deterministicNotificationId = `NOT-${reminder.id}`
      const [deterministicNotification] = await db.select({ id: notifications.id }).from(notifications).where(and(
        eq(notifications.parishId, reminder.parishId),
        eq(notifications.id, deterministicNotificationId),
      )).limit(1)
      if (deterministicNotification) {
        await db.update(operationReminders).set({ notificationId: deterministicNotificationId, version: reminder.version + 1, leaseExpiresAt: null })
          .where(and(eq(operationReminders.parishId, reminder.parishId), eq(operationReminders.id, reminder.id), eq(operationReminders.status, 'ENQUEUED'), eq(operationReminders.version, reminder.version), isNull(operationReminders.notificationId)))
      } else {
        // The queue ownership is ambiguous once ENQUEUED has been persisted.
        // Never manufacture another provider delivery without its deterministic row.
        await db.update(operationReminders).set({ status: 'FAILED', version: reminder.version + 1, leaseExpiresAt: null, error: 'MISSING_NOTIFICATION_ROW' })
          .where(and(eq(operationReminders.parishId, reminder.parishId), eq(operationReminders.id, reminder.id), eq(operationReminders.status, 'ENQUEUED'), eq(operationReminders.version, reminder.version), isNull(operationReminders.notificationId)))
        summary.failed++
      }
      continue
    }
    const [notification] = await db.select({ status: notifications.status, error: notifications.error, sentAt: notifications.sentAt })
      .from(notifications)
      .where(and(eq(notifications.parishId, reminder.parishId), eq(notifications.id, reminder.notificationId))).limit(1)
    if (!notification) {
      // Provider success may have happened before an external purge/damage removed
      // the queue row. Never auto-re-enqueue an ambiguous delivery.
      await db.update(operationReminders).set({ status: 'FAILED', version: reminder.version + 1, leaseExpiresAt: null, error: 'MISSING_NOTIFICATION_ROW' })
        .where(and(eq(operationReminders.parishId, reminder.parishId), eq(operationReminders.id, reminder.id), eq(operationReminders.status, 'ENQUEUED'), eq(operationReminders.version, reminder.version)))
      summary.failed++
    } else if (notification.status === 'sent') {
      await db.update(operationReminders).set({ status: 'SENT', version: reminder.version + 1, sentAt: notification.sentAt ?? nowIso, leaseExpiresAt: null, error: null })
        .where(and(eq(operationReminders.parishId, reminder.parishId), eq(operationReminders.id, reminder.id), eq(operationReminders.status, 'ENQUEUED'), eq(operationReminders.version, reminder.version)))
      summary.delivered++
    } else if (notification.status === 'failed') {
      await db.update(operationReminders).set({ status: 'FAILED', version: reminder.version + 1, leaseExpiresAt: null, error: notification.error ?? 'NOTIFICATION_DELIVERY_FAILED' })
        .where(and(eq(operationReminders.parishId, reminder.parishId), eq(operationReminders.id, reminder.id), eq(operationReminders.status, 'ENQUEUED'), eq(operationReminders.version, reminder.version)))
      summary.failed++
    }
  }

  const pending = await db.select().from(operationReminders).where(and(
    eq(operationReminders.status, 'PENDING'),
    lte(operationReminders.triggerAt, nowIso),
    or(isNull(operationReminders.nextAttemptAt), lte(operationReminders.nextAttemptAt, nowIso)),
  )).limit(100)

  for (const reminder of pending) {
    try {
      await options.beforeClaim?.(reminder)
      const enqueued = await runDbTransaction(async tx => {
        const [current] = await tx.select().from(operationReminders).where(and(
          eq(operationReminders.parishId, reminder.parishId),
          eq(operationReminders.id, reminder.id),
          eq(operationReminders.status, 'PENDING'),
          lte(operationReminders.triggerAt, nowIso),
          or(isNull(operationReminders.nextAttemptAt), lte(operationReminders.nextAttemptAt, nowIso)),
        )).limit(1)
        if (!current) return null

        const [task] = current.taskId ? await tx.select({ status: operationTasks.status }).from(operationTasks).where(and(eq(operationTasks.parishId, current.parishId), eq(operationTasks.id, current.taskId), isNull(operationTasks.deletedAt))).limit(1) : []
        const [event] = current.eventId ? await tx.select({ status: operationEvents.status }).from(operationEvents).where(and(eq(operationEvents.parishId, current.parishId), eq(operationEvents.id, current.eventId), isNull(operationEvents.deletedAt))).limit(1) : []
        if (!task && !event) {
          await tx.update(operationReminders).set({
            status: 'FAILED',
            version: current.version + 1,
            attemptCount: current.attemptCount + 1,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            error: 'RESOURCE_NOT_FOUND',
          }).where(and(eq(operationReminders.parishId, current.parishId), eq(operationReminders.id, current.id), eq(operationReminders.status, 'PENDING'), eq(operationReminders.version, current.version)))
          return { outcome: 'FAILED' as const }
        }
        const resourceTerminal = Boolean(
          (task && (task.status === 'DONE' || task.status === 'CANCELLED'))
          || (event && (event.status === 'COMPLETED' || event.status === 'CANCELLED')),
        )
        if (resourceTerminal) {
          await tx.update(operationReminders).set({
            status: 'FAILED',
            version: current.version + 1,
            attemptCount: current.attemptCount + 1,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            error: 'RESOURCE_TERMINAL',
          }).where(and(eq(operationReminders.parishId, current.parishId), eq(operationReminders.id, current.id), eq(operationReminders.status, 'PENDING'), eq(operationReminders.version, current.version)))
          return { outcome: 'FAILED' as const }
        }
        const recipientDecision = await resolveOperationsUserAuthorization(
          current.parishId,
          current.recipientUserId,
          current.taskId ? 'operations.task.view' : 'operations.event.view',
          { taskId: current.taskId, eventId: current.eventId },
          tx,
        )
        if (!recipientDecision.allowed) {
          await tx.update(operationReminders).set({
            status: 'FAILED',
            version: current.version + 1,
            attemptCount: current.attemptCount + 1,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            error: 'RECIPIENT_NOT_AUTHORIZED',
          }).where(and(eq(operationReminders.parishId, current.parishId), eq(operationReminders.id, current.id), eq(operationReminders.status, 'PENDING'), eq(operationReminders.version, current.version)))
          return { outcome: 'FAILED' as const }
        }
        const notificationId = `NOT-${current.id}`
        const [existingNotification] = await tx.select({ id: notifications.id }).from(notifications).where(and(
          eq(notifications.parishId, current.parishId),
          eq(notifications.id, notificationId),
        )).limit(1)
        if (!existingNotification) {
          await tx.insert(notifications).values({
            id: notificationId,
            type: 'web_push',
            channel: 'reminder',
            deliveryKind: 'reminder',
            status: 'retrying',
            recipient: 'Operations assignee',
            // Authorization is rechecked above, but keep the external body
            // generic so a role change between enqueue and provider delivery
            // cannot disclose an internal task/event title.
            message: 'Bạn có nhắc việc mới trong Catevia. Vui lòng đăng nhập để xem.',
            triggeredByType: 'system',
            targetUserIds: JSON.stringify([current.recipientUserId]),
            attemptCount: 0,
            maxAttempts: 3,
            parishId: current.parishId,
            createdAt: nowIso,
          })
        }
        const [updated] = await tx.update(operationReminders).set({
          status: 'ENQUEUED',
          version: current.version + 1,
          notificationId,
          attemptCount: current.attemptCount + 1,
          enqueuedAt: nowIso,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          error: null,
        }).where(and(eq(operationReminders.parishId, current.parishId), eq(operationReminders.id, current.id), eq(operationReminders.status, 'PENDING'), eq(operationReminders.version, current.version))).returning()
        return updated ? { outcome: 'ENQUEUED' as const } : null
      })
      if (!enqueued) continue
      summary.claimed++
      if (enqueued.outcome === 'FAILED') summary.failed++
      else summary.enqueued++
    } catch (error) {
      // Persistence is atomic, so a failed attempt remains retryable instead of
      // becoming a false terminal delivery result.
      await db.update(operationReminders).set({
        nextAttemptAt: new Date(now.getTime() + 60_000).toISOString(),
        error: error instanceof Error ? error.message : 'REMINDER_ENQUEUE_FAILED',
      }).where(and(eq(operationReminders.parishId, reminder.parishId), eq(operationReminders.id, reminder.id), eq(operationReminders.status, 'PENDING'), eq(operationReminders.version, reminder.version), eq(operationReminders.triggerAt, reminder.triggerAt)))
      summary.failed++
    }
  }
  return summary
}

let timer: ReturnType<typeof setInterval> | null = null
export function initOperationsReminderScheduler(): void {
  if (timer) return
  timer = setInterval(() => { void processDueOperationReminders().catch(error => console.error('[operationsReminderScheduler] tick failed:', error)) }, 30_000)
  timer.unref?.()
}
export function stopOperationsReminderScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
