import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { promotionRecords, semesterLocks, users, students, classes, branches, academicYears, grades, attendance } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { promotionApplicationService } from '../../services/PromotionApplicationService.js'
import { drizzleSemesterLockRepository } from '../../repositories/DrizzleSemesterLockRepository.js'

// Phase 1 (Promotion TOCTOU): toàn bộ reads/prechecks + snapshot write chạy trong
// cùng 1 transaction. Các test dưới khóa hành vi đó — code cũ (precheck ngoài tx)
// fail test A (idempotent-skip mất move lớp) và test B (dual-ACTIVE / 500 UNIQUE).
describe('Phase 1 — Promotion single-transaction + concurrency', () => {
  const testParish = 'parish-prm-race'
  const adminUserId = 'usr-admin-prm-race'
  const studentId = 'st-prm-race-01'
  const classId = 'cl-prm-race-01'
  const nextClassA = 'cl-prm-race-02'
  const nextClassB = 'cl-prm-race-03'
  const academicYear = '2025-2026'
  const nextAcademicYear = '2026-2027'

  beforeAll(async () => {
    await db.insert(branches).values({ id: 'br-prm-race', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: academicYear, startDate: '2025-09-01', endDate: '2026-05-31', promotionTargetYearId: nextAcademicYear, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: nextAcademicYear, startDate: '2026-09-01', endDate: '2027-05-31', parishId: testParish }).onConflictDoNothing()
    await db.update(academicYears).set({ promotionTargetYearId: nextAcademicYear }).where(and(eq(academicYears.id, academicYear), eq(academicYears.parishId, testParish)))
    await db.insert(classes).values({ id: classId, code: 'CL-R1', name: 'Lớp R1', branchId: 'br-prm-race', academicYearId: academicYear, parishId: testParish }).onConflictDoNothing()
    for (const [id, code, name] of [[nextClassA, 'CL-R2', 'Lớp R2'], [nextClassB, 'CL-R3', 'Lớp R3']] as const) {
      await db.insert(classes).values({ id, code, name, branchId: 'br-prm-race', academicYearId: nextAcademicYear, parishId: testParish }).onConflictDoNothing()
    }
    await db.insert(users).values({ id: adminUserId, username: 'adminprmrace', fullName: 'Admin Race', passwordHash: 'hash', role: 'admin', parishId: testParish }).onConflictDoNothing()
    await db.insert(students).values({
      id: studentId, code: 'ST-PRM-RACE', holyName: 'Anna', fullName: 'Nguyen Race',
      gender: 'Nữ', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000',
      address: 'X', branch: 'AuNhi', classId, parishId: testParish,
    }).onConflictDoNothing()
  })

  beforeEach(async () => {
    await db.delete(promotionRecords).where(eq(promotionRecords.parishId, testParish))
    await db.delete(semesterLocks).where(eq(semesterLocks.parishId, testParish))
    await db.delete(grades).where(eq(grades.studentId, studentId))
    await db.delete(attendance).where(eq(attendance.studentId, studentId))
    await db.insert(grades).values({ id: `grd-race-${Date.now()}`, studentId, academicYear, semester: 1, scoreFinal: 8.5, parishId: testParish })
    await db.insert(attendance).values(
      Array.from({ length: 10 }, (_, i) => ({
        id: `att-race-${Date.now()}-${i}`,
        studentId,
        date: `2025-10-${String(5 + i).padStart(2, '0')}`,
        type: 'CatechismClass' as const,
        status: i < 9 ? ('Present' as const) : ('AbsentUnexcused' as const),
        parishId: testParish,
      }))
    )
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)
  })

  const baseCmd = {
    studentId,
    academicYear,
    targetClassId: classId,
    gpa: 8.5,
    attendanceRate: 90,
    userId: adminUserId,
    parishId: testParish,
  }

  it('A. đổi nextClassId tạo version mới (không idempotent-skip mất move)', async () => {
    const v1 = await promotionApplicationService.approvePromotion({ ...baseCmd, nextClassId: nextClassA })
    expect(v1.version).toBe(1)
    expect(v1.nextClassId).toBe(nextClassA)

    const v2 = await promotionApplicationService.approvePromotion({ ...baseCmd, nextClassId: nextClassB })
    expect(v2.version).toBe(2)
    expect(v2.nextClassId).toBe(nextClassB)

    const rows = await db.select().from(promotionRecords).where(eq(promotionRecords.parishId, testParish))
    expect(rows.filter((r) => r.status === 'ACTIVE')).toHaveLength(1)
    expect(rows.find((r) => r.status === 'ACTIVE')?.nextClassId).toBe(nextClassB)
  })

  it('B. approve đồng thời hội tụ: 1 ACTIVE duy nhất, không 500', async () => {
    const results = await Promise.all([
      promotionApplicationService.approvePromotion({ ...baseCmd, nextClassId: nextClassA }),
      promotionApplicationService.approvePromotion({ ...baseCmd, nextClassId: nextClassA }),
      promotionApplicationService.approvePromotion({ ...baseCmd, nextClassId: nextClassA }),
    ])

    const ids = new Set(results.map((r) => r.id))
    expect(ids.size).toBe(1)

    const rows = await db.select().from(promotionRecords).where(eq(promotionRecords.parishId, testParish))
    expect(rows.filter((r) => r.status === 'ACTIVE')).toHaveLength(1)
  })

  it('C. mở khóa HK2 giữa 2 lần approve → lần 2 bị 403 trong tx', async () => {
    await promotionApplicationService.approvePromotion({ ...baseCmd, nextClassId: nextClassA })
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, false, adminUserId, testParish)

    await expect(
      promotionApplicationService.approvePromotion({ ...baseCmd, nextClassId: nextClassA })
    ).rejects.toThrow(/chưa được khóa/)

    // Snapshot cũ còn nguyên, không ghi thêm version.
    const rows = await db.select().from(promotionRecords).where(and(eq(promotionRecords.parishId, testParish), eq(promotionRecords.status, 'ACTIVE')))
    expect(rows).toHaveLength(1)
    expect(rows[0].version).toBe(1)
  })
})
