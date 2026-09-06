import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { DbExecutor } from '../db/index.js'
import { catechistAssignments, classes, users } from '../db/schema.js'

export type ClassAssignmentRole = 'chunhiem' | 'phuta'

export interface ProposedClassAssignment {
  userId: string
  classId: string
  roleInClass: ClassAssignmentRole
}

export type AssignmentReplacementScope =
  | { kind: 'class'; classId: string }
  | { kind: 'user'; userId: string }
  | { kind: 'pair'; classId: string; userId: string }

export interface AssignmentPolicyError {
  error: 'NOT_FOUND' | 'USER_INACTIVE' | 'ASSIGNMENTS_NOT_ALLOWED' | 'DUPLICATE_ASSIGNMENT_ROLE' | 'ALREADY_HAS_CN' | 'USER_ALREADY_CN'
  message: string
}

/** Translate database backstops into the same domain errors as preflight checks. */
export function mapClassAssignmentConstraintError(error: unknown): AssignmentPolicyError | null {
  const message = String((error as { message?: unknown })?.message ?? error).toLowerCase()
  if (
    message.includes('idx_catechist_assignments_one_cn_per_class')
    || (message.includes('unique constraint failed') && message.includes('catechist_assignments.class_id'))
  ) {
    return { error: 'ALREADY_HAS_CN', message: 'Lớp này đã có giáo viên chủ nhiệm' }
  }
  if (
    message.includes('idx_catechist_assignments_one_cn_class_per_user')
    || (message.includes('unique constraint failed') && message.includes('catechist_assignments.user_id'))
  ) {
    return { error: 'USER_ALREADY_CN', message: 'Người dùng này đã là chủ nhiệm của lớp khác' }
  }
  return null
}

const isReplaced = (assignment: ProposedClassAssignment, scope: AssignmentReplacementScope): boolean => {
  if (scope.kind === 'class') return assignment.classId === scope.classId
  if (scope.kind === 'user') return assignment.userId === scope.userId
  return assignment.classId === scope.classId && assignment.userId === scope.userId
}

/**
 * Canonical assignment invariant gate used by every supported writer.
 * FORCE_PASSWORD_CHANGE is intentionally assignable during account provisioning;
 * it still has no runtime class authority until the password-change gate activates it.
 */
export async function validateClassAssignmentReplacement(
  executor: DbExecutor,
  parishId: string,
  proposed: ProposedClassAssignment[],
  scope: AssignmentReplacementScope,
): Promise<AssignmentPolicyError | null> {
  const pairRoles = new Map<string, ClassAssignmentRole>()
  for (const assignment of proposed) {
    const key = `${assignment.userId}\u0000${assignment.classId}`
    const previousRole = pairRoles.get(key)
    if (previousRole && previousRole !== assignment.roleInClass) {
      return { error: 'DUPLICATE_ASSIGNMENT_ROLE', message: 'Một nhân sự không thể đồng thời là chủ nhiệm và phụ tá của cùng lớp' }
    }
    pairRoles.set(key, assignment.roleInClass)
  }

  const requestedClassIds = [...new Set(proposed.map(item => item.classId))]
  if (requestedClassIds.length > 0) {
    const activeClasses = await executor.select({ id: classes.id }).from(classes).where(and(
      eq(classes.parishId, parishId), inArray(classes.id, requestedClassIds), isNull(classes.deletedAt),
    ))
    if (activeClasses.length !== requestedClassIds.length) {
      return { error: 'NOT_FOUND', message: 'Có lớp học không tồn tại hoặc đã bị xóa' }
    }
  }

  const requestedUserIds = [...new Set(proposed.map(item => item.userId))]
  if (requestedUserIds.length > 0) {
    const requestedUsers = await executor.select({ id: users.id, role: users.role, status: users.status }).from(users).where(and(
      eq(users.parishId, parishId), inArray(users.id, requestedUserIds), isNull(users.deletedAt),
    ))
    if (requestedUsers.length !== requestedUserIds.length) {
      return { error: 'NOT_FOUND', message: 'Có nhân sự không tồn tại trong giáo xứ hiện tại' }
    }
    if (requestedUsers.some(user => !['ACTIVE', 'FORCE_PASSWORD_CHANGE'].includes(user.status))) {
      return { error: 'USER_INACTIVE', message: 'Có tài khoản nhân sự đã bị vô hiệu hóa' }
    }
    if (requestedUsers.some(user => !['chunhiem', 'phuta'].includes(user.role))) {
      return { error: 'ASSIGNMENTS_NOT_ALLOWED', message: 'Chỉ tài khoản GLV (chủ nhiệm/phụ tá) mới được phân công lớp' }
    }
  }

  const current = await executor
    .select({ userId: catechistAssignments.userId, classId: catechistAssignments.classId, roleInClass: catechistAssignments.roleInClass })
    .from(catechistAssignments)
    .where(eq(catechistAssignments.parishId, parishId))
  const resulting = [
    ...current.filter(item => !isReplaced(item, scope)),
    ...proposed,
  ]

  const homeroomByClass = new Map<string, string>()
  const homeroomByUser = new Map<string, string>()
  for (const assignment of resulting) {
    if (assignment.roleInClass !== 'chunhiem') continue
    const classOwner = homeroomByClass.get(assignment.classId)
    if (classOwner && classOwner !== assignment.userId) {
      return { error: 'ALREADY_HAS_CN', message: 'Lớp này đã có giáo viên chủ nhiệm' }
    }
    homeroomByClass.set(assignment.classId, assignment.userId)

    const userClass = homeroomByUser.get(assignment.userId)
    if (userClass && userClass !== assignment.classId) {
      return { error: 'USER_ALREADY_CN', message: 'Người dùng này đã là chủ nhiệm của lớp khác' }
    }
    homeroomByUser.set(assignment.userId, assignment.classId)
  }

  return null
}
