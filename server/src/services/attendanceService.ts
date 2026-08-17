import { db, type DbExecutor } from '../db/index.js'
import { attendance, auditLogs, students } from '../db/schema.js'
import { eq, and, gte, inArray, isNull } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { resolveAcademicYear, resolveSemester } from '../utils/academicYear.js'
import { semesterLockSpecification } from '../domain/SemesterLockSpecification.js'
import { VersionConflictError } from './gradeService.js'

export async function getAttendance(
  parishId: string,
  studentId?: string,
  date?: string,
  type?: 'SundayMass' | 'CatechismClass',
  updatedAfter?: string,
  studentIds?: string[],
) {
  // ADR-016: Exclude attendance rows belonging to soft-deleted students, matching
  // gradeService.getGrades which filters with `activeStudentSubquery`.
  const activeStudentSubquery = db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.parishId, parishId), isNull(students.deletedAt)))

  const conditions = [
    eq(attendance.parishId, parishId),
    inArray(attendance.studentId, activeStudentSubquery),
  ]
  if (studentId) conditions.push(eq(attendance.studentId, studentId))
  if (date) conditions.push(eq(attendance.date, date))
  if (type) conditions.push(eq(attendance.type, type))
  if (updatedAfter) conditions.push(gte(attendance.updatedAt, updatedAfter))
  if (studentIds && studentIds.length > 0) conditions.push(inArray(attendance.studentId, studentIds))
  return db.select().from(attendance).where(and(...conditions))
}

export interface AttendanceData {
  id?: string
  studentId: string
  date: string
  type: 'SundayMass' | 'CatechismClass'
  status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'
  note?: string
  version?: number
}

