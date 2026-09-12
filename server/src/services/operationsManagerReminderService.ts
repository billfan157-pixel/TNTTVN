import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, runDbTransaction, type DbTransaction } from '../db/index.js'
import { notifications, operationEvents, operationReminders, operationTaskAssignees, operationTasks, parishPeople, users } from '../db/schema.js'
import { preparationAcceptanceReadiness } from '../domain/OperationsEventLifecycle.js'
import { parishCalendarDate } from '../utils/parishTimeZone.js'
import { resolveOperationsUserAuthorization } from './operationsAuthorization.js'

export type OperationManagerReminderRun = {
  scanned: number
  eligible: number
  created: number
  skipped: number
  failed: number
}

function assigneeTargetKey(target: { userId: string | null; personId: string | null }): string {
  return target.userId ? `user:${target.userId}` : `person:${target.personId}`
}

async function actionableAssigneeKeys(tx: DbTransaction, parishId: string, rows: Array<{ userId: string | null; personId: string | null }>): Promise<Set<string>> {
  const directUserIds = [...new Set(rows.map(row => row.userId).filter((value): value is string => Boolean(value)))]
  const personIds = [...new Set(rows.map(row => row.personId).filter((value): value is string => Boolean(value)))]
  const people = personIds.length === 0 ? [] : await tx.select({ id: parishPeople.id, linkedUserId: parishPeople.linkedUserId }).from(parishPeople).where(and(
    eq(parishPeople.parishId, parishId), inArray(parishPeople.id, personIds),
    eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt),
  ))
  const candidateUserIds = [...new Set([...directUserIds, ...people.flatMap(person => person.linkedUserId ? [person.linkedUserId] : [])])]
  const activeUsers = candidateUserIds.length === 0 ? [] : await tx.select({ id: users.id }).from(users).where(and(
    eq(users.parishId, parishId), inArray(users.id, candidateUserIds),
    inArray(users.role, ['admin', 'chunhiem', 'phuta']), eq(users.status, 'ACTIVE'), isNull(users.deletedAt),
  ))
  const activeUserIds = new Set(activeUsers.map(user => user.id))
  const actionable = new Set<string>()
  for (const userId of directUserIds) if (activeUserIds.has(userId)) actionable.add(`user:${userId}`)
  for (const person of people) if (person.linkedUserId && activeUserIds.has(person.linkedUserId)) actionable.add(`person:${person.id}`)
  return actionable
}

/** Same eligibility predicate the PLANNING → PREPARING transition gate uses. */
async function preparationEligible(tx: DbTransaction, parishId: string, eventId: string): Promise<boolean> {
  const tasks = await tx.select({ id: operationTasks.id, status: operationTasks.status }).from(operationTasks).where(and(
    eq(operationTasks.parishId, parishId), eq(operationTasks.operationEventId, eventId), isNull(operationTasks.deletedAt),
  ))
  const activeTasks = tasks.filter(task => task.status !== 'CANCELLED')
  if (activeTasks.length === 0) return false
  const taskIds = activeTasks.map(task => task.id)
  const assignments = await tx.select({
    taskId: operationTaskAssignees.taskId,
    userId: operationTaskAssignees.userId,
    personId: operationTaskAssignees.personId,
    role: operationTaskAssignees.assignmentRole,
    acknowledgementStatus: operationTaskAssignees.acknowledgementStatus,
  }).from(operationTaskAssignees).where(and(
    eq(operationTaskAssignees.parishId, parishId), inArray(operationTaskAssignees.taskId, taskIds),
    inArray(operationTaskAssignees.assignmentRole, ['OWNER', 'CONTRIBUTOR']), isNull(operationTaskAssignees.removedAt),
  ))
  const actionable = await actionableAssigneeKeys(tx, parishId, assignments)
  const state = preparationAcceptanceReadiness(activeTasks.map(task => {
    const performers = assignments.filter(row => row.taskId === task.id)
    return {
      id: task.id,
      cancelled: false,
      hasOwner: performers.some(row => row.role === 'OWNER'),
      performers: performers.map(row => ({ valid: actionable.has(assigneeTargetKey(row)), accepted: row.acknowledgementStatus === 'ACCEPTED' })),
    }
  }))
  return state.eligible
}

/** Server-derived managers: the event creator plus the organizer's account. */
async function managerUserIds(tx: DbTransaction, parishId: string, event: typeof operationEvents.$inferSelect): Promise<string[]> {
  const ids = new Set<string>([event.createdBy])
  if (event.organizerUserId) ids.add(event.organizerUserId)
  if (event.organizerPersonId) {
    const [person] = await tx.select({ linkedUserId: parishPeople.linkedUserId }).from(parishPeople).where(and(
      eq(parishPeople.parishId, parishId), eq(parishPeople.id, event.organizerPersonId),
      eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt),
    )).limit(1)
    if (person?.linkedUserId) ids.add(person.linkedUserId)
  }
  return [...ids]
}

