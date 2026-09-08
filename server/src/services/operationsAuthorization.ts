import { and, eq, gte, isNull, lte, or } from 'drizzle-orm'
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

export type OperationsCapability =
  | 'operations.event.view'
  | 'operations.event.create'
  | 'operations.event.manage'
  | 'operations.event.transition'
  | 'operations.event.cancel'
  | 'operations.event.override_readiness'
  | 'operations.task.view'
  | 'operations.task.create'
  | 'operations.task.manage'
  | 'operations.task.assign'
  | 'operations.task.execute'
  | 'operations.task.reassign'
  | 'operations.task.approve'
  | 'operations.task.comment'
  | 'operations.workstream.create'
  | 'operations.workstream.manage'
  | 'operations.workstream.assign_lead'
  | 'operations.workstream.mark_ready'
  | 'operations.audit.view'

export type OperationsScope = {
  parishId: string
  resourceUnitId?: string | null
  eventId?: string | null
  workstreamId?: string | null
  taskId?: string | null
}

export type OperationsDecision = {
  allowed: boolean
  reason: 'ALLOWED' | 'ACCOUNT_ROLE' | 'POSITION_SCOPE' | 'OPERATION_ROLE' | 'RESOURCE_NOT_FOUND'
  positionTitles: string[]
  unitIds: string[]
  operationRoles: string[]
}

export type OperationsAuthorizationResource = {
  parishId: string
  task?: { id: string; workstreamId: string | null; operationEventId: string | null }
  workstream?: { id: string; sourceUnitId: string | null; operationEventId: string | null }
  event?: { id: string; scopeUnitId: string | null; organizerUserId: string | null; organizerPersonId: string | null }
  resourceUnitId: string | null
}

type OperationsAuthorizationSnapshot = {
  personId: string | null
  currentTerms: Array<{ positionTitle: string; positionCode: string | null; unitId: string | null }>
  units: Array<{ id: string; parentId: string | null; unitType: string }>
  workstreamRoles: Map<string, string[]>
  taskAssignments: Map<string, Array<{ role: string; acknowledgementStatus: string }>>
}

const STAFF_ROLES = new Set(['admin', 'chunhiem', 'phuta'])

const ADMIN_DOMAIN_CAPABILITIES = new Set<OperationsCapability>([
  'operations.event.view', 'operations.event.create', 'operations.event.manage', 'operations.event.transition',
  'operations.event.cancel', 'operations.event.override_readiness', 'operations.task.view', 'operations.task.create',
  'operations.task.manage', 'operations.task.assign', 'operations.task.reassign', 'operations.task.comment',
  'operations.workstream.create', 'operations.workstream.manage', 'operations.workstream.assign_lead',
  'operations.workstream.mark_ready', 'operations.audit.view',
])
const PARISH_LEADER_CAPABILITIES = new Set(ADMIN_DOMAIN_CAPABILITIES)
const UNIT_LEADER_CAPABILITIES = new Set<OperationsCapability>([
  'operations.event.view', 'operations.event.create', 'operations.event.manage', 'operations.task.view',
  'operations.task.create', 'operations.task.manage', 'operations.task.assign', 'operations.task.reassign',
  'operations.task.comment', 'operations.workstream.create', 'operations.workstream.manage',
  'operations.workstream.assign_lead', 'operations.workstream.mark_ready', 'operations.audit.view',
])

function deny(reason: OperationsDecision['reason'], positionTitles: string[] = [], unitIds: string[] = [], operationRoles: string[] = []): OperationsDecision {
  return { allowed: false, reason, positionTitles, unitIds, operationRoles }
}

