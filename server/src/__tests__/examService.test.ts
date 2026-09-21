import { describe, it, expect, beforeAll } from 'vitest'
import { generateTokens } from '../middleware/auth.js'
import examsApp from '../routes/exams.js'
import { db } from '../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, semesterLocks, auditLogs, examSessions, examResults } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { updateAnswerKeyAndRescore, updateAnswerVariantsAndRescore } from '../services/examService.js'

const parishId = 'parish-exam-test'
let sharedSessionId = ''
const adminToken = generateTokens({ userId: 'usr-exam-admin', username: 'exam_admin', role: 'admin', parishId }).accessToken
const cnToken = generateTokens({ userId: 'usr-exam-cn', username: 'exam_cn', role: 'chunhiem', parishId }).accessToken
const phutaToken = generateTokens({ userId: 'usr-exam-phuta', username: 'exam_phuta', role: 'phuta', parishId }).accessToken

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

async function currentResultVersion(sessionId: string, studentId: string): Promise<number | undefined> {
  const [row] = await db.select({ resultVersion: examResults.resultVersion }).from(examResults).where(and(
    eq(examResults.parishId, parishId),
    eq(examResults.examSessionId, sessionId),
    eq(examResults.studentId, studentId),
  )).limit(1)
  return row?.resultVersion
}

async function resultDeletePath(sessionId: string, studentId: string, mutationId: string): Promise<string> {
  const [row] = await db.select({ id: examResults.id, version: examResults.resultVersion }).from(examResults).where(and(
    eq(examResults.parishId, parishId), eq(examResults.examSessionId, sessionId), eq(examResults.studentId, studentId),
  )).limit(1)
  if (!row) throw new Error('Expected result fixture is missing')
  const query = new URLSearchParams({ expectedResultId: row.id, expectedResultVersion: String(row.version), clientMutationId: mutationId })
  return `/${sessionId}/results/${studentId}?${query}`
}

