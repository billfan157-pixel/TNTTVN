import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { errorResponse, successResponse } from '../utils/response.js'
import {
  createFeedback,
  FeedbackError,
  getFeedbackTargets,
  listFeedbackInbox,
  listPublicSentFeedback,
  updateFeedbackStatus,
} from '../services/feedbackService.js'

const feedbackRouter = new Hono()
feedbackRouter.use('*', authMiddleware)

const createSchema = z.object({
  targetType: z.enum(['PARISH', 'HOMEROOM_TEACHER']),
  targetUserId: z.string().trim().min(1).optional(),
  visibility: z.enum(['ANONYMOUS', 'PUBLIC']),
  subject: z.string().trim().min(3, 'Tiêu đề cần ít nhất 3 ký tự').max(160),
  content: z.string().trim().min(10, 'Nội dung cần ít nhất 10 ký tự').max(5000),
})

function handleFeedbackError(c: Parameters<typeof errorResponse>[0], error: unknown) {
  if (error instanceof FeedbackError) {
    return errorResponse(c, error.code, error.message, error.status)
  }
  throw error
}

feedbackRouter.get('/targets', roleMiddleware('chunhiem', 'phuta', 'phuhuynh'), async (c) => {
  const user = c.get('user') as JwtPayload
  return successResponse(c, await getFeedbackTargets(user))
})

feedbackRouter.get('/inbox', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  try {
    return successResponse(c, await listFeedbackInbox(user))
  } catch (error) {
    return handleFeedbackError(c, error)
  }
})

feedbackRouter.get('/sent', roleMiddleware('chunhiem', 'phuta', 'phuhuynh'), async (c) => {
  const user = c.get('user') as JwtPayload
  return successResponse(c, await listPublicSentFeedback(user))
})

// Đánh dấu privacy trước validator bằng clone để cả request anonymous sai dữ liệu
// cũng không bị logger gắn userId/IP/user-agent.
feedbackRouter.post('/', roleMiddleware('chunhiem', 'phuta', 'phuhuynh'), async (c, next) => {
  try {
    const body = await c.req.raw.clone().json() as { visibility?: unknown }
    if (body?.visibility === 'ANONYMOUS') c.set('privacyMode', 'anonymous-feedback')
  } catch {}
  await next()
}, zValidator('json', createSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  try {
    return successResponse(c, await createFeedback(c.req.valid('json'), user), 201)
  } catch (error) {
    return handleFeedbackError(c, error)
  }
})

feedbackRouter.patch('/:id/status', roleMiddleware('admin', 'chunhiem'), zValidator('json', z.object({
  status: z.enum(['READ', 'ARCHIVED']),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  try {
    return successResponse(c, await updateFeedbackStatus(c.req.param('id'), c.req.valid('json').status, user))
  } catch (error) {
    return handleFeedbackError(c, error)
  }
})

export default feedbackRouter
