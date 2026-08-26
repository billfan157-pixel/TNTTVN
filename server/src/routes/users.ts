import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, getSuperAdminId } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { adminReauthRateLimiter } from '../middleware/security.js'
import {
  getUsers,
  getCatechists,
  getUserById,
  createUser,
  updateUserStatus,
  updateUserAssignments,
  updateUserPhone,
  resetUserPassword,
  forceLogoutUser,
  verifyAdminReauth,
  getParentProvisionPreview,
  provisionParentAccounts,
} from '../services/userService.js'

const usersRouter = new Hono()
usersRouter.use('*', authMiddleware)

const createUserSchema = z.object({
  // ADR-027 (2026-08-12): username TÙY CHỌN — mặc định server tự sinh
  // `chức vụ_Tên thánh + Họ và tên` từ holyName+fullName; truyền username
  // = override thủ công (khi auto trùng, admin sửa tay). Phụ huynh: username
  // = SĐT chuẩn hóa (ADR-026) — cũng có thể override.
  username: z.string().trim().min(3).max(50).optional(),
  holyName: z.string().trim().min(2).max(100).optional(),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().optional(),
  role: z.enum(['admin', 'chunhiem', 'phuta', 'phuhuynh']),
  assignedClasses: z.array(z.string()).optional(),
})

usersRouter.get('/catechists', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const list = await getCatechists(user.parishId)
  return successResponse(c, list)
})

// ADR-026 (2026-08-12): xem trước danh sách phụ huynh CHƯA có tài khoản
// (khớp students.parentPhone chuẩn hóa; skip SĐT đã gắn tài khoản / không hợp lệ).
// Đặt TRƯỚC GET /:id — không bị path param nuốt.
usersRouter.get('/parent-provision-preview', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const preview = await getParentProvisionPreview(user.parishId)
  return successResponse(c, preview)
})

// ADR-026: tạo tài khoản phụ huynh hàng loạt. Endpoint trả nhiều mật khẩu tạm →
// re-authentication chuẩn A06 (adminPassword + adminReauthRateLimiter + audit failure).
const provisionParentsSchema = z.object({
  adminPassword: z.string().min(1, 'Mật khẩu xác nhận Admin không được để trống').max(128),
})

usersRouter.post('/provision-parents', roleMiddleware('admin'), adminReauthRateLimiter, zValidator('json', provisionParentsSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { adminPassword } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const reauthOk = await verifyAdminReauth(user.userId, adminPassword, user.parishId, ip, userAgent, user.userId, 'PARENT_ACCOUNTS_PROVISION_FAILED')
  if (!reauthOk) return errorResponse(c, 'INVALID_ADMIN_PASSWORD', 'Mật khẩu xác nhận Admin không chính xác', 401)

  const result = await provisionParentAccounts(user.parishId, user.userId, ip, userAgent)
  return successResponse(c, result)
})

usersRouter.get('/', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(10000, Math.max(1, parseInt(c.req.query('limit') || '50', 10)))
  const list = await getUsers(user.parishId, limit, page)
  return listResponse(c, list)
})

usersRouter.get('/:id', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const u = await getUserById(id, user.parishId)
  if (!u) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, u)
})

usersRouter.post('/', roleMiddleware('admin'), zValidator('json', createUserSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  // ADR-016 (users): Username trùng → 409 + message rõ ràng thay vì 500
  // (trước đây UNIQUE constraint failure nổ ra thành Internal Server Error).
  let created: Awaited<ReturnType<typeof createUser>>
  try {
    created = await createUser(data, user.userId, user.parishId, ip, userAgent)
  } catch (err: any) {
    // ADR-027: thiếu Tên Thánh / SĐT phụ huynh → 400 (không phải 500).
    if (err?.code === 'HOLY_NAME_REQUIRED' || err?.code === 'PHONE_REQUIRED') {
      return errorResponse(c, err.code, err.message || 'Thiếu thông tin bắt buộc để tạo username', 400)
    }
    throw err
  }
  if (!created) return errorResponse(c, 'USERNAME_EXISTS', 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác (hoặc sửa Tên Thánh / Họ tên)', 409)
  return successResponse(c, created, 201)
})

usersRouter.put('/:id/status', roleMiddleware('admin'), zValidator('json', z.object({ status: z.enum(['ACTIVE', 'LOCKED', 'INACTIVE']) })), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const { status } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  if (getSuperAdminId() === id) return errorResponse(c, 'FORBIDDEN', 'Không thể thay đổi trạng thái của Admin trưởng', 403)

  const ok = await updateUserStatus(id, status, user.userId, user.parishId, ip, userAgent)
  if (!ok) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, { id, status })
})

