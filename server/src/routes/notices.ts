import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { getNotices, createNotice, updateNotice, deleteNotice } from '../services/noticeService.js'
import { isValidIsoDate } from '../utils/date.js'
import { CreateIdempotencyConflictError } from '../services/createIdempotency.js'

const noticesRouter = new Hono()
noticesRouter.use('*', authMiddleware)

const noticeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
  date: z.string().refine(isValidIsoDate, 'Ngày thông báo phải là ngày YYYY-MM-DD có thật'),
  author: z.string().trim().min(1).max(100),
  priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
  targetBranch: z.string().trim().optional(),
  targetAudience: z.enum(['all', 'staff', 'parents']).default('all').optional(),
  idempotencyKey: z.string().trim().optional(),
})

noticesRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const updatedAfter = c.req.query('updatedAfter')
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(10000, Math.max(1, parseInt(c.req.query('limit') || '50', 10)))
  const list = await getNotices(user.parishId, updatedAfter, limit, page, undefined, user.role)
  return listResponse(c, list)
})

noticesRouter.post('/', roleMiddleware('admin', 'chunhiem'), zValidator('json', noticeSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const created = await createNotice(data, user.userId, user.parishId, ip, userAgent)
    return successResponse(c, created, 201)
  } catch (err) {
    if (err instanceof CreateIdempotencyConflictError) {
      return errorResponse(c, err.code, err.message, err.status, { existing: err.existing })
    }
    throw err
  }
})

noticesRouter.put('/:id', roleMiddleware('admin', 'chunhiem'), zValidator('json', noticeSchema.partial()), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const updated = await updateNotice(id, data, user.userId, user.parishId, ip, userAgent)
  if (!updated) return errorResponse(c, 'NOT_FOUND', 'Thông báo không tồn tại', 404)
  return successResponse(c, updated)
})

noticesRouter.delete('/:id', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const success = await deleteNotice(id, user.userId, user.parishId, ip, userAgent)
  if (!success) return errorResponse(c, 'NOT_FOUND', 'Thông báo không tồn tại', 404)
  return successResponse(c, { id, deleted: true })
})

export default noticesRouter