describe('Smart Exam Grading — exam routes & service', () => {
  beforeAll(async () => {
    await db.insert(branches).values({ id: 'br-exam-01', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-09-01', endDate: '2026-05-31', parishId }).onConflictDoNothing()
    await db.insert(classes).values({ id: 'cl-exam-01', code: 'CL-EXAM', name: 'Lớp Chấm 1', branchId: 'br-exam-01', academicYearId: '2025-2026', parishId }).onConflictDoNothing()
    await db.insert(classes).values({ id: 'cl-exam-02', code: 'CL-EXAM2', name: 'Lớp Khác', branchId: 'br-exam-01', academicYearId: '2025-2026', parishId }).onConflictDoNothing()
    await db.insert(users).values([
      { id: 'usr-exam-admin', username: 'exam_admin', fullName: 'Admin Exam', passwordHash: 'hash', role: 'admin', parishId },
      { id: 'usr-exam-cn', username: 'exam_cn', fullName: 'CN Exam', passwordHash: 'hash', role: 'chunhiem', parishId },
      { id: 'usr-exam-phuta', username: 'exam_phuta', fullName: 'Phuta Exam', passwordHash: 'hash', role: 'phuta', parishId },
    ]).onConflictDoNothing()
    await db.insert(catechistAssignments).values([
      { id: 'asg-exam-01', userId: 'usr-exam-phuta', classId: 'cl-exam-01', roleInClass: 'phuta', parishId },
      { id: 'asg-exam-02', userId: 'usr-exam-cn', classId: 'cl-exam-01', roleInClass: 'chunhiem', parishId },
    ]).onConflictDoNothing()
    await db.insert(students).values([
      { id: 'st-exam-01', code: 'ST-EXAM-1', holyName: 'Giu-se', fullName: 'Nguyen Van A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'cl-exam-01', parishId },
      { id: 'st-exam-02', code: 'ST-EXAM-2', holyName: 'Maria', fullName: 'Nguyen Thi B', gender: 'Nữ', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'cl-exam-01', parishId },
    ]).onConflictDoNothing()
  })

  it('blocks unauthenticated requests with 401', async () => {
    expect((await jsonReq('/')).status).toBe(401)
    expect((await jsonReq('/cl-exam-01/results', { method: 'POST', body: { results: [] } })).status).toBe(401)
    expect((await jsonReq('/EXS-1/complete', { method: 'POST' })).status).toBe(401)
  })

  it('phuta can create a session for their class (201) but is blocked for another class (403)', async () => {
    const own = await jsonReq('/', {
      method: 'POST',
      token: phutaToken,
      body: { classId: 'cl-exam-01', subject: 'Giáo Lý Phụ Tá', scoreType: '15m', semester: 1, academicYear: '2025-2026' },
    })
    expect(own.status).toBe(201)
    expect(own.data.status).toBe('draft')
    expect(own.data.createdBy).toBe('usr-exam-phuta')

    const otherClass = await jsonReq('/', {
      method: 'POST',
      token: phutaToken,
      body: { classId: 'cl-exam-02', subject: 'Lớp Khác', scoreType: '15m', semester: 1 },
    })
    expect(otherClass.status).toBe(403)
  })

  it('admin creates a session and gets 201', async () => {
    const res = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-01', subject: 'Giáo Lý', scoreType: '15m', semester: 1, academicYear: '2025-2026' },
    })
    expect(res.status).toBe(201)
    expect(res.data.status).toBe('draft')
    expect(res.data.id).toMatch(/^EXS-/)
    sharedSessionId = res.data.id
  })

  it('Exam Studio persists one immutable server-authoritative variant manifest set', async () => {
    const questions = Array.from({ length: 4 }, (_, index) => ({
      index: index + 1,
      question: `Studio question ${index + 1}`,
      type: 'multiple_choice',
      options: { A: `A${index}`, B: `B${index}`, C: `C${index}`, D: `D${index}` },
      correctOption: 'B',
    }))
    const created = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: {
        classId: 'cl-exam-01', subject: 'Exam Studio', scoreType: 'midterm', semester: 1,
        academicYear: '2025-2026', examType: 'multiple_choice', questionCount: 4,
        answerKey: JSON.stringify({ 1: 'B', 2: 'B', 3: 'B', 4: 'B' }),
        questions: JSON.stringify(questions),
      },
    })
    expect(created.status).toBe(201)

    const generated = await jsonReq(`/${created.data.id}/variant-manifests`, {
      method: 'POST', token: adminToken, body: { variantCount: 3, seed: 'studio-seed-2026' },
    })
    expect(generated.status).toBe(200)
    expect(Object.keys(generated.data.manifests.variants)).toEqual(['A', 'B', 'C'])
    expect(generated.data.manifests.variants.A.sourceQuestionOrder).toEqual([1, 2, 3, 4])
    expect(generated.data.manifests.variants.B.contentHash).not.toBe(generated.data.manifests.variants.A.contentHash)
    expect(generated.data.session.variantManifests).toContain('catevia-variant-v1')

    const regenerate = await jsonReq(`/${created.data.id}/variant-manifests`, {
      method: 'POST', token: adminToken, body: { variantCount: 4 },
    })
    expect(regenerate.status).toBe(409)

    const detachedKeyMutation = await jsonReq(`/${created.data.id}/answer-key`, {
      method: 'PATCH', token: adminToken,
      body: { answerKey: JSON.stringify({ 1: 'A', 2: 'A', 3: 'A', 4: 'A' }), questionCount: 4 },
    })
    expect(detachedKeyMutation.status).toBe(409)
    expect(detachedKeyMutation.body.error.code).toBe('VARIANT_MANIFEST_LOCKED')

    await expect(updateAnswerKeyAndRescore(
      created.data.id,
      parishId,
      JSON.stringify({ 1: 'A', 2: 'A', 3: 'A', 4: 'A' }),
      4,
      'usr-exam-admin',
      '127.0.0.1',
      'direct-service-test',
    )).rejects.toThrow(/manifest/i)
    await expect(updateAnswerVariantsAndRescore(
      created.data.id,
      parishId,
      JSON.stringify({ A: { 1: 'B', 2: 'B', 3: 'B', 4: 'B' } }),
      4,
      'usr-exam-admin',
      '127.0.0.1',
      'direct-service-test',
    )).rejects.toThrow(/manifest/i)
  })

  it('barcode decode accepts compact production payload and restores full IDs', async () => {
    const compact = `TE:${sharedSessionId.slice(4).toUpperCase()}:12345678`
    const res = await jsonReq('/barcode/decode', {
      method: 'POST',
      token: adminToken,
      body: { barcodeText: compact },
    })
    expect(res.status).toBe(200)
    expect(res.data.sessionId).toBe(sharedSessionId)
    expect(res.data.studentId).toBe('ST-12345678')
  })

  it('barcode decode accepts T2 metadata and rejects a corrupted checksum', async () => {
    const studentId = 'ST-12345678'
    const mode = 'I'
    const questionCount = 20
    const checksumInput = `${sharedSessionId.toLowerCase()}|${studentId.toLowerCase()}|${mode}|${questionCount}`
    let hash = 0x811c9dc5
    for (let i = 0; i < checksumInput.length; i++) {
      hash ^= checksumInput.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    const checksum = (hash & 0xffff).toString(16).toUpperCase().padStart(4, '0')
    const payload = `T2:${sharedSessionId.slice(4).toUpperCase()}:12345678:${mode}:${questionCount}:${checksum}`
    const accepted = await jsonReq('/barcode/decode', {
      method: 'POST', token: adminToken, body: { barcodeText: payload },
    })
    expect(accepted.status).toBe(200)
    expect(accepted.data).toMatchObject({
      sessionId: sharedSessionId,
      studentId,
      protocolVersion: 2,
      templateMode: 'integrated',
      questionCount,
      formChecksum: checksum,
    })

    const corrupted = await jsonReq('/barcode/decode', {
      method: 'POST', token: adminToken,
      body: { barcodeText: `${payload.slice(0, -1)}${payload.endsWith('0') ? '1' : '0'}` },
    })
    expect(corrupted.status).toBe(400)
  })

  it('barcode decode accepts T3 and binds exam version into checksum', async () => {
    const studentId = 'ST-12345678'
    const mode = 'F'
    const questionCount = 40
    const examVersion = 'B'
    const checksumInput = `${sharedSessionId.toLowerCase()}|${studentId.toLowerCase()}|${mode}|${questionCount}|${examVersion}`
    let hash = 0x811c9dc5
    for (let i = 0; i < checksumInput.length; i++) {
      hash ^= checksumInput.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    const checksum = (hash & 0xffff).toString(16).toUpperCase().padStart(4, '0')
    const payload = `T3:${sharedSessionId.slice(4).toUpperCase()}:12345678:${mode}:${questionCount}:${examVersion}:${checksum}`
    const accepted = await jsonReq('/barcode/decode', { method: 'POST', token: adminToken, body: { barcodeText: payload } })
    expect(accepted.status).toBe(200)
    expect(accepted.data).toMatchObject({ protocolVersion: 3, examVersion: 'B', templateMode: 'full_page', questionCount })

    const tampered = await jsonReq('/barcode/decode', { method: 'POST', token: adminToken, body: { barcodeText: payload.replace(':B:', ':C:') } })
    expect(tampered.status).toBe(400)
  })

  it('phuta can save results for their class and is blocked for another class', async () => {
    const sessionId = sharedSessionId
    const ok = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: phutaToken,
      body: { results: [
        { studentId: 'st-exam-01', score: 8.5, source: 'quick_entry' },
        { studentId: 'st-exam-02', score: 9, source: 'quick_entry' },
      ] },
    })
    expect(ok.status).toBe(200)
    expect(ok.data.saved).toBe(2)
    expect(ok.data.session.status).toBe('draft')

    // Phiên của LỚP KHÁC (cl-exam-02) — phuta không phụ trách → 403
    const otherClass = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-02', subject: 'Giáo Lý', scoreType: '15m', semester: 1, academicYear: '2025-2026' },
    })
    const forbidden = await jsonReq(`/${otherClass.data.id}/results`, {
      method: 'POST',
      token: phutaToken,
      body: { results: [{ studentId: 'st-exam-01', score: 10 }] },
    })
    expect(forbidden.status).toBe(403)
  })

  it('rejects scores above maxScore and students outside the class', async () => {
    const sessionId = sharedSessionId
    const tooHigh = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{ studentId: 'st-exam-01', score: 11 }] },
    })
    expect(tooHigh.status).toBe(400)

    const wrongStudent = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{ studentId: 'st-exam-02', score: 5 }, { studentId: 'st-missing-99', score: 5 }] },
    })
    expect(wrongStudent.status).toBe(400)
  })

  it('upsert is idempotent (UNIQUE exam_session_id+student_id) — re-save updates score', async () => {
    const sessionId = sharedSessionId
    const res = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{ studentId: 'st-exam-01', score: 7, source: 'quick_entry', expectedResultVersion: await currentResultVersion(sessionId, 'st-exam-01') }] },
    })
    expect(res.status).toBe(200)
    expect(res.data.upserted).toBe(1)
    expect(res.data.saved).toBe(0)
  })

  it('EXAM-CONTINUOUS-P0: retry cùng clientMutationId trả duplicate, không audit/ghi lại', async () => {
    const created = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-01', subject: 'Continuous idempotency', scoreType: '15m', semester: 1, academicYear: '2025-2026' },
    })
    const sessionId = created.data.id
    const mutation = {
      studentId: 'st-exam-01',
      score: 6.5,
      source: 'quick_entry',
      clientMutationId: 'MUT-CONT-0001',
      capturedAt: '2026-08-28T03:00:00.000Z',
    }

    const first = await jsonReq(`/${sessionId}/results`, {
      method: 'POST', token: adminToken, body: { results: [mutation] },
    })
    const retry = await jsonReq(`/${sessionId}/results`, {
      method: 'POST', token: adminToken, body: { results: [mutation] },
    })

    expect(first.status).toBe(200)
    expect(first.data.items).toEqual([
      expect.objectContaining({ clientMutationId: mutation.clientMutationId, studentId: mutation.studentId, status: 'created', serverScore: 6.5 }),
    ])
    expect(retry.status).toBe(200)
    expect(retry.data).toMatchObject({ saved: 0, upserted: 0, total: 1 })
    expect(retry.data.items).toEqual([
      expect.objectContaining({ clientMutationId: mutation.clientMutationId, status: 'duplicate', serverScore: 6.5 }),
    ])

    const auditRows = await db.select({ newValue: auditLogs.newValue }).from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.entityId, sessionId),
      eq(auditLogs.action, 'EXAM_SAVE_RESULTS'),
    ))
    expect(auditRows.filter(row => row.newValue?.includes(mutation.clientMutationId))).toHaveLength(1)

    const reusedWithDifferentPayload = await jsonReq(`/${sessionId}/results`, {
      method: 'POST', token: adminToken, body: { results: [{ ...mutation, score: 7 }] },
    })
    expect(reusedWithDifferentPayload.status).toBe(409)
    expect(reusedWithDifferentPayload.body?.error?.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('GET results returns student names and latest scores', async () => {
    const sessionId = sharedSessionId
    const res = await jsonReq(`/${sessionId}/results`, { token: adminToken })
    expect(res.status).toBe(200)
    expect(res.data.results).toHaveLength(2)
    const st1 = res.data.results.find((r: any) => r.studentId === 'st-exam-01')
    expect(st1.score).toBe(7)
    expect(st1.studentName).toBe('Nguyen Van A')
  })

  it('DELETE result removes exactly one row (phuta can delete in class) + audit EXAM_DELETE_RESULT', async () => {
    const sessionId = sharedSessionId
    const path = await resultDeletePath(sessionId, 'st-exam-01', 'exam-service-delete-001')
    const del = await jsonReq(path, { method: 'DELETE', token: phutaToken })
    expect(del.status).toBe(200)
    expect(del.data.deleted).toBe(true)

    const after = await jsonReq(`/${sessionId}/results`, { token: adminToken })
    expect(after.data.results).toHaveLength(1)
    expect(after.data.results[0].studentId).toBe('st-exam-02')

    const again = await jsonReq(path, { method: 'DELETE', token: phutaToken })
    expect(again.status).toBe(200)
    expect(again.data.duplicate).toBe(true)

    const auditRows = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.entityId, sessionId))
    expect(auditRows.some(r => r.action === 'EXAM_DELETE_RESULT')).toBe(true)
  })

  it('cannot DELETE result after completed (409) unless admin reopens', async () => {
    const sessionId = sharedSessionId
    await jsonReq(`/${sessionId}/complete`, { method: 'POST', token: cnToken })
    const blocked = await jsonReq(await resultDeletePath(sessionId, 'st-exam-02', 'exam-service-completed-delete-001'), { method: 'DELETE', token: adminToken })
    expect(blocked.status).toBe(409)
    await jsonReq(`/${sessionId}/reopen`, { method: 'POST', token: adminToken })
  })

  it('cannot complete with zero results (empty session → but this one has results; uses empty session)', async () => {
    const empty = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-01', subject: 'Miệng', scoreType: 'oral', semester: 1, academicYear: '2025-2026' },
    })
    const complete = await jsonReq(`/${empty.data.id}/complete`, { method: 'POST', token: adminToken })
    expect(complete.status).toBe(409)
  })

  it('DELETE session: phuta xóa phiên draft lớp mình — session + results biến mất + audit EXAM_DELETE_SESSION', async () => {
    const created = await jsonReq('/', {
      method: 'POST',
      token: phutaToken,
      body: { classId: 'cl-exam-01', subject: 'Xóa Thử', scoreType: '15m', semester: 1, academicYear: '2025-2026' },
    })
    expect(created.status).toBe(201)
    const sessionId = created.data.id

    await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: phutaToken,
      body: { results: [
        { studentId: 'st-exam-01', score: 8, source: 'quick_entry' },
        { studentId: 'st-exam-02', score: 7, source: 'quick_entry' },
      ] },
    })

    const del = await jsonReq(`/${sessionId}`, { method: 'DELETE', token: phutaToken })
    expect(del.status).toBe(200)
    expect(del.data.deleted).toBe(true)
    expect(del.data.resultsDeleted).toBe(2)

    const after = await jsonReq(`/${sessionId}`, { token: adminToken })
    expect(after.status).toBe(404)

    const auditRows = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.entityId, sessionId))
    expect(auditRows.some(r => r.action === 'EXAM_DELETE_SESSION')).toBe(true)
  })

  it('DELETE session: không thể xóa phiên của lớp khác (403) và phiên không tồn tại (404)', async () => {
    const adminOther = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-02', subject: 'Lớp Khác', scoreType: '15m', semester: 1 },
    })
    const forbidden = await jsonReq(`/${adminOther.data.id}`, { method: 'DELETE', token: phutaToken })
    expect(forbidden.status).toBe(403)

    const missing = await jsonReq('/EXS-khong-ton-tai', { method: 'DELETE', token: phutaToken })
    expect(missing.status).toBe(404)
  })

  it('DELETE session: không thể xóa phiên completed (409) — đã ghi vào bảng điểm', async () => {
    const created = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-01', subject: 'Xóa Không Được', scoreType: '15m', semester: 1, academicYear: '2025-2026' },
    })
    const sessionId = created.data.id
    await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{ studentId: 'st-exam-01', score: 9, source: 'quick_entry' }] },
    })
    await jsonReq(`/${sessionId}/complete`, { method: 'POST', token: cnToken })

    const blocked = await jsonReq(`/${sessionId}`, { method: 'DELETE', token: adminToken })
    expect(blocked.status).toBe(409)

    const still = await jsonReq(`/${sessionId}`, { token: adminToken })
    expect(still.status).toBe(200)
    expect(still.data.status).toBe('completed')
  })

  it('DELETE session: chunhiem xóa phiên draft lớp mình (200) và admin xóa được mọi phiên draft', async () => {
    const cnSession = await jsonReq('/', {
      method: 'POST',
      token: cnToken,
      body: { classId: 'cl-exam-01', subject: 'CN Xóa', scoreType: 'oral', semester: 1, academicYear: '2025-2026' },
    })
    const cnDel = await jsonReq(`/${cnSession.data.id}`, { method: 'DELETE', token: cnToken })
    expect(cnDel.status).toBe(200)

    const adminSession = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-02', subject: 'Admin Xóa', scoreType: 'oral', semester: 1 },
    })
    const adminDel = await jsonReq(`/${adminSession.data.id}`, { method: 'DELETE', token: adminToken })
    expect(adminDel.status).toBe(200)
  })

  it('chunhiem completes the session (EXAM_FINALIZE audit) and re-complete is idempotent', async () => {
    const sessionId = sharedSessionId
    const res = await jsonReq(`/${sessionId}/complete`, { method: 'POST', token: cnToken })
    expect(res.status).toBe(200)
    // P0-01: complete trả full ExamFinalizationResult để client project receipt
    // (server là sole writer) thay vì chỉ session.
    expect(res.data.session.status).toBe('completed')
    expect(res.data.session.completedBy).toBe('usr-exam-cn')
    expect(Array.isArray(res.data.items)).toBe(true)
    expect(typeof res.data.committed).toBe('number')

    const again = await jsonReq(`/${sessionId}/complete`, { method: 'POST', token: cnToken })
    expect(again.status).toBe(200)
    expect(again.data.session.status).toBe('completed')
  })

  it('phuta cannot complete (403)', async () => {
    const sessionId = sharedSessionId
    const res = await jsonReq(`/${sessionId}/complete`, { method: 'POST', token: phutaToken })
    expect(res.status).toBe(403)
  })

  it('cannot save results after completed (409) unless admin reopens', async () => {
    const sessionId = sharedSessionId
    const blocked = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{ studentId: 'st-exam-01', score: 8 }] },
    })
    expect(blocked.status).toBe(409)

    const reopen = await jsonReq(`/${sessionId}/reopen`, { method: 'POST', token: adminToken })
    expect(reopen.status).toBe(200)
    expect(reopen.data.status).toBe('draft')

    const ok = await jsonReq(`/${sessionId}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{ studentId: 'st-exam-01', score: 8, source: 'quick_entry' }] },
    })
    expect(ok.status).toBe(200)
  })

  it('phuta cannot reopen (admin-only)', async () => {
    const sessionId = sharedSessionId
    const res = await jsonReq(`/${sessionId}/reopen`, { method: 'POST', token: phutaToken })
    expect(res.status).toBe(403)
  })

  it('complete is blocked when the semester is locked (SEMESTER_LOCKED)', async () => {
    const session = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-01', subject: 'Giữa Kỳ', scoreType: 'midterm', semester: 2, academicYear: '2025-2026' },
    })
    await jsonReq(`/${session.data.id}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{ studentId: 'st-exam-01', score: 6, source: 'quick_entry' }] },
    })
    await db.insert(semesterLocks).values({
      id: 'sml-exam-01', parishId, academicYear: '2025-2026', semester: 2, isLocked: 1,
    }).onConflictDoUpdate({ target: [semesterLocks.parishId, semesterLocks.academicYear, semesterLocks.semester], set: { isLocked: 1 } })

    const res = await jsonReq(`/${session.data.id}/complete`, { method: 'POST', token: adminToken })
    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain('khóa sổ điểm')

    await db.delete(semesterLocks).where(and(eq(semesterLocks.parishId, parishId), eq(semesterLocks.semester, 2)))
  })

  it('list by class and my-classes return sessions', async () => {
    const res = await jsonReq('/class/cl-exam-01?scoreType=15m', { token: adminToken })
    expect(res.status).toBe(200)
    expect(res.data.length).toBeGreaterThan(0)

    const mine = await jsonReq('/my-classes', { token: phutaToken })
    expect(mine.status).toBe(200)
    expect(mine.data.every((s: any) => s.classId === 'cl-exam-01')).toBe(true)
  })

  it('Phase 3: create with idempotencyKey returns SAME session on retry (no duplicate)', async () => {
    const first = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-01', subject: 'Giáo Lý', scoreType: '15m', semester: 1, idempotencyKey: 'EXS-tmp-retry-001' },
    })
    expect(first.status).toBe(201)
    const retry = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-01', subject: 'Giáo Lý', scoreType: '15m', semester: 1, idempotencyKey: 'EXS-tmp-retry-001' },
    })
    expect(retry.status).toBe(201)
    expect(retry.data.id).toBe(first.data.id)
  })

  it('Phase 3: exam create stores idempotency_key column', async () => {
    const session = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: { classId: 'cl-exam-01', subject: 'Kiểm tra', scoreType: '15m', semester: 1, idempotencyKey: 'EXS-tmp-key-check' },
    })
    const [row] = await db.select().from(examSessions).where(eq(examSessions.id, session.data.id))
    expect((row as any).idempotencyKey).toBe('EXS-tmp-key-check')
  })

  it('Phase 4: multiple_choice session stores examType/questionCount/answerKey + saves answers', async () => {
    const session = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: {
        classId: 'cl-exam-01', subject: 'Trắc nghiệm', scoreType: 'midterm', semester: 1,
        examType: 'multiple_choice', questionCount: 2, answerKey: '{"1":"A","2":"C"}',
      },
    })
    expect(session.status).toBe(201)
    expect(session.data.examType).toBe('multiple_choice')
    expect(session.data.questionCount).toBe(2)

    const save = await jsonReq(`/${session.data.id}/results`, {
      method: 'POST',
      token: adminToken,
      body: { results: [{
        studentId: 'st-exam-01',
        score: 8,
        source: 'qr_scan',
        answers: '{"1":"A","2":null}',
        scanMetadata: '{"engineVersion":"omr-v2","detectionStatus":"accepted","examVersion":"A","questionCount":2,"quality":{"edgeEnergy":12.4}}',
      }] },
    })
    expect(save.status).toBe(200)
    // 1/2 câu đúng × maxScore 10 = 5; server không tin điểm 8 từ client.
    expect(save.data.adjustments).toEqual([{ studentId: 'st-exam-01', clientScore: 8, serverScore: 5 }])

    const fetched = await jsonReq(`/${session.data.id}/results`, { token: adminToken })
    const st1 = fetched.data.results.find((r: any) => r.studentId === 'st-exam-01')
    expect(st1.score).toBe(5)
    expect(st1.answers).toBe('{"1":"A","2":null}')
    expect(JSON.parse(st1.scanMetadata)).toMatchObject({ engineVersion: 'omr-v2', detectionStatus: 'accepted' })
  })

  it('mã đề A/B được chấm server-authoritative bằng đáp án riêng và chấm lại khi cập nhật', async () => {
    const variants = { A: { 1: 'A', 2: 'B' }, B: { 1: 'C', 2: 'D' } }
    const session = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: {
        classId: 'cl-exam-01', subject: 'TN nhiều mã', scoreType: '15m', semester: 1,
        examType: 'multiple_choice', questionCount: 2, answerVariants: JSON.stringify(variants),
      },
    })
    expect(session.status).toBe(201)
    expect(JSON.parse(session.data.answerVariants)).toEqual(variants)

    const save = await jsonReq(`/${session.data.id}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{ studentId: 'st-exam-01', score: 0, source: 'omr', examVersion: 'B', answers: '{"1":"C","2":"D"}', scanMetadata: '{"detectionStatus":"accepted","examVersion":"B","questionCount":2}' }] },
    })
    expect(save.status).toBe(200)
    expect(save.data.adjustments).toEqual([{ studentId: 'st-exam-01', clientScore: 0, serverScore: 10 }])

    variants.B[2] = 'A'
    const update = await jsonReq(`/${session.data.id}/answer-variants`, {
      method: 'PATCH', token: adminToken,
      body: { questionCount: 2, answerVariants: JSON.stringify(variants) },
    })
    expect(update.status).toBe(200)
    expect(update.data.rescored).toBe(1)

    const fetched = await jsonReq(`/${session.data.id}/results`, { token: adminToken })
    expect(fetched.data.results[0]).toMatchObject({ examVersion: 'B', score: 5 })
  })

  it('Scan Engine v2: chặn answers sai schema, trạng thái review và metadata chứa ảnh', async () => {
    const session = await jsonReq('/', {
      method: 'POST',
      token: adminToken,
      body: {
        classId: 'cl-exam-01', subject: 'TN an toàn', scoreType: '15m', semester: 1,
        examType: 'multiple_choice', questionCount: 2, answerKey: '{"1":"A","2":"B"}',
      },
    })
    const base = { studentId: 'st-exam-01', score: 10, source: 'omr' }

    const missingProvenance = await jsonReq(`/${session.data.id}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{ ...base, answers: '{"1":"A","2":"B"}' }] },
    })
    expect(missingProvenance.status).toBe(400)

    const wrongBinding = await jsonReq(`/${session.data.id}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{ ...base, answers: '{"1":"A","2":"B"}', scanMetadata: '{"detectionStatus":"accepted","examVersion":"B","questionCount":2}' }] },
    })
    expect(wrongBinding.status).toBe(400)

    const invalidAnswer = await jsonReq(`/${session.data.id}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{ ...base, answers: '{"1":"E"}' }] },
    })
    expect(invalidAnswer.status).toBe(400)

    const unresolved = await jsonReq(`/${session.data.id}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{ ...base, answers: '{"1":"A","2":null}', scanMetadata: '{"detectionStatus":"review_required"}' }] },
    })
    expect(unresolved.status).toBe(400)

    const blank = await jsonReq(`/${session.data.id}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{ ...base, score: 0, answers: '{"1":null,"2":null}', scanMetadata: '{"detectionStatus":"accepted"}' }] },
    })
    expect(blank.status).toBe(400)

    const imageLeak = await jsonReq(`/${session.data.id}/results`, {
      method: 'POST', token: adminToken,
      body: { results: [{ ...base, answers: '{"1":"A","2":null}', scanMetadata: '{"image":"data:image/jpeg;base64,AAAA"}' }] },
    })
    expect(imageLeak.status).toBe(400)
  })

  it('EXAM-GAPS: reject invalid answerKey (non-JSON / non-object / invalid option / out-of-range question)', async () => {
    const base = { classId: 'cl-exam-01', subject: 'TN', scoreType: 'midterm', semester: 1, examType: 'multiple_choice', questionCount: 10 } as const

    const notJson = await jsonReq('/', { method: 'POST', token: adminToken, body: { ...base, answerKey: '{not-json}' } })
    expect(notJson.status).toBe(400)

    const notObject = await jsonReq('/', { method: 'POST', token: adminToken, body: { ...base, answerKey: '["A","B"]' } })
    expect(notObject.status).toBe(400)

    const badOption = await jsonReq('/', { method: 'POST', token: adminToken, body: { ...base, answerKey: '{"1":"E"}' } })
    expect(badOption.status).toBe(400)

    const outOfRange = await jsonReq('/', { method: 'POST', token: adminToken, body: { ...base, answerKey: '{"11":"A"}' } })
    expect(outOfRange.status).toBe(400)

    const empty = await jsonReq('/', { method: 'POST', token: adminToken, body: { ...base, answerKey: '{}' } })
    expect(empty.status).toBe(400)

    const incomplete = await jsonReq('/', { method: 'POST', token: adminToken, body: { ...base, answerKey: '{"1":"A"}' } })
    expect(incomplete.status).toBe(400)

    const missingQuestionCount = await jsonReq('/', { method: 'POST', token: adminToken, body: { classId: 'cl-exam-01', subject: 'TN', scoreType: 'midterm', semester: 1, examType: 'multiple_choice', answerKey: '{"1":"A"}' } })
    expect(missingQuestionCount.status).toBe(400)

    const missingAnswerKey = await jsonReq('/', { method: 'POST', token: adminToken, body: { ...base } })
    expect(missingAnswerKey.status).toBe(400)
  })

  it('EXAM-GAPS: questionCount > 50 rejected (template chỉ hỗ trợ tối đa 50 câu)', async () => {
    const tooMany = await jsonReq('/', {
      method: 'POST', token: adminToken,
      body: { classId: 'cl-exam-01', subject: 'TN', scoreType: '15m', semester: 1, examType: 'multiple_choice', questionCount: 60, answerKey: '{"1":"A"}' },
    })
    expect(tooMany.status).toBe(400)
  })
})
