import { Hono } from 'hono'
import { canCreateEventTask, manualEventTransition, preparationAcceptanceReadiness, reserveInvitationAt } from '../domain/OperationsEventLifecycle.js'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, like, lt, lte, ne, notInArray, or, sql } from 'drizzle-orm'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { db } from '../db/index.js'
import type { DbTransaction } from '../db/transactions.js'
import {
  auditLogs,
  operationBlockouts,
  operationChecklistItems,
  operationEventRetrospectives,
  operationEventTemplates,
  operationEventTemplateVersions,
  operationEventParticipants,
  operationEvents,
  operationReminders,
  operationTaskAssignees,
  operationTaskDispatches,
  operationTaskComments,
  operationTaskDependencies,
  operationTasks,
  operationWorkstreamMembers,
  operationWorkstreams,
  notifications,
  parishEvents,
  parishPeople,
  parishRecords,
  parishOrganizationUnits,
  parishServiceTerms,
  users,
} from '../db/schema.js'
import { assertOperationsCapability, assertOperationsTargetWithinAuthority, getOperationsCallerPermissions, listOperationsCandidates, peekOperationsAuthorizationReason, resolveOperationsAuthorization, resolveOperationsAuthorizationBatch, resolveOperationsUserAuthorization } from '../services/operationsAuthorization.js'
import { OperationsIdempotencyError, requireOperationsIdempotencyKey, runIdempotentOperationsCommand } from '../services/operationsIdempotency.js'
import { generateId } from '../utils/id.js'
import { getClientIp } from '../utils/ip.js'
import { errorResponse, paginatedResponse, sendError, successResponse } from '../utils/response.js'
import { VersionConflictError } from '../domain/errors.js'
import { getParishTimeZone, parishCalendarDate } from '../utils/parishTimeZone.js'

const operationsRouter = new Hono()
operationsRouter.use('*', authMiddleware)
operationsRouter.use('*', roleMiddleware('admin', 'chunhiem', 'phuta'))

const id = z.string().trim().min(1).max(100)
const nullableId = id.nullable().optional()
const instant = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString())
const ianaTimeZone = z.string().trim().min(1).max(80).refine(value => {
  try {
    getParishTimeZone(value)
    return true
  } catch {
    return false
  }
}, 'Múi giờ IANA không hợp lệ.')
const exactTarget = <T extends z.ZodRawShape>(shape: T) => z.object(shape).superRefine((value: any, ctx) => {
  if ((value.userId ? 1 : 0) + (value.personId ? 1 : 0) !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['userId'], message: 'Phải có đúng một userId hoặc personId.' })
})
const workstreamCreateSchema = z.object({
  eventId: nullableId,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(3000).nullable().optional(),
  sourceUnitId: nullableId,
  isRequired: z.boolean().optional().default(false),
  autoAssignLeader: z.boolean().optional().default(false),
})
const workstreamUpdateSchema = workstreamCreateSchema.omit({ eventId: true, autoAssignLeader: true }).partial().extend({ version: z.number().int().min(1) })
const workstreamDeleteSchema = z.object({
  version: z.number().int().min(1),
  reason: z.string().trim().max(2000).optional(),
})
const workstreamMemberSchema = exactTarget({
  version: z.number().int().min(1),
  userId: nullableId,
  personId: nullableId,
  operationRole: z.enum(['WORKSTREAM_LEAD', 'OBSERVER']),
  startsAt: instant.nullable().optional(),
  endsAt: instant.nullable().optional(),
})
function taskScheduleError(value: { scheduledStartAt?: string | null; scheduledEndAt?: string | null }): string | null {
  const start = value.scheduledStartAt ?? null
  const end = value.scheduledEndAt ?? null
  if (Boolean(start) !== Boolean(end)) return 'Ca công việc phải có đủ giờ bắt đầu và kết thúc.'
  if (start && end && end <= start) return 'Giờ kết thúc ca phải sau giờ bắt đầu.'
  return null
}
function validateTaskSchedule(value: { scheduledStartAt?: string | null; scheduledEndAt?: string | null }, ctx: z.RefinementCtx) {
  const message = taskScheduleError(value)
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduledEndAt'], message })
}
const taskCreateSchema = z.object({
  phase: z.enum(['PREPARATION', 'EXECUTION', 'FOLLOW_UP']).optional().default('PREPARATION'),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).nullable().optional(),
  eventId: nullableId,
  workstreamId: nullableId,
  scopeUnitId: nullableId,
  parentTaskId: nullableId,
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional().default('NORMAL'),
  dueAt: instant.nullable().optional(),
  scheduledStartAt: instant.nullable().optional(),
  scheduledEndAt: instant.nullable().optional(),
  isRequired: z.boolean().optional().default(false),
}).superRefine(validateTaskSchedule)
const taskUpdateSchema = z.object({
  version: z.number().int().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  dueAt: instant.nullable().optional(),
  scheduledStartAt: instant.nullable().optional(),
  scheduledEndAt: instant.nullable().optional(),
  isRequired: z.boolean().optional(),
})
const assignmentSchema = exactTarget({
  version: z.number().int().min(1),
  userId: nullableId,
  personId: nullableId,
  assignmentRole: z.enum(['OWNER', 'CONTRIBUTOR']),
  note: z.string().trim().max(2000).nullable().optional(),
})
const acknowledgementSchema = z.object({ assignmentId: id, version: z.number().int().min(1), status: z.enum(['ACCEPTED', 'DECLINED']), note: z.string().trim().max(2000).nullable().optional() })
const dispatchCreateSchema = z.object({
  version: z.number().int().min(1),
  primaryUserId: nullableId,
  primaryPersonId: nullableId,
  reserveUserId: nullableId,
  reservePersonId: nullableId,
  acknowledgeBy: instant,
}).superRefine((value, ctx) => {
  if ((value.primaryUserId ? 1 : 0) + (value.primaryPersonId ? 1 : 0) !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['primaryUserId'], message: 'Phải chọn đúng một người thực hiện chính.' })
  if ((value.reserveUserId ? 1 : 0) + (value.reservePersonId ? 1 : 0) > 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reserveUserId'], message: 'Người dự bị chỉ dùng user hoặc person.' })
})
const dispatchAcceptSchema = z.object({ version: z.number().int().min(1), target: z.enum(['PRIMARY', 'RESERVE']) })
const eventCreateSchema = z.object({
  sourceParishEventId: nullableId,
  eventScopeType: z.enum(['XU_DOAN', 'UNIT']).nullable().optional(),
  scopeUnitId: nullableId,
  organizerUserId: nullableId,
  organizerPersonId: nullableId,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).nullable().optional(),
  eventType: z.string().trim().min(1).max(80),
  startsAt: instant,
  endsAt: instant,
  timezone: ianaTimeZone,
  location: z.string().trim().max(300).nullable().optional(),
  visibility: z.enum(['INTERNAL', 'PUBLIC_SUMMARY']).optional().default('INTERNAL'),
  expectedHeadcount: z.number().int().min(0).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'Thời gian kết thúc phải sau thời gian bắt đầu.' })
  if (value.organizerUserId && value.organizerPersonId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['organizerUserId'], message: 'Organizer chỉ dùng user hoặc person, không dùng cả hai.' })
})
const eventUpdateSchema = z.object({
  version: z.number().int().min(1),
  sourceParishEventId: nullableId,
  eventScopeType: z.enum(['XU_DOAN', 'UNIT']).nullable().optional(),
  scopeUnitId: nullableId,
  organizerUserId: nullableId,
  organizerPersonId: nullableId,
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  eventType: z.string().trim().min(1).max(80).optional(),
  startsAt: instant.optional(),
  endsAt: instant.optional(),
  timezone: ianaTimeZone.optional(),
  location: z.string().trim().max(300).nullable().optional(),
  visibility: z.enum(['INTERNAL', 'PUBLIC_SUMMARY']).optional(),
  expectedHeadcount: z.number().int().min(0).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.organizerUserId && value.organizerPersonId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['organizerUserId'], message: 'Organizer chỉ dùng user hoặc person, không dùng cả hai.' })
})
const participantSchema = exactTarget({ userId: nullableId, personId: nullableId, participantRole: z.string().trim().min(1).max(80).default('ATTENDEE') })
const participantStatusSchema = z.object({ version: z.number().int().min(1), status: z.enum(['PLANNED', 'CONFIRMED', 'DECLINED', 'ATTENDED', 'ABSENT']) })
const blockoutSchema = exactTarget({ userId: nullableId, personId: nullableId, startsAt: instant, endsAt: instant, reason: z.string().trim().max(500).nullable().optional() }).superRefine((value, ctx) => {
  if (value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'Khoảng thời gian không hợp lệ.' })
})
const blockoutUpdateSchema = z.object({ version: z.number().int().min(1), startsAt: instant, endsAt: instant, reason: z.string().trim().max(500).nullable() }).superRefine((value, ctx) => {
  if (value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'Khoảng thời gian không hợp lệ.' })
})
const blockoutRevokeSchema = z.object({ version: z.number().int().min(1) })
const reminderSchema = z.object({ taskId: nullableId, eventId: nullableId, recipientUserId: id, triggerAt: instant, kind: z.enum(['TASK_DUE', 'EVENT_START', 'OVERDUE']) }).superRefine((value, ctx) => {
  if ((value.taskId ? 1 : 0) + (value.eventId ? 1 : 0) !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['taskId'], message: 'Reminder phải thuộc đúng một task hoặc event.' })
})
const reminderRescheduleSchema = z.object({ expectedVersion: z.number().int().min(1), triggerAt: instant, reason: z.string().trim().min(1).max(2000) })
const reminderCancelSchema = z.object({ expectedVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(2000) })
const reminderReadSchema = z.object({ expectedVersion: z.number().int().min(1).optional() })
const eventTransitionSchema = z.object({ version: z.number().int().min(1), status: z.enum(['DRAFT', 'PLANNING', 'PREPARING', 'READY', 'LIVE', 'COMPLETED', 'CANCELLED']), reason: z.string().trim().max(2000).nullable().optional(), outcomeSummary: z.string().trim().max(5000).nullable().optional(), override: z.boolean().optional().default(false) })
const eventAutomationResumeSchema = z.object({ version: z.number().int().min(1), reason: z.string().trim().min(1).max(2000) })
const eventRetrospectiveSchema = z.object({
  expectedVersion: z.number().int().min(1).nullable(),
  lessonsLearned: z.string().trim().min(1).max(5000),
  improvementNotes: z.string().trim().max(5000).nullable().optional(),
})
const eventFollowUpSchema = exactTarget({
  eventVersion: z.number().int().min(1),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).nullable().optional(),
  dueAt: instant,
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional().default('NORMAL'),
  userId: nullableId,
  personId: nullableId,
})
const templateSnapshotSchema = z.object({
  event: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(5000).nullable(),
    eventType: z.string().trim().min(1).max(80),
    durationMinutes: z.number().int().min(1),
    location: z.string().trim().max(300).nullable(),
    expectedHeadcount: z.number().int().min(0).nullable(),
  }),
  tasks: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(5000).nullable(),
    phase: z.enum(['PREPARATION', 'EXECUTION', 'FOLLOW_UP']),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    isRequired: z.boolean(),
    dueOffsetMinutes: z.number().int().nullable(),
    scheduledStartOffsetMinutes: z.number().int().nullable().optional().default(null),
    scheduledEndOffsetMinutes: z.number().int().nullable().optional().default(null),
    checklist: z.array(z.object({ label: z.string().trim().min(1).max(300), isRequired: z.boolean(), sortOrder: z.number().int().min(0) })),
  })),
})
type OperationTemplateSnapshot = z.infer<typeof templateSnapshotSchema>
const templateCreateSchema = z.object({
  eventVersion: z.number().int().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(3000).nullable().optional(),
})
const templateVersionCreateSchema = z.object({
  expectedVersion: z.number().int().min(1),
  expectedLatestVersion: z.number().int().min(1),
  sourceEventId: id,
  sourceEventVersion: z.number().int().min(1),
  reason: z.string().trim().min(1).max(2000),
})
const templateStatusChangeSchema = z.object({
  expectedVersion: z.number().int().min(1),
  expectedLatestVersion: z.number().int().min(1),
  reason: z.string().trim().min(1).max(2000),
})
const templateListQuerySchema = z.object({ archived: z.enum(['true', 'false']).optional().default('false') })
// W2.13: server-side event search filters (q = title/location substring).
const eventListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['DRAFT', 'PLANNING', 'PREPARING', 'READY', 'LIVE', 'COMPLETED', 'CANCELLED']).optional(),
  scope: z.enum(['XU_DOAN', 'UNIT']).optional(),
})
const templatePreviewQuerySchema = z.object({ version: z.coerce.number().int().min(1).optional(), startsAt: instant })
const templateInstantiateSchema = z.object({
  templateVersion: z.number().int().min(1),
  startsAt: instant,
  timezone: ianaTimeZone,
  visibility: z.enum(['INTERNAL', 'PUBLIC_SUMMARY']).optional().default('INTERNAL'),
  organizerUserId: nullableId,
  organizerPersonId: nullableId,
}).superRefine((value, ctx) => {
  if (value.organizerUserId && value.organizerPersonId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['organizerUserId'], message: 'Organizer chỉ dùng user hoặc person, không dùng cả hai.' })
})
const taskTransitionSchema = z.object({ version: z.number().int().min(1), status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']), completionNote: z.string().trim().max(3000).nullable().optional(), blockedReason: z.string().trim().max(2000).nullable().optional(), cancellationReason: z.string().trim().max(2000).nullable().optional() })
const taskRestoreSchema = z.object({ version: z.number().int().min(1), reason: z.string().trim().min(1).max(2000) })
const eventRestoreSchema = z.object({ version: z.number().int().min(1), reason: z.string().trim().min(1).max(2000) })
const dependencySchema = z.object({ version: z.number().int().min(1), dependsOnTaskId: id })
const dependencyRemoveSchema = z.object({ version: z.number().int().min(1), reason: z.string().trim().min(1).max(2000) })
const checklistCreateSchema = z.object({ version: z.number().int().min(1), label: z.string().trim().min(1).max(300), isRequired: z.boolean().optional().default(false), sortOrder: z.number().int().min(0).max(10000).optional().default(0) })
const checklistUpdateSchema = z.object({ version: z.number().int().min(1), isDone: z.boolean() })
const commentSchema = z.object({ content: z.string().trim().min(1).max(5000), evidenceUrl: z.string().url().max(2000).refine(value => value.startsWith('https://'), 'Evidence URL phải dùng HTTPS.').nullable().optional() })
const memberRemoveSchema = z.object({ version: z.number().int().min(1), memberVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(2000) })
const memberValiditySchema = z.object({
  version: z.number().int().min(1),
  memberVersion: z.number().int().min(1),
  startsAt: instant.nullable(),
  endsAt: instant.nullable(),
  reason: z.string().trim().min(1).max(2000),
}).superRefine((value, ctx) => {
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'Thời hạn role không hợp lệ.' })
})
const leadReplacementSchema = exactTarget({
  version: z.number().int().min(1),
  currentLeadMemberId: nullableId,
  currentLeadMemberVersion: z.number().int().min(1).nullable().optional(),
  userId: nullableId,
  personId: nullableId,
  endsAt: instant.nullable().optional(),
  reason: z.string().trim().min(1).max(2000),
}).superRefine((value, ctx) => {
  if (Boolean(value.currentLeadMemberId) !== Boolean(value.currentLeadMemberVersion)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['currentLeadMemberId'], message: 'Phải gửi cả id và version của Trưởng nhóm hiện tại, hoặc bỏ trống cả hai.' })
  }
})
const assignmentRemoveSchema = z.object({ version: z.number().int().min(1), assignmentVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(2000) })

const OPERATIONS_LIST_DEFAULT_LIMIT = 50
const OPERATIONS_LIST_MAX_LIMIT = 500

function listPagination(c: any) {
  const page = c.req.query('page') === undefined ? 1 : Number(c.req.query('page'))
  const limit = c.req.query('limit') === undefined ? OPERATIONS_LIST_DEFAULT_LIMIT : Number(c.req.query('limit'))
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > OPERATIONS_LIST_MAX_LIMIT) {
    throw Object.assign(new Error(`page phải >= 1 và limit phải từ 1 đến ${OPERATIONS_LIST_MAX_LIMIT}.`), { status: 400 })
  }
  return { page, limit, offset: (page - 1) * limit }
}

