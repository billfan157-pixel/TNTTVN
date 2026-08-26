import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'
import { users, auditLogs } from '../db/schema.js'
import { eq, and, sql } from 'drizzle-orm'
import { authMiddleware, getSuperAdminId } from '../middleware/auth.js'
import { loginRateLimiter, adminReauthRateLimiter, parentForgotRateLimiter } from '../middleware/security.js'
import { maskPhoneForAudit } from '../utils/auditRedact.js'
import { BCRYPT_COST, consumeDummyPassword, isLegacyCostHash } from '../utils/passwordPolicy.js'
import { generateId } from '../utils/id.js'
import { verifyAdminReauth } from '../services/userService.js'
import { getClientIp } from '../utils/ip.js'
import { isOriginAllowed, resolveAllowedOrigins } from '../utils/originPolicy.js'
import type { JwtPayload } from '../middleware/auth.js'
import { successResponse, errorResponse } from '../utils/response.js'
import type { Context } from 'hono'
import {
  issueTokensWithSession,
  rotateRefreshSession,
  revokeAllSessions,
  revokeSessionByTokenHash,
  hashRefreshToken,
} from '../services/refreshSessionService.js'

const auth = new Hono()

// ─── A-NEW-01/A-NEW-02 (2026-08-10): refresh token CHỈ qua HttpOnly cookie ───
// - Refresh token KHÔNG BAO GIỜ nằm trong JSON body/response (JS không đọc được).
// - Production: SameSite=None; Secure (frontend Vercel gọi API Railway CROSS-SITE;
//   SameSite=Lax không gửi cookie cho POST cross-site → refresh sau reload fail).
// - Bù trừ CSRF (cookie giờ gửi trong cross-site POST): /refresh + /logout kiểm tra
//   Origin header ∈ CORS allowlist (tnttvn.vercel.app + localhost dev).
const REFRESH_COOKIE = 'parish_refresh'
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 ngày = REFRESH_TTL
const IS_PROD = process.env.NODE_ENV === 'production'
// BUSINESS_RULES §10.3: khóa tài khoản sau 5 lần sai mật khẩu (chỉ user không phải admin).
const LOGIN_LOCKOUT_THRESHOLD = 5

function isSecureRequest(c: Context): boolean {
  return c.req.url.startsWith('https://') || c.req.header('x-forwarded-proto') === 'https'
}

function cookieFlags(c: Context): string {
  if (IS_PROD && isSecureRequest(c)) {
    return `HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${REFRESH_COOKIE_MAX_AGE}`
  }
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=${REFRESH_COOKIE_MAX_AGE}`
}

function clearCookieFlags(c: Context): string {
  if (IS_PROD && isSecureRequest(c)) {
    return `HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`
  }
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}

function setRefreshCookie(c: Context, token: string) {
  c.header('Set-Cookie', `${REFRESH_COOKIE}=${encodeURIComponent(token)}; ${cookieFlags(c)}`)
}

function clearRefreshCookie(c: Context) {
  c.header('Set-Cookie', `${REFRESH_COOKIE}=; ${clearCookieFlags(c)}`)
}

// A-NEW-02: chặn CSRF khi cookie SameSite=None (cross-site). Origin có mặt trong mọi
// cross-site POST (browser bắt buộc gửi) — không thuộc allowlist → từ chối. Origin
// rỗng (curl/server-to-server) không phải CSRF → cho qua.
const csrfOriginGuard = createMiddleware(async (c, next) => {
  const origin = c.req.header('Origin')
  if (origin && !isOriginAllowed(origin, resolveAllowedOrigins())) {
    return errorResponse(c, 'FORBIDDEN', 'Origin không được phép', 403)
  }
  await next()
})

function getRefreshCookie(c: Context): string | undefined {
  const header = c.req.header('Cookie') ?? ''
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (key === REFRESH_COOKIE) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim())
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(128),
  // ADR-046 (2026-08-16): lookup theo parish — username chỉ unique trong phạm vi parish.
  // Optional (default 'gia-ton') để backward-compatible: client cũ không gửi vẫn hoạt động.
  parishId: z.string().trim().min(1).max(64).default('gia-ton'),
})

const strongPassword = z
  .string()
  .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
  .max(128)
  .regex(/[A-Z]/, 'Mật khẩu phải có ít nhất 1 chữ HOA (A-Z)')
  .regex(/[0-9]/, 'Mật khẩu phải có ít nhất 1 chữ số (0-9)')
  .regex(/[!@#$%^&*()_+\-=[\]{};:'",.<>?/\\|`~]/, 'Mật khẩu phải có ít nhất 1 ký tự đặc biệt')

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPassword,
})

