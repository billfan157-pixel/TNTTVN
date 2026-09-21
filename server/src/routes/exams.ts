import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, getUserClassIds, isAdmin, checkUserClassAccess } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { successResponse, listResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { parseAcademicYear } from '../utils/academicYear.js'
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
  ExamMutationConflictError,
  ExamResultVersionConflictError,
  ExamAccessError,
} from '../services/examService.js'
import { CreateIdempotencyConflictError } from '../services/createIdempotency.js'

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

function parseAnswerVariants(input: string | undefined, questionCount: number | undefined): { ok: true; variants?: Record<string, Record<string, unknown>> } | { ok: false; message: string } {
  if (!input) return { ok: true }
  let parsed: unknown
  try { parsed = JSON.parse(input) } catch { return { ok: false, message: 'answerVariants phải là JSON hợp lệ.' } }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, message: 'answerVariants phải là object mã đề A–H.' }
  const variants = parsed as Record<string, Record<string, unknown>>
  const codes = Object.keys(variants)
  if (codes.length < 1 || codes.length > 8 || !codes.includes('A')) return { ok: false, message: 'Phải có từ 1 đến 8 mã đề và bắt buộc có mã A.' }
  for (const code of codes) {
    if (!/^[A-H]$/.test(code)) return { ok: false, message: `Mã đề không hợp lệ: ${code}. Chỉ chấp nhận A–H.` }
    const check = parseAnswerKey(JSON.stringify(variants[code]), questionCount)
    if (!check.ok) return { ok: false, message: `Mã đề ${code}: ${check.message}` }
  }
  return { ok: true, variants }
}

// QB-F2 (audit 2026-08-21): ngân hàng câu hỏi phải là mảng ExamQuestion hợp lệ —
// trước đây chỉ z.string() trần không shape/không giới hạn, dữ liệu rác được tích
// trữ và client phải tự liều lĩnh parse.
// EXAM-MIXED (2026-08-24): chấp nhận thêm câu tự luận (type 'essay') — KHÔNG có
// options/correctOption; câu trắc nghiệm giữ nguyên ràng buộc A–D + đáp án.
export interface ParsedExamQuestion {
  index: number
  type: 'multiple_choice' | 'essay'
  points?: number
}

function parseQuestions(input: string | undefined): { ok: true; questions?: ParsedExamQuestion[] } | { ok: false; message: string } {
  if (!input) return { ok: true }
  let parsed: unknown
  try { parsed = JSON.parse(input) } catch { return { ok: false, message: 'questions phải là chuỗi JSON hợp lệ (mảng ExamQuestion).' } }
  if (!Array.isArray(parsed)) return { ok: false, message: 'questions phải là mảng các câu hỏi.' }
  if (parsed.length < 1 || parsed.length > 50) {
    return { ok: false, message: `questions phải có từ 1 đến 50 câu (nhận ${parsed.length}).` }
  }
  const summary: ParsedExamQuestion[] = []
  for (const q of parsed) {
    if (!q || typeof q !== 'object' || Array.isArray(q)) return { ok: false, message: 'questions chứa câu hỏi không hợp lệ.' }
    const item = q as Record<string, unknown>
    const index = Number(item.index)
    if (!Number.isInteger(index) || index < 1 || index > 50) {
      return { ok: false, message: `questions chứa index không hợp lệ: ${JSON.stringify(item.index)}.` }
    }
    if (typeof item.question !== 'string' || item.question.trim().length === 0 || item.question.length > 2000) {
      return { ok: false, message: `Câu ${index}: nội dung câu hỏi phải là chuỗi 1..2000 ký tự.` }
    }
    if (item.type !== undefined && item.type !== null && item.type !== 'multiple_choice' && item.type !== 'essay') {
      return { ok: false, message: `Câu ${index}: type phải là 'multiple_choice' hoặc 'essay'.` }
    }
    const isEssay = item.type === 'essay'
    if (item.points !== undefined && item.points !== null) {
      const pts = Number(item.points)
      if (!Number.isFinite(pts) || pts <= 0 || pts > 100) {
        return { ok: false, message: `Câu ${index}: điểm câu hỏi phải nằm trong khoảng (0, 100].` }
      }
      summary.push({ index, type: isEssay ? 'essay' : 'multiple_choice', points: Math.round(pts * 100) / 100 })
    } else {
      summary.push({ index, type: isEssay ? 'essay' : 'multiple_choice' })
    }
    const options = item.options as Record<string, unknown> | undefined
    if (isEssay) {
      // Câu tự luận không được mang dữ liệu trắc nghiệm — tránh trạng thái mơ hồ
      // (có "đáp án đúng" nhưng không bao giờ chấm tự động).
      if (options !== undefined && options !== null) {
        return { ok: false, message: `Câu ${index}: câu tự luận không được có options A/B/C/D.` }
      }
      if (item.correctOption !== undefined && item.correctOption !== null) {
        return { ok: false, message: `Câu ${index}: câu tự luận không được có correctOption.` }
      }
      continue
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      return { ok: false, message: `Câu ${index}: thiếu options.` }
    }
    for (const opt of ['A', 'B', 'C', 'D'] as const) {
      const value = options[opt]
      if (typeof value !== 'string' || value.length > 500) {
        return { ok: false, message: `Câu ${index}: phương án ${opt} phải là chuỗi 0..500 ký tự.` }
      }
    }
    if (item.correctOption !== 'A' && item.correctOption !== 'B' && item.correctOption !== 'C' && item.correctOption !== 'D') {
      return { ok: false, message: `Câu ${index}: correctOption phải là A/B/C/D.` }
    }
    if (item.explanation !== undefined && item.explanation !== null && typeof item.explanation !== 'string') {
      return { ok: false, message: `Câu ${index}: explanation phải là chuỗi.` }
    }
  }
  return { ok: true, questions: summary }
}

