import { db } from '../db/index.js'
import { notices, auditLogs } from '../db/schema.js'
import { eq, and, desc, gte, or, isNull } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { notifyParishNotice } from './smartNotifications.js'

type CreateNoticeData = Pick<InferInsertModel<typeof notices>, 'title' | 'content' | 'date' | 'author' | 'priority' | 'targetBranch' | 'targetAudience' | 'idempotencyKey'>

export async function getNotices(parishId: string, updatedAfter?: string, limit: number = 50, page: number = 1, targetAudience?: string, userRole?: string) {
  const conditions = [eq(notices.parishId, parishId)]
  if (updatedAfter) {
    conditions.push(gte(notices.updatedAt, updatedAfter))
  }
  // Audience scoping: phuhuynh chỉ thấy all/parents, staff thấy tất cả (admin quản lý)
  if (userRole === 'phuhuynh') {
    // SQLite: target_audience IS NULL (cũ) coi như 'all'
    conditions.push(or(eq(notices.targetAudience, 'all'), eq(notices.targetAudience, 'parents'), isNull(notices.targetAudience)) as any)
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

export async function createNotice(data: CreateNoticeData, userId: string, parishId: string, ip: string, userAgent: string) {
  if (data.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(notices)
      .where(and(eq(notices.idempotencyKey, data.idempotencyKey), eq(notices.parishId, parishId)))
      .limit(1)
    if (existing) {
      return existing
    }
  }

  const id = generateId('NC')
  const now = new Date().toISOString()

  await db.insert(notices).values({
    id,
    ...data,
    idempotencyKey: data.idempotencyKey || null,
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

  // Send notifications to users after successful creation
  await notifyParishNotice(parishId, data.title, data.content, data.author, data.targetBranch ?? undefined, (data as any).targetAudience ?? 'all')

  const [created] = await db.select().from(notices).where(and(eq(notices.id, id), eq(notices.parishId, parishId))).limit(1)
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

export async function updateNotice(
  id: string,
  data: Partial<CreateNoticeData>,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string
) {
  const [existing] = await db
    .select()
    .from(notices)
    .where(and(eq(notices.id, id), eq(notices.parishId, parishId)))
    .limit(1)

  if (!existing) return null

  const now = new Date().toISOString()
  await db
    .update(notices)
    .set({
      ...data,
      updatedAt: now,
      updatedBy: userId,
    })
    .where(and(eq(notices.id, id), eq(notices.parishId, parishId)))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId,
    action: 'UPDATE',
    entityType: 'notice',
    entityId: id,
    oldValue: JSON.stringify(existing),
    newValue: JSON.stringify(data),
    ip,
    userAgent,
    parishId,
    createdAt: now,
  })

  const [updated] = await db.select().from(notices).where(and(eq(notices.id, id), eq(notices.parishId, parishId))).limit(1)
  return updated
}