auth.post('/login', loginRateLimiter, zValidator('json', loginSchema), async (c) => {
  const { username, password, parishId } = c.req.valid('json')
  // ADR-046: lookup scoped theo parish (username unique per-parish từ migration 121).
  // Trước đây lookup toàn cục + limit(1) — sai tenant khi 2 parish dùng chung username.
  const [user] = await db.select().from(users).where(and(eq(users.username, username), eq(users.parishId, parishId))).limit(1)
  if (!user) {
    // A-NEW-19 (2026-08-11): timing-neutral — user không tồn tại vẫn chạy bcrypt.compare
    // với DUMMY_PASSWORD_HASH (cùng cost 12) → thời gian response không lộ username.
    // Trước fix: gap ~126ms (user tồn tại) vs <1ms (not found) — benchmark E2.
    await consumeDummyPassword(password)
    return errorResponse(c, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không chính xác', 401)
  }

  if (user.status === 'LOCKED' && user.id !== getSuperAdminId()) {
    return errorResponse(c, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa do bảo mật. Vui lòng liên hệ Admin!', 403)
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    const ip = getClientIp(c)
    const userAgent = c.req.header('user-agent') || ''
    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.id,
      action: 'LOGIN_FAILED',
      entityType: 'auth',
      entityId: user.id,
      newValue: JSON.stringify({ username: user.username }),
      ip,
      userAgent,
      parishId: user.parishId,
    })

    const userIsAdmin = user.role === 'admin'
    if (!userIsAdmin) {
      // A-NEW-19 (2026-08-11): ATOMIC increment qua SQL expression + returning —
      // fix TOCTOU: trước đây `nextFailed = (user.failedAttempts||0)+1` từ snapshot cũ
      // (SELECT trước bcrypt.compare ~126ms) → N request song song đều tính nextFailed=1
      // → lost update (test: 10 concurrent → failedAttempts=1 thay vì 10, không lock).
      // SQLite UPDATE đơn statement atomic → failed_attempts + 1 tính trên giá trị hiện hành.
      const [updated] = await db.update(users)
        .set({
          failedAttempts: sql`${users.failedAttempts} + 1`,
          status: sql`CASE WHEN ${users.failedAttempts} + 1 >= ${LOGIN_LOCKOUT_THRESHOLD} THEN 'LOCKED' ELSE ${users.status} END`,
        })
        .where(and(eq(users.id, user.id), eq(users.parishId, user.parishId)))
        .returning({ failedAttempts: users.failedAttempts, status: users.status })
      const attempts = updated?.failedAttempts ?? 1
      return errorResponse(c, 'INVALID_CREDENTIALS', `Mật khẩu không chính xác! (Lần thử: ${attempts}/${LOGIN_LOCKOUT_THRESHOLD})`, 401)
    }
    return errorResponse(c, 'INVALID_CREDENTIALS', 'Mật khẩu không chính xác!', 401)
  }

  const now = new Date().toISOString()
  await db.update(users).set({ failedAttempts: 0, lastLoginAt: now }).where(and(eq(users.id, user.id), eq(users.parishId, user.parishId)))

  // A-NEW-19 (2026-08-11): rehash-on-login — hash legacy cost 10 (tạo trước khi upgrade
  // BCRYPT_COST=12) tự migrate lên cost 12 khi user đăng nhập thành công
  // (OWASP Password Storage §Rehashing; bcrypt.compare tự nhận dạng cost từ $2a$10$...$.
  const isLegacyHash = isLegacyCostHash(user.passwordHash)
  if (isLegacyHash) {
    const upgradedHash = await bcrypt.hash(password, BCRYPT_COST)
    await db.update(users).set({ passwordHash: upgradedHash })
      .where(and(eq(users.id, user.id), eq(users.parishId, user.parishId)))
  }

  const tokens = await issueTokensWithSession(
    {
      id: user.id,
      username: user.username,
      role: user.role as JwtPayload['role'],
      parishId: user.parishId,
    },
    user.tokenVersion || 1,
  )

  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''
  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: user.id,
    action: 'LOGIN',
    entityType: 'auth',
    entityId: user.id,
    newValue: JSON.stringify({ username: user.username, role: user.role }),
    ip,
    userAgent,
    parishId: user.parishId,
  })

  setRefreshCookie(c, tokens.refreshToken)
  // A-NEW-01 (2026-08-10): refresh token KHÔNG còn trong JSON response — chỉ cookie.
  return successResponse(c, {
    user: { id: user.id, username: user.username, fullName: user.fullName, phone: user.phone, role: user.role, status: user.status, parishId: user.parishId },
    accessToken: tokens.accessToken,
  })
})

