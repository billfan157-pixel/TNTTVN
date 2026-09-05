import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, checkUserClassAccess, getUserClassIds, isAdmin } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { notifyAbsence, notifyBatchReportCards, notifySundayMassReminder, notifyClassReminder } from '../services/smartNotifications.js'
import { isVapidConfigured, getVapidPublicKey } from '../services/webPushService.js'
import { sendAppPushToParish } from '../services/appPushService.js'
import { db, runDbTransaction } from '../db/index.js'
import { pushSubscriptions, nativePushTokens, students, classes, auditLogs } from '../db/schema.js'
import { and, eq, sql, isNull, inArray, or } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { getClientIp } from '../utils/ip.js'
import { successResponse, errorResponse } from '../utils/response.js'
import { isValidIsoDate } from '../utils/date.js'

const notificationsRouter = new Hono()

notificationsRouter.use('*', authMiddleware)
notificationsRouter.use('/smart/*', roleMiddleware('admin', 'chunhiem'))

const subscribeSchema = z.object({
  endpoint: z.string().trim().min(1),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1),
})

const nativeRegistrationSchema = z.object({
  installationId: z.string().trim().uuid(),
  platform: z.enum(['android', 'ios']),
  token: z.string().trim().min(16).max(4096),
})

const nativeUnregisterSchema = z.object({
  installationId: z.string().trim().uuid(),
})

const sendNotificationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  url: z.string().trim().regex(/^\/(?!\/)/, 'URL thông báo phải là đường dẫn nội bộ').max(500).optional(),
})

const absenceSchema = z.object({
  studentName: z.string().trim().min(1).max(200),
  holyName: z.string().trim().min(1).max(200),
  className: z.string().trim().min(1).max(100),
  date: z.string().refine(isValidIsoDate, 'Ngày vắng phải là ngày YYYY-MM-DD có thật'),
  status: z.enum(['Present', 'AbsentExcused', 'AbsentUnexcused']),
  parentName: z.string().trim().min(1).max(200),
  parentPhone: z.string().trim().min(1).max(20),
  note: z.string().trim().max(500).optional(),
})

const reportCardsSchema = z.object({
  students: z.array(z.object({
    studentId: z.string().trim().min(1).max(100),
    parentPhone: z.string().trim().min(1).max(20).optional(),
    studentName: z.string({ required_error: "Thiếu tên thiếu nhi" }).trim().min(1, "Tên thiếu nhi không được để trống").max(200, "Tên quá dài"),
    holyName: z.string({ required_error: "Thiếu tên thánh" }).trim().min(1, "Tên thánh không được để trống").max(200, "Tên thánh quá dài"),
    classId: z.string().trim().min(1).max(100).optional(),
    className: z.string({ required_error: "Thiếu tên lớp" }).trim().min(1, "Tên lớp không được để trống").max(100, "Tên lớp quá dài"),
    score: z.number({ invalid_type_error: "Điểm phải là số" }).min(0, "Điểm không được âm").max(10, "Điểm tối đa 10"),
    rank: z.string({ required_error: "Thiếu xếp loại" }).trim().min(1, "Xếp loại không được để trống").max(50, "Xếp loại quá dài"),
    attendanceRate: z.number({ invalid_type_error: "Tỉ lệ chuyên cần phải là số" }).min(0, "Tỉ lệ không được âm").max(100, "Tỉ lệ tối đa 100%"),
    attendancePresent: z.number({ invalid_type_error: "Số buổi có mặt phải là số" }).min(0, "Số buổi không được âm"),
    attendanceTotal: z.number({ invalid_type_error: "Tổng số buổi phải là số" }).min(0, "Tổng số buổi không được âm"),
  })).min(1, "Phải có ít nhất 1 thiếu nhi để gửi"),
})

const classReminderSchema = z.object({
  classId: z.string().trim().min(1).max(100).optional(),
  className: z.string().trim().min(1).max(100),
  date: z.string().refine(isValidIsoDate, 'Ngày nhắc phải là ngày YYYY-MM-DD có thật'),
})

notificationsRouter.post('/subscribe', zValidator('json', subscribeSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const body = c.req.valid('json')
  await db.insert(pushSubscriptions).values({
    id: generateId('NOT'),
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userId: user.userId,
    parishId: user.parishId,
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: {
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userId: user.userId,
      parishId: user.parishId,
    },
  })
  return successResponse(c, { ok: true })
})

