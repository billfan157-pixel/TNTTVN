import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import {
  getUsers,
  getUserById,
  createUser,
  updateUserStatus,
  resetUserPassword,
  forceLogoutUser,
} from '../services/userService.js'

const usersRouter = new Hono()
usersRouter.use('*', authMiddleware)

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().optional(),
  role: z.enum(['admin', 'chunhiem', 'phuta', 'phuhuynh']),
  assignedClasses: z.array(z.string()).optional(),
})

usersRouter.get('/', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const list = await getUsers(user.parishId)
  return listResponse(c, list)
})

usersRouter.get('/:id', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const u = await getUserById(id, user.parishId)
  if (!u) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, u)
})

usersRouter.post('/', roleMiddleware('admin'), zValidator('json', createUserSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const created = await createUser(data, user.userId, user.parishId, ip, userAgent)
  return successResponse(c, created, 201)
})

usersRouter.put('/:id/status', roleMiddleware('admin'), zValidator('json', z.object({ status: z.enum(['ACTIVE', 'LOCKED', 'INACTIVE']) })), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const { status } = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const ok = await updateUserStatus(id, status, user.userId, user.parishId, ip, userAgent)
  if (!ok) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, { id, status })
})

usersRouter.post('/:id/reset-password', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const res = await resetUserPassword(id, user.userId, user.parishId, ip, userAgent)
  if (!res) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, res)
})

usersRouter.post('/:id/force-logout', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const ok = await forceLogoutUser(id, user.userId, user.parishId, ip, userAgent)
  if (!ok) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, { id, forcedOut: true })
})

export default usersRouter
