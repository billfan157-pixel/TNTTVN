import { db } from '../db/index.js'
import { students, auditLogs } from '../db/schema.js'
import { eq, and, gte } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

export async function getStudents(parishId: string, updatedAfter?: string) {
  const conditions = [eq(students.parishId, parishId)]
  if (updatedAfter) {
    conditions.push(gte(students.updatedAt, updatedAfter))
  }
  return db.select().from(students).where(and(...conditions))
}

export async function getStudentById(id: string, parishId: string) {
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, id), eq(students.parishId, parishId)))
    .limit(1)
  return student || null
}

export async function createStudent(data: any, userId: string, parishId: string, ip: string, userAgent: string) {
  const id = generateId('ST')
  const code = `TN2025${Math.floor(100 + Math.random() * 900)}`
  const now = new Date().toISOString()

  await db.insert(students).values({
    id,
    code,
    ...data,
    parishId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'CREATE',
    entityType: 'student',
    entityId: id,
    newValue: JSON.stringify(data),
    ip,
    userAgent,
    parishId,
  })

  return getStudentById(id, parishId)
}

export async function updateStudent(id: string, data: any, userId: string, parishId: string, ip: string, userAgent: string) {
  const existing = await getStudentById(id, parishId)
  if (!existing) return null

  const now = new Date().toISOString()
  await db
    .update(students)
    .set({ ...data, updatedAt: now, updatedBy: userId })
    .where(and(eq(students.id, id), eq(students.parishId, parishId)))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'UPDATE',
    entityType: 'student',
    entityId: id,
    oldValue: JSON.stringify(existing),
    newValue: JSON.stringify(data),
    ip,
    userAgent,
    parishId,
  })

  return getStudentById(id, parishId)
}

export async function deleteStudent(id: string, userId: string, parishId: string, ip: string, userAgent: string) {
  const existing = await getStudentById(id, parishId)
  if (!existing) return false

  await db.delete(students).where(and(eq(students.id, id), eq(students.parishId, parishId)))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'DELETE',
    entityType: 'student',
    entityId: id,
    oldValue: JSON.stringify(existing),
    ip,
    userAgent,
    parishId,
  })

  return true
}
