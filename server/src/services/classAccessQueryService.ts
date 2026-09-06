import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, type DbExecutor } from '../db/index.js'
import { catechistAssignments, classes, users, students } from '../db/schema.js'
import type { ActorRole } from '../types/actor.js'
import { isSuperAdmin } from '../utils/protectedPrincipal.js'

export interface AcademicWriteExpectation { role: ActorRole; epoch?: number }

/** A captured scope is an upper bound, never a replacement for current authority. */
export async function checkAcademicWriteAccess(
  userId: string, parishId: string, classId: string, executor: DbExecutor,
  expected?: AcademicWriteExpectation,
  roles: readonly ActorRole[] = ['admin', 'chunhiem', 'phuta'],
): Promise<boolean> {
  const [actor] = await executor.select({ role: users.role, status: users.status, deletedAt: users.deletedAt, epoch: users.tokenVersion })
    .from(users).where(and(eq(users.id, userId), eq(users.parishId, parishId))).limit(1)
  if (!actor || actor.deletedAt || !roles.includes(actor.role as ActorRole)
    || (actor.status !== 'ACTIVE' && !(actor.status === 'LOCKED' && isSuperAdmin(userId, parishId, actor.role)))) return false
  if (expected && (actor.role !== expected.role || (expected.epoch !== undefined && actor.epoch !== expected.epoch))) return false
  return actor.role === 'admin' || (await getUserClassIds(userId, parishId, executor)).includes(classId)
}

/** Complete authorization scope; never paginate or filter it by a sync cursor. */
export async function getStudentIdsForClasses(parishId: string, classIds: string[]): Promise<string[]> {
  if (classIds.length === 0) return []
  const rows = await db.select({ id: students.id }).from(students)
    .where(and(eq(students.parishId, parishId), inArray(students.classId, classIds), isNull(students.deletedAt)))
  return rows.map(row => row.id)
}

/** Authorization data access. This module knows Drizzle, but not Hono or JWT. */
export async function getUserClassIds(
  userId: string,
  parishId: string,
  executor: DbExecutor = db,
): Promise<string[]> {
  const assignments = await executor
    .select({ classId: catechistAssignments.classId })
    .from(catechistAssignments)
    .innerJoin(classes, and(
      eq(classes.id, catechistAssignments.classId),
      eq(classes.parishId, catechistAssignments.parishId),
      isNull(classes.deletedAt),
    ))
    .where(and(eq(catechistAssignments.userId, userId), eq(catechistAssignments.parishId, parishId)))
  return assignments.map((assignment) => assignment.classId)
}

export async function checkUserClassAccess(
  userId: string,
  parishId: string,
  targetClassId: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [user] = await executor
    .select({ role: users.role, status: users.status, deletedAt: users.deletedAt })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.parishId, parishId)))
    .limit(1)
  if (!user || user.deletedAt || user.status !== 'ACTIVE') return false
  if (user.role === 'admin') return true
  if (user.role !== 'chunhiem' && user.role !== 'phuta') return false
  const classIds = await getUserClassIds(userId, parishId, executor)
  return classIds.includes(targetClassId)
}
