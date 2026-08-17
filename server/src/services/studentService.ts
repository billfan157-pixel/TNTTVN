import { db } from '../db/index.js'
import { students, auditLogs, classes, academicYears } from '../db/schema.js'
import { eq, and, gte, isNull, inArray, sql } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { redactStudentForAudit } from '../utils/auditRedact.js'
import type { InferInsertModel } from 'drizzle-orm'
import { generateStudentCodeSuffix } from './studentCodeGenerator.js'

type StudentInsert = InferInsertModel<typeof students>

/** Fields the client is allowed to set on create/update. Never includes id/code/parish/timestamps. */
const STUDENT_WRITABLE_KEYS = [
  'holyName',
  'fullName',
  'gender',
  'dateOfBirth',
  'baptismDate',
  'firstCommunionDate',
  'confirmationDate',
  'parentName',
  'parentPhone',
  'address',
  'branch',
  'classId',
  'avatarUrl',
  'status',
  'notes',
] as const

type StudentWritableKey = (typeof STUDENT_WRITABLE_KEYS)[number]
export type CreateStudentData = Pick<StudentInsert, StudentWritableKey>
export type UpdateStudentData = Partial<CreateStudentData>

/**
 * Strip client-controlled / server-owned fields so spreads cannot overwrite
 * id, code, parishId, timestamps, deletedAt, etc.
 */
function pickStudentWritable(data: Record<string, unknown>): CreateStudentData {
  const out: Record<string, unknown> = {}
  for (const key of STUDENT_WRITABLE_KEYS) {
    if (data[key] !== undefined) {
      out[key] = data[key]
    }
  }
  return out as CreateStudentData
}

export async function getStudents(parishId: string, updatedAfter?: string, limit: number = 50, page: number = 1) {
  const conditions = [eq(students.parishId, parishId), isNull(students.deletedAt)]
  if (updatedAfter) {
    conditions.push(gte(students.updatedAt, updatedAfter))
  }
  const offset = (page - 1) * limit
  const [data, [{ total }]] = await Promise.all([
    db.select().from(students).where(and(...conditions)).orderBy(students.createdAt).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(students).where(and(...conditions)),
  ])
  return { data, total: Number(total) }
}

export async function getStudentsByClassIds(parishId: string, classIds: string[], updatedAfter?: string, limit: number = 50, page: number = 1) {
  if (!classIds.length) return { data: [], total: 0 }
  const conditions = [eq(students.parishId, parishId), isNull(students.deletedAt), inArray(students.classId, classIds)]
  if (updatedAfter) {
    conditions.push(gte(students.updatedAt, updatedAfter))
  }
  const offset = (page - 1) * limit
  const [data, [{ total }]] = await Promise.all([
    db.select().from(students).where(and(...conditions)).orderBy(students.createdAt).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(students).where(and(...conditions)),
  ])
  return { data, total: Number(total) }
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

/** Collision-resistant TN code: year + 6 random digits (retry on UNIQUE). */
export async function generateUniqueStudentCode(year: string, parishId?: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = `TN${year}${generateStudentCodeSuffix()}`
    const whereCond = parishId
      ? and(eq(students.code, code), eq(students.parishId, parishId))
      : eq(students.code, code)
    const [existing] = await db.select({ id: students.id }).from(students).where(whereCond).limit(1)
    if (!existing) return code
  }
  // Last resort: include timestamp fragment (matches TN{year}{6 digits} format)
  const fallbackNum = Date.now() % 1_000_000
  return `TN${year}${String(fallbackNum).padStart(6, '0')}`
}

function validateDateOfBirth(dob: string | undefined | null) {
  if (!dob) return
  const date = new Date(dob)
  if (isNaN(date.getTime())) {
    throw new Error('Ngày sinh không đúng định dạng YYYY-MM-DD')
  }
  const year = date.getFullYear()
  const currentYear = new Date().getFullYear()
  if (year < 1900 || year > currentYear) {
    throw new Error('Năm sinh không hợp lệ (phải từ 1900 đến hiện tại)')
  }
}