export async function upsertAttendance(data: AttendanceData, userId: string, parishId: string, ip: string, userAgent: string, tx: DbExecutor = db) {
  if (data.date) {
    const academicYear = resolveAcademicYear(data.date)
    const semester = resolveSemester(data.date)
    const isSemesterUnlocked = await semesterLockSpecification.isSatisfiedBy(academicYear, semester, parishId, tx)
    if (!isSemesterUnlocked) {
      const err = new Error(`Học kỳ ${semester} năm học ${academicYear} đã bị khóa sổ điểm. Không thể điểm danh.`) as any
      err.status = 403
      throw err
    }
  }

  // ADR-016: Reject attendance for soft-deleted / non-existent students.
  // The attendance table FK alone is not enough — we must enforce the business
  // rule "no attendance for deleted students" explicitly, matching gradeService.
  const [activeStudent] = await tx
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, data.studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
    .limit(1)
  if (!activeStudent) {
    const err = new Error('Không tìm thấy thiếu nhi hoặc thiếu nhi đã bị xóa') as any
    err.status = 404
    throw err
  }

  const [existing] = (await tx
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
    .limit(1)) as Array<typeof attendance.$inferSelect>

  const now = new Date().toISOString()
  const existingVersion = existing?.version
  if (existing) {
    // ADR-016 (S24): Enforce OCC the same way gradeService does — luôn bắt buộc,
    // bỏ cờ env STRICT_OCC_ENFORCEMENT (audit finding #11).
    if (typeof data.version !== 'number' && (existing.version || 1) > 1) {
      throw new VersionConflictError('Thiếu thông tin phiên bản (version) để cập nhật điểm danh.', existing)
    }

    const expectedVersion = typeof data.version === 'number' ? data.version : (existing.version || 1)
    if (typeof data.version === 'number' && existing.version !== data.version) {
      throw new VersionConflictError('Điểm danh đã bị thay đổi bởi người khác. Vui lòng làm mới trang.', existing)
    }

    // ADR-016: Idempotency — if status & note are unchanged, skip the audit log write
    // so re-submitting an unchanged attendance batch does not bloat audit_logs.
    const statusChanged = existing.status !== data.status
    const noteChanged = (existing.note || '') !== (data.note || '')
    const unchanged = !statusChanged && !noteChanged

    const { id: _attId, version: _v, ...safeAttData } = data as AttendanceData & { id?: string }
    const updateRes = await tx
      .update(attendance)
      .set({ ...safeAttData, updatedAt: now, updatedBy: userId, version: expectedVersion + 1 })
      .where(and(eq(attendance.id, existing.id), eq(attendance.version, expectedVersion)))

    const affectedRows = (updateRes as any).changes ?? (updateRes as any).rowsAffected ?? 1
    if (affectedRows === 0) {
      const [fresh] = await tx.select().from(attendance).where(and(eq(attendance.id, existing.id), eq(attendance.parishId, parishId))).limit(1)
      throw new VersionConflictError('Điểm danh đã bị thay đổi bởi người khác. Vui lòng làm mới trang.', fresh)
    }

    if (!unchanged) {
      await tx.insert(auditLogs).values({
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
    }
    const [updated] = await tx.select().from(attendance).where(and(eq(attendance.id, existing.id), eq(attendance.parishId, parishId))).limit(1)
    return updated
  }

  const id = generateId('AT')
  try {
    await tx.insert(attendance).values({
      id,
      ...data,
      version: 1,
      parishId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    })
  } catch (err: any) {
    const isUnique = err?.code === 'SQLITE_CONSTRAINT_UNIQUE'
      || err?.extendedCode === 'SQLITE_CONSTRAINT_UNIQUE'
      || String(err?.message || '').includes('UNIQUE constraint failed')
    if (isUnique) {
      // ADR-016: Concurrent duplicate creation — another request won the race and
      // inserted the row first. Fall back to the single-row upsert path instead of
      // surfacing a 500.
      return upsertAttendance(
        { ...data, version: existingVersion ?? 1 },
        userId,
        parishId,
        ip,
        userAgent,
        tx,
      )
    }
    throw err
  }

  await tx.insert(auditLogs).values({
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

  const [created] = await tx.select().from(attendance).where(and(eq(attendance.id, id), eq(attendance.parishId, parishId))).limit(1)
  return created
}

export async function upsertAttendanceBatch(
  date: string,
  type: 'SundayMass' | 'CatechismClass',
  records: { studentId: string; status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'; note?: string }[],
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
) {
  if (!records.length) {
    return { ok: true, total: 0, successCount: 0, errorCount: 0, results: [] }
  }

  // 1. Check semester lock ONCE for the entire batch date
  const academicYear = resolveAcademicYear(date)
  const semester = resolveSemester(date)
  const isSemesterUnlocked = await semesterLockSpecification.isSatisfiedBy(academicYear, semester, parishId, db)
  if (!isSemesterUnlocked) {
    const err = new Error(`Học kỳ ${semester} năm học ${academicYear} đã bị khóa sổ điểm. Không thể điểm danh.`) as any
    err.status = 403
    throw err
  }

  const studentIds = [...new Set(records.map(r => r.studentId))]

  // 2. Pre-fetch active students in 1 batch query
  const activeStudentRows = await db
    .select({ id: students.id })
    .from(students)
    .where(and(inArray(students.id, studentIds), eq(students.parishId, parishId), isNull(students.deletedAt)))
  const activeStudentSet = new Set(activeStudentRows.map(s => s.id))

  // 3. Pre-fetch existing attendance in 1 batch query
  const existingRows = await db
    .select()
    .from(attendance)
    .where(
      and(
        inArray(attendance.studentId, studentIds),
        eq(attendance.date, date),
        eq(attendance.type, type),
        eq(attendance.parishId, parishId),
      ),
    )
  const existingMap = new Map<string, typeof existingRows[0]>()
  for (const row of existingRows) {
    existingMap.set(row.studentId, row)
  }

  const results: { studentId: string; status: 'saved' | 'skipped' | 'error'; error?: string; record?: any }[] = []
  const now = new Date().toISOString()
  let successCount = 0
  let errorCount = 0

  await db.transaction(async (tx) => {
    for (const r of records) {
      if (!activeStudentSet.has(r.studentId)) {
        errorCount++
        results.push({ studentId: r.studentId, status: 'error', error: 'Không tìm thấy thiếu nhi hoặc thiếu nhi đã bị xóa' })
        continue
      }

      const existing = existingMap.get(r.studentId)
      if (existing) {
        const statusChanged = existing.status !== r.status
        const noteChanged = (existing.note || '') !== (r.note || '')
        const unchanged = !statusChanged && !noteChanged

        const nextVersion = (existing.version || 1) + 1
        await tx
          .update(attendance)
          .set({ status: r.status, note: r.note || null, updatedAt: now, updatedBy: userId, version: nextVersion })
          .where(and(eq(attendance.id, existing.id), eq(attendance.parishId, parishId), eq(attendance.version, (existing.version || 1))))

        if (!unchanged) {
          await tx.insert(auditLogs).values({
            id: generateId('AUD'),
            userId,
            action: 'UPDATE',
            entityType: 'attendance',
            entityId: existing.id,
            oldValue: JSON.stringify(existing),
            newValue: JSON.stringify(r),
            ip,
            userAgent,
            parishId,
          })
        }
        successCount++
        results.push({
          studentId: r.studentId,
          status: unchanged ? 'skipped' : 'saved',
          record: { ...existing, status: r.status, note: r.note || null, version: nextVersion, updatedAt: now, updatedBy: userId },
        })
      } else {
        const id = generateId('AT')
        const newRecord = {
          id,
          studentId: r.studentId,
          date,
          type,
          status: r.status,
          note: r.note || null,
          version: 1,
          parishId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        }
        await tx.insert(attendance).values(newRecord as any)
        await tx.insert(auditLogs).values({
          id: generateId('AUD'),
          userId,
          action: 'CREATE',
          entityType: 'attendance',
          entityId: id,
          newValue: JSON.stringify(r),
          ip,
          userAgent,
          parishId,
        })
        existingMap.set(r.studentId, newRecord as any)
        successCount++
        results.push({ studentId: r.studentId, status: 'saved', record: newRecord })
      }
    }
  })

  return {
    ok: true,
    total: records.length,
    successCount,
    errorCount,
    results,
  }
}