async function loadResource(executor: DbExecutor, parishId: string, scope: OperationsScope): Promise<OperationsAuthorizationResource | null> {
  let task: { id: string; workstreamId: string | null; operationEventId: string | null } | undefined
  if (scope.taskId) {
    ;[task] = await executor.select({ id: operationTasks.id, workstreamId: operationTasks.workstreamId, operationEventId: operationTasks.operationEventId })
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
  let event: { id: string; scopeUnitId: string | null; organizerUserId: string | null; organizerPersonId: string | null } | undefined
  if (eventId) {
    ;[event] = await executor.select({ id: operationEvents.id, scopeUnitId: operationEvents.scopeUnitId, organizerUserId: operationEvents.organizerUserId, organizerPersonId: operationEvents.organizerPersonId })
      .from(operationEvents)
      .where(and(eq(operationEvents.parishId, parishId), eq(operationEvents.id, eventId), isNull(operationEvents.deletedAt))).limit(1)
    if (!event) return null
  }

  return { parishId, task, workstream, event, resourceUnitId: scope.resourceUnitId ?? workstream?.sourceUnitId ?? event?.scopeUnitId ?? null }
}

async function loadAuthorizationSnapshot(executor: DbExecutor, actor: ActorContext): Promise<OperationsAuthorizationSnapshot> {
  const [person] = await executor.select({ id: parishPeople.id }).from(parishPeople)
    .where(and(eq(parishPeople.parishId, actor.parishId), eq(parishPeople.linkedUserId, actor.userId), eq(parishPeople.serviceStatus, 'ACTIVE'), isNull(parishPeople.deletedAt))).limit(1)
  const today = new Date().toISOString().slice(0, 10)
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
  const units = person
    ? await executor.select({ id: parishOrganizationUnits.id, parentId: parishOrganizationUnits.parentId, unitType: parishOrganizationUnits.unitType })
      .from(parishOrganizationUnits)
      .where(and(eq(parishOrganizationUnits.parishId, actor.parishId), eq(parishOrganizationUnits.isActive, true), isNull(parishOrganizationUnits.deletedAt)))
    : []
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

function operationRoleAllows(capability: OperationsCapability, roles: string[]): boolean {
  if (capability === 'operations.event.view') return roles.length > 0
  // Personal task authority is additive: being a manager must neither grant
  // it implicitly nor mask an independently accepted task assignment.
  if (capability === 'operations.task.execute') return roles.includes('TASK_OWNER') || roles.includes('TASK_CONTRIBUTOR')
  if (capability === 'operations.task.approve') return roles.includes('TASK_APPROVER') || roles.includes('APPROVER')
  if (roles.includes('EVENT_ORGANIZER')) {
    return new Set<OperationsCapability>([
      'operations.event.view', 'operations.event.manage', 'operations.event.transition', 'operations.event.cancel',
      'operations.event.override_readiness', 'operations.task.view', 'operations.task.create', 'operations.task.manage',
      'operations.task.assign', 'operations.task.reassign', 'operations.task.comment', 'operations.workstream.create',
      'operations.workstream.manage', 'operations.workstream.assign_lead', 'operations.workstream.mark_ready',
      'operations.audit.view',
    ]).has(capability)
  }
  if (roles.includes('WORKSTREAM_LEAD')) {
    return new Set<OperationsCapability>([
      'operations.event.view', 'operations.task.view', 'operations.task.create', 'operations.task.manage',
      'operations.task.assign', 'operations.task.reassign', 'operations.task.comment', 'operations.workstream.manage',
      'operations.workstream.assign_lead', 'operations.workstream.mark_ready', 'operations.audit.view',
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
  const operationRoles: string[] = []
  if (resource.event && (
    resource.event.organizerUserId === actor.userId
    || Boolean(snapshot.personId && resource.event.organizerPersonId === snapshot.personId)
  )) operationRoles.push('EVENT_ORGANIZER')
  if (resource.workstream) operationRoles.push(...(snapshot.workstreamRoles.get(resource.workstream.id) ?? []))
  if (resource.task) {
    const assignments = snapshot.taskAssignments.get(resource.task.id) ?? []
    // Pending/declined assignments grant enough visibility to acknowledge or
    // inspect the assignment, never execute/approve authority.
    if (assignments.length > 0) operationRoles.push('TASK_ASSIGNEE')
    operationRoles.push(...assignments
      .filter(row => row.acknowledgementStatus === 'ACCEPTED')
      .map(row => `TASK_${row.role}`))
  }
  if (operationRoleAllows(capability, operationRoles)) {
    return { allowed: true, reason: 'OPERATION_ROLE', positionTitles: [], unitIds: [], operationRoles }
  }
  if (actor.role === 'admin' && ADMIN_DOMAIN_CAPABILITIES.has(capability)) {
    return { allowed: true, reason: 'ALLOWED', positionTitles: [], unitIds: [], operationRoles }
  }
  if (!snapshot.personId) return deny('POSITION_SCOPE', [], [], operationRoles)

  const unitsById = new Map(snapshot.units.map(unit => [unit.id, unit]))
  const positionTitles = snapshot.currentTerms.map(term => term.positionTitle)
  const unitIds = [...new Set(snapshot.currentTerms.flatMap(term => term.unitId ? descendantIds(snapshot.units, term.unitId) : []))]
  const requestedUnitId = resource.resourceUnitId
  const parishLeader = snapshot.currentTerms.some(term => term.positionCode === 'PARISH_LEADER' && (!term.unitId || unitsById.get(term.unitId)?.unitType === 'BOARD'))
  const unitLeader = requestedUnitId !== null && snapshot.currentTerms.some(term => {
    if (!term.unitId || !descendantIds(snapshot.units, term.unitId).includes(requestedUnitId)) return false
    const unitType = unitsById.get(term.unitId)?.unitType
    return (unitType === 'BRANCH' && term.positionCode === 'BRANCH_LEADER') || (unitType === 'COMMITTEE' && term.positionCode === 'COMMITTEE_LEADER')
  })
  const memberInScope = requestedUnitId !== null && snapshot.currentTerms.some(term => term.unitId && descendantIds(snapshot.units, term.unitId).includes(requestedUnitId))

  if (parishLeader && PARISH_LEADER_CAPABILITIES.has(capability)) return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
  if (unitLeader && UNIT_LEADER_CAPABILITIES.has(capability)) return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
  if (memberInScope && (capability === 'operations.event.view' || capability === 'operations.task.view' || capability === 'operations.task.comment')) {
    return { allowed: true, reason: 'POSITION_SCOPE', positionTitles, unitIds, operationRoles }
  }
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

export async function assertOperationsCapability(actor: ActorContext, capability: OperationsCapability, scope: OperationsScope, executor: DbExecutor = db): Promise<OperationsDecision> {
  const decision = await resolveOperationsAuthorization(actor, capability, scope, executor)
  if (!decision.allowed) throw Object.assign(new Error('Bạn không có quyền Operations trong phạm vi này.'), { status: 403, code: 'FORBIDDEN', decision })
  return decision
}

export async function getOperationsCallerPermissions(actor: ActorContext, scope: OperationsScope, executor: DbExecutor = db) {
  const capabilities: OperationsCapability[] = [
    'operations.event.view', 'operations.event.create', 'operations.event.manage', 'operations.event.transition',
    'operations.event.cancel', 'operations.event.override_readiness', 'operations.task.view', 'operations.task.create',
    'operations.task.manage', 'operations.task.assign', 'operations.task.execute', 'operations.task.reassign',
    'operations.task.approve', 'operations.task.comment', 'operations.workstream.create', 'operations.workstream.manage',
    'operations.workstream.assign_lead', 'operations.workstream.mark_ready', 'operations.audit.view',
  ]
  if (actor.parishId !== scope.parishId || !STAFF_ROLES.has(actor.role)) return Object.fromEntries(capabilities.map(capability => [capability, false]))
  const resource = await loadResource(executor, actor.parishId, scope)
  if (!resource) return Object.fromEntries(capabilities.map(capability => [capability, false]))
  const snapshot = await loadAuthorizationSnapshot(executor, actor)
  return Object.fromEntries(capabilities.map(capability => [capability, decideOperationsAuthorization(actor, capability, resource, snapshot).allowed]))
}