notificationsRouter.post('/native/register', zValidator('json', nativeRegistrationSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const body = c.req.valid('json')
  const now = new Date().toISOString()
  await runDbTransaction(async tx => {
    await tx.delete(nativePushTokens).where(or(
      eq(nativePushTokens.installationId, body.installationId),
      and(eq(nativePushTokens.platform, body.platform), eq(nativePushTokens.token, body.token)),
    ))
    await tx.insert(nativePushTokens).values({
      id: generateId('NPT'),
      installationId: body.installationId,
      platform: body.platform,
      token: body.token,
      userId: user.userId,
      parishId: user.parishId,
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.userId,
      action: 'NATIVE_PUSH_REGISTER',
      entityType: 'native_push_installation',
      entityId: user.userId,
      newValue: JSON.stringify({ platform: body.platform }),
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent') || '',
      parishId: user.parishId,
    })
  })
  return successResponse(c, { ok: true })
})

notificationsRouter.post('/native/unregister', zValidator('json', nativeUnregisterSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { installationId } = c.req.valid('json')
  await runDbTransaction(async tx => {
    await tx.delete(nativePushTokens).where(and(
      eq(nativePushTokens.installationId, installationId),
      eq(nativePushTokens.parishId, user.parishId),
      eq(nativePushTokens.userId, user.userId),
    ))
    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.userId,
      action: 'NATIVE_PUSH_UNREGISTER',
      entityType: 'native_push_installation',
      entityId: user.userId,
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent') || '',
      parishId: user.parishId,
    })
  })
  return successResponse(c, { ok: true })
})

notificationsRouter.post('/unsubscribe', zValidator('json', unsubscribeSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { endpoint } = c.req.valid('json')
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.parishId, user.parishId), eq(pushSubscriptions.userId, user.userId)))
  return successResponse(c, { ok: true })
})

notificationsRouter.post('/send', roleMiddleware('admin'), zValidator('json', sendNotificationSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { title, body, url } = c.req.valid('json')
  // SSOT: fan-out Web Push + native FCM/APNs; mỗi provider tự xóa token chết.
  const result = await sendAppPushToParish(user.parishId, { title, body, url })
  if (!result.configured) {
    return errorResponse(c, 'PUSH_PROVIDER_NOT_CONFIGURED', 'No push provider is configured', 501)
  }

  // AUDIT-F4 (2026-08-22): broadcast toàn giáo xứ ảnh hưởng mọi phụ huynh/staff —
  // phải để vết ai gửi cái gì. Chỉ ghi số liệu + tiêu đề (KHÔNG liệt kê người
  // nhận — A16).
  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: user.userId,
    action: 'NOTIFICATION_SEND',
    entityType: 'notification',
    entityId: 'parish-broadcast',
    newValue: JSON.stringify({ title, sent: result.sent, failed: result.failed, total: result.total, removed: result.removed, skipped: result.skipped }),
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent') || '',
    parishId: user.parishId,
  })

  return successResponse(c, result)
})

notificationsRouter.get('/vapid-public-key', async (c) => {
  if (!isVapidConfigured()) {
    // 200 with configured:false — tránh browser log "Failed to load resource: 501" spam mỗi lần load.
    // Client skip graceful (pushManager debug), không phải lỗi nghiệp vụ. Giữ 501 cho POST /send
    // (hành động tường minh của user) để fail-closed rõ ràng; GET key là best-effort probe nên 200.
    return successResponse(c, { publicKey: null, configured: false })
  }
  return successResponse(c, { publicKey: getVapidPublicKey(), configured: true })
})

notificationsRouter.get('/subscriptions', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const [webCount, nativeCount] = await Promise.all([
    db.select({ count: sql`count(*)` }).from(pushSubscriptions).where(eq(pushSubscriptions.parishId, user.parishId)),
    db.select({ count: sql`count(*)` }).from(nativePushTokens).where(eq(nativePushTokens.parishId, user.parishId)),
  ])
  const web = Number(webCount[0]?.count || 0)
  const native = Number(nativeCount[0]?.count || 0)
  return successResponse(c, { count: web + native, web, native })
})

// ─── Smart Notifications ───

notificationsRouter.post('/smart/absence', zValidator('json', absenceSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const body = c.req.valid('json')

  const [student] = await db.select().from(students).where(and(eq(students.parentPhone, body.parentPhone), eq(students.parishId, user.parishId), isNull(students.deletedAt))).limit(1)
  if (!student) {
    return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy thiếu nhi với số điện thoại phụ huynh này', 404)
  }

  if (!isAdmin(user)) {
    const isAuthorized = await checkUserClassAccess(user.userId, user.parishId, student.classId)
    if (!isAuthorized) {
      return errorResponse(c, 'FORBIDDEN', 'Forbidden — bạn không được phân công quản lý lớp của thiếu nhi này', 403)
    }
  }

  const [cls] = await db.select().from(classes).where(and(eq(classes.id, student.classId), eq(classes.parishId, user.parishId), isNull(classes.deletedAt))).limit(1)
  const effectiveClassName = cls?.name || body.className
  if (cls && cls.name !== body.className) {
    console.warn(`[notifications] className mismatch for student ${student.id}: provided="${body.className}" actual="${cls.name}", using actual`)
  }

  await notifyAbsence(
    user.parishId,
    student.fullName,
    student.holyName,
    effectiveClassName,
    body.date,
    body.status as 'Present' | 'AbsentExcused' | 'AbsentUnexcused',
    body.parentName,
    body.parentPhone,
    body.note,
    student.id,
  )
  return successResponse(c, { ok: true })
})

