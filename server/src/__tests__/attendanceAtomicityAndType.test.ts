import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { client, db } from '../db/index.js'
import { academicYears, attendance, auditLogs, branches, classes, students, users } from '../db/schema.js'
import { attendanceApplicationService } from '../services/AttendanceApplicationService.js'

const parishId = 'attendance-integrity-test'
const branchId = 'br-att-integrity'
const academicYearId = 'ay-att-integrity'
const classId = 'cl-att-integrity'
const studentId = 'st-att-integrity'
const userId = 'usr-att-integrity'

async function cleanup() {
  try { await client.execute('DROP TRIGGER IF EXISTS test_block_mark_attendance_audit') } catch {}
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(attendance).where(eq(attendance.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
}

describe('attendance data-integrity boundary and session type SSOT', () => {
  beforeAll(async () => {
    await cleanup()
    await db.insert(branches).values({ id: branchId, parishId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9 })
    await db.insert(academicYears).values({ id: academicYearId, parishId, startDate: '2025-09-01', endDate: '2026-05-31' })
    await db.insert(classes).values({ id: classId, parishId, code: 'ATT-INT', name: 'Attendance Integrity', branchId, academicYearId })
    await db.insert(users).values({ id: userId, parishId, username: 'attendance_integrity_user', passwordHash: 'hash', fullName: 'Attendance User', role: 'admin' })
    await db.insert(students).values({
      id: studentId,
      parishId,
      code: 'ATT-INT-ST',
      holyName: 'Giuse',
      fullName: 'Attendance Student',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Parent',
      parentPhone: '0900000000',
      address: 'Test',
      branch: 'AuNhi',
      classId,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('accepts EucharisticAdoration as the authoritative third attendance type', async () => {
    const record = await attendanceApplicationService.markAttendance({
      studentId,
      date: '2026-01-10',
      type: 'EucharisticAdoration',
      status: 'Present',
      userId,
      parishId,
      allowedClassIds: null,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(record.type).toBe('EucharisticAdoration')
    const rows = await db.select().from(attendance).where(and(
      eq(attendance.parishId, parishId),
      eq(attendance.studentId, studentId),
      eq(attendance.date, '2026-01-10'),
      eq(attendance.type, 'EucharisticAdoration'),
    ))
    expect(rows).toHaveLength(1)
  })

  it('rolls back the attendance write when its MARK_ATTENDANCE audit cannot be written', async () => {
    await client.execute(`
      CREATE TRIGGER test_block_mark_attendance_audit
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'MARK_ATTENDANCE' AND NEW.parish_id = '${parishId}'
      BEGIN
        SELECT RAISE(ABORT, 'test blocks attendance audit');
      END
    `)

    try {
      await expect(attendanceApplicationService.markAttendance({
        studentId,
        date: '2026-01-11',
        type: 'CatechismClass',
        status: 'Present',
        userId,
        parishId,
        allowedClassIds: null,
        ip: '127.0.0.1',
        userAgent: 'vitest',
      })).rejects.toThrow()
    } finally {
      await client.execute('DROP TRIGGER IF EXISTS test_block_mark_attendance_audit')
    }

    const rows = await db.select().from(attendance).where(and(
      eq(attendance.parishId, parishId),
      eq(attendance.studentId, studentId),
      eq(attendance.date, '2026-01-11'),
      eq(attendance.type, 'CatechismClass'),
    ))
    expect(rows).toHaveLength(0)
  })
})
