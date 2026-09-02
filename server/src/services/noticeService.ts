import { db, runDbTransaction } from '../db/index.js'
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
  const result = await runDbTransaction(async (tx) => {
    if (data.idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(notices)
        .where(and(eq(notices.idempotencyKey, data.idempotencyKey), eq(notices.parishId, parishId)))
        .limit(1)
      if (existing) return { notice: existing, created: false }
    }

    const id = generateId('NC')
    const now = new Date().toISOString()
    const [created] = await tx.insert(notices).values({
      id,
      ...data,
      idempotencyKey: data.idempotencyKey || null,
      parishId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    }).returning()

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'CREATE',
      entityType: 'notice',
      entityId: id,
      newValue: JSON.stringify({
        priority: data.priority,
        targetBranch: data.targetBranch,
        targetAudience: data.targetAudience,
        date: data.date,
      }),
      ip,
      userAgent,
      parishId,
    })
    return { notice: created, created: true }
  })

  // Delivery is post-commit and best-effort. A provider/queue failure must not
  // turn an already committed, idempotent notice into a false failure/retry.
  if (result.created) {
    await notifyParishNotice(parishId, data.title, data.content, data.author, data.targetBranch ?? undefined, (data as any).targetAudience ?? 'all')
      .catch((error) => console.error('[noticeService] notification enqueue failed:', error))
  }

  return result.notice
}

export async function deleteNotice(id: string, userId: string, parishId: string, ip: string, userAgent: string) {
  return runDbTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(notices)
      .where(and(eq(notices.id, id), eq(notices.parishId, parishId)))
      .limit(1)

    if (!existing) return false

    await tx.delete(notices).where(and(eq(notices.id, id), eq(notices.parishId, parishId)))
    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'DELETE',
      entityType: 'notice',
      entityId: id,
      oldValue: JSON.stringify({
        priority: existing.priority,
        targetBranch: existing.targetBranch,
        targetAudience: existing.targetAudience,
        date: existing.date,
      }),
      ip,
      userAgent,
      parishId,
    })
    return true
  })
}

export async function updateNotice(
  id: string,
  data: Partial<CreateNoticeData>,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string
) {
  return runDbTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(notices)
      .where(and(eq(notices.id, id), eq(notices.parishId, parishId)))
      .limit(1)

    if (!existing) return null

    const now = new Date().toISOString()
    const [updated] = await tx
      .update(notices)
      .set({
        ...data,
        updatedAt: now,
        updatedBy: userId,
      })
      .where(and(eq(notices.id, id), eq(notices.parishId, parishId)))
      .returning()

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'UPDATE',
      entityType: 'notice',
      entityId: id,
      oldValue: JSON.stringify({
        priority: existing.priority,
        targetBranch: existing.targetBranch,
        targetAudience: existing.targetAudience,
        date: existing.date,
      }),
      newValue: JSON.stringify({ changedFields: Object.keys(data).filter(key => key !== 'title' && key !== 'content' && key !== 'author') }),
      ip,
      userAgent,
      parishId,
      createdAt: now,
    })
    return updated
  })
}

