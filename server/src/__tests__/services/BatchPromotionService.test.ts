import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { promotionRecords, semesterLocks, users, students, classes, branches, academicYears, grades, attendance } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { batchPromotionApplicationService } from '../../services/BatchPromotionApplicationService.js'
import { drizzleSemesterLockRepository } from '../../repositories/DrizzleSemesterLockRepository.js'

describe('Batch Promotion Micro-Step P3 Integration Tests', () => {
  const testParish = 'parish-batch-prm-test'
  const adminUserId = 'usr-admin-batch-prm'
  const student1Id = 'st-batch-01'
  const student2Id = 'st-batch-02'
  const student3Id = 'st-batch-03'
  const classId = 'cl-batch-01'
  const branchId = 'br-batch-01'
  const yearId = 'AY-2025-2026'
  const academicYear = '2025-2026'

  beforeAll(async () => {
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-BATCH', name: 'Lớp Batch', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()
    await db.insert(users).values({ id: adminUserId, username: 'adminbatchprm', fullName: 'Admin Batch Prm', passwordHash: 'hash', role: 'admin', parishId: testParish }).onConflictDoNothing()

    const studentList = [
      { id: student1Id, code: 'ST-BATCH-01', fullName: 'Học sinh 1' },
      { id: student2Id, code: 'ST-BATCH-02', fullName: 'Học sinh 2' },
      { id: student3Id, code: 'ST-BATCH-03', fullName: 'Học sinh 3' },
    ]

    for (const s of studentList) {
      await db.insert(students).values({
        id: s.id,
        code: s.code,
        holyName: 'Maria',
        fullName: s.fullName,
        gender: 'Nữ',
        dateOfBirth: '2015-01-01',
        parentName: 'P',
        parentPhone: '000',
        address: 'X',
        branch: 'AuNhi',
        classId,
        parishId: testParish,
      }).onConflictDoNothing()
    }
  })

  beforeEach(async () => {
    await db.delete(promotionRecords)
    await db.delete(semesterLocks)
    await db.delete(grades).where(eq(grades.parishId, testParish))
    await db.delete(attendance).where(eq(attendance.parishId, testParish))

    // Seed điểm + chuyên cần để máy chủ tính GPA/attendance khớp payload:
    // st-batch-01: GPA 8.0, 90% (9P/10) | st-batch-02: GPA 9.0, 95% (19P/20)
    // st-batch-03: GPA 4.0, 70% (7P/10)
    const seedMap = [
      { sid: student1Id, gpa: 8.0, present: 9, absent: 1 },
      { sid: student2Id, gpa: 9.0, present: 19, absent: 1 },
      { sid: student3Id, gpa: 4.0, present: 7, absent: 3 },
    ]
    let n = 0
    for (const s of seedMap) {
      await db.insert(grades).values({
        id: `grd-batch-${n}`,
        studentId: s.sid,
        academicYear,
        semester: 1,
        scoreFinal: s.gpa,
        parishId: testParish,
      })
      for (let i = 0; i < s.present + s.absent; i++) {
        const d = new Date(2025, 9, 5 + i)
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        await db.insert(attendance).values({
          id: `att-batch-${n}-${i}`,
          studentId: s.sid,
          date,
          type: 'CatechismClass',
          status: i < s.present ? 'Present' : 'AbsentUnexcused',
          parishId: testParish,
        })
      }
      n++
    }
  })

  it('1. Processes batch with partial-success semantics (ADR-008)', async () => {
    // Lock HK2
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    const items = [
      { studentId: student1Id, academicYear, targetClassId: classId, gpa: 8.0, attendanceRate: 90, userId: adminUserId, parishId: testParish },
      { studentId: student2Id, academicYear, targetClassId: classId, gpa: 9.0, attendanceRate: 95, userId: adminUserId, parishId: testParish },
      // Invalid item: manual override without reason -> causes error status for item 3
      { studentId: student3Id, academicYear, targetClassId: classId, gpa: 4.0, attendanceRate: 70, manualDecision: 'PROMOTED' as const, overrideReason: '', userId: adminUserId, parishId: testParish },
    ]

    const batchRes = await batchPromotionApplicationService.approveBatch(items, 2)

    expect(batchRes.total).toBe(3)
    expect(batchRes.successCount).toBe(2)
    expect(batchRes.errorCount).toBe(1)
    expect(batchRes.results[0].status).toBe('saved')
    expect(batchRes.results[1].status).toBe('saved')
    expect(batchRes.results[2].status).toBe('error')
    expect(batchRes.results[2].reason).toContain('Bắt buộc nhập lý do điều chỉnh')
  })

  it('2. PRM-02: approve học sinh đã soft-delete → 404, không ghi snapshot', async () => {
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    const deletedStudentId = 'st-batch-04-del'
    await db.insert(students).values({
      id: deletedStudentId,
      code: 'ST-BATCH-04-DEL',
      holyName: 'Maria',
      fullName: 'Học sinh đã nghỉ',
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '000',
      address: 'X',
      branch: 'AuNhi',
      classId,
      parishId: testParish,
      deletedAt: '2026-01-01T00:00:00.000Z',
    })
    await db.insert(grades).values({
      id: 'grd-batch-del',
      studentId: deletedStudentId,
      academicYear,
      semester: 1,
      scoreFinal: 8.0,
      parishId: testParish,
    })

    const res = await batchPromotionApplicationService.approveBatch([
      { studentId: deletedStudentId, academicYear, targetClassId: classId, gpa: 8.0, attendanceRate: 100, userId: adminUserId, parishId: testParish },
    ], 10)

    expect(res.total).toBe(1)
    expect(res.successCount).toBe(0)
    expect(res.errorCount).toBe(1)
    expect(res.results[0].status).toBe('error')
    expect(res.results[0].reason).toContain('Không tìm thấy thông tin thiếu nhi')
  })

  it('3. PRM-05: lỗi SQL constraint của 1 item không abort cả lô (per-item tx)', async () => {
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    const items = [
      { studentId: student1Id, academicYear, targetClassId: classId, gpa: 8.0, attendanceRate: 90, userId: adminUserId, parishId: testParish },
      { studentId: student2Id, academicYear, targetClassId: classId, gpa: 9.0, attendanceRate: 95, userId: adminUserId, parishId: testParish },
      // approved_by FK → users(id): userId không tồn tại → SQL constraint error ngay tại INSERT
      { studentId: student3Id, academicYear, targetClassId: classId, gpa: 4.0, attendanceRate: 70, userId: 'usr-khong-ton-tai', parishId: testParish },
    ]

    const res = await batchPromotionApplicationService.approveBatch(items, 10)

    expect(res.total).toBe(3)
    expect(res.successCount).toBe(2)
    expect(res.errorCount).toBe(1)
    expect(res.results[0].status).toBe('saved')
    expect(res.results[1].status).toBe('saved')
    expect(res.results[2].status).toBe('error')
    expect(res.results[2].reason).toMatch(/Failed query|FOREIGN KEY|constraint/i)
  })
})