function actor(c: any): JwtPayload { return c.get('user') as JwtPayload }
function handleError(c: any, error: any) {
  if (error instanceof VersionConflictError) return errorResponse(c, 'VERSION_CONFLICT', error.message, 409)
  if (error instanceof OperationsIdempotencyError) return errorResponse(c, error.code, error.message, error.code === 'IDEMPOTENCY_KEY_REQUIRED' ? 400 : 409)
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
    const code = error?.code || (error.status === 403 ? 'FORBIDDEN' : error.status === 404 ? 'NOT_FOUND' : error.status === 409 ? 'CONFLICT' : 'VALIDATION_ERROR')
    return errorResponse(c, code, error.message, error.status)
  }
  const databaseError = `${error?.code || ''} ${error?.cause?.code || ''} ${error?.message || ''} ${error?.cause?.message || ''}`
  if (databaseError.includes('UNIQUE') || databaseError.includes('SQLITE_CONSTRAINT')) return errorResponse(c, 'CONFLICT', 'Dữ liệu Operations bị trùng hoặc vi phạm ràng buộc.', 409)
  throw error
}
function key(c: any): string { return requireOperationsIdempotencyKey(c.req.header('idempotency-key') || c.req.header('x-idempotency-key')) }
function commandResponse(c: any, result: { value: unknown; replayed: boolean }, created = false) {
  c.header('Idempotency-Replayed', result.replayed ? 'true' : 'false')
  return successResponse(c, result.value, created && !result.replayed ? 201 : 200)
}
function asAuditObject(value: unknown): Record<string, unknown> {
  if (value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) return { ...(value as Record<string, unknown>) }
  if (value === undefined) return {}
  return { value }
}
async function audit(tx: DbTransaction, user: JwtPayload, c: any, action: string, entityType: string, entityId: string, oldValue?: unknown, newValue?: unknown) {
  const authorizationReason = peekOperationsAuthorizationReason(tx)
  const storedNewValue = authorizationReason
    ? { ...asAuditObject(newValue), authorizationReason }
    : newValue
  await tx.insert(auditLogs).values({ id: generateId('AUD'), userId: user.userId, action, entityType, entityId, oldValue: oldValue === undefined ? null : JSON.stringify(oldValue), newValue: storedNewValue === undefined ? null : JSON.stringify(storedNewValue), ip: getClientIp(c), userAgent: c.req.header('user-agent') || '', parishId: user.parishId })
}
async function actionableTargetUserId(tx: DbTransaction, parishId: string, target: { userId?: string | null; personId?: string | null }) {
  if (target.userId) return target.userId
  if (!target.personId) return null
  const [person] = await tx.select({ linkedUserId: parishPeople.linkedUserId }).from(parishPeople).where(and(
    eq(parishPeople.parishId, parishId), eq(parishPeople.id, target.personId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt),
  )).limit(1)
  return person?.linkedUserId ?? null
}
async function enqueueDispatchInvitation(tx: DbTransaction, parishId: string, dispatchId: string, targetKind: 'PRIMARY' | 'RESERVE', recipientUserId: string, now: string) {
  const notificationId = `NOT-OPS-DISPATCH-${dispatchId}-${targetKind}`
  const [existing] = await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.parishId, parishId), eq(notifications.id, notificationId))).limit(1)
  if (!existing) await tx.insert(notifications).values({
    id: notificationId, type: 'web_push', channel: 'reminder', deliveryKind: 'reminder', status: 'retrying', recipient: 'Operations assignee',
    message: 'Bạn có lời mời nhận nhiệm vụ mới trong Catevia. Vui lòng đăng nhập để phản hồi.', triggeredByType: 'system',
    targetUserIds: JSON.stringify([recipientUserId]), attemptCount: 0, maxAttempts: 3, parishId, createdAt: now,
  })
}
async function activateScheduledDispatchesForEvent(tx: DbTransaction, parishId: string, eventId: string, now: string) {
  const rows = await tx.select({ dispatch: operationTaskDispatches }).from(operationTaskDispatches).innerJoin(operationTasks, and(
    eq(operationTasks.parishId, operationTaskDispatches.parishId), eq(operationTasks.id, operationTaskDispatches.taskId),
  )).where(and(
    eq(operationTaskDispatches.parishId, parishId), eq(operationTaskDispatches.status, 'SCHEDULED'),
    eq(operationTasks.operationEventId, eventId), isNull(operationTasks.deletedAt),
  ))
  for (const { dispatch } of rows) {
    if (dispatch.acknowledgeBy <= now) throw Object.assign(new Error('Hạn nhận nhiệm vụ phải sau thời điểm chuyển sang Kế hoạch.'), { status: 409, code: 'DISPATCH_ACKNOWLEDGEMENT_DEADLINE_PASSED' })
    const hasReserve = Boolean(dispatch.reserveUserId || dispatch.reservePersonId)
    const [changed] = await tx.update(operationTaskDispatches).set({
      status: 'PENDING', primaryInvitedAt: now, reserveInviteAt: hasReserve ? reserveInvitationAt(now, dispatch.acknowledgeBy) : null,
      version: dispatch.version + 1, updatedAt: now,
    }).where(and(eq(operationTaskDispatches.parishId, parishId), eq(operationTaskDispatches.id, dispatch.id), eq(operationTaskDispatches.status, 'SCHEDULED'), eq(operationTaskDispatches.version, dispatch.version))).returning()
    if (!changed) throw new VersionConflictError('Lời mời nhận nhiệm vụ đã bị thay đổi.', dispatch)
    const primaryUserId = await actionableTargetUserId(tx, parishId, { userId: changed.primaryUserId, personId: changed.primaryPersonId })
    if (!primaryUserId) throw Object.assign(new Error('Người thực hiện chính không còn tài khoản hoạt động.'), { status: 409, code: 'DISPATCH_PRIMARY_NOT_ACTIONABLE' })
    await enqueueDispatchInvitation(tx, parishId, changed.id, 'PRIMARY', primaryUserId, now)
  }
}
async function cancelOpenDispatchesForEvent(tx: DbTransaction, parishId: string, eventId: string, now: string) {
  const taskRows = await tx.select({ id: operationTasks.id }).from(operationTasks).where(and(
    eq(operationTasks.parishId, parishId), eq(operationTasks.operationEventId, eventId), isNull(operationTasks.deletedAt),
  ))
  if (!taskRows.length) return
  await tx.update(operationTaskDispatches).set({ status: 'CANCELLED', version: sql`${operationTaskDispatches.version} + 1`, updatedAt: now }).where(and(
    eq(operationTaskDispatches.parishId, parishId),
    inArray(operationTaskDispatches.taskId, taskRows.map(item => item.id)),
    inArray(operationTaskDispatches.status, ['SCHEDULED', 'PENDING']),
  ))
}
const PUBLIC_EVENT_CATEGORY_NAMES = {
  FEAST_DAY: 'Lễ Bổn Mạng', CAMP: 'Trại Hè / Sa Mạc', TRAINING: 'Huấn Luyện', SACRAMENT: 'Bí Tích', RETREAT: 'Tĩnh Tâm', MEETING: 'Họp Xứ Đoàn', OTHER: 'Sự Kiện Khác',
} as const
function publicCalendarProjection(event: { title: string; eventType: string; startsAt: string; timezone: string; location: string | null }) {
  const category: keyof typeof PUBLIC_EVENT_CATEGORY_NAMES = Object.hasOwn(PUBLIC_EVENT_CATEGORY_NAMES, event.eventType) ? event.eventType as keyof typeof PUBLIC_EVENT_CATEGORY_NAMES : 'OTHER'
  const startsAt = new Date(event.startsAt)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: event.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(startsAt)
  return { date: parishCalendarDate(startsAt, event.timezone), title: event.title, category, categoryName: PUBLIC_EVENT_CATEGORY_NAMES[category], time, location: event.location }
}
function assertPublicCalendarFields(event: { visibility: string; title: string; location: string | null }) {
  if (event.visibility !== 'PUBLIC_SUMMARY') return
  if (event.title.length > 200) throw Object.assign(new Error('Tên sự kiện công khai tối đa 200 ký tự.'), { status: 400, code: 'PUBLIC_EVENT_TITLE_TOO_LONG' })
  if ((event.location?.length ?? 0) > 200) throw Object.assign(new Error('Địa điểm sự kiện công khai tối đa 200 ký tự.'), { status: 400, code: 'PUBLIC_EVENT_LOCATION_TOO_LONG' })
}
async function upsertPublicCalendarEvent(tx: DbTransaction, parishId: string, actorUserId: string, sourceId: string | null, event: { title: string; eventType: string; startsAt: string; timezone: string; location: string | null }, now: string) {
  const projection = publicCalendarProjection(event)
  if (sourceId) {
    const [existing] = await tx.select({ id: parishEvents.id }).from(parishEvents).where(and(eq(parishEvents.parishId, parishId), eq(parishEvents.id, sourceId))).limit(1)
    if (existing) {
      await tx.update(parishEvents).set({ ...projection, updatedAt: now, deletedAt: null }).where(and(eq(parishEvents.parishId, parishId), eq(parishEvents.id, sourceId)))
      return sourceId
    }
  }
  const id = generateId('EVT')
  await tx.insert(parishEvents).values({ id, parishId, ...projection, createdBy: actorUserId, createdAt: now, updatedAt: now, deletedAt: null })
  return id
}
async function enqueuePublicEventParentNotification(tx: DbTransaction, parishId: string, eventId: string, eventVersion: number, event: { title: string; startsAt: string; timezone: string; location: string | null }, now: string) {
  const parents = await tx.select({ id: users.id }).from(users).where(and(
    eq(users.parishId, parishId), eq(users.role, 'phuhuynh'), eq(users.status, 'ACTIVE'), isNull(users.deletedAt),
  ))
  if (parents.length === 0) return
  const projection = publicCalendarProjection({ ...event, eventType: 'OTHER' })
  const location = projection.location ? `, tại ${projection.location}` : ''
  await tx.insert(notifications).values({
    id: `NOT-OPS-PUBLIC-${eventId}-${eventVersion}`, parishId, studentId: null, type: 'web_push', channel: 'reminder', deliveryKind: 'info', status: 'retrying',
    recipient: 'Phụ huynh', message: `Sự kiện ${projection.title}: ${projection.date} lúc ${projection.time}${location}.`, error: null,
    triggeredByType: 'system', triggeredByUserId: null, sentAt: null, targetUserIds: JSON.stringify(parents.map(parent => parent.id)), attemptCount: 0, maxAttempts: 3,
    leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: null, createdAt: now,
  })
}
async function assertTarget(tx: DbTransaction, parishId: string, userId?: string | null, personId?: string | null, requireOperationsAccount = false) {
  if (userId) {
    const [row] = await tx.select({ id: users.id, role: users.role }).from(users).where(and(eq(users.parishId, parishId), eq(users.id, userId), eq(users.status, 'ACTIVE'), isNull(users.deletedAt))).limit(1)
    if (!row) throw Object.assign(new Error('Không tìm thấy tài khoản đang hoạt động trong giáo xứ.'), { status: 404 })
    if (requireOperationsAccount && !['admin', 'chunhiem', 'phuta'].includes(row.role)) {
      throw Object.assign(new Error('Tài khoản đích không có quyền truy cập Operations.'), { status: 400, code: 'INVALID_OPERATIONS_TARGET' })
    }
  }
  if (personId) {
    const [row] = await tx.select({ id: parishPeople.id, linkedUserId: parishPeople.linkedUserId }).from(parishPeople).where(and(eq(parishPeople.parishId, parishId), eq(parishPeople.id, personId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1)
    if (!row) throw Object.assign(new Error('Không tìm thấy nhân sự đang hoạt động trong giáo xứ.'), { status: 404 })
    if (requireOperationsAccount && row.linkedUserId) {
      const [linkedAccount] = await tx.select({ id: users.id }).from(users).where(and(
        eq(users.parishId, parishId), eq(users.id, row.linkedUserId), inArray(users.role, ['admin', 'chunhiem', 'phuta']), eq(users.status, 'ACTIVE'), isNull(users.deletedAt),
      )).limit(1)
      if (!linkedAccount) throw Object.assign(new Error('Tài khoản liên kết của nhân sự không có quyền truy cập Operations.'), { status: 400, code: 'INVALID_OPERATIONS_TARGET' })
    }
  }
}
function assertEventFieldsMutable(event: { status: string }) {
  if (event.status === 'LIVE' || event.status === 'COMPLETED' || event.status === 'CANCELLED') {
    throw Object.assign(new Error('Không thể sửa thông tin event sau khi đã LIVE hoặc kết thúc.'), { status: 409, code: 'EVENT_IMMUTABLE' })
  }
}
function assertTaskMutable(task: { status: string }) {
  if (task.status === 'DONE' || task.status === 'CANCELLED') {
    throw Object.assign(new Error('Task đã kết thúc; không thể thay đổi cấu trúc hoặc phân công.'), { status: 409, code: 'TASK_IMMUTABLE' })
  }
}
async function assertEventAcceptsPlanningMutation(tx: DbTransaction, parishId: string, eventId: string, action: string) {
  const [event] = await tx.select({ status: operationEvents.status }).from(operationEvents).where(and(
    eq(operationEvents.parishId, parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt),
  )).limit(1)
  if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
  if (event.status === 'COMPLETED' || event.status === 'CANCELLED') {
    throw Object.assign(new Error(`Event đã kết thúc; không thể ${action}.`), { status: 409, code: 'EVENT_IMMUTABLE' })
  }
}
async function assertWorkstreamEventAcceptsMutation(tx: DbTransaction, parishId: string, eventId: string | null, action: string) {
  if (eventId) await assertEventAcceptsPlanningMutation(tx, parishId, eventId, action)
}
async function workstreamEventStatus(tx: DbTransaction, parishId: string, eventId: string | null) {
  if (!eventId) return null
  const [event] = await tx.select({ status: operationEvents.status }).from(operationEvents).where(and(
    eq(operationEvents.parishId, parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt),
  )).limit(1)
  if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
  return event.status
}
async function assertWorkstreamMembershipMutationAllowed(
  tx: DbTransaction,
  parishId: string,
  eventId: string | null,
  operationRole: string,
  action: string,
) {
  const status = await workstreamEventStatus(tx, parishId, eventId)
  if (status === 'COMPLETED' || status === 'CANCELLED') {
    throw Object.assign(new Error(`Event đã kết thúc; không thể ${action}.`), { status: 409, code: 'EVENT_IMMUTABLE' })
  }
  if (status === 'LIVE' && operationRole === 'WORKSTREAM_LEAD') {
    throw Object.assign(new Error('Sự kiện đang LIVE; phải dùng thao tác thay Trưởng nhóm để không tạo khoảng trống điều hành.'), { status: 409, code: 'USE_LEAD_REPLACEMENT' })
  }
}
async function assertLiveWorkstreamLeadReplacement(tx: DbTransaction, parishId: string, eventId: string | null) {
  const status = await workstreamEventStatus(tx, parishId, eventId)
  if (status !== 'LIVE') {
    throw Object.assign(new Error('Thao tác thay Trưởng nhóm nguyên tử chỉ dùng khi sự kiện đang LIVE.'), { status: 409, code: 'LEAD_REPLACEMENT_REQUIRES_LIVE' })
  }
}
async function assertReminderRecipientCanView(tx: DbTransaction, parishId: string, recipientUserId: string, taskId?: string | null, eventId?: string | null) {
  const capability = taskId ? 'operations.task.view' as const : 'operations.event.view' as const
  const decision = await resolveOperationsUserAuthorization(parishId, recipientUserId, capability, { taskId: taskId ?? null, eventId: eventId ?? null }, tx)
  if (!decision.allowed) throw Object.assign(new Error('Người nhận không còn quyền xem resource Operations này.'), { status: 400, code: 'REMINDER_RECIPIENT_NOT_AUTHORIZED' })
}
async function assertScopeUnit(tx: DbTransaction, parishId: string, unitId?: string | null) {
  if (!unitId) return
  const [unit] = await tx.select({ id: parishOrganizationUnits.id }).from(parishOrganizationUnits).where(and(eq(parishOrganizationUnits.parishId, parishId), eq(parishOrganizationUnits.id, unitId), eq(parishOrganizationUnits.isActive, true), isNull(parishOrganizationUnits.deletedAt))).limit(1)
  if (!unit) throw Object.assign(new Error('Không tìm thấy đơn vị tổ chức đang hoạt động.'), { status: 404 })
}

/**
 * Xứ đoàn business rules (O1-O8 locked).
 * - eventScopeType XU_DOAN ↔ scopeUnitId NULL, UNIT ↔ scopeUnitId NOT NULL.
 * - Creator ≠ Organizer. Thư ký/Phó xứ tạo Xứ đoàn event → organizer phải là Xứ đoàn trưởng.
 * - Phó Ban/Ngành tạo chuyên môn event → organizer phải là Trưởng cùng unit.
 * - WORKSTREAM_LEAD phải là Trưởng Ban/Ngành đúng unit (O3: Phó không được làm Lead).
 */
type ActorPosition = { positionCode: string | null; unitId: string | null }
async function getActorActivePositions(tx: DbTransaction, parishId: string, actorUserId: string): Promise<ActorPosition[]> {
  const [person] = await tx.select({ id: parishPeople.id }).from(parishPeople)
    .where(and(eq(parishPeople.parishId, parishId), eq(parishPeople.linkedUserId, actorUserId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1)
  if (!person) return []
  const today = parishCalendarDate()
  const terms = await tx.select({ positionCode: parishServiceTerms.positionCode, unitId: parishServiceTerms.unitId })
    .from(parishServiceTerms)
    .where(and(
      eq(parishServiceTerms.parishId, parishId),
      eq(parishServiceTerms.personId, person.id),
      isNull(parishServiceTerms.deletedAt),
      lte(parishServiceTerms.startDate, today),
      or(isNull(parishServiceTerms.endDate), gte(parishServiceTerms.endDate, today)),
    ))
  return terms.map(term => ({ positionCode: term.positionCode, unitId: term.unitId }))
}

function resolveEventScopeType(inputScopeType: 'XU_DOAN' | 'UNIT' | null | undefined, scopeUnitId?: string | null): 'XU_DOAN' | 'UNIT' {
  const derived = scopeUnitId ? 'UNIT' as const : 'XU_DOAN' as const
  const scopeType = inputScopeType ?? derived
  if (scopeType === 'XU_DOAN' && scopeUnitId) {
    throw Object.assign(new Error('Sự kiện Xứ đoàn không thuộc Ban/Ngành cụ thể (scopeUnitId phải để trống).'), { status: 400, code: 'OPERATION_EVENT_SCOPE_TYPE_MISMATCH' })
  }
  if (scopeType === 'UNIT' && !scopeUnitId) {
    throw Object.assign(new Error('Sự kiện chuyên môn phải thuộc đúng một Ban/Ngành (thiếu scopeUnitId).'), { status: 400, code: 'OPERATION_EVENT_SCOPE_TYPE_MISMATCH' })
  }
  return scopeType
}

async function findActiveParishLeaderUserId(tx: DbTransaction, parishId: string): Promise<string | null> {
  const today = parishCalendarDate()
  const leaders = await tx.select({ linkedUserId: parishPeople.linkedUserId })
    .from(parishServiceTerms)
    .innerJoin(parishPeople, and(eq(parishPeople.parishId, parishServiceTerms.parishId), eq(parishPeople.id, parishServiceTerms.personId)))
    .innerJoin(users, and(eq(users.parishId, parishPeople.parishId), eq(users.id, parishPeople.linkedUserId)))
    .where(and(
      eq(parishServiceTerms.parishId, parishId),
      eq(parishServiceTerms.positionCode, 'PARISH_LEADER'),
      isNull(parishServiceTerms.deletedAt),
      lte(parishServiceTerms.startDate, today),
      or(isNull(parishServiceTerms.endDate), gte(parishServiceTerms.endDate, today)),
      eq(parishPeople.serviceStatus, 'ACTIVE'),
      isNull(parishPeople.deletedAt),
      eq(users.status, 'ACTIVE'),
      isNull(users.deletedAt),
    )).limit(2)
  if (leaders.length !== 1) return null
  return leaders[0].linkedUserId
}

async function isActiveParishLeader(tx: DbTransaction, parishId: string, userId: string | null, personId: string | null): Promise<boolean> {
  if (!userId && !personId) return false
  const today = parishCalendarDate()
  const rows = await tx.select({ id: parishServiceTerms.id })
    .from(parishServiceTerms)
    .innerJoin(parishPeople, and(eq(parishPeople.parishId, parishServiceTerms.parishId), eq(parishPeople.id, parishServiceTerms.personId)))
    .where(and(
      eq(parishServiceTerms.parishId, parishId),
      eq(parishServiceTerms.positionCode, 'PARISH_LEADER'),
      isNull(parishServiceTerms.deletedAt),
      lte(parishServiceTerms.startDate, today),
      or(isNull(parishServiceTerms.endDate), gte(parishServiceTerms.endDate, today)),
      eq(parishPeople.serviceStatus, 'ACTIVE'),
      isNull(parishPeople.deletedAt),
      userId ? eq(parishPeople.linkedUserId, userId) : eq(parishPeople.id, personId!),
    )).limit(1)
  return rows.length > 0
}

/** Organizer sự kiện chuyên môn phải là Trưởng Ban/Trưởng Ngành đương nhiệm đúng unit (Trưởng Xứ đoàn chỉ đứng tên event Xứ đoàn). */
async function isActiveUnitLeader(tx: DbTransaction, parishId: string, scopeUnitId: string, userId: string | null, personId: string | null): Promise<boolean> {
  if (!userId && !personId) return false
  const today = parishCalendarDate()
  const rows = await tx.select({ id: parishServiceTerms.id })
    .from(parishServiceTerms)
    .innerJoin(parishPeople, and(eq(parishPeople.parishId, parishServiceTerms.parishId), eq(parishPeople.id, parishServiceTerms.personId)))
    .where(and(
      eq(parishServiceTerms.parishId, parishId),
      inArray(parishServiceTerms.positionCode, ['BRANCH_LEADER', 'COMMITTEE_LEADER']),
      eq(parishServiceTerms.unitId, scopeUnitId),
      isNull(parishServiceTerms.deletedAt),
      lte(parishServiceTerms.startDate, today),
      or(isNull(parishServiceTerms.endDate), gte(parishServiceTerms.endDate, today)),
      eq(parishPeople.serviceStatus, 'ACTIVE'),
      isNull(parishPeople.deletedAt),
      userId ? eq(parishPeople.linkedUserId, userId) : eq(parishPeople.id, personId!),
    )).limit(1)
  return rows.length > 0
}

/**
 * Name-only display resolution for Operations event rows (list + detail).
 * The workspace must answer "who created / who is responsible for this event"
 * without shipping account internals to the client and without a per-row detail
 * fetch; resolution stays server-side and same-parish, so a person organizer
 * without an account also shows a name. Ids are chunked (a page may hold up to
 * 500 events → up to two account ids per row) to stay inside the SQLite
 * bind-variable limit, mirroring the /tasks list reader.
 */
async function loadOperationsDisplayNames(parishId: string, input: { userIds?: Array<string | null | undefined>; personIds?: Array<string | null | undefined> }) {
  const chunkIds = (values: Array<string | null | undefined>) => {
    const unique = [...new Set(values.filter((value): value is string => Boolean(value)))]
    const chunks: string[][] = []
    for (let index = 0; index < unique.length; index += 400) chunks.push(unique.slice(index, index + 400))
    return chunks
  }
  const [accountRows, personRows] = await Promise.all([
    Promise.all(chunkIds(input.userIds ?? []).map(ids => db.select({ id: users.id, fullName: users.fullName }).from(users)
      .where(and(eq(users.parishId, parishId), inArray(users.id, ids))))),
    Promise.all(chunkIds(input.personIds ?? []).map(ids => db.select({ id: parishPeople.id, fullName: parishPeople.fullName }).from(parishPeople)
      .where(and(eq(parishPeople.parishId, parishId), inArray(parishPeople.id, ids))))),
  ])
  return {
    accountNameById: new Map(accountRows.flat().map(row => [row.id, row.fullName])),
    personNameById: new Map(personRows.flat().map(row => [row.id, row.fullName])),
  }
}


/**
 * Shared creator≠organizer resolution for event creation paths (POST /events,
 * template instantiate). Returns the organizer to persist; throws 400/403 for
 * business actors when the organizer rule is violated. ADMIN keeps a
 * compatibility path (O2) and skips business validation.
 */
async function resolveEventOrganizerForCreate(
  tx: DbTransaction,
  actor: { userId: string; role: string; parishId: string },
  input: { scopeType: 'XU_DOAN' | 'UNIT'; scopeUnitId: string | null; organizerUserId?: string | null; organizerPersonId?: string | null },
): Promise<{ organizerUserId: string | null; organizerPersonId: string | null }> {
  const isAdmin = actor.role === 'admin'
  let organizerUserId = input.organizerUserId ?? null
  let organizerPersonId = input.organizerPersonId ?? null
  if (input.scopeType === 'XU_DOAN') {
    if (!organizerUserId && !organizerPersonId) {
      const autoLeader = await findActiveParishLeaderUserId(tx, actor.parishId)
      if (autoLeader) {
        organizerUserId = autoLeader
      } else if (!isAdmin) {
        throw Object.assign(new Error('Sự kiện Xứ đoàn bắt buộc có Xứ đoàn trưởng làm Organizer (không tìm thấy đúng 1 Xứ đoàn trưởng active).'), { status: 400, code: 'ORGANIZER_REQUIRED' })
      }
    } else if (!isAdmin) {
      const isLeader = await isActiveParishLeader(tx, actor.parishId, organizerUserId, organizerPersonId)
      if (!isLeader) throw Object.assign(new Error('Organizer sự kiện Xứ đoàn phải là Xứ đoàn trưởng đang đương nhiệm.'), { status: 400, code: 'ORGANIZER_MUST_BE_PARISH_LEADER' })
    }
  } else {
    // Trưởng Xứ đoàn bypass kiểm tra scope (blanket) nhưng tạo event chuyên môn
    // vẫn phải chỉ định Trưởng unit làm organizer — tự đứng tên bị
    // ORGANIZER_MUST_BE_UNIT_LEADER ở bước validate bên dưới.
    if (!isAdmin) {
      const positions = await getActorActivePositions(tx, actor.parishId, actor.userId)
      const isParishLeader = positions.some(p => p.positionCode === 'PARISH_LEADER')
      if (!isParishLeader) {
        const ownUnitIds = positions.map(p => p.unitId).filter((v): v is string => Boolean(v))
        if (!input.scopeUnitId || !ownUnitIds.includes(input.scopeUnitId)) {
          throw Object.assign(new Error('Sự kiện chuyên môn phải thuộc đúng Ban/Ngành của người tạo.'), { status: 403, code: 'UNIT_SCOPE_MISMATCH' })
        }
      }
    }
    if (!organizerUserId && !organizerPersonId && !isAdmin) {
      const positions = await getActorActivePositions(tx, actor.parishId, actor.userId)
      const leaderTerm = positions.find(p => p.positionCode === 'BRANCH_LEADER' || p.positionCode === 'COMMITTEE_LEADER')
      const parishLeaderTerm = positions.find(p => p.positionCode === 'PARISH_LEADER')
      if (leaderTerm || parishLeaderTerm) {
        organizerUserId = actor.userId
      } else {
        throw Object.assign(new Error('Phó Ban/Phó Ngành tạo sự kiện phải chỉ định Trưởng Ban/Trưởng Ngành làm Organizer.'), { status: 400, code: 'ORGANIZER_REQUIRED' })
      }
    }
    if (!isAdmin && (organizerUserId || organizerPersonId)) {
      const isUnitLeader = await isActiveUnitLeader(tx, actor.parishId, input.scopeUnitId!, organizerUserId, organizerPersonId)
      if (!isUnitLeader) throw Object.assign(new Error('Organizer sự kiện chuyên môn phải là Trưởng Ban/Trưởng Ngành đương nhiệm đúng đơn vị phụ trách.'), { status: 400, code: 'ORGANIZER_MUST_BE_UNIT_LEADER' })
    }
  }
  return { organizerUserId, organizerPersonId }
}

/** Field Lead phải là Trưởng Ban/Ngành đang đương nhiệm của đúng đơn vị phụ trách Field.
 * standalone workstream (không sourceUnitId) và unit đã xóa giữ đường tương thích cũ;
 * callers quyết định có bypass cho admin kỹ thuật hay không (member-add và lead-replace
 * hiện đều bypass, theo triết lý O2 — xem route gọi hàm này). */
async function assertWorkstreamLeadEligibility(tx: DbTransaction, parishId: string, sourceUnitId: string | null, target: { userId?: string | null; personId?: string | null }): Promise<void> {
  if (!sourceUnitId) return
  const [unit] = await tx.select({ unitType: parishOrganizationUnits.unitType }).from(parishOrganizationUnits)
    .where(and(eq(parishOrganizationUnits.parishId, parishId), eq(parishOrganizationUnits.id, sourceUnitId), isNull(parishOrganizationUnits.deletedAt))).limit(1)
  if (!unit) return
  const wantedCode = unit.unitType === 'BRANCH' ? 'BRANCH_LEADER' : unit.unitType === 'COMMITTEE' ? 'COMMITTEE_LEADER' : null
  if (!wantedCode) return
  const today = parishCalendarDate()
  const personFilter = target.personId
    ? eq(parishPeople.id, target.personId)
    : eq(parishPeople.linkedUserId, target.userId!)
  const rows = await tx.select({ positionCode: parishServiceTerms.positionCode, unitId: parishServiceTerms.unitId })
    .from(parishServiceTerms)
    .innerJoin(parishPeople, and(eq(parishPeople.parishId, parishServiceTerms.parishId), eq(parishPeople.id, parishServiceTerms.personId)))
    .where(and(
      eq(parishServiceTerms.parishId, parishId),
      isNull(parishServiceTerms.deletedAt),
      lte(parishServiceTerms.startDate, today),
      or(isNull(parishServiceTerms.endDate), gte(parishServiceTerms.endDate, today)),
      eq(parishPeople.serviceStatus, 'ACTIVE'),
      isNull(parishPeople.deletedAt),
      personFilter,
    ))
  const isUnitLeader = rows.some(row => row.positionCode === wantedCode && row.unitId === sourceUnitId)
  if (!isUnitLeader) {
    throw Object.assign(new Error('Trưởng Field phải là Trưởng Ban/Trưởng Ngành đang đương nhiệm của đúng đơn vị phụ trách.'), { status: 403, code: 'WORKSTREAM_LEAD_OUTSIDE_UNIT' })
  }
}

async function buildOperationTemplateSnapshot(tx: DbTransaction, parishId: string, event: typeof operationEvents.$inferSelect): Promise<OperationTemplateSnapshot> {
  const tasks = await tx.select({
    id: operationTasks.id,
    title: operationTasks.title,
    description: operationTasks.description,
    phase: operationTasks.phase,
    priority: operationTasks.priority,
    isRequired: operationTasks.isRequired,
    dueAt: operationTasks.dueAt,
    scheduledStartAt: operationTasks.scheduledStartAt,
    scheduledEndAt: operationTasks.scheduledEndAt,
    createdAt: operationTasks.createdAt,
  }).from(operationTasks).where(and(
    eq(operationTasks.parishId, parishId), eq(operationTasks.operationEventId, event.id),
    isNull(operationTasks.deletedAt), notInArray(operationTasks.status, ['CANCELLED']),
  )).orderBy(asc(operationTasks.createdAt), asc(operationTasks.id))
  const taskIds = tasks.map(task => task.id)
  const checklist = taskIds.length === 0 ? [] : await tx.select({
    taskId: operationChecklistItems.taskId,
    label: operationChecklistItems.label,
    isRequired: operationChecklistItems.isRequired,
    sortOrder: operationChecklistItems.sortOrder,
  }).from(operationChecklistItems).where(and(
    eq(operationChecklistItems.parishId, parishId), inArray(operationChecklistItems.taskId, taskIds),
  )).orderBy(asc(operationChecklistItems.taskId), asc(operationChecklistItems.sortOrder), asc(operationChecklistItems.id))
  const checklistByTask = new Map<string, Array<{ label: string; isRequired: boolean; sortOrder: number }>>()
  for (const item of checklist) checklistByTask.set(item.taskId, [...(checklistByTask.get(item.taskId) ?? []), { label: item.label, isRequired: item.isRequired, sortOrder: item.sortOrder }])
  return templateSnapshotSchema.parse({
    event: {
      title: event.title,
      description: event.description,
      eventType: event.eventType,
      durationMinutes: Math.max(1, Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60_000)),
      location: event.location,
      expectedHeadcount: event.expectedHeadcount,
    },
    tasks: tasks.map(task => ({
      title: task.title,
      description: task.description,
      phase: task.phase,
      priority: task.priority,
      isRequired: task.isRequired,
      dueOffsetMinutes: task.dueAt ? Math.round((Date.parse(task.dueAt) - Date.parse(event.startsAt)) / 60_000) : null,
      scheduledStartOffsetMinutes: task.scheduledStartAt ? Math.round((Date.parse(task.scheduledStartAt) - Date.parse(event.startsAt)) / 60_000) : null,
      scheduledEndOffsetMinutes: task.scheduledEndAt ? Math.round((Date.parse(task.scheduledEndAt) - Date.parse(event.startsAt)) / 60_000) : null,
      checklist: checklistByTask.get(task.id) ?? [],
    })),
  })
}

function parseOperationTemplateSnapshot(raw: string): OperationTemplateSnapshot {
  try { return templateSnapshotSchema.parse(JSON.parse(raw)) } catch {
    throw Object.assign(new Error('Snapshot mẫu sự kiện không hợp lệ; không thể xem trước hoặc khởi tạo.'), { status: 409, code: 'TEMPLATE_SNAPSHOT_INVALID' })
  }
}

function previewOperationTemplate(snapshot: OperationTemplateSnapshot, startsAt: string) {
  const startMs = Date.parse(startsAt)
  const endsAt = new Date(startMs + snapshot.event.durationMinutes * 60_000).toISOString()
  return {
    event: { ...snapshot.event, startsAt, endsAt },
    tasks: snapshot.tasks.map((task, index) => ({
      index,
      ...task,
      dueAt: task.dueOffsetMinutes === null ? null : new Date(startMs + task.dueOffsetMinutes * 60_000).toISOString(),
      scheduledStartAt: task.scheduledStartOffsetMinutes === null ? null : new Date(startMs + task.scheduledStartOffsetMinutes * 60_000).toISOString(),
      scheduledEndAt: task.scheduledEndOffsetMinutes === null ? null : new Date(startMs + task.scheduledEndOffsetMinutes * 60_000).toISOString(),
    })),
  }
}
type OperationsTarget = { userId: string | null; personId: string | null }
async function actionableOperationsTargets(tx: DbTransaction, parishId: string, targets: OperationsTarget[]): Promise<Set<string>> {
  const directUserIds = [...new Set(targets.flatMap(target => target.userId ? [target.userId] : []))]
  const personIds = [...new Set(targets.flatMap(target => target.personId ? [target.personId] : []))]
  const people = personIds.length === 0 ? [] : await tx.select({ id: parishPeople.id, linkedUserId: parishPeople.linkedUserId }).from(parishPeople).where(and(
    eq(parishPeople.parishId, parishId),
    inArray(parishPeople.id, personIds),
    eq(parishPeople.serviceStatus, 'ACTIVE'),
    isNull(parishPeople.deletedAt),
  ))
  const candidateUserIds = [...new Set([...directUserIds, ...people.flatMap(person => person.linkedUserId ? [person.linkedUserId] : [])])]
  const activeUsers = candidateUserIds.length === 0 ? [] : await tx.select({ id: users.id }).from(users).where(and(
    eq(users.parishId, parishId),
    inArray(users.id, candidateUserIds),
    inArray(users.role, ['admin', 'chunhiem', 'phuta']),
    eq(users.status, 'ACTIVE'),
    isNull(users.deletedAt),
  ))
  const activeUserIds = new Set(activeUsers.map(user => user.id))
  const actionable = new Set<string>()
  for (const userId of directUserIds) if (activeUserIds.has(userId)) actionable.add(`user:${userId}`)
  for (const person of people) if (person.linkedUserId && activeUserIds.has(person.linkedUserId)) actionable.add(`person:${person.id}`)
  return actionable
}
function targetKey(target: OperationsTarget): string {
  return target.userId ? `user:${target.userId}` : `person:${target.personId}`
}
async function canonicalOperationsUserId(tx: DbTransaction, parishId: string, target: OperationsTarget): Promise<string | null> {
  if (target.userId) return target.userId
  if (!target.personId) return null
  const [person] = await tx.select({ linkedUserId: parishPeople.linkedUserId }).from(parishPeople).where(and(
    eq(parishPeople.parishId, parishId), eq(parishPeople.id, target.personId), isNull(parishPeople.deletedAt),
  )).limit(1)
  return person?.linkedUserId ?? null
}
async function assertActionableOperationsTarget(tx: DbTransaction, parishId: string, target: OperationsTarget, message = 'Trưởng nhóm mới phải có tài khoản Operations đang hoạt động.') {
  const actionable = await actionableOperationsTargets(tx, parishId, [target])
  if (!actionable.has(targetKey(target))) {
    throw Object.assign(new Error(message), { status: 400, code: 'INVALID_OPERATIONS_TARGET' })
  }
}
async function assignmentConflictWarnings(tx: DbTransaction, parishId: string, target: OperationsTarget, schedule: { dueAt: string | null; scheduledStartAt: string | null; scheduledEndAt: string | null }) {
  if (!schedule.dueAt && (!schedule.scheduledStartAt || !schedule.scheduledEndAt)) return []
  const linkedPeople = await tx.select({ id: parishPeople.id, linkedUserId: parishPeople.linkedUserId }).from(parishPeople).where(and(
    eq(parishPeople.parishId, parishId), isNull(parishPeople.deletedAt),
    target.personId ? eq(parishPeople.id, target.personId) : eq(parishPeople.linkedUserId, target.userId!),
  ))
  const targetUserId = target.userId ?? linkedPeople[0]?.linkedUserId
  const targetPersonIds = linkedPeople.map(person => person.id)
  if (!targetUserId && targetPersonIds.length === 0) return []
  const timePredicate = schedule.scheduledStartAt && schedule.scheduledEndAt
    ? and(lt(operationBlockouts.startsAt, schedule.scheduledEndAt), gt(operationBlockouts.endsAt, schedule.scheduledStartAt))
    : and(lte(operationBlockouts.startsAt, schedule.dueAt!), gt(operationBlockouts.endsAt, schedule.dueAt!))
  return tx.select({ id: operationBlockouts.id, startsAt: operationBlockouts.startsAt, endsAt: operationBlockouts.endsAt }).from(operationBlockouts).where(and(
    eq(operationBlockouts.parishId, parishId),
    or(targetUserId ? eq(operationBlockouts.userId, targetUserId) : undefined, targetPersonIds.length ? inArray(operationBlockouts.personId, targetPersonIds) : undefined),
    isNull(operationBlockouts.deletedAt), timePredicate,
  ))
}
async function readiness(tx: DbTransaction, parishId: string, eventId: string) {
  const workstreams = await tx.select({ id: operationWorkstreams.id, name: operationWorkstreams.name, status: operationWorkstreams.status, isRequired: operationWorkstreams.isRequired }).from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, parishId), eq(operationWorkstreams.operationEventId, eventId), isNull(operationWorkstreams.deletedAt)))
  const tasks = await tx.select({ id: operationTasks.id, title: operationTasks.title, phase: operationTasks.phase, status: operationTasks.status, isRequired: operationTasks.isRequired, dueAt: operationTasks.dueAt }).from(operationTasks).where(and(eq(operationTasks.parishId, parishId), eq(operationTasks.operationEventId, eventId), isNull(operationTasks.deletedAt)))
  const blockers: Array<{ type: string; id: string; label: string }> = []
  const now = new Date().toISOString()
  const requiredWorkstreams = workstreams.filter(item => item.isRequired)
  const requiredTasks = tasks.filter(item => item.isRequired)
  const requiredWorkstreamIds = requiredWorkstreams.map(item => item.id)
  const requiredTaskIds = requiredTasks.map(item => item.id)
  const [leadRows, ownerRows, dependencyRows, incompleteRows] = await Promise.all([
    requiredWorkstreamIds.length === 0 ? Promise.resolve([]) : tx.select({ workstreamId: operationWorkstreamMembers.workstreamId, userId: operationWorkstreamMembers.userId, personId: operationWorkstreamMembers.personId }).from(operationWorkstreamMembers).where(and(
      eq(operationWorkstreamMembers.parishId, parishId),
      inArray(operationWorkstreamMembers.workstreamId, requiredWorkstreamIds),
      eq(operationWorkstreamMembers.operationRole, 'WORKSTREAM_LEAD'),
      isNull(operationWorkstreamMembers.removedAt),
      or(isNull(operationWorkstreamMembers.startsAt), lte(operationWorkstreamMembers.startsAt, now)),
      or(isNull(operationWorkstreamMembers.endsAt), gte(operationWorkstreamMembers.endsAt, now)),
    )),
    requiredTaskIds.length === 0 ? Promise.resolve([]) : tx.select({ taskId: operationTaskAssignees.taskId, userId: operationTaskAssignees.userId, personId: operationTaskAssignees.personId }).from(operationTaskAssignees).where(and(
      eq(operationTaskAssignees.parishId, parishId),
      inArray(operationTaskAssignees.taskId, requiredTaskIds),
      eq(operationTaskAssignees.assignmentRole, 'OWNER'),
      eq(operationTaskAssignees.acknowledgementStatus, 'ACCEPTED'),
      isNull(operationTaskAssignees.removedAt),
    )),
    requiredTaskIds.length === 0 ? Promise.resolve([]) : tx.select({ taskId: operationTaskDependencies.taskId, status: operationTasks.status }).from(operationTaskDependencies)
      .innerJoin(operationTasks, and(eq(operationTasks.parishId, operationTaskDependencies.parishId), eq(operationTasks.id, operationTaskDependencies.dependsOnTaskId)))
      .where(and(eq(operationTaskDependencies.parishId, parishId), inArray(operationTaskDependencies.taskId, requiredTaskIds))),
    requiredTaskIds.length === 0 ? Promise.resolve([]) : tx.select({ taskId: operationChecklistItems.taskId, id: operationChecklistItems.id, label: operationChecklistItems.label }).from(operationChecklistItems).where(and(
      eq(operationChecklistItems.parishId, parishId),
      inArray(operationChecklistItems.taskId, requiredTaskIds),
      eq(operationChecklistItems.isRequired, true),
      eq(operationChecklistItems.isDone, false),
    )),
  ])
  const actionableTargets = await actionableOperationsTargets(tx, parishId, [...leadRows, ...ownerRows])
  const leadWorkstreamIds = new Set(leadRows.filter(row => actionableTargets.has(targetKey(row))).map(row => row.workstreamId))
  const ownerTaskIds = new Set(ownerRows.filter(row => actionableTargets.has(targetKey(row))).map(row => row.taskId))
  const blockedDependencyTaskIds = new Set(dependencyRows.filter(row => row.status !== 'DONE' && row.status !== 'CANCELLED').map(row => row.taskId))
  const incompleteByTask = new Map<string, Array<{ id: string; label: string }>>()
  for (const item of incompleteRows) incompleteByTask.set(item.taskId, [...(incompleteByTask.get(item.taskId) ?? []), item])

  for (const item of requiredWorkstreams) {
    if (item.status !== 'READY') blockers.push({ type: 'WORKSTREAM_NOT_READY', id: item.id, label: item.name })
    if (!leadWorkstreamIds.has(item.id)) blockers.push({ type: 'WORKSTREAM_LEAD_MISSING', id: item.id, label: item.name })
  }
  for (const task of requiredTasks.filter(item => item.phase === 'PREPARATION' && item.status !== 'DONE')) blockers.push({ type: 'TASK_NOT_DONE', id: task.id, label: task.title })
  for (const task of requiredTasks) {
    if (!ownerTaskIds.has(task.id)) blockers.push({ type: 'TASK_OWNER_MISSING', id: task.id, label: task.title })
    if (task.phase !== 'PREPARATION') {
      if (task.status === 'BLOCKED' || task.status === 'CANCELLED') blockers.push({ type: 'TASK_NOT_READY', id: task.id, label: task.title })
      continue
    }
    if (task.dueAt && task.dueAt < now && task.status !== 'DONE' && task.status !== 'CANCELLED') blockers.push({ type: 'TASK_OVERDUE', id: task.id, label: task.title })
    if (blockedDependencyTaskIds.has(task.id)) blockers.push({ type: 'TASK_DEPENDENCY_BLOCKED', id: task.id, label: task.title })
    blockers.push(...(incompleteByTask.get(task.id) ?? []).map(item => ({ type: 'CHECKLIST_NOT_DONE', id: item.id, label: item.label })))
  }
  const required = requiredWorkstreams.length + requiredTasks.filter(item => item.phase === 'PREPARATION').length
  const done = requiredWorkstreams.filter(item => item.status === 'READY').length + requiredTasks.filter(item => item.phase === 'PREPARATION' && item.status === 'DONE').length
  return { percent: required === 0 ? 100 : Math.round((done / required) * 100), blockers }
}

