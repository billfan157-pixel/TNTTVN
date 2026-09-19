import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, runDbTransaction } from '../db/index.js'
import {
  auditLogs,
  catechistAssignments,
  classes,
  feedbackMessages,
  users,
} from '../db/schema.js'
import type { JwtPayload } from '../middleware/auth.js'
import { generateId } from '../utils/id.js'
import { getMyChildren } from './parentService.js'

export type FeedbackTargetType = 'PARISH' | 'HOMEROOM_TEACHER'
export type FeedbackVisibility = 'ANONYMOUS' | 'PUBLIC'
export type FeedbackStatus = 'NEW' | 'READ' | 'ARCHIVED'

export interface FeedbackTargetDTO {
  type: FeedbackTargetType
  userId: string | null
  label: string
  detail: string
}

export interface FeedbackMessageDTO {
  id: string
  targetType: FeedbackTargetType
  targetName: string
  visibility: FeedbackVisibility
  senderName: string
  subject: string
  content: string
  status: FeedbackStatus
  readAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateFeedbackInput {
  targetType: FeedbackTargetType
  targetUserId?: string
  visibility: FeedbackVisibility
  subject: string
  content: string
}

export class FeedbackError extends Error {
  readonly code: string
  readonly status: 400 | 403 | 404

  constructor(
    code: string,
    message: string,
    status: 400 | 403 | 404 = 400,
  ) {
    super(message)
    this.code = code
    this.status = status
  }
}

export async function getFeedbackTargets(user: JwtPayload): Promise<FeedbackTargetDTO[]> {
  const parishTarget: FeedbackTargetDTO = {
    type: 'PARISH',
    userId: null,
    label: 'Ban điều hành Xứ đoàn',
    detail: 'Gửi tới hộp thư chung của Xứ đoàn',
  }

  if (user.role !== 'phuhuynh') return [parishTarget]

  const children = await getMyChildren(user.userId, user.parishId)
  const classIds = [...new Set(children.map(child => child.classId))]
  if (classIds.length === 0) return [parishTarget]

  const rows = await db
    .select({
      userId: users.id,
      fullName: users.fullName,
      className: classes.name,
    })
    .from(catechistAssignments)
    .innerJoin(users, and(
      eq(users.parishId, catechistAssignments.parishId),
      eq(users.id, catechistAssignments.userId),
    ))
    .innerJoin(classes, and(
      eq(classes.parishId, catechistAssignments.parishId),
      eq(classes.id, catechistAssignments.classId),
    ))
    .where(and(
      eq(catechistAssignments.parishId, user.parishId),
      eq(catechistAssignments.roleInClass, 'chunhiem'),
      eq(users.role, 'chunhiem'),
      inArray(catechistAssignments.classId, classIds),
    ))

  const byTeacher = new Map<string, { fullName: string; classes: Set<string> }>()
  for (const row of rows) {
    const existing = byTeacher.get(row.userId) ?? { fullName: row.fullName, classes: new Set<string>() }
    existing.classes.add(row.className)
    byTeacher.set(row.userId, existing)
  }

  return [
    parishTarget,
    ...[...byTeacher.entries()].map(([userId, value]) => ({
      type: 'HOMEROOM_TEACHER' as const,
      userId,
      label: value.fullName,
      detail: `Giáo lý viên chủ nhiệm · ${[...value.classes].sort().join(', ')}`,
    })),
  ]
}

async function userNames(parishId: string, ids: Array<string | null>): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (uniqueIds.length === 0) return new Map()
  const rows = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.parishId, parishId), inArray(users.id, uniqueIds)))
  return new Map(rows.map(row => [row.id, row.fullName]))
}

