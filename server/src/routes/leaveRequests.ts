import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { authMiddleware, roleMiddleware, getUserClassIds, checkUserClassAccess, isAdmin } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { successResponse, errorResponse, listResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { db } from '../db/index.js'
import { leaveRequests, students, classes, attendance, users, auditLogs, telegramLinks } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { getMyChildren } from '../services/parentService.js'
import { sendTelegramMessageToChat } from '../services/telegram.js'

const leaveRequestsRouter = new Hono()
leaveRequestsRouter.use('*', authMiddleware)

const createLeaveRequestSchema = z.object({
  studentId: z.string().min(1, 'studentId không được để trống'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD'),
  sessionTypes: z.array(z.enum(['SundayMass', 'CatechismClass', 'EucharisticAdoration'])).min(1, 'Phải chọn ít nhất một buổi cần xin phép'),
  reason: z.string().trim().min(3, 'Lý do xin nghỉ phải có ít nhất 3 ký tự').max(500),
  parentName: z.string().trim().optional(),
  parentPhone: z.string().trim().optional(),
})

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().trim().max(500).optional(),
})

// 1. POST /api/leave-requests - Tạo đơn xin phép nghỉ
leaveRequestsRouter.post('/', zValidator('json', createLeaveRequestSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const body = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  // Xác thực quyền với học sinh
  const [student] = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      holyName: students.holyName,
      classId: students.classId,
      parentName: students.parentName,
      parentPhone: students.parentPhone,
    })
    .from(students)
    .where(and(eq(students.id, body.studentId), eq(students.parishId, user.parishId)))
    .limit(1)

  if (!student) {
    return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy thông tin thiếu nhi trong giáo xứ', 404)
  }

  let parentName = body.parentName || student.parentName
  let parentPhone = body.parentPhone || student.parentPhone
  let parentId: string | null = null

  if (user.role === 'phuhuynh') {
    parentId = user.userId
    const myChildren = await getMyChildren(user.userId, user.parishId)
    const isMyChild = myChildren.some((child) => child.id === student.id)
    if (!isMyChild) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền nộp đơn xin phép cho thiếu nhi này', 403)
    }

    const [userDb] = await db
      .select({ fullName: users.fullName, phone: users.phone })
      .from(users)
      .where(and(eq(users.id, user.userId), eq(users.parishId, user.parishId)))
      .limit(1)

    if (userDb) {
      parentName = userDb.fullName || parentName
      parentPhone = userDb.phone || parentPhone
    }
  }

  const requestId = generateId('LRQ')
  const now = new Date().toISOString()
  const sessionTypesJson = JSON.stringify(body.sessionTypes)

  await db.insert(leaveRequests).values({
    id: requestId,
    parishId: user.parishId,
    studentId: student.id,
    classId: student.classId,
    parentId,
    parentName,
    parentPhone,
    date: body.date,
    sessionTypes: sessionTypesJson,
    reason: body.reason,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  })

  // Audit log
  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: user.userId,
    action: 'CREATE_LEAVE_REQUEST',
    entityType: 'leave_request',
    entityId: requestId,
    newValue: JSON.stringify({
      studentId: student.id,
      studentName: student.fullName,
      date: body.date,
      sessionTypes: body.sessionTypes,
      reason: body.reason,
    }),
    ip,
    userAgent,
    parishId: user.parishId,
  })

  return successResponse(c, {
    id: requestId,
    studentId: student.id,
    studentName: student.fullName,
    holyName: student.holyName,
    date: body.date,
    sessionTypes: body.sessionTypes,
    reason: body.reason,
    status: 'PENDING',
    createdAt: now,
  }, 201)
})

