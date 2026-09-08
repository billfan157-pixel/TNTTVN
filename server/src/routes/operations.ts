import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray, or, sql } from 'drizzle-orm'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { db } from '../db/index.js'
import type { DbTransaction } from '../db/transactions.js'
import {
  auditLogs,
  operationBlockouts,
  operationChecklistItems,
  operationEventParticipants,
  operationEvents,
  operationReminders,
  operationTaskAssignees,
  operationTaskComments,
  operationTaskDependencies,
  operationTasks,
  operationWorkstreamMembers,
  operationWorkstreams,
  parishEvents,
  parishPeople,
  parishRecords,
  parishOrganizationUnits,
  users,
} from '../db/schema.js'
import { assertOperationsCapability, getOperationsCallerPermissions, resolveOperationsAuthorization, resolveOperationsAuthorizationBatch, resolveOperationsUserAuthorization } from '../services/operationsAuthorization.js'
import { OperationsIdempotencyError, requireOperationsIdempotencyKey, runIdempotentOperationsCommand } from '../services/operationsIdempotency.js'
import { generateId } from '../utils/id.js'
import { getClientIp } from '../utils/ip.js'
import { errorResponse, paginatedResponse, sendError, successResponse } from '../utils/response.js'
import { VersionConflictError } from '../domain/errors.js'

const operationsRouter = new Hono()
operationsRouter.use('*', authMiddleware)
operationsRouter.use('*', roleMiddleware('admin', 'chunhiem', 'phuta'))

