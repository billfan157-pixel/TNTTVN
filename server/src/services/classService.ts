import { db } from '../db/index.js'
import { classes, branches, academicYears, auditLogs } from '../db/schema.js'
import { eq, and, desc, isNull } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

type CreateClassData = Pick<InferInsertModel<typeof classes>, 'code' | 'name' | 'branchId' | 'academicYearId' | 'room'>
type UpdateClassData = Partial<CreateClassData>

export async function getClasses(parishId: string) {
  return db
    .select({
      id: classes.id,
      code: classes.code,
      name: classes.name,
      branchId: classes.branchId,
      branchName: branches.name,
      academicYearId: classes.academicYearId,
      academicYear: academicYears.startDate,
      room: classes.room,
      parishId: classes.parishId,
      createdAt: classes.createdAt,
      updatedAt: classes.updatedAt,
      updatedBy: classes.updatedBy,
    })
    .from(classes)
    .leftJoin(branches, eq(classes.branchId, branches.id))
    .leftJoin(academicYears, eq(classes.academicYearId, academicYears.id))
    .where(and(eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .orderBy(desc(classes.createdAt))
}

export async function getClassById(id: string, parishId: string) {
  const [result] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.parishId, parishId)))
    .limit(1)
  return result
}

export async function createClass(data: CreateClassData, userId: string, parishId: string, ip: string, userAgent: string) {
  const id = generateId('CLS')
  const now = new Date().toISOString()

  await db.insert(classes).values({
    id,
    code: data.code,
    name: data.name,
    branchId: data.branchId,
    academicYearId: data.academicYearId,
    room: data.room,
    parishId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'CREATE',
    entityType: 'class',
    entityId: id,
    newValue: JSON.stringify(data),
    ip,
    userAgent,
    parishId,
  })

  const [created] = await db.select().from(classes).where(eq(classes.id, id)).limit(1)
  return created
}

export async function updateClass(id: string, data: UpdateClassData, userId: string, parishId: string, ip: string, userAgent: string) {
  const [existing] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .limit(1)

  if (!existing) return null

  const now = new Date().toISOString()
  await db.update(classes)
    .set({
      code: data.code,
      name: data.name,
      branchId: data.branchId,
      academicYearId: data.academicYearId,
      room: data.room,
      updatedBy: userId,
      updatedAt: now,
    })
    .where(and(eq(classes.id, id), eq(classes.parishId, parishId)))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'UPDATE',
    entityType: 'class',
    entityId: id,
    oldValue: JSON.stringify(existing),
    newValue: JSON.stringify(data),
    ip,
    userAgent,
    parishId,
  })

  const [updated] = await db.select().from(classes).where(eq(classes.id, id)).limit(1)
  return updated
}

export async function deleteClass(id: string, userId: string, parishId: string, ip: string, userAgent: string) {
  const [existing] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .limit(1)

  if (!existing) return false

  const now = new Date().toISOString()
  await db.update(classes)
    .set({ deletedAt: now, updatedAt: now, updatedBy: userId })
    .where(and(eq(classes.id, id), eq(classes.parishId, parishId)))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'SOFT_DELETE',
    entityType: 'class',
    entityId: id,
    oldValue: JSON.stringify(existing),
    ip,
    userAgent,
    parishId,
  })

  return true
}
