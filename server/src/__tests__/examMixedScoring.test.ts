import { describe, it, expect, beforeAll } from 'vitest'
import { generateTokens } from '../middleware/auth.js'
import examsApp from '../routes/exams.js'
import { db } from '../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, examSessions } from '../db/schema.js'

// EXAM-MIXED (2026-08-24): đề kết hợp trắc nghiệm + tự luận.
// Hợp đồng điểm: score = điểm TN tự chấm theo trọng số câu + essay_score nhập tay;
// merge 2 pha (quét OMR trước / nhập TL sau) KHÔNG được mất thành phần đã lưu.

const parishId = 'parish-exam-mixed'
const adminToken = generateTokens({ userId: 'usr-mixed-admin', username: 'mixed_admin', role: 'admin', parishId }).accessToken

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

const MIXED_QUESTIONS = [
  {
    index: 1,
    type: 'multiple_choice',
    question: 'Chúa Giêsu lập bí tích Thánh Thể trong dịp nào?',
    options: { A: 'Tiệc cưới Cana', B: 'Bữa Tiệc Ly', C: 'Sau khi sống lại', D: 'Trên núi' },
    correctOption: 'B',
    points: 1,
  },
  {
    index: 2,
    type: 'multiple_choice',
    question: 'Ai có quyền truyền chức linh mục?',
    options: { A: 'Cha quản xứ', B: 'Đức Giám Mục', C: 'Cha tuyên úy', D: 'Bề trên dòng' },
    correctOption: 'A',
    points: 1,
  },
  {
    index: 3,
    type: 'essay',
    question: 'Trình bày ý nghĩa của Bí tích Thánh Thể.',
    points: 2,
  },
  {
    index: 4,
    type: 'essay',
    question: 'Nêu 4 khẩu hiệu của Phong trào TNTT.',
    points: 6,
  },
]

let sessionId = ''

