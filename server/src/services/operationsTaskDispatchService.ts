import { and, eq, isNull, lte } from 'drizzle-orm'
import { db, runDbTransaction, type DbTransaction } from '../db/index.js'
import { notifications, operationEvents, operationTaskDispatches, operationTasks, parishPeople } from '../db/schema.js'
import { isOperationsTargetActionableForResource } from './operationsAuthorization.js'

export type OperationTaskDispatchRun = { scanned: number; invited: number; skipped: number; failed: number }
export type OperationTaskDispatchRunOptions = { beforeClaim?: (candidate: typeof operationTaskDispatches.$inferSelect) => Promise<void> | void }

async function reserveUserId(parishId: string, dispatch: typeof operationTaskDispatches.$inferSelect, tx: DbTransaction) {
  if (dispatch.reserveUserId) return dispatch.reserveUserId
  if (!dispatch.reservePersonId) return null
  const [person] = await tx.select({ linkedUserId: parishPeople.linkedUserId }).from(parishPeople).where(and(
    eq(parishPeople.parishId, parishId), eq(parishPeople.id, dispatch.reservePersonId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt),
  )).limit(1)
  return person?.linkedUserId ?? null
}

export async function processDueOperationTaskDispatches(now = new Date(), options: OperationTaskDispatchRunOptions = {}): Promise<OperationTaskDispatchRun> {
  const nowIso = now.toISOString()
  const candidates = await db.select().from(operationTaskDispatches).where(and(
    eq(operationTaskDispatches.status, 'PENDING'), lte(operationTaskDispatches.reserveInviteAt, nowIso), isNull(operationTaskDispatches.reserveInvitedAt),
  )).limit(200)
  const summary: OperationTaskDispatchRun = { scanned: candidates.length, invited: 0, skipped: 0, failed: 0 }
  for (const candidate of candidates) {
    try {
      await options.beforeClaim?.(candidate)
      const invited = await runDbTransaction(async tx => {
        const [current] = await tx.select().from(operationTaskDispatches).where(and(
          eq(operationTaskDispatches.parishId, candidate.parishId), eq(operationTaskDispatches.id, candidate.id),
          eq(operationTaskDispatches.status, 'PENDING'), eq(operationTaskDispatches.version, candidate.version),
          lte(operationTaskDispatches.reserveInviteAt, nowIso), isNull(operationTaskDispatches.reserveInvitedAt),
        )).limit(1)
        if (!current) return false
        const [task] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, current.parishId), eq(operationTasks.id, current.taskId), isNull(operationTasks.deletedAt))).limit(1)
        const [event] = task?.operationEventId ? await tx.select({ status: operationEvents.status }).from(operationEvents).where(and(eq(operationEvents.parishId, current.parishId), eq(operationEvents.id, task.operationEventId), isNull(operationEvents.deletedAt))).limit(1) : []
        if (!task || ['DONE', 'CANCELLED'].includes(task.status) || !event || ['DRAFT', 'COMPLETED', 'CANCELLED'].includes(event.status)) return false
        const recipientUserId = await reserveUserId(current.parishId, current, tx)
        if (!recipientUserId) throw new Error('DISPATCH_RESERVE_NOT_ACTIONABLE')
        const eligible = await isOperationsTargetActionableForResource(current.parishId, recipientUserId, { taskId: current.taskId }, tx)
        if (!eligible) throw new Error('DISPATCH_RESERVE_NOT_AUTHORIZED')
        const notificationId = `NOT-OPS-DISPATCH-${current.id}-RESERVE`
        const [existing] = await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.parishId, current.parishId), eq(notifications.id, notificationId))).limit(1)
        if (!existing) await tx.insert(notifications).values({
          id: notificationId, type: 'web_push', channel: 'reminder', deliveryKind: 'reminder', status: 'retrying', recipient: 'Operations reserve assignee',
          message: 'Bạn có lời mời dự bị nhận nhiệm vụ trong Catevia. Vui lòng đăng nhập để phản hồi.', triggeredByType: 'system',
          targetUserIds: JSON.stringify([recipientUserId]), attemptCount: 0, maxAttempts: 3, parishId: current.parishId, createdAt: nowIso,
        })
        const [changed] = await tx.update(operationTaskDispatches).set({ reserveInvitedAt: nowIso, version: current.version + 1, updatedAt: nowIso }).where(and(
          eq(operationTaskDispatches.parishId, current.parishId), eq(operationTaskDispatches.id, current.id), eq(operationTaskDispatches.status, 'PENDING'),
          eq(operationTaskDispatches.version, current.version), isNull(operationTaskDispatches.reserveInvitedAt),
        )).returning({ id: operationTaskDispatches.id })
        if (!changed) throw new Error('DISPATCH_RESERVE_INVITE_LOST_RACE')
        return true
      })
      if (invited) summary.invited++
      else summary.skipped++
    } catch (error) {
      if (error instanceof Error && error.message === 'DISPATCH_RESERVE_INVITE_LOST_RACE') summary.skipped++
      else {
        summary.failed++
        console.error('[operationsTaskDispatch] reserve invite failed:', { parishId: candidate.parishId, dispatchId: candidate.id, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  return summary
}

let timer: ReturnType<typeof setInterval> | null = null
export function initOperationsTaskDispatchScheduler(): void {
  if (timer) return
  timer = setInterval(() => { void processDueOperationTaskDispatches().catch(error => console.error('[operationsTaskDispatch] tick failed:', error)) }, 30_000)
  timer.unref?.()
}
export function stopOperationsTaskDispatchScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
