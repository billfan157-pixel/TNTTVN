import { describe, it, expect, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, client } from '../db/index.js'
import { createDisposableRestoreTarget } from './helpers/restoreTarget.js'
import { createLogicalSnapshot, decryptLogicalSnapshot, encryptLogicalSnapshot, restoreLogicalSnapshot } from '../services/remoteBackup.js'
import { prepareEmptyRestoreTarget } from '../db/restorePreparation.js'
import { assertDatabaseReady } from '../db/schemaHealth.js'
import { academicYears, academicYearSnapshots, attendance, branches, classes, gradeOverrides, grades, students, studentFeeRecords, systemSettings, users } from '../db/schema.js'
import { academicYearLifecycleService as lifecycle } from '../services/AcademicYearLifecycleService.js'
import { reportingApplicationService as reporting } from '../services/ReportingApplicationService.js'
import { promotionApplicationService as promotion } from '../services/PromotionApplicationService.js'
import { drizzleSemesterLockRepository as locks } from '../repositories/DrizzleSemesterLockRepository.js'
import { drizzlePromotionRepository } from '../repositories/DrizzlePromotionRepository.js'
import { listClassFeeRecords } from '../services/financeService.js'

let sequence = 0
async function fixture() {
  const parishId = `history-${Date.now()}-${++sequence}`
  const year = '2025-2026', nextYear = '2026-2027'
  const actor = { userId: 'admin', parishId, role: 'admin' as const }
  await db.insert(users).values({ id: 'admin', parishId, username: 'history', fullName: 'Synthetic Admin', passwordHash: 'hash', role: 'admin' })
  await db.insert(branches).values([
    { id: 'AuNhi', parishId, name: 'Ấu Nhi', scarfColor: 'green', ageMin: 7, ageMax: 10 },
    { id: 'ThieuNhi', parishId, name: 'Thiếu Nhi', scarfColor: 'blue', ageMin: 10, ageMax: 13 },
  ])
  await db.insert(academicYears).values([
    { id: year, parishId, startDate: '2025-08-01', endDate: '2026-07-31' },
    { id: nextYear, parishId, startDate: '2026-08-01', endDate: '2027-07-31' },
  ])
  await db.insert(classes).values([
    { id: 'old', parishId, code: 'AU1', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYearId: year },
    { id: 'new', parishId, code: 'AU2', name: 'Ấu Nhi 2', branchId: 'AuNhi', academicYearId: nextYear },
  ])
  await db.insert(students).values({ id: 'student', parishId, code: 'SYNTHETIC', holyName: 'Maria', fullName: 'Synthetic Student', gender: 'Nữ', dateOfBirth: '2015-01-01', parentName: 'Parent', parentPhone: '0901234567', address: 'Synthetic', branch: 'AuNhi', classId: 'old', status: 'Đang học' })
  for (const semester of [1, 2]) await db.insert(grades).values({ id: `g${semester}`, parishId, studentId: 'student', academicYear: year, semester, scoreOral: 10, scoreFinal: 6 })
  await db.insert(attendance).values({ id: 'att', parishId, studentId: 'student', date: '2025-10-05', type: 'SundayMass', status: 'AbsentExcused' })
  const finish = async () => {
    for (const sem of [1, 2]) await locks.setLockState(year, sem, true, 'admin', parishId)
    return lifecycle.finalizeYear(year, 'admin', parishId)
  }
  const changePolicy = async () => db.insert(systemSettings).values({
    key: 'parish_system_settings', parishId,
    value: JSON.stringify({ gradeWeights: { weightOral: 3, weightFinal: 1, roundingDecimal: 2, xuatSacThreshold: 10, gioiThreshold: 9, khaThreshold: 8, trungBinhThreshold: 7 }, attendancePolicy: { excusedWeight: 0 }, promotionPolicy: { minGpa: 10, minAttendance: 100 } }),
  })
  return { parishId, year, nextYear, actor, finish, changePolicy }
}

