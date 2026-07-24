import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db/index.js'
import { attendance, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'

const attendanceRouter = new Hono()
attendanceRouter.use('*', authMiddleware)

const attendanceSchema = z.object({
  studentId: z.string().trim().min(1),
  date: z.string(),
  type: z.enum(['SundayMass', 'CatechismClass']),
  status: z.enum(['Present', 'AbsentExcused', 'AbsentUnexcused']),
  note: z.string().trim().max(500).optional(),
})

attendanceRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const studentId = c.req.query('studentId')
  const date = c.req.query('date')
  const type = c.req.query('type')
  const conditions = [eq(attendance.parishId, user.parishId)]
  if (studentId) conditions.push(eq(attendance.studentId, studentId))
  if (date) conditions.push(eq(attendance.date, date))
  if (type) conditions.push(eq(attendance.type, type as 'SundayMass' | 'CatechismClass'))
  const list = await db.select().from(attendance).where(and(...conditions))
  return c.json(list)
})

attendanceRouter.post('/', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', attendanceSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''
  const data = c.req.valid('json')
  const [existing] = await db.select().from(attendance).where(and(eq(attendance.studentId, data.studentId), eq(attendance.date, data.date), eq(attendance.type, data.type))).limit(1)
  const now = new Date().toISOString()
  if (existing) {
    await db.update(attendance).set({ ...data, updatedAt: now, updatedBy: user.userId }).where(eq(attendance.id, existing.id))
    await db.insert(auditLogs).values({
      id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
      userId: user.userId, action: 'UPDATE', entityType: 'attendance', entityId: existing.id,
      oldValue: JSON.stringify(existing), newValue: JSON.stringify(data), ip, userAgent, parishId: user.parishId,
    })
    return c.json({ ...existing, ...data })
  }
  const id = `AT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
  await db.insert(attendance).values({ id, ...data, parishId: user.parishId, updatedBy: user.userId, createdAt: now, updatedAt: now })
  await db.insert(auditLogs).values({
    id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
    userId: user.userId, action: 'CREATE', entityType: 'attendance', entityId: id,
    newValue: JSON.stringify(data), ip, userAgent, parishId: user.parishId,
  })
  const [created] = await db.select().from(attendance).where(eq(attendance.id, id)).limit(1)
  return c.json(created, 201)
})

attendanceRouter.post('/batch', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', z.object({
  records: z.array(z.object({
    studentId: z.string(), status: z.enum(['Present', 'AbsentExcused', 'AbsentUnexcused']), note: z.string().optional(),
  })),
  date: z.string(),
  type: z.enum(['SundayMass', 'CatechismClass']),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''
  const { records, date, type } = c.req.valid('json')
  const now = new Date().toISOString()
  for (const r of records) {
    const [existing] = await db.select().from(attendance).where(and(eq(attendance.studentId, r.studentId), eq(attendance.date, date), eq(attendance.type, type))).limit(1)
    if (existing) {
      await db.update(attendance).set({ status: r.status, note: r.note, updatedAt: now, updatedBy: user.userId }).where(eq(attendance.id, existing.id))
      await db.insert(auditLogs).values({
        id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
        userId: user.userId, action: 'UPDATE', entityType: 'attendance', entityId: existing.id,
        oldValue: JSON.stringify(existing), newValue: JSON.stringify({ ...r, date, type }), ip, userAgent, parishId: user.parishId,
      })
    } else {
      const id = `AT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
      await db.insert(attendance).values({ id, studentId: r.studentId, date, type, status: r.status, note: r.note, parishId: user.parishId, updatedBy: user.userId, createdAt: now, updatedAt: now })
      await db.insert(auditLogs).values({
        id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
        userId: user.userId, action: 'CREATE', entityType: 'attendance', entityId: id,
        newValue: JSON.stringify({ ...r, date, type }), ip, userAgent, parishId: user.parishId,
      })
    }
  }
  return c.json({ success: true })
})

export default attendanceRouter
