import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm'
import {
  operationTaskAssignees,
  operationTasks,
  operationWorkstreamMembers,
  parishPeople,
} from '../db/schema.js'
import type { DbExecutor } from '../db/transactions.js'

type OperationsIdentity = { userId?: string | null; personId?: string | null }

function selfApprovalError() {
  return Object.assign(
    new Error('Người thực hiện nhiệm vụ không được đồng thời là người duyệt nhiệm vụ đó.'),
    { status: 409, code: 'SELF_APPROVAL_FORBIDDEN' },
  )
}

async function canonicalIdentity(
  executor: DbExecutor,
  parishId: string,
  target: OperationsIdentity,
): Promise<{ userId: string | null; personId: string | null }> {
  if (target.personId) {
    const [person] = await executor.select({ id: parishPeople.id, linkedUserId: parishPeople.linkedUserId })
      .from(parishPeople)
      .where(and(eq(parishPeople.parishId, parishId), eq(parishPeople.id, target.personId), isNull(parishPeople.deletedAt)))
      .limit(1)
    return { userId: target.userId ?? person?.linkedUserId ?? null, personId: person?.id ?? target.personId }
  }
  if (target.userId) {
    const [person] = await executor.select({ id: parishPeople.id })
      .from(parishPeople)
      .where(and(eq(parishPeople.parishId, parishId), eq(parishPeople.linkedUserId, target.userId), isNull(parishPeople.deletedAt)))
      .limit(1)
    return { userId: target.userId, personId: person?.id ?? null }
  }
  return { userId: null, personId: null }
}

function assigneeIdentityPredicate(identity: { userId: string | null; personId: string | null }) {
  return or(
    identity.userId ? eq(operationTaskAssignees.userId, identity.userId) : undefined,
    identity.personId ? eq(operationTaskAssignees.personId, identity.personId) : undefined,
  )
}

function memberIdentityPredicate(identity: { userId: string | null; personId: string | null }) {
  return or(
    identity.userId ? eq(operationWorkstreamMembers.userId, identity.userId) : undefined,
    identity.personId ? eq(operationWorkstreamMembers.personId, identity.personId) : undefined,
  )
}

export async function assertTaskAssignmentSeparationOfDuty(
  executor: DbExecutor,
  parishId: string,
  taskId: string,
  target: OperationsIdentity,
  assignmentRole: 'OWNER' | 'CONTRIBUTOR' | 'APPROVER' | 'OBSERVER',
): Promise<void> {
  if (assignmentRole === 'OBSERVER') return
  const identity = await canonicalIdentity(executor, parishId, target)
  const conflictingRoles = assignmentRole === 'APPROVER' ? ['OWNER', 'CONTRIBUTOR'] as const : ['APPROVER'] as const
  const [conflictingAssignment] = await executor.select({ id: operationTaskAssignees.id })
    .from(operationTaskAssignees)
    .where(and(
      eq(operationTaskAssignees.parishId, parishId),
      eq(operationTaskAssignees.taskId, taskId),
      inArray(operationTaskAssignees.assignmentRole, [...conflictingRoles]),
      isNull(operationTaskAssignees.removedAt),
      assigneeIdentityPredicate(identity),
    ))
    .limit(1)
  if (conflictingAssignment) throw selfApprovalError()

  if (assignmentRole === 'OWNER' || assignmentRole === 'CONTRIBUTOR') {
    const [task] = await executor.select({ workstreamId: operationTasks.workstreamId })
      .from(operationTasks)
      .where(and(eq(operationTasks.parishId, parishId), eq(operationTasks.id, taskId), isNull(operationTasks.deletedAt)))
      .limit(1)
    if (!task?.workstreamId) return
    const now = new Date().toISOString()
    const [workstreamApprover] = await executor.select({ id: operationWorkstreamMembers.id })
      .from(operationWorkstreamMembers)
      .where(and(
        eq(operationWorkstreamMembers.parishId, parishId),
        eq(operationWorkstreamMembers.workstreamId, task.workstreamId),
        eq(operationWorkstreamMembers.operationRole, 'APPROVER'),
        isNull(operationWorkstreamMembers.removedAt),
        or(isNull(operationWorkstreamMembers.endsAt), gte(operationWorkstreamMembers.endsAt, now)),
        memberIdentityPredicate(identity),
      ))
      .limit(1)
    if (workstreamApprover) throw selfApprovalError()
  }
}

export async function assertWorkstreamMemberSeparationOfDuty(
  executor: DbExecutor,
  parishId: string,
  workstreamId: string,
  target: OperationsIdentity,
  operationRole: 'WORKSTREAM_LEAD' | 'CONTRIBUTOR' | 'APPROVER' | 'OBSERVER',
  validity: { startsAt?: string | null; endsAt?: string | null } = {},
): Promise<void> {
  if (operationRole !== 'APPROVER') return
  // An already-expired membership grants no approval authority. Future or
  // open-ended membership still conflicts because task assignments have no
  // validity window and may remain active when that authority starts.
  if (validity.endsAt && validity.endsAt < new Date().toISOString()) return
  const identity = await canonicalIdentity(executor, parishId, target)
  const [conflictingAssignment] = await executor.select({ id: operationTaskAssignees.id })
    .from(operationTaskAssignees)
    .innerJoin(operationTasks, and(
      eq(operationTasks.parishId, operationTaskAssignees.parishId),
      eq(operationTasks.id, operationTaskAssignees.taskId),
    ))
    .where(and(
      eq(operationTasks.parishId, parishId),
      eq(operationTasks.workstreamId, workstreamId),
      isNull(operationTasks.deletedAt),
      inArray(operationTaskAssignees.assignmentRole, ['OWNER', 'CONTRIBUTOR']),
      isNull(operationTaskAssignees.removedAt),
      assigneeIdentityPredicate(identity),
    ))
    .limit(1)
  if (conflictingAssignment) throw selfApprovalError()
}

export async function assertTaskApproverIsIndependent(
  executor: DbExecutor,
  parishId: string,
  taskId: string,
  actorUserId: string,
): Promise<void> {
  const identity = await canonicalIdentity(executor, parishId, { userId: actorUserId })
  const [conflictingAssignment] = await executor.select({ id: operationTaskAssignees.id })
    .from(operationTaskAssignees)
    .where(and(
      eq(operationTaskAssignees.parishId, parishId),
      eq(operationTaskAssignees.taskId, taskId),
      inArray(operationTaskAssignees.assignmentRole, ['OWNER', 'CONTRIBUTOR']),
      isNull(operationTaskAssignees.removedAt),
      assigneeIdentityPredicate(identity),
    ))
    .limit(1)
  if (conflictingAssignment) throw selfApprovalError()
}
