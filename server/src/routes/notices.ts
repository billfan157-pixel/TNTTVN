import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import { getNotices, createNotice, deleteNotice } from '../services/noticeService.js'

const noticesRouter = new Hono()
noticesRouter.use('*', authMiddleware)

const noticeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
  date: z.string(),
  author: z.string().trim().min(1).max(100),
  priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
  targetBranch: z.string().trim().optional(),
})

noticesRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const updatedAfter = c.req.query('updatedAfter')
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50', 10)))
  const list = await getNotices(user.parishId, updatedAfter, limit, page)
  return listResponse(c, list)
})

noticesRouter.post('/', roleMiddleware('admin', 'chunhiem'), zValidator('json', noticeSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const created = await createNotice(data, user.userId, user.parishId, ip, userAgent)
  return successResponse(c, created, 201)
})

noticesRouter.delete('/:id', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const success = await deleteNotice(id, user.userId, user.parishId, ip, userAgent)
  if (!success) return errorResponse(c, 'NOT_FOUND', 'Thông báo không tồn tại', 404)
  return successResponse(c, { id, deleted: true })
})

export default noticesRouter
