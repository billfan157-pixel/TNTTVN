import 'hono'
import { createMiddleware } from 'hono/factory'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { db, type DbExecutor } from '../db/index.js'
import { users, catechistAssignments } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload
  }
}

const isTestEnv = process.env.NODE_ENV === 'test' || !!process.env.VITEST
// ADR-016 (S17): Fallback secret CHỈ hợp lệ ở test/dev. Trước đây biểu thức
// `|| true` làm ternary LUÔN đúng → prod thiếu JWT_SECRET vẫn chạy bằng secret
// công khai "default-test-jwt-secret-key-32-chars-long" → ai cũng giả mạo được
// token; throw ở dưới là dead code. Production giờ bắt buộc có JWT_SECRET.
const rawJwtSecret = process.env.JWT_SECRET || (isTestEnv || process.env.NODE_ENV !== 'production' ? 'default-test-jwt-secret-key-32-chars-long' : '')
if (!rawJwtSecret) {
  throw new Error('JWT_SECRET environment variable is required')
}
// JWT_REFRESH_SECRET tách riêng khỏi access secret (defense-in-depth). Production BẮT BUỘC
// set riêng — không fallback về JWT_SECRET; dev/test fallback về rawJwtSecret để chạy mặc định.
const rawRefreshSecret = process.env.JWT_REFRESH_SECRET || (isTestEnv || process.env.NODE_ENV !== 'production' ? rawJwtSecret : '')
if (!rawRefreshSecret) {
  throw new Error('JWT_REFRESH_SECRET environment variable is required in production')
}
const JWT_SECRET: string = rawJwtSecret
const JWT_REFRESH_SECRET: string = rawRefreshSecret

const JWT_EXPIRES_IN = '15m'
const REFRESH_EXPIRES_IN = '7d'

export interface JwtPayload {
  userId: string
  username: string
  role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'
  parishId: string
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
  // jwtid (jti) ngẫu nhiên mỗi lần phát hành: 2 login cùng giây KHÔNG được trùng
  // token (nếu không sha256 hash giống nhau → vi phạm UNIQUE refresh_tokens.token_hash).
  const accessToken = jwt.sign(payload, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: JWT_EXPIRES_IN, jwtid: randomUUID() })
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: REFRESH_EXPIRES_IN, jwtid: randomUUID() })
  return { accessToken, refreshToken }
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as JwtPayload
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: [JWT_ALGORITHM] }) as JwtPayload
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
  if (!userDb || userDb.deletedAt || userDb.status === 'INACTIVE' || (userDb.status === 'LOCKED' && !isSuperAdmin(payload.userId)) || (payload.tokenVersion !== undefined && userDb.tokenVersion !== payload.tokenVersion)) {
    return c.json({ error: 'Session invalidated or account locked' }, 401)
  }

  if (userDb.role !== payload.role) {
    return c.json({ error: 'Session role is stale' }, 401)
  }

  if (userDb.status === 'FORCE_PASSWORD_CHANGE') {
    const p = c.req.path
    const isAllowed = p.endsWith('/change-password') || p.endsWith('/admin-change-password') || p.endsWith('/profile') || p.endsWith('/me') || p.endsWith('/logout') || p.endsWith('/refresh')
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

export function getSuperAdminId(): string {
  const envId = process.env.SUPER_ADMIN_ID?.trim()
  if (envId) return envId
  if (process.env.NODE_ENV === 'production') {
    // Fail-closed: production must set SUPER_ADMIN_ID explicitly — fallback USR-001 predictable
    throw new Error('SUPER_ADMIN_ID must be set in production (no default)')
  }
  return 'USR-001'
}

export function isSuperAdmin(userId: string): boolean {
  return userId === getSuperAdminId()
}

export async function getUserClassIds(userId: string, parishId: string, executor: DbExecutor = db): Promise<string[]> {
  const assignments = await executor
    .select({ classId: catechistAssignments.classId })
    .from(catechistAssignments)
    .where(and(eq(catechistAssignments.userId, userId), eq(catechistAssignments.parishId, parishId)))
  return assignments.map(a => a.classId)
}

export async function checkUserClassAccess(
  userId: string,
  parishId: string,
  targetClassId: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const userRole = (await executor.select({ role: users.role }).from(users).where(and(eq(users.id, userId), eq(users.parishId, parishId))).limit(1))?.[0]?.role
  if (userRole === 'admin') return true
  const classIds = await getUserClassIds(userId, parishId, executor)
  return classIds.includes(targetClassId)
}
