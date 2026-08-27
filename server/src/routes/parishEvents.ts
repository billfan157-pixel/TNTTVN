import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { parishEvents, auditLogs } from '../db/schema.js'
import { and, eq, isNull, gte, lte } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { getClientIp } from '../utils/ip.js'
import { successResponse, errorResponse, listResponse } from '../utils/response.js'

const parishEventsRouter = new Hono()
parishEventsRouter.use('*', authMiddleware)

const categoryEnum = z.enum(['FEAST_DAY', 'CAMP', 'TRAINING', 'SACRAMENT', 'RETREAT', 'MEETING', 'OTHER'])

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải định dạng YYYY-MM-DD'),
  title: z.string().trim().min(1, 'Tiêu đề không được để trống').max(200, 'Tiêu đề tối đa 200 ký tự'),
  category: categoryEnum,
  categoryName: z.string().trim().max(100).optional(),
  time: z.string().trim().max(20).optional(),
  location: z.string().trim().max(200).optional(),
})

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải định dạng YYYY-MM-DD').optional(),
  title: z.string().trim().min(1).max(200).optional(),
  category: categoryEnum.optional(),
  categoryName: z.string().trim().max(100).optional(),
  time: z.string().trim().max(20).optional(),
  location: z.string().trim().max(200).optional(),
})

// GET /api/parish-events?from=YYYY-MM-DD&to=YYYY-MM-DD&category=...
parishEventsRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const from = c.req.query('from')
  const to = c.req.query('to')
  const category = c.req.query('category')

  const conditions: any[] = [eq(parishEvents.parishId, user.parishId), isNull(parishEvents.deletedAt)]
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) conditions.push(gte(parishEvents.date, from))
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) conditions.push(lte(parishEvents.date, to))
  if (category && ['FEAST_DAY','CAMP','TRAINING','SACRAMENT','RETREAT','MEETING','OTHER'].includes(category)) {
    conditions.push(eq(parishEvents.category, category as any))
  }

  const rows = await db.select().from(parishEvents).where(and(...conditions)).orderBy(parishEvents.date, parishEvents.createdAt)
  return listResponse(c, rows, rows.length)
})

// POST /api/parish-events
parishEventsRouter.post('/', roleMiddleware('admin', 'chunhiem'), zValidator('json', createSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const body = c.req.valid('json')
  const now = new Date().toISOString()
  const id = generateId('EVT')

  const categoryNames: Record<string, string> = {
    FEAST_DAY: 'Lễ Bổn Mạng',
    CAMP: 'Trại Hè / Sa Mạc',
    TRAINING: 'Huấn Luyện',
    SACRAMENT: 'Bí Tích',
    RETREAT: 'Tĩnh Tâm',
    MEETING: 'Họp Xứ Đoàn',
    OTHER: 'Sự Kiện Khác',
  }

  const row = {
    id,
    parishId: user.parishId,
    date: body.date,
    title: body.title.trim(),
    category: body.category,
    categoryName: body.categoryName?.trim() || categoryNames[body.category] || body.category,
    time: body.time?.trim() || null,
    location: body.location?.trim() || null,
    createdBy: user.userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }

  await db.insert(parishEvents).values(row as any)

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: user.userId,
    action: 'CREATE',
    entityType: 'parish_event',
    entityId: id,
    newValue: JSON.stringify(row),
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent') || '',
    parishId: user.parishId,
  })

  return successResponse(c, row, 201)
})

// PUT /api/parish-events/:id
parishEventsRouter.put('/:id', roleMiddleware('admin', 'chunhiem'), zValidator('json', updateSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(parishEvents).where(and(eq(parishEvents.id, id), eq(parishEvents.parishId, user.parishId), isNull(parishEvents.deletedAt))).limit(1)
  if (!existing) return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy sự kiện', 404)

  const now = new Date().toISOString()
  const updates: any = { updatedAt: now }
  if (body.date !== undefined) updates.date = body.date
  if (body.title !== undefined) updates.title = body.title.trim()
  if (body.category !== undefined) updates.category = body.category
  if (body.categoryName !== undefined) updates.categoryName = body.categoryName.trim()
  if (body.time !== undefined) updates.time = body.time?.trim() || null
  if (body.location !== undefined) updates.location = body.location?.trim() || null

  // Auto-update categoryName if category changed and no explicit name
  if (body.category && !body.categoryName) {
    const names: Record<string,string> = { FEAST_DAY: 'Lễ Bổn Mạng', CAMP: 'Trại Hè / Sa Mạc', TRAINING: 'Huấn Luyện', SACRAMENT: 'Bí Tích', RETREAT: 'Tĩnh Tâm', MEETING: 'Họp Xứ Đoàn', OTHER: 'Sự Kiện Khác' }
    updates.categoryName = names[body.category] || body.category
  }

  await db.update(parishEvents).set(updates).where(and(eq(parishEvents.id, id), eq(parishEvents.parishId, user.parishId)))

  const [updated] = await db.select().from(parishEvents).where(and(eq(parishEvents.id, id), eq(parishEvents.parishId, user.parishId))).limit(1)

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: user.userId,
    action: 'UPDATE',
    entityType: 'parish_event',
    entityId: id,
    oldValue: JSON.stringify(existing),
    newValue: JSON.stringify(updated),
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent') || '',
    parishId: user.parishId,
  })

  return successResponse(c, updated)
})

// DELETE /api/parish-events/:id (soft delete)
parishEventsRouter.delete('/:id', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')

  const [existing] = await db.select().from(parishEvents).where(and(eq(parishEvents.id, id), eq(parishEvents.parishId, user.parishId), isNull(parishEvents.deletedAt))).limit(1)
  if (!existing) return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy sự kiện', 404)

  const now = new Date().toISOString()
  await db.update(parishEvents).set({ deletedAt: now, updatedAt: now }).where(and(eq(parishEvents.id, id), eq(parishEvents.parishId, user.parishId)))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: user.userId,
    action: 'DELETE',
    entityType: 'parish_event',
    entityId: id,
    oldValue: JSON.stringify(existing),
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent') || '',
    parishId: user.parishId,
  })

  return successResponse(c, { deleted: true, id })
})

export default parishEventsRouter
