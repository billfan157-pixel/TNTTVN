/**
 * AUDIT REPRODUCERS, NOT ACCEPTANCE TESTS.
 * Assertions describe observed vulnerabilities at the audited snapshot. A pass
 * confirms reproduction, NOT security. After remediation these must stop passing;
 * add inverse invariant tests to the normal suite instead of preserving the bugs.
 * Uses the existing globalSetup's disposable SQLite; no production DB or delivery.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db } from '../../server/src/db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, grades, semesterLocks, leaveRequests, attendance, telegramLinks } from '../../server/src/db/schema.js'
import { generateTokens, getSuperAdminId } from '../../server/src/middleware/auth.js'
import auth from '../../server/src/routes/auth.js'
import gradesRouter from '../../server/src/routes/grades.js'
import attendanceRouter from '../../server/src/routes/attendance.js'
import leaveRouter from '../../server/src/routes/leaveRequests.js'
import notificationsRouter from '../../server/src/routes/notifications.js'
import parishProfileRouter from '../../server/src/routes/parishProfile.js'
import verificationRouter from '../../server/src/routes/verification.js'
import importRouter from '../../server/src/routes/import.js'
import { updateUserStatus } from '../../server/src/services/userService.js'
import { enqueueNotification } from '../../server/src/services/notificationQueue.js'
import { getTelegramLinkForChat } from '../../server/src/services/telegramLinkService.js'

vi.mock('../../server/src/services/notificationQueue.js', () => ({ enqueueNotification: vi.fn().mockResolvedValue(undefined) }))

const A = 'audit-0905-a', B = 'audit-0905-b'
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
      address: 'Synthetic', branch: 'AuNhi', classId: index === 1 ? 'class2' : 'class1',
    })))
    await db.insert(grades).values({ id: 'shared-grade-id', parishId, studentId: 'child1', academicYear: '2025-2026', semester: 1, scoreOral: 2, version: 1 })
  }
  await db.insert(catechistAssignments).values({ id: 'assignment', parishId: A, userId: 'teacher', classId: 'class1', roleInClass: 'chunhiem' })
})

describe('Opt-in AUTH audit: passes mean defect reproduced', () => {
  it('D1: authorized parish A grade write also updates parish B with the same ID/version', async () => {
    const response = await request('/api/grades', token('teacher', 'chunhiem'), {
      studentId: 'child1', academicYear: '2025-2026', semester: 1, scoreOral: 9, version: 1,
    })
    expect(response.status, await response.clone().text()).toBe(200)
    const rows = await db.select().from(grades).where(eq(grades.id, 'shared-grade-id'))
    expect(rows).toHaveLength(2)
    expect(rows.find(row => row.parishId === B)).toMatchObject({ scoreOral: 9, version: 2 })
  })

  it('D2a: leave review writes locked-semester attendance rejected by the canonical endpoint', async () => {
    await db.insert(semesterLocks).values({ id: 'lock', parishId: A, academicYear: '2025-2026', semester: 1, isLocked: true })
    const bearer = token('teacher', 'chunhiem')
    const direct = await request('/api/attendance', bearer, { studentId: 'child1', date: '2025-10-05', type: 'SundayMass', status: 'AbsentExcused' })
    expect(direct.status, await direct.clone().text()).toBe(403)
    await db.insert(leaveRequests).values({ id: 'locked-leave', parishId: A, studentId: 'child1', classId: 'class1', parentName: 'Synthetic', parentPhone: '0900000101', date: '2025-10-05', sessionTypes: '["SundayMass"]', reason: 'Synthetic audit' })
    const review = await request('/api/leave-requests/locked-leave/review', bearer, { status: 'APPROVED' }, 'PATCH')
    expect(review.status, await review.clone().text()).toBe(200)
    const rows = await db.select().from(attendance).where(and(eq(attendance.parishId, A), eq(attendance.studentId, 'child1')))
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'AbsentExcused', date: '2025-10-05' })]))
  })

  it('D2b: teacher of old class can review and write attendance after student transfers', async () => {
    await db.insert(leaveRequests).values({ id: 'moved-leave', parishId: A, studentId: 'moved', classId: 'class1', parentName: 'Synthetic', parentPhone: '0900000101', date: '2026-03-01', sessionTypes: '["SundayMass"]', reason: 'Synthetic audit' })
    await db.update(students).set({ classId: 'class2' }).where(and(eq(students.parishId, A), eq(students.id, 'moved')))
    const bearer = token('teacher', 'chunhiem')
    const direct = await request('/api/attendance', bearer, { studentId: 'moved', date: '2026-03-01', type: 'SundayMass', status: 'AbsentExcused' })
    expect(direct.status).toBe(403)
    const review = await request('/api/leave-requests/moved-leave/review', bearer, { status: 'APPROVED' }, 'PATCH')
    expect(review.status, await review.clone().text()).toBe(200)
    const rows = await db.select().from(attendance).where(and(eq(attendance.parishId, A), eq(attendance.studentId, 'moved')))
    expect(rows[0]?.status).toBe('AbsentExcused')
  })

  it('D3: report-card authorized for class1 selects unrelated class2 parent by caller phone', async () => {
    vi.mocked(enqueueNotification).mockClear()
    const response = await request('/api/notifications/smart/report-cards', token('teacher', 'chunhiem'), { students: [{
      studentId: 'child1', parentPhone: '0900000102', studentName: 'Synthetic child1', holyName: 'Giuse',
      className: 'class1', score: 9, rank: 'Gioi', attendanceRate: 90, attendancePresent: 9, attendanceTotal: 10,
    }] })
    expect(response.status, await response.clone().text()).toBe(200)
    expect(vi.mocked(enqueueNotification).mock.calls.some(call => call[0] === 'webpush' && call[6]?.webpushUserIds?.includes('parent2'))).toBe(true)
    expect(vi.mocked(enqueueNotification).mock.calls.some(call => call[6]?.webpushUserIds?.includes('parent1'))).toBe(false)
  })

  it('D4: forced-password admin passes suffix allowlist for a parish profile mutation', async () => {
    const bearer = token('forced', 'admin')
    expect((await request('/api/grades', bearer, undefined, 'GET')).status).toBe(403)
    const response = await request('/api/parish-profile/profile', bearer, { displayName: 'Synthetic changed before password rotation' }, 'PUT')
    expect(response.status, await response.clone().text()).toBe(200)
  })

  it('D5: password-change request reactivates account locked after password verification', async () => {
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
      expect(response.status, await response.clone().text()).toBe(200)
      expect(revoked).toBe(true)
      const body = await response.json()
      expect((await request('/api/auth/me', body.data.accessToken, undefined, 'GET')).status).toBe(200)
      const [row] = await db.select().from(users).where(and(eq(users.id, 'racing'), eq(users.parishId, A)))
      expect(row).toMatchObject({ status: 'ACTIVE', tokenVersion: 3 })
    } finally { spy.mockRestore() }
  })

  it('D6: superadmin ID collision grants LOCKED exemption to another-tenant parent', async () => {
    expect((await request('/api/auth/me', token('ordinary-locked', 'phuhuynh', B), undefined, 'GET')).status).toBe(401)
    expect((await request('/api/auth/me', token(getSuperAdminId(), 'phuhuynh', B), undefined, 'GET')).status).toBe(200)
  })

  it('D7: Telegram status join can return a different parish parent name for a shared user ID', async () => {
    await db.insert(users).values([
      { id: 'telegram-shared', parishId: A, username: 'telegram-shared', fullName: 'Other parish synthetic name', role: 'phuhuynh', passwordHash: 'unused' },
      { id: 'telegram-shared', parishId: B, username: 'telegram-shared', fullName: 'Linked parish synthetic name', role: 'phuhuynh', passwordHash: 'unused' },
    ])
    await db.insert(telegramLinks).values({ id: 'telegram-link', parishId: B, userId: 'telegram-shared', chatId: 'synthetic-chat', telegramUserId: 'synthetic-user', status: 'ACTIVE', notificationsEnabled: 1 })
    const result = await getTelegramLinkForChat('synthetic-chat')
    expect(result).toMatchObject({ parishId: B, fullName: 'Other parish synthetic name' })
  })

  it('D8: login error body distinguishes a real parent account from a nonexistent one', async () => {
    const known = await request('/api/auth/login', '', { username: 'parent1', parishId: A, password: 'WrongAudit@456' })
    const unknown = await request('/api/auth/login', '', { username: 'not-an-account', parishId: A, password: 'WrongAudit@456' })
    expect(known.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect((await known.json()).error.message).toContain('Lần thử:')
    expect((await unknown.json()).error.message).not.toContain('Lần thử:')
  })

  it('D9: parent with zero assignments reads another parent child grades and attendance', async () => {
    await db.insert(grades).values([1, 2].map(semester => ({
      id: `other-child-grade-${semester}`, parishId: A, studentId: 'child2', academicYear: '2025-2026', semester,
      scoreOral: 7, comments: 'Synthetic unrelated child private comment',
    })))
    await db.insert(attendance).values({ id: 'other-child-attendance', parishId: A, studentId: 'child2', date: '2025-10-05', type: 'SundayMass', status: 'Present', note: 'Synthetic unrelated child private note' })
    const bearer = token('parent1', 'phuhuynh')
    const gradeResponse = await request('/api/grades', bearer, undefined, 'GET')
    const attendanceResponse = await request('/api/attendance', bearer, undefined, 'GET')
    expect(gradeResponse.status).toBe(200)
    expect(attendanceResponse.status).toBe(200)
    expect(JSON.stringify(await gradeResponse.json())).toContain('Synthetic unrelated child private comment')
    expect(JSON.stringify(await attendanceResponse.json())).toContain('Synthetic unrelated child private note')
  })

  it('D10: unassigned teacher signs nonexistent report tuple and public verifier claims authenticity', async () => {
    const signed = await request('/api/verification/sign', token('teacher', 'chunhiem'), {
      studentId: 'child2', academicYear: 'not-a-real-year', certId: 'not-an-issued-certificate',
    })
    expect(signed.status, await signed.clone().text()).toBe(200)
    const { data } = await signed.json()
    const query = new URLSearchParams({ parishId: data.parishId, studentId: data.studentId, academicYear: data.academicYear, certId: data.certId, sig: data.signature })
    const verified = await app.request(`/api/verification/verify?${query}`)
    expect(verified.status).toBe(200)
    expect((await verified.json()).data).toMatchObject({ verified: true, certId: 'not-an-issued-certificate', student: { fullName: 'Synthetic child2' } })
  })

  it('D9b: incremental pull with no changed assigned students widens attendance to the parish', async () => {
    await db.update(students).set({ updatedAt: '2025-01-01T00:00:00.000Z' }).where(eq(students.parishId, A))
    await db.insert(attendance).values({ id: 'incremental-foreign-class', parishId: A, studentId: 'child2', date: '2025-10-12', type: 'SundayMass', status: 'Present', note: 'Synthetic out-of-class delta', updatedAt: '2026-06-01T00:00:00.000Z' })
    const response = await request('/api/attendance?updatedAfter=2026-01-01T00%3A00%3A00.000Z', token('teacher', 'chunhiem'), undefined, 'GET')
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).toContain('Synthetic out-of-class delta')
  })

  it('D11: import duplicate preview can expose another parish class name through an ID-only join', async () => {
    await db.update(classes)
      .set({ name: 'Synthetic parish B private class name' })
      .where(and(eq(classes.parishId, B), eq(classes.id, 'class1')))

    const response = await request('/api/students/validate', token('teacher', 'chunhiem'), { rows: [{
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
    expect(JSON.stringify(await response.json())).toContain('Synthetic parish B private class name')
  })
})
