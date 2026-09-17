import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { purgeRateLimiter } from '../middleware/security.js'
import { successResponse, errorResponse } from '../utils/response.js'
import { client } from '../db/index.js'
import { purgeParishData, PURGE_CONFIRM_KEY, DEFAULT_PURGE_VERSION } from '../services/purgeService.js'
import { AdminAuthorizationChangedError, captureAdminReauth } from '../services/userService.js'

const systemRouter = new Hono()

systemRouter.use('*', authMiddleware)

const purgeSchema = z.object({
  password: z.string().min(1).max(128),
  confirmKey: z.string().min(1).max(50),
})

/**
 * PURGE v2.3 — Xóa toàn bộ dữ liệu giáo xứ (chỉ admin, yêu cầu mật khẩu + chuỗi xác nhận).
 * - Mật khẩu sai → 401 INVALID_PASSWORD (không tăng purge version, không xóa gì).
 * - Chuỗi xác nhận sai → 400 INVALID_CONFIRM_KEY.
 * - Giới hạn 10 lần/phút/IP.
 */
systemRouter.post('/purge', roleMiddleware('admin'), purgeRateLimiter, zValidator('json', purgeSchema), async (c) => {
  const jwtUser = c.get('user') as JwtPayload
  const { password, confirmKey } = c.req.valid('json')

  const reauth = await captureAdminReauth(
    jwtUser.userId,
    password,
    jwtUser.parishId,
    c.req.header('x-forwarded-for') || 'unknown',
    c.req.header('user-agent') || '',
    jwtUser.parishId,
    'SYSTEM_PURGE_FAILED',
    jwtUser.tokenVersion,
  )
  if (!reauth) {
    return errorResponse(c, 'INVALID_PASSWORD', 'Mật khẩu không chính xác — không thể xóa dữ liệu', 401)
  }

  if (confirmKey !== PURGE_CONFIRM_KEY) {
    return errorResponse(c, 'INVALID_CONFIRM_KEY', `Chuỗi xác nhận phải là "${PURGE_CONFIRM_KEY}"`, 400)
  }

  try {
    const result = await purgeParishData({ parishId: jwtUser.parishId, userId: jwtUser.userId, reauth })
    return successResponse(c, {
      success: true,
      message: 'Đã xóa toàn bộ dữ liệu giáo xứ thành công!',
      purgeVersion: result.purgeVersion,
      countsBefore: result.countsBefore,
    })
  } catch (err: any) {
    console.error('PURGE FAILED:', err)
    if (err instanceof AdminAuthorizationChangedError) {
      return errorResponse(c, 'SESSION_INVALID', err.message, 401)
    }
    return errorResponse(c, 'PURGE_FAILED', err?.message || 'Xóa dữ liệu thất bại', 400)
  }
})

/**
 * PURGE v2.3 — Trả purge_version hiện tại cho client (kiểm tra ghost data đa thiết bị).
 * Client lưu version local; nếu server lớn hơn → dữ liệu client đã cũ sau purge → reset toàn bộ.
 */
systemRouter.get('/purge-version', async (c) => {
  const user = c.get('user') as JwtPayload
  const settings = await client.execute(
    `SELECT value FROM system_settings WHERE key = 'purge_version' AND parish_id = ?`,
    [user.parishId],
  )
  const version = settings?.rows?.[0]?.value
    ? Number((settings.rows[0] as any).value)
    : DEFAULT_PURGE_VERSION
  return successResponse(c, { purgeVersion: version })
})

export default systemRouter
