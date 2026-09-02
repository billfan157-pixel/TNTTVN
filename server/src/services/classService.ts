import { db, runDbTransaction } from '../db/index.js'
import { classes, branches, academicYears, auditLogs, users, catechistAssignments, students, mappingMemory } from '../db/schema.js'
import { eq, and, desc, isNull, inArray, like, or, sql, gte, lte, asc } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

type CreateClassData = Pick<InferInsertModel<typeof classes>, 'code' | 'name' | 'branchId' | 'academicYearId' | 'room' | 'idempotencyKey'>
type UpdateClassData = Partial<CreateClassData>

async function enrichClassList(classList: any[], parishId: string) {
  if (classList.length === 0) return classList
  const classIds = classList.map(c => c.id)

  const assignments = await db
    .select()
    .from(catechistAssignments)
    .where(and(eq(catechistAssignments.parishId, parishId), inArray(catechistAssignments.classId, classIds)))
  const userIds = [...new Set(assignments.map(a => a.userId))]
  // Hardening: tránh query inArray(users.id, []) khi parish chưa có assignment nào (Drizzle trả false nhưng vẫn 1 query thừa).
  const userRows = userIds.length === 0 ? [] : await db
    .select({ id: users.id, fullName: users.fullName, username: users.username })
    .from(users)
    .where(and(inArray(users.id, userIds), eq(users.parishId, parishId)))
  const userMap = new Map(userRows.map(u => [u.id, u]))
  const byClass = new Map<string, typeof assignments>()
  for (const a of assignments) {
    if (!byClass.has(a.classId)) byClass.set(a.classId, [])
    byClass.get(a.classId)!.push(a)
  }

  const studentCounts = await db
    .select({ classId: students.classId, count: sql<number>`count(*)` })
    .from(students)
    .where(and(
      eq(students.parishId, parishId),
      isNull(students.deletedAt),
      inArray(students.classId, classIds),
    ))
    .groupBy(students.classId)
  const countMap = new Map(studentCounts.map(s => [s.classId, s.count]))

  return classList.map(c => {
    const ca = byClass.get(c.id) || []
    const homeroom = ca.find(a => a.roleInClass === 'chunhiem')
    return {
      ...c,
      homeroomTeacher: homeroom && userMap.has(homeroom.userId) ? { id: homeroom.userId, ...userMap.get(homeroom.userId) } : null,
      assistants: ca.filter(a => a.roleInClass === 'phuta').map(a => userMap.get(a.userId)).filter(Boolean),
      studentCount: countMap.get(c.id) || 0,
    }
  })
}

export async function getClasses(parishId: string, updatedAfter?: string, updatedBefore?: string) {
  const conditions = [eq(classes.parishId, parishId)]
  if (updatedAfter) conditions.push(gte(classes.updatedAt, updatedAfter))
  else conditions.push(isNull(classes.deletedAt))
  if (updatedBefore) conditions.push(lte(classes.updatedAt, updatedBefore))
  const classList = await db
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
      deletedAt: classes.deletedAt,
    })
    .from(classes)
    .leftJoin(branches, and(
      eq(classes.branchId, branches.id),
      eq(classes.parishId, branches.parishId),
    ))
    .leftJoin(academicYears, and(
      eq(classes.academicYearId, academicYears.id),
      eq(classes.parishId, academicYears.parishId),
    ))
    .where(and(...conditions))
    .orderBy(updatedAfter ? asc(classes.updatedAt) : desc(classes.createdAt), asc(classes.id))
  const active = classList.filter(item => !item.deletedAt)
  const enriched = await enrichClassList(active, parishId)
  if (!updatedAfter) return enriched
  const enrichedById = new Map(enriched.map(item => [item.id, item]))
  return classList.map(item => item.deletedAt ? item : enrichedById.get(item.id)!)
}

export async function getClassById(id: string, parishId: string) {
  const [result] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .limit(1)
  if (!result) return null
  const enriched = await enrichClassList([{ ...result, branchName: null, academicYear: null }], parishId)
  return enriched[0]
}