auth.post('/change-password', authMiddleware, zValidator('json', changePasswordSchema), async (c) => {
  const jwtUser = c.get('user') as JwtPayload
  const { currentPassword, newPassword } = c.req.valid('json')

  const [user] = await db.select().from(users).where(and(eq(users.id, jwtUser.userId), eq(users.parishId, jwtUser.parishId))).limit(1)
  if (!user) return errorResponse(c, 'USER_NOT_FOUND', 'Tài khoản không tồn tại', 404)

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    return errorResponse(c, 'INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không chính xác', 400)
  }

  const isSame = await bcrypt.compare(newPassword, user.passwordHash)
  if (isSame) {
    return errorResponse(c, 'SAME_PASSWORD', 'Mật khẩu mới không được trùng với mật khẩu hiện tại', 400)
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)
  const nextVersion = (user.tokenVersion || 1) + 1
  // ADR-021 rewrite (2026-08-08): mật khẩu do CHÍNH USER đặt không bao giờ được
  // lưu dưới dạng reversible — password_encrypted chỉ tồn tại cho password tạm
  // (admin tạo/reset/admin-set). User đổi pass → xóa bản mã hóa (NULL).
  await db.update(users).set({ passwordHash, passwordEncrypted: null, status: 'ACTIVE', mustChangePassword: 0, failedAttempts: 0, lockedUntil: null, tokenVersion: nextVersion }).where(and(eq(users.id, jwtUser.userId), eq(users.parishId, jwtUser.parishId)))
  await revokeAllSessions(jwtUser.userId, jwtUser.parishId)

  const tokens = await issueTokensWithSession(
    {
      id: user.id,
      username: user.username,
      role: user.role as JwtPayload['role'],
      parishId: user.parishId,
    },
    nextVersion,
  )

  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''
  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: jwtUser.userId,
    action: 'CHANGE_PASSWORD',
    entityType: 'user',
    entityId: jwtUser.userId,
    newValue: JSON.stringify({ username: user.username }),
    ip,
    userAgent,
    parishId: jwtUser.parishId,
  })

  setRefreshCookie(c, tokens.refreshToken)
  // A-NEW-01: access token duy nhất trong body (refresh chỉ qua cookie mới set).
  return successResponse(c, { success: true, message: 'Đổi mật khẩu thành công!', accessToken: tokens.accessToken })
})

// ADR-058: ngày sinh + tên trẻ là KBA dễ đoán và là dữ liệu trẻ em, không phải
// yếu tố xác thực. Client cũ nhận 410; phụ huynh dùng kênh Ban Giáo Lý đã xác minh.
auth.post('/parent-reset-password', parentForgotRateLimiter, async (c) => {
  return errorResponse(c, 'PARENT_SELF_RESET_REMOVED', 'Vui lòng liên hệ Ban Giáo Lý qua kênh đã xác minh để được cấp mật khẩu tạm.', 410)
})


// A06 (2026-08-10): admin-change-password thuộc family mật khẩu nhạy cảm — admin
// phải nhập lại mật khẩu HIỆN TẠI của chính mình (verifyAdminReauth, SSOT dùng
// chung với reveal/reset). Sai → 401 INVALID_ADMIN_PASSWORD + audit
// ADMIN_CHANGE_PASSWORD_FAILED; limit 10/60s/IP. Audit thành công bổ sung
// ADMIN_CHANGE_PASSWORD (trước đây endpoint KHÔNG ghi audit).
const adminChangePasswordSchema = z.object({
  userId: z.string(),
  newPassword: strongPassword,
  adminPassword: z.string().min(1, 'Mật khẩu xác nhận Admin không được để trống').max(128),
})

