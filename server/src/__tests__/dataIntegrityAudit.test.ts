import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '../db/index.js'
import { students, classes, branches, academicYears } from '../db/schema.js'
import { upsertGrade } from '../services/gradeService.js'
import { attendanceApplicationService } from '../services/AttendanceApplicationService.js'
import { generateId } from '../utils/id.js'

describe('Data Integrity Audit Integration Tests (DATA-INV-01 & DATA-INV-02)', () => {
  const parishId = 'parish-integrity-test'
  const activeStudentId = generateId('ST')
  const deletedStudentId = generateId('ST')
  const classId = generateId('CLS')
  const branchId = generateId('BR')
  const yearId = '2025-2026'

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: branchId, name: ' Ấu Nhi Integrity', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: generateId('CLS'), name: 'Lớp Integrity', branchId, academicYearId: yearId, parishId, createdAt: now, updatedAt: now }).onConflictDoNothing()

    await db.insert(students).values([
      {
        id: activeStudentId, code: generateId('S1'), holyName: 'Maria', fullName: 'Học Sinh Active', gender: 'Nữ', dateOfBirth: '2015-01-01',
        parentName: 'P', parentPhone: '0901111111', address: 'A', branch: 'AuNhi', classId, parishId, createdAt: now, updatedAt: now
      },
      {
        id: deletedStudentId, code: generateId('S2'), holyName: 'Giuse', fullName: 'Học Sinh Deleted', gender: 'Nam', dateOfBirth: '2015-02-02',
        parentName: 'P', parentPhone: '0902222222', address: 'B', branch: 'AuNhi', classId, parishId, deletedAt: now, createdAt: now, updatedAt: now
      },
    ]).onConflictDoNothing()
  })

  it('upsertGrade rejects soft-deleted student with 404', async () => {
    await expect(
      upsertGrade({
        studentId: deletedStudentId,
        academicYear: yearId,
        semester: 1,
        scoreOral: 8,
      }, 'usr-admin', parishId, '127.0.0.1', 'test')
    ).rejects.toThrow(/Không tìm thấy thiếu nhi hoặc thiếu nhi đã bị xóa/)
  })

  it('upsertGrade rejects non-existent student with 404', async () => {
    await expect(
      upsertGrade({
        studentId: 'non-existent-id',
        academicYear: yearId,
        semester: 1,
        scoreOral: 8,
      }, 'usr-admin', parishId, '127.0.0.1', 'test')
    ).rejects.toThrow(/Không tìm thấy thiếu nhi hoặc thiếu nhi đã bị xóa/)
  })

  it('markAttendance rejects soft-deleted student with 404', async () => {
    await expect(
      attendanceApplicationService.markAttendance({
        studentId: deletedStudentId,
        date: '2025-10-05',
        type: 'SundayMass',
        status: 'Present',
        userId: 'usr-admin',
        parishId,
        academicYear: yearId,
        semester: 1,
      })
    ).rejects.toThrow(/Không tìm thấy thiếu nhi hoặc thiếu nhi đã bị xóa/)
  })

  it('markAttendance rejects non-existent student with 404', async () => {
    await expect(
      attendanceApplicationService.markAttendance({
        studentId: 'non-existent-id',
        date: '2025-10-05',
        type: 'SundayMass',
        status: 'Present',
        userId: 'usr-admin',
        parishId,
        academicYear: yearId,
        semester: 1,
      })
    ).rejects.toThrow(/Không tìm thấy thiếu nhi hoặc thiếu nhi đã bị xóa/)
  })
})
