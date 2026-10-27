import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import * as gradeService from '../services/gradeService.js'
import { generateTokens } from '../middleware/auth.js'
import dailyEntriesApp from '../routes/dailyEntries.js'
import examsApp from '../routes/exams.js'
import { db, client } from '../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, semesterLocks, assessmentEntries, grades, gradeOverrides, examSessions, examResults, examFinalizations, examFinalizationItems, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

// Tier 2 (daily là điểm chính thức): attempts nhập tay là first-class ledger rows.
const PREFIX = Date.now()
const parishId = `parish-daily-${PREFIX}`
const branchId = `br-daily-${PREFIX}`
const yearId = '2025-2026'
const classId = `cl-daily-${PREFIX}`
const otherClassId = `cl-daily-other-${PREFIX}`
const adminId = `usr-daily-admin-${PREFIX}`
const cnId = `usr-daily-cn-${PREFIX}`
const phutaOtherId = `usr-daily-phuta-other-${PREFIX}`
const studentId = `st-daily-${PREFIX}`
const bonusStudentId = `st-bonus-${PREFIX}`

const adminToken = generateTokens({ userId: adminId, username: `daily_admin_${PREFIX}`, role: 'admin', parishId }).accessToken
const cnToken = generateTokens({ userId: cnId, username: `daily_cn_${PREFIX}`, role: 'chunhiem', parishId }).accessToken
const phutaOtherToken = generateTokens({ userId: phutaOtherId, username: `daily_phuta_${PREFIX}`, role: 'phuta', parishId }).accessToken

