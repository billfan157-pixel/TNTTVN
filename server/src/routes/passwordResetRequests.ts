import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { adminReauthRateLimiter, parentForgotRateLimiter } from '../middleware/security.js'
import { verifyAdminReauth } from '../services/userService.js'
import {
  dismissPasswordResetRequest,
  listPendingPasswordResetRequests,
  PasswordResetRequestError,
  resolvePasswordResetRequest,
  submitParentPasswordResetRequest,
} from '../services/passwordResetRequestService.js'
import { consumeDummyPassword } from '../utils/passwordPolicy.js'
import { getClientIp } from '../utils/ip.js'
import { errorResponse, successResponse } from '../utils/response.js'

const passwordResetRequestsRouter = new Hono()

const publicRequestSchema = z.object({
  phone: z.string().trim().min(8).max(20),
  parishId: z.string().trim().min(1).max(64).default('gia-ton'),
})

const adminPasswordSchema = z.object({
  adminPassword: z.string().min(1, 'Mật khẩu xác nhận Admin không được để trống').max(128),
})

const GENERIC_ACCEPTED_MESSAGE = 'Nếu số điện thoại khớp tài khoản phụ huynh, yêu cầu đã được gửi tới Admin. Ban Giáo Lý sẽ xác minh trước khi cấp mật khẩu tạm qua kênh riêng.'

function handleRequestError(c: Parameters<typeof errorResponse>[0], error: unknown) {
  if (error instanceof PasswordResetRequestError) {
    return errorResponse(c, error.code, error.message, error.status)
  }
  throw error
}

// Public nhưng fail-safe: 5 request/phút/IP, response giống nhau cho số có/không có
// tài khoản và luôn tiêu thụ một bcrypt compare để giảm timing enumeration.
passwordResetRequestsRouter.post('/', parentForgotRateLimiter, zValidator('json', publicRequestSchema), async (c) => {
  const { phone, parishId } = c.req.valid('json')
  await submitParentPasswordResetRequest(phone, parishId, getClientIp(c), c.req.header('user-agent') || '')
  await consumeDummyPassword(phone)
  return successResponse(c, { accepted: true, message: GENERIC_ACCEPTED_MESSAGE }, 202)
})

passwordResetRequestsRouter.use('/admin', authMiddleware)
passwordResetRequestsRouter.use('/admin/*', authMiddleware)
passwordResetRequestsRouter.use('/admin', roleMiddleware('admin'))
passwordResetRequestsRouter.use('/admin/*', roleMiddleware('admin'))

passwordResetRequestsRouter.get('/admin', async (c) => {
  const user = c.get('user') as JwtPayload
  return successResponse(c, await listPendingPasswordResetRequests(user.parishId))
})

passwordResetRequestsRouter.post('/admin/:id/reset', adminReauthRateLimiter, zValidator('json', adminPasswordSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const requestId = c.req.param('id')
  const { adminPassword } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const reauthOk = await verifyAdminReauth(
    user.userId,
    adminPassword,
    user.parishId,
    ip,
    userAgent,
    requestId,
    'PASSWORD_RESET_REQUEST_FAILED',
  )
  if (!reauthOk) return errorResponse(c, 'INVALID_ADMIN_PASSWORD', 'Mật khẩu xác nhận Admin không chính xác', 401)

  try {
    return successResponse(c, await resolvePasswordResetRequest(requestId, user.userId, user.parishId, ip, userAgent))
  } catch (error) {
    return handleRequestError(c, error)
  }
})

passwordResetRequestsRouter.patch('/admin/:id/dismiss', async (c) => {
  const user = c.get('user') as JwtPayload
  try {
    await dismissPasswordResetRequest(
      c.req.param('id'),
      user.userId,
      user.parishId,
      getClientIp(c),
      c.req.header('user-agent') || '',
    )
    return successResponse(c, { dismissed: true })
  } catch (error) {
    return handleRequestError(c, error)
  }
})

export default passwordResetRequestsRouter