const id = z.string().trim().min(1).max(100)
const nullableId = id.nullable().optional()
const instant = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString())
const exactTarget = <T extends z.ZodRawShape>(shape: T) => z.object(shape).superRefine((value: any, ctx) => {
  if ((value.userId ? 1 : 0) + (value.personId ? 1 : 0) !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['userId'], message: 'Phải có đúng một userId hoặc personId.' })
})
const workstreamCreateSchema = z.object({
  eventId: nullableId,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(3000).nullable().optional(),
  sourceUnitId: nullableId,
  isRequired: z.boolean().optional().default(false),
})
const workstreamUpdateSchema = workstreamCreateSchema.omit({ eventId: true }).partial().extend({ version: z.number().int().min(1) })
const workstreamMemberSchema = exactTarget({
  version: z.number().int().min(1),
  userId: nullableId,
  personId: nullableId,
  operationRole: z.enum(['WORKSTREAM_LEAD', 'CONTRIBUTOR', 'APPROVER', 'OBSERVER']),
  startsAt: instant.nullable().optional(),
  endsAt: instant.nullable().optional(),
})
const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).nullable().optional(),
  eventId: nullableId,
  workstreamId: nullableId,
  parentTaskId: nullableId,
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional().default('NORMAL'),
  dueAt: instant.nullable().optional(),
  isRequired: z.boolean().optional().default(false),
  requiresApproval: z.boolean().optional().default(false),
})
const taskUpdateSchema = z.object({
  version: z.number().int().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  dueAt: instant.nullable().optional(),
  isRequired: z.boolean().optional(),
})
const assignmentSchema = exactTarget({
  version: z.number().int().min(1),
  userId: nullableId,
  personId: nullableId,
  assignmentRole: z.enum(['OWNER', 'CONTRIBUTOR', 'APPROVER', 'OBSERVER']),
  note: z.string().trim().max(2000).nullable().optional(),
})
const acknowledgementSchema = z.object({ assignmentId: id, version: z.number().int().min(1), status: z.enum(['ACCEPTED', 'DECLINED']), note: z.string().trim().max(2000).nullable().optional() })
const eventCreateSchema = z.object({
  sourceParishEventId: nullableId,
  scopeUnitId: nullableId,
  organizerUserId: nullableId,
  organizerPersonId: nullableId,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).nullable().optional(),
  eventType: z.string().trim().min(1).max(80),
  startsAt: instant,
  endsAt: instant,
  timezone: z.string().trim().min(1).max(80),
  location: z.string().trim().max(300).nullable().optional(),
  visibility: z.enum(['INTERNAL', 'PUBLIC_SUMMARY']).optional().default('INTERNAL'),
  expectedHeadcount: z.number().int().min(0).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'Thời gian kết thúc phải sau thời gian bắt đầu.' })
  if (value.visibility === 'PUBLIC_SUMMARY' && !value.sourceParishEventId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceParishEventId'], message: 'PUBLIC_SUMMARY phải liên kết một parish event.' })
  if (value.organizerUserId && value.organizerPersonId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['organizerUserId'], message: 'Organizer chỉ dùng user hoặc person, không dùng cả hai.' })
})
const eventUpdateSchema = z.object({
  version: z.number().int().min(1),
  sourceParishEventId: nullableId,
  scopeUnitId: nullableId,
  organizerUserId: nullableId,
  organizerPersonId: nullableId,
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  eventType: z.string().trim().min(1).max(80).optional(),
  startsAt: instant.optional(),
  endsAt: instant.optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
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
const reminderSchema = z.object({ taskId: nullableId, eventId: nullableId, recipientUserId: id, triggerAt: instant, kind: z.enum(['TASK_DUE', 'EVENT_START', 'OVERDUE']) }).superRefine((value, ctx) => {
  if ((value.taskId ? 1 : 0) + (value.eventId ? 1 : 0) !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['taskId'], message: 'Reminder phải thuộc đúng một task hoặc event.' })
})
const eventTransitionSchema = z.object({ version: z.number().int().min(1), status: z.enum(['PLANNING', 'READY', 'LIVE', 'COMPLETED', 'CANCELLED']), reason: z.string().trim().max(2000).nullable().optional(), outcomeSummary: z.string().trim().max(5000).nullable().optional(), override: z.boolean().optional().default(false) })
const taskTransitionSchema = z.object({ version: z.number().int().min(1), status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']), completionNote: z.string().trim().max(3000).nullable().optional(), blockedReason: z.string().trim().max(2000).nullable().optional(), cancellationReason: z.string().trim().max(2000).nullable().optional() })
const dependencySchema = z.object({ version: z.number().int().min(1), dependsOnTaskId: id })
const checklistCreateSchema = z.object({ version: z.number().int().min(1), label: z.string().trim().min(1).max(300), isRequired: z.boolean().optional().default(false), sortOrder: z.number().int().min(0).max(10000).optional().default(0) })
const checklistUpdateSchema = z.object({ version: z.number().int().min(1), isDone: z.boolean() })
const commentSchema = z.object({ content: z.string().trim().min(1).max(5000), evidenceUrl: z.string().url().max(2000).refine(value => value.startsWith('https://'), 'Evidence URL phải dùng HTTPS.').nullable().optional() })
const approvalSchema = z.object({ version: z.number().int().min(1), decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().trim().max(2000).nullable().optional() }).superRefine((value, ctx) => {
  if (value.decision === 'REJECTED' && !value.reason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Từ chối duyệt bắt buộc có lý do.' })
})
const memberRemoveSchema = z.object({ version: z.number().int().min(1), memberVersion: z.number().int().min(1), reason: z.string().trim().min(1).max(2000) })
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
async function audit(tx: DbTransaction, user: JwtPayload, c: any, action: string, entityType: string, entityId: string, oldValue?: unknown, newValue?: unknown) {
  await tx.insert(auditLogs).values({ id: generateId('AUD'), userId: user.userId, action, entityType, entityId, oldValue: oldValue === undefined ? null : JSON.stringify(oldValue), newValue: newValue === undefined ? null : JSON.stringify(newValue), ip: getClientIp(c), userAgent: c.req.header('user-agent') || '', parishId: user.parishId })
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
    throw Object.assign(new Error('Task đã kết thúc; không thể thay đổi cấu trúc, phân công hoặc approval.'), { status: 409, code: 'TASK_IMMUTABLE' })
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
async function readiness(tx: DbTransaction, parishId: string, eventId: string) {
  const workstreams = await tx.select({ id: operationWorkstreams.id, name: operationWorkstreams.name, status: operationWorkstreams.status, isRequired: operationWorkstreams.isRequired }).from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, parishId), eq(operationWorkstreams.operationEventId, eventId), isNull(operationWorkstreams.deletedAt)))
  const tasks = await tx.select({ id: operationTasks.id, title: operationTasks.title, status: operationTasks.status, isRequired: operationTasks.isRequired, dueAt: operationTasks.dueAt }).from(operationTasks).where(and(eq(operationTasks.parishId, parishId), eq(operationTasks.operationEventId, eventId), isNull(operationTasks.deletedAt)))
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
  for (const task of requiredTasks.filter(item => item.status !== 'DONE')) blockers.push({ type: 'TASK_NOT_DONE', id: task.id, label: task.title })
  for (const task of requiredTasks) {
    if (!ownerTaskIds.has(task.id)) blockers.push({ type: 'TASK_OWNER_MISSING', id: task.id, label: task.title })
    if (task.dueAt && task.dueAt < now && task.status !== 'DONE' && task.status !== 'CANCELLED') blockers.push({ type: 'TASK_OVERDUE', id: task.id, label: task.title })
    if (blockedDependencyTaskIds.has(task.id)) blockers.push({ type: 'TASK_DEPENDENCY_BLOCKED', id: task.id, label: task.title })
    blockers.push(...(incompleteByTask.get(task.id) ?? []).map(item => ({ type: 'CHECKLIST_NOT_DONE', id: item.id, label: item.label })))
  }
  const required = workstreams.filter(item => item.isRequired).length + tasks.filter(item => item.isRequired).length
  const done = workstreams.filter(item => item.isRequired && item.status === 'READY').length + tasks.filter(item => item.isRequired && item.status === 'DONE').length
  return { percent: required === 0 ? 100 : Math.round((done / required) * 100), blockers }
}

operationsRouter.get('/permissions', async c => {
  const user = actor(c)
  const scope = { parishId: user.parishId, resourceUnitId: c.req.query('unitId') || null, eventId: c.req.query('eventId') || null, workstreamId: c.req.query('workstreamId') || null, taskId: c.req.query('taskId') || null }
  return successResponse(c, { parishId: user.parishId, permissions: await getOperationsCallerPermissions(user, scope) })
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

operationsRouter.get('/events', async c => {
  const user = actor(c)
  try {
    const { page, limit, offset } = listPagination(c)
    const rows = await db.select().from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), isNull(operationEvents.deletedAt))).orderBy(desc(operationEvents.startsAt))
    const decisions = await resolveOperationsAuthorizationBatch(user, 'operations.event.view', rows.map(row => ({
      parishId: row.parishId,
      event: { id: row.id, scopeUnitId: row.scopeUnitId, organizerUserId: row.organizerUserId, organizerPersonId: row.organizerPersonId },
      resourceUnitId: row.scopeUnitId,
    })))
    const visible = rows.filter((_, index) => decisions[index]?.allowed)
    return paginatedResponse(c, visible.slice(offset, offset + limit), { page, limit, total: visible.length })
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/events', zValidator('json', eventCreateSchema), async c => {
  const user = actor(c); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.create', body, async tx => {
      await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: body.scopeUnitId }, tx)
      await assertScopeUnit(tx, user.parishId, body.scopeUnitId)
      if (body.sourceParishEventId) {
        const [source] = await tx.select({ id: parishEvents.id }).from(parishEvents).where(and(eq(parishEvents.parishId, user.parishId), eq(parishEvents.id, body.sourceParishEventId), isNull(parishEvents.deletedAt))).limit(1)
        if (!source) throw Object.assign(new Error('Không tìm thấy parish event nguồn.'), { status: 404 })
      }
      await assertTarget(tx, user.parishId, body.organizerUserId, body.organizerPersonId, true)
      const now = new Date().toISOString()
      const row = { id: generateId('OPS'), parishId: user.parishId, sourceParishEventId: body.sourceParishEventId ?? null, scopeUnitId: body.scopeUnitId ?? null, title: body.title, description: body.description ?? null, eventType: body.eventType, startsAt: body.startsAt, endsAt: body.endsAt, timezone: body.timezone, location: body.location ?? null, status: 'DRAFT' as const, visibility: body.visibility, organizerPersonId: body.organizerPersonId ?? null, organizerUserId: body.organizerUserId ?? null, expectedHeadcount: body.expectedHeadcount ?? null, outcomeSummary: null, version: 1, createdBy: user.userId, updatedBy: user.userId, createdAt: now, updatedAt: now, deletedAt: null }
      await tx.insert(operationEvents).values(row); await audit(tx, user, c, 'CREATE', 'operation_event', row.id, undefined, row); return row
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
      const nextScopeUnitId = body.scopeUnitId === undefined ? existing.scopeUnitId : body.scopeUnitId
      const nextOrganizerUserId = body.organizerUserId === undefined ? existing.organizerUserId : body.organizerUserId
      const nextOrganizerPersonId = body.organizerPersonId === undefined ? existing.organizerPersonId : body.organizerPersonId
      const changesAuthorityBoundary =
        (body.scopeUnitId !== undefined && body.scopeUnitId !== existing.scopeUnitId)
        || (body.organizerUserId !== undefined && body.organizerUserId !== existing.organizerUserId)
        || (body.organizerPersonId !== undefined && body.organizerPersonId !== existing.organizerPersonId)
        || (body.sourceParishEventId !== undefined && body.sourceParishEventId !== existing.sourceParishEventId)
        || (body.visibility !== undefined && body.visibility !== existing.visibility)
      if (changesAuthorityBoundary) {
        await assertOperationsCapability(user, 'operations.event.create', { parishId: user.parishId, resourceUnitId: nextScopeUnitId }, tx)
      }
      if (nextOrganizerUserId && nextOrganizerPersonId) throw Object.assign(new Error('Organizer chỉ dùng user hoặc person, không dùng cả hai.'), { status: 400 })
      const startsAt = body.startsAt ?? existing.startsAt; const endsAt = body.endsAt ?? existing.endsAt
      const visibility = body.visibility ?? existing.visibility; const sourceId = body.sourceParishEventId === undefined ? existing.sourceParishEventId : body.sourceParishEventId
      if (endsAt <= startsAt) throw Object.assign(new Error('Thời gian kết thúc phải sau thời gian bắt đầu.'), { status: 400 })
      if (visibility === 'PUBLIC_SUMMARY' && !sourceId) throw Object.assign(new Error('PUBLIC_SUMMARY phải liên kết một parish event.'), { status: 400 })
      await assertScopeUnit(tx, user.parishId, body.scopeUnitId)
      await assertTarget(tx, user.parishId, body.organizerUserId, body.organizerPersonId, true)
      const updates: any = { updatedAt: new Date().toISOString(), updatedBy: user.userId, version: existing.version + 1 }
      for (const field of ['sourceParishEventId', 'scopeUnitId', 'organizerUserId', 'organizerPersonId', 'title', 'description', 'eventType', 'startsAt', 'endsAt', 'timezone', 'location', 'visibility', 'expectedHeadcount'] as const) if (body[field] !== undefined) updates[field] = body[field]
      const [changed] = await tx.update(operationEvents).set(updates).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), eq(operationEvents.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', existing)
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
    const [workstreams, tasks, participants, assignees] = await Promise.all([
      db.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.operationEventId, eventId), isNull(operationWorkstreams.deletedAt))).orderBy(asc(operationWorkstreams.name)),
      db.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.operationEventId, eventId), isNull(operationTasks.deletedAt))).orderBy(asc(operationTasks.dueAt)),
      db.select().from(operationEventParticipants).where(and(eq(operationEventParticipants.parishId, user.parishId), eq(operationEventParticipants.eventId, eventId))),
      db.select({ assignment: operationTaskAssignees }).from(operationTaskAssignees).innerJoin(operationTasks, and(eq(operationTasks.parishId, operationTaskAssignees.parishId), eq(operationTasks.id, operationTaskAssignees.taskId))).where(and(eq(operationTaskAssignees.parishId, user.parishId), eq(operationTasks.operationEventId, eventId), isNull(operationTaskAssignees.removedAt), isNull(operationTasks.deletedAt))),
    ])
    return successResponse(c, { event, workstreams, tasks, participants, assignees: assignees.map(row => row.assignment), readiness: await db.transaction(tx => readiness(tx, user.parishId, eventId)), permissions: await getOperationsCallerPermissions(user, { parishId: user.parishId, eventId }) })
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
  const allowed: Record<string, string[]> = { DRAFT: ['PLANNING', 'CANCELLED'], PLANNING: ['READY', 'CANCELLED'], READY: ['LIVE', 'CANCELLED'], LIVE: ['COMPLETED'], COMPLETED: [], CANCELLED: [] }
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.event.transition', { eventId, ...body }, async tx => {
      const [event] = await tx.select().from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
      if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
      await assertOperationsCapability(user, body.status === 'CANCELLED' ? 'operations.event.cancel' : 'operations.event.transition', { parishId: user.parishId, eventId }, tx)
      if (event.version !== body.version) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      if (!allowed[event.status]?.includes(body.status)) throw Object.assign(new Error(`Không thể chuyển event từ ${event.status} sang ${body.status}.`), { status: 409 })
      if (body.status === 'CANCELLED' && !body.reason) throw Object.assign(new Error('Hủy event bắt buộc có lý do.'), { status: 400 })
      if (body.status === 'COMPLETED' && !body.outcomeSummary) throw Object.assign(new Error('Hoàn tất event bắt buộc có tổng kết kết quả.'), { status: 400 })
      if (body.status === 'COMPLETED') {
        const requiredTasks = await tx.select({ id: operationTasks.id, title: operationTasks.title, status: operationTasks.status }).from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.operationEventId, eventId), eq(operationTasks.isRequired, true), isNull(operationTasks.deletedAt)))
        const unfinished = requiredTasks.filter(task => task.status !== 'DONE')
        if (unfinished.length) throw Object.assign(new Error('Còn nhiệm vụ bắt buộc chưa hoàn tất; chưa thể đóng sự kiện.'), { status: 409, code: 'COMPLETION_BLOCKED', details: unfinished.map(task => ({ type: 'TASK_INCOMPLETE', id: task.id, label: task.title })) })
      }
      const state = await readiness(tx, user.parishId, eventId)
      const requiresReadiness = body.status === 'READY' || body.status === 'LIVE'
      if (requiresReadiness && state.blockers.length && !body.override) throw Object.assign(new Error('Event còn điều kiện readiness chưa hoàn tất.'), { status: 409, code: 'READINESS_BLOCKED', details: state.blockers })
      if (requiresReadiness && state.blockers.length && body.override) {
        await assertOperationsCapability(user, 'operations.event.override_readiness', { parishId: user.parishId, eventId }, tx)
        if (!body.reason) throw Object.assign(new Error('Override readiness bắt buộc có lý do.'), { status: 400 })
      }
      const now = new Date().toISOString()
      const [changed] = await tx.update(operationEvents).set({ status: body.status, outcomeSummary: body.outcomeSummary ?? event.outcomeSummary, version: event.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), eq(operationEvents.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Operation event đã bị thay đổi bởi người khác.', event)
      if (body.status === 'COMPLETED' && event.sourceParishEventId) {
        // `parish_records.source_event_id` is a soft, non-unique calendar link,
        // not an Operations ownership key. Never overwrite an arbitrary Parish
        // Memory record that happens to reference the same public event.
        await tx.insert(parishRecords).values({ id: generateId('PRC'), parishId: user.parishId, recordType: 'ACTIVITY', title: event.title, summary: body.outcomeSummary, content: null, occurredOn: event.startsAt.slice(0, 10), endedOn: event.endsAt.slice(0, 10), location: event.location, status: 'DRAFT', visibility: 'STAFF', showOnTimeline: true, sourceEventId: event.sourceParishEventId, createdBy: user.userId, updatedBy: user.userId, publishedBy: null, publishedAt: null, createdAt: now, updatedAt: now, deletedAt: null })
      }
      await audit(tx, user, c, 'TRANSITION', 'operation_event', eventId, { status: event.status, version: event.version }, { status: body.status, version: changed.version, reason: body.reason, override: body.override }); return changed
    })
    return commandResponse(c, result)
  } catch (error: any) {
    if (error?.code === 'READINESS_BLOCKED') return sendError(c, 'READINESS_BLOCKED', error.message, 409, error.details)
    return handleError(c, error)
  }
})