async function toDtos(rows: Array<typeof feedbackMessages.$inferSelect>, parishId: string): Promise<FeedbackMessageDTO[]> {
  const names = await userNames(parishId, rows.flatMap(row => [row.senderUserId, row.targetUserId]))
  return rows.map(row => ({
    id: row.id,
    targetType: row.targetType,
    targetName: row.targetType === 'PARISH'
      ? 'Ban điều hành Xứ đoàn'
      : names.get(row.targetUserId ?? '') ?? 'Giáo lý viên chủ nhiệm',
    visibility: row.visibility,
    senderName: row.visibility === 'ANONYMOUS'
      ? 'Ẩn danh'
      : names.get(row.senderUserId ?? '') ?? 'Tài khoản không còn hoạt động',
    subject: row.subject,
    content: row.content,
    status: row.status,
    readAt: row.readAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export async function createFeedback(input: CreateFeedbackInput, user: JwtPayload): Promise<FeedbackMessageDTO> {
  if (user.role === 'admin') {
    throw new FeedbackError('FEEDBACK_SENDER_FORBIDDEN', 'Admin chỉ tiếp nhận và xử lý thư gửi về Xứ đoàn', 403)
  }

  let targetUserId: string | null = null
  if (input.targetType === 'HOMEROOM_TEACHER') {
    if (user.role !== 'phuhuynh') {
      throw new FeedbackError('FEEDBACK_TARGET_FORBIDDEN', 'Chỉ phụ huynh được gửi trực tiếp cho giáo lý viên chủ nhiệm', 403)
    }
    if (!input.targetUserId) {
      throw new FeedbackError('FEEDBACK_TARGET_REQUIRED', 'Vui lòng chọn giáo lý viên chủ nhiệm')
    }
    const targets = await getFeedbackTargets(user)
    const allowed = targets.some(target => target.type === 'HOMEROOM_TEACHER' && target.userId === input.targetUserId)
    if (!allowed) {
      throw new FeedbackError('FEEDBACK_TARGET_FORBIDDEN', 'Giáo lý viên không thuộc lớp của con bạn', 403)
    }
    targetUserId = input.targetUserId
  }

  const now = new Date().toISOString()
  const id = generateId('FBK')
  const created = await db.transaction(async tx => {
    const [row] = await tx.insert(feedbackMessages).values({
      id,
      parishId: user.parishId,
      targetType: input.targetType,
      targetUserId,
      visibility: input.visibility,
      senderUserId: input.visibility === 'PUBLIC' ? user.userId : null,
      subject: input.subject.trim(),
      content: input.content.trim(),
      status: 'NEW',
      createdAt: now,
      updatedAt: now,
    }).returning()

    // Công khai thì audit chỉ lưu metadata; nội dung thư không bị nhân đôi vào audit.
    // Ẩn danh cố ý không tạo audit row vì audit.user_id sẽ phá invariant riêng tư.
    if (input.visibility === 'PUBLIC') {
      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: user.userId,
        action: 'PUBLIC_FEEDBACK_SUBMITTED',
        entityType: 'feedback_message',
        entityId: id,
        newValue: JSON.stringify({ targetType: input.targetType }),
        parishId: user.parishId,
        createdAt: now,
      })
    }
    return row
  })

  return (await toDtos([created], user.parishId))[0]
}

export async function listFeedbackInbox(user: JwtPayload): Promise<FeedbackMessageDTO[]> {
  let rows: Array<typeof feedbackMessages.$inferSelect>
  if (user.role === 'admin') {
    rows = await db.select().from(feedbackMessages).where(and(
      eq(feedbackMessages.parishId, user.parishId),
      eq(feedbackMessages.targetType, 'PARISH'),
    )).orderBy(desc(feedbackMessages.createdAt)).limit(200)
  } else if (user.role === 'chunhiem') {
    rows = await db.select().from(feedbackMessages).where(and(
      eq(feedbackMessages.parishId, user.parishId),
      eq(feedbackMessages.targetType, 'HOMEROOM_TEACHER'),
      eq(feedbackMessages.targetUserId, user.userId),
    )).orderBy(desc(feedbackMessages.createdAt)).limit(200)
  } else {
    throw new FeedbackError('FEEDBACK_INBOX_FORBIDDEN', 'Tài khoản không có hộp thư nhận góp ý', 403)
  }
  return toDtos(rows, user.parishId)
}

export async function listPublicSentFeedback(user: JwtPayload): Promise<FeedbackMessageDTO[]> {
  const rows = await db.select().from(feedbackMessages).where(and(
    eq(feedbackMessages.parishId, user.parishId),
    eq(feedbackMessages.visibility, 'PUBLIC'),
    eq(feedbackMessages.senderUserId, user.userId),
  )).orderBy(desc(feedbackMessages.createdAt)).limit(200)
  return toDtos(rows, user.parishId)
}

export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  user: JwtPayload,
): Promise<FeedbackMessageDTO> {
  const now = new Date().toISOString()
  const updated = await runDbTransaction(async tx => {
    const [existing] = await tx.select().from(feedbackMessages).where(and(
      eq(feedbackMessages.parishId, user.parishId),
      eq(feedbackMessages.id, id),
    )).limit(1)
    if (!existing) throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Thư góp ý không tồn tại', 404)

    const canReceive = (user.role === 'admin' && existing.targetType === 'PARISH')
      || (user.role === 'chunhiem' && existing.targetType === 'HOMEROOM_TEACHER' && existing.targetUserId === user.userId)
    if (!canReceive) throw new FeedbackError('FEEDBACK_FORBIDDEN', 'Bạn không có quyền xử lý thư này', 403)

    const [row] = await tx.update(feedbackMessages).set({
      status,
      readAt: status === 'READ' ? existing.readAt ?? now : existing.readAt,
      updatedAt: now,
    }).where(and(
      eq(feedbackMessages.parishId, user.parishId),
      eq(feedbackMessages.id, id),
    )).returning()

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.userId,
      action: 'FEEDBACK_STATUS_UPDATED',
      entityType: 'feedback_message',
      entityId: id,
      oldValue: JSON.stringify({ status: existing.status }),
      newValue: JSON.stringify({ status }),
      parishId: user.parishId,
      createdAt: now,
    })
    return row
  })

  return (await toDtos([updated], user.parishId))[0]
}
