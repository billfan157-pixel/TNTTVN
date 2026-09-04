import { db } from '../db/index.js'
import { attendance, students } from '../db/schema.js'
import { eq, and, gte, inArray, isNull } from 'drizzle-orm'

/**
 * Phase 3 (legacy-writer removal): file này chỉ còn `getAttendance` (read).
 * `upsertAttendance` / `upsertAttendanceBatch` đã xóa — bypass surface cho
 * OCC/class-scope khác với Application Service. Đường ghi duy nhất:
 * `AttendanceApplicationService.markAttendance` (+ batch service) — xem
 * routes/attendance.ts. Xóa kèm tests của writers cũ (không phải để xanh).
 */
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