// A06 (2026-08-10): reset-password cũng thuộc family thao tác mật khẩu nhạy cảm —
// yêu cầu nhập lại mật khẩu admin (re-authentication) trước khi tạo pass tạm mới,
// cùng chuẩn A05 (verifyAdminReauth + limit 10/60s/IP + audit RESET_PASSWORD_FAILED).
const resetPasswordSchema = z.object({
  adminPassword: z.string().min(1, 'Mật khẩu xác nhận Admin không được để trống').max(128),
})

usersRouter.post('/:id/reset-password', roleMiddleware('admin'), adminReauthRateLimiter, zValidator('json', resetPasswordSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const { adminPassword } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  if (getSuperAdminId() === id) return errorResponse(c, 'FORBIDDEN', 'Không thể đặt lại mật khẩu của Admin trưởng', 403)

  const reauthOk = await verifyAdminReauth(user.userId, adminPassword, user.parishId, ip, userAgent, id, 'RESET_PASSWORD_FAILED')
  if (!reauthOk) return errorResponse(c, 'INVALID_ADMIN_PASSWORD', 'Mật khẩu xác nhận Admin không chính xác', 401)

  const res = await resetUserPassword(id, user.userId, user.parishId, ip, userAgent)
  if (!res) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, res)
})

// ADR-058: mật khẩu tạm chỉ trả đúng một lần khi tạo/reset; server không còn
// lưu bản reversible. Giữ route 410 để client cũ fail rõ ràng, không âm thầm 404.
usersRouter.post('/:id/reveal-password', roleMiddleware('admin'), async (c) => {
  return errorResponse(c, 'PASSWORD_REVEAL_REMOVED', 'Mật khẩu không được lưu để xem lại. Hãy đặt mật khẩu tạm mới nếu cần.', 410)
})

// ADR-039 (2026-08-15): admin đổi SĐT tài khoản — endpoint DUY NHẤT sửa SĐT.
// Phụ huynh KHÔNG tự đổi (SĐT = identity liên kết con — ADR-026; chống mất con /
// nhìn thấy con người khác). A05/A06: re-authentication + adminReauthRateLimiter
// + audit. SĐT phuhuynh cũng là username → đồng bộ kèm (server-side, 409 nếu trùng).
const updateUserPhoneSchema = z.object({
  phone: z.string().trim().regex(/^0\d{9}$/, 'Số điện thoại phải là 10 chữ số bắt đầu bằng 0'),
  adminPassword: z.string().min(1, 'Mật khẩu xác nhận Admin không được để trống').max(128),
})

usersRouter.put('/:id/phone', roleMiddleware('admin'), adminReauthRateLimiter, zValidator('json', updateUserPhoneSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const { phone, adminPassword } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  if (getSuperAdminId() === id) return errorResponse(c, 'FORBIDDEN', 'Không thể đổi SĐT của Admin trưởng', 403)

  const reauthOk = await verifyAdminReauth(user.userId, adminPassword, user.parishId, ip, userAgent, id, 'UPDATE_USER_PHONE_FAILED')
  if (!reauthOk) return errorResponse(c, 'INVALID_ADMIN_PASSWORD', 'Mật khẩu xác nhận Admin không chính xác', 401)

  const result = await updateUserPhone(id, phone, user.userId, user.parishId, ip, userAgent)
  if (result === null) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  if (result.status === 'username_conflict') {
    return errorResponse(c, 'USERNAME_EXISTS', `Số điện thoại ${result.username} đã được dùng bởi tài khoản khác — không thể đổi`, 409)
  }
  return successResponse(c, { id, phone: result.phone, username: result.username, usernameChanged: result.status === 'updated' ? result.usernameChanged : false })
})

usersRouter.put('/:id/assignments', roleMiddleware('admin'), zValidator('json', z.object({ assignedClasses: z.array(z.string()) })), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const { assignedClasses } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  // ADR-026 hardening (2026-08-22): chặn gán lớp cho admin/phuhuynh (chỉ GLV
  // chunhiem/phuta có catechistAssignments). Danh sách rỗng vẫn cho phép (dọn bẩn).
  let ok: boolean | null
  try {
    ok = await updateUserAssignments(id, assignedClasses, user.userId, user.parishId, ip, userAgent)
  } catch (err: any) {
    if (err?.code === 'ASSIGNMENTS_NOT_ALLOWED') {
      return errorResponse(c, 'ASSIGNMENTS_NOT_ALLOWED', err.message || 'Chỉ tài khoản GLV mới được phân công lớp', 400)
    }
    throw err
  }
  if (!ok) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, { id, assignedClasses })
})

usersRouter.post('/:id/force-logout', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  if (getSuperAdminId() === id) return errorResponse(c, 'FORBIDDEN', 'Không thể đăng xuất Admin trưởng', 403)

  const ok = await forceLogoutUser(id, user.userId, user.parishId, ip, userAgent)
  if (!ok) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, { id, forcedOut: true })
})

export default usersRouter