export async function createClass(data: CreateClassData, userId: string, parishId: string, ip: string, userAgent: string, idempotencyKey?: string) {
  // Idempotency check: nếu key đã tồn tại (từ request trước bị timeout), trả về class đã tạo
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(classes)
      .where(and(
        eq(classes.idempotencyKey, idempotencyKey),
        eq(classes.parishId, parishId),
        isNull(classes.deletedAt),
      ))
      .limit(1)
    if (existing) return existing
  }

  const id = generateId('CLS')
  const now = new Date().toISOString()

  return await runDbTransaction(async (tx) => {
    await tx.insert(classes).values({
      id,
      code: data.code,
      name: data.name,
      branchId: data.branchId,
      academicYearId: data.academicYearId,
      room: data.room,
      idempotencyKey: idempotencyKey || null,
      parishId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    })

    await tx.insert(auditLogs).values({
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

    const [created] = await tx.select().from(classes).where(and(eq(classes.id, id), eq(classes.parishId, parishId))).limit(1)
    return created
  })
}

export async function updateClass(id: string, data: UpdateClassData, userId: string, parishId: string, ip: string, userAgent: string) {
  const [existing] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .limit(1)

  if (!existing) return null

  const now = new Date().toISOString()
  return await runDbTransaction(async (tx) => {
    await tx.update(classes)
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

    await tx.insert(auditLogs).values({
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

    const [updated] = await tx.select().from(classes).where(and(eq(classes.id, id), eq(classes.parishId, parishId))).limit(1)
    return updated
  })
}

export async function deleteClass(id: string, userId: string, parishId: string, ip: string, userAgent: string) {
  const [existing] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .limit(1)

  if (!existing) return false

  const now = new Date().toISOString()
  return await runDbTransaction(async (tx) => {
    await tx.update(classes)
      .set({ deletedAt: now, updatedAt: now, updatedBy: userId })
      .where(and(eq(classes.id, id), eq(classes.parishId, parishId)))

    await tx.update(mappingMemory)
      .set({ isActive: 0 })
      .where(and(
        eq(mappingMemory.entityId, id),
        eq(mappingMemory.scope, 'class'),
        eq(mappingMemory.parishId, parishId),
      ))

    await tx.insert(auditLogs).values({
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
  })
}

export async function getAvailableTeachers(parishId: string) {
  return db
    .select({ id: users.id, fullName: users.fullName, username: users.username, role: users.role })
    .from(users)
    .where(and(
      eq(users.parishId, parishId),
      eq(users.status, 'ACTIVE'),
      inArray(users.role, ['admin', 'chunhiem', 'phuta']),
    ))
    .orderBy(users.fullName)
}

export async function searchClassesByName(name: string, parishId: string) {
  const normalized = name.trim().toLowerCase()
  return db
    .select({
      id: classes.id,
      code: classes.code,
      name: classes.name,
      branchId: classes.branchId,
      branchName: branches.name,
      academicYearId: classes.academicYearId,
      academicYear: academicYears.startDate,
    })
    .from(classes)
    .leftJoin(branches, and(
      eq(classes.branchId, branches.id),
      eq(classes.parishId, branches.parishId),
    ))
    .leftJoin(academicYears, and(
      eq(classes.academicYearId, academicYears.id),
      eq(classes.parishId, academicYears.parishId),
    ))
    .where(and(
      eq(classes.parishId, parishId),
      isNull(classes.deletedAt),
      or(
        like(classes.name, `%${normalized}%`),
        like(classes.code, `%${normalized}%`),
      ),
    ))
    .limit(20)
}

export async function assignUserToClass(
  classId: string,
  userId: string,
  roleInClass: 'chunhiem' | 'phuta',
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
) {
  const result = await runDbTransaction(async (tx) => {
    const [cls] = await tx
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
      .limit(1)
    if (!cls) return { error: 'NOT_FOUND', message: 'Lớp học không tồn tại' }

    const [user] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.parishId, parishId)))
      .limit(1)
    if (!user) return { error: 'NOT_FOUND', message: 'Người dùng không tồn tại' }
    if (user.status !== 'ACTIVE') return { error: 'USER_INACTIVE', message: 'Tài khoản đã bị vô hiệu hóa' }

    if (roleInClass === 'chunhiem') {
      const [existingCn] = await tx
        .select()
        .from(catechistAssignments)
        .where(and(
          eq(catechistAssignments.classId, classId),
          eq(catechistAssignments.parishId, parishId),
          eq(catechistAssignments.roleInClass, 'chunhiem'),
        ))
        .limit(1)
      if (existingCn) return { error: 'ALREADY_HAS_CN', message: 'Lớp này đã có giáo viên chủ nhiệm' }

      const [userIsCnElsewhere] = await tx
        .select()
        .from(catechistAssignments)
        .where(and(
          eq(catechistAssignments.userId, userId),
          eq(catechistAssignments.parishId, parishId),
          eq(catechistAssignments.roleInClass, 'chunhiem'),
        ))
        .limit(1)
      if (userIsCnElsewhere) return { error: 'USER_ALREADY_CN', message: 'Người dùng này đã là chủ nhiệm của lớp khác' }
    }

    const [existing] = await tx
      .select()
      .from(catechistAssignments)
      .where(and(eq(catechistAssignments.userId, userId), eq(catechistAssignments.classId, classId), eq(catechistAssignments.parishId, parishId)))
      .limit(1)

    const now = new Date().toISOString()
    if (existing) {
      if (existing.roleInClass === roleInClass) return { ok: true }
      await tx.update(catechistAssignments)
        .set({ roleInClass, updatedAt: now, updatedBy: adminUserId })
        .where(and(eq(catechistAssignments.id, existing.id), eq(catechistAssignments.parishId, parishId)))
    } else {
      // ADR-016: TOCTOU safety — idx_catechist_assignments_unique(user_id, class_id)
      // is the backstop. Two concurrent requests may both pass the SELECT above;
      // the second INSERT will hit SQLITE_CONSTRAINT_UNIQUE. Catch it and re-select
      // so we update (or no-op) instead of surfacing a 500 / creating a duplicate.
      try {
        await tx.insert(catechistAssignments).values({
          id: generateId('ASG'),
          userId,
          classId,
          roleInClass,
          parishId,
          createdAt: now,
          updatedAt: now,
          updatedBy: adminUserId,
        })
      } catch (err: any) {
        const isUnique = err?.code === 'SQLITE_CONSTRAINT_UNIQUE'
          || err?.extendedCode === 'SQLITE_CONSTRAINT_UNIQUE'
          || String(err?.message || '').includes('UNIQUE constraint failed')
        if (!isUnique) throw err

        const [duplicate] = await tx
          .select()
          .from(catechistAssignments)
          .where(and(eq(catechistAssignments.userId, userId), eq(catechistAssignments.classId, classId), eq(catechistAssignments.parishId, parishId)))
          .limit(1)
        if (!duplicate) throw err
        if (duplicate.roleInClass !== roleInClass) {
          await tx.update(catechistAssignments)
            .set({ roleInClass, updatedAt: now, updatedBy: adminUserId })
            .where(and(eq(catechistAssignments.id, duplicate.id), eq(catechistAssignments.parishId, parishId)))
        }
      }
    }

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: adminUserId,
      action: existing ? 'UPDATE_CLASS_ASSIGNMENT' : 'CREATE_CLASS_ASSIGNMENT',
      entityType: 'class',
      entityId: classId,
      newValue: JSON.stringify({ userId, roleInClass }),
      ip,
      userAgent,
      parishId,
    })

    return { ok: true }
  })

  return result
}

export async function removeUserFromClass(
  classId: string,
  userId: string,
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
) {
  // ATOMIC-F6 (audit 2026-08-21): delete + audit log trong 1 transaction —
  // trước đây delete chạy riêng nên audit insert fail = xóa không còn vết.
  return runDbTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(catechistAssignments)
      .where(and(eq(catechistAssignments.userId, userId), eq(catechistAssignments.classId, classId), eq(catechistAssignments.parishId, parishId)))
      .limit(1)
    if (!existing) return { error: 'NOT_FOUND', message: 'Phân công không tồn tại' }

    await tx.delete(catechistAssignments).where(and(
      eq(catechistAssignments.userId, userId),
      eq(catechistAssignments.classId, classId),
      eq(catechistAssignments.parishId, parishId),
    ))

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: adminUserId,
      action: 'DELETE_CLASS_ASSIGNMENT',
      entityType: 'class',
      entityId: classId,
      oldValue: JSON.stringify({ userId, roleInClass: existing.roleInClass }),
      ip,
      userAgent,
      parishId,
    })

    return { ok: true }
  })
}
