import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse } from '../utils/response.js'
import { getGrades, upsertGrade, upsertGradeBatch } from '../services/gradeService.js'

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
  const updatedAfter = c.req.query('updatedAfter')
  const list = await getGrades(user.parishId, studentId, semester ? Number(semester) : undefined, updatedAfter)
  return listResponse(c, list)
})

gradesRouter.post('/', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', gradeSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const result = await upsertGrade(data, user.userId, user.parishId, ip, userAgent)
  return successResponse(c, result, 201)
})

gradesRouter.post('/batch', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', z.array(gradeSchema)), async (c) => {
  const user = c.get('user') as JwtPayload
  const dataList = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  await upsertGradeBatch(dataList, user.userId, user.parishId, ip, userAgent)
  return successResponse(c, { count: dataList.length, success: true })
})

export default gradesRouter
