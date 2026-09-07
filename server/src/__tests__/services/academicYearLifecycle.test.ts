import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { db } from '../../db/index.js'
import {
  academicYears,
  academicYearSnapshots,
  assessments,
  branches,
  classes,
  gradeOverrides,
  grades,
  promotionRecords,
  semesterLocks,
  students,
  users,
} from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { academicYearLifecycleService } from '../../services/AcademicYearLifecycleService.js'
import { drizzleSemesterLockRepository } from '../../repositories/DrizzleSemesterLockRepository.js'
import { promotionApplicationService } from '../../services/PromotionApplicationService.js'
import { drizzlePromotionRepository } from '../../repositories/DrizzlePromotionRepository.js'

describe('Academic Year Lifecycle — State Machine & Wizard', () => {
  const testParish = 'parish-ayl-test'
  const adminUserId = 'usr-admin-ayl'
  const yearId = 'ayl-2025-2026'
  const nextYearId = '2027-2028'
  const classId = 'cl-ayl-01'
  const classCode = 'CL-AYL'
  const branchId = 'br-ayl-01'
  const studentGood = 'st-ayl-good'
  const studentLow = 'st-ayl-low'

  async function cleanupTestData(): Promise<void> {
    await db.delete(promotionRecords).where(eq(promotionRecords.parishId, testParish))
    await db.delete(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, testParish))
    await db.delete(semesterLocks).where(eq(semesterLocks.parishId, testParish))
    await db.delete(gradeOverrides).where(eq(gradeOverrides.parishId, testParish))
    await db.delete(grades).where(eq(grades.parishId, testParish))
    await db.delete(students).where(eq(students.parishId, testParish))
    await db.delete(assessments).where(eq(assessments.parishId, testParish))
    await db.delete(classes).where(eq(classes.parishId, testParish))
    await db.delete(academicYears).where(and(eq(academicYears.id, nextYearId), eq(academicYears.parishId, testParish)))
    await db.update(academicYears).set({ isLocked: 0, status: 'OPEN', currentSemester: 1, promotionTargetYearId: null }).where(and(eq(academicYears.id, yearId), eq(academicYears.parishId, testParish)))
  }

  async function seedBaseData(): Promise<void> {
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(users).values({ id: adminUserId, username: 'adminayl', fullName: 'Admin Ayl', passwordHash: 'hash', role: 'admin', parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: classCode, name: 'Lớp AYL', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()
    await db.insert(assessments).values({ id: 'asm-ayl-1', name: 'Kiểm tra miệng', type: 'ORAL', weight: 1, semester: 1, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()

    for (const [id, code] of [[studentGood, 'ST-AYL-G'], [studentLow, 'ST-AYL-L']] as const) {
      await db.insert(students).values({
        id,
        code,
        holyName: 'Anna',
        fullName: `Hoc Sinh ${code}`,
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
  }

  beforeAll(async () => {
    await cleanupTestData()
    await seedBaseData()
  })

  beforeEach(async () => {
    await cleanupTestData()
    await seedBaseData()
  })

  async function seedGrade(studentId: string, score: number, semester: 1 | 2): Promise<void> {
    await db.insert(grades).values({
      id: `grd-ayl-${studentId}-${semester}`,
      studentId,
      academicYear: yearId,
      semester,
      scoreFinal: score,
      parishId: testParish,
    }).onConflictDoNothing()
  }

  async function lockBothSemesters(): Promise<void> {
    await drizzleSemesterLockRepository.setLockState(yearId, 1, true, adminUserId, testParish)
    await drizzleSemesterLockRepository.setLockState(yearId, 2, true, adminUserId, testParish)
  }

  it('1. startSemester2 rejects when HK1 is NOT locked (403)', async () => {
    await expect(
      academicYearLifecycleService.startSemester2(yearId, adminUserId, testParish)
    ).rejects.toThrow(/Phải khóa sổ điểm HK1/)
  })

  it('2. startSemester2 succeeds after HK1 locked and sets currentSemester=2', async () => {
    await drizzleSemesterLockRepository.setLockState(yearId, 1, true, adminUserId, testParish)
    const res = await academicYearLifecycleService.startSemester2(yearId, adminUserId, testParish)
    expect(res.currentSemester).toBe(2)
    const [year] = await db.select().from(academicYears).where(eq(academicYears.id, yearId))
    expect(year.currentSemester).toBe(2)
  })

  it('3. finalizeYear rejects when HK2 is NOT locked (403)', async () => {
    await drizzleSemesterLockRepository.setLockState(yearId, 1, true, adminUserId, testParish)
    await expect(
      academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish)
    ).rejects.toThrow(/Phải khóa sổ điểm cả HK1 và HK2/)
  })

  it('4. finalizeYear rejects when data incomplete (400 + checklist details)', async () => {
    await lockBothSemesters()
    await seedGrade(studentGood, 9, 1)
    const err: any = await academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish).catch((e) => e)
    expect(err.status).toBe(400)
    expect(err.message).toMatch(/chưa thể chốt/i)
    expect(err.details.ready).toBe(false)
    const codes = (err.details.issues as any[]).map((i: any) => i.code)
    expect(codes).toContain('STUDENTS_MISSING_HK2_GRADES')
    expect(codes).toContain('STUDENTS_NOT_CLASSIFIED')
  })

  it('5. finalizeYear creates snapshots (GPA, classification, decision) and locks the year', async () => {
    await lockBothSemesters()
    await seedGrade(studentGood, 9, 1)
    await seedGrade(studentGood, 9, 2)
    await seedGrade(studentLow, 3, 1)
    await seedGrade(studentLow, 3, 2)

    const res = await academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish)
    expect(res.status).toBe('FINALIZED')
    expect(res.snapshotCount).toBe(2)

    const [year] = await db.select().from(academicYears).where(eq(academicYears.id, yearId))
    expect(year.isLocked).toBe(1)
    expect(year.status).toBe('FINALIZED')

    const snapshots = await db.select().from(academicYearSnapshots)
    const good = snapshots.find((s) => s.studentId === studentGood)
    const low = snapshots.find((s) => s.studentId === studentLow)
    expect(good?.yearGpa).toBe(9)
    expect(good?.classification).toBe('Xuất Sắc')
    expect(good?.promotionStatus).toBe('PROMOTED')
    expect(good?.attendanceRate).toBe(100)
    expect(low?.yearGpa).toBe(3)
    expect(low?.classification).toBe('Yếu')
    expect(low?.promotionStatus).toBe('RETAINED')

    // Derived status của list: FINALIZED
    const list = await academicYearLifecycleService.listAcademicYears(testParish)
    const listed = list.find((y) => y.id === yearId)
    expect(listed?.status).toBe('FINALIZED')
    expect(listed?.snapshotCount).toBe(2)
  })

  it('5b. D1: finalizeYear keeps every read and promotion specification on the transaction executor', async () => {
    await lockBothSemesters()
    await seedGrade(studentGood, 9, 1)
    await seedGrade(studentGood, 9, 2)
    await seedGrade(studentLow, 3, 1)
    await seedGrade(studentLow, 3, 2)

    const globalSelectSpy = vi.spyOn(db, 'select')
    const evaluationSpy = vi.spyOn(promotionApplicationService, 'evaluateStudent')
    try {
      const res = await academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish)

      expect(res.status).toBe('FINALIZED')
      expect(globalSelectSpy).not.toHaveBeenCalled()
      expect(evaluationSpy).toHaveBeenCalledTimes(2)
      for (const call of evaluationSpy.mock.calls) {
        expect(call[1]).toBeDefined()
        expect(call[1]).not.toBe(db)
      }
    } finally {
      globalSelectSpy.mockRestore()
      evaluationSpy.mockRestore()
    }
  })

  it('6. copyAcademicYear creates new year and copies classes + assessments (no grades)', async () => {
    const res = await academicYearLifecycleService.copyAcademicYear(yearId, nextYearId, adminUserId, testParish)
    expect(res.year.id).toBe(nextYearId)
    expect(res.copiedClasses).toBe(1)
    expect(res.copiedAssessments).toBe(1)

    const newYear = await db.select().from(academicYears).where(eq(academicYears.id, nextYearId))
    expect(newYear[0]?.status).toBe('OPEN')
    expect(newYear[0]?.currentSemester).toBe(1)

    const newClasses = await db.select().from(classes).where(eq(classes.academicYearId, nextYearId))
    expect(newClasses).toHaveLength(1)
    expect(newClasses[0].code).toBe(classCode)

    const newAssessments = await db.select().from(assessments).where(eq(assessments.academicYearId, nextYearId))
    expect(newAssessments).toHaveLength(1)

    // Idempotent: chạy lại trả về năm đã tồn tại, không copy trùng
    const again = await academicYearLifecycleService.copyAcademicYear(yearId, nextYearId, adminUserId, testParish)
    expect(again.copiedClasses).toBe(0)
  })

  it('7. promoteYear requires FINALIZED (403 khi chưa finalize)', async () => {
    await expect(
      academicYearLifecycleService.promoteYear(yearId, nextYearId, adminUserId, testParish)
    ).rejects.toThrow(/chưa chốt/)
  })

  it('8. promoteYear creates promotion_records and moves students to next-year class', async () => {
    await lockBothSemesters()
    await seedGrade(studentGood, 9, 1)
    await seedGrade(studentGood, 9, 2)
    await seedGrade(studentLow, 3, 1)
    await seedGrade(studentLow, 3, 2)
    await academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish)

    const res = await academicYearLifecycleService.promoteYear(yearId, nextYearId, adminUserId, testParish)
    expect(res.nextYearId).toBe(nextYearId)
    expect(res.total).toBe(2)
    expect(res.movedToNextYear).toBe(2)
    expect(res.retained).toBe(1)
    expect(res.errors).toHaveLength(0)

    const records = await db.select().from(promotionRecords).where(eq(promotionRecords.parishId, testParish))
    expect(records).toHaveLength(2)

    const nextClassId = `${nextYearId}-${classCode}`
    const goodStudent = await db.select().from(students).where(eq(students.id, studentGood))
    expect(goodStudent[0].classId).toBe(nextClassId)

    // Năm học đã sang PROMOTED
    const list = await academicYearLifecycleService.listAcademicYears(testParish)
    expect(list.find((y) => y.id === yearId)?.status).toBe('PROMOTED')

    // Chạy lại → 409 (đã promote)
    await expect(
      academicYearLifecycleService.promoteYear(yearId, nextYearId, adminUserId, testParish)
    ).rejects.toThrow(/đã xét lên lớp/)
  })

  it('8b. AYL-F2: finalize ÁP grade overrides — snapshot khớp verify lúc promote (không DATA_MISMATCH)', async () => {
    await lockBothSemesters()
    await seedGrade(studentGood, 9, 1)
    await seedGrade(studentGood, 9, 2)
    await seedGrade(studentLow, 3, 1)
    await seedGrade(studentLow, 3, 2)

    // Override điểm final HK1 của studentGood: 9 → 6
    const [g1] = await db.select().from(grades).where(and(eq(grades.studentId, studentGood), eq(grades.semester, 1)))
    await db.insert(gradeOverrides).values({
      id: 'grov-ayl-f2',
      gradeId: g1.id,
      parishId: testParish,
      scoreField: 'scoreFinal' as const,
      manualValue: 6,
      reasonCode: 'TeacherAdjustment',
      overriddenBy: adminUserId,
      overriddenAt: new Date().toISOString(),
    })

    // Trước fix: snapshot yearGpa = 9 (điểm thô) nhưng approvePromotion tính lại
    // với override = 7.5 → 409 DATA_MISMATCH cho toàn bộ HS có override.
    const res = await academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish)
    expect(res.status).toBe('FINALIZED')

    const snapshots = await db.select().from(academicYearSnapshots)
    const good = snapshots.find((s) => s.studentId === studentGood)
    expect(good?.semester1Gpa).toBe(6)
    expect(good?.semester2Gpa).toBe(9)
    expect(good?.yearGpa).toBe(7.5)
    expect(good?.classification).toBe('Khá')

    // Promote phải thành công không lỗi cho HS này
    const promoted = await academicYearLifecycleService.promoteYear(yearId, nextYearId, adminUserId, testParish)
    expect(promoted.errors).toHaveLength(0)
    expect(promoted.movedToNextYear).toBe(2)

    const records = await db.select().from(promotionRecords).where(eq(promotionRecords.parishId, testParish))
    const goodRecord = records.find((r) => r.studentId === studentGood)
    expect(goodRecord?.gpaSnapshot).toBe(7.5)
  })

  it('8c. PRM-F4: promoteYear ghi warnings khi lớp năm mới thiếu mã tương ứng', async () => {
    await lockBothSemesters()
    await seedGrade(studentGood, 9, 1)
    await seedGrade(studentGood, 9, 2)
    await seedGrade(studentLow, 3, 1)
    await seedGrade(studentLow, 3, 2)
    await academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish)

    // Tạo sẵn năm mới + lớp KHÁC MÃ để mapping theo code trượt
    await db.insert(academicYears).values({
      id: nextYearId, startDate: '2027-08-01', endDate: '2028-07-31', parishId: testParish,
    }).onConflictDoNothing()
    await db.insert(classes).values({
      id: `${nextYearId}-OTHER`, code: 'OTHER-CODE', name: 'Lớp khác mã',
      branchId, academicYearId: nextYearId, parishId: testParish,
    }).onConflictDoNothing()

    const res = await academicYearLifecycleService.promoteYear(yearId, nextYearId, adminUserId, testParish)
    expect(res.errors).toHaveLength(2)
    expect(res.unresolvedCount).toBe(2)
    await expect(academicYearLifecycleService.archiveYear(yearId, adminUserId, testParish)).rejects.toMatchObject({ status: 409 })
    expect(res.movedToNextYear).toBe(0)
    expect(res.warnings).toHaveLength(2)
    // PROMO-FIX (2026-08-22): HS ĐỦ ĐIỀU KIỆN đi qua nhánh "lên khối +1" — khi
    // năm mới không có lớp khối kế lẫn lớp cùng mã → warning "Đủ điều kiện nhưng…".
    // HS GIỮ LỚP đi qua nhánh map theo mã → warning "không có cùng mã". Cả hai
    // đều phải "ở lại lớp năm cũ".
    expect(res.warnings.some((w) => w.reason.includes('Đủ điều kiện nhưng'))).toBe(true)
    expect(res.warnings.some((w) => w.reason.includes('không có cùng mã'))).toBe(true)
    for (const w of res.warnings) {
      expect(w.reason).toMatch(/ở lại lớp năm cũ/)
    }

    // HS vẫn ở lại lớp cũ (năm học cũ) — hành vi giữ nguyên, chỉ không còn im lặng
    const [goodStudent] = await db.select().from(students).where(eq(students.id, studentGood))
    expect(goodStudent.classId).toBe(classId)
  })

  it('XD-01: approval-only is unresolved; completion survives a later membership correction and has no duplicate receipt on retry', async () => {
    await lockBothSemesters()
    await seedGrade(studentGood, 9, 1)
    await seedGrade(studentGood, 9, 2)
    await seedGrade(studentLow, 3, 1)
    await seedGrade(studentLow, 3, 2)
    await academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish)
    await academicYearLifecycleService.copyAcademicYear(yearId, nextYearId, adminUserId, testParish)
    const snapshots = await db.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, testParish))
    const snap = snapshots.find(row => row.studentId === studentGood)!
    const approval = await promotionApplicationService.approvePromotion({ studentId: studentGood, academicYear: yearId, targetClassId: classId, nextClassId: `${nextYearId}-${classCode}`, gpa: snap.yearGpa!, attendanceRate: snap.attendanceRate!, userId: adminUserId, parishId: testParish })
    expect(approval.completedAt).toBeFalsy()
    expect((await academicYearLifecycleService.getPromotionReconciliation(yearId, testParish)).unresolvedCount).toBe(2)
    const result = await academicYearLifecycleService.promoteYear(yearId, nextYearId, adminUserId, testParish)
    expect(result).toMatchObject({ attempted: 2, unresolvedCount: 0, movedToNextYear: 2 })
    const [receipt] = await db.select().from(promotionRecords).where(and(eq(promotionRecords.parishId, testParish), eq(promotionRecords.id, approval.id)))
    expect(receipt.completedAt).toBeTruthy()
    expect(receipt.completedTargetYearId).toBe(nextYearId)
    await db.update(promotionRecords).set({ completedTargetYearId: 'wrong-year' }).where(and(eq(promotionRecords.parishId, testParish), eq(promotionRecords.id, approval.id)))
    expect((await academicYearLifecycleService.getPromotionReconciliation(yearId, testParish)).unresolvedCount).toBe(1)
    expect((await academicYearLifecycleService.listAcademicYears(testParish)).find(row => row.id === yearId)?.unresolvedPromotionCount).toBe(1)
    await expect(academicYearLifecycleService.archiveYear(yearId, adminUserId, testParish)).rejects.toMatchObject({ status: 409 })
    await db.update(promotionRecords).set({ completedTargetYearId: nextYearId }).where(and(eq(promotionRecords.parishId, testParish), eq(promotionRecords.id, approval.id)))
    // Historical completion is not derived from today's mutable class pointer.
    await db.update(students).set({ classId }).where(and(eq(students.parishId, testParish), eq(students.id, studentGood)))
    expect((await academicYearLifecycleService.getPromotionReconciliation(yearId, testParish)).unresolvedCount).toBe(0)
    await expect(academicYearLifecycleService.retryPromotion(yearId, adminUserId, testParish)).rejects.toMatchObject({ status: 409 })
    await expect(academicYearLifecycleService.archiveYear(yearId, adminUserId, testParish)).resolves.toMatchObject({ status: 'ARCHIVED' })
  })

  it('XD-01: failed completion receipt rolls membership and approval back; retry completes only that item', async () => {
    await lockBothSemesters()
    await seedGrade(studentGood, 9, 1)
    await seedGrade(studentGood, 9, 2)
    await seedGrade(studentLow, 3, 1)
    await seedGrade(studentLow, 3, 2)
    await academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish)
    const original = drizzlePromotionRepository.markCompleted.bind(drizzlePromotionRepository)
    const failure = vi.spyOn(drizzlePromotionRepository, 'markCompleted').mockImplementation(async (...args) => {
      await original(...args)
      if (args[0].studentId === studentGood) throw new Error('Synthetic receipt failure after write')
    })
    try {
      expect((await academicYearLifecycleService.promoteYear(yearId, nextYearId, adminUserId, testParish)).unresolvedCount).toBe(1)
      expect(await db.select().from(promotionRecords).where(and(eq(promotionRecords.parishId, testParish), eq(promotionRecords.studentId, studentGood)))).toHaveLength(0)
      expect((await db.select().from(students).where(and(eq(students.parishId, testParish), eq(students.id, studentGood))))[0].classId).toBe(classId)
      await expect(academicYearLifecycleService.archiveYear(yearId, adminUserId, testParish)).rejects.toMatchObject({ status: 409 })
    } finally { failure.mockRestore() }
    expect(await academicYearLifecycleService.retryPromotion(yearId, adminUserId, testParish)).toMatchObject({ attempted: 1, unresolvedCount: 0 })
  })

  it('9. archiveYear rejects khi chưa PROMOTED (403) và thành công sau promote, chạy lại 409', async () => {
    // 9a. Chưa promote (FINALIZED) → 403
    await lockBothSemesters()
    await seedGrade(studentGood, 9, 1)
    await seedGrade(studentGood, 9, 2)
    await seedGrade(studentLow, 3, 1)
    await seedGrade(studentLow, 3, 2)
    await academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish)
    await expect(
      academicYearLifecycleService.archiveYear(yearId, adminUserId, testParish)
    ).rejects.toThrow(/chưa được xét lên lớp/)

    // 9b. Promote xong → archive thành công
    await academicYearLifecycleService.promoteYear(yearId, nextYearId, adminUserId, testParish)
    const res = await academicYearLifecycleService.archiveYear(yearId, adminUserId, testParish)
    expect(res.status).toBe('ARCHIVED')

    const [year] = await db.select().from(academicYears).where(eq(academicYears.id, yearId))
    expect(year.status).toBe('ARCHIVED')

    const list = await academicYearLifecycleService.listAcademicYears(testParish)
    expect(list.find((y) => y.id === yearId)?.status).toBe('ARCHIVED')

    // 9c. Chạy lại → 409 (đã lưu trữ)
    await expect(
      academicYearLifecycleService.archiveYear(yearId, adminUserId, testParish)
    ).rejects.toThrow(/đã được lưu trữ/)
  })

  it('10. D8: partial error persists as reconciliation, blocks archive, then retry only unresolved item', async () => {
    await lockBothSemesters()
    await seedGrade(studentGood, 9, 1)
    await seedGrade(studentGood, 9, 2)
    await seedGrade(studentLow, 3, 1)
    await seedGrade(studentLow, 3, 2)
    await academicYearLifecycleService.finalizeYear(yearId, adminUserId, testParish)

    const approve = promotionApplicationService.approvePromotion.bind(promotionApplicationService)
    let failGoodStudent = true
    const spy = vi.spyOn(promotionApplicationService, 'approvePromotion').mockImplementation(async (cmd, tx) => {
      if (cmd.studentId === studentGood && failGoodStudent) throw new Error('forced partial promotion failure')
      return approve(cmd, tx)
    })

    try {
      const promoted = await academicYearLifecycleService.promoteYear(yearId, nextYearId, adminUserId, testParish)
      expect(promoted.errors).toEqual([{ studentId: studentGood, reason: 'forced partial promotion failure' }])
      expect(promoted.unresolvedCount).toBe(1)

      const [year] = await db.select().from(academicYears).where(and(eq(academicYears.id, yearId), eq(academicYears.parishId, testParish)))
      expect(year.status).toBe('PROMOTED')
      expect(year.promotionTargetYearId).toBe(nextYearId)

      const reconciliation = await academicYearLifecycleService.getPromotionReconciliation(yearId, testParish)
      expect(reconciliation.targetYearId).toBe(nextYearId)
      expect(reconciliation.unresolved.map((item) => item.studentId)).toEqual([studentGood])

      const archiveError: any = await academicYearLifecycleService.archiveYear(yearId, adminUserId, testParish).catch((error) => error)
      expect(archiveError.status).toBe(409)
      expect(archiveError.details?.unresolvedCount).toBe(1)

      failGoodStudent = false
      const retried = await academicYearLifecycleService.retryPromotion(yearId, adminUserId, testParish)
      expect(retried.attempted).toBe(1)
      expect(retried.unresolvedCount).toBe(0)
      expect(spy.mock.calls.filter(([cmd]) => cmd.studentId === studentLow)).toHaveLength(1)

      await expect(academicYearLifecycleService.archiveYear(yearId, adminUserId, testParish)).resolves.toMatchObject({ status: 'ARCHIVED' })
    } finally {
      spy.mockRestore()
    }
  })
})
