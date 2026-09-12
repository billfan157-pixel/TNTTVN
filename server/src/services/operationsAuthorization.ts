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
const PARISH_LEADER_CAPABILITIES = new Set(ADMIN_OVERRIDE_CAPABILITIES)
const PARISH_OFFICE_CAPABILITIES = new Set<OperationsCapability>([
  'operations.event.view', 'operations.event.create', 'operations.event.manage', 'operations.event.transition',
  'operations.event.cancel', 'operations.task.view',
  'operations.task.create', 'operations.task.manage', 'operations.task.assign', 'operations.task.reassign',
  'operations.task.comment', 'operations.workstream.create', 'operations.workstream.manage',
  'operations.workstream.assign_lead', 'operations.workstream.mark_ready',
])
/** Thư ký: đọc toàn xứ + tạo Event Xứ đoàn; mọi quyền khác trên event/task của
 * người khác đều không có — quyền trên event/task mình tạo đi qua role
 * EVENT_CREATOR (operationRoleAllows), không qua position scope. */
const PARISH_SECRETARY_CAPABILITIES = new Set<OperationsCapability>([
  'operations.event.view', 'operations.task.view', 'operations.event.create',
])
const UNIT_LEADER_OR_DEPUTY_CAPABILITIES = new Set<OperationsCapability>([
  'operations.event.view', 'operations.event.create', 'operations.event.manage', 'operations.task.view',
  'operations.task.create', 'operations.task.manage', 'operations.task.assign', 'operations.task.reassign',
  'operations.task.comment', 'operations.workstream.create', 'operations.workstream.manage',
  'operations.workstream.assign_lead', 'operations.workstream.mark_ready',
])

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

  return { parishId, task, workstream, event, resourceUnitId: scope.resourceUnitId ?? task?.scopeUnitId ?? workstream?.sourceUnitId ?? event?.scopeUnitId ?? null }
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
  // Thư ký không còn parish-wide: đọc toàn xứ đi qua capability view,
  // còn target-scope (phân công/lead) phải thỏa unit như mọi actor khác.
  const parishWide = (actor.role === 'admin' && isOperationsAdminMutationOverrideEnabled())
    || snapshot.currentTerms.some(term => term.positionCode === 'PARISH_LEADER')
    || snapshot.currentTerms.some(term => term.positionCode === 'PARISH_DEPUTY')
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
  if (capability === 'operations.event.view') return roles.length > 0
  // Personal task authority is additive: being a manager must neither grant
  // it implicitly nor mask an independently accepted task assignment.
  if (capability === 'operations.task.execute') return roles.includes('TASK_OWNER') || roles.includes('TASK_CONTRIBUTOR')
  if (roles.includes('EVENT_ORGANIZER') || roles.includes('EVENT_CREATOR')) {
    return new Set<OperationsCapability>([
      'operations.event.view', 'operations.event.manage', 'operations.event.transition', 'operations.event.cancel',
      'operations.event.override_readiness', 'operations.task.view', 'operations.task.create', 'operations.task.manage',
      'operations.task.assign', 'operations.task.reassign', 'operations.task.comment', 'operations.workstream.create',
      'operations.workstream.manage', 'operations.workstream.assign_lead', 'operations.workstream.mark_ready',
    ]).has(capability)
  }
  if (roles.includes('WORKSTREAM_LEAD')) {
    return new Set<OperationsCapability>([
      'operations.event.view', 'operations.task.view', 'operations.task.create', 'operations.task.manage',
      'operations.task.assign', 'operations.task.reassign', 'operations.task.comment', 'operations.workstream.manage',
      'operations.workstream.mark_ready',
    ]).has(capability)
  }
  if (capability === 'operations.task.comment' || capability === 'operations.task.view') return roles.length > 0
  return false
}

function decideOperationsAuthorization(
  actor: ActorContext,
  capability: OperationsCapability,
  resource: OperationsAuthorizationResource,
  snapshot: OperationsAuthorizationSnapshot,
): OperationsDecision {
  if (resource.parishId !== actor.parishId) return deny('ACCOUNT_ROLE')
  if (resource.event?.status === 'DRAFT' && actor.role !== 'admin' && resource.event.createdBy !== actor.userId) {
    return deny('OPERATION_ROLE')
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
  const scopeMember = Boolean(resource.event && resource.event.status !== 'DRAFT' && requestedUnitId && snapshot.currentTerms.some(term =>
    Boolean(term.unitId && descendantIds(snapshot.units, requestedUnitId).includes(term.unitId))
  ))
  const parishLeader = snapshot.currentTerms.some(term => term.positionCode === 'PARISH_LEADER' && (!term.unitId || unitsById.get(term.unitId)?.unitType === 'BOARD'))
  const parishDeputy = snapshot.currentTerms.some(term => term.positionCode === 'PARISH_DEPUTY' && (!term.unitId || unitsById.get(term.unitId)?.unitType === 'BOARD'))
  const parishSecretary = snapshot.currentTerms.some(term => term.positionCode === 'PARISH_SECRETARY' && (!term.unitId || unitsById.get(term.unitId)?.unitType === 'BOARD'))
  const unitLeader = requestedUnitId !== null && snapshot.currentTerms.some(term => {
    if (!term.unitId || !descendantIds(snapshot.units, term.unitId).includes(requestedUnitId)) return false
    const unitType = unitsById.get(term.unitId)?.unitType
    return (unitType === 'BRANCH' && (term.positionCode === 'BRANCH_LEADER' || term.positionCode === 'BRANCH_DEPUTY'))
      || (unitType === 'COMMITTEE' && (term.positionCode === 'COMMITTEE_LEADER' || term.positionCode === 'COMMITTEE_DEPUTY'))
  })
  if (parishLeader && PARISH_LEADER_CAPABILITIES.has(capability)) return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
  if (parishDeputy && PARISH_OFFICE_CAPABILITIES.has(capability)) return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
  if (parishSecretary && PARISH_SECRETARY_CAPABILITIES.has(capability)) return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
  if (unitLeader && UNIT_LEADER_OR_DEPUTY_CAPABILITIES.has(capability)) return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
  if (scopeMember && (capability === 'operations.event.view' || capability === 'operations.task.view')) return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles: [...operationRoles, 'SCOPE_MEMBER'] }
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
  return Object.fromEntries(capabilities.map(capability => [capability, decideOperationsAuthorization(actor, capability, resource, snapshot).allowed]))
}
