import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import type { DbExecutor } from '../db/transactions.js'
import {
  operationEvents,
  operationTaskAssignees,
  operationTasks,
  operationWorkstreamMembers,
  operationWorkstreams,
  parishOrganizationUnits,
  parishPeople,
  parishServiceTerms,
  users,
} from '../db/schema.js'
import type { ActorContext } from '../types/actor.js'
import { isOperationsAdminMutationOverrideEnabled } from '../utils/operationsAdminOverride.js'
import { parishCalendarDate } from '../utils/parishTimeZone.js'

export type OperationsCapability =
  | 'operations.event.view'
  | 'operations.event.create'
  | 'operations.event.manage'
  | 'operations.event.transition'
  | 'operations.event.cancel'
  | 'operations.event.override_readiness'
  | 'operations.event.publish_public'
  | 'operations.task.view'
  | 'operations.task.create'
  | 'operations.task.manage'
  | 'operations.task.assign'
  | 'operations.task.execute'
  | 'operations.task.reassign'
  | 'operations.task.comment'
  | 'operations.workstream.create'
  | 'operations.workstream.manage'
  | 'operations.workstream.assign_lead'
  | 'operations.workstream.mark_ready'

export type OperationsScope = {
  parishId: string
  resourceUnitId?: string | null
  eventId?: string | null
  workstreamId?: string | null
  taskId?: string | null
}

export type OperationsDecision = {
  allowed: boolean
  reason: 'ALLOWED' | 'ADMIN_OVERRIDE' | 'ACCOUNT_ROLE' | 'POSITION_SCOPE' | 'OPERATION_ROLE' | 'RESOURCE_NOT_FOUND'
  positionTitles: string[]
  unitIds: string[]
  operationRoles: string[]
}

export type OperationsAuthorizationResource = {
  parishId: string
  task?: { id: string; workstreamId: string | null; operationEventId: string | null; scopeUnitId?: string | null }
  workstream?: { id: string; sourceUnitId: string | null; operationEventId: string | null }
  event?: { id: string; scopeUnitId: string | null; eventScopeType?: string | null; organizerUserId: string | null; organizerPersonId: string | null; status: string; createdBy: string }
  /**
   * U-21: id các Mảng đang hoạt động của `event`, chỉ set khi resource được xét ở
   * cấp event (không có `workstream`/`task`). Cần để nhận ra Field Lead của event —
   * ở cấp event, `snapshot.workstreamRoles` không tự đối chiếu được với event nào.
   */
  eventWorkstreamIds?: string[]
  resourceUnitId: string | null
}

export type OperationsCandidate = {
  parishId: string
  personId: string | null
  userId: string | null
  displayName: string
  eligibility: 'ACTIONABLE' | 'PLANNING_ONLY' | 'INELIGIBLE'
  inResourceScope: boolean | null
}

type OperationsAuthorizationSnapshot = {
  personId: string | null
  currentTerms: Array<{ positionTitle: string; positionCode: string | null; unitId: string | null }>
  units: Array<{ id: string; parentId: string | null; unitType: string }>
  workstreamRoles: Map<string, string[]>
  taskAssignments: Map<string, Array<{ role: string; acknowledgementStatus: string }>>
}

const STAFF_ROLES = new Set(['admin', 'chunhiem', 'phuta'])

const ADMIN_READ_CAPABILITIES = new Set<OperationsCapability>([
  'operations.event.view', 'operations.task.view',
])
const ADMIN_OVERRIDE_CAPABILITIES = new Set<OperationsCapability>([
  'operations.event.view', 'operations.event.create', 'operations.event.manage', 'operations.event.transition',
  'operations.event.cancel', 'operations.event.override_readiness', 'operations.event.publish_public',
  'operations.task.view', 'operations.task.create',
  'operations.task.manage', 'operations.task.assign', 'operations.task.reassign', 'operations.task.comment',
  'operations.workstream.create', 'operations.workstream.manage', 'operations.workstream.assign_lead',
  'operations.workstream.mark_ready',
])
/**
 * Target Authorization Model (được duyệt):
 * - Trưởng/Phó/Thư ký Xứ đoàn: View toàn xứ, Create Event Xứ đoàn (scope NULL),
 *   Manage chỉ qua resource role, Delegate người (assign/reassign/assign_lead) KHÔNG
 *   qua position scope (Trưởng Xứ đoàn chỉ giữ override khi đồng thời là admin override).
 * - Trưởng Ban/Ngành: đầy đủ trong unit (kể cả delegate trong unit).
 * - Phó Ban/Ngành: giữ create/manage theo policy hiện tại, KHÔNG delegate.
 */
const PARISH_VIEW_CAPABILITIES = new Set<OperationsCapability>([
  'operations.event.view', 'operations.task.view',
])
const UNIT_LEADER_CAPABILITIES = new Set<OperationsCapability>([
  'operations.event.view', 'operations.event.create', 'operations.event.manage', 'operations.task.view',
  'operations.task.create', 'operations.task.manage', 'operations.task.assign', 'operations.task.reassign',
  'operations.task.comment', 'operations.workstream.create', 'operations.workstream.manage',
  'operations.workstream.assign_lead', 'operations.workstream.mark_ready',
])
/**
 * Phó Ban/Ngành: giữ create/manage theo policy hiện tại; U-20 (2026-09-21,
 * product-approved) cho thêm assign/reassign TRONG unit của mình để Phó điều
 * phối được thành viên — target vẫn bị khoá unit/descendants bởi
 * `assertOperationsTargetWithinAuthority`, và Phó vẫn KHÔNG được assign_lead.
 */