async function createDailyManagerReminder(tx: DbTransaction, event: typeof operationEvents.$inferSelect, recipientUserId: string, now: Date): Promise<0 | 1> {
  const nowIso = now.toISOString()
  const day = parishCalendarDate(now)
  const reminderId = `OPR-MGRPREP-${day}-${event.id}-${recipientUserId}`
  const dedupeKey = `MANAGER_PREP:event:${event.id}:recipient:${recipientUserId}:day:${day}`
  const [existing] = await tx.select({ id: operationReminders.id }).from(operationReminders).where(and(
    eq(operationReminders.parishId, event.parishId), eq(operationReminders.dedupeKey, dedupeKey),
  )).limit(1)
  if (existing) return 0
  await tx.insert(operationReminders).values({
    parishId: event.parishId, id: reminderId, taskId: null, eventId: event.id, recipientUserId,
    triggerAt: nowIso, kind: 'MANAGER_PREP', dedupeKey, status: 'PENDING', version: 1,
    readAt: null, attemptCount: 0, enqueuedAt: null, leaseExpiresAt: null, nextAttemptAt: null,
    notificationId: null, sentAt: null, error: null, createdAt: nowIso,
  })
  // PLANNING status, eligibility and recipient authority were rechecked inside
  // this transaction, so enqueueing the durable notification atomically keeps
  // ENQUEUED semantics: the shared pipeline still owns provider outcomes.
  const notificationId = `NOT-${reminderId}`
  const [existingNotification] = await tx.select({ id: notifications.id }).from(notifications).where(and(
    eq(notifications.parishId, event.parishId), eq(notifications.id, notificationId),
  )).limit(1)
  if (!existingNotification) await tx.insert(notifications).values({
    id: notificationId, type: 'web_push', channel: 'reminder', deliveryKind: 'reminder', status: 'retrying',
    recipient: 'Operations manager',
    message: 'Sự kiện bạn quản lý đã đủ người nhận nhiệm vụ. Vui lòng đăng nhập để xem.',
    triggeredByType: 'system', targetUserIds: JSON.stringify([recipientUserId]),
    attemptCount: 0, maxAttempts: 3, parishId: event.parishId, createdAt: nowIso,
  })
  await tx.update(operationReminders).set({
    status: 'ENQUEUED', version: 2, attemptCount: 1, enqueuedAt: nowIso, notificationId,
    leaseExpiresAt: null, nextAttemptAt: null, error: null,
  }).where(and(
    eq(operationReminders.parishId, event.parishId), eq(operationReminders.id, reminderId),
    eq(operationReminders.status, 'PENDING'), eq(operationReminders.version, 1),
  ))
  return 1
}

/**
 * Daily "ready to prepare" nudge for event managers (creator + organizer).
 * Once per parish-local day per event/recipient, only while PLANNING, only
 * when every active task has accepted performers, and never while automation
 * is paused. Rewinding and re-advancing on the same day reuses the same
 * date-scoped dedupe key, so the daily limit is never reset.
 */
export async function processDueManagerPrepReminders(now = new Date()): Promise<OperationManagerReminderRun> {
  const summary: OperationManagerReminderRun = { scanned: 0, eligible: 0, created: 0, skipped: 0, failed: 0 }
  const candidates = await db.select().from(operationEvents).where(and(
    eq(operationEvents.status, 'PLANNING'), eq(operationEvents.automationPaused, false), isNull(operationEvents.deletedAt),
  )).limit(200)
  for (const candidate of candidates) {
    summary.scanned++
    try {
      const created = await runDbTransaction(async tx => {
        // Candidate reads are advisory; the transaction reclaims the exact
        // current PLANNING state before any reminder row is written.
        const [current] = await tx.select().from(operationEvents).where(and(
          eq(operationEvents.parishId, candidate.parishId), eq(operationEvents.id, candidate.id),
          eq(operationEvents.status, 'PLANNING'), eq(operationEvents.automationPaused, false),
          isNull(operationEvents.deletedAt),
        )).limit(1)
        if (!current) return 0
        if (!(await preparationEligible(tx, current.parishId, current.id))) return 0
        let count = 0
        for (const recipientUserId of await managerUserIds(tx, current.parishId, current)) {
          const decision = await resolveOperationsUserAuthorization(current.parishId, recipientUserId, 'operations.event.view', { taskId: null, eventId: current.id }, tx)
          if (!decision.allowed) continue
          count += await createDailyManagerReminder(tx, current, recipientUserId, now)
        }
        return count
      })
      if (created > 0) {
        summary.eligible++
        summary.created += created
      } else {
        summary.skipped++
      }
    } catch (error) {
      summary.failed++
      console.error('[operationsManagerReminder] run failed:', {
        parishId: candidate.parishId,
        eventId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return summary
}

let timer: ReturnType<typeof setInterval> | null = null
export function initOperationsManagerReminderScheduler(): void {
  if (timer) return
  timer = setInterval(() => { void processDueManagerPrepReminders().catch(error => console.error('[operationsManagerReminder] tick failed:', error)) }, 900_000)
  timer.unref?.()
}
export function stopOperationsManagerReminderScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}