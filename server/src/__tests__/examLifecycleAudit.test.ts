import { describe, it, expect, beforeAll } from 'vitest'
import { generateTokens } from '../middleware/auth.js'
import examsApp from '../routes/exams.js'
import { db } from '../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, examSessions, examResults, examFinalizations, examFinalizationItems, assessmentEntries, grades, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import {
  listExamSessions,
  createExamSession,
  updateAnswerKeyAndRescore,
  ExamStateError,
} from '../services/examService.js'
import { getActiveAcademicYearId } from '../services/academicYearService.js'

const parishId = 'parish-exam-audit'
const adminToken = generateTokens({ userId: 'usr-aud-admin', username: 'aud_admin', role: 'admin', parishId }).accessToken
const cnAssignedToken = generateTokens({ userId: 'usr-aud-cn', username: 'aud_cn', role: 'chunhiem', parishId }).accessToken
const cnUnassignedToken = generateTokens({ userId: 'usr-aud-cn-free', username: 'aud_cn_free', role: 'chunhiem', parishId }).accessToken
const parentToken = generateTokens({ userId: 'usr-aud-parent', username: 'aud_parent', role: 'phuhuynh', parishId }).accessToken

async function jsonReq(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`
  const res = await examsApp.request(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  let body: any = null
  try { body = (await res.json()) as any } catch {}
  return { status: res.status, body, data: body?.data }
}

async function cleanupParish(): Promise<void> {
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(examFinalizationItems).where(eq(examFinalizationItems.parishId, parishId))
  await db.delete(examFinalizations).where(eq(examFinalizations.parishId, parishId))
  await db.delete(assessmentEntries).where(eq(assessmentEntries.parishId, parishId))
  await db.delete(grades).where(eq(grades.parishId, parishId))
  await db.delete(examResults).where(eq(examResults.parishId, parishId))
  await db.delete(examSessions).where(eq(examSessions.parishId, parishId))
  await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
}

describe('EXAM-AUDIT F1–F6 (2026-08-21) — Exam Lifecycle hardening', () => {
  beforeAll(async () => {
    await cleanupParish()
    await db.insert(branches).values({ id: 'br-aud', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId }).onConflictDoNothing()
    await db.insert(academicYears).values([
      { id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', parishId },
      { id: '2026-2027', startDate: '2026-08-01', endDate: '2027-07-31', parishId },
    ])
    await db.insert(classes).values([
      { id: 'cl-aud-a', code: 'AUD-A', name: 'Lớp A', branchId: 'br-aud', academicYearId: '2025-2026', parishId },
      { id: 'cl-aud-b', code: 'AUD-B', name: 'Lớp B', branchId: 'br-aud', academicYearId: '2025-2026', parishId },
    ])
    await db.insert(users).values([
      { id: 'usr-aud-admin', username: 'aud_admin', fullName: 'Admin Aud', passwordHash: 'hash', role: 'admin', parishId },
      { id: 'usr-aud-cn', username: 'aud_cn', fullName: 'CN Assigned', passwordHash: 'hash', role: 'chunhiem', parishId },
      { id: 'usr-aud-cn-free', username: 'aud_cn_free', fullName: 'CN Free', passwordHash: 'hash', role: 'chunhiem', parishId },
      { id: 'usr-aud-parent', username: 'aud_parent', fullName: 'Phu Huynh', passwordHash: 'hash', role: 'phuhuynh', parishId },
    ])
    await db.insert(catechistAssignments).values({
      id: 'asg-aud-cn', userId: 'usr-aud-cn', classId: 'cl-aud-a', roleInClass: 'chunhiem', parishId,
    })
    for (const [id, code, classId] of [
      ['st-aud-1', 'ST-AUD-1', 'cl-aud-a'],
      ['st-aud-2', 'ST-AUD-2', 'cl-aud-a'],
    ] as const) {
      await db.insert(students).values({
        id, code, holyName: 'Anrê', fullName: `Hoc Sinh ${code}`, gender: 'Nam',
        dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X',
        branch: 'AuNhi', classId, parishId,
      })
    }
  })

  it('F1a. service: listExamSessions với classIds=[] trả rỗng, KHÔNG trả toàn bộ giáo xứ', async () => {
    // Tạo 1 phiên lớp A bằng admin để có dữ liệu
    const created = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: { classId: 'cl-aud-a', subject: 'F1', scoreType: '15m', semester: 1, academicYear: '2025-2026' },
    })
    expect(created.status).toBe(201)

    const empty = await listExamSessions(parishId, [])
    expect(empty).toHaveLength(0)

    const assigned = await listExamSessions(parishId, ['cl-aud-a'])
    expect(assigned.length).toBeGreaterThan(0)
  })

  it('F1b. route: GLV chưa phân công thấy []; phuhuynh bị chặn 403; admin thấy tất cả', async () => {
    const unassigned = await jsonReq('/my-classes', { token: cnUnassignedToken })
    expect(unassigned.status).toBe(200)
    expect(unassigned.data).toHaveLength(0)

    const parent = await jsonReq('/my-classes', { token: parentToken })
    expect(parent.status).toBe(403)

    const assigned = await jsonReq('/my-classes', { token: cnAssignedToken })
    expect(assigned.status).toBe(200)
    expect(assigned.data.every((s: any) => s.classId === 'cl-aud-a')).toBe(true)

    const admin = await jsonReq('/my-classes', { token: adminToken })
    expect(admin.status).toBe(200)
    expect(admin.data.length).toBeGreaterThanOrEqual(unassigned.data.length + 1)
  })

  it('F2. reconcile ledger: reopen → xóa kết quả → re-finalize thì entry mồ côi phải biến mất', async () => {
    const created = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: { classId: 'cl-aud-a', subject: 'F2 Oral', scoreType: 'oral', semester: 1, academicYear: '2025-2026' },
    })
    const sessionId = created.data.id

    await jsonReq(`/${sessionId}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [
        { studentId: 'st-aud-1', score: 5, source: 'quick_entry' },
        { studentId: 'st-aud-2', score: 7, source: 'quick_entry' },
      ] },
    })

    const first = await jsonReq(`/${sessionId}/complete`, { method: 'POST', token: adminToken })
    expect(first.status).toBe(200)

    const entriesAfterFirst = await db.select().from(assessmentEntries).where(eq(assessmentEntries.examSessionId, sessionId))
    expect(entriesAfterFirst).toHaveLength(2)

    // Reopen → xóa kết quả st-aud-1 → re-finalize
    await jsonReq(`/${sessionId}/reopen`, { method: 'POST', token: adminToken })
    const del = await jsonReq(`/${sessionId}/results/st-aud-1`, { method: 'DELETE', token: adminToken })
    expect(del.status).toBe(200)
    const second = await jsonReq(`/${sessionId}/complete`, { method: 'POST', token: adminToken })
    expect(second.status).toBe(200)

    const entriesAfterSecond = await db.select().from(assessmentEntries).where(eq(assessmentEntries.examSessionId, sessionId))
    expect(entriesAfterSecond.map((e) => e.studentId)).toEqual(['st-aud-2'])

    // Điểm của HS bị xóa kết quả giữ nguyên giá trị last-finalized (semantics
    // khớp midterm/final — không tự ý đè lên dữ liệu trước kỳ thi)
    const [grade1] = await db.select().from(grades).where(and(eq(grades.studentId, 'st-aud-1'), eq(grades.academicYear, '2025-2026')))
    expect(grade1.scoreOral).toBe(5)
  })

  it('F3. create với academicYear sai định dạng → 400 ngay tại create', async () => {
    const res = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: { classId: 'cl-aud-a', subject: 'F3', scoreType: '15m', semester: 1, academicYear: 'abc' },
    })
    expect(res.status).toBe(400)
    // zValidator trả shape riêng (không qua errorResponse) — kiểm message trong payload thô
    expect(JSON.stringify(res.body)).toMatch(/YYYY-YYYY/)
  })

  it('F4. getActiveAcademicYearId: năm chứa hôm nay > năm mới nhất > quy ước tháng 8', async () => {
    // now nằm trong 2026-2027
    const inY2 = await getActiveAcademicYearId(parishId, new Date('2026-09-15T10:00:00Z'))
    expect(inY2).toBe('2026-2027')
    // now nằm trong 2025-2026
    const inY1 = await getActiveAcademicYearId(parishId, new Date('2026-02-01T10:00:00Z'))
    expect(inY1).toBe('2025-2026')
    // now ngoài mọi range → năm mới nhất theo start_date
    const outside = await getActiveAcademicYearId(parishId, new Date('2030-01-01T10:00:00Z'))
    expect(outside).toBe('2026-2027')
    // giáo xứ chưa có năm học → quy ước tháng 8
    const fallback = await getActiveAcademicYearId('parish-khong-ton-tai', new Date('2026-09-15T10:00:00Z'))
    expect(fallback).toBe('2026-2027')
  })

  it('F5. answer-key rescore chặn phiên completed ở TẦNG SERVICE (không chỉ route)', async () => {
    const created = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: {
        classId: 'cl-aud-a', subject: 'F5 MC', scoreType: '15m', semester: 1, academicYear: '2025-2026',
        examType: 'multiple_choice', questionCount: 2, answerKey: '{"1":"A","2":"B"}',
      },
    })
    const sessionId = created.data.id
    await jsonReq(`/${sessionId}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{ studentId: 'st-aud-1', score: 10, source: 'omr', answers: '{"1":"A","2":"B"}' }] },
    })
    await jsonReq(`/${sessionId}/complete`, { method: 'POST', token: adminToken })

    // Route guard
    const viaRoute = await jsonReq(`/${sessionId}/answer-key`, {
      method: 'PATCH', token: adminToken,
      body: { answerKey: '{"1":"B","2":"B"}', questionCount: 2 },
    })
    expect(viaRoute.status).toBe(409)

    // Service guard (đóng TOCTOU route-check vs complete)
    await expect(
      updateAnswerKeyAndRescore(sessionId, parishId, '{"1":"C","2":"C"}', 2, 'usr-aud-admin', '127.0.0.1', 'Vitest')
    ).rejects.toThrow(ExamStateError)
  })

  it('F6. 2 request ĐỒNG THỜI cùng idempotencyKey → đúng 1 phiên, không 500', async () => {
    const body = {
      classId: 'cl-aud-a', subject: 'F6 Race', scoreType: '15m' as const, semester: 1 as const,
      academicYear: '2025-2026', idempotencyKey: 'EXS-AUD-RACE-001',
    }
    const [a, b] = await Promise.all([
      createExamSession(body, 'usr-aud-admin', parishId, '127.0.0.1', 'Vitest'),
      createExamSession(body, 'usr-aud-admin', parishId, '127.0.0.1', 'Vitest'),
    ])
    expect(a.id).toBe(b.id)
    const rows = await db.select().from(examSessions).where(and(eq(examSessions.parishId, parishId), eq(examSessions.subject, 'F6 Race')))
    expect(rows).toHaveLength(1)
  })

  it('F4-integration. create KHÔNG gửi academicYear → rơi vào năm hoạt động của giáo xứ', async () => {
    const created = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: { classId: 'cl-aud-a', subject: 'F4 Default Year', scoreType: '15m', semester: 1 },
    })
    expect(created.status).toBe(201)
    // "Hôm nay" của môi trường test nằm trong 2025-2026 hoặc 2026-2027 tùy ngày chạy;
    // chấp nhận cả hai nhưng PHẢI là một năm học có thật của giáo xứ.
    expect(['2025-2026', '2026-2027']).toContain(created.data.academicYear)
  })

  it('QB-F2. questions JSON rác (không phải mảng / correctOption sai) → 400 ngay tại create', async () => {
    const notArray = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: { classId: 'cl-aud-a', subject: 'QB-F2a', scoreType: '15m', semester: 1, academicYear: '2025-2026', questions: '{"index":1}' },
    })
    expect(notArray.status).toBe(400)
    expect(JSON.stringify(notArray.body)).toMatch(/mảng/)

    const badOption = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: {
        classId: 'cl-aud-a', subject: 'QB-F2b', scoreType: '15m', semester: 1, academicYear: '2025-2026',
        questions: JSON.stringify([{ index: 1, question: 'Câu 1?', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctOption: 'E' }]),
      },
    })
    expect(badOption.status).toBe(400)
    expect(JSON.stringify(badOption.body)).toMatch(/correctOption/)

    const valid = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: {
        classId: 'cl-aud-a', subject: 'QB-F2c', scoreType: '15m', semester: 1, academicYear: '2025-2026',
        questions: JSON.stringify([{ index: 1, question: 'Câu 1?', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctOption: 'B' }]),
        answerKey: '{"1":"B"}',
      },
    })
    expect(valid.status).toBe(201)
  })

  it('QB-F3. PATCH answer-key → questions[].correctOption được sync theo key mã A mới', async () => {
    const questions = [
      { index: 1, question: 'Câu 1?', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctOption: 'A' },
      { index: 2, question: 'Câu 2?', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctOption: 'A' },
    ]
    const created = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: {
        classId: 'cl-aud-a', subject: 'QB-F3 Sync', scoreType: '15m', semester: 1, academicYear: '2025-2026',
        examType: 'multiple_choice', questionCount: 2,
        questions: JSON.stringify(questions),
        answerKey: '{"1":"A","2":"A"}',
      },
    })
    expect(created.status).toBe(201)
    const sessionId = created.data.id

    const patched = await jsonReq(`/${sessionId}/answer-key`, {
      method: 'PATCH', token: adminToken,
      body: { answerKey: '{"1":"C","2":"D"}', questionCount: 2 },
    })
    expect(patched.status).toBe(200)

    const detail = await jsonReq(`/${sessionId}`, { token: adminToken })
    expect(detail.status).toBe(200)
    const syncedQuestions = JSON.parse(detail.data.questions)
    expect(syncedQuestions[0].correctOption).toBe('C')
    expect(syncedQuestions[1].correctOption).toBe('D')
  })
})