describe('EXAM-MIXED — đề trắc nghiệm + tự luận', () => {
  beforeAll(async () => {
    await db.insert(branches).values({ id: 'br-mixed-01', name: 'Nghị Sự', scarfColor: 'Vàng', ageMin: 10, ageMax: 11, parishId }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-09-01', endDate: '2026-05-31', parishId }).onConflictDoNothing()
    await db.insert(classes).values({ id: 'cl-mixed-01', code: 'CL-MIXED', name: 'Lớp Mixed', branchId: 'br-mixed-01', academicYearId: '2025-2026', parishId }).onConflictDoNothing()
    await db.insert(users).values([
      { id: 'usr-mixed-admin', username: 'mixed_admin', fullName: 'Admin Mixed', passwordHash: 'hash', role: 'admin', parishId },
    ]).onConflictDoNothing()
    await db.insert(catechistAssignments).values({
      id: 'asg-mixed-admin', userId: 'usr-mixed-admin', classId: 'cl-mixed-01', roleInClass: 'chunhiem', parishId,
    }).onConflictDoNothing()
    await db.insert(students).values({ id: 'st-mixed-01', code: 'ST-MIXED-1', holyName: 'Giu-se', fullName: 'Tran Van C', gender: 'Nam', dateOfBirth: '2014-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'ThieuNhi', classId: 'cl-mixed-01', parishId }).onConflictDoNothing()
    await db.insert(students).values({ id: 'st-mixed-02', code: 'ST-MIXED-2', holyName: 'Maria', fullName: 'Le Thi D', gender: 'Nữ', dateOfBirth: '2014-01-02', parentName: 'P', parentPhone: '000', address: 'X', branch: 'ThieuNhi', classId: 'cl-mixed-01', parishId }).onConflictDoNothing()
  })

  it('tạo phiên mixed đầy đủ hợp lệ → 201 với exam_type=mixed', async () => {
    const res = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: {
        classId: 'cl-mixed-01',
        subject: 'Giáo Lý Mixed',
        scoreType: '15m',
        semester: 1,
        academicYear: '2025-2026',
        examType: 'mixed',
        questionCount: 2,
        answerKey: JSON.stringify({ 1: 'B', 2: 'A' }),
        questions: JSON.stringify(MIXED_QUESTIONS),
      },
    })
    expect(res.status).toBe(201)
    expect(res.data.examType).toBe('mixed')
    expect(res.data.questionCount).toBe(2)
    sessionId = res.data.id
  })

  it('từ chối mixed thiếu questions / thiếu answerKey / câu TL mang options / câu TN xen kẽ', async () => {
    const base = { classId: 'cl-mixed-01', subject: 'X', scoreType: '15m', semester: 1, academicYear: '2025-2026', examType: 'mixed' }

    const noQuestions = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: { ...base, questionCount: 2, answerKey: JSON.stringify({ 1: 'A', 2: 'A' }) },
    })
    expect(noQuestions.status).toBe(400)

    const noKey = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: { ...base, questionCount: 2, questions: JSON.stringify(MIXED_QUESTIONS) },
    })
    expect(noKey.status).toBe(400)

    // Câu tự luận không được có options/correctOption
    const badEssay = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: {
        ...base, questionCount: 1,
        answerKey: JSON.stringify({ 1: 'A' }),
        questions: JSON.stringify([
          { index: 1, type: 'multiple_choice', question: 'Q?', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctOption: 'A' },
          { index: 2, type: 'essay', question: 'TL', options: { A: 'x', B: '', C: '', D: '' }, correctOption: 'A' },
        ]),
      },
    })
    expect(badEssay.status).toBe(400)

    // Câu TN phải liên tục từ đầu đề (phiếu OMR đánh bubble 1..N)
    const interleaved = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: {
        ...base, questionCount: 1,
        answerKey: JSON.stringify({ 1: 'A' }),
        questions: JSON.stringify([
          { index: 1, type: 'essay', question: 'TL trước' },
          { index: 2, type: 'multiple_choice', question: 'Q sau', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctOption: 'A' },
        ]),
      },
    })
    expect(interleaved.status).toBe(400)
  })

  it('quét OMR trước: score = tổng trọng số câu TN đúng (không nhân thang)', async () => {
    const res = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: {
        results: [{
          studentId: 'st-mixed-01',
          // Client gửi ước lượng tỉ lệ thang — server phải điều chỉnh về 2đ
          score: 10,
          source: 'omr',
          answers: JSON.stringify({ 1: 'B', 2: 'A' }),
          scanMetadata: JSON.stringify({ detectionStatus: 'accepted', engineVersion: 'test', examVersion: 'A', questionCount: 2 }),
        }],
      },
    })
    expect(res.status).toBe(200)
    expect(res.data.adjustments?.length).toBeGreaterThan(0)

    const list = await jsonReq(`/${sessionId}/results`, { token: adminToken })
    const row = list.data.results.find((r: any) => r.studentId === 'st-mixed-01')
    expect(row.score).toBe(2) // 1đ câu 1 + 1đ câu 2
    expect(row.essayScore ?? null).toBeNull()
  })

  it('nhập điểm TL sau khi quét: cộng vào phần TN, GIỮ NGUYÊN answers đã quét', async () => {
    const res = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: {
        results: [{ studentId: 'st-mixed-01', score: 7, essayScore: 7, source: 'quick_entry', expectedResultVersion: 1 }],
      },
    })
    expect(res.status).toBe(200)

    const list = await jsonReq(`/${sessionId}/results`, { token: adminToken })
    const row = list.data.results.find((r: any) => r.studentId === 'st-mixed-01')
    expect(row.score).toBe(9) // 2đ TN + 7đ TL
    expect(row.essayScore).toBe(7)
    const answers = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers
    expect(answers['1']).toBe('B') // không bị xóa khi chỉ gửi essayScore
    expect(answers['2']).toBe('A')
  })

  it('nhập TL TRƯỚC rồi quét sau: essay_score được giữ lại và cộng thêm phần TN', async () => {
    const essayFirst = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{ studentId: 'st-mixed-02', score: 5, essayScore: 5, source: 'quick_entry' }] },
    })
    expect(essayFirst.status).toBe(200)
    let row = (await jsonReq(`/${sessionId}/results`, { token: adminToken })).data.results.find((r: any) => r.studentId === 'st-mixed-02')
    expect(row.score).toBe(5)

    const scanAfter = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: {
        results: [{
          studentId: 'st-mixed-02',
          score: 1,
          source: 'omr',
          answers: JSON.stringify({ 1: 'B', 2: null }),
          scanMetadata: JSON.stringify({ detectionStatus: 'accepted', engineVersion: 'test', examVersion: 'A', questionCount: 2 }),
          expectedResultVersion: 1,
        }],
      },
    })
    expect(scanAfter.status).toBe(200)
    row = (await jsonReq(`/${sessionId}/results`, { token: adminToken })).data.results.find((r: any) => r.studentId === 'st-mixed-02')
    expect(row.score).toBe(6) // 1đ TN (câu 2 sai) + 5đ TL giữ lại
    expect(row.essayScore).toBe(5)
  })

  it('giữ mã đề B và provenance OMR khi nhập tự luận ở pha sau', async () => {
    const created = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: {
        classId: 'cl-mixed-01', subject: 'Mixed mã B', scoreType: '15m', semester: 1,
        academicYear: '2025-2026', examType: 'mixed', questionCount: 2,
        answerVariants: JSON.stringify({ A: { 1: 'A', 2: 'A' }, B: { 1: 'B', 2: 'B' } }),
        questions: JSON.stringify(MIXED_QUESTIONS),
      },
    })
    expect(created.status).toBe(201)
    const versionedSessionId = created.data.id
    const metadata = JSON.stringify({
      detectionStatus: 'accepted', engineVersion: 'test-b', examVersion: 'B', questionCount: 2,
      detectedAnswers: { 1: 'B', 2: 'B' }, finalAnswers: { 1: 'B', 2: 'B' }, corrections: [],
    })
    const scan = await jsonReq(`/${versionedSessionId}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{
        studentId: 'st-mixed-01', score: 2, source: 'omr', examVersion: 'B',
        answers: JSON.stringify({ 1: 'B', 2: 'B' }), scanMetadata: metadata,
        attemptFingerprint: 'attempt-mixed-b-01', capturedAt: '2026-09-06T00:00:00.000Z',
      }] },
    })
    expect(scan.status).toBe(200)

    const essay = await jsonReq(`/${versionedSessionId}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{
        studentId: 'st-mixed-01', score: 5, essayScore: 5, source: 'quick_entry', expectedResultVersion: 1,
      }] },
    })
    expect(essay.status).toBe(200)
    const row = (await jsonReq(`/${versionedSessionId}/results`, { token: adminToken })).data.results[0]
    expect(row).toMatchObject({
      score: 7,
      essayScore: 5,
      examVersion: 'B',
      source: 'omr',
      scanMetadata: metadata,
      attemptFingerprint: 'attempt-mixed-b-01',
      capturedAt: '2026-09-06T00:00:00.000Z',
      savedBy: 'usr-mixed-admin',
      resultVersion: 2,
    })
  })

  it('điểm TL vượt trần phần tự luận (8đ) → 400', async () => {
    const res = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{ studentId: 'st-mixed-01', score: 9, essayScore: 8.5, source: 'quick_entry', expectedResultVersion: 2 }] },
    })
    expect(res.status).toBe(400)
  })

  it('PATCH answer-key rescore phiên mixed: chấm lại phần TN theo key mới, GIỮ essay_score', async () => {
    const patch = await jsonReq(`/${sessionId}/answer-key`, {
      method: 'PATCH',
      token: adminToken,
      body: { answerKey: JSON.stringify({ 1: 'A', 2: 'B' }), questionCount: 2 },
    })
    expect(patch.status).toBe(200)
    expect(patch.data.session.examType).toBe('mixed')

    const list = await jsonReq(`/${sessionId}/results`, { token: adminToken })
    const a = list.data.results.find((r: any) => r.studentId === 'st-mixed-01')
    // Key mới: câu 1=A (sv trả B → sai), câu 2=B (sv trả A → sai) → TN = 0; TL 7đ giữ nguyên
    expect(a.score).toBe(7)
    expect(a.essayScore).toBe(7)
    const b = list.data.results.find((r: any) => r.studentId === 'st-mixed-02')
    // Sv B trả câu 1=B (sai), câu 2=null → TN = 0; TL 5đ giữ nguyên
    expect(b.score).toBe(5)
    expect(b.essayScore).toBe(5)
  })

  it('phiên written/mc gửi essayScore → 400 (dữ liệu mâu thuẫn)', async () => {
    const created = await db.select().from(examSessions)
    const pureMc = created.find(s => s.parishId === parishId && s.examType !== 'mixed')
      ?? (await jsonReq('/', {
        method: 'POST', token: adminToken,
        body: { classId: 'cl-mixed-01', subject: 'MC thuần', scoreType: '15m', semester: 1, academicYear: '2025-2026', examType: 'multiple_choice', questionCount: 1, answerKey: JSON.stringify({ 1: 'A' }) },
      })).data.id

    const res = await jsonReq(`/${pureMc.id ?? pureMc}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{ studentId: 'st-mixed-01', score: 5, source: 'quick_entry', essayScore: 5 }] },
    })
    expect(res.status).toBe(400)
  })
})