export async function createStudent(
  rawData: CreateStudentData | Record<string, unknown>,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
  idempotencyKey?: string,
) {
  const data = pickStudentWritable(rawData as Record<string, unknown>)

  // ADR-016 (offline-sync audit #3): nếu request trước bị timeout nhưng thật ra đã
  // insert (client retry cùng key), trả về student đã tạo thay vì tạo trùng.
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(students)
      .where(and(
        eq(students.idempotencyKey, idempotencyKey),
        eq(students.parishId, parishId),
        isNull(students.deletedAt),
      ))
      .limit(1)
    if (existing) return existing
  }

  if (!data.classId) {
    throw new Error('classId is required')
  }
  if (!data.fullName || !data.holyName) {
    throw new Error('holyName and fullName are required')
  }
  validateDateOfBirth(data.dateOfBirth)

  const id = generateId('ST')
  const year = await getAcademicYearPrefix(data.classId, parishId)
  const now = new Date().toISOString()

  // Transaction retry: generate code AND insert within same transaction
  // to eliminate TOCTOU race between SELECT (availability check) and INSERT.
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = `TN${year}${generateStudentCodeSuffix()}`
    try {
      return await db.transaction(async (tx) => {
        await tx.insert(students).values({
          holyName: data.holyName,
          fullName: data.fullName,
          gender: data.gender ?? 'Nam',
          dateOfBirth: data.dateOfBirth ?? '',
          baptismDate: data.baptismDate ?? null,
          firstCommunionDate: data.firstCommunionDate ?? null,
          confirmationDate: data.confirmationDate ?? null,
          parentName: data.parentName ?? '',
          parentPhone: data.parentPhone ?? '',
          address: data.address ?? '',
          branch: data.branch ?? 'AuNhi',
          classId: data.classId,
          avatarUrl: data.avatarUrl ?? null,
          status: data.status ?? 'Đang học',
          notes: data.notes ?? null,
          id,
          code,
          idempotencyKey: idempotencyKey || null,
          deletedAt: null,
          parishId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        })

        await tx.insert(auditLogs).values({
          id: generateId('AUD'),
          userId,
          action: 'CREATE',
          entityType: 'student',
          entityId: id,
          newValue: JSON.stringify(redactStudentForAudit(data)),
          ip,
          userAgent,
          parishId,
          createdAt: now,
        })

        const [created] = await tx
          .select()
          .from(students)
          .where(and(eq(students.id, id), eq(students.parishId, parishId)))
          .limit(1)

        return created
      })
    } catch (err: any) {
      const isUnique = err?.code === 'SQLITE_CONSTRAINT_UNIQUE'
        || err?.extendedCode === 'SQLITE_CONSTRAINT_UNIQUE'
        || err?.cause?.extendedCode === 'SQLITE_CONSTRAINT_UNIQUE'
        || err?.cause?.code === 'SQLITE_CONSTRAINT_UNIQUE'
      if (!isUnique) throw err
    }
  }
  // Last resort: include timestamp fragment
  const fallbackNum = Date.now() % 1_000_000
  const code = `TN${year}${String(fallbackNum).padStart(6, '0')}`
  return await db.transaction(async (tx) => {
    await tx.insert(students).values({
      holyName: data.holyName,
      fullName: data.fullName,
      gender: data.gender ?? 'Nam',
      dateOfBirth: data.dateOfBirth ?? '',
      baptismDate: data.baptismDate ?? null,
      firstCommunionDate: data.firstCommunionDate ?? null,
      confirmationDate: data.confirmationDate ?? null,
      parentName: data.parentName ?? '',
      parentPhone: data.parentPhone ?? '',
      address: data.address ?? '',
      branch: data.branch ?? 'AuNhi',
      classId: data.classId,
      avatarUrl: data.avatarUrl ?? null,
      status: data.status ?? 'Đang học',
      notes: data.notes ?? null,
      id,
      code,
      deletedAt: null,
      parishId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    })

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'CREATE',
      entityType: 'student',
      entityId: id,
      newValue: JSON.stringify(redactStudentForAudit(data)),
      ip,
      userAgent,
      parishId,
      createdAt: now,
    })

    const [created] = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.parishId, parishId)))
      .limit(1)

    return created
  })
}

export async function updateStudent(
  id: string,
  rawData: UpdateStudentData | Record<string, unknown>,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
) {
  const existing = await getStudentById(id, parishId)
  if (!existing) return null

  const data = pickStudentWritable(rawData as Record<string, unknown>)
  if (Object.keys(data).length === 0) {
    return existing
  }
  if (data.dateOfBirth !== undefined) {
    validateDateOfBirth(data.dateOfBirth)
  }

  if (data.classId && data.classId !== existing.classId) {
    await getAcademicYearPrefix(data.classId, parishId)
  }

  const now = new Date().toISOString()
  return await db.transaction(async (tx) => {
    await tx
      .update(students)
      .set({
        ...data,
        updatedAt: now,
        updatedBy: userId,
      })
      .where(and(eq(students.id, id), eq(students.parishId, parishId), isNull(students.deletedAt)))

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'UPDATE',
      entityType: 'student',
      entityId: id,
      oldValue: JSON.stringify(redactStudentForAudit(existing)),
      newValue: JSON.stringify(redactStudentForAudit(data)),
      ip,
      userAgent,
      parishId,
    })

    const [updated] = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.parishId, parishId)))
      .limit(1)

    return updated
  })
}

export async function deleteStudent(id: string, userId: string, parishId: string, ip: string, userAgent: string) {
  const existing = await getStudentById(id, parishId)
  if (!existing) return false

  const now = new Date().toISOString()
  return await db.transaction(async (tx) => {
    await tx
      .update(students)
      .set({ deletedAt: now, updatedAt: now, updatedBy: userId })
      .where(and(eq(students.id, id), eq(students.parishId, parishId)))

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'SOFT_DELETE',
      entityType: 'student',
      entityId: id,
      oldValue: JSON.stringify(redactStudentForAudit(existing)),
      ip,
      userAgent,
      parishId,
      createdAt: now,
    })

    return true
  })
}
