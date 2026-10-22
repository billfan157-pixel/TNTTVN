import { beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import bank from '../routes/questionBank.js'
import exams from '../routes/exams.js'
import { client, db } from '../db/index.js'
import { academicYears, auditLogs, branches, classes, examQuestionSnapshots, examSessions, questionBankVersions, students, users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'

const parishId = 'structured-exam-parish'
const adminId = 'structured-exam-admin'
const teacherId = 'structured-exam-unassigned'
const token = (userId: string, role: 'admin' | 'chunhiem', parish = parishId) => generateTokens({ userId, username: userId, role, parishId: parish }).accessToken
const auth = token(adminId, 'admin')
async function request(app: typeof bank | typeof exams, path: string, method = 'GET', body?: unknown, bearer = auth) {
  const response = await app.request(path, { method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, ...await response.json() as { data: any; error: any } }
}
const blank = { index: 2, type: 'essay', responseFormat: 'fill_blank', question: 'Điền từ: Em biết {{1}}.', points: 3, answerData: { blanks: [{ id: '1', acceptedAnswers: ['chia sẻ', 'san sẻ'] }] } }
const matching = { index: 3, type: 'essay', responseFormat: 'matching', question: 'Ghép hai cột.', points: 3, answerData: { left: [{ id: '1', text: 'Một' }, { id: '2', text: 'Hai' }], right: [{ id: 'A', text: 'Second' }, { id: 'B', text: 'First' }], pairs: [{ leftId: '1', rightId: 'B' }, { leftId: '2', rightId: 'A' }] } }
const essay = { index: 4, type: 'essay', question: 'Trình bày:\na) Nêu ý nghĩa.\nb) Liên hệ.', points: 2, answerLineCount: 12, answerData: { subparts: [{ label: 'a)', text: 'Nêu ý nghĩa.', points: 1 }, { label: 'b)', text: 'Liên hệ.', points: 1 }] } }
const mc = { index: 1, type: 'multiple_choice', question: 'Chọn số hai.', points: 2, options: { A: 'Một', B: 'Hai', C: 'Ba', D: 'Bốn' }, correctOption: 'B' }
const sessionInput = { classId: 'structured-class', subject: 'Đề cấu trúc', scoreType: '15m', semester: 1, academicYear: '2026-2027', maxScore: 10, examType: 'mixed', questionCount: 1, answerKey: JSON.stringify({ 1: 'B' }), questions: JSON.stringify([mc, blank, matching, essay]) }

describe('structured questions through authoritative exam and bank routes', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: adminId, username: adminId, passwordHash: 'hash', fullName: 'Structured Admin', role: 'admin', parishId },
      { id: teacherId, username: teacherId, passwordHash: 'hash', fullName: 'Unassigned Teacher', role: 'chunhiem', parishId },
      { id: 'structured-other-admin', username: 'structured-other-admin', passwordHash: 'hash', fullName: 'Other', role: 'admin', parishId: 'structured-other' },
    ])
    await db.insert(branches).values({ id: 'structured-branch', name: 'Thiếu Nhi', scarfColor: 'Đỏ', ageMin: 9, ageMax: 12, parishId })
    await db.insert(academicYears).values({ id: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-01', parishId })
    await db.insert(classes).values({ id: 'structured-class', name: 'Thiếu Nhi 1', code: 'STRUCT-1', branchId: 'structured-branch', academicYearId: '2026-2027', parishId })
    await db.insert(students).values({ id: 'structured-student', code: 'STRUCT-ST1', holyName: 'Maria', fullName: 'Structured Student', gender: 'Nữ', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'ThieuNhi', classId: 'structured-class', parishId })
  })

  it('rejects invalid columns, duplicate blanks and ambiguous OMR metadata before persistence', async () => {
    for (const invalid of [
      { ...blank, answerData: { blanks: [{ id: '1', acceptedAnswers: [] }, { id: '1', acceptedAnswers: [] }] } },
      { ...matching, answerData: { ...matching.answerData, pairs: [{ leftId: '1', rightId: 'missing' }] } },
      { ...mc, responseFormat: 'fill_blank', answerData: blank.answerData },
      ...[-1, 1.5, 101, '12', null].map(answerLineCount => ({ ...essay, answerLineCount })),
      { ...mc, answerLineCount: 4 },
      { ...essay, explanation: { invalid: true } },
    ]) {
      const result = await request(exams, '/', 'POST', { ...sessionInput, questions: JSON.stringify([mc, { ...invalid, index: 2 }]) })
      expect(result.status).toBe(400)
    }
    expect(await db.select().from(examSessions).where(eq(examSessions.parishId, parishId))).toHaveLength(0)
  })

  it('preserves structured data and the manual score ceiling through OMR, manual entry and definition locks', async () => {
    const created = await request(exams, '/', 'POST', sessionInput)
    expect(created.status).toBe(201)
    const id = created.data.id
    expect(JSON.parse(created.data.questions)).toEqual([mc, blank, matching, essay])
    const captured = (await request(bank, '/questions?limit=100')).data.items
    expect(captured).toHaveLength(4)
    expect(captured.map((item: any) => item.current.questionType).sort()).toEqual(['essay', 'fill_blank', 'matching', 'multiple_choice'])
    for (const item of captured) expect(item).toMatchObject({ status: 'draft', branchId: 'structured-branch', curriculumLevel: 'Thiếu Nhi 1', provenance: 'import', createdBy: adminId, source: 'Đề thi: Đề cấu trúc' })
    expect(captured.find((item: any) => item.current.questionType === 'essay').current.answerData.answerLineCount).toBe(12)
    const definition = await request(exams, `/${id}/definition`)
    const definitionHash = definition.data.definitionHash
    const scan = await request(exams, `/${id}/results`, 'POST', { results: [{ studentId: 'structured-student', score: 10, source: 'omr', definitionHash,
      answers: JSON.stringify({ 1: 'B' }), scanMetadata: JSON.stringify({ detectionStatus: 'accepted', engineVersion: 'test', examVersion: 'A', questionCount: 1 }) }] })
    expect(scan.status).toBe(200)
    expect((await request(exams, `/${id}/results`)).data.results[0].score).toBe(2)
    const manual = await request(exams, `/${id}/results`, 'POST', { results: [{ studentId: 'structured-student', score: 7, essayScore: 7, source: 'quick_entry', expectedResultVersion: 1, definitionHash }] })
    expect(manual.status).toBe(200)
    expect((await request(exams, `/${id}/results`)).data.results[0]).toMatchObject({ score: 9, essayScore: 7 })
    const excessive = await request(exams, `/${id}/results`, 'POST', { results: [{ studentId: 'structured-student', score: 9, essayScore: 9, source: 'quick_entry', expectedResultVersion: 2, definitionHash }] })
    expect(excessive.status).toBe(400)
    const locked = await request(exams, `/${id}/definition`, 'PUT', { ...sessionInput, expectedDefinitionHash: definitionHash })
    expect(locked.status).toBe(409)
    expect((await request(exams, `/${id}`, 'GET', undefined, token('structured-other-admin', 'admin', 'structured-other'))).status).toBe(404)
  })

  it('keeps incomplete answers as drafts and refuses review without guessing a correct answer', async () => {
    const draft = await request(bank, '/questions', 'POST', { questionType: 'fill_blank', stem: blank.question, answerData: { blanks: [{ id: '1', acceptedAnswers: [] }] } })
    expect(draft.status).toBe(201)
    expect((await request(bank, `/questions/${draft.data.id}/lifecycle`, 'POST', { action: 'submit' })).status).toBe(400)
    expect((await request(bank, `/questions/${draft.data.id}`)).data.status).toBe('draft')
  })

  it('materializes mixed and manual-only bank exams with immutable structured snapshots and idempotent replay', async () => {
    const inputs = [
      { questionType: 'multiple_choice', stem: mc.question, answerData: { options: Object.entries(mc.options).map(([id, text]) => ({ id, text })), correctOptionIds: ['B'] } },
      ...[blank, matching, essay].map(q => ({ questionType: 'responseFormat' in q ? q.responseFormat : 'essay', stem: q.question, answerData: { ...q.answerData, ...('answerLineCount' in q ? { answerLineCount: q.answerLineCount } : {}) } })),
    ]
    const ids: string[] = []
    for (const input of inputs) {
      const created = await request(bank, '/questions', 'POST', input)
      expect(created.status).toBe(201)
      ids.push(created.data.id)
      for (const action of ['submit', 'approve', 'activate']) expect((await request(bank, `/questions/${created.data.id}/lifecycle`, 'POST', { action })).status).toBe(200)
    }
    const body = { mode: 'manual', questionIds: ids, classId: 'structured-class', subject: 'Sinh đề cấu trúc', scoreType: '15m', semester: 1, academicYear: '2026-2027', maxScore: 10, variantCount: 2, buildCommandId: 'structured-bank-build-01' }
    const forbidden = await request(bank, '/exams/build', 'POST', body, token(teacherId, 'chunhiem'))
    expect(forbidden.status).toBe(403)
    const built = await request(bank, '/exams/build', 'POST', body)
    expect(built.status).toBe(201)
    expect(built.data).toMatchObject({ examType: 'mixed', questionCount: 1 })
    const questions = JSON.parse(built.data.questions)
    expect(questions[1]).toMatchObject({ responseFormat: 'fill_blank', answerData: blank.answerData })
    expect(questions[2]).toMatchObject({ responseFormat: 'matching', answerData: matching.answerData })
    const variants = JSON.parse(built.data.variantManifests)
    expect(variants.variants.B.questions[2].answerData).toEqual(matching.answerData)
    expect(variants.variants.B.questions[3].answerLineCount).toBe(12)
    expect(questions[3].answerLineCount).toBe(12)
    expect(Object.keys(variants.variants.B.answerKey)).toEqual(['1'])
    const replay = await request(bank, '/exams/build', 'POST', body)
    expect(replay.data.id).toBe(built.data.id)
    const snapshots = await db.select().from(examQuestionSnapshots).where(eq(examQuestionSnapshots.examSessionId, built.data.id))
    expect(snapshots).toHaveLength(4)
    expect(snapshots.map(row => JSON.parse(row.snapshotJson)).find(q => q.responseFormat === 'matching').answerData).toEqual(matching.answerData)
    expect(snapshots.map(row => JSON.parse(row.snapshotJson)).find(q => q.index === 4).answerLineCount).toBe(12)
    const manual = await request(bank, '/exams/build', 'POST', { ...body, questionIds: ids.slice(1), variantCount: 1, buildCommandId: 'structured-bank-manual-01' })
    expect(manual.status).toBe(201)
    expect(manual.data).toMatchObject({ examType: 'written', questionCount: null, variantManifests: null })
  })

  it('deduplicates content across paper positions, notes, taxonomy, whitespace and shuffled option letters, but keeps a different correct answer', async () => {
    const stem = 'Tự lưu: chọn số hai.'
    const existing = await request(bank, '/questions', 'POST', { questionType: 'multiple_choice', stem,
      answerData: { options: Object.entries(mc.options).map(([id, text]) => ({ id, text })), correctOptionIds: ['B'] }, explanation: 'Ghi chú có sẵn', tags: ['cũ'], curriculumLevel: 'Khối khác' })
    expect(existing.status).toBe(201)
    const before = (await request(bank, '/questions?limit=100')).data.items.length
    const qs = [{ ...mc, question: `  ${stem.normalize('NFD')}  `, options: { A: 'Hai', B: 'Một', C: 'Bốn', D: 'Ba' }, correctOption: 'A', explanation: 'Ghi chú mới' },
      { ...essay, index: 2, points: 8, question: 'Tự lưu: giải thích ý nghĩa.', answerLineCount: 0 }]
    const body = { ...sessionInput, questions: JSON.stringify(qs), answerKey: '{"1":"A"}', idempotencyKey: 'structured-auto-save-replay' }
    const created = await request(exams, '/', 'POST', body)
    expect(created.status).toBe(201)
    expect((await request(bank, '/questions?limit=100')).data.items.length).toBe(before + 1)
    expect((await request(bank, `/questions/${existing.data.id}`)).data).toMatchObject({ currentVersion: 1, current: { explanation: 'Ghi chú có sẵn' } })
    const replay = await request(exams, '/', 'POST', body)
    expect(replay.data.id).toBe(created.data.id)
    const repeat = await request(exams, '/', 'POST', { ...body, idempotencyKey: 'structured-auto-save-another', questions: JSON.stringify([qs[0], { ...qs[1], answerLineCount: 100 }, { ...qs[1], index: 3, points: 1 }]) })
    expect(repeat.status).toBe(201)
    expect((await request(bank, '/questions?limit=100')).data.items.length).toBe(before + 1)
    const different = await request(exams, '/', 'POST', { ...body, idempotencyKey: 'structured-auto-save-other-key', answerKey: '{"1":"B"}', questions: JSON.stringify([{ ...qs[0], correctOption: 'B' }, qs[1]]) })
    expect(different.status).toBe(201)
    expect((await request(bank, '/questions?limit=100')).data.items.length).toBe(before + 2)
  })

  it('serializes two exam creations of the same new content into one bank draft', async () => {
    const body = { ...sessionInput, questions: JSON.stringify([{ ...mc, points: 10, question: 'Tự lưu đồng thời: chọn số hai.' }]), examType: 'multiple_choice' }
    const responses = await Promise.all(['one', 'two'].map(id => request(exams, '/', 'POST', { ...body, idempotencyKey: `structured-parallel-${id}` })))
    expect(responses.map(response => response.status)).toEqual([201, 201])
    expect(responses[0].data.id).not.toBe(responses[1].data.id)
    expect(await db.select().from(questionBankVersions).where(and(eq(questionBankVersions.parishId, parishId), eq(questionBankVersions.stem, 'Tự lưu đồng thời: chọn số hai.')))).toHaveLength(1)
  })

  it('keeps tenant identity separate and rejects an unassigned writer without bank effects', async () => {
    const q = { index: 1, type: 'essay', question: 'Câu giống nhau ở hai giáo xứ.', answerLineCount: 100 }
    const foreign = await request(bank, '/questions', 'POST', { questionType: 'essay', stem: q.question, answerData: {} }, token('structured-other-admin', 'admin', 'structured-other'))
    expect(foreign.status).toBe(201)
    const body = { ...sessionInput, examType: 'written', questionCount: undefined, answerKey: undefined, questions: JSON.stringify([q]) }
    expect((await request(exams, '/', 'POST', body, token(teacherId, 'chunhiem'))).status).toBe(403)
    expect(await db.select().from(questionBankVersions).where(and(eq(questionBankVersions.parishId, parishId), eq(questionBankVersions.stem, q.question)))).toHaveLength(0)
    expect((await request(exams, '/', 'POST', body)).status).toBe(201)
    const rows = await db.select().from(questionBankVersions).where(eq(questionBankVersions.stem, q.question))
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map(row => row.parishId))).toEqual(new Set([parishId, 'structured-other']))
    expect((await request(bank, `/questions/${foreign.data.id}`)).status).toBe(404)
  })

  it('rolls back the session, all new drafts and their audits if capturing a later question fails', async () => {
    const before = (await request(bank, '/questions?limit=100')).data.items.length
    const auditsBefore = await db.select().from(auditLogs).where(eq(auditLogs.parishId, parishId))
    await client.execute("CREATE TRIGGER structured_capture_failure BEFORE INSERT ON question_bank_versions WHEN NEW.parish_id = 'structured-exam-parish' AND NEW.stem = 'Tự lưu bị lỗi.' BEGIN SELECT RAISE(ABORT, 'synthetic capture failure'); END")
    try {
      const result = await request(exams, '/', 'POST', { ...sessionInput, subject: 'Atomic capture failure', examType: 'written', questionCount: undefined, answerKey: undefined,
        questions: JSON.stringify([{ index: 1, type: 'essay', question: 'Câu trước lỗi cần rollback.' }, { index: 2, type: 'essay', question: 'Tự lưu bị lỗi.' }]) })
      expect(result.status).toBe(500)
      expect(await db.select().from(examSessions).where(and(eq(examSessions.parishId, parishId), eq(examSessions.subject, 'Atomic capture failure')))).toHaveLength(0)
      expect((await request(bank, '/questions?limit=100')).data.items.length).toBe(before)
      expect(await db.select().from(auditLogs).where(eq(auditLogs.parishId, parishId))).toHaveLength(auditsBefore.length)
      expect(await db.select().from(questionBankVersions).where(eq(questionBankVersions.stem, 'Câu trước lỗi cần rollback.'))).toHaveLength(0)
    } finally { await client.execute('DROP TRIGGER structured_capture_failure') }
  })

  it('does not turn answer-key-only sessions or explicit placeholder content into bank records', async () => {
    const before = (await request(bank, '/questions?limit=100')).data.items.length
    for (const questions of [undefined, JSON.stringify([{ ...mc, question: 'Câu hỏi 1', isPlaceholder: true, points: 10 }])]) {
      const result = await request(exams, '/', 'POST', { ...sessionInput, examType: 'multiple_choice', questions })
      expect(result.status).toBe(201)
    }
    expect((await request(bank, '/questions?limit=100')).data.items.length).toBe(before)
  })
})
