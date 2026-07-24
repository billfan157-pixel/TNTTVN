import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db/index.js'
import { grades, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'

const gradesRouter = new Hono()
gradesRouter.use('*', authMiddleware)

const gradeSchema = z.object({
  studentId: z.string().trim().min(1),
  academicYear: z.string().trim().default('2025 - 2026'),
  semester: z.number().int().min(1).max(2),
  scoreOral: z.number().nullable().min(0).max(10).optional(),
  score15m: z.number().nullable().min(0).max(10).optional(),
  score1Period: z.number().nullable().min(0).max(10).optional(),
  scoreMidterm: z.number().nullable().min(0).max(10).optional(),
  scoreFinal: z.number().nullable().min(0).max(10).optional(),
  comments: z.string().trim().max(500).optional(),
})

gradesRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const studentId = c.req.query('studentId')
  const semester = c.req.query('semester')
  const conditions = [eq(grades.parishId, user.parishId)]
  if (studentId) conditions.push(eq(grades.studentId, studentId))
  if (semester) conditions.push(eq(grades.semester, Number(semester)))
  const list = await db.select().from(grades).where(and(...conditions))
  return c.json(list)
})

gradesRouter.post('/', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', gradeSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''
  const data = c.req.valid('json')
  const [existing] = await db.select().from(grades).where(and(eq(grades.studentId, data.studentId), eq(grades.semester, data.semester), eq(grades.academicYear, data.academicYear))).limit(1)
  const now = new Date().toISOString()
  if (existing) {
    await db.update(grades).set({ ...data, updatedAt: now, updatedBy: user.userId }).where(eq(grades.id, existing.id))
    await db.insert(auditLogs).values({
      id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
      userId: user.userId, action: 'UPDATE', entityType: 'grade', entityId: existing.id,
      oldValue: JSON.stringify(existing), newValue: JSON.stringify(data), ip, userAgent, parishId: user.parishId,
    })
    const [updated] = await db.select().from(grades).where(eq(grades.id, existing.id)).limit(1)
    return c.json(updated)
  }
  const id = `GR-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
  await db.insert(grades).values({ id, ...data, parishId: user.parishId, updatedBy: user.userId, createdAt: now, updatedAt: now })
  await db.insert(auditLogs).values({
    id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
    userId: user.userId, action: 'CREATE', entityType: 'grade', entityId: id,
    newValue: JSON.stringify(data), ip, userAgent, parishId: user.parishId,
  })
  const [created] = await db.select().from(grades).where(eq(grades.id, id)).limit(1)
  return c.json(created, 201)
})

gradesRouter.post('/batch', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', z.array(gradeSchema)), async (c) => {
  const user = c.get('user') as JwtPayload
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''
  const dataList = c.req.valid('json')
  const now = new Date().toISOString()
  for (const data of dataList) {
    const [existing] = await db.select().from(grades).where(and(eq(grades.studentId, data.studentId), eq(grades.semester, data.semester), eq(grades.academicYear, data.academicYear))).limit(1)
    if (existing) {
      await db.update(grades).set({ ...data, updatedAt: now, updatedBy: user.userId }).where(eq(grades.id, existing.id))
      await db.insert(auditLogs).values({
        id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
        userId: user.userId, action: 'UPDATE', entityType: 'grade', entityId: existing.id,
        oldValue: JSON.stringify(existing), newValue: JSON.stringify(data), ip, userAgent, parishId: user.parishId,
      })
    } else {
      const id = `GR-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
      await db.insert(grades).values({ id, ...data, parishId: user.parishId, updatedBy: user.userId, createdAt: now, updatedAt: now })
      await db.insert(auditLogs).values({
        id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
        userId: user.userId, action: 'CREATE', entityType: 'grade', entityId: id,
        newValue: JSON.stringify(data), ip, userAgent, parishId: user.parishId,
      })
    }
  }
  return c.json({ success: true })
})

export default gradesRouter