/**
 * EXAM-MIXED: với phiên trắc nghiệm/mixed, các câu TN phải chiếm CHÍNH XÁC index
 * 1..questionCount (liên tục từ đầu đề) — phiếu OMR đánh số bubble 1..N theo
 * questionCount nên câu TN xen kẽ giữa các câu TL sẽ làm lệch toàn bộ chấm quét.
 */
function validateMcIndexLayout(questions: ParsedExamQuestion[], questionCount: number): string | null {
  const mcIndexes = questions.filter(q => q.type === 'multiple_choice').map(q => q.index).sort((a, b) => a - b)
  if (mcIndexes.length === 0) return 'Đề mixed phải có ít nhất một câu trắc nghiệm.'
  if (mcIndexes.length !== questionCount) {
    return `Số câu trắc nghiệm (${mcIndexes.length}) không khớp questionCount (${questionCount}).`
  }
  for (let i = 0; i < mcIndexes.length; i++) {
    if (mcIndexes[i] !== i + 1) {
      return `Các câu trắc nghiệm phải liên tục bắt đầu từ câu 1 (phát hiện câu TN tại index ${mcIndexes[i]} sau ${i} câu).`
    }
  }
  return null
}

const createSchema = z.object({
  classId: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(100),
  scoreType: scoreTypeSchema,
  maxScore: z.coerce.number().int().min(1).max(10).optional().default(10),
  semester: z.coerce.number().int().min(1).max(2),
  academicYear: z.string().trim().min(1).optional(),
  // EXAM-MIXED: 'mixed' = đề kết hợp trắc nghiệm (questionCount = số câu TN) + tự luận.
  examType: z.enum(['written', 'multiple_choice', 'mixed']).optional().default('written'),
  // questionCount giới hạn 1..50 — khớp template phiếu in (answerSheetTemplate.getMcColumnLayout clamp 50).
  questionCount: z.coerce.number().int().min(1).max(50).optional(),
  answerKey: z.string().optional(),
  answerVariants: z.string().max(100_000).optional(),
  questions: z.string().max(200_000).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
}).superRefine((data, ctx) => {
  if (data.examType === 'multiple_choice' && data.questionCount === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questionCount'], message: 'questionCount bắt buộc với hình thức trắc nghiệm' })
  }
  if (data.examType === 'mixed' && data.questionCount === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questionCount'], message: 'questionCount (số câu trắc nghiệm) bắt buộc với đề mixed' })
  }
  // EXAM-AUDIT F3 (2026-08-21): chặn năm học tự do ("abc") ngay tại create —
  // trước đây phiên tạo được nhưng complete sẽ fail 400 "Năm học không tồn tại"
  // (upsertGrade verify) với thông báo khó hiểu.
  if (data.academicYear && !parseAcademicYear(data.academicYear.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['academicYear'], message: 'academicYear phải có định dạng YYYY-YYYY (ví dụ 2025-2026)' })
  }
  if (data.examType === 'multiple_choice' && !data.answerKey && !data.answerVariants) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answerKey'], message: 'answerKey hoặc answerVariants đầy đủ bắt buộc với hình thức trắc nghiệm' })
  }
  if (data.examType === 'mixed' && !data.answerKey && !data.answerVariants) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answerKey'], message: 'answerKey (phần trắc nghiệm) bắt buộc với đề mixed' })
  }
  if (data.examType === 'mixed' && !data.questions) {
    // Không có ngân hàng câu hỏi thì không thể tách trọng số điểm TN/TL khi chấm.
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questions'], message: 'questions (có ít nhất 1 câu tự luận) bắt buộc với đề mixed' })
  }
  const check = parseAnswerKey(data.answerKey, data.questionCount)
  if (!check.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answerKey'], message: check.message })
  }
  const variantsCheck = parseAnswerVariants(data.answerVariants, data.questionCount)
  if (!variantsCheck.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answerVariants'], message: variantsCheck.message })
  const questionsCheck = parseQuestions(data.questions)
  if (!questionsCheck.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questions'], message: questionsCheck.message })
  } else if ((data.examType === 'mixed' || data.examType === 'multiple_choice') && questionsCheck.questions && questionsCheck.questions.length > 0) {
    // EXAM-MIXED: cross-check bố cục câu TN với questionCount (phiếu OMR đánh
    // bubble 1..questionCount nên câu TN phải liên tục từ đầu đề).
    const layoutError = validateMcIndexLayout(questionsCheck.questions, data.questionCount ?? questionsCheck.questions.filter(q => q.type === 'multiple_choice').length)
    if (layoutError) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questions'], message: layoutError })
    }
    if (data.examType === 'mixed' && !questionsCheck.questions.some(q => q.type === 'essay')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questions'], message: 'Đề mixed phải có ít nhất một câu tự luận.' })
    }
  }
})

