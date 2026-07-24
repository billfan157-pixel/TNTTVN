import { createMiddleware } from 'hono/factory'
import jwt from 'jsonwebtoken'

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload
  }
}

const JWT_SECRET: string = process.env.JWT_SECRET!
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required')
}
const JWT_EXPIRES_IN = '15m'
const REFRESH_EXPIRES_IN = '7d'

export interface JwtPayload {
  userId: string
  username: string
  role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'
  parishId: string
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