async function jsonReq(app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> }, path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`
  const res = await app.request(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  let body: any = null
  try { body = (await res.json()) as any } catch {}
  return { status: res.status, body, data: body?.data }
}

const entry = (id: string, value: number, extra: Record<string, unknown> = {}) => ({
  id,
  studentId,
  academicYear: yearId,
  semester: 1,
  scoreType: 'oral',
  value,
  date: '2026-01-15',
  ...extra,
})

describe('Tier 2 — daily-entries ledger API', () => {
  beforeAll(async () => {
    await db.insert(branches).values({ id: branchId, name: 'Daily', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: `CL-D-${PREFIX}`, name: 'Lớp Daily', branchId, academicYearId: yearId, parishId }).onConflictDoNothing()
    await db.insert(classes).values({ id: otherClassId, code: `CL-DO-${PREFIX}`, name: 'Lớp Khác', branchId, academicYearId: yearId, parishId }).onConflictDoNothing()
    await db.insert(users).values([
      { id: adminId, username: `daily_admin_${PREFIX}`, fullName: 'Admin Daily', passwordHash: 'hash', role: 'admin', parishId },
      { id: cnId, username: `daily_cn_${PREFIX}`, fullName: 'CN Daily', passwordHash: 'hash', role: 'chunhiem', parishId },
      { id: phutaOtherId, username: `daily_phuta_${PREFIX}`, fullName: 'Phuta Khác', passwordHash: 'hash', role: 'phuta', parishId },
    ]).onConflictDoNothing()
    await db.insert(catechistAssignments).values([
      { id: `asg-d-${PREFIX}`, userId: cnId, classId, roleInClass: 'chunhiem', parishId },
      { id: `asg-do-${PREFIX}`, userId: phutaOtherId, classId: otherClassId, roleInClass: 'phuta', parishId },
    ]).onConflictDoNothing()
    await db.insert(students).values([
      { id: studentId, code: `ST-D-${PREFIX}`, holyName: 'Giu-se', fullName: 'Nguyen Van D', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId, parishId },
      { id: bonusStudentId, code: `ST-B-${PREFIX}`, holyName: 'Giu-se', fullName: 'Bonus Student', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId, parishId },
    ]).onConflictDoNothing()
  })

  afterAll(async () => {
    // FK order: exam items → finalizations → results → sessions → ledger → grades → roster.
    await db.delete(examFinalizationItems).where(eq(examFinalizationItems.parishId, parishId))
    await db.delete(examFinalizations).where(eq(examFinalizations.parishId, parishId))
    await db.delete(examResults).where(eq(examResults.parishId, parishId))
    await db.delete(examSessions).where(eq(examSessions.parishId, parishId))
    await db.delete(assessmentEntries).where(eq(assessmentEntries.parishId, parishId))
    await db.delete(gradeOverrides).where(eq(gradeOverrides.parishId, parishId))
    await db.delete(grades).where(eq(grades.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
    await db.delete(classes).where(eq(classes.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
  })

  it('401 khi thiếu token', async () => {
    expect((await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', body: { entries: [] } })).status).toBe(401)
  })

  it('conduct starts at 10, accumulates deductions, persists reasons and replays exactly once', async () => {
    const send = (id: string, value: number, extra = {}) => jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: cnToken, body: { entries: [entry(id, value, { semester: 2, scoreType: 'conduct', reason: 'Nói chuyện riêng', ...extra })] } })
    const id = `CD-${PREFIX}-first`
    expect((await send(id, 0.5)).data.items[0]).toMatchObject({ status: 'created', serverScore: 9.5 })
    expect((await send(`CD-${PREFIX}-second`, 1)).data.items[0]).toMatchObject({ status: 'created', serverScore: 8.5 })
    expect((await send(id, 0.5)).data.items[0]).toMatchObject({ status: 'duplicate', serverScore: 9.5 })
    expect((await send(id, 0.5, { reason: 'Lý do khác' })).data.errorCount).toBe(1)
    const [grade] = await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, studentId), eq(grades.semester, 2)))
    expect(grade.scoreDaoDuc).toBe(8.5)
    const history = await jsonReq(dailyEntriesApp, `/?classId=${classId}&semester=2&academicYear=${yearId}&scoreType=conduct`, { token: cnToken })
    expect(history.data).toHaveLength(2)
    expect(history.data[0]).toMatchObject({ reason: 'Nói chuyện riêng', beforeScore: 10, afterScore: 9.5 })
    expect((await send(`CD-${PREFIX}-bad`, 0.5, { reason: ' ' })).status).toBe(400)
    expect((await send(`CD-${PREFIX}-amount`, 3)).status).toBe(400)
    for (const value of [2, 2, 2, 2, 0.5]) expect((await send(`CD-${PREFIX}-${crypto.randomUUID()}`, value)).data.saved).toBe(1)
    expect((await send(`CD-${PREFIX}-negative`, 0.5)).data.errorCount).toBe(1)
    const [zero] = await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, studentId), eq(grades.semester, 2)))
    expect(zero.scoreDaoDuc).toBe(0)
  })

  it('conduct rejects wrong class, other parish and locked semester without a receipt', async () => {
    const id = `CD-${PREFIX}-denied`
    const body = { entries: [entry(id, 1, { scoreType: 'conduct', reason: 'Nội quy' })] }
    const otherParishToken = generateTokens({ userId: 'USR-001', username: 'bill', role: 'admin', parishId: 'gia-ton' }).accessToken
    for (const token of [phutaOtherToken, otherParishToken]) {
      const res = await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token, body })
      expect(res.data.errorCount).toBe(1)
    }
    await db.insert(semesterLocks).values({ id: `conduct-lock-${PREFIX}`, parishId, academicYear: yearId, semester: 1, isLocked: 1 })
    try {
      const res = await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: cnToken, body })
      expect(res.data.items[0].reason).toMatch(/khóa sổ/)
      expect(await db.select().from(auditLogs).where(eq(auditLogs.id, `conduct:${id}`))).toHaveLength(0)
    } finally {
      await db.delete(semesterLocks).where(eq(semesterLocks.id, `conduct-lock-${PREFIX}`))
    }
  })

  it('conduct preserves an existing manual score and serializes distinct concurrent deductions', async () => {
    const existingId = `st-conduct-existing-${PREFIX}`
    await db.insert(students).values({ id: existingId, code: `ST-C-${PREFIX}`, fullName: 'Điểm đã có', holyName: '', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId, parishId })
    await gradeService.upsertGrade({ studentId: existingId, academicYear: yearId, semester: 1, scoreDaoDuc: 6.5, scoreDaoDuc_source: 'manual' }, adminId, parishId, '', '')
    const results = await Promise.all([0.5, 1].map((value, i) => jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: cnToken, body: { entries: [entry(`CD-${PREFIX}-concurrent-${i}`, value, { studentId: existingId, scoreType: 'conduct', reason: `Vi phạm ${i}` })] } })))
    expect(results.map(r => r.data.saved)).toEqual([1, 1])
    const [grade] = await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, existingId)))
    expect(grade.scoreDaoDuc).toBe(5)
    expect(grade.scoreOral).toBeNull()
  })

  it('conduct rolls back grade and override when its receipt cannot commit', async () => {
    const id = `CD-${PREFIX}-rollback`
    const trigger = `reject_conduct_${PREFIX}`
    await client.execute(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs WHEN NEW.id = 'conduct:${id}' BEGIN SELECT RAISE(ABORT, 'synthetic receipt failure'); END`)
    const before = await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, studentId), eq(grades.semester, 1)))
    try {
      const res = await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: cnToken, body: { entries: [entry(id, 1, { scoreType: 'conduct', reason: 'Nội quy' })] } })
      expect(res.data.errorCount).toBe(1)
      expect(await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, studentId), eq(grades.semester, 1)))).toEqual(before)
      expect(await db.select().from(auditLogs).where(eq(auditLogs.id, `conduct:${id}`))).toHaveLength(0)
    } finally { await client.execute(`DROP TRIGGER ${trigger}`) }
  })

  it('batch tạo 2 attempts tay → saved 2, ledger source manual_entry', async () => {
    const res = await jsonReq(dailyEntriesApp, '/batch', {
      method: 'POST', token: cnToken,
      body: { entries: [entry(`DG-${PREFIX}-1`, 8), entry(`DG-${PREFIX}-2`, 9)] },
    })
    expect(res.status).toBe(200)
    expect(res.data.saved).toBe(2)
    expect(res.data.total).toBe(2)
    expect(res.data.items.map((i: { status: string }) => i.status)).toEqual(['created', 'created'])

    const rows = await db.select().from(assessmentEntries).where(eq(assessmentEntries.parishId, parishId))
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.source === 'manual_entry')).toBe(true)
    expect(rows.every((r) => r.examSessionId === null)).toBe(true)
    expect(rows.find((r) => r.id === `DG-${PREFIX}-1`)?.entryDate).toBe('2026-01-15')
  })

  it('retry cùng batch → duplicate, không nhân đôi rows', async () => {
    const res = await jsonReq(dailyEntriesApp, '/batch', {
      method: 'POST', token: cnToken,
      body: { entries: [entry(`DG-${PREFIX}-1`, 8), entry(`DG-${PREFIX}-2`, 9)] },
    })
    expect(res.status).toBe(200)
    expect(res.data.duplicates).toBe(2)
    expect(res.data.saved).toBe(0)
    const rows = await db.select().from(assessmentEntries).where(eq(assessmentEntries.parishId, parishId))
    expect(rows).toHaveLength(2)
  })

  it('cùng id khác payload → item error IDEMPOTENCY_CONFLICT', async () => {
    const res = await jsonReq(dailyEntriesApp, '/batch', {
      method: 'POST', token: cnToken,
      body: { entries: [entry(`DG-${PREFIX}-1`, 5)] },
    })
    expect(res.status).toBe(200)
    expect(res.data.errorCount).toBe(1)
    expect(res.data.items[0].status).toBe('error')
    expect(res.data.items[0].reason).toMatch(/IDEMPOTENCY_CONFLICT/)
  })

  it('phuta lớp khác → item error FORBIDDEN (partial-success, HTTP 200)', async () => {
    const res = await jsonReq(dailyEntriesApp, '/batch', {
      method: 'POST', token: phutaOtherToken,
      body: { entries: [entry(`DG-${PREFIX}-x`, 8)] },
    })
    expect(res.status).toBe(200)
    expect(res.data.errorCount).toBe(1)
    expect(res.data.items[0].reason).toMatch(/quyền/)
  })

  it('phuta của lớp được nhập và xóa daily entry cùng authoritative Grade projection', async () => {
    const assignmentId = `asg-d-phuta-local-${PREFIX}`
    const entryId = `DG-${PREFIX}-phuta-local`
    await db.insert(catechistAssignments).values({
      id: assignmentId,
      userId: phutaOtherId,
      classId,
      roleInClass: 'phuta',
      parishId,
    })
    try {
      const saved = await jsonReq(dailyEntriesApp, '/batch', {
        method: 'POST',
        token: phutaOtherToken,
        body: { entries: [entry(entryId, 7)] },
      })
      expect(saved.status).toBe(200)
      expect(saved.data).toMatchObject({ saved: 1, errorCount: 0 })
      expect(await db.select().from(assessmentEntries).where(and(
        eq(assessmentEntries.parishId, parishId),
        eq(assessmentEntries.id, entryId),
      ))).toHaveLength(1)
      const [projected] = await db.select().from(grades).where(and(
        eq(grades.parishId, parishId),
        eq(grades.studentId, studentId),
      ))
      expect(projected.scoreOralSource).toBe('daily_avg')

      expect((await jsonReq(dailyEntriesApp, `/${entryId}`, { method: 'DELETE', token: phutaOtherToken })).status).toBe(200)
    } finally {
      await db.delete(catechistAssignments).where(eq(catechistAssignments.id, assignmentId))
    }
  })

  it('học kỳ khóa → item error, không ghi gì', async () => {
    await db.insert(semesterLocks).values({ id: `sml-d-${PREFIX}`, parishId, academicYear: yearId, semester: 1, isLocked: 1 }).onConflictDoNothing()
    try {
      const res = await jsonReq(dailyEntriesApp, '/batch', {
        method: 'POST', token: adminToken,
        body: { entries: [entry(`DG-${PREFIX}-locked`, 8)] },
      })
      expect(res.status).toBe(200)
      expect(res.data.errorCount).toBe(1)
      expect(res.data.items[0].reason).toMatch(/khóa sổ/)
      const rows = await db.select().from(assessmentEntries).where(and(eq(assessmentEntries.parishId, parishId), eq(assessmentEntries.id, `DG-${PREFIX}-locked`)))
      expect(rows).toHaveLength(0)
    } finally {
      await db.delete(semesterLocks).where(and(eq(semesterLocks.parishId, parishId), eq(semesterLocks.semester, 1)))
    }
  })

  it('DELETE dòng tay → 200; DELETE lại → 404; DELETE dòng máy → 409', async () => {
    const del = await jsonReq(dailyEntriesApp, `/DG-${PREFIX}-2`, { method: 'DELETE', token: cnToken })
    expect(del.status).toBe(200)
    expect(del.data.deleted).toBe(true)

    const again = await jsonReq(dailyEntriesApp, `/DG-${PREFIX}-2`, { method: 'DELETE', token: cnToken })
    expect(again.status).toBe(404)

    const now = new Date().toISOString()
    await db.insert(assessmentEntries).values({
      id: `ASM-d-${PREFIX}`, parishId, studentId, examSessionId: null,
      academicYear: yearId, semester: 1, scoreType: 'oral',
      rawScore: 7, maxScore: 10, score: 7, source: 'legacy_baseline', createdBy: 'system', createdAt: now,
    })
    const machine = await jsonReq(dailyEntriesApp, `/ASM-d-${PREFIX}`, { method: 'DELETE', token: adminToken })
    expect(machine.status).toBe(409)
  })

  it('GET list theo class → map origin manual/machine, scope đúng tenant', async () => {
    const res = await jsonReq(dailyEntriesApp, `/?classId=${classId}&semester=1&academicYear=${yearId}`, { token: cnToken })
    expect(res.status).toBe(200)
    const origins = new Set(res.data.map((r: { origin: string }) => r.origin))
    expect(origins.has('manual')).toBe(true)
    // legacy_baseline bị loại khỏi display (không phải attempt).
    expect(res.data.every((r: { id: string }) => r.id !== `ASM-d-${PREFIX}`)).toBe(true)

    const cross = await jsonReq(dailyEntriesApp, '/?classId=cl-khong-ton-tai&semester=1', { token: adminToken })
    expect(cross.status).toBe(404)

    const noScope = await jsonReq(dailyEntriesApp, '/?semester=1', { token: adminToken })
    expect(noScope.status).toBe(400)

    const forbidden = await jsonReq(dailyEntriesApp, `/?classId=${classId}&semester=1`, { token: phutaOtherToken })
    expect(forbidden.status).toBe(403)
  })

  it('Tier 2 end-to-end: finalize trung bình gồm cả attempts tay', async () => {
    // Sổ hiện có: DG-..-1 tay = 8 (oral). Tạo session oral, quét 6 → finalize = (8+6)/2 = 7.
    const created = await jsonReq(examsApp, '/', {
      method: 'POST', token: adminToken,
      body: { classId, subject: 'Miệng Tier2', scoreType: 'oral', semester: 1, academicYear: yearId },
    })
    expect(created.status).toBe(201)
    const sessionId = created.data.id

    await jsonReq(examsApp, `/${sessionId}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{ studentId, score: 6, source: 'quick_entry' }] },
    })
    const done = await jsonReq(examsApp, `/${sessionId}/complete`, { method: 'POST', token: adminToken })
    expect(done.status).toBe(200)

    const [grade] = await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, studentId)))
    expect(grade.scoreOral).toBe(7)
    expect(grade.scoreOralSource).toBe('daily_avg')
  })

  it('XD-08: manual add/delete after Exam complete atomically projects all attempts; retry and old-client partial averages cannot diverge', async () => {
    const getGrade = async () => (await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, studentId))))[0]
    const id = `DG-${PREFIX}-after-exam`
    const body = { entries: [entry(id, 10)] }
    expect((await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: adminToken, body })).data.saved).toBe(1)
    expect((await getGrade()).scoreOral).toBe(7.8) // manual8 + legacy baseline7 + exam6 + manual10
    const version = (await getGrade()).version
    expect((await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: adminToken, body })).data.duplicates).toBe(1)
    expect((await getGrade()).version).toBe(version)
    await gradeService.upsertGrade({ studentId, academicYear: yearId, semester: 1, scoreOral: 9, scoreOral_source: 'daily_avg', version }, adminId, parishId, '', '')
    expect((await getGrade()).scoreOral).toBe(7.8)
    const undo = await gradeService.undoGradeImport([{ studentId }], 1, yearId, adminId, parishId, '', '')
    expect(undo[0].status).toBe('not-clean')
    expect((await getGrade()).scoreOral).toBe(7.8)
    expect((await jsonReq(dailyEntriesApp, `/${id}`, { method: 'DELETE', token: adminToken })).status).toBe(200)
    expect((await getGrade()).scoreOral).toBe(7)
    // Legacy clients clear their last local attempt. Remaining machine/manual
    // entries still own the derived value, so the clear cannot erase it.
    await gradeService.upsertGrade({ studentId, academicYear: yearId, semester: 1, scoreOral: null, scoreOral_source: null, version: (await getGrade()).version }, adminId, parishId, '', '')
    expect((await getGrade()).scoreOral).toBe(7)
  })

  it('XD-08: Grade projection failure rolls back the ledger insert', async () => {
    const id = `DG-${PREFIX}-projection-failure`
    const projection = vi.spyOn(gradeService, 'upsertGrade').mockRejectedValueOnce(new Error('Synthetic projection failure'))
    try {
      const response = await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: adminToken, body: { entries: [entry(id, 10)] } })
      expect(response.data.errorCount).toBe(1)
      expect(await db.select().from(assessmentEntries).where(and(eq(assessmentEntries.parishId, parishId), eq(assessmentEntries.id, id)))).toHaveLength(0)
    } finally { projection.mockRestore() }
  })

  it('XD-08: deleting an attempt rolls back on projection failure; deleting the last attempt clears its projection', async () => {
    const id = `DG-${PREFIX}-last`
    const input = { ...entry(id, 9), scoreType: '15m' }
    expect((await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: adminToken, body: { entries: [input] } })).data.saved).toBe(1)
    const projection = vi.spyOn(gradeService, 'upsertGrade').mockRejectedValueOnce(new Error('Synthetic delete projection failure'))
    try {
      const failed = await jsonReq(dailyEntriesApp, `/${id}`, { method: 'DELETE', token: adminToken })
      expect(failed.status).toBe(500)
      expect(await db.select().from(assessmentEntries).where(and(eq(assessmentEntries.parishId, parishId), eq(assessmentEntries.id, id)))).toHaveLength(1)
    } finally { projection.mockRestore() }
    expect((await jsonReq(dailyEntriesApp, `/${id}`, { method: 'DELETE', token: adminToken })).status).toBe(200)
    const [grade] = await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, studentId)))
    expect(grade.score15m).toBeNull()
  })

  it('XD-08: manual override remains protected when the underlying ledger changes', async () => {
    const [before] = await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, studentId)))
    await gradeService.upsertGrade({ studentId, academicYear: yearId, semester: 1, scoreOral: 9, scoreOral_source: 'manual', version: before.version }, adminId, parishId, '', '')
    expect((await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: adminToken, body: { entries: [entry(`DG-${PREFIX}-under-override`, 2)] } })).data.saved).toBe(1)
    const [after] = await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, studentId)))
    expect(after.scoreOral).toBe(9)
    expect(after.scoreOralSource).toBe('manual')
  })

  describe('relative daily score bonus', () => {
    beforeEach(async () => {
      await db.delete(assessmentEntries).where(and(eq(assessmentEntries.parishId, parishId), eq(assessmentEntries.studentId, bonusStudentId)))
      const previous = await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, bonusStudentId)))
      for (const grade of previous) await db.delete(gradeOverrides).where(and(eq(gradeOverrides.parishId, parishId), eq(gradeOverrides.gradeId, grade.id)))
      await db.delete(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, bonusStudentId)))
    })

    async function seedAttempt(id: string, score: number, createdAt: string, extra: Partial<typeof assessmentEntries.$inferInsert> = {}) {
      await db.insert(assessmentEntries).values({ id, parishId, studentId: bonusStudentId, academicYear: yearId, semester: 1, scoreType: 'oral', rawScore: score, score, maxScore: 10, source: 'manual_entry', entryDate: '2026-01-15', createdAt, createdBy: cnId, ...extra })
    }
    const sendBonus = (id: string, value = 1, extra = {}, token = cnToken) => jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token, body: { entries: [entry(id, value, { studentId: bonusStudentId, operation: 'bonus', ...extra })] } })
    const ledger = () => db.select().from(assessmentEntries).where(and(eq(assessmentEntries.parishId, parishId), eq(assessmentEntries.studentId, bonusStudentId)))
    const getGrade = async () => (await db.select().from(grades).where(and(eq(grades.parishId, parishId), eq(grades.studentId, bonusStudentId), eq(grades.semester, 1))))[0]

    it('skips newer 10s and machine attempts, modifies one existing attempt, and projects the average', async () => {
      const old = `DG-${PREFIX}-bonus-old`
      await seedAttempt(old, 8, '2026-01-01T10:00:00Z')
      await seedAttempt(`DG-${PREFIX}-bonus-full`, 10, '2026-01-02T10:00:00Z')
      await seedAttempt(`ASM-${PREFIX}-bonus-machine`, 6, '2026-01-03T10:00:00Z', { source: 'exam_finalization' })
      const id = `DB-${PREFIX}-skip`
      const result = await sendBonus(id)
      expect(result.data.items[0]).toMatchObject({ status: 'created', operation: 'bonus', targetEntryId: old, beforeScore: 8, serverScore: 9 })
      expect((await ledger()).map(row => row.score).sort()).toEqual([10, 6, 9])
      expect((await getGrade()).scoreOral).toBe(8.3)
      const [receipt] = await db.select().from(auditLogs).where(eq(auditLogs.id, `daily-bonus:${id}`))
      expect(JSON.parse(receipt.oldValue!)).toEqual({ score: 8 })
      expect(JSON.parse(receipt.newValue!).ack.targetEntryId).toBe(old)
      const version = (await getGrade()).version
      expect((await sendBonus(id)).data.items[0].status).toBe('duplicate')
      expect((await getGrade()).version).toBe(version)
      expect((await sendBonus(id, 2)).data.items[0].reason).toMatch(/IDEMPOTENCY_CONFLICT/)
      // A lost original CREATE response may be retried after a bonus. It must
      // acknowledge the original intent without reverting or duplicating it.
      const replay = await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: cnToken, body: { entries: [entry(old, 8, { studentId: bonusStudentId })] } })
      expect(replay.data.items[0]).toMatchObject({ status: 'duplicate', serverScore: 9 })
      expect(await ledger()).toHaveLength(3)
    })

    it('caps at 10 then falls back again, without increasing the attempt count or crossing year/type/semester', async () => {
      const oldest = `DG-${PREFIX}-fall-older`
      const latest = `DG-${PREFIX}-fall-newer`
      await seedAttempt(oldest, 7, '2026-01-01T10:00:00Z')
      await seedAttempt(latest, 9.5, '2026-01-02T10:00:00Z')
      await seedAttempt(`DG-${PREFIX}-other-type`, 2, '2026-01-03T10:00:00Z', { scoreType: '15m' })
      await seedAttempt(`DG-${PREFIX}-other-sem`, 3, '2026-01-04T10:00:00Z', { semester: 2 })
      await seedAttempt(`DG-${PREFIX}-other-year`, 4, '2026-01-05T10:00:00Z', { academicYear: '2024-2025' })
      expect((await sendBonus(`DB-${PREFIX}-cap`, 2)).data.items[0]).toMatchObject({ targetEntryId: latest, serverScore: 10 })
      expect((await sendBonus(`DB-${PREFIX}-fall`)).data.items[0]).toMatchObject({ targetEntryId: oldest, serverScore: 8 })
      expect((await ledger()).map(row => row.score).sort()).toEqual([10, 2, 3, 4, 8])
      expect((await getGrade()).scoreOral).toBe(9)
    })

    it('fails without a receipt when no manual score is eligible, and rejects invalid amounts', async () => {
      const id = `DB-${PREFIX}-no-target`
      expect((await sendBonus(id)).data.items[0].reason).toMatch(/Chưa có lần nhập tay/)
      await seedAttempt(`DG-${PREFIX}-all-full`, 10, '2026-01-01T10:00:00Z')
      await seedAttempt(`ASM-${PREFIX}-not-eligible`, 5, '2026-01-02T10:00:00Z', { source: 'legacy_baseline' })
      expect((await sendBonus(id)).data.errorCount).toBe(1)
      expect(await db.select().from(auditLogs).where(eq(auditLogs.id, `daily-bonus:${id}`))).toHaveLength(0)
      for (const value of [0, -1, 3]) expect((await sendBonus(`DB-${PREFIX}-invalid-${value}`, value)).status).toBe(400)
      expect((await sendBonus(`DB-${PREFIX}-conduct`, 1, { scoreType: 'conduct', reason: 'Test' })).status).toBe(400)
    })

    it('denies valid bonus payloads for wrong-class, cross-parish and locked-semester actors', async () => {
      const id = `DB-${PREFIX}-access`
      await seedAttempt(`DG-${PREFIX}-protected-bonus`, 8, '2026-01-01T10:00:00Z')
      const crossParish = generateTokens({ userId: 'USR-001', username: 'bill', role: 'admin', parishId: 'gia-ton' }).accessToken
      for (const token of [phutaOtherToken, crossParish]) expect((await sendBonus(id, 1, {}, token)).data.errorCount).toBe(1)
      const lock = `bonus-lock-${PREFIX}`
      await db.insert(semesterLocks).values({ id: lock, parishId, academicYear: yearId, semester: 1, isLocked: 1 })
      try { expect((await sendBonus(id)).data.items[0].reason).toMatch(/khóa sổ/) }
      finally { await db.delete(semesterLocks).where(eq(semesterLocks.id, lock)) }
      expect((await ledger())[0].score).toBe(8)
      expect(await db.select().from(auditLogs).where(eq(auditLogs.id, `daily-bonus:${id}`))).toHaveLength(0)
    })

    it('rolls back the attempt and receipt when average projection fails', async () => {
      const id = `DB-${PREFIX}-rollback`
      await seedAttempt(`DG-${PREFIX}-rollback-target`, 8, '2026-01-01T10:00:00Z')
      const projection = vi.spyOn(gradeService, 'upsertGrade').mockRejectedValueOnce(new Error('Synthetic bonus projection failure'))
      try { expect((await sendBonus(id)).data.errorCount).toBe(1) }
      finally { projection.mockRestore() }
      expect((await ledger())[0].score).toBe(8)
      expect(await db.select().from(auditLogs).where(eq(auditLogs.id, `daily-bonus:${id}`))).toHaveLength(0)
    })

    it('averages prayer attempts, applies +1 to the previous eligible prayer, and keeps oral scores separate', async () => {
      const old = `DG-${PREFIX}-prayer-old`
      const latest = `DG-${PREFIX}-prayer-latest`
      const inputs = [entry(old, 6, { studentId: bonusStudentId, scoreType: 'prayer' }), entry(latest, 10, { studentId: bonusStudentId, scoreType: 'prayer' }), entry(`DG-${PREFIX}-prayer-oral`, 2, { studentId: bonusStudentId })]
      const result = await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', token: cnToken, body: { entries: inputs } })
      expect(result.data.saved).toBe(3)
      expect(await getGrade()).toMatchObject({ scorePrayer: 8, scorePrayerSource: 'daily_avg', scoreOral: 2 })
      expect((await sendBonus(`DB-${PREFIX}-prayer`, 1, { scoreType: 'prayer' })).data.items[0]).toMatchObject({ targetEntryId: old, serverScore: 7 })
      expect(await getGrade()).toMatchObject({ scorePrayer: 8.5, scoreOral: 2 })
      const projection = vi.spyOn(gradeService, 'upsertGrade').mockRejectedValueOnce(new Error('Prayer projection failure'))
      try { expect((await sendBonus(`DB-${PREFIX}-prayer-rollback`, 1, { scoreType: 'prayer' })).data.errorCount).toBe(1) }
      finally { projection.mockRestore() }
      expect((await ledger()).find(row => row.id === old)?.score).toBe(7)
      for (const token of [phutaOtherToken, generateTokens({ userId: 'USR-001', username: 'bill', role: 'admin', parishId: 'gia-ton' }).accessToken]) {
        expect((await sendBonus(`DB-${PREFIX}-prayer-denied`, 1, { scoreType: 'prayer' }, token)).data.errorCount).toBe(1)
      }
      const lock = `prayer-lock-${PREFIX}`
      await db.insert(semesterLocks).values({ id: lock, parishId, academicYear: yearId, semester: 1, isLocked: 1 })
      try { expect((await sendBonus(`DB-${PREFIX}-prayer-locked`, 1, { scoreType: 'prayer' })).data.items[0].reason).toMatch(/khóa sổ/) }
      finally { await db.delete(semesterLocks).where(eq(semesterLocks.id, lock)) }
      expect((await jsonReq(dailyEntriesApp, `/${latest}`, { method: 'DELETE', token: cnToken })).status).toBe(200)
      expect(await getGrade()).toMatchObject({ scorePrayer: 7, scoreOral: 2 })
      await gradeService.upsertGrade({ studentId: bonusStudentId, academicYear: yearId, semester: 1, version: (await getGrade()).version, scorePrayer: 4, scorePrayer_source: 'manual' }, adminId, parishId, '', '')
      expect((await sendBonus(`DB-${PREFIX}-prayer-under-override`, 1, { scoreType: 'prayer' })).data.saved).toBe(1)
      expect(await getGrade()).toMatchObject({ scorePrayer: 4, scorePrayerSource: 'manual', scoreOral: 2 })
    })

    it('preserves explicit manual overrides when an underlying attempt receives a bonus', async () => {
      await seedAttempt(`DG-${PREFIX}-override-target`, 8, '2026-01-01T10:00:00Z')
      await gradeService.upsertGrade({ studentId: bonusStudentId, academicYear: yearId, semester: 1, scoreOral: 6, scoreOral_source: 'manual' }, adminId, parishId, '', '')
      expect((await sendBonus(`DB-${PREFIX}-under-override`)).data.saved).toBe(1)
      expect((await ledger())[0].score).toBe(9)
      expect(await getGrade()).toMatchObject({ scoreOral: 6, scoreOralSource: 'manual' })
    })
  })
})
