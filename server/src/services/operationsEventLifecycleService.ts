import { and, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { db, runDbTransaction, type DbTransaction } from '../db/index.js'
import { auditLogs, operationChecklistItems, operationEvents, operationTaskDispatches, operationTasks, parishRecords } from '../db/schema.js'
import { automaticEventTransition } from '../domain/OperationsEventLifecycle.js'
import { generateId } from '../utils/id.js'
import { parishCalendarDate } from '../utils/parishTimeZone.js'

const SYSTEM_ACTOR = 'SYSTEM_OPERATIONS_LIFECYCLE'
const ACTIVE_EVENT_STATUSES = ['PLANNING', 'PREPARING', 'READY', 'LIVE'] as const

export type OperationEventLifecycleRun = {
  scanned: number
  transitioned: number
  started: number
  completed: number
  skipped: number
  failed: number
}

export type OperationEventLifecycleRunOptions = {
  /** Deterministic interleaving seam for concurrency tests; production omits it. */
  beforeClaim?: (candidate: typeof operationEvents.$inferSelect) => Promise<void> | void
}

class LostLifecycleRaceError extends Error {
  constructor() { super('OPERATION_EVENT_AUTO_TRANSITION_LOST_RACE') }
}

async function unfinishedWork(tx: DbTransaction, parishId: string, eventId: string) {
  const tasks = await tx.select({ id: operationTasks.id, status: operationTasks.status }).from(operationTasks).where(and(
    eq(operationTasks.parishId, parishId),
    eq(operationTasks.operationEventId, eventId),
    isNull(operationTasks.deletedAt),
  ))
  const activeTaskIds = tasks.filter(task => task.status !== 'CANCELLED').map(task => task.id)
  const checklist = activeTaskIds.length > 0
    ? await tx.select({ isDone: operationChecklistItems.isDone }).from(operationChecklistItems).where(and(
      eq(operationChecklistItems.parishId, parishId),
      inArray(operationChecklistItems.taskId, activeTaskIds),
    ))
    : []
  return {
    incompleteTasks: tasks.filter(task => task.status !== 'DONE').length,
    incompleteChecklistItems: checklist.filter(item => !item.isDone).length,
  }
}

function lifecycleNote(
  target: 'LIVE' | 'COMPLETED',
  previousStatus: string,
  missedReady: boolean,
  remaining?: { incompleteTasks: number; incompleteChecklistItems: number },
) {
  if (target === 'LIVE') {
    return missedReady
      ? 'Hệ thống tự động chuyển sang Diễn ra đúng giờ bắt đầu khi sự kiện chưa ở trạng thái Sẵn sàng.'
      : 'Hệ thống tự động chuyển sang Diễn ra đúng giờ bắt đầu.'
  }
  const counts = remaining ?? { incompleteTasks: 0, incompleteChecklistItems: 0 }
  const skippedLive = previousStatus !== 'LIVE' ? ' Sự kiện chưa được đánh dấu Diễn ra trước khi hết giờ.' : ''
  return `Hệ thống tự động chuyển sang Hoàn thành khi hết giờ; còn ${counts.incompleteTasks} task và ${counts.incompleteChecklistItems} mục checklist chưa hoàn tất.${skippedLive}`
}

/**
 * Multi-instance safe lifecycle convergence. Candidate reads are advisory; the
 * transaction rechecks due time and claims the exact version/status with CAS.
 */
export async function processDueOperationEventTransitions(
  now = new Date(),
  options: OperationEventLifecycleRunOptions = {},
): Promise<OperationEventLifecycleRun> {
  const nowIso = now.toISOString()
  const summary: OperationEventLifecycleRun = { scanned: 0, transitioned: 0, started: 0, completed: 0, skipped: 0, failed: 0 }
  const candidates = await db.select().from(operationEvents).where(and(
    eq(operationEvents.automationPaused, false),
    inArray(operationEvents.status, [...ACTIVE_EVENT_STATUSES]),
    isNull(operationEvents.deletedAt),
    or(
      lte(operationEvents.endsAt, nowIso),
      and(ne(operationEvents.status, 'LIVE'), lte(operationEvents.startsAt, nowIso)),
    ),
  )).limit(200)
  summary.scanned = candidates.length

  for (const candidate of candidates) {
    try {
      await options.beforeClaim?.(candidate)
      const result = await runDbTransaction(async tx => {
        const [current] = await tx.select().from(operationEvents).where(and(
          eq(operationEvents.parishId, candidate.parishId),
          eq(operationEvents.id, candidate.id),
          eq(operationEvents.version, candidate.version),
          eq(operationEvents.status, candidate.status),
          eq(operationEvents.automationPaused, false),
          isNull(operationEvents.deletedAt),
        )).limit(1)
        if (!current) return null
        const transition = automaticEventTransition(current, now)
        if (!transition) return null

        const remaining = transition.status === 'COMPLETED'
          ? await unfinishedWork(tx, current.parishId, current.id)
          : undefined
        const note = lifecycleNote(transition.status, current.status, transition.missedReady, remaining)
        const outcomeSummary = transition.status === 'COMPLETED'
          ? (current.outcomeSummary?.trim() || note)
          : current.outcomeSummary
        let completionRecordId = current.completionRecordId

        if (transition.status === 'COMPLETED' && (completionRecordId || current.sourceParishEventId)) {
          const recordValues = {
            title: current.title,
            summary: outcomeSummary!,
            occurredOn: parishCalendarDate(new Date(current.startsAt), current.timezone),
            endedOn: parishCalendarDate(new Date(current.endsAt), current.timezone),
            location: current.location,
            updatedBy: SYSTEM_ACTOR,
            updatedAt: nowIso,
          }
          if (completionRecordId) {
            const [owned] = await tx.update(parishRecords).set(recordValues).where(and(
              eq(parishRecords.parishId, current.parishId),
              eq(parishRecords.id, completionRecordId),
              isNull(parishRecords.deletedAt),
            )).returning({ id: parishRecords.id })
            if (!owned) throw new Error('OPERATION_COMPLETION_RECORD_MISSING')
          } else {
            completionRecordId = generateId('PRC')
            await tx.insert(parishRecords).values({
              id: completionRecordId,
              parishId: current.parishId,
              recordType: 'ACTIVITY',
              ...recordValues,
              content: null,
              status: 'DRAFT',
              visibility: 'STAFF',
              showOnTimeline: true,
              sourceEventId: current.sourceParishEventId,
              createdBy: SYSTEM_ACTOR,
              publishedBy: null,
              publishedAt: null,
              createdAt: nowIso,
              deletedAt: null,
            })
          }
        }

        const [changed] = await tx.update(operationEvents).set({
          status: transition.status,
          outcomeSummary,
          completionRecordId,
          version: current.version + 1,
          updatedBy: SYSTEM_ACTOR,
          updatedAt: nowIso,
        }).where(and(
          eq(operationEvents.parishId, current.parishId),
          eq(operationEvents.id, current.id),
          eq(operationEvents.version, current.version),
          eq(operationEvents.status, current.status),
          eq(operationEvents.automationPaused, false),
        )).returning()
        if (!changed) throw new LostLifecycleRaceError()

        if (transition.status === 'COMPLETED') {
          const taskRows = await tx.select({ id: operationTasks.id }).from(operationTasks).where(and(
            eq(operationTasks.parishId, current.parishId), eq(operationTasks.operationEventId, current.id), isNull(operationTasks.deletedAt),
          ))
          if (taskRows.length) await tx.update(operationTaskDispatches).set({ status: 'CANCELLED', version: sql`${operationTaskDispatches.version} + 1`, updatedAt: nowIso }).where(and(
            eq(operationTaskDispatches.parishId, current.parishId),
            inArray(operationTaskDispatches.taskId, taskRows.map(item => item.id)),
            inArray(operationTaskDispatches.status, ['SCHEDULED', 'PENDING']),
          ))
        }

        await tx.insert(auditLogs).values({
          id: generateId('AUD'),
          parishId: current.parishId,
          userId: SYSTEM_ACTOR,
          action: 'AUTO_TRANSITION',
          entityType: 'operation_event',
          entityId: current.id,
          oldValue: JSON.stringify({ status: current.status, version: current.version }),
          newValue: JSON.stringify({ status: changed.status, version: changed.version, missedReady: transition.missedReady, note, remaining }),
          ip: null,
          userAgent: 'operations-event-lifecycle-worker',
          createdAt: nowIso,
        })
        return changed.status
      })
      if (!result) {
        summary.skipped++
        continue
      }
      summary.transitioned++
      if (result === 'LIVE') summary.started++
      else summary.completed++
    } catch (error) {
      if (error instanceof LostLifecycleRaceError) {
        summary.skipped++
        continue
      }
      summary.failed++
      console.error('[operationsEventLifecycle] transition failed:', {
        parishId: candidate.parishId,
        eventId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return summary
}

let timer: ReturnType<typeof setInterval> | null = null
export function initOperationsEventLifecycleScheduler(): void {
  if (timer) return
  timer = setInterval(() => {
    void processDueOperationEventTransitions().catch(error => console.error('[operationsEventLifecycle] tick failed:', error))
  }, 30_000)
  timer.unref?.()
}

export function stopOperationsEventLifecycleScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
