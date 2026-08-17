import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { promotionRecords, semesterLocks, users, students, classes, branches, academicYears, grades, attendance } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { promotionApplicationService } from '../../services/PromotionApplicationService.js'
import { drizzleSemesterLockRepository } from '../../repositories/DrizzleSemesterLockRepository.js'
import { drizzlePromotionRepository } from '../../repositories/DrizzlePromotionRepository.js'

describe('Promotion Module Micro-Step P1 Integration Tests', () => {
  const testParish = 'parish-prm-test'
  const adminUserId = 'usr-admin-prm'
  const studentId = 'st-prm-01'
  const classId = 'cl-prm-01'
  const branchId = 'br-prm-01'
  const yearId = 'AY-2025-2026'
  const academicYear = '2025-2026'

  beforeAll(async () => {
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-PRM', name: 'Lớp Prm', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()
    await db.insert(users).values({ id: adminUserId, username: 'adminprm', fullName: 'Admin Prm', passwordHash: 'hash', role: 'admin', parishId: testParish }).onConflictDoNothing()
    await db.insert(students).values({
      id: studentId,
      code: 'ST-PRM-01',
      holyName: 'Anna',
      fullName: 'Nguyen Thi Prm',
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '000',
      address: 'X',
      branch: 'AuNhi',
      classId,
      parishId: testParish,
    }).onConflictDoNothing()
  })

  beforeEach(async () => {
    await db.delete(promotionRecords)
    await db.delete(semesterLocks)
    await db.delete(grades).where(eq(grades.studentId, studentId))
    await db.delete(attendance).where(eq(attendance.studentId, studentId))
  })

  // Chỉ set scoreFinal → GPA học kỳ = chính số điểm đó (weights cộng hết vào final).
  async function seedGrade(score: number, semester = 1): Promise<string> {
    const id = `grd-prm-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    await db.insert(grades).values({
      id,
      studentId,
      academicYear,
      semester,
      scoreFinal: score,
      parishId: testParish,
    })
    return id
  }

  // present/absent trong khoảng 2025-10-05..(ngày sau), mọi row đều trong năm học.
  async function seedAttendance(present: number, absent: number): Promise<void> {
    const total = present + absent
    for (let i = 0; i < total; i++) {
      const d = new Date(2025, 9, 5 + i)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      await db.insert(attendance).values({
        id: `att-prm-${Date.now()}-${i}`,
        studentId,
        date,
        type: 'CatechismClass',
        status: i < present ? 'Present' : 'AbsentUnexcused',
        parishId: testParish,
      })
    }
  }

  it('1. Rejects promotion evaluation when Semester 2 is UNLOCKED (Throws 403)', async () => {
    await seedGrade(8.5)
    await seedAttendance(9, 1)
    // Ensure HK2 is UNLOCKED
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, false, adminUserId, testParish)

    await expect(
      promotionApplicationService.approvePromotion({
        studentId,
        academicYear,
        targetClassId: classId,
        gpa: 8.5,
        attendanceRate: 90,
        userId: adminUserId,
        parishId: testParish,
      })
    ).rejects.toThrow(/Học kỳ 2 năm học 2025-2026 chưa được khóa sổ điểm/)
  })

  it('2. Approves promotion as PROMOTED when HK2 is LOCKED and criteria met', async () => {
    await seedGrade(8.5)
    await seedAttendance(9, 1)
    // Lock HK2
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    const snapshot = await promotionApplicationService.approvePromotion({
      studentId,
      academicYear,
      targetClassId: classId,
      gpa: 8.5,
      attendanceRate: 90,
      userId: adminUserId,
      parishId: testParish,
    })

    expect(snapshot.autoDecision).toBe('PROMOTED')
    expect(snapshot.finalDecision).toBe('PROMOTED')
    expect(snapshot.isOverridden).toBe(false)
    expect(snapshot.version).toBe(1)
    expect(snapshot.status).toBe('ACTIVE')
    // Snapshot lưu giá trị máy chủ tự tính (khớp dữ liệu gửi lên)
    expect(snapshot.gpaSnapshot).toBe(8.5)
    expect(snapshot.attendanceSnapshot).toBe(90)
  })

  it('3. Approves promotion as RETAINED when GPA < 5.0 or Attendance < 80%', async () => {
    await seedGrade(4.2)
    await seedAttendance(3, 1)
    // Lock HK2
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    const snapshot = await promotionApplicationService.approvePromotion({
      studentId,
      academicYear,
      targetClassId: classId,
      gpa: 4.2,
      attendanceRate: 75,
      userId: adminUserId,
      parishId: testParish,
    })

    expect(snapshot.autoDecision).toBe('RETAINED')
    expect(snapshot.finalDecision).toBe('RETAINED')
  })

  it('4. Supports manual override with mandatory reason', async () => {
    await seedGrade(4.5)
    await seedAttendance(3, 1)
    // Lock HK2
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    const snapshot = await promotionApplicationService.approvePromotion({
      studentId,
      academicYear,
      targetClassId: classId,
      gpa: 4.5,
      attendanceRate: 75,
      manualDecision: 'PROMOTED',
      overrideReason: 'Gia đình hoàn cảnh khó khăn, Ban Giáo lý xét cho nâng đỡ lên lớp',
      userId: adminUserId,
      parishId: testParish,
    })

    expect(snapshot.autoDecision).toBe('RETAINED')
    expect(snapshot.finalDecision).toBe('PROMOTED')
    expect(snapshot.isOverridden).toBe(true)
    expect(snapshot.overrideReason).toContain('Ban Giáo lý xét cho nâng đỡ')
  })

  it('5. Enforces Idempotency and handles Re-evaluation with SUPERSEDED lineage', async () => {
    await seedGrade(7.0)
    await seedAttendance(17, 3)
    // Lock HK2
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    // First approval (v1)
    const snap1 = await promotionApplicationService.approvePromotion({
      studentId,
      academicYear,
      targetClassId: classId,
      gpa: 7.0,
      attendanceRate: 85,
      userId: adminUserId,
      parishId: testParish,
    })
    expect(snap1.version).toBe(1)

    // Repeated identical approval returns exact same snapshot (Idempotent)
    const snap1Repeat = await promotionApplicationService.approvePromotion({
      studentId,
      academicYear,
      targetClassId: classId,
      gpa: 7.0,
      attendanceRate: 85,
      userId: adminUserId,
      parishId: testParish,
    })
    expect(snap1Repeat.id).toBe(snap1.id)

    // Re-evaluation after grade edit (point thay đổi 7.0 → 9.0 trong DB) -> v2
    await db.update(grades).set({ scoreFinal: 9.0 }).where(eq(grades.studentId, studentId))
    const snap2 = await promotionApplicationService.approvePromotion({
      studentId,
      academicYear,
      targetClassId: classId,
      gpa: 9.0,
      attendanceRate: 85,
      userId: adminUserId,
      parishId: testParish,
    })

    expect(snap2.version).toBe(2)
    expect(snap2.status).toBe('ACTIVE')
    expect(snap2.gpaSnapshot).toBe(9.0)

    // Verify v1 in DB is now SUPERSEDED
    const active = await drizzlePromotionRepository.findActiveSnapshot(studentId, academicYear, testParish)
    expect(active?.version).toBe(2)
    expect(active?.gpaSnapshot).toBe(9.0)
  })

  it('6. F2-audit: Rejects approval when client GPA differs from server-computed GPA', async () => {
    await seedGrade(4.2)
    await seedAttendance(3, 1)
    // Lock HK2
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    // Máy chủ tính GPA 4.2 nhưng payload giả mạo gửi 8.5 → phải bị từ chối
    await expect(
      promotionApplicationService.approvePromotion({
        studentId,
        academicYear,
        targetClassId: classId,
        gpa: 8.5,
        attendanceRate: 75,
        userId: adminUserId,
        parishId: testParish,
      })
    ).rejects.toThrow(/không khớp dữ liệu máy chủ/)

    // Attendance cũng phải bị từ chối khi lệch
    await expect(
      promotionApplicationService.approvePromotion({
        studentId,
        academicYear,
        targetClassId: classId,
        gpa: 4.2,
        attendanceRate: 95,
        userId: adminUserId,
        parishId: testParish,
      })
    ).rejects.toThrow(/không khớp dữ liệu máy chủ/)
  })

  it('7. F3-audit: Student with NO grades gets "Chưa có kết quả điểm học tập" (not GPA (0) reason)', async () => {
    // Lock HK2 — không seed điểm, chỉ seed attendance để tách biệt lý do GPA
    await seedAttendance(9, 1)
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    const decision = await promotionApplicationService.evaluateStudentWithData({
      studentId,
      academicYear,
      parishId: testParish,
    })

    expect(decision.rejectionReasons).toContain('Chưa có kết quả điểm học tập')
    expect(decision.rejectionReasons.some((r) => r.includes('Điểm trung bình (0)'))).toBe(false)
    expect(decision.gpa).toBe(0) // DTO vẫn giữ số 0 cho khách gọi
  })
})
