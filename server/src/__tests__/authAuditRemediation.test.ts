import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, grades, semesterLocks, leaveRequests, attendance, refreshTokens } from '../db/schema.js'
import { generateTokens, getSuperAdminId } from '../middleware/auth.js'
import auth from '../routes/auth.js'
import gradesRouter from '../routes/grades.js'
import attendanceRouter from '../routes/attendance.js'
import leaveRouter from '../routes/leaveRequests.js'
import notificationsRouter from '../routes/notifications.js'
import parishProfileRouter from '../routes/parishProfile.js'
import verificationRouter from '../routes/verification.js'
import importRouter from '../routes/import.js'
import { updateUserStatus, forceLogoutUser } from '../services/userService.js'
import { removeUserFromClass } from '../services/classService.js'
import { issueTokensWithSession, rotateRefreshSession } from '../services/refreshSessionService.js'
import { getGrades } from '../services/gradeService.js'
import { getAttendance } from '../services/attendanceService.js'
import usersRouter from '../routes/users.js'
import examsRouter from '../routes/exams.js'
import { enqueueNotification } from '../services/notificationQueue.js'

vi.mock('../services/notificationQueue.js', () => ({ enqueueNotification: vi.fn().mockResolvedValue(undefined) }))

const A = 'remediation-0905-a', B = 'remediation-0905-b'
const oldPassword = 'AuditOnly@9385'
const app = new Hono()
app.route('/api/auth', auth)
app.route('/api/grades', gradesRouter)
app.route('/api/attendance', attendanceRouter)
app.route('/api/leave-requests', leaveRouter)
app.route('/api/notifications', notificationsRouter)
app.route('/api/parish-profile', parishProfileRouter)
app.route('/api/verification', verificationRouter)
app.route('/api/students', importRouter)
app.route('/api/users', usersRouter)
app.route('/api/exams', examsRouter)
const token = (id: string, role: 'admin' | 'chunhiem' | 'phuhuynh', parishId = A) =>
  generateTokens({ userId: id, username: id, role, parishId, tokenVersion: 1 }).accessToken
const request = (path: string, bearer: string, body?: unknown, method = 'POST') => app.request(path, {
  method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(oldPassword, 10)
  await db.insert(users).values([
    { id: 'admin', username: 'admin', fullName: 'Synthetic admin', role: 'admin', parishId: A, passwordHash },
    { id: 'teacher', username: 'teacher', fullName: 'Synthetic teacher', role: 'chunhiem', parishId: A, passwordHash },
    { id: 'forced', username: 'forced', fullName: 'Synthetic forced admin', role: 'admin', parishId: A, passwordHash, status: 'FORCE_PASSWORD_CHANGE', mustChangePassword: 1 },
    { id: 'racing', username: 'racing', fullName: 'Synthetic racing account', role: 'chunhiem', parishId: A, passwordHash },
    { id: 'parent1', username: 'parent1', fullName: 'Synthetic parent 1', role: 'phuhuynh', parishId: A, passwordHash, phone: '0900000101' },
    { id: 'parent2', username: 'parent2', fullName: 'Synthetic parent 2', role: 'phuhuynh', parishId: A, passwordHash, phone: '0900000102' },
    { id: getSuperAdminId(), username: 'collision', fullName: 'Synthetic locked non-admin', role: 'phuhuynh', parishId: B, passwordHash, status: 'LOCKED' },
    { id: 'ordinary-locked', username: 'ordinary-locked', fullName: 'Synthetic locked control', role: 'phuhuynh', parishId: B, passwordHash, status: 'LOCKED' },
  ])
  for (const parishId of [A, B]) {
    await db.insert(branches).values({ id: 'branch', parishId, name: 'Synthetic', scarfColor: 'Xanh', ageMin: 6, ageMax: 10 })
    await db.insert(academicYears).values({ id: '2025-2026', parishId, startDate: '2025-09-01', endDate: '2026-06-30' })
    await db.insert(classes).values(['class1', 'class2'].map(id => ({ id, parishId, code: id, name: id, branchId: 'branch', academicYearId: '2025-2026' })))
    await db.insert(students).values(['child1', 'child2', 'moved'].map((id, index) => ({
      id, parishId, code: id, holyName: 'Giuse', fullName: `Synthetic ${id}`, gender: 'Nam' as const,
      dateOfBirth: '2015-01-01', parentName: 'Synthetic parent', parentPhone: index === 1 ? '0900000102' : '0900000101',
      address: 'Synthetic', branch: 'AuNhi' as const, classId: index === 1 ? 'class2' : 'class1',
    })))
    await db.insert(grades).values({ id: 'shared-grade-id', parishId, studentId: 'child1', academicYear: '2025-2026', semester: 1, scoreOral: 2, version: 1 })
  }
  await db.insert(catechistAssignments).values({ id: 'assignment', parishId: A, userId: 'teacher', classId: 'class1', roleInClass: 'chunhiem' })
})