async function closureReadiness(tx: DbTransaction, parishId: string, eventId: string) {
  const requiredTasks = await tx.select({ id: operationTasks.id, title: operationTasks.title, status: operationTasks.status })
      .from(operationTasks)
      .where(and(
        eq(operationTasks.parishId, parishId),
        eq(operationTasks.operationEventId, eventId),
        eq(operationTasks.isRequired, true),
        isNull(operationTasks.deletedAt),
      ))
  const blockers = requiredTasks
    .filter(task => task.status !== 'DONE')
    .map(task => ({ type: 'TASK_INCOMPLETE', id: task.id, label: task.title }))
  return { blockers }
}

async function preparationAcknowledgementState(tx: DbTransaction, parishId: string, eventId: string) {
  const tasks = await tx.select({ id: operationTasks.id, title: operationTasks.title, status: operationTasks.status })
    .from(operationTasks)
    .where(and(eq(operationTasks.parishId, parishId), eq(operationTasks.operationEventId, eventId), isNull(operationTasks.deletedAt)))
  const activeTasks = tasks.filter(task => task.status !== 'CANCELLED')
  if (activeTasks.length === 0) return { eligible: false, pendingTaskIds: [] as string[], blockers: [] as Array<{ type: string; id: string; label: string }> }
  const taskIds = activeTasks.map(task => task.id)
  const assignments = await tx.select({
    taskId: operationTaskAssignees.taskId,
    userId: operationTaskAssignees.userId,
    personId: operationTaskAssignees.personId,
    role: operationTaskAssignees.assignmentRole,
    acknowledgementStatus: operationTaskAssignees.acknowledgementStatus,
  }).from(operationTaskAssignees).where(and(
    eq(operationTaskAssignees.parishId, parishId),
    inArray(operationTaskAssignees.taskId, taskIds),
    inArray(operationTaskAssignees.assignmentRole, ['OWNER', 'CONTRIBUTOR']),
    isNull(operationTaskAssignees.removedAt),
  ))
  const actionable = await actionableOperationsTargets(tx, parishId, assignments.map(row => ({ userId: row.userId, personId: row.personId })))
  const state = preparationAcceptanceReadiness(activeTasks.map(task => {
    const performers = assignments.filter(row => row.taskId === task.id)
    return {
      id: task.id,
      cancelled: false,
      hasOwner: performers.some(row => row.role === 'OWNER'),
      performers: performers.map(row => ({ valid: actionable.has(targetKey(row)), accepted: row.acknowledgementStatus === 'ACCEPTED' })),
    }
  }))
  return {
    ...state,
    blockers: state.pendingTaskIds.map(id => ({ type: 'TASK_ACCEPTANCE_PENDING', id, label: activeTasks.find(task => task.id === id)?.title ?? id })),
  }
}

operationsRouter.get('/permissions', async c => {
  const user = actor(c)
  const scope = { parishId: user.parishId, resourceUnitId: c.req.query('unitId') || null, eventId: c.req.query('eventId') || null, workstreamId: c.req.query('workstreamId') || null, taskId: c.req.query('taskId') || null }
  // W2.11: the caller's parish IANA zone travels with the permission map so
  // Operations forms default to "giờ xứ đoàn" instead of the browser zone.
  return successResponse(c, { parishId: user.parishId, timezone: getParishTimeZone(), permissions: await getOperationsCallerPermissions(user, scope) })
})

operationsRouter.get('/units', async c => {
  const user = actor(c)
  try {
    const { page, limit, offset } = listPagination(c)
    const rows = await db.select({
      id: parishOrganizationUnits.id,
      parishId: parishOrganizationUnits.parishId,
      parentId: parishOrganizationUnits.parentId,
      name: parishOrganizationUnits.name,
      unitType: parishOrganizationUnits.unitType,
    }).from(parishOrganizationUnits).where(and(
      eq(parishOrganizationUnits.parishId, user.parishId), eq(parishOrganizationUnits.isActive, true), isNull(parishOrganizationUnits.deletedAt),
    )).orderBy(parishOrganizationUnits.sortOrder, parishOrganizationUnits.name)
    const decisions = await resolveOperationsAuthorizationBatch(user, 'operations.workstream.create', rows.map(row => ({
      parishId: row.parishId,
      resourceUnitId: row.id,
    })))
    const visible = rows.filter((_, index) => decisions[index]?.allowed)
    return paginatedResponse(c, visible.slice(offset, offset + limit), { page, limit, total: visible.length })
  } catch (error) { return handleError(c, error) }
})

/**
 * Business creation options for the "+ Tạo mới" menu (XV).
 * Server-authoritative: the menu shows only actions the caller can actually
 * perform; the mutation routes re-check everything. Position codes stay in
 * English here — the UI maps them to Vietnamese labels (O8).
 */
