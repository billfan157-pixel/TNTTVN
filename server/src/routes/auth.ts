import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { generateTokens, verifyToken, authMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { successResponse, errorResponse } from '../utils/response.js'

const auth = new Hono()

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(128),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
})

auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { username, password } = c.req.valid('json')
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)
  if (!user) {
    return errorResponse(c, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không chính xác', 401)
  }

  // Lock check
  if (user.status === 'LOCKED') {
    return errorResponse(c, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa do bảo mật. Vui lòng liên hệ Admin!', 403)
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    const nextFailed = (user.failedAttempts || 0) + 1
    const nextStatus = nextFailed >= 5 ? 'LOCKED' : user.status
    await db.update(users).set({ failedAttempts: nextFailed, status: nextStatus }).where(eq(users.id, user.id))
    return errorResponse(c, 'INVALID_CREDENTIALS', `Mật khẩu không chính xác! (Lần thử: ${nextFailed}/5)`, 401)
  }

  // Reset failed attempts & update last login
  const now = new Date().toISOString()
  await db.update(users).set({ failedAttempts: 0, lastLoginAt: now }).where(eq(users.id, user.id))

  const tokens = generateTokens({
    userId: user.id,
    username: user.username,
    role: user.role as JwtPayload['role'],
    parishId: user.parishId,
  })

  return successResponse(c, {
    user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role, status: user.status },
    ...tokens,
  })
})

auth.post('/change-password', authMiddleware, zValidator('json', changePasswordSchema), async (c) => {
  const jwtUser = c.get('user') as JwtPayload
  const { currentPassword, newPassword } = c.req.valid('json')

  const [user] = await db.select().from(users).where(eq(users.id, jwtUser.userId)).limit(1)
  if (!user) return errorResponse(c, 'USER_NOT_FOUND', 'Tài khoản không tồn tại', 404)

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    return errorResponse(c, 'INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không chính xác', 400)
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10)
  await db.update(users).set({ passwordHash, status: 'ACTIVE', mustChangePassword: 0 }).where(eq(users.id, user.id))

  return successResponse(c, { success: true, message: 'Đổi mật khẩu thành công!' })
})

auth.post('/refresh', zValidator('json', z.object({ refreshToken: z.string() })), async (c) => {
  const { refreshToken } = c.req.valid('json')
  const payload = verifyToken(refreshToken)
  if (!payload) {
    return errorResponse(c, 'INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ', 401)
  }
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1)
  if (!user || user.status === 'LOCKED') {
    return errorResponse(c, 'USER_LOCKED', 'Tài khoản đã bị khóa', 401)
  }
  const tokens = generateTokens({
    userId: user.id,
    username: user.username,
    role: user.role as JwtPayload['role'],
    parishId: user.parishId,
  })
  return successResponse(c, tokens)
})

auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user') as JwtPayload
  const [full] = await db.select().from(users).where(eq(users.id, user.userId)).limit(1)
  if (!full) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, { id: full.id, username: full.username, fullName: full.fullName, role: full.role, status: full.status })
})

export default auth
