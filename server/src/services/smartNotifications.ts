import { enqueueNotification } from './notificationQueue.js'
import { NOTIFICATION_TEMPLATES, buildContext, type TemplateContext } from './templateEngine.js'
import { db } from '../db/index.js'
import { users, students, classes, systemSettings } from '../db/schema.js'
import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { normalizePhone, phoneMatchVariants } from '../utils/phone.js'

const DEFAULT_SUNDAY_MASS_TIME = '08:00'

/**
 * Đọc giờ Thánh Lễ Thiếu Nhi từ parish settings (SSOT) — scheduler và template
 * render đều dùng; mặc định '08:00' khi chưa cấu hình.
 */
export async function getSundayMassTime(parishId: string): Promise<string> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(and(eq(systemSettings.key, 'parish_system_settings'), eq(systemSettings.parishId, parishId)))
      .limit(1)
    if (row?.value) {
      const parsed = JSON.parse(row.value)
      if (typeof parsed.sundayMassTime === 'string' && parsed.sundayMassTime) {
        return parsed.sundayMassTime
      }
    }
  } catch (err) {
    console.error(`[smartNotifications] failed to read sundayMassTime for ${parishId}:`, err)
  }
  return DEFAULT_SUNDAY_MASS_TIME
}

/**
 * Gửi Telegram luôn, nhưng chỉ enqueue web push khi đã có danh sách người nhận
 * tường minh. Không có target IDs thì fail-closed để không broadcast dữ liệu
 * học sinh ra toàn giáo xứ.
 */
function enqueueBoth(
  type: 'absence' | 'report' | 'reminder' | 'info',
  template: string,
  ctx: TemplateContext,
  parishId: string,
  targetUserIds: string[] = [],
): void {
  if (targetUserIds.length > 0) {
    enqueueNotification('telegram', type, template, ctx, parishId, undefined, { telegramUserIds: targetUserIds })
    enqueueNotification('webpush', type, template, ctx, parishId, undefined, { webpushUserIds: targetUserIds })
  } else {
    // Fallback: nếu không xác định được phụ huynh (vd thông báo chung toàn giáo xứ),
    // giữ nguyên hành vi broadcast Telegram admin.
    enqueueNotification('telegram', type, template, ctx, parishId)
  }
}

async function getParentUserIdsForPhones(parishId: string, phones: string[]): Promise<string[]> {
  const phoneVariants = new Set(phones.flatMap(phoneMatchVariants))
  if (phoneVariants.size === 0) return []

  const parentUsers = await db
    .select({ id: users.id, phone: users.phone })
    .from(users)
    .where(and(eq(users.parishId, parishId), ne(users.status, 'INACTIVE'), eq(users.role, 'phuhuynh')))

  return [...new Set(parentUsers
    .filter((user) => user.phone && phoneMatchVariants(user.phone).some((variant) => phoneVariants.has(variant)))
    .map((user) => user.id))]
}

async function getParentUserIdsForStudent(parishId: string, studentId?: string, parentPhone?: string): Promise<string[]> {
  if (parentPhone) return getParentUserIdsForPhones(parishId, [parentPhone])
  if (!studentId) return []

  const [student] = await db
    .select({ parentPhone: students.parentPhone })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
    .limit(1)
  return student ? getParentUserIdsForPhones(parishId, [student.parentPhone]) : []
}

async function getParentUserIdsForClassId(parishId: string, classId: string): Promise<string[]> {
  const children = await db
    .select({ parentPhone: students.parentPhone })
    .from(students)
    .where(and(eq(students.parishId, parishId), eq(students.classId, classId), isNull(students.deletedAt)))
  return getParentUserIdsForPhones(parishId, children.map((child) => child.parentPhone))
}

