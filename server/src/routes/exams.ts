import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, getUserClassIds, isAdmin, checkUserClassAccess } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { successResponse, listResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import {
  createExamSession,
  listExamSessions,
  getExamSession,
  upsertExamResults,
  deleteExamResult,
  deleteExamSession,
  getExamResults,
  completeExamSession,
  reopenExamSession,
  ExamNotFoundError,
  ExamStateError,
  ExamAccessError,
} from '../services/examService.js'

const examsRouter = new Hono()
examsRouter.use('*', authMiddleware)

const scoreTypeSchema = z.enum(['oral', '15m', '1period', 'midterm', 'final'])
const examStatusSchema = z.enum(['draft', 'completed'])

/** Validate answerKey JSON: đủ chính xác 1..questionCount, mỗi value A/B/C/D. */
function parseAnswerKey(input: string | undefined, questionCount: number | undefined): { ok: true } | { ok: false; message: string } {
  if (!input) return { ok: true }
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    return { ok: false, message: 'answerKey phải là chuỗi JSON hợp lệ (Record<câu hỏi, "A"|"B"|"C"|"D">)' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: 'answerKey phải là object JSON (Record<câu hỏi, "A"|"B"|"C"|"D">)' }
  }
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.length === 0) {
    return { ok: false, message: 'answerKey không được rỗng' }
  }
  for (const [key, value] of entries) {
    const q = Number(key)
    if (!Number.isInteger(q) || q < 1 || (questionCount !== undefined && q > questionCount)) {
      return { ok: false, message: `answerKey chứa câu hỏi không hợp lệ: "${key}"` }
    }
    if (value !== 'A' && value !== 'B' && value !== 'C' && value !== 'D') {
      return { ok: false, message: `Đáp án câu ${key} phải là A/B/C/D (nhận: ${String(value)})` }
    }
  }
  if (questionCount !== undefined) {
    if (entries.length !== questionCount) {
      return { ok: false, message: `answerKey phải có đủ ${questionCount} câu (hiện có ${entries.length})` }
    }
    const keys = new Set(entries.map(([key]) => Number(key)))
    for (let question = 1; question <= questionCount; question++) {
      if (!keys.has(question)) return { ok: false, message: `answerKey thiếu đáp án câu ${question}` }
    }
  }
  return { ok: true }
}

const createSchema = z.object({
  classId: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(100),
  scoreType: scoreTypeSchema,
  maxScore: z.coerce.number().int().min(1).max(10).optional().default(10),
  semester: z.coerce.number().int().min(1).max(2),
  academicYear: z.string().trim().min(1).optional(),
  examType: z.enum(['written', 'multiple_choice']).optional().default('written'),
  // questionCount giới hạn 1..50 — khớp template phiếu in (answerSheetTemplate.getMcColumnLayout clamp 50).
  questionCount: z.coerce.number().int().min(1).max(50).optional(),
  answerKey: z.string().optional(),
  questions: z.string().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
}).superRefine((data, ctx) => {
  if (data.examType === 'multiple_choice' && data.questionCount === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questionCount'], message: 'questionCount bắt buộc với hình thức trắc nghiệm' })
  }
  if (data.examType === 'multiple_choice' && !data.answerKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answerKey'], message: 'answerKey đầy đủ bắt buộc với hình thức trắc nghiệm' })
  }
  const check = parseAnswerKey(data.answerKey, data.questionCount)
  if (!check.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answerKey'], message: check.message })
  }
})

const resultsSchema = z.object({
  results: z.array(z.object({
    studentId: z.string().trim().min(1),
    score: z.coerce.number().min(0).max(10),
    source: z.enum(['qr_scan', 'omr', 'quick_entry']).optional(),
    answers: z.string().max(20_000).optional(),
    scanMetadata: z.string().max(10_000).optional(),
  })).min(1).max(1000),
})

function handleServiceError(c: any, err: any) {
  if (err instanceof ExamNotFoundError) return errorResponse(c, 'NOT_FOUND', err.message, 404)
  if (err instanceof ExamStateError) return errorResponse(c, 'STATE_TRANSITION_INVALID', err.message, 409)
  if (err instanceof ExamAccessError) return errorResponse(c, 'FORBIDDEN', err.message, 403)
  const status = err.status || err.statusCode || 500
  const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi xử lý phiên chấm'
  if (status === 403) return errorResponse(c, 'FORBIDDEN', msg, 403)
  if (status === 404) return errorResponse(c, 'NOT_FOUND', msg, 404)
  if (status === 400) return errorResponse(c, 'VALIDATION_ERROR', msg, 400)
  console.error('[exams] error:', err)
  return errorResponse(c, 'EXAM_ERROR', msg, status)
}