auth.post('/admin-change-password', authMiddleware, adminReauthRateLimiter, zValidator('json', adminChangePasswordSchema), async (c) => {
  const jwtUser = c.get('user') as JwtPayload
  if (jwtUser.role !== 'admin') return errorResponse(c, 'FORBIDDEN', 'Chỉ admin mới có quyền này', 403)

  const { userId, newPassword, adminPassword } = c.req.valid('json')
  // A-NEW-41 (2026-08-12): chỉ chặn admin KHÁC đổi mật khẩu của Admin trưởng.
  // Admin trưởng TỰ đổi mật khẩu chính mình được phép — trước đây chặn tuyệt đối
  // khiến Admin trưởng không thể đổi mật khẩu qua bất kỳ path nào (UserManagementPage
  // "Đặt Mật Khẩu" + SettingsPage) → 403 chết đường. Bảo mật giữ nguyên: vẫn bắt buộc
  // verifyAdminReauth (mật khẩu HIỆN TẠI của chính Admin trưởng) + rate limit + audit.
  if (getSuperAdminId() === userId && jwtUser.userId !== userId) {
    return errorResponse(c, 'FORBIDDEN', 'Không thể đổi mật khẩu của Admin trưởng', 403)
  }

  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''
  const reauthOk = await verifyAdminReauth(jwtUser.userId, adminPassword, jwtUser.parishId, ip, userAgent, userId, 'ADMIN_CHANGE_PASSWORD_FAILED')
  if (!reauthOk) return errorResponse(c, 'INVALID_ADMIN_PASSWORD', 'Mật khẩu xác nhận Admin không chính xác', 401)

  const [target] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.parishId, jwtUser.parishId))).limit(1)
  if (!target) return errorResponse(c, 'USER_NOT_FOUND', 'Tài khoản không tồn tại', 404)

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)
  const nextTargetVersion = (target.tokenVersion || 1) + 1
  await db.update(users).set({ passwordHash, passwordEncrypted: null, status: 'FORCE_PASSWORD_CHANGE', mustChangePassword: 1, failedAttempts: 0, lockedUntil: null, tokenVersion: nextTargetVersion }).where(and(eq(users.id, userId), eq(users.parishId, jwtUser.parishId)))
  await revokeAllSessions(userId, jwtUser.parishId)

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: jwtUser.userId,
    action: 'ADMIN_CHANGE_PASSWORD',
    entityType: 'user',
    entityId: userId,
    newValue: JSON.stringify({ username: target.username }),
    ip,
    userAgent,
    parishId: jwtUser.parishId,
  })

  return successResponse(c, { success: true, message: `Đã đặt lại mật khẩu cho ${target.fullName}` })
})

auth.post('/refresh', csrfOriginGuard, async (c) => {
  // A-NEW-01/A-NEW-02 (2026-08-10): refresh CHỈ qua HttpOnly cookie — body (nếu có)
  // bị IGNORE hoàn toàn. JS không có refresh token nào để gửi/đọc.
  const refreshToken = getRefreshCookie(c)
  if (!refreshToken) {
    return errorResponse(c, 'REFRESH_TOKEN_REQUIRED', 'Thiếu refresh token — vui lòng đăng nhập lại', 401)
  }

  const result = await rotateRefreshSession(refreshToken)
  if (result.status !== 'ok') {
    clearRefreshCookie(c)
    return errorResponse(c, result.code, result.message, 401)
  }
  setRefreshCookie(c, result.refreshToken)
  return successResponse(c, { accessToken: result.accessToken })
})

