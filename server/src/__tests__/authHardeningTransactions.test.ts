import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, assessmentEntries, auditLogs, refreshTokens, examSessions, examResults } from '../db/schema.js'
import auth from '../routes/auth.js'
import userRoutes from '../routes/users.js'
import dailyRoutes from '../routes/dailyEntries.js'
import gradeRoutes from '../routes/grades.js'
import attendanceRoutes from '../routes/attendance.js'
import { generateTokens } from '../middleware/auth.js'
import { createUser, captureAdminReauth, resetUserPassword, updateUserStatus, updateUserPhone, forceLogoutUser } from '../services/userService.js'
import { removeUserFromClass } from '../services/classService.js'
import { undoGradeImport } from '../services/gradeService.js'
import { upsertExamResults, deleteExamResult, deleteExamSession, finalizeExamSession, reopenExamSession, updateAnswerKeyAndRescore, updateAnswerVariantsAndRescore, createImmutableVariantManifests, createExamSession } from '../services/examService.js'

const P = `auth-hardening-${Date.now()}`
const password = 'SyntheticOnly@123'
const app = new Hono().route('/api/auth', auth).route('/api/users', userRoutes).route('/api/daily-entries', dailyRoutes).route('/api/grades', gradeRoutes).route('/api/attendance', attendanceRoutes)
const token = (id: string, role: 'admin' | 'chunhiem' | 'phuhuynh', version = 1) => generateTokens({ userId: id, username: id, parishId: P, role, tokenVersion: version }).accessToken
const req = (path: string, bearer: string, body: unknown, method = 'POST'): Promise<Response> => Promise.resolve(app.request(path, {
  method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))
const userRow = async (id: string) => (await db.select().from(users).where(and(eq(users.id, id), eq(users.parishId, P))))[0]

async function interleave<T>(before: () => Promise<void>, action: () => Promise<T>) {
  const original = db.transaction.bind(db)
  let ran = false
  const spy = vi.spyOn(db, 'transaction').mockImplementation(async (callback, config) => {
    if (!ran) { ran = true; await before() }
    return original(callback, config)
  })
  try { const result = await action(); expect(ran).toBe(true); return result } finally { spy.mockRestore() }
}

beforeAll(async () => {
  const hash = await bcrypt.hash(password, 10)
  await db.insert(users).values(['admin', 'racing-admin', 'legacy', 'teacher', 'undo-teacher', 'parent', 'profile-audit', 'epoch-admin'].map(id => ({
    id, username: id, fullName: `Synthetic ${id}`, parishId: P,
    role: id.includes('admin') ? 'admin' as const : id === 'parent' ? 'phuhuynh' as const : 'chunhiem' as const,
    passwordHash: hash, phone: id === 'parent' ? '0900000201' : null,
  })))
  await db.insert(branches).values({ id: 'branch', parishId: P, name: 'Synthetic', scarfColor: 'Xanh', ageMin: 6, ageMax: 12 })
  await db.insert(academicYears).values({ id: '2025-2026', parishId: P, startDate: '2025-09-01', endDate: '2026-06-30' })
  await db.insert(classes).values({ id: 'class', parishId: P, code: 'LAB', name: 'Synthetic Class', branchId: 'branch', academicYearId: '2025-2026' })
  await db.insert(students).values({ id: 'child', parishId: P, code: 'LAB', fullName: 'Synthetic Child', holyName: 'Giuse', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Synthetic Parent', parentPhone: '0900000201', address: 'Synthetic', branch: 'AuNhi', classId: 'class' })
  await db.insert(catechistAssignments).values({ id: 'assignment', parishId: P, classId: 'class', userId: 'teacher', roleInClass: 'chunhiem' })
})
afterEach(() => vi.restoreAllMocks())

describe('Authorization preconditions at transaction commit boundary', () => {
  it('legacy-cost login cannot restore a password after reset commits', async () => {
    let tempPassword = ''
    const response = await interleave(async () => {
      tempPassword = (await resetUserPassword('legacy', 'admin', P, 'lab', 'test'))!.tempPassword
    }, () => req('/api/auth/login', '', { username: 'legacy', parishId: P, password }))
    expect(response.status).toBe(401)
    const row = await userRow('legacy')
    expect(row).toMatchObject({ status: 'FORCE_PASSWORD_CHANGE', tokenVersion: 2 })
    expect(await bcrypt.compare(password, row.passwordHash)).toBe(false)
    expect(await bcrypt.compare(tempPassword, row.passwordHash)).toBe(true)
    expect((await req('/api/auth/login', '', { username: 'legacy', parishId: P, password })).status).toBe(401)
    expect(await db.select().from(refreshTokens).where(and(eq(refreshTokens.parishId, P), eq(refreshTokens.userId, 'legacy')))).toHaveLength(0)
  })

  it('admin creation rolls back when the verified admin is locked before the transaction', async () => {
    const response = await interleave(
      async () => { await updateUserStatus('racing-admin', 'LOCKED', 'admin', P, 'lab', 'test') },
      () => req('/api/users', token('racing-admin', 'admin'), { username: 'post-revoke-admin', fullName: 'Synthetic New Admin', role: 'admin', adminPassword: password }),
    )
    expect(response.status).toBe(401)
    expect(await db.select().from(users).where(and(eq(users.parishId, P), eq(users.username, 'post-revoke-admin')))).toHaveLength(0)
  })

  it('admin creation service rejects missing or cross-operation reauth proof', async () => {
    const data = { username: 'unproved-admin', fullName: 'Synthetic New Admin', role: 'admin' as const }
    await expect(createUser(data, 'admin', P, 'lab', 'test')).rejects.toThrow('Quyền quản trị')
    const wrong = await captureAdminReauth('admin', password, P, 'lab', 'test', 'someone-else', 'RESET_PASSWORD_FAILED', 1)
    expect(wrong).not.toBeNull()
    await expect(createUser(data, 'admin', P, 'lab', 'test', wrong!)).rejects.toThrow('Quyền quản trị')
  })

  it.each(['reset', 'phone', 'delete', 'set-password'] as const)('%s cannot commit after reauthenticated actor force logout', async action => {
    const actorId = `${action}-admin`
    const targetId = `${action}-target`
    const hash = (await userRow('admin')).passwordHash
    await db.insert(users).values([
      { id: actorId, username: actorId, fullName: 'Synthetic Actor', parishId: P, role: 'admin', passwordHash: hash },
      { id: targetId, username: targetId, fullName: 'Synthetic Target', parishId: P, role: 'chunhiem', passwordHash: hash, phone: '0900000201' },
    ])
    const paths = { reset: `/api/users/${targetId}/reset-password`, phone: `/api/users/${targetId}/phone`, delete: `/api/users/${targetId}`, 'set-password': '/api/auth/admin-change-password' }
    const response = await interleave(
      async () => { await forceLogoutUser(actorId, 'admin', P, 'lab', 'test') },
      () => req(paths[action], token(actorId, 'admin'), { adminPassword: password, phone: '0900000299', userId: targetId, newPassword: 'ChangedOnly@123' }, action === 'delete' ? 'DELETE' : action === 'phone' ? 'PUT' : 'POST'),
    )
    expect(response.status).toBe(401)
    expect(await userRow(targetId)).toMatchObject({ passwordHash: hash, phone: '0900000201', deletedAt: null, tokenVersion: 1 })
  })

  it('daily batch denies a revoked assignment and does not claim an item was saved', async () => {
    const response = await interleave(
      async () => { await removeUserFromClass('class', 'teacher', 'admin', P, 'lab', 'test') },
      () => req('/api/daily-entries/batch', token('teacher', 'chunhiem'), { entries: [{ id: 'revoked-entry', studentId: 'child', academicYear: '2025-2026', semester: 2, scoreType: 'oral', value: 9 }] }),
    )
    expect(response.status).toBe(200) // Existing per-item partial-success contract.
    expect((await response.json() as any).data).toMatchObject({ saved: 0, errorCount: 1 })
    expect(await db.select().from(assessmentEntries).where(and(eq(assessmentEntries.parishId, P), eq(assessmentEntries.id, 'revoked-entry')))).toHaveLength(0)
  })

  it('unrestricted admin daily write still checks the originating epoch', async () => {
    const response = await interleave(
      async () => { await forceLogoutUser('epoch-admin', 'admin', P, 'lab', 'test') },
      () => req('/api/daily-entries/batch', token('epoch-admin', 'admin'), { entries: [{ id: 'epoch-entry', studentId: 'child', academicYear: '2025-2026', semester: 2, scoreType: 'oral', value: 9 }] }),
    )
    expect((await response.json() as any).data).toMatchObject({ saved: 0, errorCount: 1 })
  })

  it('undo rejects a captured assignment after its revocation commits', async () => {
    await db.insert(catechistAssignments).values({ id: 'undo-assignment', parishId: P, classId: 'class', userId: 'undo-teacher', roleInClass: 'chunhiem' })
    const results = await interleave(
      async () => { await removeUserFromClass('class', 'undo-teacher', 'admin', P, 'lab', 'test') },
      () => undoGradeImport([{ studentId: 'child' }], 2, '2025-2026', 'undo-teacher', P, 'lab', 'test', ['class'], { role: 'chunhiem', epoch: 1 }),
    )
    expect(results[0].status).toBe('forbidden')
  })

  it('daily deletion preserves the row when admin epoch changes before its transaction', async () => {
    const created = await req('/api/daily-entries/batch', token('admin', 'admin'), { entries: [{ id: 'delete-entry', studentId: 'child', academicYear: '2025-2026', semester: 2, scoreType: 'oral', value: 8 }] })
    expect((await created.json() as any).data.saved).toBe(1)
    const epoch = (await userRow('epoch-admin')).tokenVersion
    const response = await interleave(
      async () => { await forceLogoutUser('epoch-admin', 'admin', P, 'lab', 'test') },
      () => req('/api/daily-entries/delete-entry', token('epoch-admin', 'admin', epoch), {}, 'DELETE'),
    )
    expect(response.status).toBe(403)
    expect(await db.select().from(assessmentEntries).where(and(eq(assessmentEntries.parishId, P), eq(assessmentEntries.id, 'delete-entry')))).toHaveLength(1)
  })

  it('name-only parent profile update preserves a concurrently changed canonical phone', async () => {
    const response = await interleave(
      async () => { await updateUserPhone('parent', '0900000299', 'admin', P, 'lab', 'test') },
      () => req('/api/auth/profile', token('parent', 'phuhuynh'), { fullName: 'Updated Parent' }, 'PUT'),
    )
    expect(response.status).toBe(200)
    expect(await userRow('parent')).toMatchObject({ fullName: 'Updated Parent', phone: '0900000299' })
  })

  it('profile mutation rolls back if its audit insert fails', async () => {
    const original = db.transaction.bind(db)
    vi.spyOn(db, 'transaction').mockImplementation((callback, config) => original(async tx => {
      const insert = tx.insert.bind(tx)
      vi.spyOn(tx, 'insert').mockImplementation((table: any) => {
        if (table === auditLogs) throw new Error('Synthetic audit failure')
        return insert(table)
      })
      return callback(tx)
    }, config))
    expect((await req('/api/auth/profile', token('profile-audit', 'chunhiem'), { fullName: 'Must Roll Back' }, 'PUT')).status).toBe(500)
    expect((await userRow('profile-audit')).fullName).toBe('Synthetic profile-audit')
  })

  it('empty profile patch on an account without a phone is a no-op', async () => {
    const response = await req('/api/auth/profile', token('profile-audit', 'chunhiem'), {}, 'PUT')
    expect(response.status).toBe(200)
    expect((await userRow('profile-audit')).phone).toBeNull()
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, P), eq(auditLogs.userId, 'profile-audit'), eq(auditLogs.action, 'UPDATE_PROFILE')))).toHaveLength(0)
  })

  it.each(['results', 'delete-result', 'delete-session', 'finalize', 'completed-replay', 'reopen', 'answer-key', 'answer-variants', 'manifests', 'create'] as const)('exam %s denies a stale epoch before mutation or replay', async action => {
    const id = `exam-${action}`
    const actorId = `exam-admin-${action}`
    await db.insert(users).values({ id: actorId, username: actorId, fullName: 'Synthetic Exam Admin', parishId: P, role: 'admin', passwordHash: 'unused' })
    await db.insert(examSessions).values({ id, parishId: P, classId: 'class', subject: 'Synthetic', scoreType: '15m', semester: 2, academicYear: '2025-2026', examType: 'multiple_choice', questionCount: 1, answerKey: '{"1":"A"}', status: action === 'completed-replay' ? 'completed' : 'draft', createdBy: actorId })
    const expected = { role: 'admin' as const, epoch: 1 }
    const run = () => {
      switch (action) {
        case 'results': return upsertExamResults(id, [{ studentId: 'child', score: 7, source: 'quick_entry' }], actorId, P, 'lab', 'test', null, expected)
        case 'delete-result': return deleteExamResult(id, 'child', actorId, P, 'lab', 'test', null, expected)
        case 'delete-session': return deleteExamSession(id, actorId, P, 'lab', 'test', null, expected)
        case 'finalize': case 'completed-replay': return finalizeExamSession(id, actorId, P, 'lab', 'test', null, expected)
        case 'reopen': return reopenExamSession(id, actorId, P, 'lab', 'test', expected)
        case 'answer-key': return updateAnswerKeyAndRescore(id, P, '{"1":"B"}', 1, actorId, 'lab', 'test', expected)
        case 'answer-variants': return updateAnswerVariantsAndRescore(id, P, '{"A":{"1":"B"}}', 1, actorId, 'lab', 'test', expected)
        case 'manifests': return createImmutableVariantManifests({ sessionId: id, parishId: P, userId: actorId, ip: 'lab', userAgent: 'test', allowedClassIds: null, variantCount: 2, expected })
        case 'create': return createExamSession({ classId: 'class', subject: id, scoreType: '15m', semester: 2, academicYear: '2025-2026' }, actorId, P, 'lab', 'test', expected)
      }
    }
    await expect(interleave(
      async () => { await forceLogoutUser(actorId, 'admin', P, 'lab', 'test') },
      async () => run(),
    )).rejects.toThrow('Quyền thao tác phiên chấm đã thay đổi')
    const [row] = await db.select().from(examSessions).where(and(eq(examSessions.parishId, P), eq(examSessions.id, id)))
    expect(row).toMatchObject({ answerKey: '{"1":"A"}', status: action === 'completed-replay' ? 'completed' : 'draft' })
    expect(await db.select().from(examResults).where(and(eq(examResults.parishId, P), eq(examResults.examSessionId, id)))).toHaveLength(0)
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, P), eq(auditLogs.userId, actorId)))).toHaveLength(0)
  })

  it.each(['grades', 'attendance'] as const)('%s HTTP writer checks an unrestricted admin epoch inside the transaction', async resource => {
    const actorId = `${resource}-admin`
    await db.insert(users).values({ id: actorId, username: actorId, fullName: 'Synthetic Admin', parishId: P, role: 'admin', passwordHash: 'unused' })
    const body = resource === 'grades'
      ? { studentId: 'child', academicYear: '2025-2026', semester: 2, scoreOral: 8 }
      : { studentId: 'child', date: '2026-03-01', type: 'CatechismClass', status: 'Present' }
    const response = await interleave(
      async () => { await forceLogoutUser(actorId, 'admin', P, 'lab', 'test') },
      () => req(`/api/${resource}`, token(actorId, 'admin'), body),
    )
    expect(response.status).toBe(403)
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, P), eq(auditLogs.userId, actorId)))).toHaveLength(0)
  })
})
