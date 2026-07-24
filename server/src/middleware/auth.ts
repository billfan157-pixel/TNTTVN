import { createMiddleware } from 'hono/factory'
import jwt from 'jsonwebtoken'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload
  }
}

const JWT_SECRET: string = process.env.JWT_SECRET || 'parish_jwt_secret_key_2026_dev'
const JWT_EXPIRES_IN = '15m'
const REFRESH_EXPIRES_IN = '7d'

export interface JwtPayload {
  userId: string
  username: string
  role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'
  parishId: string
  tokenVersion?: number
}

export function generateTokens(payload: JwtPayload) {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
  const refreshToken = jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN })
  return { accessToken, refreshToken }
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return null
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.slice(7)
  const payload = verifyToken(token)
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  // Validate tokenVersion & account status against DB
  const [userDb] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1)
  if (!userDb || userDb.status === 'LOCKED' || (payload.tokenVersion && userDb.tokenVersion !== payload.tokenVersion)) {
    return c.json({ error: 'Session invalidated or account locked' }, 401)
  }

  c.set('user', payload)
  await next()
})

export function roleMiddleware(...roles: string[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as JwtPayload
    if (!roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })
}
