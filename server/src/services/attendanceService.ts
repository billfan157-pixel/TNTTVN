import { db } from '../db/index.js'
import { attendance, auditLogs } from '../db/schema.js'
import { eq, and, gte } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

export async function getAttendance(
  parishId: string,
  studentId?: string,
  date?: string,
  type?: 'SundayMass' | 'CatechismClass',
  updatedAfter?: string,
) {
  const conditions = [eq(attendance.parishId, parishId)]
  if (studentId) conditions.push(eq(attendance.studentId, studentId))
  if (date) conditions.push(eq(attendance.date, date))
  if (type) conditions.push(eq(attendance.type, type))
  if (updatedAfter) conditions.push(gte(attendance.updatedAt, updatedAfter))
  return db.select().from(attendance).where(and(...conditions))
}

export async function upsertAttendance(data: any, userId: string, parishId: string, ip: string, userAgent: string) {
  const [existing] = await db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.studentId, data.studentId),
        eq(attendance.date, data.date),
        eq(attendance.type, data.type),
        eq(attendance.parishId, parishId),
      ),
    )
    .limit(1)

  const now = new Date().toISOString()
  if (existing) {
    await db
      .update(attendance)
      .set({ ...data, updatedAt: now, updatedBy: userId, version: (existing.version || 1) + 1 })
      .where(eq(attendance.id, existing.id))

    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'UPDATE',
      entityType: 'attendance',
      entityId: existing.id,
      oldValue: JSON.stringify(existing),
      newValue: JSON.stringify(data),
      ip,
      userAgent,
      parishId,
    })
    return { ...existing, ...data }
  }

  const id = generateId('AT')
  await db.insert(attendance).values({
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
    entityType: 'attendance',
    entityId: id,
    newValue: JSON.stringify(data),
    ip,
    userAgent,
    parishId,
  })

  const [created] = await db.select().from(attendance).where(eq(attendance.id, id)).limit(1)
  return created
}

export async function upsertAttendanceBatch(
  records: { studentId: string; status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'; note?: string }[],
  date: string,
  type: 'SundayMass' | 'CatechismClass',
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
) {
  for (const r of records) {
    await upsertAttendance({ ...r, date, type }, userId, parishId, ip, userAgent)
  }
  return true
}