const UNIT_DEPUTY_CAPABILITIES = new Set<OperationsCapability>([
  'operations.event.view', 'operations.event.create', 'operations.event.manage', 'operations.task.view',
  'operations.task.create', 'operations.task.manage',
  'operations.task.assign', 'operations.task.reassign',
  'operations.task.comment', 'operations.workstream.create', 'operations.workstream.manage',
  'operations.workstream.mark_ready',
])
const DELEGATE_CAPABILITIES = new Set<OperationsCapability>([
  'operations.task.assign', 'operations.task.reassign', 'operations.workstream.assign_lead',
])

/**
 * U-20 (2026-09-21, product-approved — Gói A): trong event XỨ ĐOÀN, cấu trúc
 * EVENT → MẢNG → TASK là ba tầng trách nhiệm. Việc tạo/sửa task bên trong một
 * Mảng thuộc Ban/Ngành sở hữu Mảng, nên hai capability này bị chốt ở tầng Mảng
 * (xem nhánh chặn trong `decideOperationsAuthorization`) thay vì rơi vào tay
 * người điều phối Mảng.
 */
const FIELD_TASK_LAYER_CAPABILITIES = new Set<OperationsCapability>(['operations.task.create', 'operations.task.manage'])

function deny(reason: OperationsDecision['reason'], positionTitles: string[] = [], unitIds: string[] = [], operationRoles: string[] = []): OperationsDecision {
  return { allowed: false, reason, positionTitles, unitIds, operationRoles }
}