operationsRouter.post('/blockouts', zValidator('json', blockoutSchema), async c => {
  const user = actor(c); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.blockout.create', body, async tx => {
      const [selfPerson] = await tx.select({ id: parishPeople.id }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), isNull(parishPeople.deletedAt))).limit(1)
      const targetsSelf = body.userId === user.userId || Boolean(body.personId && selfPerson && body.personId === selfPerson.id)
      if (user.role !== 'admin' && !targetsSelf) throw Object.assign(new Error('Chỉ được tạo blockout cho chính mình.'), { status: 403 })
      await assertTarget(tx, user.parishId, body.userId, body.personId, true)
      const row = { parishId: user.parishId, id: generateId('OPS'), userId: body.userId ?? null, personId: body.personId ?? null, startsAt: body.startsAt, endsAt: body.endsAt, reason: body.reason ?? null, createdBy: user.userId, createdAt: new Date().toISOString(), deletedAt: null }
      await tx.insert(operationBlockouts).values(row); await audit(tx, user, c, 'CREATE', 'operation_blockout', row.id, undefined, { userId: row.userId, personId: row.personId, startsAt: row.startsAt, endsAt: row.endsAt }); return row
    })
    return commandResponse(c, result, true)
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
        triggerAt: operationReminders.triggerAt,
        kind: operationReminders.kind,
        status: operationReminders.status,
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
      const row = { parishId: user.parishId, id: generateId('OPR'), taskId: body.taskId ?? null, eventId: body.eventId ?? null, recipientUserId: body.recipientUserId, triggerAt: body.triggerAt, kind: body.kind, dedupeKey, status: 'PENDING' as const, readAt: null, attemptCount: 0, enqueuedAt: null, leaseExpiresAt: null, nextAttemptAt: null, notificationId: null, sentAt: null, error: null, createdAt: new Date().toISOString() }
      await tx.insert(operationReminders).values(row); await audit(tx, user, c, 'CREATE', 'operation_reminder', row.id, undefined, { taskId: row.taskId, eventId: row.eventId, recipientUserId: row.recipientUserId, triggerAt: row.triggerAt, kind: row.kind }); return row
    })
    return commandResponse(c, result, true)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/reminders/:id/cancel', zValidator('json', z.object({ reason: z.string().trim().min(1).max(2000) })), async c => {
  const user = actor(c); const reminderId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.reminder.cancel', { reminderId, ...body }, async tx => {
      const [row] = await tx.select().from(operationReminders).where(and(eq(operationReminders.parishId, user.parishId), eq(operationReminders.id, reminderId))).limit(1)
      if (!row) throw Object.assign(new Error('Không tìm thấy lịch nhắc.'), { status: 404 })
      if (row.recipientUserId !== user.userId) await assertOperationsCapability(user, row.taskId ? 'operations.task.assign' : 'operations.event.manage', { parishId: user.parishId, taskId: row.taskId, eventId: row.eventId }, tx)
      if (row.status !== 'PENDING') throw Object.assign(new Error('Chỉ hủy được lịch đang chờ; lịch đã chuyển sang bộ gửi không thể thu hồi tại đây.'), { status: 409 })
      const [changed] = await tx.update(operationReminders).set({ status: 'CANCELLED', nextAttemptAt: null, leaseExpiresAt: null }).where(and(eq(operationReminders.parishId, user.parishId), eq(operationReminders.id, reminderId), eq(operationReminders.status, 'PENDING'))).returning({ id: operationReminders.id, parishId: operationReminders.parishId, status: operationReminders.status })
      if (!changed) throw Object.assign(new Error('Lịch nhắc đã thay đổi. Hãy tải lại.'), { status: 409 })
      await audit(tx, user, c, 'CANCEL', 'operation_reminder', reminderId, { status: row.status }, { status: changed.status, reason: body.reason })
      return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/reminders/:id/read', async c => {
  const user = actor(c); const reminderId = c.req.param('id')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.reminder.read', { reminderId }, async tx => {
      const [row] = await tx.select().from(operationReminders).where(and(eq(operationReminders.parishId, user.parishId), eq(operationReminders.id, reminderId), eq(operationReminders.recipientUserId, user.userId))).limit(1)
      if (!row) throw Object.assign(new Error('Không tìm thấy reminder.'), { status: 404 })
      const readAt = row.readAt ?? new Date().toISOString(); await tx.update(operationReminders).set({ readAt }).where(and(eq(operationReminders.parishId, user.parishId), eq(operationReminders.id, reminderId))); return { id: reminderId, readAt }
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.get('/workstreams', async c => {
  const user = actor(c); const eventId = c.req.query('eventId') || null
  try {
    const { page, limit, offset } = listPagination(c)
    const [rows, eventRows] = await Promise.all([
      db.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eventId ? eq(operationWorkstreams.operationEventId, eventId) : undefined, isNull(operationWorkstreams.deletedAt))).orderBy(operationWorkstreams.name),
      db.select({ id: operationEvents.id, scopeUnitId: operationEvents.scopeUnitId, organizerUserId: operationEvents.organizerUserId, organizerPersonId: operationEvents.organizerPersonId }).from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), isNull(operationEvents.deletedAt))),
    ])
    const eventsById = new Map(eventRows.map(row => [row.id, row]))
    const decisions = await resolveOperationsAuthorizationBatch(user, 'operations.task.view', rows.map(row => {
      const event = row.operationEventId ? eventsById.get(row.operationEventId) : undefined
      return {
        parishId: row.parishId,
        workstream: { id: row.id, sourceUnitId: row.sourceUnitId, operationEventId: row.operationEventId },
        event,
        resourceUnitId: row.sourceUnitId ?? event?.scopeUnitId ?? null,
      }
    }))
    const visible = rows.filter((_, index) => decisions[index]?.allowed)
    return paginatedResponse(c, visible.slice(offset, offset + limit), { page, limit, total: visible.length })
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
      let event: { id: string; scopeUnitId: string | null; status: string } | undefined
      if (body.eventId) {
        ;[event] = await tx.select({ id: operationEvents.id, scopeUnitId: operationEvents.scopeUnitId, status: operationEvents.status }).from(operationEvents).where(and(
          eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, body.eventId), isNull(operationEvents.deletedAt),
        )).limit(1)
        if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
        if (event.status === 'COMPLETED' || event.status === 'CANCELLED') throw Object.assign(new Error('Event đã kết thúc; không thể thêm workstream.'), { status: 409, code: 'EVENT_IMMUTABLE' })
      }
      await assertOperationsCapability(user, 'operations.workstream.create', { parishId: user.parishId, eventId: body.eventId, resourceUnitId: body.sourceUnitId }, tx)
      if (body.sourceUnitId && event && body.sourceUnitId !== event.scopeUnitId) {
        // An event-local organizer may structure work inside the event scope,
        // but cannot use that role to publish authority into another unit.
        await assertOperationsCapability(user, 'operations.workstream.create', { parishId: user.parishId, resourceUnitId: body.sourceUnitId }, tx)
      }
      await assertScopeUnit(tx, user.parishId, body.sourceUnitId)
      const now = new Date().toISOString(); const row = { id: generateId('WS'), parishId: user.parishId, operationEventId: body.eventId ?? null, sourceUnitId: body.sourceUnitId ?? null, name: body.name, description: body.description ?? null, status: 'PLANNING' as const, blockedReason: null, isRequired: body.isRequired, leaderPersonId: null, leaderUserId: null, version: 1, createdBy: user.userId, updatedBy: user.userId, createdAt: now, updatedAt: now, deletedAt: null }
      await tx.insert(operationWorkstreams).values(row); await audit(tx, user, c, 'CREATE', 'operation_workstream', row.id, undefined, row); return row
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

