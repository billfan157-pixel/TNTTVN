import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db/index.js'
import { students, auditLogs } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'

const studentsRouter = new Hono()
studentsRouter.use('*', authMiddleware)

const studentSchema = z.object({
  holyName: z.string().trim().min(1).max(100),
  fullName: z.string().trim().min(1).max(200),
  gender: z.enum(['Nam', 'Nữ']),
  dateOfBirth: z.string(),
  baptismDate: z.string().trim().optional(),
  firstCommunionDate: z.string().trim().optional(),
  confirmationDate: z.string().trim().optional(),
  parentName: z.string().trim().min(1).max(200).default(''),
  parentPhone: z.string().trim().min(1).max(20).regex(/^(\+84|0)\d{9,10}$/, 'Số điện thoại không hợp lệ').default(''),
  address: z.string().trim().min(1).max(500).default(''),
  branch: z.enum(['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi']),
  classId: z.string().trim().min(1),
  status: z.enum(['Đang học', 'Nghỉ học', 'Tạm vắng']).default('Đang học'),
  notes: z.string().trim().max(1000).optional(),
})

studentsRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const list = await db.select().from(students).where(eq(students.parishId, user.parishId))
  return c.json(list)
})

studentsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [student] = await db.select().from(students).where(eq(students.id, id)).limit(1)
  if (!student) return c.json({ error: 'Not found' }, 404)
  return c.json(student)
})

studentsRouter.post('/', roleMiddleware('admin', 'chunhiem'), zValidator('json', studentSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const id = `ST-${crypto.randomUUID().slice(0, 8)}`
  const code = `TN2025${Math.floor(100 + Math.random() * 900)}`
  const now = new Date().toISOString()
  await db.insert(students).values({ id, code, ...data, parishId: user.parishId, updatedBy: user.userId, createdAt: now, updatedAt: now })
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''
  await db.insert(auditLogs).values({
    id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
    userId: user.userId, action: 'CREATE', entityType: 'student', entityId: id,
    newValue: JSON.stringify(data), ip, userAgent, parishId: user.parishId,
  })
  const [created] = await db.select().from(students).where(eq(students.id, id)).limit(1)
  return c.json(created, 201)
})

studentsRouter.put('/:id', roleMiddleware('admin', 'chunhiem'), zValidator('json', studentSchema.partial()), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''
  const data = c.req.valid('json')
  const [old] = await db.select().from(students).where(eq(students.id, id)).limit(1)
  if (!old) return c.json({ error: 'Not found' }, 404)
  await db.update(students).set({ ...data, updatedAt: new Date().toISOString(), updatedBy: user.userId }).where(eq(students.id, id))
  await db.insert(auditLogs).values({
    id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
    userId: user.userId, action: 'UPDATE', entityType: 'student', entityId: id,
    oldValue: JSON.stringify(old), newValue: JSON.stringify(data), ip, userAgent, parishId: user.parishId,
  })
  const [updated] = await db.select().from(students).where(eq(students.id, id)).limit(1)
  return c.json(updated)
})

studentsRouter.delete('/:id', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''
  const [old] = await db.select().from(students).where(eq(students.id, id)).limit(1)
  if (!old) return c.json({ error: 'Not found' }, 404)
  await db.delete(students).where(eq(students.id, id))
  await db.insert(auditLogs).values({
    id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
    userId: user.userId, action: 'DELETE', entityType: 'student', entityId: id,
    oldValue: JSON.stringify(old), ip, userAgent, parishId: user.parishId,
  })
  return c.json({ success: true })
})

export default studentsRouter