const resultsSchema = z.object({
  results: z.array(z.object({
    studentId: z.string().trim().min(1),
    score: z.coerce.number().min(0).max(10),
    // EXAM-MIXED: điểm phần tự luận (nhập tay). Server cộng vào phần TN tự chấm
    // rồi mới clamp theo maxScore — client KHÔNG được tự quyết định điểm tổng.
    essayScore: z.coerce.number().min(0).max(10).optional(),
    source: z.enum(['qr_scan', 'omr', 'quick_entry']).optional(),
    answers: z.string().max(20_000).optional(),
    scanMetadata: z.string().max(10_000).optional(),
    examVersion: z.string().trim().toUpperCase().regex(/^[A-H]$/).optional().default('A'),
    clientMutationId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/).optional(),
    attemptFingerprint: z.string().trim().min(1).max(256).optional(),
    capturedAt: z.string().datetime({ offset: true }).optional(),
    expectedResultVersion: z.coerce.number().int().min(0).optional(),
    afterMutationId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  })).min(1).max(1000),
})

function handleServiceError(c: any, err: any) {
  if (err instanceof CreateIdempotencyConflictError) {
    return errorResponse(c, err.code, err.message, err.status, { existing: err.existing })
  }
  if (err instanceof ExamNotFoundError) return errorResponse(c, 'NOT_FOUND', err.message, 404)
  if (err instanceof ExamStateError) return errorResponse(c, 'STATE_TRANSITION_INVALID', err.message, 409)
  if (err instanceof ExamMutationConflictError) return errorResponse(c, 'IDEMPOTENCY_CONFLICT', err.message, 409)
  if (err instanceof ExamResultVersionConflictError) {
    return c.json({
      success: false,
      error: { code: err.code, message: err.message, details: { studentId: err.studentId, currentVersion: err.currentVersion } },
    }, 409)
  }
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
    const variantsCheck = parseAnswerVariants(data.answerVariants, data.questionCount)
    const fallbackAnswerKey = variantsCheck.ok && variantsCheck.variants?.A
      ? JSON.stringify(variantsCheck.variants.A)
      : undefined
    // Khi client gửi cả hai field, answerVariants.A là SSOT; answerKey chỉ là
    // alias legacy để không thể tồn tại hai đáp án A mâu thuẫn trong cùng session.
    const session = await createExamSession({ ...data, answerKey: fallbackAnswerKey ?? data.answerKey, semester: data.semester as 1 | 2 }, user.userId, user.parishId, ip, userAgent, { role: user.role, epoch: user.tokenVersion })
    return successResponse(c, session, 201)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Danh sách phiên theo lớp ───
examsRouter.get('/class/:classId', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('query', z.object({
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
// EXAM-AUDIT F1 (2026-08-21): chỉ admin/GLV — phuhuynh không có nghiệp vụ xem
// phiên chấm; service trả [] khi user chưa được phân công lớp nào.
examsRouter.get('/my-classes', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
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
    const result = await upsertExamResults(sessionId, results, user.userId, user.parishId, ip, userAgent, allowedClassIds, { role: user.role, epoch: user.tokenVersion })
    return successResponse(c, result)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Kết quả phiên ───
examsRouter.get('/:id/results', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
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
examsRouter.delete('/:id/results/:studentId', roleMiddleware('admin', 'chunhiem', 'phuta'),
  zValidator('query', z.object({
    clientMutationId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/),
    expectedResultId: z.string().trim().min(1).max(120).optional(),
    expectedResultVersion: z.coerce.number().int().min(1).optional(),
    afterMutationId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  }).superRefine((value, ctx) => {
    const hasDirectFields = Boolean(value.expectedResultId) || value.expectedResultVersion !== undefined
    if (value.afterMutationId ? hasDirectFields : !value.expectedResultId || value.expectedResultVersion === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cần đúng một định danh kết quả đã thấy hoặc mã lệnh lưu trước đó.' })
    }
  })), async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')
  const studentId = c.req.param('studentId')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    const result = await deleteExamResult(sessionId, studentId, user.userId, user.parishId, ip, userAgent, allowedClassIds,
      { role: user.role, epoch: user.tokenVersion }, c.req.valid('query'))
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
    // P0-01: trả full ExamFinalizationResult (session + items/committed/conflicts).
    // Client là read-only projector của receipt này, không ghi grade lần hai.
    const result = await completeExamSession(sessionId, user.userId, user.parishId, ip, userAgent, allowedClassIds, { role: user.role, epoch: user.tokenVersion })
    return successResponse(c, result)
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
    const result = await deleteExamSession(sessionId, user.userId, user.parishId, ip, userAgent, allowedClassIds, { role: user.role, epoch: user.tokenVersion })
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
    const session = await reopenExamSession(sessionId, user.userId, user.parishId, ip, userAgent, { role: user.role, epoch: user.tokenVersion })
    return successResponse(c, session)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Chi tiết phiên (kèm class access check) ───
examsRouter.get('/:id', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
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

examsRouter.patch('/:id/answer-key', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', updateAnswerKeySchema), async (c) => {
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
    if (session.variantManifests) {
      return errorResponse(c, 'VARIANT_MANIFEST_LOCKED', 'Bộ mã đề đã khóa; không được sửa đáp án tách rời khỏi manifest.', 409)
    }
    if (session.examType !== 'multiple_choice' && session.examType !== 'mixed') {
      return errorResponse(c, 'INVALID_OPERATION', 'Chỉ sửa answer key cho phiên trắc nghiệm hoặc mixed', 400)
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
    const result = await updateAnswerKeyAndRescore(sessionId, user.parishId, effectiveAnswerKey, newQCount ?? 20, user.userId, ip, userAgent, { role: user.role, epoch: user.tokenVersion })
    return successResponse(c, result)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

const updateAnswerVariantsSchema = z.object({
  answerVariants: z.string().min(1).max(100_000),
  questionCount: z.coerce.number().int().min(1).max(50),
})

examsRouter.patch('/:id/answer-variants', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', updateAnswerVariantsSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')
  const { answerVariants, questionCount } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''
  try {
    const session = await getExamSession(sessionId, user.parishId)
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    if (allowedClassIds && !allowedClassIds.includes(session.classId)) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền sửa mã đề của phiên này', 403)
    }
    if (session.variantManifests) {
      return errorResponse(c, 'VARIANT_MANIFEST_LOCKED', 'Bộ mã đề đã khóa; không được sửa đáp án tách rời khỏi manifest.', 409)
    }
    const check = parseAnswerVariants(answerVariants, questionCount)
    if (!check.ok) return errorResponse(c, 'INVALID_ANSWER_VARIANTS', check.message, 400)
    const { updateAnswerVariantsAndRescore } = await import('../services/examService.js')
    const result = await updateAnswerVariantsAndRescore(sessionId, user.parishId, answerVariants, questionCount, user.userId, ip, userAgent, { role: user.role, epoch: user.tokenVersion })
    return successResponse(c, result)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

const generateVariantManifestSchema = z.object({
  variantCount: z.coerce.number().int().min(1).max(8),
  seed: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/).optional(),
})

examsRouter.post('/:id/variant-manifests', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', generateVariantManifestSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const sessionId = c.req.param('id')
  const { variantCount, seed } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''
  try {
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    const { createImmutableVariantManifests } = await import('../services/examService.js')
    const result = await createImmutableVariantManifests({
      sessionId,
      parishId: user.parishId,
      userId: user.userId,
      ip,
      userAgent,
      allowedClassIds,
      expected: { role: user.role, epoch: user.tokenVersion },
      variantCount,
      seed,
    })
    return successResponse(c, result)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

// ─── Barcode decode endpoint — fallback khi QR scan thất bại ───
const barcodeBodySchema = z.object({
  barcodeText: z.string().min(1).max(200),
})

examsRouter.post('/barcode/decode', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', barcodeBodySchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { barcodeText } = c.req.valid('json')

  // Tương thích cả payload legacy và payload production rút gọn. Bản rút gọn
  // không truncate ID: nó chỉ bỏ prefix EXS-/ST- vốn cố định để mã ít module hơn.
  const legacyMatch = barcodeText.match(/^tntt-exam:([^:]+):([^:]+)$/)
  const compactMatch = barcodeText.match(/^te:([a-f0-9]{8}):([a-f0-9]{8})$/i)
  const v2Match = barcodeText.match(/^t2:([a-f0-9]{8}):([a-f0-9]{8}):([if]):(\d{1,2}):([a-f0-9]{4})$/i)
  const v3Match = barcodeText.match(/^t3:([a-f0-9]{8}):([a-f0-9]{8}):([if]):(\d{1,2}):([a-h]):([a-f0-9]{4})$/i)
  if (!legacyMatch && !compactMatch && !v2Match && !v3Match) {
    return errorResponse(c, 'INVALID_BARCODE', 'Mã barcode không hợp lệ.', 400)
  }

  const sessionHex = compactMatch?.[1] ?? v2Match?.[1] ?? v3Match?.[1]
  const studentHex = compactMatch?.[2] ?? v2Match?.[2] ?? v3Match?.[2]
  const sessionId = legacyMatch ? legacyMatch[1] : `EXS-${sessionHex!.toLowerCase()}`
  const studentId = legacyMatch ? legacyMatch[2] : `ST-${studentHex!.toLowerCase()}`
  let protocolMetadata: Record<string, unknown> = {}
  if (v2Match || v3Match) {
    const match = v3Match ?? v2Match!
    const mode = match[3].toUpperCase() as 'I' | 'F'
    const count = Number(match[4])
    const examVersion = v3Match?.[5]?.toUpperCase()
    let hash = 0x811c9dc5
    const checksumInput = `${sessionId.toLowerCase()}|${studentId.toLowerCase()}|${mode}|${count}${examVersion ? `|${examVersion}` : ''}`
    for (let i = 0; i < checksumInput.length; i++) {
      hash ^= checksumInput.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    const expected = (hash & 0xffff).toString(16).toUpperCase().padStart(4, '0')
    const receivedChecksum = v3Match ? v3Match[6] : v2Match![5]
    if (count < 1 || count > 50 || receivedChecksum.toUpperCase() !== expected) {
      return errorResponse(c, 'INVALID_BARCODE', 'Checksum hoặc cấu hình mẫu phiếu không hợp lệ.', 400)
    }
    protocolMetadata = {
      protocolVersion: v3Match ? 3 : 2,
      templateMode: mode === 'F' ? 'full_page' : 'integrated',
      questionCount: count,
      examVersion: examVersion ?? 'A',
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
