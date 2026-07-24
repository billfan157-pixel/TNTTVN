import { Hono } from 'hono'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { auditLogs, users } from '../db/schema.js'
import { eq, desc, and, sql } from 'drizzle-orm'

const auditLogsRouter = new Hono()
auditLogsRouter.use('*', authMiddleware)
auditLogsRouter.use('*', roleMiddleware('admin'))

auditLogsRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50')))
  const offset = (page - 1) * limit

  const userId = c.req.query('userId')
  const action = c.req.query('action')
  const entityType = c.req.query('entityType')
  const startDate = c.req.query('startDate')
  const endDate = c.req.query('endDate')

  // Build conditions
  const conditions = [eq(auditLogs.parishId, user.parishId)]
  if (userId) conditions.push(eq(auditLogs.userId, userId))
  if (action) conditions.push(eq(auditLogs.action, action))
  if (entityType) conditions.push(eq(auditLogs.entityType, entityType))

  const where = and(...conditions)

  // Get total count
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where)
  const total = countResult[0]?.count || 0

  // Get paginated results with user info
  const logs = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      userName: users.fullName,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      oldValue: auditLogs.oldValue,
      newValue: auditLogs.newValue,
      ip: auditLogs.ip,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset)

  return c.json({
    success: true,
    data: logs,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
})

export default auditLogsRouter
