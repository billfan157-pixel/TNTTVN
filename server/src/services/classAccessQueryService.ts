import { and, eq } from 'drizzle-orm'
import { db, type DbExecutor } from '../db/index.js'
import { catechistAssignments, users } from '../db/schema.js'

/** Authorization data access. This module knows Drizzle, but not Hono or JWT. */
export async function getUserClassIds(
  userId: string,
  parishId: string,
  executor: DbExecutor = db,
): Promise<string[]> {
  const assignments = await executor
    .select({ classId: catechistAssignments.classId })
    .from(catechistAssignments)
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
    .select({ role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.parishId, parishId)))
    .limit(1)
  if (user?.role === 'admin') return true
  const classIds = await getUserClassIds(userId, parishId, executor)
  return classIds.includes(targetClassId)
}
