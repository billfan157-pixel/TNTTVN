import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db/index.js'
import { notices, auditLogs } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'

const noticesRouter = new Hono()
noticesRouter.use('*', authMiddleware)

const noticeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
  date: z.string(),
  author: z.string().trim().min(1).max(100),
  priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
  targetBranch: z.string().trim().optional(),
})

noticesRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const list = await db.select().from(notices).where(eq(notices.parishId, user.parishId)).orderBy(desc(notices.createdAt))
  return c.json(list)
})

noticesRouter.post('/', roleMiddleware('admin', 'chunhiem'), zValidator('json', noticeSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''
  const data = c.req.valid('json')
  const id = `NC-${Date.now()}`
  const now = new Date().toISOString()
  await db.insert(notices).values({ id, ...data, parishId: user.parishId, updatedBy: user.userId, createdAt: now, updatedAt: now })
  await db.insert(auditLogs).values({
    id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
    userId: user.userId, action: 'CREATE', entityType: 'notice', entityId: id,
    newValue: JSON.stringify(data), ip, userAgent, parishId: user.parishId,
  })
  const [created] = await db.select().from(notices).where(eq(notices.id, id)).limit(1)
  return c.json(created, 201)
})

noticesRouter.delete('/:id', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''
  const id = c.req.param('id')
  const [old] = await db.select().from(notices).where(eq(notices.id, id)).limit(1)
  if (!old) return c.json({ error: 'Not found' }, 404)
  await db.delete(notices).where(eq(notices.id, id))
  await db.insert(auditLogs).values({
    id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
    userId: user.userId, action: 'DELETE', entityType: 'notice', entityId: id,
    oldValue: JSON.stringify(old), ip, userAgent, parishId: user.parishId,
  })
  return c.json({ success: true })
})

export default noticesRouter
