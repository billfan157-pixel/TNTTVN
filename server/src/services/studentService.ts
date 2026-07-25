import { randomInt } from 'node:crypto'
import { db } from '../db/index.js'
import { students, auditLogs, classes, academicYears } from '../db/schema.js'
import { eq, and, gte, isNull, inArray } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import type { InferInsertModel } from 'drizzle-orm'

type CreateStudentData = Omit<InferInsertModel<typeof students>, 'id' | 'code' | 'parishId' | 'updatedBy' | 'createdAt' | 'updatedAt'>
type UpdateStudentData = Partial<CreateStudentData>

export async function getStudents(parishId: string, updatedAfter?: string, limit: number = 50, page: number = 1) {
  const conditions = [eq(students.parishId, parishId), isNull(students.deletedAt)]
  if (updatedAfter) {
    conditions.push(gte(students.updatedAt, updatedAfter))
  }
  const offset = (page - 1) * limit
  return db.select().from(students).where(and(...conditions)).limit(limit).offset(offset)
}

export async function getStudentsByClassIds(parishId: string, classIds: string[], updatedAfter?: string, limit: number = 50, page: number = 1) {
  const conditions = [eq(students.parishId, parishId), isNull(students.deletedAt), inArray(students.classId, classIds)]
  if (updatedAfter) {
    conditions.push(gte(students.updatedAt, updatedAfter))
  }
  const offset = (page - 1) * limit
  return db.select().from(students).where(and(...conditions)).limit(limit).offset(offset)
}

export async function getStudentClassId(id: string, parishId: string): Promise<string | null> {
  const [student] = await db
    .select({ classId: students.classId })
    .from(students)
    .where(and(eq(students.id, id), eq(students.parishId, parishId), isNull(students.deletedAt)))
    .limit(1)
  return student?.classId || null
}

export async function getStudentById(id: string, parishId: string) {
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, id), eq(students.parishId, parishId), isNull(students.deletedAt)))
    .limit(1)
  return student || null
}

async function getAcademicYearPrefix(classId: string, parishId: string): Promise<string> {
  const [result] = await db
    .select({ startDate: academicYears.startDate, deletedAt: classes.deletedAt })
    .from(classes)
    .leftJoin(academicYears, eq(classes.academicYearId, academicYears.id))
    .where(and(eq(classes.id, classId), eq(classes.parishId, parishId)))
    .limit(1)

  if (!result) {
    throw new Error(`Class not found: ${classId}`)
  }

  if (result.deletedAt) {
    throw new Error(`Class has been deleted: ${classId}`)
  }

  if (!result.startDate) {
    throw new Error(`Academic year not set for class: ${classId}`)
  }

  const year = new Date(result.startDate).getFullYear()
  if (isNaN(year)) {
    throw new Error(`Invalid academic year start date for class: ${classId}`)
  }

  return String(year)
}

export async function createStudent(data: CreateStudentData, userId: string, parishId: string, ip: string, userAgent: string) {
  const id = generateId('ST')
  const year = await getAcademicYearPrefix(data.classId, parishId)
  const code = `TN${year}${randomInt(100, 1000)}`
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

export async function updateStudent(id: string, data: UpdateStudentData, userId: string, parishId: string, ip: string, userAgent: string) {
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

  const now = new Date().toISOString()
  await db.update(students).set({ deletedAt: now, updatedAt: now, updatedBy: userId }).where(and(eq(students.id, id), eq(students.parishId, parishId)))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'SOFT_DELETE',
    entityType: 'student',
    entityId: id,
    oldValue: JSON.stringify(existing),
    ip,
    userAgent,
    parishId,
  })

  return true
}