operationsRouter.post('/workstreams/:id/members', zValidator('json', workstreamMemberSchema), async c => {
  const user = actor(c); const workstreamId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.workstream.member.add', { workstreamId, ...body }, async tx => {
      await assertOperationsCapability(user, body.operationRole === 'WORKSTREAM_LEAD' ? 'operations.workstream.assign_lead' : 'operations.workstream.manage', { parishId: user.parishId, workstreamId }, tx)
      const [workstream] = await tx.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), isNull(operationWorkstreams.deletedAt))).limit(1)
      if (!workstream) throw Object.assign(new Error('Không tìm thấy workstream.'), { status: 404 })
      if (workstream.version !== body.version) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', workstream)
      await assertWorkstreamEventAcceptsMutation(tx, user.parishId, workstream.operationEventId, 'thêm thành viên workstream')
      if (body.startsAt && body.endsAt && body.endsAt <= body.startsAt) throw Object.assign(new Error('Thời hạn role không hợp lệ.'), { status: 400 })
      await assertTarget(tx, user.parishId, body.userId, body.personId, true)
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
      await assertOperationsCapability(user, 'operations.workstream.manage', { parishId: user.parishId, workstreamId }, tx)
      const [[workstream], [member]] = await Promise.all([
        tx.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), eq(operationWorkstreams.id, workstreamId), isNull(operationWorkstreams.deletedAt))).limit(1),
        tx.select().from(operationWorkstreamMembers).where(and(eq(operationWorkstreamMembers.parishId, user.parishId), eq(operationWorkstreamMembers.workstreamId, workstreamId), eq(operationWorkstreamMembers.id, memberId), isNull(operationWorkstreamMembers.removedAt))).limit(1),
      ])
      if (!workstream || !member) throw Object.assign(new Error('Không tìm thấy workstream membership đang hoạt động.'), { status: 404 })
      if (workstream.version !== body.version) throw new VersionConflictError('Workstream đã bị thay đổi bởi người khác.', workstream)
      if (member.version !== body.memberVersion) throw new VersionConflictError('Workstream membership đã bị thay đổi bởi người khác.', member)
      await assertWorkstreamEventAcceptsMutation(tx, user.parishId, workstream.operationEventId, 'gỡ thành viên workstream')
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
  const user = actor(c); const mine = c.req.query('mine') === 'true'; const eventId = c.req.query('eventId'); const status = c.req.query('status'); const overdue = c.req.query('overdue') === 'true'
  try {
    const { page, limit, offset } = listPagination(c)
    const rows = await db.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eventId ? eq(operationTasks.operationEventId, eventId) : undefined, status ? eq(operationTasks.status, status as any) : undefined, overdue ? and(lte(operationTasks.dueAt, new Date().toISOString()), notInArray(operationTasks.status, ['DONE', 'CANCELLED'])) : undefined, isNull(operationTasks.deletedAt))).orderBy(asc(operationTasks.dueAt), desc(operationTasks.createdAt))
    const [workstreamRows, eventRows, personRows] = await Promise.all([
      db.select({ id: operationWorkstreams.id, sourceUnitId: operationWorkstreams.sourceUnitId, operationEventId: operationWorkstreams.operationEventId }).from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, user.parishId), isNull(operationWorkstreams.deletedAt))),
      db.select({ id: operationEvents.id, scopeUnitId: operationEvents.scopeUnitId, organizerUserId: operationEvents.organizerUserId, organizerPersonId: operationEvents.organizerPersonId }).from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), isNull(operationEvents.deletedAt))),
      mine ? db.select({ id: parishPeople.id }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, user.userId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1) : Promise.resolve([]),
    ])
    const workstreamsById = new Map(workstreamRows.map(row => [row.id, row]))
    const eventsById = new Map(eventRows.map(row => [row.id, row]))
    const resources = rows.map(row => {
      const workstream = row.workstreamId ? workstreamsById.get(row.workstreamId) : undefined
      const resolvedEventId = row.operationEventId ?? workstream?.operationEventId ?? null
      const event = resolvedEventId ? eventsById.get(resolvedEventId) : undefined
      return {
        parishId: row.parishId,
        task: { id: row.id, workstreamId: row.workstreamId, operationEventId: row.operationEventId },
        workstream,
        event,
        resourceUnitId: workstream?.sourceUnitId ?? event?.scopeUnitId ?? null,
      }
    })
    const decisions = await resolveOperationsAuthorizationBatch(user, 'operations.task.view', resources)
    const approvalQueue = c.req.query('queue') === 'approval'
    const approvalDecisions = approvalQueue ? await resolveOperationsAuthorizationBatch(user, 'operations.task.approve', resources) : []
    const selfPerson = personRows[0]
    const myAssignmentRows = mine ? await db.select().from(operationTaskAssignees).where(and(
      eq(operationTaskAssignees.parishId, user.parishId),
      isNull(operationTaskAssignees.removedAt),
      selfPerson ? or(eq(operationTaskAssignees.userId, user.userId), eq(operationTaskAssignees.personId, selfPerson.id)) : eq(operationTaskAssignees.userId, user.userId),
    )) : []
    const assignmentsByTask = new Map<string, Array<typeof operationTaskAssignees.$inferSelect>>()
    for (const assignment of myAssignmentRows) assignmentsByTask.set(assignment.taskId, [...(assignmentsByTask.get(assignment.taskId) ?? []), assignment])
    const visible: Array<typeof rows[number] & { myAssignments?: Array<typeof operationTaskAssignees.$inferSelect> }> = []
    rows.forEach((row, index) => {
      const decision = decisions[index]
      if (!decision?.allowed) return
      if (approvalQueue) {
        if (approvalDecisions[index]?.allowed && row.approvalStatus === 'PENDING' && row.status !== 'DONE' && row.status !== 'CANCELLED') visible.push(row)
        return
      }
      if (!mine) visible.push(row)
      else if (decision.operationRoles.some(role => role.startsWith('TASK_'))) visible.push({ ...row, myAssignments: assignmentsByTask.get(row.id) ?? [] })
    })
    return paginatedResponse(c, visible.slice(offset, offset + limit), { page, limit, total: visible.length })
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
      await assertOperationsCapability(user, 'operations.task.create', { parishId: user.parishId, eventId, workstreamId: body.workstreamId, resourceUnitId: workstream?.sourceUnitId }, tx)
      if (eventId) {
        const [event] = await tx.select({ id: operationEvents.id, status: operationEvents.status }).from(operationEvents).where(and(eq(operationEvents.parishId, user.parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
        if (!event) throw Object.assign(new Error('Không tìm thấy operation event.'), { status: 404 })
        if (event.status === 'COMPLETED' || event.status === 'CANCELLED') throw Object.assign(new Error('Event đã kết thúc; không thể thêm task.'), { status: 409, code: 'EVENT_IMMUTABLE' })
      }
      if (body.parentTaskId) {
        const [parent] = await tx.select({ operationEventId: operationTasks.operationEventId, workstreamId: operationTasks.workstreamId }).from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, body.parentTaskId), isNull(operationTasks.deletedAt))).limit(1)
        if (!parent || parent.operationEventId !== eventId || parent.workstreamId !== (body.workstreamId ?? null)) throw Object.assign(new Error('Task cha phải thuộc cùng event và workstream.'), { status: 400 })
      }
      const now = new Date().toISOString(); const row = { id: generateId('TSK'), parishId: user.parishId, operationEventId: eventId, workstreamId: body.workstreamId ?? null, parentTaskId: body.parentTaskId ?? null, title: body.title, description: body.description ?? null, status: 'TODO' as const, priority: body.priority, isRequired: body.isRequired, dueAt: body.dueAt ?? null, startedAt: null, completedAt: null, completionNote: null, blockedReason: null, approvalStatus: body.requiresApproval ? 'PENDING' as const : 'NOT_REQUIRED' as const, approvedBy: null, approvedAt: null, version: 1, createdBy: user.userId, updatedBy: user.userId, completedBy: null, createdAt: now, updatedAt: now, deletedAt: null }
      await tx.insert(operationTasks).values(row); await audit(tx, user, c, 'CREATE', 'operation_task', row.id, undefined, row); return row
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
      db.select().from(operationTaskDependencies).where(and(eq(operationTaskDependencies.parishId, user.parishId), eq(operationTaskDependencies.taskId, taskId))),
    ])
    return successResponse(c, { task, assignees, checklist, comments, dependencies, permissions: await getOperationsCallerPermissions(user, { parishId: user.parishId, taskId }) })
  } catch (error) { return handleError(c, error) }
})