operationsRouter.get('/creation-options', async c => {
  const user = actor(c)
  try {
    const today = parishCalendarDate()
    const isAdmin = user.role === 'admin'
    const [person] = await db.select({ id: parishPeople.id }).from(parishPeople)
      .where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1)
    const myTerms = person ? await db.select({ positionCode: parishServiceTerms.positionCode, unitId: parishServiceTerms.unitId })
      .from(parishServiceTerms)
      .where(and(
        eq(parishServiceTerms.parishId, user.parishId), eq(parishServiceTerms.personId, person.id),
        isNull(parishServiceTerms.deletedAt),
        lte(parishServiceTerms.startDate, today), or(isNull(parishServiceTerms.endDate), gte(parishServiceTerms.endDate, today)),
      )) : []
    const units = await db.select({ id: parishOrganizationUnits.id, name: parishOrganizationUnits.name, unitType: parishOrganizationUnits.unitType })
      .from(parishOrganizationUnits)
      .where(and(eq(parishOrganizationUnits.parishId, user.parishId), eq(parishOrganizationUnits.isActive, true), isNull(parishOrganizationUnits.deletedAt)))
      .orderBy(parishOrganizationUnits.sortOrder, parishOrganizationUnits.name)
    const unitsById = new Map(units.map(unit => [unit.id, unit]))
    const isBoardUnit = (unitId: string | null) => !unitId || unitsById.get(unitId)?.unitType === 'BOARD'
    const myCodes = new Set(myTerms.map(term => term.positionCode))
    const myUnitIds = new Set(myTerms.map(term => term.unitId).filter((value): value is string => Boolean(value)))
    const isParishLeader = myTerms.some(term => term.positionCode === 'PARISH_LEADER' && isBoardUnit(term.unitId))
    const isParishOffice = isParishLeader || myTerms.some(term => (term.positionCode === 'PARISH_SECRETARY' || term.positionCode === 'PARISH_DEPUTY') && isBoardUnit(term.unitId))
    const canCreateXuDoanEvent = isAdmin || isParishOffice
    // Khóa: Trưởng/Phó/Thư ký chỉ tạo Event Xứ đoàn, không tạo Event chuyên môn.
    // Trưởng Xứ đoàn giữ thêm task độc lập (standalone) ở mọi Ban/Ngành qua
    // menu unit bên dưới; Phó/Thư ký không có task độc lập.
    const canCreateUnitEventBlanket = isAdmin
    const canCreateStandaloneTaskBlanket = isAdmin || isParishLeader
    // Active leaders with actionable staff accounts, for organizer pickers.
    const leaderTerms = await db.select({
      positionCode: parishServiceTerms.positionCode, unitId: parishServiceTerms.unitId,
      fullName: parishPeople.fullName, linkedUserId: parishPeople.linkedUserId,
    }).from(parishServiceTerms)
      .innerJoin(parishPeople, and(eq(parishPeople.parishId, parishServiceTerms.parishId), eq(parishPeople.id, parishServiceTerms.personId)))
      .innerJoin(users, and(eq(users.parishId, parishPeople.parishId), eq(users.id, parishPeople.linkedUserId)))
      .where(and(
        eq(parishServiceTerms.parishId, user.parishId),
        inArray(parishServiceTerms.positionCode, ['PARISH_LEADER', 'BRANCH_LEADER', 'COMMITTEE_LEADER']),
        isNull(parishServiceTerms.deletedAt),
        lte(parishServiceTerms.startDate, today), or(isNull(parishServiceTerms.endDate), gte(parishServiceTerms.endDate, today)),
        eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt),
        inArray(users.role, ['admin', 'chunhiem', 'phuta']), eq(users.status, 'ACTIVE'), isNull(users.deletedAt),
      ))
    const xuDoanOrganizers = leaderTerms
      .filter(term => term.positionCode === 'PARISH_LEADER')
      .map(term => ({ userId: term.linkedUserId!, displayName: term.fullName, positionCode: term.positionCode! }))
    const unitOptions = units
      .filter(unit => unit.unitType === 'BRANCH' || unit.unitType === 'COMMITTEE')
      .map(unit => {
        const wanted = unit.unitType === 'BRANCH' ? 'BRANCH_LEADER' : 'COMMITTEE_LEADER'
        const organizers = leaderTerms
          .filter(term => term.positionCode === wanted && term.unitId === unit.id)
          .map(term => ({ userId: term.linkedUserId!, displayName: term.fullName, positionCode: term.positionCode! }))
        const holdsUnitRole = myUnitIds.has(unit.id) && (
          myCodes.has(wanted)
          || myCodes.has(unit.unitType === 'BRANCH' ? 'BRANCH_DEPUTY' : 'COMMITTEE_DEPUTY')
        )
        const canCreateEvent = canCreateUnitEventBlanket || holdsUnitRole
        const canCreateTask = canCreateStandaloneTaskBlanket || holdsUnitRole
        return {
          id: unit.id, name: unit.name, unitType: unit.unitType,
          canCreateEvent, canCreateTask, organizers,
          myRole: holdsUnitRole
            ? (myCodes.has(wanted) ? wanted : (unit.unitType === 'BRANCH' ? 'BRANCH_DEPUTY' : 'COMMITTEE_DEPUTY'))
            : null,
        }
      })
      .filter(option => option.canCreateEvent || option.canCreateTask)
    return successResponse(c, { canCreateXuDoanEvent, xuDoanOrganizers, units: unitOptions })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/templates', zValidator('query', templateListQuerySchema), async c => {
  const user = actor(c); const archived = c.req.valid('query').archived === 'true'
  try {
    const { page, limit, offset } = listPagination(c)
    const rows = await db.select().from(operationEventTemplates).where(and(
      eq(operationEventTemplates.parishId, user.parishId), eq(operationEventTemplates.isActive, !archived),
    )).orderBy(desc(operationEventTemplates.updatedAt), asc(operationEventTemplates.name))
    const decisions = await resolveOperationsAuthorizationBatch(user, 'operations.event.create', rows.map(row => ({
      parishId: row.parishId,
      resourceUnitId: row.scopeUnitId,
    })))
    const visible = rows.filter((_, index) => decisions[index]?.allowed)
    return paginatedResponse(c, visible.slice(offset, offset + limit), { page, limit, total: visible.length })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/templates/:id/preview', zValidator('query', templatePreviewQuerySchema), async c => {
  const user = actor(c); const templateId = c.req.param('id'); const query = c.req.valid('query')
  try {
    const result = await db.transaction(async tx => {
      const [template] = await tx.select().from(operationEventTemplates).where(and(
        eq(operationEventTemplates.parishId, user.parishId), eq(operationEventTemplates.id, templateId), eq(operationEventTemplates.isActive, true),
      )).limit(1)
      if (!template) throw Object.assign(new Error('Không tìm thấy mẫu sự kiện.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: template.scopeUnitId }, tx)
      const version = query.version ?? template.latestVersion
      const [snapshotRow] = await tx.select().from(operationEventTemplateVersions).where(and(
        eq(operationEventTemplateVersions.parishId, user.parishId), eq(operationEventTemplateVersions.templateId, templateId), eq(operationEventTemplateVersions.version, version),
      )).limit(1)
      if (!snapshotRow) throw Object.assign(new Error('Không tìm thấy phiên bản mẫu sự kiện.'), { status: 404 })
      return { template, version, preview: previewOperationTemplate(parseOperationTemplateSnapshot(snapshotRow.snapshotJson), query.startsAt) }
    })
    return successResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/events/:id/templates', zValidator('json', templateCreateSchema), async c => {
  const user = actor(c); const eventId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.template.create_from_event', { eventId, ...body }, async tx => {
      const [event] = await tx.select().from(operationEvents).where(and(
        eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt),
      )).limit(1)
      if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
      if (event.version !== body.eventVersion) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      // V3 hardening: scope by eventId so the DRAFT creator-only gate inside
      // decideOperationsAuthorization applies to the snapshot source. A
      // same-scope position alone must not snapshot another creator's DRAFT.
      await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, eventId, resourceUnitId: event.scopeUnitId }, tx)
      const snapshot = await buildOperationTemplateSnapshot(tx, user.parishId, event)
      const now = new Date().toISOString()
      const template = {
        id: generateId('OPT'), parishId: user.parishId, scopeUnitId: event.scopeUnitId,
        name: body.name, description: body.description ?? null, latestVersion: 1, version: 1, isActive: true,
        createdBy: user.userId, updatedBy: user.userId, createdAt: now, updatedAt: now,
      }
      const version = { parishId: user.parishId, templateId: template.id, version: 1, sourceEventId: event.id, snapshotJson: JSON.stringify(snapshot), createdBy: user.userId, createdAt: now }
      await tx.insert(operationEventTemplates).values(template)
      await tx.insert(operationEventTemplateVersions).values(version)
      await audit(tx, user, c, 'CREATE', 'operation_event_template', template.id, undefined, { version: 1, sourceEventId: event.id, scopeUnitId: event.scopeUnitId, taskCount: snapshot.tasks.length, checklistCount: snapshot.tasks.reduce((total, task) => total + task.checklist.length, 0) })
      return template
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/templates/:id/versions', zValidator('json', templateVersionCreateSchema), async c => {
  const user = actor(c); const templateId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.template.version.create', { templateId, ...body }, async tx => {
      const [template] = await tx.select().from(operationEventTemplates).where(and(
        eq(operationEventTemplates.parishId, user.parishId), eq(operationEventTemplates.id, templateId), eq(operationEventTemplates.isActive, true),
      )).limit(1)
      if (!template) throw Object.assign(new Error('Không tìm thấy mẫu sự kiện.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: template.scopeUnitId }, tx)
      if (template.version !== body.expectedVersion) throw new VersionConflictError('Mẫu sự kiện đã bị thay đổi bởi người khác.', template)
      if (template.latestVersion !== body.expectedLatestVersion) throw new VersionConflictError('Mẫu sự kiện đã có phiên bản mới hơn.', template)
      const [sourceEvent] = await tx.select().from(operationEvents).where(and(
        eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, body.sourceEventId), isNull(operationEvents.deletedAt),
      )).limit(1)
      if (!sourceEvent) throw Object.assign(new Error('Không tìm thấy operation event nguồn.'), { status: 404 })
      if (sourceEvent.version !== body.sourceEventVersion) throw new VersionConflictError('Operation event nguồn đã bị thay đổi bởi người khác.', sourceEvent)
      if (sourceEvent.scopeUnitId !== template.scopeUnitId) throw Object.assign(new Error('Event nguồn phải có cùng phạm vi tổ chức với mẫu.'), { status: 409, code: 'TEMPLATE_SCOPE_MISMATCH' })
      // V3 hardening: same DRAFT gate for the version source event.
      await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, eventId: body.sourceEventId, resourceUnitId: sourceEvent.scopeUnitId }, tx)
      const snapshot = await buildOperationTemplateSnapshot(tx, user.parishId, sourceEvent)
      const now = new Date().toISOString(); const nextVersion = template.latestVersion + 1
      await tx.insert(operationEventTemplateVersions).values({ parishId: user.parishId, templateId, version: nextVersion, sourceEventId: sourceEvent.id, snapshotJson: JSON.stringify(snapshot), createdBy: user.userId, createdAt: now })
      const [changed] = await tx.update(operationEventTemplates).set({ latestVersion: nextVersion, version: template.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(
        eq(operationEventTemplates.parishId, user.parishId), eq(operationEventTemplates.id, templateId), eq(operationEventTemplates.version, body.expectedVersion), eq(operationEventTemplates.latestVersion, body.expectedLatestVersion), eq(operationEventTemplates.isActive, true),
      )).returning()
      if (!changed) throw new VersionConflictError('Mẫu sự kiện đã có phiên bản mới hơn.', template)
      await audit(tx, user, c, 'CREATE_VERSION', 'operation_event_template', templateId, { contentVersion: template.latestVersion, familyVersion: template.version }, { contentVersion: nextVersion, familyVersion: changed.version, sourceEventId: sourceEvent.id, reason: body.reason, taskCount: snapshot.tasks.length, checklistCount: snapshot.tasks.reduce((total, task) => total + task.checklist.length, 0) })
      return changed
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/templates/:id/archive', zValidator('json', templateStatusChangeSchema), async c => {
  const user = actor(c); const templateId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.template.archive', { templateId, ...body }, async tx => {
      const [template] = await tx.select().from(operationEventTemplates).where(and(
        eq(operationEventTemplates.parishId, user.parishId), eq(operationEventTemplates.id, templateId),
      )).limit(1)
      if (!template) throw Object.assign(new Error('Không tìm thấy mẫu sự kiện.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: template.scopeUnitId }, tx)
      if (template.version !== body.expectedVersion) throw new VersionConflictError('Mẫu sự kiện đã bị thay đổi bởi người khác.', template)
      if (template.latestVersion !== body.expectedLatestVersion) throw new VersionConflictError('Mẫu sự kiện đã có phiên bản mới hơn.', template)
      if (!template.isActive) throw Object.assign(new Error('Mẫu sự kiện đã được lưu trữ.'), { status: 409, code: 'TEMPLATE_ALREADY_ARCHIVED' })
      const now = new Date().toISOString()
      const [changed] = await tx.update(operationEventTemplates).set({ isActive: false, version: template.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(
        eq(operationEventTemplates.parishId, user.parishId), eq(operationEventTemplates.id, templateId),
        eq(operationEventTemplates.version, body.expectedVersion), eq(operationEventTemplates.latestVersion, body.expectedLatestVersion), eq(operationEventTemplates.isActive, true),
      )).returning()
      if (!changed) throw new VersionConflictError('Trạng thái mẫu sự kiện đã bị thay đổi bởi người khác.', template)
      await audit(tx, user, c, 'ARCHIVE', 'operation_event_template', templateId, { isActive: true, version: template.version, latestVersion: template.latestVersion }, { isActive: false, version: changed.version, latestVersion: changed.latestVersion, reason: body.reason })
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/templates/:id/restore', zValidator('json', templateStatusChangeSchema), async c => {
  const user = actor(c); const templateId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.template.restore', { templateId, ...body }, async tx => {
      const [template] = await tx.select().from(operationEventTemplates).where(and(
        eq(operationEventTemplates.parishId, user.parishId), eq(operationEventTemplates.id, templateId),
      )).limit(1)
      if (!template) throw Object.assign(new Error('Không tìm thấy mẫu sự kiện.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: template.scopeUnitId }, tx)
      if (template.version !== body.expectedVersion) throw new VersionConflictError('Mẫu sự kiện đã bị thay đổi bởi người khác.', template)
      if (template.latestVersion !== body.expectedLatestVersion) throw new VersionConflictError('Mẫu sự kiện đã có phiên bản mới hơn.', template)
      if (template.isActive) throw Object.assign(new Error('Mẫu sự kiện đang hoạt động.'), { status: 409, code: 'TEMPLATE_ALREADY_ACTIVE' })
      const now = new Date().toISOString()
      const [changed] = await tx.update(operationEventTemplates).set({ isActive: true, version: template.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(
        eq(operationEventTemplates.parishId, user.parishId), eq(operationEventTemplates.id, templateId),
        eq(operationEventTemplates.version, body.expectedVersion), eq(operationEventTemplates.latestVersion, body.expectedLatestVersion), eq(operationEventTemplates.isActive, false),
      )).returning()
      if (!changed) throw new VersionConflictError('Trạng thái mẫu sự kiện đã bị thay đổi bởi người khác.', template)
      await audit(tx, user, c, 'RESTORE', 'operation_event_template', templateId, { isActive: false, version: template.version, latestVersion: template.latestVersion }, { isActive: true, version: changed.version, latestVersion: changed.latestVersion, reason: body.reason })
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/templates/:id/instantiate', zValidator('json', templateInstantiateSchema), async c => {
  const user = actor(c); const templateId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.template.instantiate', { templateId, ...body }, async tx => {
      const [template] = await tx.select().from(operationEventTemplates).where(and(
        eq(operationEventTemplates.parishId, user.parishId), eq(operationEventTemplates.id, templateId), eq(operationEventTemplates.isActive, true),
      )).limit(1)
      if (!template) throw Object.assign(new Error('Không tìm thấy mẫu sự kiện.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: template.scopeUnitId }, tx)
      if (body.visibility === 'PUBLIC_SUMMARY') {
        await assertOperationsCapability(user, 'operations.event.publish_public', { parishId: user.parishId, resourceUnitId: template.scopeUnitId }, tx)
      }
      const [snapshotRow] = await tx.select().from(operationEventTemplateVersions).where(and(
        eq(operationEventTemplateVersions.parishId, user.parishId), eq(operationEventTemplateVersions.templateId, templateId), eq(operationEventTemplateVersions.version, body.templateVersion),
      )).limit(1)
      if (!snapshotRow) throw Object.assign(new Error('Không tìm thấy phiên bản mẫu sự kiện.'), { status: 404 })
      await assertScopeUnit(tx, user.parishId, template.scopeUnitId)
      const eventScopeType = template.scopeUnitId ? 'UNIT' as const : 'XU_DOAN' as const
      const resolvedOrganizer = await resolveEventOrganizerForCreate(tx, user, {
        scopeType: eventScopeType, scopeUnitId: template.scopeUnitId,
        organizerUserId: body.organizerUserId, organizerPersonId: body.organizerPersonId,
      })
      await assertTarget(tx, user.parishId, resolvedOrganizer.organizerUserId, resolvedOrganizer.organizerPersonId, true)
      if (resolvedOrganizer.organizerUserId || resolvedOrganizer.organizerPersonId) {
        await assertOperationsTargetWithinAuthority(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: template.scopeUnitId }, { userId: resolvedOrganizer.organizerUserId, personId: resolvedOrganizer.organizerPersonId }, tx)
      }
      const snapshot = parseOperationTemplateSnapshot(snapshotRow.snapshotJson)
      const materialized = previewOperationTemplate(snapshot, body.startsAt)
      const now = new Date().toISOString()
      const event = {
        id: generateId('OPS'), parishId: user.parishId, sourceParishEventId: null as string | null,
        sourceTemplateId: template.id, sourceTemplateVersion: body.templateVersion, eventScopeType, scopeUnitId: template.scopeUnitId,
        title: materialized.event.title, description: materialized.event.description, eventType: materialized.event.eventType,
        startsAt: materialized.event.startsAt, endsAt: materialized.event.endsAt, timezone: body.timezone,
        location: materialized.event.location, status: 'DRAFT' as const, visibility: body.visibility,
        organizerPersonId: resolvedOrganizer.organizerPersonId, organizerUserId: resolvedOrganizer.organizerUserId,
        expectedHeadcount: materialized.event.expectedHeadcount, outcomeSummary: null, version: 1,
        createdBy: user.userId, updatedBy: user.userId, createdAt: now, updatedAt: now, deletedAt: null,
      }
      assertPublicCalendarFields(event)
      const tasks = materialized.tasks.map(task => ({
        id: generateId('TSK'), parishId: user.parishId, operationEventId: event.id, workstreamId: null, scopeUnitId: template.scopeUnitId, parentTaskId: null,
        phase: task.phase, title: task.title, description: task.description, status: 'TODO' as const, priority: task.priority,
        isRequired: task.isRequired, dueAt: task.dueAt, scheduledStartAt: task.scheduledStartAt, scheduledEndAt: task.scheduledEndAt, startedAt: null, completedAt: null, completionNote: null,
        blockedReason: null, cancellationReason: null,
        version: 1, createdBy: user.userId, updatedBy: user.userId,
        completedBy: null, createdAt: now, updatedAt: now, deletedAt: null,
      }))
      const checklist = materialized.tasks.flatMap((task, taskIndex) => task.checklist.map(item => ({
        parishId: user.parishId, taskId: tasks[taskIndex].id, id: generateId('OPC'), label: item.label,
        isRequired: item.isRequired, isDone: false, completedBy: null, completedAt: null, sortOrder: item.sortOrder, createdAt: now,
      })))
      await tx.insert(operationEvents).values(event)
      if (tasks.length > 0) await tx.insert(operationTasks).values(tasks)
      if (checklist.length > 0) await tx.insert(operationChecklistItems).values(checklist)
      await audit(tx, user, c, 'INSTANTIATE', 'operation_event_template', template.id, undefined, { eventId: event.id, templateVersion: body.templateVersion, scopeUnitId: template.scopeUnitId, taskCount: tasks.length, checklistCount: checklist.length, sourceParishEventId: event.sourceParishEventId })
      return { event, tasks, checklist, template: { id: template.id, name: template.name, version: body.templateVersion } }
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/candidates', async c => {
  const user = actor(c)
  try {
    const taskId = c.req.query('taskId') || null
    const workstreamId = c.req.query('workstreamId') || null
    const eventId = c.req.query('eventId') || null
    if ([taskId, workstreamId, eventId].filter(Boolean).length !== 1) {
      throw Object.assign(new Error('Phải chọn đúng một task, workstream hoặc event.'), { status: 400 })
    }
    const { page, limit, offset } = listPagination(c)
    const capability = taskId ? 'operations.task.assign' as const : workstreamId ? 'operations.workstream.manage' as const : 'operations.event.manage' as const
    const candidates = await db.transaction(tx => listOperationsCandidates(user, capability, { parishId: user.parishId, taskId, workstreamId, eventId }, tx))
    return paginatedResponse(c, candidates.slice(offset, offset + limit), { page, limit, total: candidates.length })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/events/public-summary', async c => {
  const user = actor(c)
  try {
    const { page, limit, offset } = listPagination(c)
    const rows = await db.select({ id: parishEvents.id, operationEventId: operationEvents.id, date: parishEvents.date, title: parishEvents.title, category: parishEvents.category, categoryName: parishEvents.categoryName, time: parishEvents.time, location: parishEvents.location, operationStatus: operationEvents.status, expectedHeadcount: operationEvents.expectedHeadcount }).from(operationEvents)
      .innerJoin(parishEvents, and(eq(parishEvents.parishId, operationEvents.parishId), eq(parishEvents.id, operationEvents.sourceParishEventId), isNull(parishEvents.deletedAt)))
      .where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.visibility, 'PUBLIC_SUMMARY'), isNull(operationEvents.deletedAt))).orderBy(parishEvents.date)
    return paginatedResponse(c, rows.slice(offset, offset + limit), { page, limit, total: rows.length })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/events', zValidator('query', eventListQuerySchema), async c => {
  const user = actor(c)
  const { q, status, scope } = c.req.valid('query')
  try {
    const { page, limit, offset } = listPagination(c)
    // W2.13: q/status/scope are pushed into SQL so search is not limited to
    // the first loaded page. Two-phase read unchanged: per-row authorization
    // still decides the visible set, and total reflects every visible row
    // matching the filter. SQLite LIKE is case-insensitive for ASCII and
    // diacritic text compares by code point, which matches search intent.
    const filters = [eq(operationEvents.parishId, user.parishId), isNull(operationEvents.deletedAt)]
    if (q) {
      const needle = `%${q.replace(/[%_]/g, '')}%`
      filters.push(or(like(operationEvents.title, needle), like(operationEvents.location, needle))!)
    }
    if (status) filters.push(eq(operationEvents.status, status))
    if (scope) filters.push(scope === 'XU_DOAN' ? isNull(operationEvents.scopeUnitId) : isNotNull(operationEvents.scopeUnitId))
    // Two-phase read: decide visibility on narrow auth columns first so only
    // the requested page is hydrated as full rows. Total still reflects every
    // visible row because per-row authorization cannot be pushed into SQL.
    // U-19b: one "now" snapshot per request keeps the schedule ordering stable
    // across the two phases.
    const nowIso = new Date().toISOString()
    const narrow = await db.select({
      id: operationEvents.id,
      scopeUnitId: operationEvents.scopeUnitId,
      organizerUserId: operationEvents.organizerUserId,
      organizerPersonId: operationEvents.organizerPersonId,
      status: operationEvents.status,
      createdBy: operationEvents.createdBy,
    }).from(operationEvents).where(and(...filters)).orderBy(
      // U-19b (2026-09-21): "sự kiện sắp diễn ra xếp trước". Events that have not
      // ended yet lead, ordered by start ascending (nearest first); events that
      // already ended follow, most recent first. Paging therefore keeps the
      // imminent events on page 1 instead of stranding them behind far-future
      // rows (the client applies the same rule to cached/offline rows).
      sql`CASE WHEN ${operationEvents.endsAt} >= ${nowIso} THEN 0 ELSE 1 END`,
      sql`CASE WHEN ${operationEvents.endsAt} >= ${nowIso} THEN ${operationEvents.startsAt} END`,
      desc(operationEvents.startsAt),
      asc(operationEvents.id),
    )
    const decisions = await resolveOperationsAuthorizationBatch(user, 'operations.event.view', narrow.map(row => ({
      parishId: user.parishId,
      event: { id: row.id, scopeUnitId: row.scopeUnitId, organizerUserId: row.organizerUserId, organizerPersonId: row.organizerPersonId, status: row.status, createdBy: row.createdBy },
      resourceUnitId: row.scopeUnitId,
    })))
    const visibleIds = narrow.filter((_, index) => decisions[index]?.allowed).map(row => row.id)
    const pageIds = visibleIds.slice(offset, offset + limit)
    const pageRows = pageIds.length === 0 ? [] : await db.select().from(operationEvents).where(and(
      eq(operationEvents.parishId, user.parishId), inArray(operationEvents.id, pageIds), isNull(operationEvents.deletedAt),
    ))
    const rowsById = new Map(pageRows.map(row => [row.id, row]))
    const visible = pageIds.map(id => rowsById.get(id)).filter((row): row is typeof pageRows[number] => Boolean(row))
    // Creator/organizer display names ride along with the page rows so the
    // "Sự Kiện & Công Việc Đang Diễn Ra" pane can show who created and who is
    // responsible for each event instead of raw ids.
    const names = await loadOperationsDisplayNames(user.parishId, {
      userIds: visible.flatMap(row => [row.createdBy, row.organizerUserId]),
      personIds: visible.map(row => row.organizerPersonId),
    })
    const rows = visible.map(row => ({
      ...row,
      createdByName: names.accountNameById.get(row.createdBy) ?? null,
      organizerName: row.organizerUserId
        ? names.accountNameById.get(row.organizerUserId) ?? null
        : row.organizerPersonId ? names.personNameById.get(row.organizerPersonId) ?? null : null,
    }))
    return paginatedResponse(c, rows, { page, limit, total: visibleIds.length })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/events', zValidator('json', eventCreateSchema), async c => {
  const user = actor(c); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.create', body, async tx => {
      const scopeType = resolveEventScopeType(body.eventScopeType ?? null, body.scopeUnitId ?? null)
      await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: body.scopeUnitId }, tx)
      if (body.visibility === 'PUBLIC_SUMMARY') {
        await assertOperationsCapability(user, 'operations.event.publish_public', { parishId: user.parishId, resourceUnitId: body.scopeUnitId }, tx)
      }
      await assertScopeUnit(tx, user.parishId, body.scopeUnitId)
      if (body.sourceParishEventId) throw Object.assign(new Error('Liên kết Lịch do Operations tự quản lý; client không được chọn parish event nguồn.'), { status: 400, code: 'CALENDAR_LINK_SERVER_MANAGED' })
      // Creator ≠ Organizer (O1 locked). O2: admin kỹ thuật mutate-all nên được bypass check nghiệp vụ để giữ fixtures/tests cũ;
      // business users (non-admin) enforce đầy đủ (xem resolveEventOrganizerForCreate).
      const { organizerUserId, organizerPersonId } = await resolveEventOrganizerForCreate(tx, user, {
        scopeType, scopeUnitId: body.scopeUnitId ?? null,
        organizerUserId: body.organizerUserId, organizerPersonId: body.organizerPersonId,
      })
      await assertTarget(tx, user.parishId, organizerUserId, organizerPersonId, true)
      if (organizerUserId || organizerPersonId) {
        await assertOperationsTargetWithinAuthority(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: body.scopeUnitId }, { userId: organizerUserId, personId: organizerPersonId }, tx)
      }
      const now = new Date().toISOString()
      const row = { id: generateId('OPS'), parishId: user.parishId, sourceParishEventId: null as string | null, eventScopeType: scopeType as 'XU_DOAN' | 'UNIT', scopeUnitId: body.scopeUnitId ?? null, title: body.title, description: body.description ?? null, eventType: body.eventType, startsAt: body.startsAt, endsAt: body.endsAt, timezone: body.timezone, location: body.location ?? null, status: 'DRAFT' as const, visibility: body.visibility, organizerPersonId, organizerUserId, expectedHeadcount: body.expectedHeadcount ?? null, outcomeSummary: null, version: 1, createdBy: user.userId, updatedBy: user.userId, createdAt: now, updatedAt: now, deletedAt: null }
      assertPublicCalendarFields(row)
      await tx.insert(operationEvents).values(row)
      await audit(tx, user, c, 'CREATE', 'operation_event', row.id, undefined, row); return row
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.put('/events/:id', zValidator('json', eventUpdateSchema), async c => {
  const user = actor(c); const eventId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.update', { eventId, ...body }, async tx => {
      const [existing] = await tx.select().from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
      if (!existing) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.event.manage', { parishId: user.parishId, eventId }, tx)
      if (existing.version !== body.version) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', existing)
      assertEventFieldsMutable(existing)
      if (body.sourceParishEventId !== undefined) throw Object.assign(new Error('Liên kết Lịch do Operations tự quản lý; client không được sửa sourceParishEventId.'), { status: 400, code: 'CALENDAR_LINK_SERVER_MANAGED' })
      const nextScopeUnitId = body.scopeUnitId === undefined ? existing.scopeUnitId : body.scopeUnitId
      const nextOrganizerUserId = body.organizerUserId === undefined ? existing.organizerUserId : body.organizerUserId
      const nextOrganizerPersonId = body.organizerPersonId === undefined ? existing.organizerPersonId : body.organizerPersonId
      const changesAuthorityBoundary =
        (body.scopeUnitId !== undefined && body.scopeUnitId !== existing.scopeUnitId)
        || (body.organizerUserId !== undefined && body.organizerUserId !== existing.organizerUserId)
        || (body.organizerPersonId !== undefined && body.organizerPersonId !== existing.organizerPersonId)
        || (body.visibility !== undefined && body.visibility !== existing.visibility)
      if (changesAuthorityBoundary) {
        await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: nextScopeUnitId }, tx)
      }
      if (nextOrganizerUserId && nextOrganizerPersonId) throw Object.assign(new Error('Organizer chỉ dùng user hoặc person, không dùng cả hai.'), { status: 400 })
      // Scope-type consistency: XU_DOAN ↔ scopeUnitId NULL. Đổi scopeUnitId tự dẫn scope type theo (đã yêu cầu create authority ở scope đích ở trên).
      const existingScopeType = existing.eventScopeType ?? (existing.scopeUnitId ? 'UNIT' : 'XU_DOAN')
      const nextScopeType = body.eventScopeType ?? (nextScopeUnitId ? 'UNIT' : 'XU_DOAN')
      if (body.eventScopeType && body.eventScopeType !== nextScopeType) {
        throw Object.assign(new Error('Phạm vi sự kiện không khớp đơn vị phụ trách.'), { status: 400, code: 'OPERATION_EVENT_SCOPE_TYPE_MISMATCH' })
      }
      // Đổi organizer/scope ở business actors phải giữ rule leader (admin giữ compatibility path).
      if (user.role !== 'admin' && (body.organizerUserId !== undefined || body.organizerPersonId !== undefined || body.scopeUnitId !== undefined)) {
        if (nextScopeType === 'XU_DOAN') {
          if ((nextOrganizerUserId || nextOrganizerPersonId) && !(await isActiveParishLeader(tx, user.parishId, nextOrganizerUserId, nextOrganizerPersonId))) {
            throw Object.assign(new Error('Organizer sự kiện Xứ đoàn phải là Xứ đoàn trưởng đang đương nhiệm.'), { status: 400, code: 'ORGANIZER_MUST_BE_PARISH_LEADER' })
          }
        } else if (nextOrganizerUserId || nextOrganizerPersonId) {
          if (!(await isActiveUnitLeader(tx, user.parishId, nextScopeUnitId!, nextOrganizerUserId, nextOrganizerPersonId))) {
            throw Object.assign(new Error('Organizer sự kiện chuyên môn phải là Trưởng Ban/Trưởng Ngành đương nhiệm đúng đơn vị phụ trách.'), { status: 400, code: 'ORGANIZER_MUST_BE_UNIT_LEADER' })
          }
        }
      }
      const startsAt = body.startsAt ?? existing.startsAt; const endsAt = body.endsAt ?? existing.endsAt
      const visibility = body.visibility ?? existing.visibility
      if (existing.visibility === 'PUBLIC_SUMMARY' || visibility === 'PUBLIC_SUMMARY') {
        await assertOperationsCapability(user, 'operations.event.publish_public', { parishId: user.parishId, resourceUnitId: nextScopeUnitId }, tx)
      }
      if (endsAt <= startsAt) throw Object.assign(new Error('Thời gian kết thúc phải sau thời gian bắt đầu.'), { status: 400 })
      await assertScopeUnit(tx, user.parishId, body.scopeUnitId)
      await assertTarget(tx, user.parishId, body.organizerUserId, body.organizerPersonId, true)
      if (nextOrganizerUserId || nextOrganizerPersonId) {
        await assertOperationsTargetWithinAuthority(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: nextScopeUnitId }, { userId: nextOrganizerUserId, personId: nextOrganizerPersonId }, tx)
      }
      const now = new Date().toISOString()
      const nextEvent = { ...existing, ...body, startsAt, endsAt, visibility, title: body.title ?? existing.title, eventType: body.eventType ?? existing.eventType, timezone: body.timezone ?? existing.timezone, location: body.location === undefined ? existing.location : body.location }
      assertPublicCalendarFields(nextEvent)
      let sourceParishEventId = existing.sourceParishEventId
      if (existing.status !== 'DRAFT' && visibility === 'PUBLIC_SUMMARY') {
        sourceParishEventId = await upsertPublicCalendarEvent(tx, user.parishId, user.userId, sourceParishEventId, nextEvent, now)
      } else if (sourceParishEventId) {
        await tx.update(parishEvents).set({ deletedAt: now, updatedAt: now }).where(and(eq(parishEvents.parishId, user.parishId), eq(parishEvents.id, sourceParishEventId), isNull(parishEvents.deletedAt)))
        sourceParishEventId = null
      }
      const updates: any = { sourceParishEventId, updatedAt: now, updatedBy: user.userId, version: existing.version + 1 }
      for (const field of ['scopeUnitId', 'organizerUserId', 'organizerPersonId', 'title', 'description', 'eventType', 'startsAt', 'endsAt', 'timezone', 'location', 'visibility', 'expectedHeadcount'] as const) if (body[field] !== undefined) updates[field] = body[field]
      if (nextScopeType !== existingScopeType) updates.eventScopeType = nextScopeType
      const [changed] = await tx.update(operationEvents).set(updates).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), eq(operationEvents.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', existing)
      if (existing.status !== 'DRAFT' && existing.visibility !== 'PUBLIC_SUMMARY' && changed.visibility === 'PUBLIC_SUMMARY') await enqueuePublicEventParentNotification(tx, user.parishId, eventId, changed.version, changed, now)
      await audit(tx, user, c, 'UPDATE', 'operation_event', eventId, existing, changed); return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/events/:id/readiness', async c => {
  const user = actor(c); const eventId = c.req.param('id')
  try { await assertOperationsCapability(user, 'operations.event.view', { parishId: user.parishId, eventId }); return successResponse(c, await db.transaction(tx => readiness(tx, user.parishId, eventId))) } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/events/:id', async c => {
  const user = actor(c); const eventId = c.req.param('id')
  try {
    await assertOperationsCapability(user, 'operations.event.view', { parishId: user.parishId, eventId })
    const [event] = await db.select().from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
    if (!event) return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy operation event.', 404)
    const [workstreams, tasks, participants, assignees, retrospectiveRows] = await Promise.all([
      db.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.operationEventId, eventId), isNull(operationWorkstreams.deletedAt))).orderBy(asc(operationWorkstreams.name)),
      db.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.operationEventId, eventId), isNull(operationTasks.deletedAt))).orderBy(asc(operationTasks.dueAt)),
      db.select().from(operationEventParticipants).where(and(eq(operationEventParticipants.parishId, user.parishId), eq(operationEventParticipants.eventId, eventId))),
      db.select({ assignment: operationTaskAssignees }).from(operationTaskAssignees).innerJoin(operationTasks, and(eq(operationTasks.parishId, operationTaskAssignees.parishId), eq(operationTasks.id, operationTaskAssignees.taskId))).where(and(eq(operationTaskAssignees.parishId, user.parishId), eq(operationTasks.operationEventId, eventId), isNull(operationTaskAssignees.removedAt), isNull(operationTasks.deletedAt))),
      db.select().from(operationEventRetrospectives).where(and(eq(operationEventRetrospectives.parishId, user.parishId), eq(operationEventRetrospectives.eventId, eventId))).limit(1),
    ])
    const [readinessState, closureState] = await db.transaction(async tx => Promise.all([
      readiness(tx, user.parishId, eventId),
      closureReadiness(tx, user.parishId, eventId),
    ]))
    // Organizer + creator display names for the detail header (privacy-safe: name
    // only, resolved server-side so person organizers without accounts also show).
    const names = await loadOperationsDisplayNames(user.parishId, {
      userIds: [event.createdBy, event.organizerUserId],
      personIds: [event.organizerPersonId],
    })
    const organizer: { userId: string | null; personId: string | null; displayName: string | null } = {
      userId: event.organizerUserId,
      personId: event.organizerPersonId,
      displayName: event.organizerUserId
        ? names.accountNameById.get(event.organizerUserId) ?? null
        : event.organizerPersonId ? names.personNameById.get(event.organizerPersonId) ?? null : null,
    }
    const creator = { userId: event.createdBy, displayName: names.accountNameById.get(event.createdBy) ?? null }
    return successResponse(c, { event, organizer, creator, retrospective: retrospectiveRows[0] ?? null, workstreams, tasks, participants, assignees: assignees.map(row => row.assignment), readiness: readinessState, closure: closureState, permissions: await getOperationsCallerPermissions(user, { parishId: user.parishId, eventId }) })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.put('/events/:id/retrospective', zValidator('json', eventRetrospectiveSchema), async c => {
  const user = actor(c); const eventId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.retrospective.save', { eventId, ...body }, async tx => {
      const [event] = await tx.select({ id: operationEvents.id, status: operationEvents.status }).from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
      if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.event.manage', { parishId: user.parishId, eventId }, tx)
      if (event.status !== 'COMPLETED') throw Object.assign(new Error('Chỉ ghi đánh giá sau khi sự kiện đã hoàn tất.'), { status: 409, code: 'RETROSPECTIVE_REQUIRES_COMPLETED' })
      const [existing] = await tx.select().from(operationEventRetrospectives).where(and(eq(operationEventRetrospectives.parishId, user.parishId), eq(operationEventRetrospectives.eventId, eventId))).limit(1)
      const now = new Date().toISOString()
      if (!existing) {
        if (body.expectedVersion !== null) throw new VersionConflictError('Hậu kiểm chưa tồn tại; hãy tải lại sự kiện.', null)
        const created = { parishId: user.parishId, eventId, lessonsLearned: body.lessonsLearned, improvementNotes: body.improvementNotes ?? null, version: 1, createdBy: user.userId, updatedBy: user.userId, createdAt: now, updatedAt: now }
        await tx.insert(operationEventRetrospectives).values(created)
        await audit(tx, user, c, 'CREATE_RETROSPECTIVE', 'operation_event', eventId, undefined, { version: 1, hasLessons: true, hasImprovements: Boolean(created.improvementNotes) })
        return created
      }
      if (body.expectedVersion !== existing.version) throw new VersionConflictError('Hậu kiểm đã bị thay đổi bởi người khác.', existing)
      const [changed] = await tx.update(operationEventRetrospectives).set({ lessonsLearned: body.lessonsLearned, improvementNotes: body.improvementNotes ?? null, version: existing.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationEventRetrospectives.parishId, user.parishId), eq(operationEventRetrospectives.eventId, eventId), eq(operationEventRetrospectives.version, existing.version))).returning()
      if (!changed) throw new VersionConflictError('Hậu kiểm đã bị thay đổi bởi người khác.', existing)
      await audit(tx, user, c, 'UPDATE_RETROSPECTIVE', 'operation_event', eventId, { version: existing.version }, { version: changed.version, hasLessons: true, hasImprovements: Boolean(changed.improvementNotes) })
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/events/:id/follow-ups', zValidator('json', eventFollowUpSchema), async c => {
  const user = actor(c); const eventId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.follow_up.create', { eventId, ...body }, async tx => {
      const [event] = await tx.select().from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
      if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.task.create', { parishId: user.parishId, eventId }, tx)
      await assertOperationsCapability(user, 'operations.task.assign', { parishId: user.parishId, eventId }, tx)
      if (event.status !== 'COMPLETED') throw Object.assign(new Error('Chỉ tạo follow-up hậu kiểm sau khi sự kiện đã hoàn tất.'), { status: 409, code: 'FOLLOW_UP_REQUIRES_COMPLETED' })
      if (event.version !== body.eventVersion) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      const target = { userId: body.userId ?? null, personId: body.personId ?? null }
      await assertTarget(tx, user.parishId, target.userId, target.personId, true)
      await assertActionableOperationsTarget(tx, user.parishId, target, 'Người phụ trách follow-up phải có tài khoản Operations đang hoạt động.')
      await assertOperationsTargetWithinAuthority(user, 'operations.task.assign', { parishId: user.parishId, eventId }, target, tx)
      const now = new Date().toISOString()
      const [changedEvent] = await tx.update(operationEvents).set({ version: event.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), eq(operationEvents.version, body.eventVersion))).returning({ version: operationEvents.version })
      if (!changedEvent) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      const task = { id: generateId('TSK'), parishId: user.parishId, operationEventId: eventId, workstreamId: null, scopeUnitId: event.scopeUnitId, parentTaskId: null, phase: 'FOLLOW_UP' as const, title: body.title, description: body.description ?? null, status: 'TODO' as const, priority: body.priority, isRequired: false, dueAt: body.dueAt, scheduledStartAt: null, scheduledEndAt: null, startedAt: null, completedAt: null, completionNote: null, blockedReason: null, cancellationReason: null, version: 1, createdBy: user.userId, updatedBy: user.userId, completedBy: null, createdAt: now, updatedAt: now, deletedAt: null }
      const assignment = { id: generateId('OPA'), parishId: user.parishId, taskId: task.id, userId: target.userId, personId: target.personId, assignmentRole: 'OWNER' as const, acknowledgementStatus: 'PENDING' as const, assignedBy: user.userId, assignedAt: now, respondedAt: null, completedAt: null, note: 'Follow-up từ hậu kiểm sự kiện', version: 1, removedAt: null }
      await tx.insert(operationTasks).values(task)
      await tx.insert(operationTaskAssignees).values(assignment)
      const conflictWarnings = await assignmentConflictWarnings(tx, user.parishId, target, task)
      await audit(tx, user, c, 'CREATE_FOLLOW_UP', 'operation_event', eventId, undefined, { taskId: task.id, assignmentId: assignment.id, ownerUserId: assignment.userId, ownerPersonId: assignment.personId, dueAt: task.dueAt, eventVersion: changedEvent.version })
      return { task, assignment, eventVersion: changedEvent.version, conflictWarnings }
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/events/:id/participants', zValidator('json', participantSchema), async c => {
  const user = actor(c); const eventId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.participant.add', { eventId, ...body }, async tx => {
      await assertOperationsCapability(user, 'operations.event.manage', { parishId: user.parishId, eventId }, tx)
      await assertEventAcceptsPlanningMutation(tx, user.parishId, eventId, 'thêm participant')
      await assertTarget(tx, user.parishId, body.userId, body.personId)
      const row = { parishId: user.parishId, eventId, id: generateId('OPS'), userId: body.userId ?? null, personId: body.personId ?? null, participantRole: body.participantRole, attendanceStatus: 'PLANNED' as const, version: 1, createdAt: new Date().toISOString() }
      await tx.insert(operationEventParticipants).values(row); await audit(tx, user, c, 'ADD_PARTICIPANT', 'operation_event', eventId, undefined, { participantId: row.id, participantRole: row.participantRole }); return row
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/events/:eventId/participants/:participantId/status', zValidator('json', participantStatusSchema), async c => {
  const user = actor(c); const eventId = c.req.param('eventId'); const participantId = c.req.param('participantId'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.participant.status', { eventId, participantId, ...body }, async tx => {
      await assertOperationsCapability(user, 'operations.event.manage', { parishId: user.parishId, eventId }, tx)
      const [existing] = await tx.select().from(operationEventParticipants).where(and(eq(operationEventParticipants.parishId, user.parishId), eq(operationEventParticipants.eventId, eventId), eq(operationEventParticipants.id, participantId))).limit(1)
      if (!existing) throw Object.assign(new Error('Không tìm thấy participant.'), { status: 404 })
      if (existing.version !== body.version) throw new VersionConflictError('Participant đã bị thay đổi bởi người khác.', existing)
      const [changed] = await tx.update(operationEventParticipants).set({ attendanceStatus: body.status, version: existing.version + 1 }).where(and(eq(operationEventParticipants.parishId, user.parishId), eq(operationEventParticipants.eventId, eventId), eq(operationEventParticipants.id, participantId), eq(operationEventParticipants.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Participant đã bị thay đổi bởi người khác.', existing)
      await audit(tx, user, c, 'PARTICIPANT_STATUS', 'operation_event', eventId, { participantId, status: existing.attendanceStatus }, { participantId, status: body.status }); return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/events/:id/headcount', async c => {
  const user = actor(c); const eventId = c.req.param('id')
  try {
    await assertOperationsCapability(user, 'operations.event.view', { parishId: user.parishId, eventId })
    const [event] = await db.select({ expectedHeadcount: operationEvents.expectedHeadcount }).from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
    if (!event) return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy operation event.', 404)
    const participants = await db.select({ status: operationEventParticipants.attendanceStatus }).from(operationEventParticipants).where(and(eq(operationEventParticipants.parishId, user.parishId), eq(operationEventParticipants.eventId, eventId)))
    return successResponse(c, { expected: event.expectedHeadcount, total: participants.length, confirmed: participants.filter(item => item.status === 'CONFIRMED').length, attended: participants.filter(item => item.status === 'ATTENDED').length })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/events/:id/transition', zValidator('json', eventTransitionSchema), async c => {
  const user = actor(c); const eventId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.transition', { eventId, ...body }, async tx => {
      const [event] = await tx.select().from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
      if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
      await assertOperationsCapability(user, body.status === 'CANCELLED' ? 'operations.event.cancel' : 'operations.event.transition', { parishId: user.parishId, eventId }, tx)
      if (body.status === 'CANCELLED' && (event.visibility === 'PUBLIC_SUMMARY' || event.sourceParishEventId)) {
        await assertOperationsCapability(user, 'operations.event.publish_public', { parishId: user.parishId, eventId }, tx)
      }
      if (event.version !== body.version) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      let backwards = false
      if (body.status === 'CANCELLED') {
        if (!['DRAFT', 'PLANNING', 'PREPARING', 'READY'].includes(event.status)) throw Object.assign(new Error(`Không thể hủy event từ ${event.status}.`), { status: 409, code: 'EVENT_TRANSITION_INVALID' })
        if (!body.reason) throw Object.assign(new Error('Hủy event bắt buộc có lý do.'), { status: 400 })
      } else {
        try {
          backwards = manualEventTransition(event.status, body.status, body.reason).backwards
        } catch (error) {
          const code = error instanceof Error ? error.message : 'EVENT_TRANSITION_NOT_ADJACENT'
          if (code === 'EVENT_REWIND_REASON_REQUIRED') throw Object.assign(new Error('Lùi giai đoạn bắt buộc nhập lý do.'), { status: 400, code })
          if (code === 'EVENT_COMPLETED_TERMINAL') throw Object.assign(new Error('Sự kiện đã hoàn tất; không thể chuyển giai đoạn tiếp.'), { status: 409, code })
          throw Object.assign(new Error(`Chỉ được chuyển từng giai đoạn liền kề từ ${event.status}.`), { status: 409, code })
        }
      }
      if (body.status === 'COMPLETED' && !body.outcomeSummary) throw Object.assign(new Error('Hoàn tất event bắt buộc có tổng kết kết quả.'), { status: 400 })
      if (body.status === 'COMPLETED') {
        const closure = await closureReadiness(tx, user.parishId, eventId)
        if (closure.blockers.length) throw Object.assign(new Error('Còn điều kiện đóng sự kiện chưa hoàn tất.'), { status: 409, code: 'COMPLETION_BLOCKED', details: closure.blockers })
      }
      if (event.status === 'PLANNING' && body.status === 'PREPARING') {
        const acceptance = await preparationAcknowledgementState(tx, user.parishId, eventId)
        if (acceptance.blockers.length > 0 && !body.override) throw Object.assign(new Error('Còn người thực hiện chưa nhận nhiệm vụ.'), { status: 409, code: 'TASK_ACCEPTANCE_PENDING', details: acceptance.blockers })
      }
      const state = await readiness(tx, user.parishId, eventId)
      const requiresReadiness = body.status === 'READY' || body.status === 'LIVE'
      if (requiresReadiness && state.blockers.length && !body.override) throw Object.assign(new Error('Event còn điều kiện readiness chưa hoàn tất.'), { status: 409, code: 'READINESS_BLOCKED', details: state.blockers })
      if (requiresReadiness && state.blockers.length && body.override) {
        await assertOperationsCapability(user, 'operations.event.override_readiness', { parishId: user.parishId, eventId }, tx)
        if (!body.reason) throw Object.assign(new Error('Override readiness bắt buộc có lý do.'), { status: 400 })
      }
      const now = new Date().toISOString()
      if (event.status === 'DRAFT' && body.status === 'PLANNING') await activateScheduledDispatchesForEvent(tx, user.parishId, eventId, now)
      if (body.status === 'CANCELLED') await cancelOpenDispatchesForEvent(tx, user.parishId, eventId, now)
      let sourceParishEventId = event.sourceParishEventId
      const publishesDraft = event.status === 'DRAFT' && body.status === 'PLANNING' && event.visibility === 'PUBLIC_SUMMARY'
      if (publishesDraft) sourceParishEventId = await upsertPublicCalendarEvent(tx, user.parishId, user.userId, sourceParishEventId, event, now)
      if ((body.status === 'CANCELLED' || body.status === 'DRAFT') && sourceParishEventId) {
        await tx.update(parishEvents).set({ deletedAt: now, updatedAt: now }).where(and(
          eq(parishEvents.parishId, user.parishId), eq(parishEvents.id, sourceParishEventId), isNull(parishEvents.deletedAt),
        ))
        sourceParishEventId = null
      }
      let completionRecordId = event.completionRecordId
      if (body.status === 'COMPLETED' && (completionRecordId || sourceParishEventId)) {
        const recordValues = { title: event.title, summary: body.outcomeSummary!, occurredOn: parishCalendarDate(new Date(event.startsAt), event.timezone), endedOn: parishCalendarDate(new Date(event.endsAt), event.timezone), location: event.location, updatedBy: user.userId, updatedAt: now }
        if (completionRecordId) {
          const [owned] = await tx.update(parishRecords).set(recordValues).where(and(eq(parishRecords.parishId, user.parishId), eq(parishRecords.id, completionRecordId), isNull(parishRecords.deletedAt))).returning({ id: parishRecords.id })
          if (!owned) throw Object.assign(new Error('Không tìm thấy hồ sơ hoàn thành do Operations sở hữu.'), { status: 409, code: 'COMPLETION_RECORD_MISSING' })
        } else {
          completionRecordId = generateId('PRC')
          await tx.insert(parishRecords).values({ id: completionRecordId, parishId: user.parishId, recordType: 'ACTIVITY', ...recordValues, content: null, status: 'DRAFT', visibility: 'STAFF', showOnTimeline: true, sourceEventId: sourceParishEventId, createdBy: user.userId, publishedBy: null, publishedAt: null, createdAt: now, deletedAt: null })
        }
      }
      const transitionValues: Partial<typeof operationEvents.$inferInsert> = {
        status: body.status,
        sourceParishEventId,
        completionRecordId,
        outcomeSummary: body.outcomeSummary ?? event.outcomeSummary,
        version: event.version + 1,
        updatedBy: user.userId,
        updatedAt: now,
      }
      if (backwards) Object.assign(transitionValues, { automationPaused: true, automationPausedAt: now, automationPausedBy: user.userId, automationPauseReason: body.reason })
      const [changed] = await tx.update(operationEvents).set(transitionValues).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), eq(operationEvents.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      if (publishesDraft) await enqueuePublicEventParentNotification(tx, user.parishId, eventId, changed.version, changed, now)
      await audit(tx, user, c, backwards ? 'REWIND' : 'TRANSITION', 'operation_event', eventId, { status: event.status, version: event.version }, { status: body.status, version: changed.version, reason: body.reason, override: body.override, automationPaused: changed.automationPaused }); return changed
    })
    return commandResponse(c, result)
  } catch (error: any) {
    if (error?.code === 'READINESS_BLOCKED') return sendError(c, 'READINESS_BLOCKED', error.message, 409, error.details)
    if (error?.code === 'COMPLETION_BLOCKED') return sendError(c, 'COMPLETION_BLOCKED', error.message, 409, error.details)
    if (error?.code === 'TASK_ACCEPTANCE_PENDING') return sendError(c, 'TASK_ACCEPTANCE_PENDING', error.message, 409, error.details)
    return handleError(c, error)
  }
})