auth.post('/logout', csrfOriginGuard, authMiddleware, async (c) => {
  const jwtUser = c.get('user') as JwtPayload
  let body: { refreshToken?: string } = {}
  try { body = await c.req.json() } catch { /* body rỗng → thu hồi toàn bộ (backward compatible) */ }

  // A01 Phase 1: luôn xóa cookie refresh (nếu có)
  const cookieToken = getRefreshCookie(c)
  clearRefreshCookie(c)

  const refreshToken = body.refreshToken ?? cookieToken
  if (refreshToken) {
    // Logout riêng phiên này (multi-device): chỉ revoke session của refresh token
    // gửi lên — KHÔNG bump tokenVersion để thiết bị khác vẫn đăng nhập.
    await revokeSessionByTokenHash(hashRefreshToken(refreshToken), jwtUser.parishId)
    return successResponse(c, { success: true, message: 'Đăng xuất thành công' })
  }

  const [user] = await db.select().from(users).where(and(eq(users.id, jwtUser.userId), eq(users.parishId, jwtUser.parishId))).limit(1)
  if (user) {
    const nextVersion = (user.tokenVersion || 1) + 1
    await db.update(users).set({ tokenVersion: nextVersion }).where(and(eq(users.id, user.id), eq(users.parishId, user.parishId)))
    await revokeAllSessions(user.id, user.parishId)
  }
  return successResponse(c, { success: true, message: 'Đăng xuất thành công, tất cả phiên đăng nhập đã được thu hồi' })
})

auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user') as JwtPayload
  const [full] = await db.select().from(users).where(and(eq(users.id, user.userId), eq(users.parishId, user.parishId))).limit(1)
  if (!full) return errorResponse(c, 'NOT_FOUND', 'Tài khoản không tồn tại', 404)
  return successResponse(c, { id: full.id, username: full.username, fullName: full.fullName, phone: full.phone, role: full.role, status: full.status })
})

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  // ADR-039 (2026-08-15): SĐT của PH = identity liên kết con (ADR-026) —
  // chặn tự đổi; chỉ admin qua PUT /api/users/:id/phone (kèm re-auth).
  phone: z.string().trim().regex(/^0\d{9}$/, 'Số điện thoại phải là 10 chữ số bắt đầu bằng 0').optional(),
})

auth.put('/profile', authMiddleware, zValidator('json', updateProfileSchema), async (c) => {
  const jwtUser = c.get('user') as JwtPayload
  const { fullName, phone } = c.req.valid('json')

  const [user] = await db.select().from(users).where(and(eq(users.id, jwtUser.userId), eq(users.parishId, jwtUser.parishId))).limit(1)
  if (!user) return errorResponse(c, 'USER_NOT_FOUND', 'Tài khoản không tồn tại', 404)

  // ADR-039: phụ huynh không tự đổi SĐT — SĐT là khóa liên kết con (mất con /
  // nhìn thấy con người khác nếu đổi sang số của PH khác).
  if (user.role === 'phuhuynh' && phone !== undefined && phone !== (user.phone || '')) {
    return errorResponse(c, 'PHONE_CHANGE_NOT_ALLOWED', 'Số điện thoại của phụ huynh do Ban Giáo Lý quản lý — vui lòng liên hệ quản trị viên để đổi', 403)
  }

  const nextFullName = fullName ?? user.fullName
  const nextPhone = phone !== undefined ? phone : user.phone
  const changedFields: string[] = []
  if (nextFullName !== user.fullName) changedFields.push('fullName')
  if (nextPhone !== (user.phone || '')) changedFields.push('phone')

  await db.update(users)
    .set({
      fullName: nextFullName,
      phone: nextPhone,
    })
    .where(and(eq(users.id, jwtUser.userId), eq(users.parishId, jwtUser.parishId)))

  // AUDIT-F4 (2026-08-22): tự cập nhật profile là thao tác thay đổi identity —
  // trước đây không để vết (staff tự đổi SĐT mình không ai biết). Không ghi PII
  // thô theo A16: chỉ liệt kê field đã đổi + SĐT che giữ 4 số cuối.
  if (changedFields.length > 0) {
    const ip = getClientIp(c)
    const userAgent = c.req.header('user-agent') || ''
    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.id,
      action: 'UPDATE_PROFILE',
      entityType: 'user',
      entityId: user.id,
      newValue: JSON.stringify({
        changedFields,
        ...(changedFields.includes('phone') ? { phoneMasked: maskPhoneForAudit(nextPhone) } : {}),
      }),
      ip,
      userAgent,
      parishId: jwtUser.parishId,
    })
  }

  return successResponse(c, {
    id: user.id,
    username: user.username,
    fullName: nextFullName,
    phone: nextPhone,
    role: user.role,
    status: user.status,
  })
})

export default auth
