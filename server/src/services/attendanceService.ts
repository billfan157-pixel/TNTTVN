import { db, type DbExecutor } from '../db/index.js'
import { attendance, students } from '../db/schema.js'
import { eq, and, gte, inArray, isNull } from 'drizzle-orm'

/**
 * Phase 3 (legacy-writer removal): file này chỉ còn `getAttendance` (read).
 * `upsertAttendance` / `upsertAttendanceBatch` đã xóa — bypass surface cho
 * OCC/class-scope khác với Application Service. Đường ghi điểm danh trực tiếp:
 * `AttendanceApplicationService.markAttendance` (+ batch service) — xem
 * routes/attendance.ts. Leave review là alternate writer có current-class/lock
 * checks và version increment trong transaction của routes/leaveRequests.ts.
 */
export async function getAttendance(
  parishId: string,
  studentId?: string,
  date?: string,
  type?: 'SundayMass' | 'CatechismClass',
  updatedAfter?: string,
  studentIds?: string[],
  executor: DbExecutor = db,
) {
  if (studentIds?.length === 0) return []
  // ADR-016: Exclude attendance rows belonging to soft-deleted students, matching
  // gradeService.getGrades which filters with `activeStudentSubquery`.
  const activeStudentSubquery = executor
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
  return executor.select().from(attendance).where(and(...conditions))
}