// ─── Tạo phiên chấm (admin + chunhiem + phuta — lớp mình phụ trách) ───
examsRouter.post('/', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', createSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    if (!isAdmin(user) && !await checkUserClassAccess(user.userId, user.parishId, data.classId)) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền tạo phiên chấm cho lớp này', 403)
    }
    const session = await createExamSession({ ...data, semester: data.semester as 1 | 2 }, user.userId, user.parishId, ip, userAgent)
    return successResponse(c, session, 201)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Danh sách phiên theo lớp ───
examsRouter.get('/class/:classId', zValidator('query', z.object({
  subject: z.string().optional(),
  scoreType: scoreTypeSchema.optional(),
  status: examStatusSchema.optional(),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const classId = c.req.param('classId')
  const query = c.req.valid('query')

  if (!isAdmin(user) && !await checkUserClassAccess(user.userId, user.parishId, classId)) {
    return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền xem phiên chấm của lớp này', 403)
  }
  const sessions = await listExamSessions(user.parishId, [classId], query)
  return listResponse(c, sessions)
})

// ─── Danh sách phiên theo lớp của tôi ───
examsRouter.get('/my-classes', async (c) => {
  const user = c.get('user') as JwtPayload
  const classIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
  const sessions = await listExamSessions(user.parishId, classIds)
  return listResponse(c, sessions)
})

// ─── Upsert kết quả (admin + chunhiem + phuta) — phuta chỉ lớp mình ───
examsRouter.post('/:id/results', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', resultsSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')
  const { results } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    const result = await upsertExamResults(sessionId, results, user.userId, user.parishId, ip, userAgent, allowedClassIds)
    return successResponse(c, result)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Kết quả phiên ───
examsRouter.get('/:id/results', async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')

  try {
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    const result = await getExamResults(sessionId, user.parishId, allowedClassIds)
    return successResponse(c, result)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Xóa 1 kết quả (admin + chunhiem + phuta) — chỉ phiên draft ───
examsRouter.delete('/:id/results/:studentId', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')
  const studentId = c.req.param('studentId')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    const result = await deleteExamResult(sessionId, studentId, user.userId, user.parishId, ip, userAgent, allowedClassIds)
    return successResponse(c, result)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Hoàn tất phiên (admin + chunhiem) — đóng phiên + audit EXAM_FINALIZE ───
examsRouter.post('/:id/complete', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    const session = await completeExamSession(sessionId, user.userId, user.parishId, ip, userAgent, allowedClassIds)
    return successResponse(c, session)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Xóa phiên chấm (admin + chunhiem + phuta — lớp mình) — chỉ phiên draft ───
// Dùng khi tạo nhầm: xóa session + toàn bộ kết quả chưa finalize (cascade), audit EXAM_DELETE_SESSION.
examsRouter.delete('/:id', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    const result = await deleteExamSession(sessionId, user.userId, user.parishId, ip, userAgent, allowedClassIds)
    return successResponse(c, result)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Mở lại phiên (admin-only) — cho phép re-scan ───
examsRouter.post('/:id/reopen', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const session = await reopenExamSession(sessionId, user.userId, user.parishId, ip, userAgent)
    return successResponse(c, session)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Chi tiết phiên (kèm class access check) ───
examsRouter.get('/:id', async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')

  try {
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    const session = await getExamSession(sessionId, user.parishId)
    if (allowedClassIds && !allowedClassIds.includes(session.classId)) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền xem phiên chấm này', 403)
    }
    return successResponse(c, session)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Cập nhật answer key + re-score (chỉ phiên MC draft) ───
const updateAnswerKeySchema = z.object({
  answerKey: z.string().optional(),
  questionCount: z.coerce.number().int().min(1).max(50).optional(),
})

examsRouter.patch('/:id/answer-key', zValidator('json', updateAnswerKeySchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')
  const { answerKey, questionCount } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const session = await getExamSession(sessionId, user.parishId)
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    if (allowedClassIds && !allowedClassIds.includes(session.classId)) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền sửa phiên chấm này', 403)
    }
    if (session.status === 'completed') {
      return errorResponse(c, 'STATE_TRANSITION_INVALID', 'Phiên đã hoàn tất — mở lại trước khi sửa answer key', 409)
    }
    if (session.examType !== 'multiple_choice') {
      return errorResponse(c, 'INVALID_OPERATION', 'Chỉ sửa answer key cho phiên trắc nghiệm', 400)
    }

    const effectiveAnswerKey = answerKey ?? session.answerKey
    if (!effectiveAnswerKey) {
      return errorResponse(c, 'INVALID_ANSWER_KEY', 'Thiếu answer key cho phiên trắc nghiệm', 400)
    }
    const newQCount = questionCount ?? (session.questionCount ?? undefined)
    const check = parseAnswerKey(effectiveAnswerKey, newQCount)
    if (!check.ok) {
      return errorResponse(c, 'INVALID_ANSWER_KEY', check.message, 400)
    }

    // Import re-score function
    const { updateAnswerKeyAndRescore } = await import('../services/examService.js')
    const result = await updateAnswerKeyAndRescore(sessionId, user.parishId, effectiveAnswerKey, newQCount ?? 20, user.userId, ip, userAgent)
    return successResponse(c, result)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Barcode decode endpoint — fallback khi QR scan thất bại ───
const barcodeBodySchema = z.object({
  barcodeText: z.string().min(1).max(200),
})

examsRouter.post('/barcode/decode', zValidator('json', barcodeBodySchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { barcodeText } = c.req.valid('json')

  // Tương thích cả payload legacy và payload production rút gọn. Bản rút gọn
  // không truncate ID: nó chỉ bỏ prefix EXS-/ST- vốn cố định để mã ít module hơn.
  const legacyMatch = barcodeText.match(/^tntt-exam:([^:]+):([^:]+)$/)
  const compactMatch = barcodeText.match(/^te:([a-f0-9]{8}):([a-f0-9]{8})$/i)
  const v2Match = barcodeText.match(/^t2:([a-f0-9]{8}):([a-f0-9]{8}):([if]):(\d{1,2}):([a-f0-9]{4})$/i)
  if (!legacyMatch && !compactMatch && !v2Match) {
    return errorResponse(c, 'INVALID_BARCODE', 'Mã barcode không hợp lệ.', 400)
  }

  const sessionHex = compactMatch?.[1] ?? v2Match?.[1]
  const studentHex = compactMatch?.[2] ?? v2Match?.[2]
  const sessionId = legacyMatch ? legacyMatch[1] : `EXS-${sessionHex!.toLowerCase()}`
  const studentId = legacyMatch ? legacyMatch[2] : `ST-${studentHex!.toLowerCase()}`
  let protocolMetadata: Record<string, unknown> = {}
  if (v2Match) {
    const mode = v2Match[3].toUpperCase() as 'I' | 'F'
    const count = Number(v2Match[4])
    let hash = 0x811c9dc5
    const checksumInput = `${sessionId.toLowerCase()}|${studentId.toLowerCase()}|${mode}|${count}`
    for (let i = 0; i < checksumInput.length; i++) {
      hash ^= checksumInput.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    const expected = (hash & 0xffff).toString(16).toUpperCase().padStart(4, '0')
    if (count < 1 || count > 50 || v2Match[5].toUpperCase() !== expected) {
      return errorResponse(c, 'INVALID_BARCODE', 'Checksum hoặc cấu hình mẫu phiếu không hợp lệ.', 400)
    }
    protocolMetadata = {
      protocolVersion: 2,
      templateMode: mode === 'F' ? 'full_page' : 'integrated',
      questionCount: count,
      formChecksum: expected,
    }
  }

  try {
    const session = await getExamSession(sessionId, user.parishId)
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    if (allowedClassIds && !allowedClassIds.includes(session.classId)) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền truy cập phiên chấm này', 403)
    }

    return successResponse(c, {
      sessionId: session.id,
      studentId,
      classId: session.classId,
      subject: session.subject,
      examType: session.examType,
      maxScore: session.maxScore,
      questionCount: session.questionCount,
      ...protocolMetadata,
    })
  } catch (err) {
    return handleServiceError(c, err)
  }
})

export default examsRouter