async function getParentUserIdsForClass(parishId: string, className: string): Promise<string[]> {
  const classRows = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.parishId, parishId), eq(classes.name, className), isNull(classes.deletedAt)))

  if (classRows.length === 0) return []
  if (classRows.length > 1) {
    console.warn(`[smartNotifications] ambiguous class name rejected: ${className}`)
    return []
  }
  return getParentUserIdsForClassId(parishId, classRows[0].id)
}

async function getAllParentUserIds(parishId: string): Promise<string[]> {
  const parentUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.parishId, parishId), ne(users.status, 'INACTIVE'), eq(users.role, 'phuhuynh')))
  return parentUsers.map((user) => user.id)
}

async function resolveRecipients(resolver: () => Promise<string[]>): Promise<string[]> {
  try {
    return await resolver()
  } catch (err) {
    console.error('[smartNotifications] failed to resolve web-push recipients:', err)
    return []
  }
}

export async function notifyAbsence(
  parishId: string,
  studentName: string,
  holyName: string,
  className: string,
  date: string,
  status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused',
  parentName: string,
  parentPhone: string,
  note?: string
): Promise<void> {
  const ctx = buildContext({ studentName, holyName, className, date, parentName, parentPhone, note })
  const webpushUserIds = await resolveRecipients(() => getParentUserIdsForPhones(parishId, [parentPhone]))

  if (status === 'AbsentUnexcused') {
    enqueueBoth('absence', NOTIFICATION_TEMPLATES.absenceUnexcused, ctx, parishId, webpushUserIds)
  } else if (status === 'AbsentExcused') {
    enqueueBoth('absence', NOTIFICATION_TEMPLATES.absenceExcused, ctx, parishId, webpushUserIds)
  }
}

export async function notifyReportCard(
  parishId: string,
  studentName: string,
  holyName: string,
  className: string,
  score: number | string,
  rank: string,
  attendanceRate: number | string,
  attendancePresent: number | string,
  attendanceTotal: number | string,
  studentId?: string,
  parentPhone?: string,
): Promise<void> {
  const ctx = buildContext({
    studentName, holyName, className,
    score, rank,
    attendanceRate, attendancePresent, attendanceTotal,
  })
  const webpushUserIds = await resolveRecipients(() => getParentUserIdsForStudent(parishId, studentId, parentPhone))

  enqueueBoth('report', NOTIFICATION_TEMPLATES.reportCard, ctx, parishId, webpushUserIds)
}

export async function notifyBatchReportCards(
  parishId: string,
  students: Array<{
    studentId?: string
    parentPhone?: string
    studentName: string
    holyName: string
    className: string
    score: number | string
    rank: string
    attendanceRate: number | string
    attendancePresent: number | string
    attendanceTotal: number | string
  }>
): Promise<number> {
  let sent = 0
  for (const s of students) {
    try {
      await notifyReportCard(
        parishId,
        s.studentName, s.holyName, s.className,
        s.score, s.rank,
        s.attendanceRate, s.attendancePresent, s.attendanceTotal,
        s.studentId, s.parentPhone,
      )
      sent++
    } catch (err) {
      console.error(`[smartNotifications] failed to enqueue report card for ${s.studentName} (${s.className}):`, err)
    }
  }
  return sent
}

export async function notifySundayMassReminder(parishId: string): Promise<void> {
  const sundayMassTime = await getSundayMassTime(parishId)
  const ctx = buildContext({ sundayMassTime })
  const webpushUserIds = await resolveRecipients(() => getAllParentUserIds(parishId))
  enqueueBoth('reminder', NOTIFICATION_TEMPLATES.sundayMassReminder, ctx, parishId, webpushUserIds)
}

export async function notifyClassReminder(parishId: string, className: string, date: string, classId?: string): Promise<void> {
  const ctx = buildContext({ className, date })
  const webpushUserIds = await resolveRecipients(() => classId
    ? getParentUserIdsForClassId(parishId, classId)
    : getParentUserIdsForClass(parishId, className))
  enqueueBoth('reminder', NOTIFICATION_TEMPLATES.classReminder, ctx, parishId, webpushUserIds)
}

