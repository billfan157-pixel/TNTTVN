import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import { getClasses, getClassById, createClass, updateClass, deleteClass } from '../services/classService.js'

const classesRouter = new Hono()
classesRouter.use('*', authMiddleware)

const classSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  branchId: z.string().trim().min(1),
  academicYearId: z.string().trim().min(1),
  room: z.string().trim().max(50).optional(),
})

classesRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const list = await getClasses(user.parishId)
  return listResponse(c, list)
})

classesRouter.get('/branches', async (c) => {
  const user = c.get('user') as JwtPayload
  const { branches } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')
  const { db } = await import('../db/index.js')
  const list = await db.select().from(branches).where(eq(branches.parishId, user.parishId))
  return listResponse(c, list)
})

classesRouter.get('/academic-years', async (c) => {
  const user = c.get('user') as JwtPayload
  const { academicYears } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')
  const { db } = await import('../db/index.js')
  const list = await db.select().from(academicYears).where(eq(academicYears.parishId, user.parishId))
  return listResponse(c, list)
})

classesRouter.get('/:id', async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const result = await getClassById(id, user.parishId)
  if (!result) return errorResponse(c, 'NOT_FOUND', 'Lớp học không tồn tại', 404)
  return successResponse(c, result)
})

classesRouter.post('/', roleMiddleware('admin', 'chunhiem'), zValidator('json', classSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const created = await createClass(data, user.userId, user.parishId, ip, userAgent)
  return successResponse(c, created, 201)
})

classesRouter.put('/:id', roleMiddleware('admin', 'chunhiem'), zValidator('json', classSchema.partial()), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const updated = await updateClass(id, data, user.userId, user.parishId, ip, userAgent)
  if (!updated) return errorResponse(c, 'NOT_FOUND', 'Lớp học không tồn tại', 404)
  return successResponse(c, updated)
})

classesRouter.delete('/:id', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const success = await deleteClass(id, user.userId, user.parishId, ip, userAgent)
  if (!success) return errorResponse(c, 'NOT_FOUND', 'Lớp học không tồn tại', 404)
  return successResponse(c, { id, deleted: true })
})

export default classesRouter
