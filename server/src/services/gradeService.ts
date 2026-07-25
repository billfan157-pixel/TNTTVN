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

export interface GradeData {
  id?: string
  studentId: string
  academicYear?: string
  semester?: number
  scoreOral?: number | null
  score15m?: number | null
  score1Period?: number | null
  scoreMidterm?: number | null
  scoreFinal?: number | null
  scoreDaoDuc?: number | null
  comments?: string
}

export async function upsertGrade(data: GradeData, userId: string, parishId: string, ip: string, userAgent: string, tx: any = db) {
  const [existing] = await tx
    .select()
    .from(grades)
    .where(
      and(
        eq(grades.studentId, data.studentId),
        eq(grades.semester, data.semester!),
        eq(grades.academicYear, data.academicYear!),
        eq(grades.parishId, parishId),
      ),
    )
    .limit(1)

  const now = new Date().toISOString()
  if (existing) {
    await tx
      .update(grades)
      .set({ ...data, updatedAt: now, updatedBy: userId, version: (existing.version || 1) + 1 })
      .where(eq(grades.id, existing.id))

    await tx.insert(auditLogs).values({
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
    const [updated] = await tx.select().from(grades).where(eq(grades.id, existing.id)).limit(1)
    return updated
  }

  const id = generateId('GR')
  await tx.insert(grades).values({
    id,
    ...data,
    version: 1,
    parishId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
  })

  await tx.insert(auditLogs).values({
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

  const [created] = await tx.select().from(grades).where(eq(grades.id, id)).limit(1)
  return created
}

export async function upsertGradeBatch(dataList: GradeData[], userId: string, parishId: string, ip: string, userAgent: string) {
  try {
    await db.transaction(async (tx) => {
      for (const data of dataList) {
        await upsertGrade(data, userId, parishId, ip, userAgent, tx)
      }
    })
  } catch {
    for (const data of dataList) {
      await upsertGrade(data, userId, parishId, ip, userAgent, db)
    }
  }
  return true
}
