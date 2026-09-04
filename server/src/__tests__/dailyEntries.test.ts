import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { generateTokens } from '../middleware/auth.js'
import dailyEntriesApp from '../routes/dailyEntries.js'
import examsApp from '../routes/exams.js'
import { db } from '../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, semesterLocks, assessmentEntries, grades, examSessions, examResults, examFinalizations, examFinalizationItems } from '../db/schema.js'
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
    ]).onConflictDoNothing()
  })

  afterAll(async () => {
    // FK order: exam items → finalizations → results → sessions → ledger → grades → roster.
    await db.delete(examFinalizationItems).where(eq(examFinalizationItems.parishId, parishId))
    await db.delete(examFinalizations).where(eq(examFinalizations.parishId, parishId))
    await db.delete(examResults).where(eq(examResults.parishId, parishId))
    await db.delete(examSessions).where(eq(examSessions.parishId, parishId))
    await db.delete(assessmentEntries).where(eq(assessmentEntries.parishId, parishId))
    await db.delete(grades).where(eq(grades.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
    await db.delete(classes).where(eq(classes.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
  })

  it('401 khi thiếu token', async () => {
    expect((await jsonReq(dailyEntriesApp, '/batch', { method: 'POST', body: { entries: [] } })).status).toBe(401)
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
})
