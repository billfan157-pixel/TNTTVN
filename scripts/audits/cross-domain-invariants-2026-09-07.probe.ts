import { describe, it, expect, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, dbConfig } from '../../server/src/db/index.js'
import { academicYears, branches, classes, users, students, grades, attendance, academicYearSnapshots, catechistAssignments, studentFeeRecords } from '../../server/src/db/schema.js'
import { academicYearLifecycleService as lifecycle } from '../../server/src/services/AcademicYearLifecycleService.js'
import { reportingApplicationService as reporting } from '../../server/src/services/ReportingApplicationService.js'
import { drizzleSemesterLockRepository as locks } from '../../server/src/repositories/DrizzleSemesterLockRepository.js'
import { attendanceApplicationService } from '../../server/src/services/AttendanceApplicationService.js'
import { generateTokens } from '../../server/src/middleware/auth.js'
import promotionRouter from '../../server/src/routes/promotion.js'
import leaveRouter from '../../server/src/routes/leaveRequests.js'
import settingsRouter from '../../server/src/routes/settings.js'
import { updateStudent } from '../../server/src/services/studentService.js'
import { enqueueNotification } from '../../server/src/services/notificationQueue.js'
import { updateUserAssignments } from '../../server/src/services/userService.js'
import { listClassFeeRecords } from '../../server/src/services/financeService.js'
import gradesRouter from '../../server/src/routes/grades.js'
import { api as clientApi } from '../../src/lib/api'
import { initDB, getDB } from '../../src/lib/db'
import { setTenantScope } from '../../src/lib/tenantScope'
import { useGradeStore } from '../../src/stores/gradeStore'
import { useStudentStore } from '../../src/stores/studentStore'
import { useSyncStore } from '../../src/stores/syncStore'
import { syncCreateStudent, syncUpsertGrade } from '../../src/lib/syncService'
import { acknowledgeCreatedParent } from '../../src/lib/syncApply'
import { parseQueuePayload } from '../../src/lib/syncQueueMaintenance'
import classesRouter from '../../server/src/routes/classes.js'
import dailyRouter from '../../server/src/routes/dailyEntries.js'
import examsRouter from '../../server/src/routes/exams.js'
import backupRouter from '../../server/src/routes/backup.js'
import bcrypt from 'bcryptjs'

