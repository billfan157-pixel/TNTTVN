import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { grades, gradeOverrides, auditLogs, notifications, students, branches, academicYears, classes, catechistAssignments, users } from '../../db/schema.js'
import { gradeApplicationService } from '../../services/GradeApplicationService.js'
import { upsertGrade } from '../../services/gradeService.js'
import { eq } from 'drizzle-orm'

describe('Grade Override Service & Outbox Transactions', () => {
  const testParish = 'parish-test-override'
  const testUser = 'user-admin-01'
  const testGradeId = 'GR-TEST-OVERRIDE-001'
  const testStudentId = 'ST-OVERRIDE-001'
  const testClassId = 'CL-OVERRIDE-001'
  const testBranchId = 'BR-OVERRIDE-001'
  const testYearId = 'AY-2025-2026-OVERRIDE'

  beforeAll(async () => {
    await db.insert(branches).values({ id: testBranchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: testYearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: testClassId, code: 'AN1-OV', name: 'Ấu 1 OV', branchId: testBranchId, academicYearId: testYearId, parishId: testParish }).onConflictDoNothing()
    await db.insert(students).values({
      id: testStudentId,
      code: 'ST-CODE-OV-01',
      holyName: 'Giuse',
      fullName: 'Nguyen Van A',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Nguyen Van B',
      parentPhone: '0901234567',
      address: '123 Test',
      branch: 'AuNhi',
      classId: testClassId,
      parishId: testParish,
    }).onConflictDoNothing()
    await db.insert(users).values({
      id: testUser,
      username: 'user-admin-ov-01',
      fullName: 'User Admin Override',
      passwordHash: 'hash',
      role: 'admin',
      parishId: testParish,
    }).onConflictDoNothing()
    await db.insert(catechistAssignments).values({
      id: 'ASG-OV-001',
      userId: testUser,
      classId: testClassId,
      roleInClass: 'chunhiem',
      parishId: testParish,
    }).onConflictDoNothing()
  })

  beforeEach(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.parishId, testParish))
    await db.delete(notifications).where(eq(notifications.parishId, testParish))
    await db.delete(gradeOverrides)
    await db.delete(grades).where(eq(grades.id, testGradeId))

    await db.insert(grades).values({
      id: testGradeId,
      studentId: testStudentId,
      academicYear: testYearId,
      semester: 1,
      scoreOral: 7.0,
      version: 1,
      parishId: testParish,
    })
  })

  it('soft-deletes override record during restore', async () => {
    await db.insert(gradeOverrides).values({
      id: 'GROV-TEST-001',
      gradeId: testGradeId,
      parishId: testParish,
      scoreField: 'scoreOral',
      manualValue: 8.5,
      overriddenBy: testUser,
    })

    const restored = await gradeApplicationService.restoreScore({
      gradeId: testGradeId,
      scoreField: 'scoreOral',
      userId: testUser,
      parishId: testParish,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    })
    expect(restored).not.toBeNull()

    const ovRecords = await db.select().from(gradeOverrides).where(eq(gradeOverrides.gradeId, testGradeId))
    expect(ovRecords[0].deletedAt).not.toBeNull()
    expect(ovRecords[0].version).toBe(2)
  })

  it('filters audit history specifically by target gradeId', async () => {
    const now = new Date().toISOString()
    await db.insert(gradeOverrides).values({
      id: 'GROV-TEST-002',
      gradeId: testGradeId,
      parishId: testParish,
      scoreField: 'scoreOral',
      manualValue: 8.5,
      overriddenBy: testUser,
    })
    await db.insert(auditLogs).values({
      id: 'AUD-HIST-TEST',
      userId: testUser,
      action: 'OVERRIDE_GRADE',
      entityType: 'grade_override',
      entityId: 'GROV-TEST-002',
      oldValue: null,
      newValue: JSON.stringify({ gradeId: testGradeId, scoreField: 'scoreOral', manualValue: 8.5 }),
      ip: '127.0.0.1',
      userAgent: 'test-agent',
      parishId: testParish,
      createdAt: now,
    })

    const history = await gradeApplicationService.getOverrideHistory(testGradeId, testParish)
    expect(history.length).toBe(1)
    expect(history[0].action).toBe('OVERRIDE_GRADE')

    const emptyHistory = await gradeApplicationService.getOverrideHistory('GR-NON-EXISTENT', testParish)
    expect(emptyHistory.length).toBe(0)
  })

  it('restores multiple overrides via batch partial commit', async () => {
    await db.insert(gradeOverrides).values({
      id: 'GROV-TEST-003',
      gradeId: testGradeId,
      parishId: testParish,
      scoreField: 'scoreOral',
      manualValue: 9.0,
      overriddenBy: testUser,
    })

    const batchRes = await gradeApplicationService.restoreScoreBatch(
      [{ gradeId: testGradeId, scoreField: 'scoreOral' }],
      testUser,
      testParish,
      '127.0.0.1',
      'test-agent'
    )

    expect(batchRes.length).toBe(1)
    expect(batchRes[0].status).toBe('restored')
  })

  it('upsertGrade manual path keeps the override and audit without external delivery', async () => {
    await upsertGrade(
      {
        studentId: testStudentId,
        semester: 1,
        academicYear: testYearId,
        version: 1,
        scoreOral: 8.5,
        scoreOral_source: 'manual',
        overrideReasonNote: 'Test manual override',
      } as any,
      testUser,
      testParish,
      '127.0.0.1',
      'test-agent',
      undefined,
      null
    )

    // Telegram is retired; audit OVERRIDE_GRADE in the transaction is the trail.
    const rows = await db.select().from(notifications).where(eq(notifications.parishId, testParish))
    expect(rows).toHaveLength(0)

    const ov = await db.select().from(gradeOverrides).where(eq(gradeOverrides.gradeId, testGradeId))
    expect(ov.length).toBe(1)
    expect(ov[0].manualValue).toBe(8.5)
  })

  it('rejects manual score out of [0,10] on legacy path (GRADE-ARCH-01 invariant)', async () => {
    // Range bị chặn ở 2 lớp: CHECK/trigger SQLite (update 11 chạy trước persistManualOverrides)
    // hoặc app guard trong persistManualOverrides (insert path) — assert kết quả cuối: reject + rollback.
    await expect(
      upsertGrade(
        {
          studentId: testStudentId,
          semester: 1,
          academicYear: testYearId,
          version: 1,
          scoreOral: 11,
          scoreOral_source: 'manual',
        } as any,
        testUser,
        testParish,
        '127.0.0.1',
        'test-agent',
        undefined,
        null
      )
    ).rejects.toThrow(/between 0 and 10/)

    const [g] = await db.select().from(grades).where(eq(grades.id, testGradeId))
    expect(g.scoreOral).toBe(7.0)
    const ov = await db.select().from(gradeOverrides).where(eq(gradeOverrides.gradeId, testGradeId))
    expect(ov.length).toBe(0)
  })

  it('supersede in-place sau manual lần 2 (writer chung — single path, không tạo row mới)', async () => {
    await upsertGrade(
      {
        studentId: testStudentId,
        semester: 1,
        academicYear: testYearId,
        version: 1,
        scoreOral: 8.5,
        scoreOral_source: 'manual',
      } as any,
      testUser,
      testParish,
      '127.0.0.1',
      'test-agent',
      undefined,
      null
    )

    const [g1] = await db.select().from(grades).where(eq(grades.id, testGradeId))
    await upsertGrade(
      {
        studentId: testStudentId,
        semester: 1,
        academicYear: testYearId,
        version: g1.version,
        scoreOral: 9.0,
        scoreOral_source: 'manual',
      } as any,
      testUser,
      testParish,
      '127.0.0.1',
      'test-agent',
      undefined,
      null
    )

    const ov = await db.select().from(gradeOverrides).where(eq(gradeOverrides.gradeId, testGradeId))
    expect(ov.length).toBe(1)
    expect(ov[0].manualValue).toBe(9.0)
    expect(ov[0].version).toBe(2)
    expect(ov[0].deletedAt).toBeNull()
  })
})
