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
  scoreOral: z.number().min(0).max(10).nullable().optional(),
  score15m: z.number().min(0).max(10).nullable().optional(),
  score1Period: z.number().min(0).max(10).nullable().optional(),
  scoreMidterm: z.number().min(0).max(10).nullable().optional(),
  scoreFinal: z.number().min(0).max(10).nullable().optional(),
  comments: z.string().trim().max(500).optional(),
})

gradesRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const updatedAfter = c.req.query('updatedAfter')
  const list = await getGrades(user.parishId, updatedAfter)
  return listResponse(c, list)
})

gradesRouter.post('/', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', gradeSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const result = await upsertGrade(data, user.userId, user.parishId, ip, userAgent)
  return successResponse(c, result)
})

gradesRouter.post('/batch', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', z.object({ grades: z.array(gradeSchema) })), async (c) => {
  const user = c.get('user') as JwtPayload
  const { grades: gradeList } = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const results = await upsertGradeBatch(gradeList, user.userId, user.parishId, ip, userAgent)
  return successResponse(c, { batchSaved: results })
})

export default gradesRouter