vi.mock('../../server/src/services/notificationQueue.js', () => ({ enqueueNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../server/src/services/safetySnapshot.js', () => ({ writeSafetySnapshot: vi.fn().mockResolvedValue('synthetic-safety'), pruneSafetySnapshots: vi.fn().mockResolvedValue(undefined) }))

let sequence = 0
async function fixture(customYear = false) {
  expect(dbConfig.isRemote).toBe(false)
  expect(dbConfig.dbPath).toContain('parish-test-')
  const parishId = `cross-domain-${Date.now()}-${++sequence}`
  const year = customYear ? 'AY-CUSTOM-2025' : '2025-2026'
  const nextYear = '2026-2027'
  const actor = { userId: 'admin', parishId, role: 'admin' as const, username: 'audit-admin', tokenVersion: 1 }
  await db.insert(users).values([
    { id: 'admin', parishId, username: 'audit-admin', fullName: 'Synthetic Admin', passwordHash: 'hash', role: 'admin', status: 'ACTIVE', tokenVersion: 1 },
    { id: 'parent', parishId, username: 'audit-parent', fullName: 'Synthetic Parent', passwordHash: 'hash', role: 'phuhuynh', phone: '0901234567', status: 'ACTIVE', tokenVersion: 1 },
  ])
  await db.insert(branches).values({ id: 'AuNhi', parishId, name: 'Ấu Nhi', scarfColor: 'green', ageMin: 7, ageMax: 10 })
  await db.insert(academicYears).values([
    { id: year, parishId, startDate: '2025-08-01', endDate: '2026-07-31' },
    { id: nextYear, parishId, startDate: '2026-08-01', endDate: '2027-07-31' },
  ])
  await db.insert(classes).values([
    { id: 'old', parishId, code: 'AU1', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYearId: year },
    { id: 'new', parishId, code: 'AU2', name: 'Ấu Nhi 2', branchId: 'AuNhi', academicYearId: nextYear },
  ])
  await db.insert(students).values({ id: 'student', parishId, code: 'SYNTHETIC', holyName: 'Maria', fullName: 'Synthetic Student', gender: 'Nữ', dateOfBirth: '2015-01-01', parentName: 'Synthetic Parent', parentPhone: '0901234567', address: 'Synthetic', branch: 'AuNhi', classId: 'old', status: 'Đang học' })
  for (const semester of [1, 2]) {
    await db.insert(grades).values({ id: `grade-${semester}`, parishId, studentId: 'student', academicYear: year, semester, scoreOral: 10, scoreFinal: 6 })
  }
  const headers = { Authorization: `Bearer ${generateTokens(actor).accessToken}`, 'Content-Type': 'application/json' }
  const parentHeaders = { Authorization: `Bearer ${generateTokens({ ...actor, userId: 'parent', username: 'audit-parent', role: 'phuhuynh' }).accessToken}`, 'Content-Type': 'application/json' }
  return { parishId, year, nextYear, actor, headers, parentHeaders }
}
async function finalize(f: Awaited<ReturnType<typeof fixture>>) {
  for (const sem of [1, 2]) await locks.setLockState(f.year, sem, true, 'admin', f.parishId)
  const result = await lifecycle.finalizeYear(f.year, 'admin', f.parishId)
  expect(result.snapshotCount).toBe(1)
  return (await db.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, f.parishId)))[0]
}

describe('Cross-domain remediation: regression and containment controls', () => {
  it('XD-01 regression: snapshot-only single approval remains unresolved until membership completion', async () => {
    const f = await fixture()
    const snap = await finalize(f)
    const res = await promotionRouter.request('/approve', { method: 'POST', headers: f.headers, body: JSON.stringify({ studentId: 'student', academicYear: f.year, targetClassId: 'old', nextClassId: 'new', gpa: snap.yearGpa, attendanceRate: snap.attendanceRate }) })
    expect(res.status).toBe(200)
    const result = await lifecycle.promoteYear(f.year, f.nextYear, 'admin', f.parishId)
    expect(result.attempted).toBe(1)
    expect(result.unresolvedCount).toBe(0)
    expect((await lifecycle.archiveYear(f.year, 'admin', f.parishId)).status).toBe('ARCHIVED')
    expect((await db.select().from(students).where(eq(students.parishId, f.parishId)))[0].classId).toBe('new')
  })

  it('XD-02 regression: policy changes preserve historical GPA and promotion convergence', async () => {
    const f = await fixture()
    const snap = await finalize(f)
    expect(snap.yearGpa).toBe(7)
    const change = await settingsRouter.request('/', { method: 'PUT', headers: f.headers, body: JSON.stringify({ gradeWeights: { weightOral: 3, weightFinal: 1 } }) })
    expect(change.status).toBe(200)
    const report = await reporting.getStudentReportCard(f.actor, 'student', f.year)
    expect(report?.grades[0].gpa).toBe(7)
    const first = await lifecycle.promoteYear(f.year, f.nextYear, 'admin', f.parishId)
    expect(first.errors).toHaveLength(0)
    expect(first.unresolvedCount).toBe(0)
    await expect(lifecycle.retryPromotion(f.year, 'admin', f.parishId)).rejects.toMatchObject({ status: 409 }) // No work remains.
    expect((await db.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, f.parishId)))[0].yearGpa).toBe(7)
  })

  it('XD-03 regression: successful promotion retains historical class roster, label and fee facts', async () => {
    const f = await fixture()
    await db.insert(studentFeeRecords).values({ id: 'fee', parishId: f.parishId, studentId: 'student', classId: 'old', academicYear: f.year, feeType: 'NIEN_LIEM', title: 'Synthetic Fee', expectedAmount: 100000, paidAmount: 100000, status: 'PAID' })
    expect(await listClassFeeRecords(f.parishId, 'old', f.year)).toHaveLength(1)
    await finalize(f)
    expect((await reporting.getClassSummary(f.actor, 'old', f.year))?.totalStudents).toBe(1)
    const result = await lifecycle.promoteYear(f.year, f.nextYear, 'admin', f.parishId)
    expect(result.errors).toHaveLength(0)
    expect(result.movedToNextYear).toBe(1)
    expect((await reporting.getClassSummary(f.actor, 'old', f.year))?.totalStudents).toBe(1)
    expect((await reporting.getStudentReportCard(f.actor, 'student', f.year))?.student.className).toBe('Ấu Nhi 1')
    expect(await listClassFeeRecords(f.parishId, 'old', f.year)).toHaveLength(1)
    expect(await db.select().from(studentFeeRecords).where(eq(studentFeeRecords.parishId, f.parishId))).toHaveLength(1)
  })

  it('XD-04-legacy regression: legacy custom year lock also protects date-derived attendance', async () => {
    const f = await fixture(true)
    await finalize(f)
    expect(await locks.isLocked(f.year, 1, f.parishId)).toBe(true)
    await expect(attendanceApplicationService.markAttendance({ studentId: 'student', date: '2025-10-05', type: 'SundayMass', status: 'Absent', userId: 'admin', parishId: f.parishId })).rejects.toMatchObject({ status: 403 })
    expect(await db.select().from(attendance).where(eq(attendance.parishId, f.parishId))).toHaveLength(0)
    expect((await db.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, f.parishId)))[0].attendanceRate).toBe(100)
  })

  it('XD-04 regression: reject new out-of-year ranges and protect existing legacy overlapping ranges', async () => {
    const f = await fixture()
    const create = await classesRouter.request('/academic-years', { method: 'POST', headers: f.headers, body: JSON.stringify({ id: '2024-2025', startDate: '2024-08-01', endDate: '2025-09-01' }) })
    expect(create.status).toBe(400)
    await db.insert(academicYears).values({ id: '2024-2025', parishId: f.parishId, startDate: '2024-08-01', endDate: '2025-09-01' })
    // August belongs to this explicitly accepted range, but date resolver picks 2025-2026.
    await db.update(classes).set({ academicYearId: '2024-2025' }).where(and(eq(classes.parishId, f.parishId), eq(classes.id, 'old')))
    await db.update(grades).set({ academicYear: '2024-2025' }).where(eq(grades.parishId, f.parishId))
    const old = { ...f, year: '2024-2025' }
    await finalize(old)
    await expect(attendanceApplicationService.markAttendance({ studentId: 'student', date: '2025-08-10', type: 'SundayMass', status: 'Absent', userId: 'admin', parishId: f.parishId })).rejects.toMatchObject({ status: 403 })
    expect(await db.select().from(attendance).where(eq(attendance.parishId, f.parishId))).toHaveLength(0)
    expect((await db.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, f.parishId)))[0].attendanceRate).toBe(100)
  })

  it('XD-08 regression: manual daily mutation and legacy projection converge with the complete server ledger', async () => {
    const f = await fixture()
    await db.update(grades).set({ scoreOral: null }).where(eq(grades.parishId, f.parishId))
    const entry = (id: string, value: number) => ({ id, studentId: 'student', academicYear: f.year, semester: 1, scoreType: 'oral', value, date: '2025-10-05' })
    const first = await dailyRouter.request('/batch', { method: 'POST', headers: f.headers, body: JSON.stringify({ entries: [entry('manual-8', 8)] }) })
    expect((await first.json() as any).data.saved).toBe(1)
    const created = await examsRouter.request('/', { method: 'POST', headers: f.headers, body: JSON.stringify({ classId: 'old', subject: 'Synthetic oral', scoreType: 'oral', semester: 1, academicYear: f.year }) })
    expect(created.status).toBe(201)
    const sessionId = (await created.json() as any).data.id
    const saved = await examsRouter.request(`/${sessionId}/results`, { method: 'POST', headers: f.headers, body: JSON.stringify({ results: [{ studentId: 'student', score: 6, source: 'quick_entry' }] }) })
    expect(saved.status).toBe(200)
    expect((await examsRouter.request(`/${sessionId}/complete`, { method: 'POST', headers: f.headers })).status).toBe(200)
    const grade = async () => (await db.select().from(grades).where(and(eq(grades.parishId, f.parishId), eq(grades.semester, 1))))[0]
    expect((await grade()).scoreOral).toBe(7)
    const added = await dailyRouter.request('/batch', { method: 'POST', headers: f.headers, body: JSON.stringify({ entries: [entry('manual-10', 10)] }) })
    expect((await added.json() as any).data.saved).toBe(1)
    const list = await dailyRouter.request(`/?classId=old&semester=1&academicYear=${f.year}`, { headers: f.headers })
    const ledger = (await list.json() as any).data as { value: number }[]
    expect(ledger.reduce((sum, e) => sum + e.value, 0) / ledger.length).toBe(8)
    expect((await grade()).scoreOral).toBe(8)
    // dailyGradeStore.getAverageForStudent averages local manual entries only: (8+10)/2=9.
    const projected = await gradesRouter.request('/batch', { method: 'POST', headers: f.headers, body: JSON.stringify({ grades: [{ studentId: 'student', academicYear: f.year, semester: 1, scoreOral: 9, scoreOral_source: 'daily_avg', version: (await grade()).version }] }) })
    expect(projected.status).toBe(200)
    expect((await grade()).scoreOral).toBe(8)
  })

  it('XD-09 regression: partial JSON restore refuses to destroy finalized snapshots', async () => {
    const f = await fixture()
    await finalize(f)
    const password = 'Synthetic-Audit-Only-123'
    await db.update(users).set({ passwordHash: await bcrypt.hash(password, 4) }).where(and(eq(users.parishId, f.parishId), eq(users.id, 'admin')))
    const exported = await backupRouter.request('/export', { method: 'POST', headers: f.headers, body: JSON.stringify({ adminPassword: password }) })
    expect(exported.status).toBe(200)
    const payload = await exported.json() as any
    const restored = await backupRouter.request('/restore', { method: 'POST', headers: f.headers, body: JSON.stringify({ ...payload, adminPassword: password }) })
    expect(restored.status).toBe(409)
    expect(await db.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, f.parishId))).toHaveLength(1)
    expect((await db.select().from(academicYears).where(and(eq(academicYears.parishId, f.parishId), eq(academicYears.id, f.year))))[0].status).toBe('FINALIZED')
    await expect(lifecycle.finalizeYear(f.year, 'admin', f.parishId)).rejects.toThrow()
  })

  it('XD-05 regression: leave review does not enqueue to the old parent after ownership changes', async () => {
    const f = await fixture()
    const created = await leaveRouter.request('/', { method: 'POST', headers: f.parentHeaders, body: JSON.stringify({ studentId: 'student', date: '2026-05-03', sessionTypes: ['SundayMass'], reason: 'Synthetic reason' }) })
    expect(created.status).toBe(201)
    const requestId = ((await created.json()) as any).data.id
    await updateStudent('student', { parentPhone: '0907654321' }, 'admin', f.parishId, '', 'audit')
    vi.mocked(enqueueNotification).mockClear()
    const response = await leaveRouter.request(`/${requestId}/review`, { method: 'PATCH', headers: f.headers, body: JSON.stringify({ status: 'APPROVED', reviewNote: 'Synthetic private follow-up' }) })
    expect(response.status).toBe(200)
    expect(enqueueNotification).not.toHaveBeenCalled()
  })

  it('S-lock: canonical year lock blocks direct attendance and leave approval consistently', async () => {
    const f = await fixture()
    const created = await leaveRouter.request('/', { method: 'POST', headers: f.parentHeaders, body: JSON.stringify({ studentId: 'student', date: '2026-05-03', sessionTypes: ['SundayMass'], reason: 'Synthetic reason' }) })
    const requestId = ((await created.json()) as any).data.id
    await finalize(f)
    await expect(attendanceApplicationService.markAttendance({ studentId: 'student', date: '2026-05-03', type: 'SundayMass', status: 'Present', userId: 'admin', parishId: f.parishId })).rejects.toMatchObject({ status: 403 })
    const response = await leaveRouter.request(`/${requestId}/review`, { method: 'PATCH', headers: f.headers, body: JSON.stringify({ status: 'APPROVED' }) })
    expect(response.status).toBe(403)
    expect(await db.select().from(attendance).where(and(eq(attendance.parishId, f.parishId), eq(attendance.studentId, 'student')))).toHaveLength(0)
  })

  it('XD-06 regression: scope-aware pull retracts revoked academic cache', async () => {
    const f = await fixture()
    await db.insert(users).values({ id: 'teacher', parishId: f.parishId, username: 'teacher', fullName: 'Synthetic Teacher', passwordHash: 'hash', role: 'chunhiem', status: 'ACTIVE', tokenVersion: 1 })
    await db.insert(catechistAssignments).values({ id: 'assignment', parishId: f.parishId, userId: 'teacher', classId: 'old', roleInClass: 'chunhiem' })
    const headers = { Authorization: `Bearer ${generateTokens({ ...f.actor, userId: 'teacher', username: 'teacher', role: 'chunhiem' }).accessToken}` }
    await initDB()
    setTenantScope({ userId: 'teacher', parishId: f.parishId })
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'teacher', parishId: f.parishId, role: 'chunhiem' }))
    const before = await gradesRouter.request('/', { headers })
    expect(before.status).toBe(200)
    const data = ((await before.json()) as any).data
    expect(data.length).toBeGreaterThan(0)
    useGradeStore.setState({ grades: data })
    await updateUserAssignments('teacher', [], 'admin', f.parishId, '', 'audit')
    const after = await gradesRouter.request('/?includeScope=true&updatedAfter=2000-01-01', { headers })
    expect(after.status).toBe(200)
    const afterData = ((await after.json()) as any).data
    expect(afterData.records).toEqual([])
    expect(afterData.scope.studentIds).toEqual([])
    const fetchSpy = vi.spyOn(clientApi, 'pullGrades').mockResolvedValue(afterData)
    try {
      await useGradeStore.getState().fetchGrades('2000-01-01', true)
      expect(useGradeStore.getState().grades.some(g => g.studentId === 'student')).toBe(false)
    } finally { fetchSpy.mockRestore() }
    await expect(attendanceApplicationService.markAttendance({ studentId: 'student', date: '2026-05-03', type: 'SundayMass', status: 'Present', userId: 'teacher', parishId: f.parishId })).rejects.toMatchObject({ status: 403 })
  })

  it('XD-07 regression: encrypted parent ACK survives a remap fault and replays without the temporary roster row', async () => {
    await initDB()
    const parishId = 'synthetic-remap-audit'
    setTenantScope({ userId: 'admin', parishId })
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'admin', parishId, role: 'admin' }))
    await useSyncStore.getState().initDevice()
    const localStudent = { id: 'temp-student', classId: 'old', fullName: 'Synthetic', code: 'TEMP', parishId } as any
    useStudentStore.setState({ students: [localStudent] })
    const parentOpId = await syncCreateStudent(localStudent)
    const childOpId = await syncUpsertGrade({ studentId: 'temp-student', semester: 1, academicYear: '2025-2026', scoreFinal: 8 })
    const queue = getDB().syncQueue
    const parent = (await queue.get(parentOpId))!
    const originalUpdate = queue.update.bind(queue)
    const failure = vi.spyOn(queue, 'update').mockImplementation((id, changes) => {
      if (id === childOpId) throw new Error('Synthetic IndexedDB remap failure')
      return originalUpdate(id, changes)
    })
    try {
      await expect(acknowledgeCreatedParent(parent, { ...localStudent, id: 'server-student' })).rejects.toThrow('Synthetic IndexedDB')
    } finally { failure.mockRestore() }
    expect((await queue.get(parentOpId))?.serverAcknowledgement).toBeTruthy()
    expect((await parseQueuePayload((await queue.get(childOpId))!.payload)).studentId).toBe('temp-student')
    expect(useStudentStore.getState().students[0].id).toBe('server-student')
    await acknowledgeCreatedParent(parent, { ...localStudent, id: 'server-student' })
    expect(await queue.get(parentOpId)).toBeUndefined()
    expect((await parseQueuePayload((await queue.get(childOpId))!.payload)).studentId).toBe('server-student')
  })
})