operationsRouter.post('/events/:id/automation/resume', zValidator('json', eventAutomationResumeSchema), async c => {
  const user = actor(c); const eventId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.automation.resume', { eventId, ...body }, async tx => {
      const [event] = await tx.select().from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
      if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.event.transition', { parishId: user.parishId, eventId }, tx)
      if (event.version !== body.version) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      if (!event.automationPaused) throw Object.assign(new Error('Tự động chuyển giai đoạn hiện không bị tạm dừng.'), { status: 409, code: 'AUTOMATION_NOT_PAUSED' })
      const now = new Date().toISOString()
      const [changed] = await tx.update(operationEvents).set({ automationPaused: false, automationPausedAt: null, automationPausedBy: null, automationPauseReason: null, version: event.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), eq(operationEvents.version, body.version), eq(operationEvents.automationPaused, true))).returning()
      if (!changed) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      await audit(tx, user, c, 'RESUME_AUTOMATION', 'operation_event', eventId, { automationPaused: true, reason: event.automationPauseReason }, { automationPaused: false, reason: body.reason, version: changed.version })
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/events/:id/restore', zValidator('json', eventRestoreSchema), async c => {
  const user = actor(c); const eventId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.restore', { eventId, ...body }, async tx => {
      const [event] = await tx.select().from(operationEvents).where(and(
        eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt),
      )).limit(1)
      if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.event.transition', { parishId: user.parishId, eventId }, tx)
      if (event.version !== body.version) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      if (event.status !== 'CANCELLED') throw Object.assign(new Error('Chỉ có thể khôi phục sự kiện đã hủy.'), { status: 409, code: 'EVENT_NOT_CANCELLED' })
      const now = new Date().toISOString()
      const [changed] = await tx.update(operationEvents).set({
        status: 'PLANNING',
        automationPaused: true,
        automationPausedAt: now,
        automationPausedBy: user.userId,
        automationPauseReason: `Khôi phục từ lưu trữ: ${body.reason}`,
        version: event.version + 1,
        updatedBy: user.userId,
        updatedAt: now,
      }).where(and(
        eq(operationEvents.parishId, user.parishId),
        eq(operationEvents.id, eventId),
        eq(operationEvents.version, body.version),
        eq(operationEvents.status, 'CANCELLED'),
      )).returning()
      if (!changed) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      await audit(tx, user, c, 'RESTORE', 'operation_event', eventId,
        { status: event.status, version: event.version },
        { status: changed.status, version: changed.version, reason: body.reason, automationPaused: changed.automationPaused },
      )
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/blockouts', zValidator('json', blockoutSchema), async c => {
  const user = actor(c); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.blockout.create', body, async tx => {
      const [selfPerson] = await tx.select({ id: parishPeople.id }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), isNull(parishPeople.deletedAt))).limit(1)
      const targetsSelf = body.userId === user.userId || Boolean(body.personId && selfPerson && body.personId === selfPerson.id)
      if (user.role !== 'admin' && !targetsSelf) throw Object.assign(new Error('Chỉ được tạo blockout cho chính mình.'), { status: 403 })
      await assertTarget(tx, user.parishId, body.userId, body.personId, true)
      const row = { parishId: user.parishId, id: generateId('OPS'), userId: body.userId ?? null, personId: body.personId ?? null, startsAt: body.startsAt, endsAt: body.endsAt, reason: body.reason ?? null, version: 1, createdBy: user.userId, createdAt: new Date().toISOString(), deletedAt: null }
      await tx.insert(operationBlockouts).values(row); await audit(tx, user, c, 'CREATE', 'operation_blockout', row.id, undefined, { userId: row.userId, personId: row.personId, startsAt: row.startsAt, endsAt: row.endsAt }); return row
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/blockouts/mine', async c => {
  const user = actor(c)
  try {
    const { page, limit, offset } = listPagination(c)
    const [selfPerson] = await db.select({ id: parishPeople.id }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1)
    const where = and(
      eq(operationBlockouts.parishId, user.parishId),
      or(eq(operationBlockouts.userId, user.userId), selfPerson ? eq(operationBlockouts.personId, selfPerson.id) : undefined),
      isNull(operationBlockouts.deletedAt),
    )
    const [rows, countRows] = await Promise.all([
      db.select({ parishId: operationBlockouts.parishId, id: operationBlockouts.id, userId: operationBlockouts.userId, personId: operationBlockouts.personId, startsAt: operationBlockouts.startsAt, endsAt: operationBlockouts.endsAt, reason: operationBlockouts.reason, version: operationBlockouts.version, createdAt: operationBlockouts.createdAt }).from(operationBlockouts).where(where).orderBy(asc(operationBlockouts.startsAt), asc(operationBlockouts.id)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(operationBlockouts).where(where),
    ])
    return paginatedResponse(c, rows, { page, limit, total: countRows[0]?.total ?? 0 })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.put('/blockouts/:id', zValidator('json', blockoutUpdateSchema), async c => {
  const user = actor(c); const blockoutId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.blockout.update', { blockoutId, ...body }, async tx => {
      const [[selfPerson], [existing]] = await Promise.all([
        tx.select({ id: parishPeople.id }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1),
        tx.select().from(operationBlockouts).where(and(eq(operationBlockouts.parishId, user.parishId), eq(operationBlockouts.id, blockoutId), isNull(operationBlockouts.deletedAt))).limit(1),
      ])
      const targetsSelf = existing && (existing.userId === user.userId || Boolean(selfPerson && existing.personId === selfPerson.id))
      if (!existing || !targetsSelf) throw Object.assign(new Error('Không tìm thấy lịch bận của bạn.'), { status: 404 })
      if (existing.version !== body.version) throw new VersionConflictError('Lịch bận đã bị thay đổi bởi thao tác khác.', existing)
      const [changed] = await tx.update(operationBlockouts).set({ startsAt: body.startsAt, endsAt: body.endsAt, reason: body.reason, version: existing.version + 1 }).where(and(
        eq(operationBlockouts.parishId, user.parishId), eq(operationBlockouts.id, blockoutId), eq(operationBlockouts.version, body.version), isNull(operationBlockouts.deletedAt),
      )).returning()
      if (!changed) throw new VersionConflictError('Lịch bận đã bị thay đổi bởi thao tác khác.', existing)
      await audit(tx, user, c, 'UPDATE', 'operation_blockout', blockoutId,
        { startsAt: existing.startsAt, endsAt: existing.endsAt, version: existing.version },
        { startsAt: changed.startsAt, endsAt: changed.endsAt, version: changed.version, reasonChanged: existing.reason !== changed.reason })
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/blockouts/:id/revoke', zValidator('json', blockoutRevokeSchema), async c => {
  const user = actor(c); const blockoutId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.blockout.revoke', { blockoutId, ...body }, async tx => {
      const [[selfPerson], [existing]] = await Promise.all([
        tx.select({ id: parishPeople.id }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1),
        tx.select().from(operationBlockouts).where(and(eq(operationBlockouts.parishId, user.parishId), eq(operationBlockouts.id, blockoutId), isNull(operationBlockouts.deletedAt))).limit(1),
      ])
      const targetsSelf = existing && (existing.userId === user.userId || Boolean(selfPerson && existing.personId === selfPerson.id))
      if (!existing || !targetsSelf) throw Object.assign(new Error('Không tìm thấy lịch bận của bạn.'), { status: 404 })
      if (existing.version !== body.version) throw new VersionConflictError('Lịch bận đã bị thay đổi bởi thao tác khác.', existing)
      const revokedAt = new Date().toISOString()
      const [changed] = await tx.update(operationBlockouts).set({ deletedAt: revokedAt, version: existing.version + 1 }).where(and(
        eq(operationBlockouts.parishId, user.parishId), eq(operationBlockouts.id, blockoutId), eq(operationBlockouts.version, body.version), isNull(operationBlockouts.deletedAt),
      )).returning({ id: operationBlockouts.id, parishId: operationBlockouts.parishId, version: operationBlockouts.version, deletedAt: operationBlockouts.deletedAt })
      if (!changed) throw new VersionConflictError('Lịch bận đã bị thay đổi bởi thao tác khác.', existing)
      await audit(tx, user, c, 'REVOKE', 'operation_blockout', blockoutId, { version: existing.version }, { version: changed.version, revokedAt })
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/reminders/inbox', async c => {
  const user = actor(c)
  try {
    const { page, limit, offset } = listPagination(c)
    const where = and(eq(operationReminders.parishId, user.parishId), eq(operationReminders.recipientUserId, user.userId))
    const [rows, countRows] = await Promise.all([
      db.select({
        id: operationReminders.id,
        parishId: operationReminders.parishId,
        // W1.2: recipient-scoped resource pointers. The inbox is already filtered
        // to recipient = caller, and recipientship was gated by
        // assertReminderRecipientCanView at create AND at due-time, so this caller
        // already holds view authority over whatever these ids resolve to.
        // Still no dedupe/queue/provider/recipient internals.
        taskId: operationReminders.taskId,
        eventId: operationReminders.eventId,
        triggerAt: operationReminders.triggerAt,
        kind: operationReminders.kind,
        status: operationReminders.status,
        version: operationReminders.version,
        readAt: operationReminders.readAt,
        sentAt: operationReminders.sentAt,
        createdAt: operationReminders.createdAt,
      }).from(operationReminders).where(where).orderBy(desc(operationReminders.triggerAt), desc(operationReminders.id)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(operationReminders).where(where),
    ])
    return paginatedResponse(c, rows, { page, limit, total: countRows[0]?.total ?? 0 })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/reminders', async c => {
  const user = actor(c); const taskId = c.req.query('taskId') || null; const eventId = c.req.query('eventId') || null
  try {
    if ((taskId ? 1 : 0) + (eventId ? 1 : 0) !== 1) throw Object.assign(new Error('Phải chọn đúng một taskId hoặc eventId.'), { status: 400 })
    if (taskId) await assertOperationsCapability(user, 'operations.task.assign', { parishId: user.parishId, taskId })
    else await assertOperationsCapability(user, 'operations.event.manage', { parishId: user.parishId, eventId })
    const { page, limit, offset } = listPagination(c)
    const where = and(eq(operationReminders.parishId, user.parishId), taskId ? eq(operationReminders.taskId, taskId) : eq(operationReminders.eventId, eventId!))
    const [rows, countRows] = await Promise.all([
      db.select({
        id: operationReminders.id,
        parishId: operationReminders.parishId,
        taskId: operationReminders.taskId,
        eventId: operationReminders.eventId,
        recipientUserId: operationReminders.recipientUserId,
        triggerAt: operationReminders.triggerAt,
        kind: operationReminders.kind,
        status: operationReminders.status,
        version: operationReminders.version,
        readAt: operationReminders.readAt,
        sentAt: operationReminders.sentAt,
        createdAt: operationReminders.createdAt,
      }).from(operationReminders).where(where).orderBy(desc(operationReminders.triggerAt), desc(operationReminders.id)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(operationReminders).where(where),
    ])
    return paginatedResponse(c, rows, { page, limit, total: countRows[0]?.total ?? 0 })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/reminders', zValidator('json', reminderSchema), async c => {
  const user = actor(c); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.reminder.create', body, async tx => {
      if (body.taskId) await assertOperationsCapability(user, 'operations.task.assign', { parishId: user.parishId, taskId: body.taskId }, tx)
      else await assertOperationsCapability(user, 'operations.event.manage', { parishId: user.parishId, eventId: body.eventId }, tx)
      if (body.taskId) {
        const [task] = await tx.select({ status: operationTasks.status }).from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, body.taskId), isNull(operationTasks.deletedAt))).limit(1)
        if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
        assertTaskMutable(task)
      } else if (body.eventId) {
        await assertEventAcceptsPlanningMutation(tx, user.parishId, body.eventId, 'tạo reminder')
      }
      await assertTarget(tx, user.parishId, body.recipientUserId, null, true)
      await assertReminderRecipientCanView(tx, user.parishId, body.recipientUserId, body.taskId, body.eventId)
      const target = body.taskId ? `task:${body.taskId}` : `event:${body.eventId}`
      const dedupeKey = `${body.kind}:${target}:recipient:${body.recipientUserId}:at:${body.triggerAt}`
      const row = { parishId: user.parishId, id: generateId('OPR'), taskId: body.taskId ?? null, eventId: body.eventId ?? null, recipientUserId: body.recipientUserId, triggerAt: body.triggerAt, kind: body.kind, dedupeKey, status: 'PENDING' as const, version: 1, readAt: null, attemptCount: 0, enqueuedAt: null, leaseExpiresAt: null, nextAttemptAt: null, notificationId: null, sentAt: null, error: null, createdAt: new Date().toISOString() }
      await tx.insert(operationReminders).values(row); await audit(tx, user, c, 'CREATE', 'operation_reminder', row.id, undefined, { taskId: row.taskId, eventId: row.eventId, recipientUserId: row.recipientUserId, triggerAt: row.triggerAt, kind: row.kind }); return row
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/reminders/:id/reschedule', zValidator('json', reminderRescheduleSchema), async c => {
  const user = actor(c); const reminderId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.reminder.reschedule', { reminderId, ...body }, async tx => {
      const [row] = await tx.select().from(operationReminders).where(and(eq(operationReminders.parishId, user.parishId), eq(operationReminders.id, reminderId))).limit(1)
      if (!row) throw Object.assign(new Error('Không tìm thấy lịch nhắc.'), { status: 404 })
      await assertOperationsCapability(user, row.taskId ? 'operations.task.assign' : 'operations.event.manage', { parishId: user.parishId, taskId: row.taskId, eventId: row.eventId }, tx)
      if (row.status !== 'PENDING') throw Object.assign(new Error('Chỉ đổi giờ được lịch nhắc đang chờ.'), { status: 409 })
      if (row.version !== body.expectedVersion) throw new VersionConflictError('Lịch nhắc đã bị thay đổi bởi người khác.', row)
      if (row.taskId) {
        const [task] = await tx.select({ status: operationTasks.status }).from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, row.taskId), isNull(operationTasks.deletedAt))).limit(1)
        if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
        assertTaskMutable(task)
      } else if (row.eventId) await assertEventAcceptsPlanningMutation(tx, user.parishId, row.eventId, 'đổi lịch nhắc')
      await assertReminderRecipientCanView(tx, user.parishId, row.recipientUserId, row.taskId, row.eventId)
      const target = row.taskId ? `task:${row.taskId}` : `event:${row.eventId}`
      const dedupeKey = `${row.kind}:${target}:recipient:${row.recipientUserId}:at:${body.triggerAt}`
      const [changed] = await tx.update(operationReminders).set({
        triggerAt: body.triggerAt,
        dedupeKey,
        version: row.version + 1,
        nextAttemptAt: null,
        error: null,
      }).where(and(
        eq(operationReminders.parishId, user.parishId), eq(operationReminders.id, reminderId),
        eq(operationReminders.status, 'PENDING'), eq(operationReminders.version, body.expectedVersion),
      )).returning({
        id: operationReminders.id,
        parishId: operationReminders.parishId,
        taskId: operationReminders.taskId,
        eventId: operationReminders.eventId,
        recipientUserId: operationReminders.recipientUserId,
        triggerAt: operationReminders.triggerAt,
        kind: operationReminders.kind,
        status: operationReminders.status,
        version: operationReminders.version,
        readAt: operationReminders.readAt,
        sentAt: operationReminders.sentAt,
        createdAt: operationReminders.createdAt,
      })
      if (!changed) throw new VersionConflictError('Lịch nhắc đã bị thay đổi bởi người khác.', row)
      await audit(tx, user, c, 'RESCHEDULE', 'operation_reminder', reminderId, { triggerAt: row.triggerAt, version: row.version }, { triggerAt: changed.triggerAt, version: changed.version, reason: body.reason })
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/reminders/:id/cancel', zValidator('json', reminderCancelSchema), async c => {
  const user = actor(c); const reminderId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.reminder.cancel', { reminderId, ...body }, async tx => {
      const [row] = await tx.select().from(operationReminders).where(and(eq(operationReminders.parishId, user.parishId), eq(operationReminders.id, reminderId))).limit(1)
      if (!row) throw Object.assign(new Error('Không tìm thấy lịch nhắc.'), { status: 404 })
      if (row.recipientUserId !== user.userId) await assertOperationsCapability(user, row.taskId ? 'operations.task.assign' : 'operations.event.manage', { parishId: user.parishId, taskId: row.taskId, eventId: row.eventId }, tx)
      if (row.status !== 'PENDING') throw Object.assign(new Error('Chỉ hủy được lịch đang chờ; lịch đã chuyển sang bộ gửi không thể thu hồi tại đây.'), { status: 409 })
      if (row.version !== body.expectedVersion) throw new VersionConflictError('Lịch nhắc đã bị thay đổi bởi người khác.', row)
      const [changed] = await tx.update(operationReminders).set({ status: 'CANCELLED', version: row.version + 1, nextAttemptAt: null, leaseExpiresAt: null }).where(and(eq(operationReminders.parishId, user.parishId), eq(operationReminders.id, reminderId), eq(operationReminders.status, 'PENDING'), eq(operationReminders.version, body.expectedVersion))).returning({ id: operationReminders.id, parishId: operationReminders.parishId, status: operationReminders.status, version: operationReminders.version })
      if (!changed) throw new VersionConflictError('Lịch nhắc đã bị thay đổi bởi người khác.', row)
      await audit(tx, user, c, 'CANCEL', 'operation_reminder', reminderId, { status: row.status, version: row.version }, { status: changed.status, version: changed.version, reason: body.reason })
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/reminders/:id/read', zValidator('json', reminderReadSchema.optional()), async c => {
  const user = actor(c); const reminderId = c.req.param('id'); const body = (c.req.valid('json') as { expectedVersion?: number } | undefined) || {}
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.reminder.read', { reminderId, ...body }, async tx => {
      const [row] = await tx.select().from(operationReminders).where(and(eq(operationReminders.parishId, user.parishId), eq(operationReminders.id, reminderId), eq(operationReminders.recipientUserId, user.userId))).limit(1)
      if (!row) throw Object.assign(new Error('Không tìm thấy reminder.'), { status: 404 })
      if (body.expectedVersion !== undefined && row.version !== body.expectedVersion) {
        throw new VersionConflictError('Lịch nhắc đã bị thay đổi bởi người khác.', row)
      }
      const readAt = row.readAt ?? new Date().toISOString()
      const nextVersion = row.version + 1
      const [changed] = await tx.update(operationReminders).set({
        readAt,
        version: nextVersion,
      }).where(and(
        eq(operationReminders.parishId, user.parishId),
        eq(operationReminders.id, reminderId),
        body.expectedVersion !== undefined ? eq(operationReminders.version, body.expectedVersion) : sql`1=1`,
      )).returning({ id: operationReminders.id, readAt: operationReminders.readAt, version: operationReminders.version })
      if (!changed) throw new VersionConflictError('Lịch nhắc đã bị thay đổi bởi người khác.', row)
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/workstreams', async c => {
  const user = actor(c); const eventId = c.req.query('eventId') || null; const standalone = c.req.query('standalone') === 'true'
  try {
    if (eventId && standalone) throw Object.assign(new Error('Không thể lọc đồng thời eventId và standalone.'), { status: 400 })
    const { page, limit, offset } = listPagination(c)
    // Two-phase read: decide visibility on narrow columns, then hydrate only
    // the requested page. The events map is restricted to referenced IDs.
    const narrow = await db.select({
      id: operationWorkstreams.id,
      sourceUnitId: operationWorkstreams.sourceUnitId,
      operationEventId: operationWorkstreams.operationEventId,
    }).from(operationWorkstreams).where(and(
      eq(operationWorkstreams.parishId, user.parishId),
      eventId ? eq(operationWorkstreams.operationEventId, eventId) : standalone ? isNull(operationWorkstreams.operationEventId) : undefined,
      isNull(operationWorkstreams.deletedAt),
    )).orderBy(operationWorkstreams.name, asc(operationWorkstreams.id))
    const referencedEventIds = [...new Set(narrow.map(row => row.operationEventId).filter((value): value is string => Boolean(value)))]
    const eventRows: Array<{ id: string; scopeUnitId: string | null; organizerUserId: string | null; organizerPersonId: string | null; status: string; createdBy: string }> = []
    for (let index = 0; index < referencedEventIds.length; index += 400) {
      const chunk = referencedEventIds.slice(index, index + 400)
      eventRows.push(...await db.select({ id: operationEvents.id, scopeUnitId: operationEvents.scopeUnitId, organizerUserId: operationEvents.organizerUserId, organizerPersonId: operationEvents.organizerPersonId, status: operationEvents.status, createdBy: operationEvents.createdBy }).from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), inArray(operationEvents.id, chunk), isNull(operationEvents.deletedAt))))
    }
    const eventsById = new Map(eventRows.map(row => [row.id, row]))
    const decisions = await resolveOperationsAuthorizationBatch(user, 'operations.task.view', narrow.map(row => {
      const event = row.operationEventId ? eventsById.get(row.operationEventId) : undefined
      return {
        parishId: user.parishId,
        workstream: { id: row.id, sourceUnitId: row.sourceUnitId, operationEventId: row.operationEventId },
        event,
        resourceUnitId: row.sourceUnitId ?? event?.scopeUnitId ?? null,
      }
    }))
    const visibleIds = narrow.filter((_, index) => decisions[index]?.allowed).map(row => row.id)
    const pageIds = visibleIds.slice(offset, offset + limit)
    const pageRows: Array<typeof operationWorkstreams.$inferSelect> = pageIds.length === 0 ? [] : await db.select().from(operationWorkstreams).where(and(
      eq(operationWorkstreams.parishId, user.parishId), inArray(operationWorkstreams.id, pageIds), isNull(operationWorkstreams.deletedAt),
    ))
    const rowsById = new Map(pageRows.map(row => [row.id, row]))
    const visible = pageIds
      .map(id => rowsById.get(id))
      .filter((row): row is typeof operationWorkstreams.$inferSelect => Boolean(row))
    return paginatedResponse(c, visible, { page, limit, total: visibleIds.length })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/workstreams/:id', async c => {
  const user = actor(c); const workstreamId = c.req.param('id')
  try {
    const detail = await db.transaction(async tx => {
      const scope = { parishId: user.parishId, workstreamId }
      await assertOperationsCapability(user, 'operations.task.view', scope, tx)
      const [workstream] = await tx.select().from(operationWorkstreams).where(and(
        eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), isNull(operationWorkstreams.deletedAt),
      )).limit(1)
      const members = await tx.select().from(operationWorkstreamMembers).where(and(
        eq(operationWorkstreamMembers.parishId, user.parishId), eq(operationWorkstreamMembers.workstreamId, workstreamId), isNull(operationWorkstreamMembers.removedAt),
      )).orderBy(operationWorkstreamMembers.assignedAt, operationWorkstreamMembers.id)
      return { workstream, members, permissions: await getOperationsCallerPermissions(user, scope, tx) }
    })
    return successResponse(c, detail)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/workstreams', zValidator('json', workstreamCreateSchema), async c => {
  const user = actor(c); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.workstream.create', body, async tx => {
      if (!body.eventId && !body.sourceUnitId) {
        throw Object.assign(new Error('Nhóm độc lập phải có đơn vị tổ chức phụ trách.'), { status: 400, code: 'STANDALONE_WORKSTREAM_SCOPE_REQUIRED' })
      }
      let event: { id: string; scopeUnitId: string | null; eventScopeType: string | null; status: string } | undefined
      if (body.eventId) {
        ;[event] = await tx.select({ id: operationEvents.id, scopeUnitId: operationEvents.scopeUnitId, eventScopeType: operationEvents.eventScopeType, status: operationEvents.status }).from(operationEvents).where(and(
          eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, body.eventId), isNull(operationEvents.deletedAt),
        )).limit(1)
        if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
        if (event.status === 'COMPLETED' || event.status === 'CANCELLED') throw Object.assign(new Error('Event đã kết thúc; không thể thêm workstream.'), { status: 409, code: 'EVENT_IMMUTABLE' })
        const eventScope = event.eventScopeType ?? (event.scopeUnitId ? 'UNIT' : 'XU_DOAN')
        if (eventScope === 'XU_DOAN' && !body.sourceUnitId && user.role !== 'admin') {
          throw Object.assign(new Error('Field trong sự kiện Xứ đoàn phải gắn đúng một Ban/Ngành phụ trách (thiếu sourceUnitId).'), { status: 400, code: 'FIELD_SCOPE_REQUIRED' })
        }
      }
      await assertOperationsCapability(user, 'operations.workstream.create', { parishId: user.parishId, eventId: body.eventId, resourceUnitId: body.sourceUnitId }, tx)
      if (body.sourceUnitId && event && body.sourceUnitId !== event.scopeUnitId) {
        // An event creator/organizer may structure Fields inside their own event
        // (Xứ đoàn event accepts Fields from any unit); cross-unit smuggling
        // into UNIT events is still blocked by the V2 check below. Giữ eventId
        // trong scope để vai trò creator được xét, thay vì đòi position unit.
        await assertOperationsCapability(user, 'operations.workstream.create', { parishId: user.parishId, eventId: body.eventId, resourceUnitId: body.sourceUnitId }, tx)
      }
      // Scope coherence (V2 hardening): a Field pinned to a UNIT event must
      // belong to that event's unit unless the caller holds true-scope or
      // parish-wide authority (admin override, parish office). XU_DOAN events
      // (null scope) intentionally accept Fields from any unit.
      if (event && event.scopeUnitId && body.sourceUnitId && body.sourceUnitId !== event.scopeUnitId) {
        await assertOperationsCapability(user, 'operations.workstream.create', { parishId: user.parishId, resourceUnitId: event.scopeUnitId }, tx)
      }
      await assertScopeUnit(tx, user.parishId, body.sourceUnitId)
      const now = new Date().toISOString(); const row = { id: generateId('WS'), parishId: user.parishId, operationEventId: body.eventId ?? null, sourceUnitId: body.sourceUnitId ?? null, name: body.name, description: body.description ?? null, status: 'PLANNING' as const, blockedReason: null, isRequired: body.isRequired, leaderPersonId: null, leaderUserId: null, version: 1, createdBy: user.userId, updatedBy: user.userId, createdAt: now, updatedAt: now, deletedAt: null }
      await tx.insert(operationWorkstreams).values(row); await audit(tx, user, c, 'CREATE', 'operation_workstream', row.id, undefined, row)
      if (body.autoAssignLeader && body.sourceUnitId) {
        const [unit] = await tx.select({ unitType: parishOrganizationUnits.unitType }).from(parishOrganizationUnits)
          .where(and(eq(parishOrganizationUnits.parishId, user.parishId), eq(parishOrganizationUnits.id, body.sourceUnitId), isNull(parishOrganizationUnits.deletedAt))).limit(1)
        if (unit) {
          const wantedCode = unit.unitType === 'BRANCH' ? 'BRANCH_LEADER' : unit.unitType === 'COMMITTEE' ? 'COMMITTEE_LEADER' : null
          if (wantedCode) {
            const today = parishCalendarDate()
            const [leader] = await tx.select({
              personId: parishPeople.id,
              userId: parishPeople.linkedUserId,
            }).from(parishServiceTerms)
              .innerJoin(parishPeople, and(eq(parishPeople.parishId, parishServiceTerms.parishId), eq(parishPeople.id, parishServiceTerms.personId)))
              .innerJoin(users, and(eq(users.parishId, parishPeople.parishId), eq(users.id, parishPeople.linkedUserId)))
              .where(and(
                eq(parishServiceTerms.parishId, user.parishId),
                eq(parishServiceTerms.unitId, body.sourceUnitId),
                eq(parishServiceTerms.positionCode, wantedCode),
                isNull(parishServiceTerms.deletedAt),
                lte(parishServiceTerms.startDate, today),
                or(isNull(parishServiceTerms.endDate), gte(parishServiceTerms.endDate, today)),
                eq(parishPeople.serviceStatus, 'ACTIVE'),
                isNull(parishPeople.deletedAt),
                inArray(users.role, ['admin', 'chunhiem', 'phuta']),
                eq(users.status, 'ACTIVE'),
                isNull(users.deletedAt),
              )).limit(1)
            if (leader && (leader.userId || leader.personId)) {
              const memberRow = {
                id: generateId('OWM'),
                parishId: user.parishId,
                workstreamId: row.id,
                userId: leader.userId ?? null,
                personId: leader.personId ?? null,
                operationRole: 'WORKSTREAM_LEAD' as const,
                assignedBy: user.userId,
                assignedAt: now,
                startsAt: null,
                endsAt: null,
                version: 1,
                removedAt: null,
              }
              await tx.insert(operationWorkstreamMembers).values(memberRow)
              await audit(tx, user, c, 'ASSIGN_MEMBER', 'operation_workstream', row.id, undefined, {
                memberId: memberRow.id,
                operationRole: memberRow.operationRole,
                userId: memberRow.userId,
                personId: memberRow.personId,
                reason: 'Mặc định theo Trưởng Ban/Ngành đương nhiệm',
              })
            }
          }
        }
      }
      return row
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.put('/workstreams/:id', zValidator('json', workstreamUpdateSchema), async c => {
  const user = actor(c); const workstreamId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.workstream.update', { workstreamId, ...body }, async tx => {
      const [existing] = await tx.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), isNull(operationWorkstreams.deletedAt))).limit(1)
      if (!existing) throw Object.assign(new Error('Không tìm thấy workstream.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.workstream.manage', { parishId: user.parishId, workstreamId }, tx)
      if (existing.version !== body.version) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', existing)
      await assertWorkstreamEventAcceptsMutation(tx, user.parishId, existing.operationEventId, 'sửa workstream')
      if (body.sourceUnitId !== undefined && body.sourceUnitId !== existing.sourceUnitId) {
        await assertOperationsCapability(user, 'operations.workstream.create', { parishId: user.parishId, resourceUnitId: body.sourceUnitId }, tx)
      }
      // Scope coherence on re-scope (V2 hardening, same class as create): a
      // Field attached to a UNIT event cannot be moved to another unit unless
      // the caller holds true-scope or parish-wide authority.
      if (body.sourceUnitId !== undefined && body.sourceUnitId !== existing.sourceUnitId && existing.operationEventId && body.sourceUnitId) {
        const [attachedEvent] = await tx.select({ scopeUnitId: operationEvents.scopeUnitId }).from(operationEvents).where(and(
          eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, existing.operationEventId), isNull(operationEvents.deletedAt),
        )).limit(1)
        if (attachedEvent?.scopeUnitId && body.sourceUnitId !== attachedEvent.scopeUnitId) {
          await assertOperationsCapability(user, 'operations.workstream.create', { parishId: user.parishId, resourceUnitId: attachedEvent.scopeUnitId }, tx)
        }
      }
      await assertScopeUnit(tx, user.parishId, body.sourceUnitId)
      const updates: any = { version: existing.version + 1, updatedBy: user.userId, updatedAt: new Date().toISOString() }
      for (const field of ['name', 'description', 'sourceUnitId', 'isRequired'] as const) if (body[field] !== undefined) updates[field] = body[field]
      const [changed] = await tx.update(operationWorkstreams).set(updates).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), eq(operationWorkstreams.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', existing)
      await audit(tx, user, c, 'UPDATE', 'operation_workstream', workstreamId, existing, changed); return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

const handleWorkstreamDelete = async (c: any) => {
  const user = actor(c); const workstreamId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.workstream.delete', { workstreamId, ...body }, async tx => {
      const [existing] = await tx.select().from(operationWorkstreams).where(and(
        eq(operationWorkstreams.parishId, user.parishId),
        eq(operationWorkstreams.id, workstreamId),
        isNull(operationWorkstreams.deletedAt),
      )).limit(1)
      if (!existing) throw Object.assign(new Error('Không tìm thấy workstream.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.workstream.manage', { parishId: user.parishId, workstreamId }, tx)
      if (existing.version !== body.version) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', existing)
      await assertWorkstreamEventAcceptsMutation(tx, user.parishId, existing.operationEventId, 'xóa workstream')
      if (existing.operationEventId) {
        const eventStatus = await workstreamEventStatus(tx, user.parishId, existing.operationEventId)
        if (eventStatus === 'LIVE') {
          throw Object.assign(new Error('Không thể xóa Mảng khi sự kiện đang diễn ra (LIVE).'), { status: 409, code: 'EVENT_LIVE_IMMUTABLE' })
        }
      }
      const activeTasks = await tx.select({ id: operationTasks.id }).from(operationTasks).where(and(
        eq(operationTasks.parishId, user.parishId),
        eq(operationTasks.workstreamId, workstreamId),
        isNull(operationTasks.deletedAt),
        ne(operationTasks.status, 'CANCELLED'),
      ))
      if (activeTasks.length > 0) {
        throw Object.assign(new Error(`Không thể xóa Mảng khi còn ${activeTasks.length} nhiệm vụ đang thực hiện bên trong. Hãy xóa hoặc chuyển nhiệm vụ sang Mảng khác trước.`), { status: 400, code: 'WORKSTREAM_NOT_EMPTY' })
      }
      const now = new Date().toISOString()
      await tx.update(operationTasks).set({ workstreamId: null, updatedAt: now }).where(and(
        eq(operationTasks.parishId, user.parishId),
        eq(operationTasks.workstreamId, workstreamId),
      ))
      const [changed] = await tx.update(operationWorkstreams).set({
        deletedAt: now,
        version: existing.version + 1,
        updatedBy: user.userId,
        updatedAt: now,
      }).where(and(
        eq(operationWorkstreams.parishId, user.parishId),
        eq(operationWorkstreams.id, workstreamId),
        eq(operationWorkstreams.version, body.version),
      )).returning()
      if (!changed) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', existing)
      await tx.update(operationWorkstreamMembers).set({
        removedAt: now,
      }).where(and(
        eq(operationWorkstreamMembers.parishId, user.parishId),
        eq(operationWorkstreamMembers.workstreamId, workstreamId),
        isNull(operationWorkstreamMembers.removedAt),
      ))
      await audit(tx, user, c, 'DELETE', 'operation_workstream', workstreamId, existing, {
        deletedAt: now,
        reason: body.reason ?? null,
      })
      return { id: workstreamId, parishId: user.parishId, deletedAt: now }
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
}
operationsRouter.delete('/workstreams/:id', zValidator('json', workstreamDeleteSchema), handleWorkstreamDelete)
operationsRouter.post('/workstreams/:id/delete', zValidator('json', workstreamDeleteSchema), handleWorkstreamDelete)

operationsRouter.post('/workstreams/:id/members', zValidator('json', workstreamMemberSchema), async c => {
  const user = actor(c); const workstreamId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.workstream.member.add', { workstreamId, ...body }, async tx => {
      await assertOperationsCapability(user, body.operationRole === 'WORKSTREAM_LEAD' ? 'operations.workstream.assign_lead' : 'operations.workstream.manage', { parishId: user.parishId, workstreamId }, tx)
      const [workstream] = await tx.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), isNull(operationWorkstreams.deletedAt))).limit(1)
      if (!workstream) throw Object.assign(new Error('Không tìm thấy workstream.'), { status: 404 })
      if (workstream.version !== body.version) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', workstream)
      await assertWorkstreamMembershipMutationAllowed(tx, user.parishId, workstream.operationEventId, body.operationRole, 'thêm thành viên workstream')
      if (body.startsAt && body.endsAt && body.endsAt <= body.startsAt) throw Object.assign(new Error('Thời hạn role không hợp lệ.'), { status: 400 })
      await assertTarget(tx, user.parishId, body.userId, body.personId, true)
      await assertOperationsTargetWithinAuthority(user, body.operationRole === 'WORKSTREAM_LEAD' ? 'operations.workstream.assign_lead' : 'operations.workstream.manage', { parishId: user.parishId, workstreamId }, body, tx)
      if (body.operationRole === 'WORKSTREAM_LEAD' && user.role !== 'admin') {
        await assertWorkstreamLeadEligibility(tx, user.parishId, workstream.sourceUnitId, body)
      }
      const row = { id: generateId('OWM'), parishId: user.parishId, workstreamId, userId: body.userId ?? null, personId: body.personId ?? null, operationRole: body.operationRole, assignedBy: user.userId, assignedAt: new Date().toISOString(), startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null, version: 1, removedAt: null }
      await tx.insert(operationWorkstreamMembers).values(row)
      const [changed] = await tx.update(operationWorkstreams).set({ version: workstream.version + 1, updatedBy: user.userId, updatedAt: row.assignedAt }).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), eq(operationWorkstreams.version, body.version))).returning({ version: operationWorkstreams.version })
      if (!changed) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', workstream)
      await audit(tx, user, c, 'ASSIGN_MEMBER', 'operation_workstream', workstreamId, undefined, { memberId: row.id, operationRole: row.operationRole, userId: row.userId, personId: row.personId }); return { ...row, workstreamVersion: changed.version }
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/workstreams/:id/members/:memberId/remove', zValidator('json', memberRemoveSchema), async c => {
  const user = actor(c); const workstreamId = c.req.param('id'); const memberId = c.req.param('memberId'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.workstream.member.remove', { workstreamId, memberId, ...body }, async tx => {
      const [[workstream], [member]] = await Promise.all([
        tx.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), isNull(operationWorkstreams.deletedAt))).limit(1),
        tx.select().from(operationWorkstreamMembers).where(and(eq(operationWorkstreamMembers.parishId, user.parishId), eq(operationWorkstreamMembers.workstreamId, workstreamId), eq(operationWorkstreamMembers.id, memberId), isNull(operationWorkstreamMembers.removedAt))).limit(1),
      ])
      if (!workstream || !member) throw Object.assign(new Error('Không tìm thấy workstream membership đang hoạt động.'), { status: 404 })
      await assertOperationsCapability(user, member.operationRole === 'WORKSTREAM_LEAD' ? 'operations.workstream.assign_lead' : 'operations.workstream.manage', { parishId: user.parishId, workstreamId }, tx)
      if (workstream.version !== body.version) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', workstream)
      if (member.version !== body.memberVersion) throw new VersionConflictError('Workstream membership đã bị thay đổi bởi người khác.', member)
      await assertWorkstreamMembershipMutationAllowed(tx, user.parishId, workstream.operationEventId, member.operationRole, 'gỡ thành viên workstream')
      const now = new Date().toISOString()
      const [removed] = await tx.update(operationWorkstreamMembers).set({ removedAt: now, version: member.version + 1 }).where(and(eq(operationWorkstreamMembers.parishId, user.parishId), eq(operationWorkstreamMembers.id, memberId), eq(operationWorkstreamMembers.version, body.memberVersion), isNull(operationWorkstreamMembers.removedAt))).returning()
      if (!removed) throw new VersionConflictError('Workstream membership đã bị thay đổi bởi người khác.', member)
      const [changed] = await tx.update(operationWorkstreams).set({ version: workstream.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), eq(operationWorkstreams.version, body.version))).returning({ version: operationWorkstreams.version })
      if (!changed) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', workstream)
      await audit(tx, user, c, 'REMOVE_MEMBER', 'operation_workstream', workstreamId, { memberId, operationRole: member.operationRole }, { removedAt: now, reason: body.reason }); return { member: removed, workstreamVersion: changed.version }
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/workstreams/:id/lead/replace', zValidator('json', leadReplacementSchema), async c => {
  const user = actor(c); const workstreamId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.workstream.lead.replace', { workstreamId, ...body }, async tx => {
      const [workstream] = await tx.select().from(operationWorkstreams).where(and(
        eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), isNull(operationWorkstreams.deletedAt),
      )).limit(1)
      if (!workstream) throw Object.assign(new Error('Không tìm thấy workstream.'), { status: 404 })
      let currentLead: typeof operationWorkstreamMembers.$inferSelect | undefined
      if (body.currentLeadMemberId) {
        ;[currentLead] = await tx.select().from(operationWorkstreamMembers).where(and(
          eq(operationWorkstreamMembers.parishId, user.parishId), eq(operationWorkstreamMembers.workstreamId, workstreamId),
          eq(operationWorkstreamMembers.id, body.currentLeadMemberId), eq(operationWorkstreamMembers.operationRole, 'WORKSTREAM_LEAD'),
          isNull(operationWorkstreamMembers.removedAt),
        )).limit(1)
        if (!currentLead) throw Object.assign(new Error('Không tìm thấy Trưởng nhóm hiện tại trong workstream.'), { status: 404 })
      }
      await assertOperationsCapability(user, 'operations.workstream.assign_lead', { parishId: user.parishId, workstreamId }, tx)
      if (workstream.version !== body.version) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', workstream)
      if (currentLead && currentLead.version !== body.currentLeadMemberVersion) throw new VersionConflictError('Vai trò Trưởng nhóm đã bị thay đổi bởi người khác.', currentLead)
      await assertLiveWorkstreamLeadReplacement(tx, user.parishId, workstream.operationEventId)

      const target = { userId: body.userId ?? null, personId: body.personId ?? null }
      await assertTarget(tx, user.parishId, target.userId, target.personId, true)
      await assertActionableOperationsTarget(tx, user.parishId, target)
      await assertOperationsTargetWithinAuthority(user, 'operations.workstream.assign_lead', { parishId: user.parishId, workstreamId }, target, tx)
      if (user.role !== 'admin') {
        await assertWorkstreamLeadEligibility(tx, user.parishId, workstream.sourceUnitId, target)
      }

      const now = new Date().toISOString()
      if (body.endsAt && body.endsAt <= now) {
        throw Object.assign(new Error('Thời hạn Trưởng nhóm mới phải kết thúc sau thời điểm thay thế.'), { status: 400 })
      }
      const targetCanonicalUserId = await canonicalOperationsUserId(tx, user.parishId, target)
      const activeLeads = await tx.select({
        id: operationWorkstreamMembers.id,
        userId: operationWorkstreamMembers.userId,
        personId: operationWorkstreamMembers.personId,
      }).from(operationWorkstreamMembers).where(and(
        eq(operationWorkstreamMembers.parishId, user.parishId), eq(operationWorkstreamMembers.workstreamId, workstreamId),
        eq(operationWorkstreamMembers.operationRole, 'WORKSTREAM_LEAD'), isNull(operationWorkstreamMembers.removedAt),
      ))
      if (activeLeads.length > 0 && !currentLead) {
        throw Object.assign(new Error('Workstream đã có Trưởng nhóm; phải chọn đúng người hiện tại để thay thế.'), { status: 409, code: 'CURRENT_LEAD_REQUIRED' })
      }
      for (const lead of activeLeads) {
        const sameRawTarget = (target.userId && lead.userId === target.userId) || (target.personId && lead.personId === target.personId)
        const leadCanonicalUserId = await canonicalOperationsUserId(tx, user.parishId, lead)
        if (sameRawTarget || (targetCanonicalUserId && leadCanonicalUserId === targetCanonicalUserId)) {
          throw Object.assign(new Error(lead.id === currentLead?.id ? 'Người được chọn đang là Trưởng nhóm hiện tại.' : 'Người được chọn đã là Trưởng nhóm của workstream.'), { status: 409, code: 'LEAD_TARGET_ALREADY_ACTIVE' })
        }
      }

      let removedLead: typeof operationWorkstreamMembers.$inferSelect | null = null
      if (currentLead) {
        ;[removedLead] = await tx.update(operationWorkstreamMembers).set({ removedAt: now, version: currentLead.version + 1 }).where(and(
          eq(operationWorkstreamMembers.parishId, user.parishId), eq(operationWorkstreamMembers.workstreamId, workstreamId),
          eq(operationWorkstreamMembers.id, currentLead.id), eq(operationWorkstreamMembers.version, body.currentLeadMemberVersion!),
          isNull(operationWorkstreamMembers.removedAt),
        )).returning()
        if (!removedLead) throw new VersionConflictError('Vai trò Trưởng nhóm đã bị thay đổi bởi người khác.', currentLead)
      }

      const newLead = {
        id: generateId('OWM'), parishId: user.parishId, workstreamId,
        userId: target.userId, personId: target.personId, operationRole: 'WORKSTREAM_LEAD' as const,
        assignedBy: user.userId, assignedAt: now, startsAt: now, endsAt: body.endsAt ?? null,
        version: 1, removedAt: null,
      }
      await tx.insert(operationWorkstreamMembers).values(newLead)
      const [changedWorkstream] = await tx.update(operationWorkstreams).set({
        version: workstream.version + 1, updatedBy: user.userId, updatedAt: now,
      }).where(and(
        eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), eq(operationWorkstreams.version, body.version),
      )).returning({ version: operationWorkstreams.version })
      if (!changedWorkstream) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', workstream)

      await audit(tx, user, c, 'REPLACE_LEAD', 'operation_workstream', workstreamId,
        currentLead ? { memberId: currentLead.id, userId: currentLead.userId, personId: currentLead.personId, version: currentLead.version } : null,
        { memberId: newLead.id, userId: newLead.userId, personId: newLead.personId, version: newLead.version, reason: body.reason })
      return { previousLead: removedLead, newLead, workstreamVersion: changedWorkstream.version }
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.put('/workstreams/:id/members/:memberId/validity', zValidator('json', memberValiditySchema), async c => {
  const user = actor(c); const workstreamId = c.req.param('id'); const memberId = c.req.param('memberId'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.workstream.member.validity', { workstreamId, memberId, ...body }, async tx => {
      const [[workstream], [member]] = await Promise.all([
        tx.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), isNull(operationWorkstreams.deletedAt))).limit(1),
        tx.select().from(operationWorkstreamMembers).where(and(eq(operationWorkstreamMembers.parishId, user.parishId), eq(operationWorkstreamMembers.workstreamId, workstreamId), eq(operationWorkstreamMembers.id, memberId), isNull(operationWorkstreamMembers.removedAt))).limit(1),
      ])
      if (!workstream || !member) throw Object.assign(new Error('Không tìm thấy workstream membership đang hoạt động.'), { status: 404 })
      await assertOperationsCapability(user, member.operationRole === 'WORKSTREAM_LEAD' ? 'operations.workstream.assign_lead' : 'operations.workstream.manage', { parishId: user.parishId, workstreamId }, tx)
      if (workstream.version !== body.version) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', workstream)
      if (member.version !== body.memberVersion) throw new VersionConflictError('Workstream membership đã bị thay đổi bởi người khác.', member)
      await assertWorkstreamMembershipMutationAllowed(tx, user.parishId, workstream.operationEventId, member.operationRole, 'đổi thời hạn thành viên workstream')
      const now = new Date().toISOString()
      const [changedMember] = await tx.update(operationWorkstreamMembers).set({ startsAt: body.startsAt, endsAt: body.endsAt, version: member.version + 1 }).where(and(
        eq(operationWorkstreamMembers.parishId, user.parishId), eq(operationWorkstreamMembers.workstreamId, workstreamId), eq(operationWorkstreamMembers.id, memberId),
        eq(operationWorkstreamMembers.version, body.memberVersion), isNull(operationWorkstreamMembers.removedAt),
      )).returning()
      if (!changedMember) throw new VersionConflictError('Workstream membership đã bị thay đổi bởi người khác.', member)
      const [changedWorkstream] = await tx.update(operationWorkstreams).set({ version: workstream.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(
        eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), eq(operationWorkstreams.version, body.version),
      )).returning({ version: operationWorkstreams.version })
      if (!changedWorkstream) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', workstream)
      await audit(tx, user, c, 'UPDATE_MEMBER_VALIDITY', 'operation_workstream', workstreamId,
        { memberId, startsAt: member.startsAt, endsAt: member.endsAt, version: member.version },
        { memberId, startsAt: changedMember.startsAt, endsAt: changedMember.endsAt, version: changedMember.version, reason: body.reason })
      return { member: changedMember, workstreamVersion: changedWorkstream.version }
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/workstreams/:id/ready', zValidator('json', z.object({ version: z.number().int().min(1), status: z.enum(['READY', 'BLOCKED']), reason: z.string().trim().max(2000).nullable().optional() })), async c => {
  const user = actor(c); const workstreamId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.workstream.ready', { workstreamId, ...body }, async tx => {
      await assertOperationsCapability(user, 'operations.workstream.mark_ready', { parishId: user.parishId, workstreamId }, tx)
      const [existing] = await tx.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), isNull(operationWorkstreams.deletedAt))).limit(1)
      if (!existing) throw Object.assign(new Error('Không tìm thấy workstream.'), { status: 404 })
      if (existing.version !== body.version) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', existing)
      await assertWorkstreamEventAcceptsMutation(tx, user.parishId, existing.operationEventId, 'đổi readiness workstream')
      if (body.status === 'BLOCKED' && !body.reason) throw Object.assign(new Error('Workstream bị chặn phải có lý do.'), { status: 400 })
      const [changed] = await tx.update(operationWorkstreams).set({ status: body.status, blockedReason: body.status === 'BLOCKED' ? body.reason : null, version: existing.version + 1, updatedBy: user.userId, updatedAt: new Date().toISOString() }).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), eq(operationWorkstreams.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', existing)
      await audit(tx, user, c, 'MARK_READY', 'operation_workstream', workstreamId, { status: existing.status }, { status: body.status, reason: body.reason }); return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/tasks', async c => {
  const user = actor(c); const mine = c.req.query('mine') === 'true'; const eventId = c.req.query('eventId'); const workstreamId = c.req.query('workstreamId'); const status = c.req.query('status'); const overdue = c.req.query('overdue') === 'true'
  try {
    const { page, limit, offset } = listPagination(c)
    // Two-phase read: visibility is decided on narrow auth columns so only the
    // requested page is hydrated as full rows. Related workstream/event maps
    // are restricted to referenced IDs (chunked for the SQL variable limit).
    const narrow = await db.select({
      id: operationTasks.id,
      workstreamId: operationTasks.workstreamId,
      operationEventId: operationTasks.operationEventId,
      status: operationTasks.status,
      dueAt: operationTasks.dueAt,
      createdAt: operationTasks.createdAt,
    }).from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eventId ? eq(operationTasks.operationEventId, eventId) : undefined, workstreamId ? eq(operationTasks.workstreamId, workstreamId) : undefined, status ? eq(operationTasks.status, status as any) : undefined, overdue ? and(lte(operationTasks.dueAt, new Date().toISOString()), notInArray(operationTasks.status, ['DONE', 'CANCELLED'])) : undefined, isNull(operationTasks.deletedAt))).orderBy(asc(operationTasks.dueAt), desc(operationTasks.createdAt), asc(operationTasks.id))
    const referencedWorkstreamIds = [...new Set(narrow.map(row => row.workstreamId).filter((value): value is string => Boolean(value)))]
    const referencedEventIds = [...new Set(narrow.map(row => row.operationEventId).filter((value): value is string => Boolean(value)))]
    const queryIdChunks = async <T>(ids: string[], load: (chunk: string[]) => Promise<T[]>): Promise<T[]> => {
      const chunks: string[][] = []
      for (let index = 0; index < ids.length; index += 400) chunks.push(ids.slice(index, index + 400))
      return (await Promise.all(chunks.map(load))).flat()
    }
    const [workstreamRows, eventRows, personRows] = await Promise.all([
      queryIdChunks(referencedWorkstreamIds, chunk => db.select({ id: operationWorkstreams.id, sourceUnitId: operationWorkstreams.sourceUnitId, operationEventId: operationWorkstreams.operationEventId }).from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), inArray(operationWorkstreams.id, chunk), isNull(operationWorkstreams.deletedAt)))),
      queryIdChunks(referencedEventIds, chunk => db.select({ id: operationEvents.id, scopeUnitId: operationEvents.scopeUnitId, organizerUserId: operationEvents.organizerUserId, organizerPersonId: operationEvents.organizerPersonId, status: operationEvents.status, createdBy: operationEvents.createdBy }).from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), inArray(operationEvents.id, chunk), isNull(operationEvents.deletedAt)))),
      mine ? db.select({ id: parishPeople.id }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1) : Promise.resolve([] as Array<{ id: string }>),
    ])
    const workstreamsById = new Map(workstreamRows.map(row => [row.id, row]))
    const eventsById = new Map(eventRows.map(row => [row.id, row]))
    const resources = narrow.map(row => {
      const workstream = row.workstreamId ? workstreamsById.get(row.workstreamId) : undefined
      const resolvedEventId = row.operationEventId ?? workstream?.operationEventId ?? null
      const event = resolvedEventId ? eventsById.get(resolvedEventId) : undefined
      return {
        parishId: user.parishId,
        task: { id: row.id, workstreamId: row.workstreamId, operationEventId: row.operationEventId },
        workstream,
        event,
        resourceUnitId: workstream?.sourceUnitId ?? event?.scopeUnitId ?? null,
      }
    })
    const decisions = await resolveOperationsAuthorizationBatch(user, 'operations.task.view', resources)
    const selfPerson = personRows[0]
    const myAssignmentRows = mine ? await db.select().from(operationTaskAssignees).where(and(
      eq(operationTaskAssignees.parishId, user.parishId),
      isNull(operationTaskAssignees.removedAt),
      selfPerson ? or(eq(operationTaskAssignees.userId, user.userId), eq(operationTaskAssignees.personId, selfPerson.id)) : eq(operationTaskAssignees.userId, user.userId),
    )) : []
    const assignmentsByTask = new Map<string, Array<typeof operationTaskAssignees.$inferSelect>>()
    for (const assignment of myAssignmentRows) assignmentsByTask.set(assignment.taskId, [...(assignmentsByTask.get(assignment.taskId) ?? []), assignment])
    const visibleIds: string[] = []
    const visibleAssignments = new Map<string, Array<typeof operationTaskAssignees.$inferSelect>>()
    narrow.forEach((row, index) => {
      const decision = decisions[index]
      if (!decision?.allowed) return
      if (!mine) visibleIds.push(row.id)
      else if (decision.operationRoles.some(role => role.startsWith('TASK_'))) {
        visibleIds.push(row.id)
        visibleAssignments.set(row.id, assignmentsByTask.get(row.id) ?? [])
      }
    })
    const pageIds = visibleIds.slice(offset, offset + limit)
    const pageRows: Array<typeof operationTasks.$inferSelect> = pageIds.length === 0 ? [] : await db.select().from(operationTasks).where(and(
      eq(operationTasks.parishId, user.parishId), inArray(operationTasks.id, pageIds), isNull(operationTasks.deletedAt),
    ))
    const rowsById = new Map(pageRows.map(row => [row.id, row]))
    const visible = pageIds
      .map(id => rowsById.get(id))
      .filter((row): row is typeof operationTasks.$inferSelect => Boolean(row))
      .map(row => mine && visibleAssignments.has(row.id) ? { ...row, myAssignments: visibleAssignments.get(row.id) } : row)
    return paginatedResponse(c, visible, { page, limit, total: visibleIds.length })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/dispatches/inbox', async c => {
  const user = actor(c)
  try {
    const { page, limit, offset } = listPagination(c)
    const [selfPerson] = await db.select({ id: parishPeople.id }).from(parishPeople).where(and(
      eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt),
    )).limit(1)
    const primaryMatch = and(
      isNotNull(operationTaskDispatches.primaryInvitedAt),
      selfPerson ? or(eq(operationTaskDispatches.primaryUserId, user.userId), eq(operationTaskDispatches.primaryPersonId, selfPerson.id)) : eq(operationTaskDispatches.primaryUserId, user.userId),
    )
    const reserveMatch = and(
      isNotNull(operationTaskDispatches.reserveInvitedAt),
      selfPerson ? or(eq(operationTaskDispatches.reserveUserId, user.userId), eq(operationTaskDispatches.reservePersonId, selfPerson.id)) : eq(operationTaskDispatches.reserveUserId, user.userId),
    )
    const rows = await db.select({
      id: operationTaskDispatches.id,
      parishId: operationTaskDispatches.parishId,
      taskId: operationTaskDispatches.taskId,
      version: operationTaskDispatches.version,
      acknowledgeBy: operationTaskDispatches.acknowledgeBy,
      primaryInvitedAt: operationTaskDispatches.primaryInvitedAt,
      reserveInvitedAt: operationTaskDispatches.reserveInvitedAt,
      primaryUserId: operationTaskDispatches.primaryUserId,
      primaryPersonId: operationTaskDispatches.primaryPersonId,
      reserveUserId: operationTaskDispatches.reserveUserId,
      reservePersonId: operationTaskDispatches.reservePersonId,
      taskTitle: operationTasks.title,
      eventId: operationEvents.id,
      eventTitle: operationEvents.title,
    }).from(operationTaskDispatches)
      .innerJoin(operationTasks, and(eq(operationTasks.parishId, operationTaskDispatches.parishId), eq(operationTasks.id, operationTaskDispatches.taskId), isNull(operationTasks.deletedAt)))
      .innerJoin(operationEvents, and(eq(operationEvents.parishId, operationTasks.parishId), eq(operationEvents.id, operationTasks.operationEventId), isNull(operationEvents.deletedAt)))
      .where(and(
        eq(operationTaskDispatches.parishId, user.parishId), eq(operationTaskDispatches.status, 'PENDING'),
        notInArray(operationEvents.status, ['DRAFT', 'COMPLETED', 'CANCELLED']), or(primaryMatch, reserveMatch),
      )).orderBy(asc(operationTaskDispatches.acknowledgeBy))
    const invitations = rows.map(row => {
      const isPrimary = Boolean(row.primaryInvitedAt) && (row.primaryUserId === user.userId || Boolean(selfPerson && row.primaryPersonId === selfPerson.id))
      return {
        id: row.id, parishId: row.parishId, taskId: row.taskId, version: row.version,
        target: isPrimary ? 'PRIMARY' as const : 'RESERVE' as const,
        acknowledgeBy: row.acknowledgeBy,
        invitedAt: isPrimary ? row.primaryInvitedAt! : row.reserveInvitedAt!,
        taskTitle: row.taskTitle, eventId: row.eventId, eventTitle: row.eventTitle,
      }
    })
    return paginatedResponse(c, invitations.slice(offset, offset + limit), { page, limit, total: invitations.length })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks', zValidator('json', taskCreateSchema), async c => {
  const user = actor(c); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.create', body, async tx => {
      let workstream: typeof operationWorkstreams.$inferSelect | undefined
      if (body.workstreamId) {
        ;[workstream] = await tx.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, body.workstreamId), isNull(operationWorkstreams.deletedAt))).limit(1)
        if (!workstream) throw Object.assign(new Error('Không tìm thấy workstream.'), { status: 404 })
      }
      const eventId = body.eventId ?? workstream?.operationEventId ?? null
      if (body.eventId && workstream && workstream.operationEventId !== body.eventId) throw Object.assign(new Error('Task và workstream không cùng operation event.'), { status: 400 })
      let eventScopeUnitId: string | null = null
      let eventScopeType: string | null = null
      if (eventId) {
        const [event] = await tx.select({ id: operationEvents.id, status: operationEvents.status, scopeUnitId: operationEvents.scopeUnitId, eventScopeType: operationEvents.eventScopeType }).from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
        if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
        if (!canCreateEventTask(event.status)) throw Object.assign(new Error('Chỉ tạo task khi sự kiện ở Nháp, Kế hoạch, Chuẩn bị hoặc Sẵn sàng.'), { status: 409, code: 'EVENT_IMMUTABLE' })
        eventScopeUnitId = event.scopeUnitId
        eventScopeType = event.eventScopeType ?? (event.scopeUnitId ? 'UNIT' : 'XU_DOAN')
        // Target model: task trong event Xứ đoàn bắt buộc thuộc Mảng.
        // Task cũ không Mảng được grandfather (chỉ chặn tạo mới).
        // Admin giữ đường tương thích cho fixture/e2e cũ (như FIELD_SCOPE_REQUIRED).
        if (eventScopeType === 'XU_DOAN' && !body.workstreamId && user.role !== 'admin') {
          throw Object.assign(new Error('Task trong sự kiện Xứ đoàn phải thuộc một Mảng phụ trách.'), { status: 400, code: 'TASK_WORKSTREAM_REQUIRED' })
        }
      }
      // O7-A: standalone task scope nullable chuyển tiếp; ưu tiên scopeUnitId gửi lên, fallback workstream/event.
      const resolvedScopeUnitId = body.scopeUnitId ?? workstream?.sourceUnitId ?? eventScopeUnitId ?? null
      await assertScopeUnit(tx, user.parishId, resolvedScopeUnitId)
      await assertOperationsCapability(user, 'operations.task.create', { parishId: user.parishId, eventId, workstreamId: body.workstreamId, resourceUnitId: resolvedScopeUnitId }, tx)
      // Scope coherence (V1 hardening): when the task is attached to a graph
      // with a concrete unit scope, the written scope must equal the graph
      // scope unless the caller holds true-scope or parish-wide authority. A
      // unit position in the *claimed* scope alone must not smuggle work into
      // another unit's event (ADR-112 O6: no cross-unit borrowing). Standalone
      // tasks and XU_DOAN graphs (null scope) keep the existing behavior.
      const graphScopeUnitId = workstream?.sourceUnitId ?? eventScopeUnitId ?? null
      if ((eventId || body.workstreamId) && graphScopeUnitId && resolvedScopeUnitId !== graphScopeUnitId) {
        await assertOperationsCapability(user, 'operations.task.create', { parishId: user.parishId, resourceUnitId: graphScopeUnitId }, tx)
      }
      if (!eventId && !body.workstreamId && !resolvedScopeUnitId && user.role !== 'admin') {
        throw Object.assign(new Error('Task độc lập phải thuộc đúng một Ban/Ngành của người tạo (thiếu scopeUnitId).'), { status: 400, code: 'STANDALONE_TASK_SCOPE_REQUIRED' })
      }
      if (body.parentTaskId) {
        const [parent] = await tx.select({ operationEventId: operationTasks.operationEventId, workstreamId: operationTasks.workstreamId }).from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, body.parentTaskId), isNull(operationTasks.deletedAt))).limit(1)
        if (!parent || parent.operationEventId !== eventId || parent.workstreamId !== (body.workstreamId ?? null)) throw Object.assign(new Error('Task cha phải thuộc cùng event và workstream.'), { status: 400 })
      }
      const now = new Date().toISOString(); const row = { id: generateId('TSK'), parishId: user.parishId, operationEventId: eventId, workstreamId: body.workstreamId ?? null, scopeUnitId: resolvedScopeUnitId, parentTaskId: body.parentTaskId ?? null, title: body.title, description: body.description ?? null, status: 'TODO' as const, priority: body.priority, isRequired: body.isRequired, dueAt: body.dueAt ?? null, scheduledStartAt: body.scheduledStartAt ?? null, scheduledEndAt: body.scheduledEndAt ?? null, startedAt: null, completedAt: null, completionNote: null, blockedReason: null, cancellationReason: null, version: 1, createdBy: user.userId, updatedBy: user.userId, completedBy: null, createdAt: now, updatedAt: now, deletedAt: null }
      const phasedRow = { ...row, phase: body.phase }
      await tx.insert(operationTasks).values(phasedRow); await audit(tx, user, c, 'CREATE', 'operation_task', row.id, undefined, phasedRow); return phasedRow
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/tasks/:id', async c => {
  const user = actor(c); const taskId = c.req.param('id')
  try {
    await assertOperationsCapability(user, 'operations.task.view', { parishId: user.parishId, taskId })
    const [task] = await db.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
    if (!task) return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy task.', 404)
    const [assignees, checklist, comments, dependencies] = await Promise.all([
      db.select().from(operationTaskAssignees).where(and(eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.taskId, taskId), isNull(operationTaskAssignees.removedAt))),
      db.select().from(operationChecklistItems).where(and(eq(operationChecklistItems.parishId, user.parishId), eq(operationChecklistItems.taskId, taskId))).orderBy(operationChecklistItems.sortOrder),
      db.select().from(operationTaskComments).where(and(eq(operationTaskComments.parishId, user.parishId), eq(operationTaskComments.taskId, taskId), isNull(operationTaskComments.deletedAt))).orderBy(operationTaskComments.createdAt),
      // W4.2b: ship the depends-on task's title/status with each edge (LEFT
      // JOIN so a soft-deleted source still explains the block; tenant
      // predicate unchanged, caller already passed task.view authz).
      db.select({
        taskId: operationTaskDependencies.taskId,
        dependsOnTaskId: operationTaskDependencies.dependsOnTaskId,
        dependencyType: operationTaskDependencies.dependencyType,
        dependsOnTitle: operationTasks.title,
        dependsOnStatus: operationTasks.status,
      }).from(operationTaskDependencies)
        .leftJoin(operationTasks, and(eq(operationTasks.parishId, operationTaskDependencies.parishId), eq(operationTasks.id, operationTaskDependencies.dependsOnTaskId), isNull(operationTasks.deletedAt)))
        .where(and(eq(operationTaskDependencies.parishId, user.parishId), eq(operationTaskDependencies.taskId, taskId))),
    ])
    return successResponse(c, { task, assignees, checklist, comments, dependencies, permissions: await getOperationsCallerPermissions(user, { parishId: user.parishId, taskId }) })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.put('/tasks/:id', zValidator('json', taskUpdateSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.update', { taskId, ...body }, async tx => {
      const [existing] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      if (!existing) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.task.manage', { parishId: user.parishId, taskId }, tx)
      if (existing.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', existing)
      assertTaskMutable(existing)
      const scheduleError = taskScheduleError({
        scheduledStartAt: body.scheduledStartAt === undefined ? existing.scheduledStartAt : body.scheduledStartAt,
        scheduledEndAt: body.scheduledEndAt === undefined ? existing.scheduledEndAt : body.scheduledEndAt,
      })
      if (scheduleError) throw Object.assign(new Error(scheduleError), { status: 400, code: 'INVALID_TASK_SCHEDULE' })
      const updates: any = { version: existing.version + 1, updatedBy: user.userId, updatedAt: new Date().toISOString() }
      for (const field of ['title', 'description', 'priority', 'dueAt', 'scheduledStartAt', 'scheduledEndAt', 'isRequired'] as const) if (body[field] !== undefined) updates[field] = body[field]
      // Acknowledgement lifecycle rule: an actual change to title, description,
      // requiredness, deadline or scheduled shift reopens the acknowledgement
      // obligation. Priority and identical (no-op) values never reset it; the
      // server owns this classification and never infers it from free text.
      const importantChange = (['title', 'description', 'isRequired', 'dueAt', 'scheduledStartAt', 'scheduledEndAt'] as const)
        .some(field => body[field] !== undefined && body[field] !== existing[field])
      const resetAssignments: Array<{ id: string }> = []
      if (importantChange) {
        const acceptedRows = await tx.select({ id: operationTaskAssignees.id, version: operationTaskAssignees.version }).from(operationTaskAssignees).where(and(
          eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.taskId, taskId),
          eq(operationTaskAssignees.acknowledgementStatus, 'ACCEPTED'), isNull(operationTaskAssignees.removedAt),
        ))
        for (const row of acceptedRows) {
          const [resetRow] = await tx.update(operationTaskAssignees).set({
            acknowledgementStatus: 'PENDING', respondedAt: null, note: null, version: row.version + 1,
          }).where(and(
            eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.id, row.id),
            eq(operationTaskAssignees.acknowledgementStatus, 'ACCEPTED'), eq(operationTaskAssignees.version, row.version), isNull(operationTaskAssignees.removedAt),
          )).returning({ id: operationTaskAssignees.id })
          if (!resetRow) throw new VersionConflictError('Assignment đã bị thay đổi bởi người khác.', row)
          resetAssignments.push({ id: resetRow.id })
        }
      }
      const [changed] = await tx.update(operationTasks).set(updates).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', existing)
      await audit(tx, user, c, 'UPDATE', 'operation_task', taskId, existing, { ...changed, acknowledgementReset: importantChange, resetAssignments })
      return { task: changed, acknowledgementReset: importantChange, resetAssignments }
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/dispatch', zValidator('json', dispatchCreateSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.dispatch.create', { taskId, ...body }, async tx => {
      const [task] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.task.assign', { parishId: user.parishId, taskId }, tx)
      if (task.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      assertTaskMutable(task)
      if (!task.operationEventId) throw Object.assign(new Error('Cơ chế người chính/dự bị chỉ áp dụng cho task thuộc sự kiện.'), { status: 400, code: 'EVENT_TASK_REQUIRED' })
      const [event] = await tx.select().from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, task.operationEventId), isNull(operationEvents.deletedAt))).limit(1)
      if (!event || !canCreateEventTask(event.status)) throw Object.assign(new Error('Giai đoạn sự kiện không cho phép phân công mới.'), { status: 409, code: 'EVENT_IMMUTABLE' })
      const now = new Date().toISOString()
      if (body.acknowledgeBy <= now) throw Object.assign(new Error('Hạn nhận nhiệm vụ phải ở tương lai.'), { status: 400, code: 'INVALID_ACKNOWLEDGEMENT_DEADLINE' })
      const primary = { userId: body.primaryUserId ?? null, personId: body.primaryPersonId ?? null }
      const reserve = { userId: body.reserveUserId ?? null, personId: body.reservePersonId ?? null }
      await assertTarget(tx, user.parishId, primary.userId, primary.personId, true)
      await assertOperationsTargetWithinAuthority(user, 'operations.task.assign', { parishId: user.parishId, taskId }, primary, tx)
      if (reserve.userId || reserve.personId) {
        await assertTarget(tx, user.parishId, reserve.userId, reserve.personId, true)
        await assertOperationsTargetWithinAuthority(user, 'operations.task.assign', { parishId: user.parishId, taskId }, reserve, tx)
        const [primaryUserId, reserveUserId] = await Promise.all([
          actionableTargetUserId(tx, user.parishId, primary), actionableTargetUserId(tx, user.parishId, reserve),
        ])
        if (primaryUserId === reserveUserId) throw Object.assign(new Error('Người thực hiện chính và dự bị phải khác nhau.'), { status: 409, code: 'DISPATCH_TARGETS_MUST_DIFFER' })
      }
      const [existingOwner] = await tx.select({ id: operationTaskAssignees.id }).from(operationTaskAssignees).where(and(
        eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.taskId, taskId), eq(operationTaskAssignees.assignmentRole, 'OWNER'), isNull(operationTaskAssignees.removedAt),
      )).limit(1)
      if (existingOwner) throw Object.assign(new Error('Task đã có người thực hiện chính.'), { status: 409, code: 'TASK_OWNER_EXISTS' })
      const scheduled = event.status === 'DRAFT'
      const row = {
        id: generateId('OPD'), parishId: user.parishId, taskId,
        primaryUserId: primary.userId, primaryPersonId: primary.personId,
        reserveUserId: reserve.userId, reservePersonId: reserve.personId,
        acknowledgeBy: body.acknowledgeBy,
        primaryInvitedAt: scheduled ? null : now,
        reserveInviteAt: !scheduled && (reserve.userId || reserve.personId) ? reserveInvitationAt(now, body.acknowledgeBy) : null,
        reserveInvitedAt: null, acceptedTarget: null, acceptedAssignmentId: null,
        status: scheduled ? 'SCHEDULED' as const : 'PENDING' as const,
        version: 1, createdBy: user.userId, createdAt: now, updatedAt: now,
      }
      await tx.insert(operationTaskDispatches).values(row)
      const [changedTask] = await tx.update(operationTasks).set({ version: task.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(
        eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version),
      )).returning({ version: operationTasks.version })
      if (!changedTask) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      if (!scheduled) {
        const primaryUserId = await actionableTargetUserId(tx, user.parishId, primary)
        if (!primaryUserId) throw Object.assign(new Error('Người thực hiện chính không còn tài khoản hoạt động.'), { status: 409, code: 'DISPATCH_PRIMARY_NOT_ACTIONABLE' })
        await enqueueDispatchInvitation(tx, user.parishId, row.id, 'PRIMARY', primaryUserId, now)
      }
      await audit(tx, user, c, 'CREATE_DISPATCH', 'operation_task', taskId, undefined, { dispatchId: row.id, status: row.status, acknowledgeBy: row.acknowledgeBy, hasReserve: Boolean(row.reserveUserId || row.reservePersonId) })
      return { dispatch: row, taskVersion: changedTask.version }
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/tasks/:id/dispatches', async c => {
  const user = actor(c); const taskId = c.req.param('id')
  try {
    await assertOperationsCapability(user, 'operations.task.view', { parishId: user.parishId, taskId })
    const rows = await db.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, user.parishId), eq(operationTaskDispatches.taskId, taskId))).orderBy(desc(operationTaskDispatches.createdAt))
    return successResponse(c, rows)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/dispatches/:dispatchId/accept', zValidator('json', dispatchAcceptSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const dispatchId = c.req.param('dispatchId'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.dispatch.accept', { taskId, dispatchId, ...body }, async tx => {
      const [[person], [task], [dispatch]] = await Promise.all([
        tx.select({ id: parishPeople.id }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1),
        tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1),
        tx.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, user.parishId), eq(operationTaskDispatches.id, dispatchId), eq(operationTaskDispatches.taskId, taskId))).limit(1),
      ])
      if (!task || !dispatch) throw Object.assign(new Error('Không tìm thấy lời mời nhận nhiệm vụ.'), { status: 404 })
      assertTaskMutable(task)
      if (!task.operationEventId) throw Object.assign(new Error('Lời mời không còn thuộc sự kiện hợp lệ.'), { status: 409, code: 'DISPATCH_EVENT_REQUIRED' })
      const [event] = await tx.select({ status: operationEvents.status }).from(operationEvents).where(and(
        eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, task.operationEventId), isNull(operationEvents.deletedAt),
      )).limit(1)
      if (!event || ['DRAFT', 'COMPLETED', 'CANCELLED'].includes(event.status)) {
        throw Object.assign(new Error('Sự kiện hiện không cho phép nhận nhiệm vụ.'), { status: 409, code: 'DISPATCH_EVENT_NOT_OPEN' })
      }
      if (dispatch.version !== body.version) throw new VersionConflictError('Lời mời nhận nhiệm vụ đã thay đổi.', dispatch)
      if (dispatch.status !== 'PENDING') throw Object.assign(new Error('Lời mời này không còn mở.'), { status: 409, code: 'DISPATCH_ALREADY_RESOLVED' })
      const targetMatches = body.target === 'PRIMARY'
        ? dispatch.primaryUserId === user.userId || Boolean(person && dispatch.primaryPersonId === person.id)
        : dispatch.reserveUserId === user.userId || Boolean(person && dispatch.reservePersonId === person.id)
      if (!targetMatches) throw Object.assign(new Error('Lời mời không thuộc người dùng.'), { status: 404 })
      if (body.target === 'PRIMARY' && !dispatch.primaryInvitedAt) throw Object.assign(new Error('Lời mời chính chưa được gửi.'), { status: 409, code: 'DISPATCH_NOT_INVITED' })
      if (body.target === 'RESERVE' && !dispatch.reserveInvitedAt) throw Object.assign(new Error('Lời mời dự bị chưa được gửi.'), { status: 409, code: 'DISPATCH_NOT_INVITED' })
      const now = new Date().toISOString()
      const assignment = { id: generateId('OPA'), parishId: user.parishId, taskId, userId: user.userId, personId: null, assignmentRole: 'OWNER' as const, acknowledgementStatus: 'ACCEPTED' as const, assignedBy: dispatch.createdBy, assignedAt: now, respondedAt: now, completedAt: null, note: `Nhận lời mời ${body.target === 'PRIMARY' ? 'chính' : 'dự bị'}`, version: 1, removedAt: null }
      const [changedDispatch] = await tx.update(operationTaskDispatches).set({ status: 'ACCEPTED', acceptedTarget: body.target, acceptedAssignmentId: assignment.id, version: dispatch.version + 1, updatedAt: now }).where(and(
        eq(operationTaskDispatches.parishId, user.parishId), eq(operationTaskDispatches.id, dispatchId), eq(operationTaskDispatches.status, 'PENDING'), eq(operationTaskDispatches.version, body.version),
      )).returning()
      if (!changedDispatch) throw new VersionConflictError('Người khác đã nhận nhiệm vụ trước.', dispatch)
      const [existingOwner] = await tx.select({ id: operationTaskAssignees.id }).from(operationTaskAssignees).where(and(
        eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.taskId, taskId), eq(operationTaskAssignees.assignmentRole, 'OWNER'), isNull(operationTaskAssignees.removedAt),
      )).limit(1)
      if (existingOwner) throw Object.assign(new Error('Task đã có người thực hiện chính.'), { status: 409, code: 'TASK_OWNER_EXISTS' })
      await tx.insert(operationTaskAssignees).values(assignment)
      const [changedTask] = await tx.update(operationTasks).set({ version: task.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, task.version))).returning({ version: operationTasks.version })
      if (!changedTask) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'ACCEPT_DISPATCH', 'operation_task', taskId, { dispatchId, status: dispatch.status }, { dispatchId, status: 'ACCEPTED', acceptedTarget: body.target, assignmentId: assignment.id })
      return { dispatch: changedDispatch, assignment, taskVersion: changedTask.version }
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/assign', zValidator('json', assignmentSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.assign', { taskId, ...body }, async tx => {
      const [task] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.task.assign', { parishId: user.parishId, taskId }, tx)
      if (task.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      assertTaskMutable(task)
      await assertTarget(tx, user.parishId, body.userId, body.personId, true)
      await assertOperationsTargetWithinAuthority(user, 'operations.task.assign', { parishId: user.parishId, taskId }, body, tx)
      if (body.assignmentRole === 'OWNER') {
        const [activeDispatch] = await tx.select({ id: operationTaskDispatches.id }).from(operationTaskDispatches).where(and(
          eq(operationTaskDispatches.parishId, user.parishId), eq(operationTaskDispatches.taskId, taskId), inArray(operationTaskDispatches.status, ['SCHEDULED', 'PENDING']),
        )).limit(1)
        if (activeDispatch) throw Object.assign(new Error('Task đang chờ người chính hoặc dự bị nhận việc.'), { status: 409, code: 'TASK_DISPATCH_ACTIVE' })
      }
      const conflictWarnings = await assignmentConflictWarnings(tx, user.parishId, { userId: body.userId ?? null, personId: body.personId ?? null }, task)
      const assignedAt = new Date().toISOString(); const row = { id: generateId('OPA'), parishId: user.parishId, taskId, userId: body.userId ?? null, personId: body.personId ?? null, assignmentRole: body.assignmentRole, acknowledgementStatus: 'PENDING' as const, assignedBy: user.userId, assignedAt, respondedAt: null, completedAt: null, note: body.note ?? null, version: 1, removedAt: null }
      await tx.insert(operationTaskAssignees).values(row)
      const [changed] = await tx.update(operationTasks).set({ version: task.version + 1, updatedBy: user.userId, updatedAt: assignedAt }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning({ version: operationTasks.version })
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'ASSIGN', 'operation_task', taskId, undefined, { assignmentId: row.id, userId: row.userId, personId: row.personId, assignmentRole: row.assignmentRole }); return { assignment: row, taskVersion: changed.version, conflictWarnings }
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/assignments/:assignmentId/remove', zValidator('json', assignmentRemoveSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const assignmentId = c.req.param('assignmentId'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.assignment.remove', { taskId, assignmentId, ...body }, async tx => {
      const [[task], [assignment]] = await Promise.all([
        tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1),
        tx.select().from(operationTaskAssignees).where(and(eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.taskId, taskId), eq(operationTaskAssignees.id, assignmentId), isNull(operationTaskAssignees.removedAt))).limit(1),
      ])
      if (!task || !assignment) throw Object.assign(new Error('Không tìm thấy assignment đang hoạt động.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.task.reassign', { parishId: user.parishId, taskId }, tx)
      if (task.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      assertTaskMutable(task)
      if (assignment.version !== body.assignmentVersion) throw new VersionConflictError('Assignment đã bị thay đổi bởi người khác.', assignment)
      const now = new Date().toISOString()
      const [removed] = await tx.update(operationTaskAssignees).set({ removedAt: now, version: assignment.version + 1 }).where(and(eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.id, assignmentId), eq(operationTaskAssignees.version, body.assignmentVersion), isNull(operationTaskAssignees.removedAt))).returning()
      if (!removed) throw new VersionConflictError('Assignment đã bị thay đổi bởi người khác.', assignment)
      const [changed] = await tx.update(operationTasks).set({ version: task.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning({ version: operationTasks.version })
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'REMOVE_ASSIGNMENT', 'operation_task', taskId, { assignmentId, assignmentRole: assignment.assignmentRole }, { removedAt: now, reason: body.reason }); return { assignment: removed, taskVersion: changed.version }
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

const ownerHandoverSchema = exactTarget({ version: z.number().int().min(1), assignmentId: id, assignmentVersion: z.number().int().min(1), userId: nullableId, personId: nullableId, reason: z.string().trim().min(1).max(2000) })
operationsRouter.post('/tasks/:id/handover', zValidator('json', ownerHandoverSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.handover', { taskId, ...body }, async tx => {
      await assertOperationsCapability(user, 'operations.task.reassign', { parishId: user.parishId, taskId }, tx)
      const [task] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      const [previous] = await tx.select().from(operationTaskAssignees).where(and(eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.taskId, taskId), eq(operationTaskAssignees.id, body.assignmentId), eq(operationTaskAssignees.assignmentRole, 'OWNER'), isNull(operationTaskAssignees.removedAt))).limit(1)
      if (!task || !previous) throw Object.assign(new Error('Không tìm thấy người phụ trách hiện tại.'), { status: 404 })
      if (task.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      if (previous.version !== body.assignmentVersion) throw new VersionConflictError('Assignment đã bị thay đổi bởi người khác.', previous)
      assertTaskMutable(task)
      await assertTarget(tx, user.parishId, body.userId, body.personId, true)
      await assertOperationsTargetWithinAuthority(user, 'operations.task.reassign', { parishId: user.parishId, taskId }, body, tx)
      if ((body.userId && body.userId === previous.userId) || (body.personId && body.personId === previous.personId)) throw Object.assign(new Error('Hãy chọn người phụ trách khác.'), { status: 409 })
      const personIds = [body.personId, previous.personId].filter((value): value is string => Boolean(value))
      const people = personIds.length ? await tx.select({ id: parishPeople.id, linkedUserId: parishPeople.linkedUserId }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), inArray(parishPeople.id, personIds))) : []
      const previousUserId = previous.userId ?? people.find(person => person.id === previous.personId)?.linkedUserId
      const nextUserId = body.userId ?? people.find(person => person.id === body.personId)?.linkedUserId
      if (previousUserId && previousUserId === nextUserId) throw Object.assign(new Error('Hãy chọn người phụ trách khác.'), { status: 409 })
      const now = new Date().toISOString()
      const [removed] = await tx.update(operationTaskAssignees).set({ removedAt: now, version: previous.version + 1 }).where(and(eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.id, previous.id), eq(operationTaskAssignees.version, body.assignmentVersion), isNull(operationTaskAssignees.removedAt))).returning()
      if (!removed) throw new VersionConflictError('Assignment đã bị thay đổi bởi người khác.', previous)
      const assignment = { id: generateId('OPA'), parishId: user.parishId, taskId, userId: body.userId ?? null, personId: body.personId ?? null, assignmentRole: 'OWNER' as const, acknowledgementStatus: 'PENDING' as const, assignedBy: user.userId, assignedAt: now, respondedAt: null, completedAt: null, note: body.reason, version: 1, removedAt: null }
      await tx.insert(operationTaskAssignees).values(assignment)
      const [changed] = await tx.update(operationTasks).set({ version: task.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'HANDOVER', 'operation_task', taskId, { assignmentId: previous.id }, { assignmentId: assignment.id, reason: body.reason })
      const conflictWarnings = await assignmentConflictWarnings(tx, user.parishId, { userId: body.userId ?? null, personId: body.personId ?? null }, task)
      return { assignment, taskVersion: changed.version, conflictWarnings }
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/acknowledge', zValidator('json', acknowledgementSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.acknowledge', { taskId, ...body }, async tx => {
      const [[person], [task], [assignment]] = await Promise.all([
        tx.select({ id: parishPeople.id }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), isNull(parishPeople.deletedAt))).limit(1),
        tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1),
        tx.select().from(operationTaskAssignees).where(and(eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.taskId, taskId), eq(operationTaskAssignees.id, body.assignmentId), isNull(operationTaskAssignees.removedAt))).limit(1),
      ])
      if (!assignment || (assignment.userId !== user.userId && assignment.personId !== person?.id)) throw Object.assign(new Error('Không tìm thấy assignment của người dùng.'), { status: 404 })
      if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      assertTaskMutable(task)
      // V5 hardening: acknowledgement after the event leaves its planning
      // window is rejected, mirroring the dispatch-accept guard. Flipping an
      // assignment behind a closed event pollutes post-closure audit.
      // FOLLOW_UP-phase tasks are exempt by design: they are created only
      // from COMPLETED events as forward-looking post-closure work with their
      // own audit trail, and their OWNER must acknowledge to start.
      if (task.operationEventId && task.phase !== 'FOLLOW_UP') {
        const [event] = await tx.select({ status: operationEvents.status }).from(operationEvents).where(and(
          eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, task.operationEventId), isNull(operationEvents.deletedAt),
        )).limit(1)
        if (!event || ['DRAFT', 'COMPLETED', 'CANCELLED'].includes(event.status)) {
          throw Object.assign(new Error('Sự kiện hiện không cho phép phản hồi nhiệm vụ.'), { status: 409, code: 'EVENT_NOT_OPEN' })
        }
      }
      if (assignment.version !== body.version) throw new VersionConflictError('Assignment đã bị thay đổi bởi người khác.', assignment)
      const now = new Date().toISOString(); const [changed] = await tx.update(operationTaskAssignees).set({ acknowledgementStatus: body.status, respondedAt: now, note: body.note ?? assignment.note, version: assignment.version + 1 }).where(and(eq(operationTaskAssignees.parishId, user.parishId), eq(operationTaskAssignees.id, assignment.id), eq(operationTaskAssignees.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Assignment đã bị thay đổi bởi người khác.', assignment)
      await audit(tx, user, c, 'ACKNOWLEDGE', 'operation_task', taskId, { assignmentId: assignment.id, status: assignment.acknowledgementStatus }, { assignmentId: assignment.id, status: body.status }); return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/checklist', zValidator('json', checklistCreateSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.checklist.create', { taskId, ...body }, async tx => {
      const [task] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.task.manage', { parishId: user.parishId, taskId }, tx)
      if (task.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      assertTaskMutable(task)
      const row = { parishId: user.parishId, taskId, id: generateId('OPC'), label: body.label, isRequired: body.isRequired, isDone: false, completedBy: null, completedAt: null, sortOrder: body.sortOrder }
      await tx.insert(operationChecklistItems).values(row)
      const [changed] = await tx.update(operationTasks).set({ version: task.version + 1, updatedBy: user.userId, updatedAt: new Date().toISOString() }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning({ version: operationTasks.version })
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'CHECKLIST_ADD', 'operation_task', taskId, { version: task.version }, { checklistId: row.id, label: row.label, isRequired: row.isRequired, taskVersion: changed.version }); return { item: row, taskVersion: changed.version }
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:taskId/checklist/:itemId', zValidator('json', checklistUpdateSchema), async c => {
  const user = actor(c); const taskId = c.req.param('taskId'); const itemId = c.req.param('itemId'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.checklist.update', { taskId, itemId, ...body }, async tx => {
      const [task] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      const executeDecision = await resolveOperationsAuthorization(user, 'operations.task.execute', { parishId: user.parishId, taskId }, tx)
      if (!executeDecision.allowed) await assertOperationsCapability(user, 'operations.task.manage', { parishId: user.parishId, taskId }, tx)
      if (task.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      assertTaskMutable(task)
      const [previousItem] = await tx.select().from(operationChecklistItems).where(and(eq(operationChecklistItems.parishId, user.parishId), eq(operationChecklistItems.taskId, taskId), eq(operationChecklistItems.id, itemId))).limit(1)
      if (!previousItem) throw Object.assign(new Error('Không tìm thấy checklist item.'), { status: 404 })
      // B3'-quick: guard the update on the just-read item state so a concurrent
      // (or out-of-band) modification fails closed with OCC 409 instead of
      // committing on a stale read. A genuinely missing item already 404s at
      // the previousItem read above, so 0 rows here means the row moved under us.
      const now = new Date().toISOString(); const [item] = await tx.update(operationChecklistItems).set({ isDone: body.isDone, completedBy: body.isDone ? user.userId : null, completedAt: body.isDone ? now : null }).where(and(eq(operationChecklistItems.parishId, user.parishId), eq(operationChecklistItems.taskId, taskId), eq(operationChecklistItems.id, itemId), eq(operationChecklistItems.isDone, previousItem.isDone), eq(operationChecklistItems.isRequired, previousItem.isRequired))).returning()
      if (!item) throw new VersionConflictError('Checklist đã bị thay đổi bởi người khác.', task)
      const [changed] = await tx.update(operationTasks).set({ version: task.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning({ version: operationTasks.version })
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'CHECKLIST_UPDATE', 'operation_task', taskId, { isDone: previousItem.isDone, version: task.version }, { checklistId: itemId, isDone: body.isDone, taskVersion: changed.version }); return { item, taskVersion: changed.version }
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/comments', zValidator('json', commentSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.comment', { taskId, ...body }, async tx => {
      await assertOperationsCapability(user, 'operations.task.comment', { parishId: user.parishId, taskId }, tx)
      const row = { id: generateId('OPC'), parishId: user.parishId, taskId, authorUserId: user.userId, content: body.content, evidenceUrl: body.evidenceUrl ?? null, createdAt: new Date().toISOString(), deletedAt: null }
      await tx.insert(operationTaskComments).values(row); await audit(tx, user, c, 'COMMENT', 'operation_task', taskId, undefined, { commentId: row.id, evidence: Boolean(row.evidenceUrl), contentLength: row.content.length }); return row
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/dependencies', zValidator('json', dependencySchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.dependency.add', { taskId, ...body }, async tx => {
      if (taskId === body.dependsOnTaskId) throw Object.assign(new Error('Task không thể phụ thuộc chính nó.'), { status: 400 })
      await assertOperationsCapability(user, 'operations.task.manage', { parishId: user.parishId, taskId }, tx)
      // V7 hardening: the caller must also view the dependency target. Missing
      // and forbidden both fail closed with a uniform 403, so this check
      // doubles as an existence-oracle guard for task UUIDs.
      await assertOperationsCapability(user, 'operations.task.view', { parishId: user.parishId, taskId: body.dependsOnTaskId }, tx)
      const [task, dependency] = await Promise.all([
        tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1),
        tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, body.dependsOnTaskId), isNull(operationTasks.deletedAt))).limit(1),
      ])
      if (!task[0] || !dependency[0] || task[0].operationEventId !== dependency[0].operationEventId) throw Object.assign(new Error('Dependency phải thuộc cùng operation event.'), { status: 400 })
      if (task[0].version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task[0])
      assertTaskMutable(task[0])
      // Same-event edges only — parish-wide dependency scan was a write-path full table read.
      const eventId = task[0].operationEventId
      const edges = await tx.select({
        taskId: operationTaskDependencies.taskId,
        dependsOnTaskId: operationTaskDependencies.dependsOnTaskId,
      }).from(operationTaskDependencies).innerJoin(operationTasks, and(
        eq(operationTasks.parishId, operationTaskDependencies.parishId),
        eq(operationTasks.id, operationTaskDependencies.taskId),
        isNull(operationTasks.deletedAt),
      )).where(and(
        eq(operationTaskDependencies.parishId, user.parishId),
        eventId === null ? isNull(operationTasks.operationEventId) : eq(operationTasks.operationEventId, eventId),
      ))
      const graph = new Map<string, string[]>(); for (const edge of edges) graph.set(edge.taskId, [...(graph.get(edge.taskId) ?? []), edge.dependsOnTaskId])
      graph.set(taskId, [...(graph.get(taskId) ?? []), body.dependsOnTaskId])
      const pending = [body.dependsOnTaskId]; const seen = new Set<string>()
      while (pending.length) { const current = pending.shift()!; if (current === taskId) throw Object.assign(new Error('Dependency tạo chu trình.'), { status: 409 }); if (seen.has(current)) continue; seen.add(current); pending.push(...(graph.get(current) ?? [])) }
      const row = { parishId: user.parishId, taskId, dependsOnTaskId: body.dependsOnTaskId, dependencyType: 'BLOCKED_BY' as const }; await tx.insert(operationTaskDependencies).values(row)
      const [changed] = await tx.update(operationTasks).set({ version: task[0].version + 1, updatedBy: user.userId, updatedAt: new Date().toISOString() }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning({ version: operationTasks.version })
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task[0])
      await audit(tx, user, c, 'DEPENDENCY_ADD', 'operation_task', taskId, undefined, row); return { ...row, taskVersion: changed.version }
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

// V8: dependency removal. Adding an edge is no longer a one-way door: the
// manager of the blocked task can remove a mistaken edge with the same OCC
// and audit guarantees as every other task-structure mutation. Deleting an
// edge cannot create a cycle, so no graph scan is needed.
operationsRouter.post('/tasks/:id/dependencies/:dependsOnTaskId/remove', zValidator('json', dependencyRemoveSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const dependsOnTaskId = c.req.param('dependsOnTaskId'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.dependency.remove', { taskId, dependsOnTaskId, ...body }, async tx => {
      await assertOperationsCapability(user, 'operations.task.manage', { parishId: user.parishId, taskId }, tx)
      const [task] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      if (task.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      assertTaskMutable(task)
      const [edge] = await tx.select().from(operationTaskDependencies).where(and(
        eq(operationTaskDependencies.parishId, user.parishId), eq(operationTaskDependencies.taskId, taskId), eq(operationTaskDependencies.dependsOnTaskId, dependsOnTaskId),
      )).limit(1)
      if (!edge) throw Object.assign(new Error('Không tìm thấy dependency cần gỡ.'), { status: 404 })
      await tx.delete(operationTaskDependencies).where(and(
        eq(operationTaskDependencies.parishId, user.parishId), eq(operationTaskDependencies.taskId, taskId), eq(operationTaskDependencies.dependsOnTaskId, dependsOnTaskId),
      ))
      const [changed] = await tx.update(operationTasks).set({ version: task.version + 1, updatedBy: user.userId, updatedAt: new Date().toISOString() }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning({ version: operationTasks.version })
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'DEPENDENCY_REMOVE', 'operation_task', taskId, { dependsOnTaskId, dependencyType: edge.dependencyType }, { dependsOnTaskId, reason: body.reason, taskVersion: changed.version }); return { taskVersion: changed.version }
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/transition', zValidator('json', taskTransitionSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  const allowed: Record<string, string[]> = { BACKLOG: ['TODO', 'CANCELLED'], TODO: ['IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'], IN_PROGRESS: ['BLOCKED', 'DONE', 'CANCELLED'], BLOCKED: ['IN_PROGRESS', 'DONE', 'CANCELLED'], DONE: [], CANCELLED: [] }
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.transition', { taskId, ...body }, async tx => {
      const [task] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.task.execute', { parishId: user.parishId, taskId }, tx)
      if (task.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      if (!allowed[task.status]?.includes(body.status)) throw Object.assign(new Error(`Không thể chuyển task từ ${task.status} sang ${body.status}.`), { status: 409 })
      if (body.status === 'BLOCKED' && !body.blockedReason) throw Object.assign(new Error('Task bị chặn phải có lý do.'), { status: 400 })
      if (body.status === 'CANCELLED' && !body.cancellationReason) throw Object.assign(new Error('Hủy task bắt buộc có lý do.'), { status: 400 })
      if (body.status === 'DONE') {
        const dependencies = await tx.select({ status: operationTasks.status }).from(operationTaskDependencies).innerJoin(operationTasks, and(eq(operationTasks.parishId, operationTaskDependencies.parishId), eq(operationTasks.id, operationTaskDependencies.dependsOnTaskId))).where(and(eq(operationTaskDependencies.parishId, user.parishId), eq(operationTaskDependencies.taskId, taskId)))
        if (dependencies.some(item => item.status !== 'DONE' && item.status !== 'CANCELLED')) throw Object.assign(new Error('Task còn dependency chưa hoàn tất.'), { status: 409 })
        const [incomplete] = await tx.select({ id: operationChecklistItems.id }).from(operationChecklistItems).where(and(eq(operationChecklistItems.parishId, user.parishId), eq(operationChecklistItems.taskId, taskId), eq(operationChecklistItems.isRequired, true), eq(operationChecklistItems.isDone, false))).limit(1)
        if (incomplete) throw Object.assign(new Error('Task còn checklist bắt buộc chưa hoàn tất.'), { status: 409 })
      }
      const now = new Date().toISOString(); const [changed] = await tx.update(operationTasks).set({ status: body.status, completionNote: body.completionNote ?? task.completionNote, blockedReason: body.status === 'BLOCKED' ? body.blockedReason : null, cancellationReason: body.status === 'CANCELLED' ? body.cancellationReason : null, startedAt: body.status === 'IN_PROGRESS' ? (task.startedAt ?? now) : task.startedAt, completedAt: body.status === 'DONE' ? now : null, completedBy: body.status === 'DONE' ? user.userId : null, version: task.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      if (body.status === 'DONE' || body.status === 'CANCELLED') {
        await tx.update(operationTaskDispatches).set({ status: 'CANCELLED', version: sql`${operationTaskDispatches.version} + 1`, updatedAt: now }).where(and(
          eq(operationTaskDispatches.parishId, user.parishId), eq(operationTaskDispatches.taskId, taskId), inArray(operationTaskDispatches.status, ['SCHEDULED', 'PENDING']),
        ))
      }
      await audit(tx, user, c, 'TRANSITION', 'operation_task', taskId, { status: task.status, version: task.version }, { status: body.status, version: changed.version, blockedReason: body.blockedReason, cancellationReason: body.cancellationReason }); return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/restore', zValidator('json', taskRestoreSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.restore', { taskId, ...body }, async tx => {
      const [task] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.task.manage', { parishId: user.parishId, taskId }, tx)
      if (task.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      if (task.status !== 'CANCELLED') throw Object.assign(new Error('Chỉ có thể khôi phục task đã hủy.'), { status: 409, code: 'TASK_NOT_CANCELLED' })
      if (task.operationEventId) {
        const [event] = await tx.select({ status: operationEvents.status }).from(operationEvents).where(and(
          eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, task.operationEventId), isNull(operationEvents.deletedAt),
        )).limit(1)
        if (!event) throw Object.assign(new Error('Không tìm thấy operation event của task.'), { status: 404 })
        if (event.status === 'COMPLETED' || event.status === 'CANCELLED') {
          throw Object.assign(new Error('Không thể khôi phục task trong sự kiện đã đóng.'), { status: 409, code: 'EVENT_IMMUTABLE' })
        }
      }
      const now = new Date().toISOString()
      const [changed] = await tx.update(operationTasks).set({
        status: 'TODO',
        cancellationReason: null,
        blockedReason: null,
        startedAt: null,
        completedAt: null,
        completedBy: null,
        completionNote: null,
        version: task.version + 1,
        updatedBy: user.userId,
        updatedAt: now,
      }).where(and(
        eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId),
        eq(operationTasks.version, body.version), eq(operationTasks.status, 'CANCELLED'),
      )).returning()
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'RESTORE', 'operation_task', taskId,
        { status: task.status, version: task.version, cancellationReason: task.cancellationReason },
        { status: changed.status, version: changed.version, reason: body.reason })
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

export default operationsRouter