export async function notifyBatchAbsenceSummary(
  parishId: string,
  date: string,
  totalAbsent: number,
  totalStudents: number,
  namesList: string
): Promise<void> {
  const ctx = buildContext({
    date,
    attendancePresent: totalAbsent,
    attendanceTotal: totalStudents,
    note: namesList,
  })
  const webpushUserIds = await resolveRecipients(() => getAllParentUserIds(parishId))
  enqueueBoth('info', NOTIFICATION_TEMPLATES.batchAbsenceSummary, ctx, parishId, webpushUserIds)
}

/**
 * Danh sách userId của phụ huynh (role phuhuynh) có con trong parish —
 * khớp qua số điện thoại chuẩn hóa (SSOT: CanAccessStudentSpecification).
 * `targetBranch` ('All'/null = toàn giáo xứ) lọc theo chi đoàn của con.
 */
async function getParentUserIds(parishId: string, targetBranch?: string | null): Promise<string[]> {
  const parentUsers = await db
    .select({ id: users.id, phone: users.phone })
    .from(users)
    .where(and(eq(users.parishId, parishId), ne(users.status, 'INACTIVE'), eq(users.role, 'phuhuynh')))

  const userIdByPhone = new Map<string, string>()
  for (const user of parentUsers) {
    if (!user.phone) continue
    for (const variant of phoneMatchVariants(user.phone)) {
      if (!userIdByPhone.has(variant)) userIdByPhone.set(variant, user.id)
    }
  }

  const branchFilter = targetBranch && targetBranch !== 'All'
    ? eq(students.branch, targetBranch as 'ChienCon' | 'AuNhi' | 'ThieuNhi' | 'NghiaSi' | 'HiepSi')
    : undefined
  const children = await db
    .select({ parentPhone: students.parentPhone })
    .from(students)
    .where(and(eq(students.parishId, parishId), isNull(students.deletedAt), branchFilter))

  const userIds = new Set<string>()
  for (const child of children) {
    const userId = userIdByPhone.get(normalizePhone(child.parentPhone))
    if (userId) userIds.add(userId)
  }
  return [...userIds]
}

export async function notifyParishNotice(
  parishId: string,
  title: string,
  content: string,
  author: string,
  targetBranch?: string | null
): Promise<number> {
  let whereConditions = [eq(users.parishId, parishId), ne(users.status, 'INACTIVE'), inArray(users.role, ['admin', 'chunhiem', 'phuta'])]

  const userList = await db.select({ phone: users.phone, fullName: users.fullName, username: users.username, role: users.role })
    .from(users)
    .where(and(...whereConditions))

  let sent = 0
  const phonesNotified = new Set<string>()

  for (const user of userList) {
    if (!user.phone || phonesNotified.has(user.phone)) continue
    phonesNotified.add(user.phone)

    try {
      const noticeCtx = buildContext({ parentPhone: user.phone, studentName: user.fullName })
      enqueueNotification('telegram', 'info', NOTIFICATION_TEMPLATES.parishNotice, { ...noticeCtx, title, content, author }, parishId)
      sent++
    } catch (err) {
      console.error(`[smartNotifications] failed to enqueue parish notice for ${user.fullName}:`, err)
    }
  }

  // Web push CÓ CHỦ ĐÍCH: chỉ gửi tới phụ huynh có con trong targetBranch
  // (hoặc toàn giáo xứ khi 'All'/null) — KHÔNG broadcast toàn parish như cũ.
  try {
    const parentUserIds = await getParentUserIds(parishId, targetBranch)
    if (parentUserIds.length > 0) {
      enqueueNotification('webpush', 'info', NOTIFICATION_TEMPLATES.parishNotice, buildContext({ title, content, author }), parishId, undefined, { webpushUserIds: parentUserIds })
    }
  } catch (err) {
    console.error('[smartNotifications] failed to enqueue parish notice webpush:', err)
  }

  return sent
}