describe('XD-02/03 historical policy and cohort', () => {
  it('pins policy and preserves reports across policy change, promotion retry and current class rename', async () => {
    const f = await fixture()
    await f.finish()
    const before = await reporting.getStudentReportCard(f.actor, 'student', f.year)
    expect(before?.grades[0].gpa).toBe(7)
    expect(before?.yearSummary).toEqual({ gpa: 7, classification: 'Khá' })
    await f.changePolicy()
    expect((await promotion.evaluateStudentWithData({ studentId: 'student', academicYear: f.year, parishId: f.parishId })).status).toBe('PROMOTED')
    expect((await reporting.getStudentReportCard(f.actor, 'student', f.year))?.attendanceSummary.overallAttendanceRate).toBe(100)
    const fail = vi.spyOn(drizzlePromotionRepository, 'markCompleted').mockRejectedValueOnce(new Error('synthetic membership failure'))
    try {
      expect((await lifecycle.promoteYear(f.year, f.nextYear, 'admin', f.parishId)).unresolvedCount).toBe(1)
    } finally { fail.mockRestore() }
    expect((await lifecycle.retryPromotion(f.year, 'admin', f.parishId)).unresolvedCount).toBe(0)
    await db.update(classes).set({ name: 'Renamed', branchId: 'ThieuNhi', academicYearId: f.nextYear }).where(and(eq(classes.parishId, f.parishId), eq(classes.id, 'old')))
    await db.update(grades).set({ scoreOral: 0, scoreFinal: 0 }).where(eq(grades.parishId, f.parishId))
    await db.update(attendance).set({ status: 'Present' }).where(eq(attendance.parishId, f.parishId))
    const report = await reporting.getStudentReportCard(f.actor, 'student', f.year)
    expect(report?.grades).toEqual(before?.grades)
    expect(report?.yearSummary).toEqual(before?.yearSummary)
    expect(report?.student.className).toBe('Ấu Nhi 1')
    expect(await reporting.listClasses(f.actor, f.year)).toEqual([
      { id: 'old', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYear: f.year },
    ])
    const [profile] = await db.select().from(students).where(eq(students.parishId, f.parishId))
    await db.insert(students).values({ ...profile, id: 'late', code: 'LATE', classId: 'old' })
    expect(await reporting.getStudentReportCard(f.actor, 'late', f.year)).toBeNull()
    const summary = await reporting.getClassSummary(f.actor, 'old', f.year)
    expect(summary).toMatchObject({ totalStudents: 1, averageGpa: 7, averageAttendanceRate: 100, className: 'Ấu Nhi 1' })
    expect(summary?.students[0]).toMatchObject({
      gpa: report?.yearSummary.gpa,
      classification: report?.yearSummary.classification,
      attendanceSummary: report?.attendanceSummary,
      promotion: report?.promotion,
      grades: report?.grades,
    })
    expect(await reporting.getClassSummary(f.actor, 'new', f.year)).toBeNull()
    expect((await lifecycle.archiveYear(f.year, 'admin', f.parishId)).status).toBe('ARCHIVED')
    expect((await reporting.getClassSummary(f.actor, 'old', f.year))?.totalStudents).toBe(1)
  })

  it('freezes effective grade overrides, without retaining deleted profiles or old access rights', async () => {
    const f = await fixture()
    await db.insert(gradeOverrides).values({ id: 'override', parishId: f.parishId, gradeId: 'g1', scoreField: 'scoreFinal', manualValue: 10, reasonNote: 'Synthetic', overriddenBy: 'admin' })
    await f.finish()
    const report = await reporting.getStudentReportCard(f.actor, 'student', f.year)
    expect(report?.grades[0]).toMatchObject({ scoreFinal: 10, gpa: 10 })
    await expect(reporting.getStudentReportCard({ ...f.actor, userId: 'unassigned', role: 'chunhiem' }, 'student', f.year)).rejects.toMatchObject({ status: 403 })
    await db.update(students).set({ deletedAt: new Date().toISOString() }).where(eq(students.parishId, f.parishId))
    expect(await reporting.getStudentReportCard(f.actor, 'student', f.year)).toBeNull()
    expect((await reporting.getClassSummary(f.actor, 'old', f.year))?.totalStudents).toBe(0)
  })

  it.each([null, '{broken', '{"version":99}'])('fails closed for missing/invalid legacy policy %s without backfill', async raw => {
    const f = await fixture()
    await f.finish()
    await db.update(academicYears).set({ finalizationPolicy: raw }).where(and(eq(academicYears.parishId, f.parishId), eq(academicYears.id, f.year)))
    await expect(reporting.getStudentReportCard(f.actor, 'student', f.year)).rejects.toMatchObject({ status: 409, code: 'HISTORICAL_EVIDENCE_REQUIRED' })
    await expect(reporting.getClassSummary(f.actor, 'old', f.year)).rejects.toMatchObject({ status: 409 })
    const result = await lifecycle.promoteYear(f.year, f.nextYear, 'admin', f.parishId)
    expect(result.unresolvedCount).toBe(1)
    expect((await db.select().from(students).where(eq(students.parishId, f.parishId)))[0].classId).toBe('old')
  })

  it('does not silently replace an incomplete cohort/report snapshot with current rows', async () => {
    const f = await fixture()
    await f.finish()
    await db.update(academicYearSnapshots).set({ reportSnapshot: null }).where(eq(academicYearSnapshots.parishId, f.parishId))
    await expect(reporting.getStudentReportCard(f.actor, 'student', f.year)).rejects.toMatchObject({ status: 409 })
    await db.update(academicYearSnapshots).set({ sourceClassId: null }).where(eq(academicYearSnapshots.parishId, f.parishId))
    await expect(reporting.getClassSummary(f.actor, 'old', f.year)).rejects.toMatchObject({ status: 409 })
  })

  it('keeps persisted fee facts and frozen unpaid cohort after promotion, scoped by parish/year/type', async () => {
    const f = await fixture()
    await db.insert(studentFeeRecords).values({ id: 'fee', parishId: f.parishId, studentId: 'student', classId: 'old', academicYear: f.year, feeType: 'NIEN_LIEM', title: 'Synthetic Fee', expectedAmount: 100000, paidAmount: 100000, status: 'PAID' })
    await f.finish()
    await lifecycle.promoteYear(f.year, f.nextYear, 'admin', f.parishId)
    expect(await listClassFeeRecords(f.parishId, 'old', f.year)).toMatchObject([{ id: 'fee', paidAmount: 100000, status: 'PAID' }])
    expect(await listClassFeeRecords(f.parishId, 'old', f.year, 'GIAO_LY')).toMatchObject([{ status: 'UNPAID', paidAmount: 0 }])
    expect(await listClassFeeRecords('other-parish', 'old', f.year)).toEqual([])
    expect(await listClassFeeRecords(f.parishId, 'old', f.nextYear)).toEqual([])
    await db.update(academicYearSnapshots).set({ sourceClassId: null }).where(eq(academicYearSnapshots.parishId, f.parishId))
    expect(await listClassFeeRecords(f.parishId, 'old', f.year)).toHaveLength(1)
    expect(await listClassFeeRecords(f.parishId, 'old', f.year, 'GIAO_LY')).toEqual([])
  })

  it('open year continues to use live settings', async () => {
    const f = await fixture()
    await f.changePolicy()
    const report = await reporting.getStudentReportCard(f.actor, 'student', f.year)
    expect(report?.grades[0].gpa).toBe(9)
    expect(report?.yearSummary).toEqual({ gpa: 9, classification: 'Giỏi' })
    expect(report?.attendanceSummary.overallAttendanceRate).toBe(0)
  })

  it('same student/year/class identifiers in another parish cannot supply historical evidence', async () => {
    const a = await fixture(), b = await fixture()
    await a.finish()
    await b.changePolicy()
    await b.finish()
    expect((await reporting.getStudentReportCard(a.actor, 'student', a.year))?.grades[0].gpa).toBe(7)
    expect((await reporting.getStudentReportCard(b.actor, 'student', b.year))?.grades[0].gpa).toBe(9)
    expect((await reporting.getClassSummary(a.actor, 'old', a.year))?.averageAttendanceRate).toBe(100)
    expect((await reporting.getClassSummary(b.actor, 'old', b.year))?.averageAttendanceRate).toBe(0)
  })

  it('XD-09: encrypted full logical restore preserves finalized policy, cohort, metrics and completion receipts on the prepared current schema', async () => {
    const f = await fixture()
    await f.finish()
    await lifecycle.promoteYear(f.year, f.nextYear, 'admin', f.parishId)
    await lifecycle.archiveYear(f.year, 'admin', f.parishId)
    const tx = await client.transaction('read')
    const snapshot = await createLogicalSnapshot(tx)
    await tx.commit()
    const restoredSnapshot = decryptLogicalSnapshot(encryptLogicalSnapshot(snapshot, '33'.repeat(32)), '33'.repeat(32))
    const target = createDisposableRestoreTarget()
    try {
      // Same preparation sequence as the operator CLI, no seed/delete shortcut.
      await prepareEmptyRestoreTarget(target)
      await assertDatabaseReady(target)
      const result = await restoreLogicalSnapshot(target, restoredSnapshot)
      await assertDatabaseReady(target)
      expect(result.restoredRows).toBe(snapshot.rowCount)
      expect(result.foreignKeyViolations).toBe(0)
      for (const table of ['academic_years', 'academic_year_snapshots', 'promotion_records', 'grades', 'attendance', 'students', 'audit_logs']) {
        const statement = { sql: `SELECT * FROM "${table}" WHERE parish_id = ?`, args: [f.parishId] }
        expect((await target.execute(statement)).rows).toEqual((await client.execute(statement)).rows)
      }
      const years = await target.execute({ sql: 'SELECT status, finalization_policy FROM academic_years WHERE parish_id = ? AND id = ?', args: [f.parishId, f.year] })
      expect(years.rows[0].status).toBe('ARCHIVED')
      expect(JSON.parse(String(years.rows[0].finalization_policy)).gradeWeights.weightFinal).toBe(3)
      // Preparation is never a generic "empty this target" operation.
      await expect(prepareEmptyRestoreTarget(target)).rejects.toThrow(/fresh target/)
      expect((await target.execute('SELECT count(*) AS count FROM students')).rows[0].count).toBeGreaterThan(0)
    } finally { target.close() }
  }, 30_000) // Full bootstrap + 181 migrations + encrypted all-table restore, not a unit operation.
})
