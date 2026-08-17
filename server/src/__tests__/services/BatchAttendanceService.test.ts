import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { attendance, semesterLocks, users, students, classes, branches, academicYears } from '../../db/schema.js'
import { batchAttendanceApplicationService } from '../../services/BatchAttendanceApplicationService.js'
import { drizzleSemesterLockRepository } from '../../repositories/DrizzleSemesterLockRepository.js'

describe('Batch Attendance Application Service Micro-Step A1.3 Integration Tests', () => {
  const testParish = 'parish-batch-att-test'
  const teacherUserId = 'usr-teacher-batch-att'
  const adminUserId = 'usr-admin-batch-att'
  const student1Id = 'st-batch-att-01'
  const student2Id = 'st-batch-att-02'
  const classId = 'cl-batch-att-01'
  const branchId = 'br-batch-att-01'
  const yearId = 'AY-2025-2026'

  beforeAll(async () => {
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-BATCH-ATT', name: 'Lớp Batch Att', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()
    await db.insert(users).values([
      { id: teacherUserId, username: 'teacherbatchatt', fullName: 'Teacher Batch Att', passwordHash: 'hash', role: 'chunhiem', parishId: testParish },
      { id: adminUserId, username: 'adminbatchatt', fullName: 'Admin Batch Att', passwordHash: 'hash', role: 'admin', parishId: testParish },
    ]).onConflictDoNothing()

    await db.insert(students).values([
      { id: student1Id, code: 'ST-BATT-01', holyName: 'Anre', fullName: 'Student Batch 1', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId, parishId: testParish },
      { id: student2Id, code: 'ST-BATT-02', holyName: 'Teresa', fullName: 'Student Batch 2', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId, parishId: testParish },
    ]).onConflictDoNothing()
  })

  beforeEach(async () => {
    await db.delete(attendance)
    await db.delete(semesterLocks)
  })

  it('1. Processes batch attendance with ADR-008 partial success semantics', async () => {
    const items = [
      { studentId: student1Id, date: '2025-10-05', type: 'CatechismClass' as const, status: 'Present' as const, userId: teacherUserId, parishId: testParish },
      { studentId: student2Id, date: '2025-10-05', type: 'CatechismClass' as const, status: 'AbsentExcused' as const, note: 'Bệnh', userId: teacherUserId, parishId: testParish },
    ]

    const res = await batchAttendanceApplicationService.markAttendanceBatch(items, 2)

    expect(res.total).toBe(2)
    expect(res.successCount).toBe(2)
    expect(res.errorCount).toBe(0)
    expect(res.results[0].status).toBe('saved')
    expect(res.results[1].status).toBe('saved')
  })

  it('2. Returns itemized error when semester is locked for target date', async () => {
    // Lock HK1
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, true, adminUserId, testParish)

    const items = [
      { studentId: student1Id, date: '2025-10-05', type: 'CatechismClass' as const, status: 'Present' as const, userId: teacherUserId, parishId: testParish },
    ]

    const res = await batchAttendanceApplicationService.markAttendanceBatch(items)

    expect(res.errorCount).toBe(1)
    expect(res.results[0].status).toBe('error')
    expect(res.results[0].reason).toContain('đã bị khóa sổ điểm')
  })
})
