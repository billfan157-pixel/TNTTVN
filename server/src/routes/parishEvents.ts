import { Hono } from 'hono'
import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { parishEvents } from '../db/schema.js'
import { errorResponse, listResponse } from '../utils/response.js'
import { isValidIsoDate } from '../utils/date.js'

const parishEventsRouter = new Hono()
parishEventsRouter.use('*', authMiddleware)

// Calendar is a projection owned by Operations. Every authenticated parish role
// may read it, but no caller may mutate the projection through this route.
parishEventsRouter.get('/', async c => {
  const user = c.get('user') as JwtPayload
  const from = c.req.query('from')
  const to = c.req.query('to')
  const category = c.req.query('category')
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidIsoDate(value)
  if ((from && !validDate(from)) || (to && !validDate(to))) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Ngày phải tồn tại và có định dạng YYYY-MM-DD.', 400)
  }
  const categories = ['FEAST_DAY', 'CAMP', 'TRAINING', 'SACRAMENT', 'RETREAT', 'MEETING', 'OTHER'] as const
  if (category && !categories.includes(category as typeof categories[number])) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Loại sự kiện không hợp lệ.', 400)
  }
  const conditions: any[] = [eq(parishEvents.parishId, user.parishId), isNull(parishEvents.deletedAt)]
  if (from) conditions.push(gte(parishEvents.date, from))
  if (to) conditions.push(lte(parishEvents.date, to))
  if (category) conditions.push(eq(parishEvents.category, category as typeof categories[number]))
  const rows = await db.select().from(parishEvents).where(and(...conditions)).orderBy(parishEvents.date, parishEvents.createdAt)
  return listResponse(c, rows, rows.length)
})

const readOnly = (c: any) => errorResponse(c, 'CALENDAR_READ_ONLY', 'Lịch chỉ đọc; hãy tạo hoặc chỉnh sửa sự kiện tại trang Công việc.', 405)
parishEventsRouter.post('/', readOnly)
parishEventsRouter.put('/:id', readOnly)
parishEventsRouter.delete('/:id', readOnly)

export default parishEventsRouter
