import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { generateTokens, verifyToken, authMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'

const auth = new Hono()

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(128),
})

auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { username, password } = c.req.valid('json')
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }
  const tokens = generateTokens({
    userId: user.id,
    username: user.username,
    role: user.role as JwtPayload['role'],
    parishId: user.parishId,
  })
  return c.json({
    user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
    ...tokens,
  })
})

auth.post('/refresh', zValidator('json', z.object({ refreshToken: z.string() })), async (c) => {
  const { refreshToken } = c.req.valid('json')
  const payload = verifyToken(refreshToken)
  if (!payload) {
    return c.json({ error: 'Invalid refresh token' }, 401)
  }
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1)
  if (!user) {
    return c.json({ error: 'User not found' }, 401)
  }
  const tokens = generateTokens({
    userId: user.id,
    username: user.username,
    role: user.role as JwtPayload['role'],
    parishId: user.parishId,
  })
  return c.json(tokens)
})

auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user') as JwtPayload
  const [full] = await db.select().from(users).where(eq(users.id, user.userId)).limit(1)
  if (!full) return c.json({ error: 'Not found' }, 404)
  return c.json({ id: full.id, username: full.username, fullName: full.fullName, role: full.role })
})

export default auth
