import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse } from '../utils/response.js'
import { getAttendance, upsertAttendance, upsertAttendanceBatch } from '../services/attendanceService.js'

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
  const type = c.req.query('type') as 'SundayMass' | 'CatechismClass' | undefined
  const updatedAfter = c.req.query('updatedAfter')
  const list = await getAttendance(user.parishId, studentId, date, type, updatedAfter)
  return listResponse(c, list)
})

attendanceRouter.post('/', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', attendanceSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const result = await upsertAttendance(data, user.userId, user.parishId, ip, userAgent)
  return successResponse(c, result, 201)
})

attendanceRouter.post(
  '/batch',
  roleMiddleware('admin', 'chunhiem', 'phuta'),
  zValidator(
    'json',
    z.object({
      records: z.array(
        z.object({
          studentId: z.string(),
          status: z.enum(['Present', 'AbsentExcused', 'AbsentUnexcused']),
          note: z.string().optional(),
        }),
      ),
      date: z.string(),
      type: z.enum(['SundayMass', 'CatechismClass']),
    }),
  ),
  async (c) => {
    const user = c.get('user') as JwtPayload
    const { records, date, type } = c.req.valid('json')
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
    const userAgent = c.req.header('user-agent') || ''

    await upsertAttendanceBatch(date, type, records, user.userId, user.parishId, ip, userAgent)
    return successResponse(c, { count: records.length, success: true })
  },
)

export default attendanceRouter