// 2. GET /api/leave-requests - Lấy danh sách đơn xin nghỉ theo phân quyền
leaveRequestsRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const classIdParam = c.req.query('classId')
  const statusParam = c.req.query('status')
  const dateParam = c.req.query('date')
  const studentIdParam = c.req.query('studentId')

  let allowedClassIds: string[] | null = null
  let allowedStudentIds: string[] | null = null

  if (user.role === 'phuhuynh') {
    const myChildren = await getMyChildren(user.userId, user.parishId)
    allowedStudentIds = myChildren.map((c) => c.id)
    if (allowedStudentIds.length === 0) {
      return listResponse(c, [])
    }
  } else if (!isAdmin(user)) {
    // chunhiem or phuta
    allowedClassIds = await getUserClassIds(user.userId, user.parishId)
    if (allowedClassIds.length === 0) {
      return listResponse(c, [])
    }
  }

  const query = db
    .select({
      id: leaveRequests.id,
      parishId: leaveRequests.parishId,
      studentId: leaveRequests.studentId,
      classId: leaveRequests.classId,
      studentName: students.fullName,
      holyName: students.holyName,
      studentCode: students.code,
      className: classes.name,
      parentName: leaveRequests.parentName,
      parentPhone: leaveRequests.parentPhone,
      date: leaveRequests.date,
      sessionTypes: leaveRequests.sessionTypes,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      reviewedBy: leaveRequests.reviewedBy,
      reviewerName: leaveRequests.reviewerName,
      reviewNote: leaveRequests.reviewNote,
      reviewedAt: leaveRequests.reviewedAt,
      createdAt: leaveRequests.createdAt,
      updatedAt: leaveRequests.updatedAt,
    })
    .from(leaveRequests)
    .innerJoin(students, and(eq(students.id, leaveRequests.studentId), eq(students.parishId, leaveRequests.parishId)))
    .innerJoin(classes, and(eq(classes.id, leaveRequests.classId), eq(classes.parishId, leaveRequests.parishId)))
    .where(and(
      eq(leaveRequests.parishId, user.parishId),
      allowedStudentIds ? inArray(leaveRequests.studentId, allowedStudentIds) : undefined,
      allowedClassIds ? inArray(leaveRequests.classId, allowedClassIds) : undefined,
      classIdParam && classIdParam !== 'all' ? eq(leaveRequests.classId, classIdParam) : undefined,
      statusParam && statusParam !== 'ALL' ? eq(leaveRequests.status, statusParam as any) : undefined,
      dateParam ? eq(leaveRequests.date, dateParam) : undefined,
      studentIdParam ? eq(leaveRequests.studentId, studentIdParam) : undefined,
    ))
    .orderBy(desc(leaveRequests.createdAt))

  const rows = await query

  const formatted = rows.map((r) => {
    let parsedSessionTypes: string[] = []
    try {
      parsedSessionTypes = JSON.parse(r.sessionTypes)
    } catch {
      parsedSessionTypes = [r.sessionTypes]
    }
    return {
      ...r,
      sessionTypes: parsedSessionTypes,
    }
  })

  return listResponse(c, formatted)
})

// 3. GET /api/leave-requests/pending-count - Đếm số đơn chờ duyệt
leaveRequestsRouter.get('/pending-count', async (c) => {
  const user = c.get('user') as JwtPayload
  if (user.role === 'phuhuynh') {
    return successResponse(c, { pendingCount: 0 })
  }

  let allowedClassIds: string[] | null = null
  if (!isAdmin(user)) {
    allowedClassIds = await getUserClassIds(user.userId, user.parishId)
    if (allowedClassIds.length === 0) {
      return successResponse(c, { pendingCount: 0 })
    }
  }

  const rows = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.parishId, user.parishId),
      eq(leaveRequests.status, 'PENDING'),
      allowedClassIds ? inArray(leaveRequests.classId, allowedClassIds) : undefined,
    ))

  return successResponse(c, { pendingCount: rows.length })
})

