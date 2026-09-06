import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { errorResponse, successResponse } from '../utils/response.js'
import { parseAcademicYear } from '../utils/academicYear.js'
import {
  QUESTION_STATUSES,
  QUESTION_TYPES,
  QuestionBankError,
  buildExamFromBank,
  createBlueprint,
  createQuestion,
  getBlueprint,
  getQuestion,
  importQuestions,
  listBlueprints,
  listQuestions,
  reviseQuestion,
  setBlueprintStatus,
  transitionQuestion,
} from '../services/questionBankService.js'

const router = new Hono()
router.use('*', authMiddleware, roleMiddleware('admin', 'chunhiem', 'phuta'))

const nullableText = z.string().trim().max(200).nullable().optional()
const difficulty = z.enum(['recognition', 'understanding', 'application'])
const questionContent = z.object({
  questionType: z.enum(QUESTION_TYPES),
  stem: z.string().trim().min(1).max(4000),
  answerData: z.record(z.string(), z.unknown()),
  explanation: z.string().trim().max(8000).nullable().optional(),
  changeNote: z.string().trim().max(500).nullable().optional(),
  provenance: z.enum(['human', 'ai', 'import']).optional(),
  branchId: z.string().trim().min(1).max(100).nullable().optional(),
  curriculumLevel: nullableText,
  book: nullableText,
  chapter: nullableText,
  lesson: nullableText,
  lessonOrder: z.number().int().min(0).max(10_000).nullable().optional(),
  topic: nullableText,
  difficulty: difficulty.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  source: z.string().trim().max(500).nullable().optional(),
})

const blueprintRule = z.object({
  questionType: z.enum(QUESTION_TYPES),
  chapter: nullableText,
  lessonFrom: z.number().int().min(0).max(10_000).nullable().optional(),
  lessonTo: z.number().int().min(0).max(10_000).nullable().optional(),
  topic: nullableText,
  difficulty: difficulty.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  questionCount: z.number().int().min(1).max(50),
  pointsEach: z.number().positive().max(10),
  avoidRecentDays: z.number().int().min(0).max(3650).optional(),
})

const blueprintInput = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).nullable().optional(),
  branchId: z.string().trim().min(1).max(100).nullable().optional(),
  curriculumLevel: nullableText,
  totalQuestions: z.number().int().min(1).max(50),
  maxScore: z.number().int().min(1).max(10),
  rules: z.array(blueprintRule).min(1).max(50),
})

function handleError(c: any, error: unknown) {
  if (error instanceof QuestionBankError) return c.json({ success: false, data: null, error: { code: error.code, message: error.message, details: error.details ?? null } }, error.status)
  console.error('[question-bank]', error)
  return errorResponse(c, 'QUESTION_BANK_ERROR', 'Không thể xử lý Ngân hàng câu hỏi.', 500)
}

router.get('/questions', zValidator('query', z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(QUESTION_STATUSES).optional(),
  questionType: z.enum(QUESTION_TYPES).optional(),
  branchId: z.string().trim().max(100).optional(),
  curriculumLevel: z.string().trim().max(200).optional(),
  difficulty: difficulty.optional(),
  lessonFrom: z.coerce.number().int().min(0).optional(),
  lessonTo: z.coerce.number().int().min(0).optional(),
  topic: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})), async c => {
  try {
    const user = c.get('user') as JwtPayload
    return successResponse(c, await listQuestions(user.parishId, c.req.valid('query')))
  } catch (error) { return handleError(c, error) }
})

router.post('/questions', zValidator('json', questionContent), async c => {
  try {
    const user = c.get('user') as JwtPayload
    return successResponse(c, await createQuestion(c.req.valid('json'), user.userId, user.parishId), 201)
  } catch (error) { return handleError(c, error) }
})