async function loadResource(executor: DbExecutor, parishId: string, scope: OperationsScope): Promise<OperationsAuthorizationResource | null> {
  let task: { id: string; workstreamId: string | null; operationEventId: string | null; scopeUnitId?: string | null } | undefined
  if (scope.taskId) {
    ;[task] = await executor.select({ id: operationTasks.id, workstreamId: operationTasks.workstreamId, operationEventId: operationTasks.operationEventId, scopeUnitId: operationTasks.scopeUnitId })
      .from(operationTasks)
      .where(and(eq(operationTasks.parishId, parishId), eq(operationTasks.id, scope.taskId), isNull(operationTasks.deletedAt))).limit(1)
    if (!task) return null
  }

  if (task && scope.workstreamId && task.workstreamId !== scope.workstreamId) return null
  const workstreamId = scope.workstreamId ?? task?.workstreamId ?? null
  let workstream: { id: string; sourceUnitId: string | null; operationEventId: string | null } | undefined
  if (workstreamId) {
    ;[workstream] = await executor.select({ id: operationWorkstreams.id, sourceUnitId: operationWorkstreams.sourceUnitId, operationEventId: operationWorkstreams.operationEventId })
      .from(operationWorkstreams)
      .where(and(eq(operationWorkstreams.parishId, parishId), eq(operationWorkstreams.id, workstreamId), isNull(operationWorkstreams.deletedAt))).limit(1)
    if (!workstream) return null
  }

  if (task && workstream && task.operationEventId && workstream.operationEventId && task.operationEventId !== workstream.operationEventId) return null
  const resourceEventId = task?.operationEventId ?? workstream?.operationEventId ?? null
  if (scope.eventId && resourceEventId && scope.eventId !== resourceEventId) return null
  if (scope.eventId && (task || workstream) && !resourceEventId) return null
  const eventId = scope.eventId ?? resourceEventId
  let event: { id: string; scopeUnitId: string | null; eventScopeType?: string | null; organizerUserId: string | null; organizerPersonId: string | null; status: string; createdBy: string } | undefined
  if (eventId) {
    ;[event] = await executor.select({ id: operationEvents.id, scopeUnitId: operationEvents.scopeUnitId, eventScopeType: operationEvents.eventScopeType, organizerUserId: operationEvents.organizerUserId, organizerPersonId: operationEvents.organizerPersonId, status: operationEvents.status, createdBy: operationEvents.createdBy })
      .from(operationEvents)
      .where(and(eq(operationEvents.parishId, parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
    if (!event) return null
  }
  // U-21: ở cấp event, nạp id các Mảng để nhận ra Field Lead của event (Truong Mảng
  // phải mở được event chứa Mảng của mình). Chỉ một query, chỉ khi scope là event.
  let eventWorkstreamIds: string[] | undefined
  if (event && !task && !workstream) {
    const fieldRows = await executor.select({ id: operationWorkstreams.id }).from(operationWorkstreams).where(and(
      eq(operationWorkstreams.parishId, parishId), eq(operationWorkstreams.operationEventId, event.id), isNull(operationWorkstreams.deletedAt),
    ))
    eventWorkstreamIds = fieldRows.map(row => row.id)
  }

  return { parishId, task, workstream, event, eventWorkstreamIds, resourceUnitId: scope.resourceUnitId ?? task?.scopeUnitId ?? workstream?.sourceUnitId ?? event?.scopeUnitId ?? null }
}

async function loadAuthorizationSnapshot(executor: DbExecutor, actor: ActorContext): Promise<OperationsAuthorizationSnapshot> {
  const [person] = await executor.select({ id: parishPeople.id }).from(parishPeople)
    .where(and(eq(parishPeople.parishId, actor.parishId), eq(parishPeople.linkedUserId, actor.userId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1)
  const today = parishCalendarDate()
  const now = new Date().toISOString()

  const terms = person
    ? await executor.select({
      positionTitle: parishServiceTerms.positionTitle,
      positionCode: parishServiceTerms.positionCode,
      unitId: parishServiceTerms.unitId,
      startDate: parishServiceTerms.startDate,
      endDate: parishServiceTerms.endDate,
    }).from(parishServiceTerms).where(and(
      eq(parishServiceTerms.parishId, actor.parishId),
      eq(parishServiceTerms.personId, person.id),
      isNull(parishServiceTerms.deletedAt),
    ))
    : []
  const currentTerms = terms
    .filter(term => term.startDate <= today && (!term.endDate || term.endDate >= today))
    .map(({ positionTitle, positionCode, unitId }) => ({ positionTitle, positionCode, unitId }))
  const units = await executor.select({ id: parishOrganizationUnits.id, parentId: parishOrganizationUnits.parentId, unitType: parishOrganizationUnits.unitType })
    .from(parishOrganizationUnits)
    .where(and(eq(parishOrganizationUnits.parishId, actor.parishId), eq(parishOrganizationUnits.isActive, true), isNull(parishOrganizationUnits.deletedAt)))
  const workstreamMemberships = await executor.select({
    workstreamId: operationWorkstreamMembers.workstreamId,
    role: operationWorkstreamMembers.operationRole,
  }).from(operationWorkstreamMembers).where(and(
    eq(operationWorkstreamMembers.parishId, actor.parishId),
    isNull(operationWorkstreamMembers.removedAt),
    or(isNull(operationWorkstreamMembers.startsAt), lte(operationWorkstreamMembers.startsAt, now)),
    or(isNull(operationWorkstreamMembers.endsAt), gte(operationWorkstreamMembers.endsAt, now)),
    or(eq(operationWorkstreamMembers.userId, actor.userId), person ? eq(operationWorkstreamMembers.personId, person.id) : undefined),
  ))
  const taskAssignmentRows = await executor.select({
    taskId: operationTaskAssignees.taskId,
    role: operationTaskAssignees.assignmentRole,
    acknowledgementStatus: operationTaskAssignees.acknowledgementStatus,
  }).from(operationTaskAssignees).where(and(
    eq(operationTaskAssignees.parishId, actor.parishId),
    isNull(operationTaskAssignees.removedAt),
    or(eq(operationTaskAssignees.userId, actor.userId), person ? eq(operationTaskAssignees.personId, person.id) : undefined),
  ))

  const workstreamRoles = new Map<string, string[]>()
  for (const row of workstreamMemberships) {
    workstreamRoles.set(row.workstreamId, [...(workstreamRoles.get(row.workstreamId) ?? []), row.role])
  }
  const taskAssignments = new Map<string, Array<{ role: string; acknowledgementStatus: string }>>()
  for (const row of taskAssignmentRows) {
    taskAssignments.set(row.taskId, [...(taskAssignments.get(row.taskId) ?? []), row])
  }
  return { personId: person?.id ?? null, currentTerms, units, workstreamRoles, taskAssignments }
}

function descendantIds(units: Array<{ id: string; parentId: string | null }>, rootId: string): string[] {
  const children = new Map<string, string[]>()
  for (const unit of units) {
    if (!unit.parentId) continue
    children.set(unit.parentId, [...(children.get(unit.parentId) ?? []), unit.id])
  }
  const result = [rootId]
  const pending = [rootId]
  while (pending.length) {
    const current = pending.shift()!
    for (const child of children.get(current) ?? []) {
      if (result.includes(child)) continue
      result.push(child)
      pending.push(child)
    }
  }
  return result
}

/**
 * U-20: Trưởng Ban/Ngành đang hiệu lực của `unitId` (hoặc của một unit cha bao
 * trùm nó — cùng semantics với nhánh unit bên dưới). Dùng cho tầng Mảng của event
 * Xứ đoàn: task trong Mảng thuộc Ban/Ngành sở hữu Mảng.
 */
function isUnitLeaderFor(unitId: string | null, snapshot: OperationsAuthorizationSnapshot): boolean {
  if (!unitId) return false
  const unitsById = new Map(snapshot.units.map(unit => [unit.id, unit]))
  return snapshot.currentTerms.some(term => {
    if (!term.unitId || !descendantIds(snapshot.units, term.unitId).includes(unitId)) return false
    const unitType = unitsById.get(term.unitId)?.unitType
    return (unitType === 'BRANCH' && term.positionCode === 'BRANCH_LEADER')
      || (unitType === 'COMMITTEE' && term.positionCode === 'COMMITTEE_LEADER')
  })
}

/** U-20: Phó Ban/Ngành đang hiệu lực của `unitId` (hoặc unit cha bao trùm nó). */
function isUnitDeputyFor(unitId: string | null, snapshot: OperationsAuthorizationSnapshot): boolean {
  if (!unitId) return false
  const unitsById = new Map(snapshot.units.map(unit => [unit.id, unit]))
  return snapshot.currentTerms.some(term => {
    if (!term.unitId || !descendantIds(snapshot.units, term.unitId).includes(unitId)) return false
    const unitType = unitsById.get(term.unitId)?.unitType
    return (unitType === 'BRANCH' && term.positionCode === 'BRANCH_DEPUTY')
      || (unitType === 'COMMITTEE' && term.positionCode === 'COMMITTEE_DEPUTY')
  })
}

async function resolveTargetAuthority(
  actor: ActorContext,
  capability: OperationsCapability,
  scope: OperationsScope,
  executor: DbExecutor,
) {
  if (actor.parishId !== scope.parishId || !STAFF_ROLES.has(actor.role)) {
    throw Object.assign(new Error('Bạn không có quyền Operations trong phạm vi này.'), { status: 403, code: 'FORBIDDEN' })
  }
  const resource = await loadResource(executor, actor.parishId, scope)
  if (!resource) throw Object.assign(new Error('Bạn không có quyền Operations trong phạm vi này.'), { status: 403, code: 'FORBIDDEN' })
  const snapshot = await loadAuthorizationSnapshot(executor, actor)
  const decision = decideOperationsAuthorization(actor, capability, resource, snapshot)
  if (!decision.allowed) {
    throw Object.assign(new Error('Bạn không có quyền Operations trong phạm vi này.'), { status: 403, code: 'FORBIDDEN', decision })
  }
  // Target model đã duyệt: delegate người KHÔNG còn parish-wide cho
  // Trưởng/Phó Xứ đoàn. Chỉ technical admin override mới bypass kiểm tra
  // target-scope. Đọc toàn xứ đi qua capability view riêng, không qua cờ này.
  const parishWide = (actor.role === 'admin' && isOperationsAdminMutationOverrideEnabled())
  return { resource, snapshot, parishWide, decision }
}

function personIsInResourceScope(
  personId: string,
  resourceUnitId: string,
  snapshot: OperationsAuthorizationSnapshot,
  termUnitIdsByPerson: Map<string, string[]>,
): boolean {
  const resourceUnitIds = new Set(descendantIds(snapshot.units, resourceUnitId))
  return (termUnitIdsByPerson.get(personId) ?? []).some(unitId => resourceUnitIds.has(unitId))
}

const IN_ARRAY_CHUNK_SIZE = 400

async function selectInChunks<T>(ids: string[], load: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let index = 0; index < ids.length; index += IN_ARRAY_CHUNK_SIZE) {
    out.push(...await load(ids.slice(index, index + IN_ARRAY_CHUNK_SIZE)))
  }
  return out
}

async function currentTermUnitIdsByPerson(executor: DbExecutor, parishId: string, personIds: string[]) {
  const result = new Map<string, string[]>()
  if (personIds.length === 0) return result
  const today = parishCalendarDate()
  const terms = await selectInChunks(personIds, chunk => executor.select({ personId: parishServiceTerms.personId, unitId: parishServiceTerms.unitId })
    .from(parishServiceTerms).where(and(
      eq(parishServiceTerms.parishId, parishId),
      inArray(parishServiceTerms.personId, chunk),
      lte(parishServiceTerms.startDate, today),
      or(isNull(parishServiceTerms.endDate), gte(parishServiceTerms.endDate, today)),
      isNull(parishServiceTerms.deletedAt),
    )))
  for (const term of terms) {
    if (!term.unitId) continue
    result.set(term.personId, [...(result.get(term.personId) ?? []), term.unitId])
  }
  return result
}

/**
 * A scoped organizational leader or resource lead may only assign people whose
 * current service term belongs to the resource unit tree. Admin and the active
 * parish leader retain parish-wide authority. This is a write-side guard; a UI
 * candidate picker is never an authorization boundary.
 */
export async function assertOperationsTargetWithinAuthority(
  actor: ActorContext,
  capability: OperationsCapability,
  scope: OperationsScope,
  target: { userId?: string | null; personId?: string | null },
  executor: DbExecutor = db,
): Promise<void> {
  const { resource, snapshot, parishWide, decision } = await resolveTargetAuthority(actor, capability, scope, executor)
  // Record the capability decision so D3 audit trails can distinguish a
  // business-authority assignment from a parish-wide override, including the
  // organizer/lead/scope target bypasses that return early below.
  if (executor && typeof executor === 'object') rememberOperationsAuthorization(executor, decision)
  if (parishWide || !resource.resourceUnitId) return
  const people = target.personId
    ? await executor.select({ id: parishPeople.id }).from(parishPeople).where(and(
      eq(parishPeople.parishId, actor.parishId), eq(parishPeople.id, target.personId),
      eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt),
    )).limit(1)
    : target.userId
      ? await executor.select({ id: parishPeople.id }).from(parishPeople).where(and(
        eq(parishPeople.parishId, actor.parishId), eq(parishPeople.linkedUserId, target.userId),
        eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt),
      )).limit(1)
      : []
  const personIds = people.map(person => person.id)
  const termUnitIds = await currentTermUnitIdsByPerson(executor, actor.parishId, personIds)
  if (!personIds.some(personId => personIsInResourceScope(personId, resource.resourceUnitId!, snapshot, termUnitIds))) {
    throw Object.assign(new Error('Chỉ được phân công thành viên thuộc đơn vị phụ trách.'), { status: 403, code: 'TARGET_OUTSIDE_ORGANIZATION_SCOPE' })
  }
}

/** Minimal, contact-free directory for a resource-scoped assignment control. */
export async function listOperationsCandidates(
  actor: ActorContext,
  capability: OperationsCapability,
  scope: OperationsScope,
  executor: DbExecutor = db,
): Promise<OperationsCandidate[]> {
  const { resource, snapshot, parishWide } = await resolveTargetAuthority(actor, capability, scope, executor)
  const resourceUnitId = resource.resourceUnitId
  // Unit-scoped pickers only need people in the resource unit tree. Parish-wide
  // actors (admin override / Xứ đoàn office) keep the previous full directory.
  const scopeUnitIds = (!parishWide && resourceUnitId)
    ? descendantIds(snapshot.units, resourceUnitId)
    : null

  let people: Array<{ id: string; linkedUserId: string | null; fullName: string }>
  if (scopeUnitIds) {
    const today = parishCalendarDate()
    const scopedPersonRows = scopeUnitIds.length === 0
      ? []
      : await selectInChunks(scopeUnitIds, chunk => executor.select({ personId: parishServiceTerms.personId }).from(parishServiceTerms).where(and(
        eq(parishServiceTerms.parishId, actor.parishId),
        inArray(parishServiceTerms.unitId, chunk),
        lte(parishServiceTerms.startDate, today),
        or(isNull(parishServiceTerms.endDate), gte(parishServiceTerms.endDate, today)),
        isNull(parishServiceTerms.deletedAt),
      )))
    const scopedPersonIds = [...new Set(scopedPersonRows.map(row => row.personId))]
    const scopedPeople = scopedPersonIds.length === 0
      ? []
      : await selectInChunks(scopedPersonIds, chunk => executor.select({ id: parishPeople.id, linkedUserId: parishPeople.linkedUserId, fullName: parishPeople.fullName })
        .from(parishPeople).where(and(
          eq(parishPeople.parishId, actor.parishId),
          inArray(parishPeople.id, chunk),
          eq(parishPeople.serviceStatus, 'ACTIVE'),
          isNull(parishPeople.deletedAt),
        )))
    // Chunked loads lose ORDER BY; the final directory sort below restores it.
    people = scopedPeople.sort((left, right) => left.fullName.localeCompare(right.fullName, 'vi'))
  } else {
    people = await executor.select({ id: parishPeople.id, linkedUserId: parishPeople.linkedUserId, fullName: parishPeople.fullName })
      .from(parishPeople).where(and(eq(parishPeople.parishId, actor.parishId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).orderBy(asc(parishPeople.fullName))
  }

  const linkedUserIds = new Set(people.flatMap(person => person.linkedUserId ? [person.linkedUserId] : []))
  // Account-only staff are always out of unit scope; skip the full staff table there.
  const staffAccounts = scopeUnitIds
    ? (linkedUserIds.size === 0
      ? []
      : await selectInChunks([...linkedUserIds], chunk => executor.select({ id: users.id, fullName: users.fullName }).from(users).where(and(
        eq(users.parishId, actor.parishId),
        inArray(users.id, chunk),
        inArray(users.role, ['admin', 'chunhiem', 'phuta']),
        eq(users.status, 'ACTIVE'),
        isNull(users.deletedAt),
      ))))
    : await executor.select({ id: users.id, fullName: users.fullName }).from(users).where(and(
      eq(users.parishId, actor.parishId), inArray(users.role, ['admin', 'chunhiem', 'phuta']), eq(users.status, 'ACTIVE'), isNull(users.deletedAt),
    ))

  const staffById = new Map(staffAccounts.map(account => [account.id, account]))
  const termUnitIds = await currentTermUnitIdsByPerson(executor, actor.parishId, people.map(person => person.id))
  const personCandidates: OperationsCandidate[] = people.map(person => {
    const activeStaff = person.linkedUserId ? staffById.get(person.linkedUserId) : undefined
    const inResourceScope = resourceUnitId ? personIsInResourceScope(person.id, resourceUnitId, snapshot, termUnitIds) : null
    return {
      parishId: actor.parishId,
      personId: person.id,
      userId: activeStaff?.id ?? null,
      displayName: person.fullName,
      eligibility: !person.linkedUserId ? 'PLANNING_ONLY' : activeStaff ? 'ACTIONABLE' : 'INELIGIBLE',
      inResourceScope,
    }
  })
  const accountOnlyCandidates: OperationsCandidate[] = scopeUnitIds
    ? []
    : staffAccounts
      .filter(account => !linkedUserIds.has(account.id))
      .map(account => ({ parishId: actor.parishId, personId: null, userId: account.id, displayName: account.fullName, eligibility: 'ACTIONABLE' as const, inResourceScope: resourceUnitId ? false : null }))
  return [...personCandidates, ...accountOnlyCandidates]
    .filter(candidate => parishWide || !resourceUnitId || candidate.inResourceScope)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'vi'))
}

function operationRoleAllows(capability: OperationsCapability, roles: string[]): boolean {
  if (capability === 'operations.event.view' || capability === 'operations.task.view') return roles.length > 0
  // Personal task authority is additive: being a manager must neither grant
  // it implicitly nor mask an independently accepted task assignment.
  if (capability === 'operations.task.execute') return roles.includes('TASK_OWNER') || roles.includes('TASK_CONTRIBUTOR')
  // ACCEPTED assignees may comment on their task; pending assignees view only.
  if (capability === 'operations.task.comment') {
    return roles.includes('EVENT_CREATOR') || roles.includes('EVENT_ORGANIZER')
      || roles.includes('WORKSTREAM_LEAD') || roles.includes('TASK_OWNER') || roles.includes('TASK_CONTRIBUTOR')
  }
  // Target model: Creator/Organizer/Lead manage nội dung nhưng KHÔNG tự động
  // delegate người. Delegate chỉ qua position scope của Trưởng unit hiện hành
  // (hoặc admin override). Vì vậy assign/reassign/assign_lead bị loại khỏi role.
  if (roles.includes('EVENT_ORGANIZER') || roles.includes('EVENT_CREATOR')) {
    return new Set<OperationsCapability>([
      'operations.event.view', 'operations.event.manage', 'operations.event.transition', 'operations.event.cancel',
      'operations.event.override_readiness', 'operations.task.view', 'operations.task.create', 'operations.task.manage',
      'operations.task.comment', 'operations.workstream.create',
      'operations.workstream.manage', 'operations.workstream.mark_ready',
    ]).has(capability)
  }
  if (roles.includes('WORKSTREAM_LEAD')) {
    return new Set<OperationsCapability>([
      'operations.event.view', 'operations.task.view', 'operations.task.create', 'operations.task.manage',
      'operations.task.comment', 'operations.workstream.manage',
      'operations.workstream.mark_ready',
    ]).has(capability)
  }
  return false
}

/** XU_DOAN graph = event thuộc Xứ đoàn (`scope_unit_id` NULL), độc lập với việc event có Mảng hay không. */
function isXuDoanGraphResource(resource: OperationsAuthorizationResource): boolean {
  return Boolean(resource.event && (resource.event.eventScopeType ?? (resource.event.scopeUnitId ? 'UNIT' : 'XU_DOAN')) === 'XU_DOAN')
}

function decideOperationsAuthorization(
  actor: ActorContext,
  capability: OperationsCapability,
  resource: OperationsAuthorizationResource,
  snapshot: OperationsAuthorizationSnapshot,
): OperationsDecision {
  if (resource.parishId !== actor.parishId) return deny('ACCOUNT_ROLE')
  const isXuDoanGraph = isXuDoanGraphResource(resource)
  // DRAFT: mặc định chỉ creator (+admin) được thấy. Văn phòng xứ View toàn xứ
  // nên được xem DRAFT. Trưởng Xứ đoàn còn được manage nội dung DRAFT Xứ đoàn
  // (không delegate) để tiếp quản event do Phó/Thư ký/admin tạo.
  if (resource.event?.status === 'DRAFT' && actor.role !== 'admin' && resource.event.createdBy !== actor.userId) {
    const isParishOfficeViewer = snapshot.currentTerms.some(term =>
      (term.positionCode === 'PARISH_LEADER' || term.positionCode === 'PARISH_DEPUTY' || term.positionCode === 'PARISH_SECRETARY'),
    )
    const isView = capability === 'operations.event.view' || capability === 'operations.task.view'
    if (isView && isParishOfficeViewer) {
      // Cho qua để nhánh position bên dưới xét view toàn xứ.
    } else if (isXuDoanGraph && !DELEGATE_CAPABILITIES.has(capability) && capability !== 'operations.task.execute') {
      const isParishLeaderDraft = snapshot.currentTerms.some(term => term.positionCode === 'PARISH_LEADER')
      if (!isParishLeaderDraft) return deny('OPERATION_ROLE')
      // Trưởng Xứ đoàn được qua để nhánh position xét manage Xứ đoàn bên dưới.
    } else {
      return deny('OPERATION_ROLE')
    }
  }
  const operationRoles: string[] = []
  if (resource.event?.createdBy === actor.userId) operationRoles.push('EVENT_CREATOR')
  if (resource.event && (
    resource.event.organizerUserId === actor.userId
    || Boolean(snapshot.personId && resource.event.organizerPersonId === snapshot.personId)
  )) operationRoles.push('EVENT_ORGANIZER')
  if (resource.workstream) operationRoles.push(...(snapshot.workstreamRoles.get(resource.workstream.id) ?? []))
  if (resource.task) {
    const assignments = snapshot.taskAssignments.get(resource.task.id) ?? []
    // Pending/declined assignments grant enough visibility to acknowledge or
    // inspect the assignment, never execute authority.
    if (assignments.length > 0) operationRoles.push('TASK_ASSIGNEE')
    operationRoles.push(...assignments
      .filter(row => row.acknowledgementStatus === 'ACCEPTED')
      .map(row => `TASK_${row.role}`))
  }
  // U-20 (2026-09-21, product-approved — Gói A): event XỨ ĐOÀN → MẢNG → TASK là
  // ba tầng trách nhiệm. Trưởng/Phó Xứ đoàn và Thư ký dừng ở cấp điều phối Mảng;
  // task bên trong một Mảng thuộc Ban/Ngành sở hữu Mảng. Chốt tại đây — trước mọi
  // nhánh role/position — nên EVENT_ORGANIZER (organizer Xứ đoàn luôn là Xứ đoàn
  // trưởng) và EVENT_CREATOR (Phó/Thư ký tạo event) không còn là đường vòng.
  // Quyền tạo/sửa đến từ Trưởng/Phó Ban-Ngành của đúng unit sở hữu Mảng, hoặc
  // chính WORKSTREAM_LEAD của Mảng đó; admin override giữ nguyên.
  if (isXuDoanGraph && resource.workstream && FIELD_TASK_LAYER_CAPABILITIES.has(capability)) {
    const holdsFieldLayerAuthority = operationRoles.includes('WORKSTREAM_LEAD')
      || isUnitLeaderFor(resource.workstream.sourceUnitId, snapshot)
      || isUnitDeputyFor(resource.workstream.sourceUnitId, snapshot)
    const hasAdminOverride = actor.role === 'admin' && isOperationsAdminMutationOverrideEnabled() && ADMIN_OVERRIDE_CAPABILITIES.has(capability)
    if (!holdsFieldLayerAuthority && !hasAdminOverride) return deny('POSITION_SCOPE', [], [], operationRoles)
  }
  if (operationRoleAllows(capability, operationRoles)) {
    return { allowed: true, reason: 'OPERATION_ROLE', positionTitles: [], unitIds: [], operationRoles }
  }
  if (actor.role === 'admin' && ADMIN_READ_CAPABILITIES.has(capability)) {
    return { allowed: true, reason: 'ALLOWED', positionTitles: [], unitIds: [], operationRoles }
  }
  if (actor.role === 'admin' && isOperationsAdminMutationOverrideEnabled() && ADMIN_OVERRIDE_CAPABILITIES.has(capability)) {
    return { allowed: true, reason: 'ADMIN_OVERRIDE', positionTitles: [], unitIds: [], operationRoles }
  }
  // Unknown capabilities still fail closed; admin grants are explicit above.
  if (actor.role === 'admin') return deny('ACCOUNT_ROLE', [], [], operationRoles)
  if (!snapshot.personId) return deny('POSITION_SCOPE', [], [], operationRoles)

  const unitsById = new Map(snapshot.units.map(unit => [unit.id, unit]))
  const positionTitles = snapshot.currentTerms.map(term => term.positionTitle)
  const unitIds = [...new Set(snapshot.currentTerms.flatMap(term => term.unitId ? descendantIds(snapshot.units, term.unitId) : []))]
  const requestedUnitId = resource.resourceUnitId
  const parishLeader = snapshot.currentTerms.some(term => term.positionCode === 'PARISH_LEADER' && (!term.unitId || unitsById.get(term.unitId)?.unitType === 'BOARD'))
  const parishDeputy = snapshot.currentTerms.some(term => term.positionCode === 'PARISH_DEPUTY' && (!term.unitId || unitsById.get(term.unitId)?.unitType === 'BOARD'))
  const parishSecretary = snapshot.currentTerms.some(term => term.positionCode === 'PARISH_SECRETARY' && (!term.unitId || unitsById.get(term.unitId)?.unitType === 'BOARD'))
  const isParishOffice = parishLeader || parishDeputy || parishSecretary
  // Khóa theo yêu cầu: Trưởng Xứ đoàn chỉ tạo event Xứ đoàn (scope NULL) +
  // task độc lập (standalone, không event/workstream); Phó/Thư ký chỉ tạo
  // Event Xứ đoàn. Trưởng Xứ đoàn được sửa nội dung event Xứ đoàn (kể cả do
  // Phó/Thư ký/admin tạo) nhưng KHÔNG delegate người — ngoại lệ duy nhất là bổ
  // nhiệm Field Lead cho Mảng của event Xứ đoàn (U-20). Mọi manage/delegate khác
  // chỉ qua resource role hoặc term unit kiêm nhiệm ở nhánh unit bên dưới.
  if (isParishOffice) {
    if (PARISH_VIEW_CAPABILITIES.has(capability)) return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
    if (capability === 'operations.event.create' && requestedUnitId === null) {
      // Cả Trưởng/Phó/Thư ký đều được tạo Event Xứ đoàn.
      return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
    }
    if (parishLeader && capability === 'operations.event.publish_public') {
      return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
    }
    if (parishLeader && capability === 'operations.task.create' && !resource.event && !resource.workstream && !resource.task) {
      // Task độc lập (standalone): không event/workstream, scope từ unit picker.
      return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
    }
    if (parishLeader && capability === 'operations.workstream.assign_lead' && isXuDoanGraph && resource.workstream?.sourceUnitId) {
      // U-20 (Gói A, 2026-09-21): Trưởng Xứ đoàn bổ nhiệm Field Lead cho Mảng của
      // event Xứ đoàn. Target vẫn bị ép đúng Trưởng Ban/Ngành đương nhiệm của đơn
      // vị sở hữu Mảng vì route luôn chạy `assertWorkstreamLeadEligibility` cho
      // non-admin; Mảng thiếu sourceUnitId (legacy) không mở đường này. Delegate
      // khác của Trưởng Xứ đoàn vẫn bị chặn ở nhánh dưới.
      return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
    }
    if (parishLeader && isXuDoanGraph && !DELEGATE_CAPABILITIES.has(capability) && capability !== 'operations.task.execute') {
      // Sửa nội dung Xứ đoàn (event/task/workstream manage, transition, cancel,
      // comment, mark_ready...) cho event Xứ đoàn dù do Phó/Thư ký/admin tạo.
      // Delegate người và execute cá nhân vẫn bị chặn ở đây.
      return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
    }
  }
  const unitLeader = isUnitLeaderFor(requestedUnitId, snapshot)
  const unitDeputy = isUnitDeputyFor(requestedUnitId, snapshot)
  if (unitLeader && UNIT_LEADER_CAPABILITIES.has(capability)) return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
  if (unitDeputy && UNIT_DEPUTY_CAPABILITIES.has(capability)) return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
  return deny('POSITION_SCOPE', positionTitles, unitIds, operationRoles)
}

/**
 * Authorize a list with a bounded authorization-query shape. Routes supply the
 * already-loaded resource graph so authorization does not issue per-row queries.
 */
export async function resolveOperationsAuthorizationBatch(
  actor: ActorContext,
  capability: OperationsCapability,
  resources: OperationsAuthorizationResource[],
  executor: DbExecutor = db,
): Promise<OperationsDecision[]> {
  if (!STAFF_ROLES.has(actor.role)) return resources.map(() => deny('ACCOUNT_ROLE'))
  const snapshot = await loadAuthorizationSnapshot(executor, actor)
  return resources.map(resource => decideOperationsAuthorization(actor, capability, resource, snapshot))
}

export async function resolveOperationsAuthorization(
  actor: ActorContext,
  capability: OperationsCapability,
  scope: OperationsScope,
  executor: DbExecutor = db,
): Promise<OperationsDecision> {
  if (actor.parishId !== scope.parishId || !STAFF_ROLES.has(actor.role)) return deny('ACCOUNT_ROLE')
  const resource = await loadResource(executor, actor.parishId, scope)
  if (!resource) return deny('RESOURCE_NOT_FOUND')
  const snapshot = await loadAuthorizationSnapshot(executor, actor)
  return decideOperationsAuthorization(actor, capability, resource, snapshot)
}

/**
 * Resolve authority for a prospective/current recipient from current database
 * state. This is intentionally different from trusting a caller-supplied JWT:
 * scheduled work must stop when the recipient account is locked, deleted or no
 * longer belongs to the Operations staff baseline.
 */
export async function resolveOperationsUserAuthorization(
  parishId: string,
  userId: string,
  capability: OperationsCapability,
  scope: Omit<OperationsScope, 'parishId'>,
  executor: DbExecutor = db,
): Promise<OperationsDecision> {
  const [target] = await executor.select({ id: users.id, role: users.role }).from(users).where(and(
    eq(users.parishId, parishId),
    eq(users.id, userId),
    eq(users.status, 'ACTIVE'),
    isNull(users.deletedAt),
  )).limit(1)
  if (!target || !STAFF_ROLES.has(target.role)) return deny('ACCOUNT_ROLE')
  return resolveOperationsAuthorization({ userId: target.id, role: target.role, parishId }, capability, { ...scope, parishId }, executor)
}

/**
 * Delayed assignment/dispatch work must recheck whether a target is still an
 * actionable staff member in the resource's organizational scope. Eligibility
 * to receive an invitation is deliberately not Operations read authority.
 */
export async function isOperationsTargetActionableForResource(
  parishId: string,
  userId: string,
  scope: Omit<OperationsScope, 'parishId'>,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [target] = await executor.select({ id: users.id, role: users.role }).from(users).where(and(
    eq(users.parishId, parishId),
    eq(users.id, userId),
    inArray(users.role, ['admin', 'chunhiem', 'phuta']),
    eq(users.status, 'ACTIVE'),
    isNull(users.deletedAt),
  )).limit(1)
  if (!target) return false
  const resource = await loadResource(executor, parishId, { ...scope, parishId })
  if (!resource) return false
  if (!resource.resourceUnitId) return true
  const snapshot = await loadAuthorizationSnapshot(executor, { userId: target.id, role: target.role, parishId })
  if (!snapshot.personId) return false
  const resourceUnitIds = new Set(descendantIds(snapshot.units, resource.resourceUnitId))
  return snapshot.currentTerms.some(term => Boolean(term.unitId && resourceUnitIds.has(term.unitId)))
}

const authorizationByExecutor = new WeakMap<object, OperationsDecision>()

/** Latest successful assertOperationsCapability decision for this DB executor/tx (D3 audit trail). */
export function peekOperationsAuthorizationReason(executor: object): OperationsDecision['reason'] | undefined {
  return authorizationByExecutor.get(executor)?.reason
}

export function rememberOperationsAuthorization(executor: object, decision: OperationsDecision): void {
  // Multi-assert commands (capability + target, create + publish) share one tx.
  // The override flag is the load-bearing signal for D3 review, so once an
  // ADMIN_OVERRIDE is recorded it sticks for the rest of the transaction.
  if (authorizationByExecutor.get(executor)?.reason === 'ADMIN_OVERRIDE') return
  authorizationByExecutor.set(executor, decision)
}

export async function assertOperationsCapability(actor: ActorContext, capability: OperationsCapability, scope: OperationsScope, executor: DbExecutor = db): Promise<OperationsDecision> {
  const decision = await resolveOperationsAuthorization(actor, capability, scope, executor)
  if (!decision.allowed) throw Object.assign(new Error('Bạn không có quyền Operations trong phạm vi này.'), { status: 403, code: 'FORBIDDEN', decision })
  if (executor && typeof executor === 'object') rememberOperationsAuthorization(executor, decision)
  return decision
}

export async function getOperationsCallerPermissions(actor: ActorContext, scope: OperationsScope, executor: DbExecutor = db) {
  const capabilities: OperationsCapability[] = [
    'operations.event.view', 'operations.event.create', 'operations.event.manage', 'operations.event.transition',
    'operations.event.cancel', 'operations.event.override_readiness', 'operations.event.publish_public',
    'operations.task.view', 'operations.task.create',
    'operations.task.manage', 'operations.task.assign', 'operations.task.execute', 'operations.task.reassign',
    'operations.task.comment', 'operations.workstream.create', 'operations.workstream.manage',
    'operations.workstream.assign_lead', 'operations.workstream.mark_ready',
  ]
  if (actor.parishId !== scope.parishId || !STAFF_ROLES.has(actor.role)) return Object.fromEntries(capabilities.map(capability => [capability, false]))
  const resource = await loadResource(executor, actor.parishId, scope)
  if (!resource) return Object.fromEntries(capabilities.map(capability => [capability, false]))
  const snapshot = await loadAuthorizationSnapshot(executor, actor)
  const permissions: Record<string, boolean> = Object.fromEntries(
    capabilities.map(capability => [capability, decideOperationsAuthorization(actor, capability, resource, snapshot).allowed]),
  )
  // U-20 (2026-09-21, Gói A): trong event Xứ đoàn task chỉ tồn tại bên trong một
  // Mảng (`TASK_WORKSTREAM_REQUIRED`), nên câu hỏi "tạo được task trong event này
  // không?" thực chất là "có ít nhất một Mảng của event mà caller có quyền tầng
  // Mảng hay không". Chưa có Mảng (hoặc không Mảng nào thuộc quyền) ⇒ false, để UI
  // không mời người điều phối Mảng một hành động mà command path sẽ từ chối.
  // Map này chỉ là UX: mọi command vẫn tự kiểm capability trên resource thật.
  if (scope.eventId && !scope.workstreamId && !scope.taskId && isXuDoanGraphResource(resource)) {
    const fields = await executor.select({
      id: operationWorkstreams.id,
      sourceUnitId: operationWorkstreams.sourceUnitId,
      operationEventId: operationWorkstreams.operationEventId,
    }).from(operationWorkstreams).where(and(
      eq(operationWorkstreams.parishId, actor.parishId),
      eq(operationWorkstreams.operationEventId, scope.eventId),
      isNull(operationWorkstreams.deletedAt),
    ))
    permissions['operations.task.create'] = fields.some(field => decideOperationsAuthorization(
      actor,
      'operations.task.create',
      { ...resource, workstream: field, resourceUnitId: field.sourceUnitId },
      snapshot,
    ).allowed)
  }
  return permissions
}
