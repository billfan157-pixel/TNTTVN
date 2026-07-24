import { db } from '../db/index.js'
import { notices, auditLogs } from '../db/schema.js'
import { eq, and, desc, gte } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

export async function getNotices(parishId: string, updatedAfter?: string, limit: number = 50, page: number = 1) {
  const conditions = [eq(notices.parishId, parishId)]
  if (updatedAfter) {
    conditions.push(gte(notices.updatedAt, updatedAfter))
  }
  const offset = (page - 1) * limit
  return db
    .select()
    .from(notices)
    .where(and(...conditions))
    .orderBy(desc(notices.createdAt))
    .limit(limit)
    .offset(offset)
}

export async function createNotice(data: any, userId: string, parishId: string, ip: string, userAgent: string) {
  const id = generateId('NC')
  const now = new Date().toISOString()

  await db.insert(notices).values({
    id,
    ...data,
    parishId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'CREATE',
    entityType: 'notice',
    entityId: id,
    newValue: JSON.stringify(data),
    ip,
    userAgent,
    parishId,
  })

  const [created] = await db.select().from(notices).where(eq(notices.id, id)).limit(1)
  return created
}

export async function deleteNotice(id: string, userId: string, parishId: string, ip: string, userAgent: string) {
  const [existing] = await db
    .select()
    .from(notices)
    .where(and(eq(notices.id, id), eq(notices.parishId, parishId)))
    .limit(1)

  if (!existing) return false

  await db.delete(notices).where(and(eq(notices.id, id), eq(notices.parishId, parishId)))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'DELETE',
    entityType: 'notice',
    entityId: id,
    oldValue: JSON.stringify(existing),
    ip,
    userAgent,
    parishId,
  })

  return true
}
