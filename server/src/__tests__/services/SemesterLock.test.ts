import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { grades, gradeOverrides, outboxMessages, auditLogs, students, branches, academicYears, classes, users, catechistAssignments, semesterLocks } from '../../db/schema.js'
import { gradeApplicationService } from '../../services/GradeApplicationService.js'
import { drizzleSemesterLockRepository } from '../../repositories/DrizzleSemesterLockRepository.js'
import { eq, and } from 'drizzle-orm'

describe('Semester Lock Micro-Step S4 Integration Tests', () => {
  const testParish = 'parish-lock-test'
  const adminUserId = 'usr-admin-lock'
  const catechistUserId = 'usr-cat-lock'
  const studentId = 'st-lock-01'
  const gradeHk1Id = 'gr-lock-hk1'
  const gradeHk2Id = 'gr-lock-hk2'
  const classId = 'cl-lock-01'
  const branchId = 'br-lock-01'
  const yearId = 'AY-2025-2026'

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-LOCK', name: 'Lớp Lock', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()

    await db.insert(users).values([
      { id: adminUserId, username: 'adminlock', fullName: 'Admin Lock', passwordHash: 'hash', role: 'admin', parishId: testParish },
      { id: catechistUserId, username: 'catechistlock', fullName: 'Catechist Lock', passwordHash: 'hash', role: 'chunhiem', parishId: testParish },
    ]).onConflictDoNothing()

    await db.insert(catechistAssignments).values({
      id: 'asgn-lock-01',
      userId: catechistUserId,
      classId,
      roleInClass: 'chunhiem',
      parishId: testParish,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing()

    await db.insert(students).values({
      id: studentId,
      code: 'ST-LOCK-01',
      holyName: 'Maria',
      fullName: 'Nguyen Thi Lock',
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
    await db.delete(outboxMessages)
    await db.delete(auditLogs)
    await db.delete(gradeOverrides)
    await db.delete(semesterLocks)
    await db.delete(grades).where(eq(grades.studentId, studentId))

    await db.insert(grades).values([
      { id: gradeHk1Id, studentId, academicYear: '2025-2026', semester: 1, scoreOral: 7.0, version: 1, parishId: testParish },
      { id: gradeHk2Id, studentId, academicYear: '2025-2026', semester: 2, scoreOral: 8.0, version: 1, parishId: testParish },
    ])
  })

  it('1. Blocks grade override when Semester 1 is LOCKED (Throws 403 Semester Locked)', async () => {
    // Admin locks Semester 1 for 2025-2026
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, true, adminUserId, testParish)

    await expect(
      gradeApplicationService.overrideScore({
        gradeId: gradeHk1Id,
        studentId,
        scoreField: 'scoreFinal',
        manualValue: 9.5,
        userId: catechistUserId,
        parishId: testParish,
        ip: '127.0.0.1',
        userAgent: 'vitest',
      })
    ).rejects.toThrow(/Học kỳ 1 năm học 2025-2026 đã bị khóa sổ điểm/)
  })

  it('2. Allows grade override on Semester 2 when only Semester 1 is LOCKED', async () => {
    // Lock HK1
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, true, adminUserId, testParish)

    // Override HK2 should succeed
    const res = await gradeApplicationService.overrideScore({
      gradeId: gradeHk2Id,
      studentId,
      scoreField: 'scoreFinal',
      manualValue: 9.0,
      userId: catechistUserId,
      parishId: testParish,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(res.manualValue).toBe(9.0)
  })

  it('3. Allows grade override on Semester 1 after Admin unlocks it', async () => {
    // Lock HK1
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, true, adminUserId, testParish)

    // Admin unlocks HK1
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, false, adminUserId, testParish, 'Mở sổ điểm phúc khảo bài thi')

    // Override HK1 should now succeed
    const res = await gradeApplicationService.overrideScore({
      gradeId: gradeHk1Id,
      studentId,
      scoreField: 'scoreFinal',
      manualValue: 9.5,
      userId: catechistUserId,
      parishId: testParish,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(res.manualValue).toBe(9.5)
  })

  it('4. Blocks restoreScore when Semester 1 is LOCKED, allows after UNLOCK (End-to-End Lifecycle)', async () => {
    // Admin unlocks HK1 and catechist overrides scoreFinal
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, false, adminUserId, testParish)
    const ov = await gradeApplicationService.overrideScore({
      gradeId: gradeHk1Id,
      studentId,
      scoreField: 'scoreFinal',
      manualValue: 9.5,
      userId: catechistUserId,
      parishId: testParish,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    })
    expect(ov.manualValue).toBe(9.5)

    // Admin locks HK1
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, true, adminUserId, testParish)

    // Attempt restore on locked HK1 should throw 403
    await expect(
      gradeApplicationService.restoreScore({
        gradeId: gradeHk1Id,
        scoreField: 'scoreFinal',
        userId: catechistUserId,
        parishId: testParish,
        ip: '127.0.0.1',
        userAgent: 'vitest',
      })
    ).rejects.toThrow(/Học kỳ 1 năm học 2025-2026 đã bị khóa sổ điểm/)

    // Admin unlocks HK1
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, false, adminUserId, testParish, 'Mở khóa để khôi phục')

    // Restore on unlocked HK1 should succeed
    const restored = await gradeApplicationService.restoreScore({
      gradeId: gradeHk1Id,
      scoreField: 'scoreFinal',
      userId: catechistUserId,
      parishId: testParish,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(restored).not.toBeNull()
    expect(restored?.deletedAt).not.toBeNull()
  })

  it('verifies a semester-lock specification can be bound to the active transaction (Fix F11)', async () => {
    const { createSemesterLockSpecification } = await import('../../services/policyAdapters.js')
    await drizzleSemesterLockRepository.setLockState('2025-2026', 2, true, adminUserId, testParish)

    await db.transaction(async (tx) => {
      const isPermitted = await createSemesterLockSpecification(tx).isSatisfiedBy('2025-2026', 2, testParish)
      expect(isPermitted).toBe(false)
    })

    await drizzleSemesterLockRepository.setLockState('2025-2026', 2, false, adminUserId, testParish)
  })

  it('5. AYL-05: re-lock cùng slot qua upsert không ném UNIQUE', async () => {
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, true, adminUserId, testParish)
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, true, adminUserId, testParish)

    const [row] = await db.select().from(semesterLocks).where(
      and(eq(semesterLocks.parishId, testParish), eq(semesterLocks.academicYear, '2025-2026'), eq(semesterLocks.semester, 1))
    )
    expect(row).toBeDefined()
    expect(row.isLocked).toBe(1)
    expect(row.lockedBy).toBe(adminUserId)
  })

  it('6. AYL-04: unlock xoá lockedBy/lockedAt + ghi rõ unlockedBy/unlockedAt/unlockReason', async () => {
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, true, adminUserId, testParish)

    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, false, adminUserId, testParish, 'Phúc khảo bài thi')

    const [row] = await db.select().from(semesterLocks).where(
      and(eq(semesterLocks.parishId, testParish), eq(semesterLocks.academicYear, '2025-2026'), eq(semesterLocks.semester, 1))
    )
    expect(row.isLocked).toBe(0)
    expect(row.lockedBy).toBeNull()
    expect(row.lockedAt).toBeNull()
    expect(row.unlockedBy).toBe(adminUserId)
    expect(row.unlockedAt).not.toBeNull()
    expect(row.unlockReason).toBe('Phúc khảo bài thi')
  })
})