describe('Auth audit remediation: server invariants', () => {
  it('H1: admin creation requires reauthentication and cannot persist a bearer-only account', async () => {
    const body = { username: 'new-privileged', fullName: 'Synthetic new admin', role: 'admin' }
    expect((await request('/api/users', token('admin', 'admin'), body)).status).toBe(401)
    expect(await db.select().from(users).where(and(eq(users.parishId, A), eq(users.username, body.username)))).toHaveLength(0)
    expect((await request('/api/users', token('admin', 'admin'), { ...body, adminPassword: oldPassword })).status).toBe(201)
  })

  it('H8: stale refresh reuse cannot roll a revocation epoch back', async () => {
    await db.insert(users).values({ id: 'refresh-race', username: 'refresh-race', fullName: 'Synthetic', role: 'chunhiem', parishId: A, passwordHash: await bcrypt.hash(oldPassword, 4) })
    const initial = await issueTokensWithSession({ id: 'refresh-race', username: 'refresh-race', role: 'chunhiem', parishId: A }, 1)
    expect((await rotateRefreshSession(initial.refreshToken)).status).toBe('ok')
    const original = db.transaction.bind(db)
    let interleaved = false
    let revokedAccess = ''
    const spy = vi.spyOn(db, 'transaction').mockImplementation(async (callback, config) => {
      if (!interleaved) {
        interleaved = true
        await forceLogoutUser('refresh-race', 'admin', A, 'synthetic', 'test')
        const login = await request('/api/auth/login', '', { username: 'refresh-race', parishId: A, password: oldPassword })
        expect(login.status).toBe(200)
        revokedAccess = (await login.json() as { data: { accessToken: string } }).data.accessToken
        await forceLogoutUser('refresh-race', 'admin', A, 'synthetic', 'test')
        expect((await request('/api/auth/me', revokedAccess, undefined, 'GET')).status).toBe(401)
      }
      return original(callback, config)
    })
    try {
      expect((await rotateRefreshSession(initial.refreshToken)).status).toBe('rejected')
      const [account] = await db.select().from(users).where(and(eq(users.id, 'refresh-race'), eq(users.parishId, A)))
      expect(account.tokenVersion).toBe(4)
      expect((await request('/api/auth/me', revokedAccess, undefined, 'GET')).status).toBe(401)
      const sessions = await db.select().from(refreshTokens).where(and(eq(refreshTokens.userId, account.id), eq(refreshTokens.parishId, A)))
      expect(sessions.every(session => session.revokedAt)).toBe(true)
    } finally { spy.mockRestore() }
  })

  it('D9: empty service scopes deny even with an explicit student ID', async () => {
    expect(await getGrades(A, 'child1', undefined, undefined, [])).toEqual([])
    expect(await getAttendance(A, 'child1', undefined, undefined, undefined, [])).toEqual([])
    expect((await getGrades(A)).length).toBeGreaterThan(0)
  })

  it('H4: parent with a corrupt assignment still cannot enter any alternate exam handler', async () => {
    await db.insert(catechistAssignments).values({ id: 'corrupt-parent-assignment', parishId: A, userId: 'parent1', classId: 'class1', roleInClass: 'phuta' })
    try {
      const bearer = token('parent1', 'phuhuynh')
      for (const path of ['/class/class1', '/synthetic-session', '/synthetic-session/results']) {
        expect((await request(`/api/exams${path}`, bearer, undefined, 'GET')).status).toBe(403)
      }
      for (const path of ['/synthetic-session/answer-key', '/synthetic-session/answer-variants']) {
        expect((await request(`/api/exams${path}`, bearer, { answerKey: { 1: 'A' }, answerVariants: {}, questionCount: 1 }, 'PATCH')).status).toBe(403)
      }
      expect((await request('/api/exams/barcode/decode', bearer, { barcodeText: 'synthetic' })).status).toBe(403)
    } finally {
      await db.delete(catechistAssignments).where(and(eq(catechistAssignments.id, 'corrupt-parent-assignment'), eq(catechistAssignments.parishId, A)))
    }
  })

  it('D9: authorization covers more than 50 unchanged students during delta pull', async () => {
    const [sample] = await db.select().from(students).where(and(eq(students.id, 'child1'), eq(students.parishId, A)))
    await db.insert(students).values(Array.from({ length: 55 }, (_, i) => ({ ...sample, id: `large-${i}`, code: `large-${i}`, updatedAt: '2025-01-01T00:00:00.000Z' })))
    await db.insert(attendance).values({ id: 'large-delta', parishId: A, studentId: 'large-54', date: '2026-03-01', type: 'SundayMass', status: 'Present', note: 'Authorized large-class delta', updatedAt: '2026-06-01T00:00:00.000Z' })
    const response = await request('/api/attendance?updatedAfter=2026-01-01T00%3A00%3A00.000Z', token('teacher', 'chunhiem'), undefined, 'GET')
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).toContain('Authorized large-class delta')
  })

  it('H3: attendance rejects assignment revoked after the route captures its scope', async () => {
    await db.insert(users).values({ id: 'assignment-race', username: 'assignment-race', fullName: 'Synthetic', role: 'chunhiem', parishId: A, passwordHash: 'unused' })
    await db.insert(catechistAssignments).values({ id: 'race-assignment', parishId: A, userId: 'assignment-race', classId: 'class1', roleInClass: 'phuta' })
    const original = db.transaction.bind(db)
    let revoked = false
    const spy = vi.spyOn(db, 'transaction').mockImplementation(async (callback, config) => {
      if (!revoked) {
        revoked = true
        await removeUserFromClass('class1', 'assignment-race', 'admin', A, 'synthetic', 'test')
      }
      return original(callback, config)
    })
    try {
      const response = await request('/api/attendance', token('assignment-race', 'chunhiem'), { studentId: 'child1', date: '2026-03-08', type: 'SundayMass', status: 'Present' })
      expect(response.status).toBe(403)
      expect(await db.select().from(attendance).where(and(eq(attendance.parishId, A), eq(attendance.date, '2026-03-08')))).toHaveLength(0)
    } finally { spy.mockRestore() }
  })

  it('D3/H5: unresolved recipients do not fall back to a broad app-push audience or count as sent', async () => {
    vi.mocked(enqueueNotification).mockClear()
    await db.update(students).set({ parentPhone: '0900999999' }).where(and(eq(students.id, 'moved'), eq(students.parishId, A)))
    const response = await request('/api/notifications/smart/report-cards', token('admin', 'admin'), { students: [{
      studentId: 'moved', parentPhone: '0900000102', studentName: 'Synthetic', holyName: 'Giuse', className: 'class1',
      score: 9, rank: 'Gioi', attendanceRate: 90, attendancePresent: 9, attendanceTotal: 10,
    }] })
    expect(response.status).toBe(200)
    expect((await response.json() as { data: unknown }).data).toMatchObject({ sent: 0, total: 1 })
    expect(enqueueNotification).not.toHaveBeenCalled()
  })

  it('D1: authorized parish A grade write preserves parish B with the same ID/version', async () => {
    const response = await request('/api/grades', token('teacher', 'chunhiem'), {
      studentId: 'child1', academicYear: '2025-2026', semester: 1, scoreOral: 9, version: 1,
    })
    expect(response.status, await response.clone().text()).toBe(200)
    const rows = await db.select().from(grades).where(eq(grades.id, 'shared-grade-id'))
    expect(rows).toHaveLength(2)
    expect(rows.find(row => row.parishId === B)).toMatchObject({ scoreOral: 2, version: 1 })
  })

  it('D2a: leave review rejects locked-semester attendance', async () => {
    await db.insert(semesterLocks).values({ id: 'lock', parishId: A, academicYear: '2025-2026', semester: 1, isLocked: 1 })
    const bearer = token('teacher', 'chunhiem')
    const direct = await request('/api/attendance', bearer, { studentId: 'child1', date: '2025-10-05', type: 'SundayMass', status: 'AbsentExcused' })
    expect(direct.status, await direct.clone().text()).toBe(403)
    await db.insert(leaveRequests).values({ id: 'locked-leave', parishId: A, studentId: 'child1', classId: 'class1', parentName: 'Synthetic', parentPhone: '0900000101', date: '2025-10-05', sessionTypes: '["SundayMass"]', reason: 'Synthetic audit' })
    const review = await request('/api/leave-requests/locked-leave/review', bearer, { status: 'APPROVED' }, 'PATCH')
    expect(review.status, await review.clone().text()).toBe(403)
    const rows = await db.select().from(attendance).where(and(eq(attendance.parishId, A), eq(attendance.studentId, 'child1')))
    expect(rows).toHaveLength(0)
    const [pending] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.parishId, A), eq(leaveRequests.id, 'locked-leave')))
    expect(pending.status).toBe('PENDING')
  })

  it('D2b: teacher of old class cannot review after student transfers', async () => {
    await db.insert(leaveRequests).values({ id: 'moved-leave', parishId: A, studentId: 'moved', classId: 'class1', parentName: 'Synthetic', parentPhone: '0900000101', date: '2026-03-01', sessionTypes: '["SundayMass"]', reason: 'Synthetic audit' })
    await db.update(students).set({ classId: 'class2' }).where(and(eq(students.parishId, A), eq(students.id, 'moved')))
    const bearer = token('teacher', 'chunhiem')
    const direct = await request('/api/attendance', bearer, { studentId: 'moved', date: '2026-03-01', type: 'SundayMass', status: 'AbsentExcused' })
    expect(direct.status).toBe(403)
    const review = await request('/api/leave-requests/moved-leave/review', bearer, { status: 'APPROVED' }, 'PATCH')
    expect(review.status, await review.clone().text()).toBe(403)
    const rows = await db.select().from(attendance).where(and(eq(attendance.parishId, A), eq(attendance.studentId, 'moved')))
    expect(rows).toHaveLength(0)
  })

  it('D2c: approval in an open semester updates attendance version and rejects replay', async () => {
    await db.insert(leaveRequests).values({ id: 'open-leave', parishId: A, studentId: 'child1', classId: 'class1', parentName: 'Synthetic', parentPhone: '0900000101', date: '2026-03-15', sessionTypes: '["SundayMass"]', reason: 'Synthetic audit' })
    await db.insert(attendance).values({ id: 'open-attendance', parishId: A, studentId: 'child1', date: '2026-03-15', type: 'SundayMass', status: 'AbsentUnexcused', version: 3 })
    const review = await request('/api/leave-requests/open-leave/review', token('teacher', 'chunhiem'), { status: 'APPROVED' }, 'PATCH')
    expect(review.status).toBe(200)
    const [row] = await db.select().from(attendance).where(and(eq(attendance.parishId, A), eq(attendance.id, 'open-attendance')))
    expect(row).toMatchObject({ status: 'AbsentExcused', version: 4 })
    const replay = await request('/api/leave-requests/open-leave/review', token('teacher', 'chunhiem'), { status: 'APPROVED' }, 'PATCH')
    expect(replay.status).toBe(400)
    const [unchanged] = await db.select().from(attendance).where(and(eq(attendance.parishId, A), eq(attendance.id, 'open-attendance')))
    expect(unchanged.version).toBe(4)
  })

  it('D3: report-card authorized for class1 selects canonical parent despite caller phone', async () => {
    vi.mocked(enqueueNotification).mockClear()
    const response = await request('/api/notifications/smart/report-cards', token('teacher', 'chunhiem'), { students: [{
      studentId: 'child1', parentPhone: '0900000102', studentName: 'Synthetic child1', holyName: 'Giuse',
      className: 'class1', score: 9, rank: 'Gioi', attendanceRate: 90, attendancePresent: 9, attendanceTotal: 10,
    }] })
    expect(response.status, await response.clone().text()).toBe(200)
    expect(vi.mocked(enqueueNotification).mock.calls.some(call => call[0] === 'webpush' && call[6]?.webpushUserIds?.includes('parent2'))).toBe(false)
    expect(vi.mocked(enqueueNotification).mock.calls.some(call => call[6]?.webpushUserIds?.includes('parent1'))).toBe(true)
  })

  it('D4: forced-password admin cannot use suffix allowlist for a parish profile mutation', async () => {
    const bearer = token('forced', 'admin')
    expect((await request('/api/grades', bearer, undefined, 'GET')).status).toBe(403)
    const response = await request('/api/parish-profile/profile', bearer, { displayName: 'Synthetic changed before password rotation' }, 'PUT')
    expect(response.status, await response.clone().text()).toBe(403)
    expect((await request('/api/auth/me', bearer, undefined, 'GET')).status).toBe(200)
  })

  it('D5: password-change request preserves account locked after password verification', async () => {
    const originalTransaction = db.transaction.bind(db)
    const replacement = 'ChangedAuditOnly@2749'
    let revoked = false
    // Deterministic interleave immediately before the password write transaction;
    // bcrypt and both application transactions remain real, with no arbitrary delay.
    const spy = vi.spyOn(db, 'transaction').mockImplementation(async (callback, config) => {
      if (!revoked) {
        revoked = true
        await updateUserStatus('racing', 'LOCKED', 'admin', A, 'synthetic', 'audit')
      }
      return originalTransaction(callback, config)
    })
    try {
      const response = await request('/api/auth/change-password', token('racing', 'chunhiem'), { currentPassword: oldPassword, newPassword: replacement })
      expect(response.status, await response.clone().text()).toBe(401)
      expect(revoked).toBe(true)
      const [row] = await db.select().from(users).where(and(eq(users.id, 'racing'), eq(users.parishId, A)))
      expect(row).toMatchObject({ status: 'LOCKED', tokenVersion: 2 })
      expect(await bcrypt.compare(oldPassword, row.passwordHash)).toBe(true)
      expect(await db.select().from(refreshTokens).where(and(eq(refreshTokens.userId, 'racing'), eq(refreshTokens.parishId, A)))).toHaveLength(0)
    } finally { spy.mockRestore() }
  })

  it('D6: superadmin ID collision does not grant LOCKED exemption to another-tenant parent', async () => {
    expect((await request('/api/auth/me', token('ordinary-locked', 'phuhuynh', B), undefined, 'GET')).status).toBe(401)
    expect((await request('/api/auth/me', token(getSuperAdminId(), 'phuhuynh', B), undefined, 'GET')).status).toBe(401)
    await db.update(users).set({ role: 'admin' }).where(and(eq(users.id, getSuperAdminId()), eq(users.parishId, B)))
    expect((await request('/api/auth/me', token(getSuperAdminId(), 'admin', B), undefined, 'GET')).status).toBe(401)
  })

  it('D8: login error body does not distinguish a real parent account from a nonexistent one', async () => {
    const known = await request('/api/auth/login', '', { username: 'parent1', parishId: A, password: 'WrongAudit@456' })
    const unknown = await request('/api/auth/login', '', { username: 'not-an-account', parishId: A, password: 'WrongAudit@456' })
    expect(known.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await known.json()).toEqual(await unknown.json())
  })

  it('D9: parent cannot use staff grade/attendance reads', async () => {
    await db.insert(grades).values([1, 2].map(semester => ({
      id: `other-child-grade-${semester}`, parishId: A, studentId: 'child2', academicYear: '2025-2026', semester,
      scoreOral: 7, comments: 'Synthetic unrelated child private comment',
    })))
    await db.insert(attendance).values({ id: 'other-child-attendance', parishId: A, studentId: 'child2', date: '2025-10-05', type: 'SundayMass', status: 'Present', note: 'Synthetic unrelated child private note' })
    const bearer = token('parent1', 'phuhuynh')
    const gradeResponse = await request('/api/grades', bearer, undefined, 'GET')
    const attendanceResponse = await request('/api/attendance', bearer, undefined, 'GET')
    expect(gradeResponse.status).toBe(403)
    expect(attendanceResponse.status).toBe(403)
    expect(JSON.stringify(await gradeResponse.json())).not.toContain('Synthetic unrelated child private comment')
    expect(JSON.stringify(await attendanceResponse.json())).not.toContain('Synthetic unrelated child private note')
  })

  it('D10: unassigned teacher cannot sign; authorized signature only verifies identifiers', async () => {
    const signed = await request('/api/verification/sign', token('teacher', 'chunhiem'), {
      studentId: 'child2', academicYear: 'not-a-real-year', certId: 'not-an-issued-certificate',
    })
    expect(signed.status, await signed.clone().text()).toBe(403)
    const invalidYear = await request('/api/verification/sign', token('teacher', 'chunhiem'), {
      studentId: 'child1', academicYear: 'not-a-real-year', certId: 'identifier-only',
    })
    expect(invalidYear.status).toBe(400)
    const allowed = await request('/api/verification/sign', token('teacher', 'chunhiem'), {
      studentId: 'child1', academicYear: '2025-2026', certId: 'identifier-only',
    })
    expect(allowed.status, await allowed.clone().text()).toBe(200)
    const { data } = await allowed.json() as { data: Record<string, string> }
    const query = new URLSearchParams({ parishId: data.parishId, studentId: data.studentId, academicYear: data.academicYear, certId: data.certId, sig: data.signature })
    const verified = await app.request(`/api/verification/verify?${query}`)
    expect(verified.status).toBe(200)
    expect((await verified.json() as { data: unknown }).data).toMatchObject({ verified: true, verificationScope: 'signed_identifiers', certId: 'identifier-only', student: { fullName: 'Synthetic child1' } })
  })

  it('D9b: incremental pull with no changed assigned students keeps attendance scoped to assigned students', async () => {
    await db.update(students).set({ updatedAt: '2025-01-01T00:00:00.000Z' }).where(eq(students.parishId, A))
    await db.insert(attendance).values({ id: 'incremental-foreign-class', parishId: A, studentId: 'child2', date: '2025-10-12', type: 'SundayMass', status: 'Present', note: 'Synthetic out-of-class delta', updatedAt: '2026-06-01T00:00:00.000Z' })
    const response = await request('/api/attendance?updatedAfter=2026-01-01T00%3A00%3A00.000Z', token('teacher', 'chunhiem'), undefined, 'GET')
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).not.toContain('Synthetic out-of-class delta')
  })

  it('D11: import duplicate preview never exposes another parish class name', async () => {
    await db.update(classes)
      .set({ name: 'Synthetic parish B private class name' })
      .where(and(eq(classes.parishId, B), eq(classes.id, 'class1')))

    const response = await request('/api/students/validate', token('teacher', 'chunhiem'), { academicYearId: '2025-2026', rows: [{
      rowIndex: 1,
      holyName: 'Giuse',
      fullName: 'Synthetic child1',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Synthetic parent',
      parentPhone: '0900000101',
      address: 'Synthetic',
      branch: 'AuNhi',
      className: 'class1',
    }] })

    expect(response.status, await response.clone().text()).toBe(200)
    expect(JSON.stringify(await response.json())).not.toContain('Synthetic parish B private class name')
  })
})
