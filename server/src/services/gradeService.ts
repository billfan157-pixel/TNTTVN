import { db } from '../db/index.js'
import { grades, auditLogs } from '../db/schema.js'
import { eq, and, gte } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

export async function getGrades(parishId: string, studentId?: string, semester?: number, updatedAfter?: string) {
  const conditions = [eq(grades.parishId, parishId)]
  if (studentId) conditions.push(eq(grades.studentId, studentId))
  if (semester) conditions.push(eq(grades.semester, semester))
  if (updatedAfter) conditions.push(gte(grades.updatedAt, updatedAfter))
  return db.select().from(grades).where(and(...conditions))
}

export async function upsertGrade(data: any, userId: string, parishId: string, ip: string, userAgent: string) {
  const [existing] = await db
    .select()
    .from(grades)
    .where(
      and(
        eq(grades.studentId, data.studentId),
        eq(grades.semester, data.semester),
        eq(grades.academicYear, data.academicYear),
        eq(grades.parishId, parishId),
      ),
    )
    .limit(1)

  const now = new Date().toISOString()
  if (existing) {
    await db
      .update(grades)
      .set({ ...data, updatedAt: now, updatedBy: userId, version: (existing.version || 1) + 1 })
      .where(eq(grades.id, existing.id))

    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'UPDATE',
      entityType: 'grade',
      entityId: existing.id,
      oldValue: JSON.stringify(existing),
      newValue: JSON.stringify(data),
      ip,
      userAgent,
      parishId,
    })
    const [updated] = await db.select().from(grades).where(eq(grades.id, existing.id)).limit(1)
    return updated
  }

  const id = generateId('GR')
  await db.insert(grades).values({
    id,
    ...data,
    version: 1,
    parishId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'CREATE',
    entityType: 'grade',
    entityId: id,
    newValue: JSON.stringify(data),
    ip,
    userAgent,
    parishId,
  })

  const [created] = await db.select().from(grades).where(eq(grades.id, id)).limit(1)
  return created
}

export async function upsertGradeBatch(dataList: any[], userId: string, parishId: string, ip: string, userAgent: string) {
  for (const data of dataList) {
    await upsertGrade(data, userId, parishId, ip, userAgent)
  }
  return true
}