notificationsRouter.post('/smart/report-cards', zValidator('json', reportCardsSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const body = c.req.valid('json')
  const normalizedStudents = body.students.map((student) => ({ ...student }))

  if (!isAdmin(user)) {
    const userClassIds = await getUserClassIds(user.userId, user.parishId)
    if (!userClassIds.length) {
      return errorResponse(c, 'FORBIDDEN', 'Forbidden — bạn chưa được phân công quản lý lớp nào', 403)
    }
    const userClasses = await db.select({ id: classes.id, name: classes.name }).from(classes).where(and(inArray(classes.id, userClassIds), eq(classes.parishId, user.parishId), isNull(classes.deletedAt)))
    const classesByName = new Map<string, typeof userClasses>()
    for (const cls of userClasses) {
      const key = cls.name.trim().toLowerCase()
      const rows = classesByName.get(key) || []
      rows.push(cls)
      classesByName.set(key, rows)
    }
    for (const st of normalizedStudents) {
      let authorizedClassId = st.classId
      if (st.studentId) {
        const [student] = await db.select({ classId: students.classId }).from(students).where(and(eq(students.id, st.studentId), eq(students.parishId, user.parishId), isNull(students.deletedAt))).limit(1)
        if (!student || !userClassIds.includes(student.classId)) {
          return errorResponse(c, 'FORBIDDEN', `Forbidden — bạn không có quyền gửi báo cáo cho thiếu nhi ${st.studentName}`, 403)
        }
        authorizedClassId = student.classId
      }
      if (authorizedClassId && !userClassIds.includes(authorizedClassId)) {
        return errorResponse(c, 'FORBIDDEN', `Forbidden — bạn không có quyền gửi báo cáo cho lớp ${st.className}`, 403)
      }
      if (!authorizedClassId) {
        const matches = classesByName.get(st.className.trim().toLowerCase()) || []
        if (matches.length !== 1) {
          return errorResponse(c, 'BAD_REQUEST', `Phải cung cấp classId khi tên lớp không duy nhất: ${st.className}`, 400)
        }
        authorizedClassId = matches[0].id
      }
      st.classId = authorizedClassId
    }
  }

  const sent = await notifyBatchReportCards(user.parishId, normalizedStudents)
  return successResponse(c, { sent, total: normalizedStudents.length })
})

notificationsRouter.post('/smart/reminder/sunday', async (c) => {
  const user = c.get('user') as JwtPayload
  await notifySundayMassReminder(user.parishId)
  return successResponse(c, { ok: true })
})

notificationsRouter.post('/smart/reminder/class', zValidator('json', classReminderSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { className, date } = c.req.valid('json')
  let targetClassId = c.req.valid('json').classId

  if (!isAdmin(user)) {
    const userClassIds = await getUserClassIds(user.userId, user.parishId)
    if (!userClassIds.length) {
      return errorResponse(c, 'FORBIDDEN', 'Forbidden — bạn chưa được phân công quản lý lớp nào', 403)
    }
    const userClasses = await db.select({ id: classes.id, name: classes.name }).from(classes).where(and(inArray(classes.id, userClassIds), eq(classes.parishId, user.parishId), isNull(classes.deletedAt)))
    if (targetClassId) {
      if (!userClassIds.includes(targetClassId)) {
        return errorResponse(c, 'FORBIDDEN', `Forbidden — bạn không có quyền gửi nhắc nhở cho lớp ${className}`, 403)
      }
    } else {
      const matches = userClasses.filter(cls => cls.name.trim().toLowerCase() === className.trim().toLowerCase())
      if (matches.length === 0) {
        return errorResponse(c, 'FORBIDDEN', `Forbidden — bạn không có quyền gửi nhắc nhở cho lớp ${className}`, 403)
      }
      if (matches.length > 1) {
        return errorResponse(c, 'BAD_REQUEST', `Phải cung cấp classId khi tên lớp không duy nhất: ${className}`, 400)
      }
      targetClassId = matches[0].id
    }
  } else if (targetClassId) {
    const [target] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(and(eq(classes.id, targetClassId), eq(classes.parishId, user.parishId), isNull(classes.deletedAt))).limit(1)
    if (!target) return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy lớp trong giáo xứ hiện tại', 404)
  }

  await notifyClassReminder(user.parishId, className, date, targetClassId)
  return successResponse(c, { ok: true })
})

export default notificationsRouter
