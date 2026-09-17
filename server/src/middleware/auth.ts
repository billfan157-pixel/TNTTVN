import 'hono'
import { createMiddleware } from 'hono/factory'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import type { ActorContext } from '../types/actor.js'
import { getSuperAdminId, isSuperAdmin } from '../utils/protectedPrincipal.js'
import { getEnforcedDeploymentParishId } from '../utils/deploymentParish.js'
import { resolveJwtSecrets } from '../utils/jwtSecretPolicy.js'
export { getSuperAdminId, isSuperAdmin } from '../utils/protectedPrincipal.js'

// Compatibility exports for routes. Application services import the query
// module directly so their dependency does not point at HTTP middleware.
export { getUserClassIds, checkUserClassAccess } from '../services/classAccessQueryService.js'
declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload
  }
}

// Dev/test keep a deterministic fallback. Production fails closed unless both
// independent HS256 secrets satisfy the documented minimum strength policy.
const { accessSecret: JWT_SECRET, refreshSecret: JWT_REFRESH_SECRET } = resolveJwtSecrets()

const JWT_EXPIRES_IN = '15m'
const REFRESH_EXPIRES_IN = '7d'

export interface JwtPayload extends ActorContext {
  username: string
  tokenVersion?: number
}

// SECURITY (2026-08-11): khai báo TƯỜNG MINH thuật toán HS256 cho cả sign lẫn verify.
// Trước đây dùng mặc định của jsonwebtoken (HS256) — đúng nhưng ngầm định. Khai báo
// rõ ràng:
// 1. Chống regression nếu thư viện đổi default trong tương lai.
// 2. `algorithms` array trong verify chặn algorithm-confusion attack (vd attacker
//    gửi token ký bằng HS256 nhưng claim alg=RS256 → verify từ chối).
// 3. HS256 (HMAC-SHA256) với secret 256-bit (đã rotate A-NEW-07) là đủ mạnh cho
//    kiến trúc single-instance hiện tại. Nếu mở rộng multi-instance/public, cân
//    nhắc RS256/ES256 (asymmetric) — ghi backlog hardening.
const JWT_ALGORITHM = 'HS256' as const

export function generateTokens(payload: JwtPayload) {
  const deploymentParishId = getEnforcedDeploymentParishId()
  if (deploymentParishId && payload.parishId !== deploymentParishId) {
    throw new Error('Cannot issue a token outside the configured deployment parish')
  }
  // jwtid (jti) ngẫu nhiên mỗi lần phát hành: 2 login cùng giây KHÔNG được trùng
  // token (nếu không sha256 hash giống nhau → vi phạm UNIQUE refresh_tokens.token_hash).
  const accessToken = jwt.sign(payload, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: JWT_EXPIRES_IN, jwtid: randomUUID() })
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: REFRESH_EXPIRES_IN, jwtid: randomUUID() })
  return { accessToken, refreshToken }
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as JwtPayload
    const deploymentParishId = getEnforcedDeploymentParishId()
    return deploymentParishId && payload.parishId !== deploymentParishId ? null : payload
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: [JWT_ALGORITHM] }) as JwtPayload
    const deploymentParishId = getEnforcedDeploymentParishId()
    return deploymentParishId && payload.parishId !== deploymentParishId ? null : payload
  } catch {
    return null
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.slice(7).trim()
  const payload = verifyToken(token)
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  const [userDb] = await db.select().from(users).where(and(eq(users.id, payload.userId), eq(users.parishId, payload.parishId))).limit(1)
  // A10 (2026-08-10): trước đây `(status === 'LOCKED' && !isAdmin(payload))` — isAdmin chỉ
  // check role → admin bị LOCKED vẫn PASS middleware (chỉ non-admin bị chặn). Giờ chỉ
  // SUPERADMIN được miễn (không thể bị khóa self-lockout, nhất quán với login users.ts:89
  // và verifyAdminReauth userService.ts:221); mọi LOCKED khác → 401 ngay lập tức.
  if (!userDb || userDb.deletedAt || userDb.status === 'INACTIVE' || (userDb.status === 'LOCKED' && !isSuperAdmin(userDb.id, userDb.parishId, userDb.role)) || (payload.tokenVersion !== undefined && userDb.tokenVersion !== payload.tokenVersion)) {
    return c.json({ error: 'Session invalidated or account locked' }, 401)
  }

  if (userDb.role !== payload.role) {
    return c.json({ error: 'Session role is stale' }, 401)
  }

  if (userDb.status === 'FORCE_PASSWORD_CHANGE') {
    const isAllowed = new Set([
      'POST /api/auth/change-password', 'PUT /api/auth/profile', 'GET /api/auth/me', 'POST /api/auth/logout',
    ]).has(`${c.req.method} ${c.req.path}`)
    if (!isAllowed) {
      return c.json({ error: 'FORCE_PASSWORD_CHANGE', message: 'Tài khoản yêu cầu đổi mật khẩu lần đầu trước khi truy cập hệ thống' }, 403)
    }
  }

  c.set('user', payload)
  await next()
})

export function roleMiddleware(...roles: string[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as JwtPayload
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })
}

export function isAdmin(user: JwtPayload): boolean {
  return user.role === 'admin'
}

export async function isSuperAdminAccount(userId: string, parishId: string): Promise<boolean> {
  const protectedParishId = getEnforcedDeploymentParishId() ?? (process.env.SUPER_ADMIN_PARISH_ID?.trim() || 'gia-ton')
  if (userId !== getSuperAdminId() || parishId !== protectedParishId) return false
  const [account] = await db.select({ role: users.role }).from(users)
    .where(and(eq(users.id, userId), eq(users.parishId, parishId))).limit(1)
  return account?.role === 'admin'
}
