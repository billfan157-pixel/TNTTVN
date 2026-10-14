import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { getAttendance } from '../../services/attendanceService.js'
import { attendanceApplicationService } from '../../services/AttendanceApplicationService.js'
import { createStudent } from '../../services/studentService.js'
import { db } from '../../db/index.js'
import { branches, academicYears, classes, users, students, attendance, auditLogs } from '../../db/schema.js'

// Phase 3: file này chỉ giữ test cho `getAttendance` (read). Các writers
// legacy (upsertAttendance/upsertAttendanceBatch) đã xóa cùng tests của chúng
// — đường ghi duy nhất là AttendanceApplicationService (+ batch service),
// đã có coverage ở AttendanceApplicationService.test.ts.
describe('Server attendanceService read Tests', () => {
  const parishId = 'attendance-read-test'
  const branchId = 'attendance-read-branch'
  const classId = 'attendance-read-class'
  const userId = 'attendance-read-admin'
  const yearId = '2025-2026'
  const date = '2025-10-05'
  let studentId: string
  let attendanceId: string

  beforeAll(async () => {
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9, parishId })
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-08-01', endDate: '2026-07-31', parishId })
    await db.insert(classes).values({ id: classId, code: 'ATT-READ', name: 'Ấu Nhi điểm danh', branchId, academicYearId: yearId, parishId })
    await db.insert(users).values({ id: userId, username: userId, fullName: 'Attendance Read Admin', passwordHash: 'hash', role: 'admin', parishId })

    // The same identity is used by gradeService.test.ts in gia-ton. This suite
    // owns a separate parish so the real duplicate-identity policy stays active.
    const student = await createStudent({ holyName: 'A', fullName: 'A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId }, userId, parishId, '127.0.0.1', 'Vitest')
    studentId = student.id

    const record = await attendanceApplicationService.markAttendance({
      studentId,
      date,
      type: 'SundayMass',
      status: 'Present',
      userId,
      parishId,
      allowedClassIds: null,
      ip: '127.0.0.1',
      userAgent: 'Vitest',
    })
    attendanceId = record.id
  })

  afterAll(async () => {
    await db.delete(attendance).where(eq(attendance.parishId, parishId))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(classes).where(eq(classes.parishId, parishId))
    await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
    await db.delete(branches).where(eq(branches.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
  })

  it('getAttendance retrieves attendance records for parish', async () => {
    const records = await getAttendance(parishId)
    expect(records).toEqual([expect.objectContaining({
      id: attendanceId, studentId, parishId, date, type: 'SundayMass', status: 'Present',
    })])
  })

  it('does not return the seeded attendance to another parish', async () => {
    expect(await getAttendance('attendance-read-other')).toEqual([])
  })
})