router.post('/questions/import', zValidator('json', z.object({
  items: z.array(questionContent).min(1).max(100),
})), async c => {
  try {
    const user = c.get('user') as JwtPayload
    const { items } = c.req.valid('json')
    return successResponse(c, await importQuestions(
      items.map(item => ({ ...item, provenance: 'import' as const })),
      { userId: user.userId, parishId: user.parishId },
    ), 201)
  } catch (error) { return handleError(c, error) }
})

router.get('/questions/:id', async c => {
  try {
    const user = c.get('user') as JwtPayload
    return successResponse(c, await getQuestion(c.req.param('id'), user.parishId))
  } catch (error) { return handleError(c, error) }
})

router.put('/questions/:id', zValidator('json', questionContent), async c => {
  try {
    const user = c.get('user') as JwtPayload
    return successResponse(c, await reviseQuestion(c.req.param('id'), c.req.valid('json'), { userId: user.userId, parishId: user.parishId, role: user.role }))
  } catch (error) { return handleError(c, error) }
})

router.post('/questions/:id/lifecycle', zValidator('json', z.object({ action: z.enum(['submit', 'reject', 'approve', 'activate', 'archive']) })), async c => {
  try {
    const user = c.get('user') as JwtPayload
    const { action } = c.req.valid('json')
    return successResponse(c, await transitionQuestion(c.req.param('id'), action, { userId: user.userId, parishId: user.parishId, role: user.role }))
  } catch (error) { return handleError(c, error) }
})

router.get('/blueprints', async c => {
  try {
    const user = c.get('user') as JwtPayload
    return successResponse(c, await listBlueprints(user.parishId))
  } catch (error) { return handleError(c, error) }
})

router.post('/blueprints', zValidator('json', blueprintInput), async c => {
  try {
    const user = c.get('user') as JwtPayload
    return successResponse(c, await createBlueprint(c.req.valid('json'), user.userId, user.parishId), 201)
  } catch (error) { return handleError(c, error) }
})

router.get('/blueprints/:id', async c => {
  try {
    const user = c.get('user') as JwtPayload
    return successResponse(c, await getBlueprint(c.req.param('id'), user.parishId))
  } catch (error) { return handleError(c, error) }
})

router.post('/blueprints/:id/status', zValidator('json', z.object({ status: z.enum(['active', 'archived']) })), async c => {
  try {
    const user = c.get('user') as JwtPayload
    const { status } = c.req.valid('json')
    return successResponse(c, await setBlueprintStatus(c.req.param('id'), status, { userId: user.userId, parishId: user.parishId, role: user.role }))
  } catch (error) { return handleError(c, error) }
})

const buildExamInput = z.object({
  mode: z.enum(['manual', 'blueprint']),
  questionIds: z.array(z.string().trim().min(1)).max(50).optional(),
  blueprintId: z.string().trim().min(1).optional(),
  classId: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(100),
  scoreType: z.enum(['oral', '15m', '1period', 'midterm', 'final']),
  semester: z.number().int().min(1).max(2),
  academicYear: z.string().trim().refine(value => Boolean(parseAcademicYear(value)), 'Năm học phải có dạng YYYY-YYYY.'),
  maxScore: z.number().int().min(1).max(10),
  variantCount: z.number().int().min(1).max(8).default(1),
  seed: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  buildCommandId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/),
}).superRefine((value, ctx) => {
  if (value.mode === 'manual' && (!value.questionIds || value.questionIds.length === 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questionIds'], message: 'Chế độ manual cần danh sách câu hỏi.' })
  if (value.mode === 'blueprint' && !value.blueprintId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blueprintId'], message: 'Chế độ blueprint cần blueprintId.' })
})

router.post('/exams/build', zValidator('json', buildExamInput), async c => {
  try {
    const user = c.get('user') as JwtPayload
    const input = c.req.valid('json')
    return successResponse(c, await buildExamFromBank(
      { ...input, semester: input.semester as 1 | 2 },
      { userId: user.userId, parishId: user.parishId, role: user.role },
    ), 201)
  } catch (error) { return handleError(c, error) }
})

export default router