function invalidateTaskApproval(task: { approvalStatus: string }) {
  return task.approvalStatus === 'NOT_REQUIRED' ? {} : { approvalStatus: 'PENDING' as const, approvedBy: null, approvedAt: null }
}

operationsRouter.put('/tasks/:id', zValidator('json', taskUpdateSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.update', { taskId, ...body }, async tx => {
      const [existing] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      if (!existing) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.task.manage', { parishId: user.parishId, taskId }, tx)
      if (existing.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', existing)
      assertTaskMutable(existing)
      const updates: any = { version: existing.version + 1, updatedBy: user.userId, updatedAt: new Date().toISOString() }
      for (const field of ['title', 'description', 'priority', 'dueAt', 'isRequired'] as const) if (body[field] !== undefined) updates[field] = body[field]
      if ((['title', 'description', 'isRequired'] as const).some(field => body[field] !== undefined && body[field] !== existing[field])) Object.assign(updates, invalidateTaskApproval(existing))
      const [changed] = await tx.update(operationTasks).set(updates).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', existing)
      await audit(tx, user, c, 'UPDATE', 'operation_task', taskId, existing, changed); return changed
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
      const linkedPeople = await tx.select({ id: parishPeople.id, linkedUserId: parishPeople.linkedUserId }).from(parishPeople).where(and(
        eq(parishPeople.parishId, user.parishId), isNull(parishPeople.deletedAt),
        body.personId ? eq(parishPeople.id, body.personId) : eq(parishPeople.linkedUserId, body.userId!),
      ))
      const targetUserId = body.userId ?? linkedPeople[0]?.linkedUserId
      const targetPersonIds = linkedPeople.map(person => person.id)
      const conflictWarnings = task.dueAt && (targetUserId || targetPersonIds.length > 0) ? await tx.select({ id: operationBlockouts.id, startsAt: operationBlockouts.startsAt, endsAt: operationBlockouts.endsAt }).from(operationBlockouts).where(and(
        eq(operationBlockouts.parishId, user.parishId),
        or(targetUserId ? eq(operationBlockouts.userId, targetUserId) : undefined, targetPersonIds.length ? inArray(operationBlockouts.personId, targetPersonIds) : undefined),
        isNull(operationBlockouts.deletedAt), lte(operationBlockouts.startsAt, task.dueAt), gte(operationBlockouts.endsAt, task.dueAt),
      )) : []
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
      const targetPeople = nextUserId ? await tx.select({ id: parishPeople.id }).from(parishPeople).where(and(eq(parishPeople.parishId, user.parishId), eq(parishPeople.linkedUserId, nextUserId), isNull(parishPeople.deletedAt))) : []
      const targetIds = [...new Set([...targetPeople.map(person => person.id), ...(body.personId ? [body.personId] : [])])]
      const conflictWarnings = task.dueAt && (nextUserId || targetIds.length) ? await tx.select({ id: operationBlockouts.id, startsAt: operationBlockouts.startsAt, endsAt: operationBlockouts.endsAt }).from(operationBlockouts).where(and(
        eq(operationBlockouts.parishId, user.parishId), isNull(operationBlockouts.deletedAt),
        or(nextUserId ? eq(operationBlockouts.userId, nextUserId) : undefined, targetIds.length ? inArray(operationBlockouts.personId, targetIds) : undefined),
        lte(operationBlockouts.startsAt, task.dueAt), gte(operationBlockouts.endsAt, task.dueAt),
      )) : []
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
      const [changed] = await tx.update(operationTasks).set({ ...(body.isRequired ? invalidateTaskApproval(task) : {}), version: task.version + 1, updatedBy: user.userId, updatedAt: new Date().toISOString() }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning({ version: operationTasks.version, approvalStatus: operationTasks.approvalStatus })
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'CHECKLIST_ADD', 'operation_task', taskId, { approvalStatus: task.approvalStatus }, { checklistId: row.id, label: row.label, isRequired: row.isRequired, approvalStatus: changed.approvalStatus }); return { item: row, taskVersion: changed.version, approvalStatus: changed.approvalStatus }
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
      const now = new Date().toISOString(); const [item] = await tx.update(operationChecklistItems).set({ isDone: body.isDone, completedBy: body.isDone ? user.userId : null, completedAt: body.isDone ? now : null }).where(and(eq(operationChecklistItems.parishId, user.parishId), eq(operationChecklistItems.taskId, taskId), eq(operationChecklistItems.id, itemId))).returning()
      if (!item) throw Object.assign(new Error('Không tìm thấy checklist item.'), { status: 404 })
      const [changed] = await tx.update(operationTasks).set({ ...(previousItem.isRequired && previousItem.isDone !== body.isDone ? invalidateTaskApproval(task) : {}), version: task.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning({ version: operationTasks.version, approvalStatus: operationTasks.approvalStatus })
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'CHECKLIST_UPDATE', 'operation_task', taskId, { isDone: previousItem.isDone, approvalStatus: task.approvalStatus }, { checklistId: itemId, isDone: body.isDone, approvalStatus: changed.approvalStatus }); return { item, taskVersion: changed.version, approvalStatus: changed.approvalStatus }
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
      const [task, dependency] = await Promise.all([
        tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1),
        tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, body.dependsOnTaskId), isNull(operationTasks.deletedAt))).limit(1),
      ])
      if (!task[0] || !dependency[0] || task[0].operationEventId !== dependency[0].operationEventId) throw Object.assign(new Error('Dependency phải thuộc cùng operation event.'), { status: 400 })
      if (task[0].version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task[0])
      assertTaskMutable(task[0])
      const edges = await tx.select().from(operationTaskDependencies).where(eq(operationTaskDependencies.parishId, user.parishId))
      const graph = new Map<string, string[]>(); for (const edge of edges) graph.set(edge.taskId, [...(graph.get(edge.taskId) ?? []), edge.dependsOnTaskId])
      graph.set(taskId, [...(graph.get(taskId) ?? []), body.dependsOnTaskId])
      const pending = [body.dependsOnTaskId]; const seen = new Set<string>()
      while (pending.length) { const current = pending.shift()!; if (current === taskId) throw Object.assign(new Error('Dependency tạo chu trình.'), { status: 409 }); if (seen.has(current)) continue; seen.add(current); pending.push(...(graph.get(current) ?? [])) }
      const row = { parishId: user.parishId, taskId, dependsOnTaskId: body.dependsOnTaskId, dependencyType: 'BLOCKED_BY' as const }; await tx.insert(operationTaskDependencies).values(row)
      const [changed] = await tx.update(operationTasks).set({ ...invalidateTaskApproval(task[0]), version: task[0].version + 1, updatedBy: user.userId, updatedAt: new Date().toISOString() }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning({ version: operationTasks.version })
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task[0])
      await audit(tx, user, c, 'DEPENDENCY_ADD', 'operation_task', taskId, undefined, row); return { ...row, taskVersion: changed.version }
    })
    return commandResponse(c, result, true)
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
        if (task.approvalStatus !== 'NOT_REQUIRED' && task.approvalStatus !== 'APPROVED') throw Object.assign(new Error('Task chưa được duyệt.'), { status: 409 })
      }
      const now = new Date().toISOString(); const [changed] = await tx.update(operationTasks).set({ status: body.status, completionNote: body.completionNote ?? task.completionNote, blockedReason: body.status === 'BLOCKED' ? body.blockedReason : null, cancellationReason: body.status === 'CANCELLED' ? body.cancellationReason : null, startedAt: body.status === 'IN_PROGRESS' ? (task.startedAt ?? now) : task.startedAt, completedAt: body.status === 'DONE' ? now : null, completedBy: body.status === 'DONE' ? user.userId : null, version: task.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'TRANSITION', 'operation_task', taskId, { status: task.status, version: task.version }, { status: body.status, version: changed.version, blockedReason: body.blockedReason, cancellationReason: body.cancellationReason }); return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

operationsRouter.post('/tasks/:id/approve', zValidator('json', approvalSchema), async c => {
  const user = actor(c); const taskId = c.req.param('id'); const body = c.req.valid('json')
  try {
    const result = await runIdempotentOperationsCommand(user, key(c), 'operations.task.approve', { taskId, ...body }, async tx => {
      const [task] = await tx.select().from(operationTasks).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt))).limit(1)
      if (!task) throw Object.assign(new Error('Không tìm thấy task.'), { status: 404 })
      await assertOperationsCapability(user, 'operations.task.approve', { parishId: user.parishId, taskId }, tx)
      if (task.version !== body.version) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      assertTaskMutable(task)
      if (task.approvalStatus === 'NOT_REQUIRED') throw Object.assign(new Error('Task không yêu cầu approval.'), { status: 409 })
      const now = new Date().toISOString(); const [changed] = await tx.update(operationTasks).set({ approvalStatus: body.decision, approvedBy: body.decision === 'APPROVED' ? user.userId : null, approvedAt: body.decision === 'APPROVED' ? now : null, version: task.version + 1, updatedBy: user.userId, updatedAt: now }).where(and(eq(operationTasks.parishId, user.parishId), eq(operationTasks.id, taskId), eq(operationTasks.version, body.version))).returning()
      if (!changed) throw new VersionConflictError('Task đã bị thay đổi bởi người khác.', task)
      await audit(tx, user, c, 'APPROVE', 'operation_task', taskId, { approvalStatus: task.approvalStatus }, { approvalStatus: body.decision, reason: body.reason }); return changed
    })
    return commandResponse(c, result)
  } catch (error) { return handleError(c, error) }
})

export default operationsRouter