// 4. PATCH /api/leave-requests/:id/review - Duyệt hoặc Từ chối đơn
leaveRequestsRouter.patch('/:id/review', zValidator('json', reviewSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const requestId = c.req.param('id')
  const { status, reviewNote } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  if (user.role === 'phuhuynh') {
    return errorResponse(c, 'FORBIDDEN', 'Phụ huynh không có quyền duyệt đơn xin nghỉ', 403)
  }

  const [request] = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.parishId, user.parishId)))
    .limit(1)

  if (!request) {
    return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy đơn xin nghỉ', 404)
  }

  if (request.status !== 'PENDING') {
    return errorResponse(c, 'INVALID_STATE', `Đơn xin nghỉ này đã được xử lý (${request.status})`, 400)
  }

  // Kiểm tra quyền đối với lớp học
  if (!isAdmin(user)) {
    const hasAccess = await checkUserClassAccess(user.userId, user.parishId, request.classId)
    if (!hasAccess) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không được phân công quản lý lớp học của thiếu nhi này', 403)
    }
  }

  const now = new Date().toISOString()
  const [userDb] = await db
    .select({ fullName: users.fullName, holyName: users.holyName })
    .from(users)
    .where(and(eq(users.id, user.userId), eq(users.parishId, user.parishId)))
    .limit(1)

  const reviewerName = userDb
    ? [userDb.holyName, userDb.fullName].filter(Boolean).join(' ') || user.username
    : user.username

  let parsedSessionTypes: ('SundayMass' | 'CatechismClass' | 'EucharisticAdoration')[] = []
  try {
    parsedSessionTypes = JSON.parse(request.sessionTypes)
  } catch {
    parsedSessionTypes = ['SundayMass']
  }

  // Cập nhật trạng thái đơn và đồng bộ điểm danh trong 1 transaction
  await db.transaction(async (tx) => {
    await tx
      .update(leaveRequests)
      .set({
        status,
        reviewedBy: user.userId,
        reviewerName,
        reviewNote: reviewNote || null,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.parishId, user.parishId)))

    // Nếu DUYỆT (APPROVED): Tự động đồng bộ sang bảng attendance (AbsentExcused)
    if (status === 'APPROVED') {
      for (const sessionType of parsedSessionTypes) {
        const [existingAtt] = await tx
          .select({ id: attendance.id })
          .from(attendance)
          .where(and(
            eq(attendance.parishId, user.parishId),
            eq(attendance.studentId, request.studentId),
            eq(attendance.date, request.date),
            eq(attendance.type, sessionType),
          ))
          .limit(1)

        const noteText = `[Đơn online] ${request.reason}`

        if (existingAtt) {
          await tx
            .update(attendance)
            .set({
              status: 'AbsentExcused',
              note: noteText,
              updatedBy: user.userId,
              updatedAt: now,
            })
            .where(and(eq(attendance.parishId, user.parishId), eq(attendance.id, existingAtt.id)))
        } else {
          await tx.insert(attendance).values({
            id: generateId('ATT'),
            parishId: user.parishId,
            studentId: request.studentId,
            date: request.date,
            type: sessionType,
            status: 'AbsentExcused',
            note: noteText,
            updatedBy: user.userId,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }
  })

  // Audit log
  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: user.userId,
    action: 'REVIEW_LEAVE_REQUEST',
    entityType: 'leave_request',
    entityId: requestId,
    newValue: JSON.stringify({
      status,
      reviewerName,
      reviewNote,
      sessionTypes: parsedSessionTypes,
    }),
    ip,
    userAgent,
    parishId: user.parishId,
  })

  // Telegram notification nếu phụ huynh đã liên kết
  if (request.parentId) {
    try {
      const links = await db
        .select({ chatId: telegramLinks.chatId })
        .from(telegramLinks)
        .where(and(
          eq(telegramLinks.parishId, user.parishId),
          eq(telegramLinks.userId, request.parentId),
          eq(telegramLinks.status, 'ACTIVE'),
          eq(telegramLinks.notificationsEnabled, 1),
        ))

      for (const link of links) {
        const msg = `🔔 *Thông Báo Đơn Xin Nghỉ*\n\nĐơn xin nghỉ ngày *${request.date}* cho em *${request.parentName}* đã được *${status === 'APPROVED' ? '✅ CHẤP THUẬN' : '❌ TỪ CHỐI'}* bởi *${reviewerName}*.\n${reviewNote ? `Ghi chú: ${reviewNote}` : ''}`
        await sendTelegramMessageToChat(link.chatId, msg).catch(() => {})
      }
    } catch {}
  }

  return successResponse(c, {
    id: requestId,
    status,
    reviewedBy: user.userId,
    reviewerName,
    reviewNote,
    reviewedAt: now,
  })
})

// 5. DELETE /api/leave-requests/:id - Hủy đơn xin nghỉ (khi còn PENDING)
leaveRequestsRouter.delete('/:id', async (c) => {
  const user = c.get('user') as JwtPayload
  const requestId = c.req.param('id')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const [request] = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.parishId, user.parishId)))
    .limit(1)

  if (!request) {
    return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy đơn xin nghỉ', 404)
  }

  if (user.role === 'phuhuynh' && request.parentId !== user.userId) {
    return errorResponse(c, 'FORBIDDEN', 'Bạn chỉ có thể hủy đơn xin nghỉ do chính mình nộp', 403)
  }

  if (user.role !== 'admin' && user.role !== 'phuhuynh') {
    const hasClassAccess = await checkUserClassAccess(user.userId, user.parishId, request.classId)
    if (!hasClassAccess) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không được phân công quản lý lớp học của thiếu nhi này', 403)
    }
  }

  if (request.status !== 'PENDING') {
    return errorResponse(c, 'INVALID_STATE', 'Chỉ có thể hủy đơn đang ở trạng thái chờ duyệt', 400)
  }

  await db
    .update(leaveRequests)
    .set({
      status: 'CANCELLED',
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.parishId, user.parishId)))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: user.userId,
    action: 'CANCEL_LEAVE_REQUEST',
    entityType: 'leave_request',
    entityId: requestId,
    newValue: JSON.stringify({ status: 'CANCELLED' }),
    ip,
    userAgent,
    parishId: user.parishId,
  })

  return successResponse(c, { ok: true, id: requestId, status: 'CANCELLED' })
})

export default leaveRequestsRouter
