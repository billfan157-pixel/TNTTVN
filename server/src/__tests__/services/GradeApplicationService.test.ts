import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { grades, gradeOverrides, notifications, auditLogs, students, branches, academicYears, classes, users, catechistAssignments } from '../../db/schema.js'
import { gradeApplicationService } from '../../services/GradeApplicationService.js'
import { createCanOverrideGradeSpecification, createSemesterLockSpecification } from '../../services/policyAdapters.js'
import { eq } from 'drizzle-orm'

describe('GradeApplicationService Integration Tests (Pilot B)', () => {
  const testParish = 'parish-pilot-b'
  const adminUserId = 'usr-admin-pilotb'
  const catechistAUserId = 'usr-catA-pilotb'
  const catechistBUserId = 'usr-catB-pilotb'
  const studentAId = 'st-pilotb-01'
  const studentBId = 'st-pilotb-02'
  const gradeAId = 'gr-pilotb-01'
  const classAId = 'cl-pilotb-01'
  const classBId = 'cl-pilotb-02'
  const branchId = 'br-pilotb-01'
  const yearId = 'ay-pilotb-01'

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classAId, code: 'CL-A', name: 'Lớp 10A', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classBId, code: 'CL-B', name: 'Lớp 10B', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()

    await db.insert(users).values([
      { id: adminUserId, username: 'adminb', fullName: 'Admin B', passwordHash: 'hash', role: 'admin', parishId: testParish },
      { id: catechistAUserId, username: 'catechistA', fullName: 'Catechist A', passwordHash: 'hash', role: 'chunhiem', parishId: testParish },
      { id: catechistBUserId, username: 'catechistB', fullName: 'Catechist B', passwordHash: 'hash', role: 'chunhiem', parishId: testParish },
    ]).onConflictDoNothing()

    await db.insert(catechistAssignments).values([
      { id: 'asgn-A', userId: catechistAUserId, classId: classAId, roleInClass: 'chunhiem', parishId: testParish, createdAt: now, updatedAt: now },
      { id: 'asgn-B', userId: catechistBUserId, classId: classBId, roleInClass: 'chunhiem', parishId: testParish, createdAt: now, updatedAt: now },
    ]).onConflictDoNothing()

    await db.insert(students).values([
      { id: studentAId, code: 'ST-PB-01', holyName: 'An', fullName: 'Nguyen A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: classAId, parishId: testParish },
      { id: studentBId, code: 'ST-PB-02', holyName: 'Binh', fullName: 'Nguyen B', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: classBId, parishId: testParish },
    ]).onConflictDoNothing()
  })

  beforeEach(async () => {
    await db.delete(notifications).where(eq(notifications.parishId, testParish))
    await db.delete(auditLogs)
    await db.delete(gradeOverrides)
    await db.delete(grades).where(eq(grades.id, gradeAId))

    await db.insert(grades).values({
      id: gradeAId,
      studentId: studentAId,
      academicYear: '2025-2026',
      semester: 1,
      scoreOral: 7.0,
      version: 1,
      parishId: testParish,
    })
  })

  it('Permission Denied -> Throws 403 when catechist B attempts override for student in Class 10A', async () => {
    await expect(
      gradeApplicationService.overrideScore({
        gradeId: gradeAId,
        studentId: studentAId,
        scoreField: 'scoreFinal',
        manualValue: 9.5,
        userId: catechistBUserId,
        parishId: testParish,
        ip: '127.0.0.1',
        userAgent: 'vitest',
      })
    ).rejects.toThrow(/Bạn không có quyền ghi đè điểm cho thiếu nhi này/)
  })

  it('updates override, increments grade version, and keeps the audit trail without external delivery', async () => {
    const res = await gradeApplicationService.overrideScore({
      gradeId: gradeAId,
      studentId: studentAId,
      scoreField: 'scoreFinal',
      manualValue: 9.5,
      reasonCode: 'SpecialAssignment',
      userId: catechistAUserId,
      parishId: testParish,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(res.manualValue).toBe(9.5)
    expect(res.version).toBe(1) // first override version for this scoreField

    // Verify Grade version incremented to 2
    const [updatedGrade] = await db.select().from(grades).where(eq(grades.id, gradeAId))
    expect(updatedGrade.version).toBe(2)

    // Verify Audit log written
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, res.id))
    expect(audits.length).toBe(1)
    expect(audits[0].action).toBe('OVERRIDE_GRADE')

    // Grade overrides remain an in-app/audit concern after Telegram retirement.
    const notices = await db.select().from(notifications).where(eq(notifications.parishId, testParish))
    expect(notices).toHaveLength(0)
  })

  it('binds semester-lock and class-authorization policies to the supplied transaction', async () => {
    await db.transaction(async (tx) => {
      const lockSpec = createSemesterLockSpecification(tx)
      const authorizationSpec = createCanOverrideGradeSpecification(tx)

      await expect(lockSpec.isSatisfiedBy('2025-2026', 1, testParish)).resolves.toBe(true)
      await expect(authorizationSpec.isSatisfiedBy(catechistAUserId, studentAId, testParish)).resolves.toBe(true)
      await expect(authorizationSpec.isSatisfiedBy(catechistBUserId, studentAId, testParish)).resolves.toBe(false)
    })
  })

  it('Optimistic Lock Failure -> Throws VersionConflictError (409) when concurrent version mismatches', async () => {
    const { GradeAggregate } = await import('../../domain/GradeAggregate.js')
    const { drizzleGradeRepository } = await import('../../repositories/DrizzleGradeRepository.js')

    const aggregate = new GradeAggregate({ id: gradeAId, studentId: studentAId, academicYear: '2025-2026', semester: 1, version: 1, parishId: testParish })
    aggregate.override('scoreFinal', 9.5)

    // Manually bump DB version to 5 behind the back of the aggregate
    await db.update(grades).set({ version: 5 }).where(eq(grades.id, gradeAId))

    await expect(
      drizzleGradeRepository.save(aggregate, catechistAUserId, testParish, '127.0.0.1', 'vitest')
    ).rejects.toThrow(/Điểm đã bị thay đổi bởi người dùng khác/)
  })

  it('restoreScoreBatch & getOverrideHistory -> executes batch restore and fetches audit history', async () => {
    // 1. Create override
    await gradeApplicationService.overrideScore({
      gradeId: gradeAId,
      studentId: studentAId,
      scoreField: 'scoreFinal',
      manualValue: 9.0,
      userId: catechistAUserId,
      parishId: testParish,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    })

    // 2. Fetch history
    const history = await gradeApplicationService.getOverrideHistory(gradeAId, testParish)
    expect(history.length).toBeGreaterThan(0)

    // 3. Batch restore
    const restoreResults = await gradeApplicationService.restoreScoreBatch(
      [{ gradeId: gradeAId, scoreField: 'scoreFinal' }],
      catechistAUserId,
      testParish,
      '127.0.0.1',
      'vitest'
    )

    expect(restoreResults.length).toBe(1)
    expect(restoreResults[0].status).toBe('restored')
  })
})

