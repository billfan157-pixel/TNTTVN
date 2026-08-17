import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, getUserClassIds, isAdmin } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { getAttendance } from '../services/attendanceService.js'
import { getStudentsByClassIds } from '../services/studentService.js'

const attendanceRouter = new Hono()
attendanceRouter.use('*', authMiddleware)

const attendanceSchema = z.object({
  studentId: z.string().trim().min(1),
  date: z.string(),
  type: z.enum(['SundayMass', 'CatechismClass']),
  status: z.enum(['Present', 'AbsentExcused', 'AbsentUnexcused']),
  note: z.string().trim().max(500).optional(),
  version: z.coerce.number().int().min(0).optional(),
})

attendanceRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const studentId = c.req.query('studentId')
  const date = c.req.query('date')
  const type = c.req.query('type') as 'SundayMass' | 'CatechismClass' | undefined
  const updatedAfter = c.req.query('updatedAfter')
  if (isAdmin(user)) {
    const list = await getAttendance(user.parishId, studentId, date, type, updatedAfter)
    return listResponse(c, list)
  }
  const classIds = await getUserClassIds(user.userId, user.parishId)
  const { data: studentsInClass } = await getStudentsByClassIds(user.parishId, classIds, updatedAfter)
  const studentIds = studentsInClass.map(s => s.id)
  const list = await getAttendance(user.parishId, studentId, date, type, updatedAfter, studentIds)
  return listResponse(c, list)
})

import { attendanceApplicationService } from '../services/AttendanceApplicationService.js'
import { batchAttendanceApplicationService } from '../services/BatchAttendanceApplicationService.js'
import { VersionConflictError } from '../services/gradeService.js'
import { db } from '../db/index.js'
import { auditLogs } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { errorResponse, sendError, ErrorCode } from '../utils/response.js'

attendanceRouter.post('/', roleMiddleware('admin', 'chunhiem', 'phuta'), zValidator('json', attendanceSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  // ADR-016 (S24): Access check chuyển vào service (cùng tx với write) — đóng TOCTOU.
  const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)

  try {
    const record = await attendanceApplicationService.markAttendance({
      studentId: data.studentId,
      date: data.date,
      type: data.type,
      status: data.status,
      note: data.note,
      version: data.version,
      userId: user.userId,
      parishId: user.parishId,
      allowedClassIds,
    })

    // Audit Logging
    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.userId,
      action: 'MARK_ATTENDANCE',
      entityType: 'attendance',
      entityId: record.id,
      oldValue: null,
      newValue: JSON.stringify(record),
      ip,
      userAgent,
      parishId: user.parishId,
      createdAt: new Date().toISOString(),
    })

    return successResponse(c, record, 201)
  } catch (err: any) {
    if (err instanceof VersionConflictError) {
      // Kèm bản ghi hiện tại để client tự áp dụng (server-wins) thay vì mất mát im lặng.
      return sendError(c, ErrorCode.VERSION_CONFLICT, err.message || 'Bản ghi điểm danh đã bị thay đổi bởi người dùng khác', 409, err.currentGrade)
    }
    const status = err.status || 400
    const code = status === 403 ? 'FORBIDDEN' : status === 409 ? 'VERSION_CONFLICT' : 'MARK_ATTENDANCE_ERROR'
    return errorResponse(c, code, err.message || 'Lỗi khi điểm danh thiếu nhi', status)
  }
})

attendanceRouter.post(
  '/batch',
  roleMiddleware('admin', 'chunhiem', 'phuta'),
  zValidator(
    'json',
    z.object({
      records: z.array(
        z.object({
          studentId: z.string(),
          status: z.enum(['Present', 'AbsentExcused', 'AbsentUnexcused']),
          note: z.string().optional(),
          version: z.coerce.number().int().min(0).optional(),
        }),
      ),
      date: z.string(),
      type: z.enum(['SundayMass', 'CatechismClass']),
    }),
  ),
  async (c) => {
    const user = c.get('user') as JwtPayload
    const { records, date, type } = c.req.valid('json')
    const ip = getClientIp(c)
    const userAgent = c.req.header('user-agent') || ''

    // ADR-016 (S24): Access check chuyển vào BatchAttendanceApplicationService
    // (từng item check trong tx của chính nó) — đóng TOCTOU check-then-write.
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)

    const items = records.map((r) => ({
      studentId: r.studentId,
      date,
      type,
      status: r.status,
      note: r.note,
      version: r.version,
      userId: user.userId,
      parishId: user.parishId,
      allowedClassIds,
    }))

    const batchResult = await batchAttendanceApplicationService.markAttendanceBatch(items, 10, allowedClassIds)

    // Audit Logging for Batch Attendance
    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.userId,
      action: 'BATCH_MARK_ATTENDANCE',
      entityType: 'attendance_batch',
      entityId: `BATCH-ATT-${Date.now()}`,
      oldValue: null,
      newValue: JSON.stringify({
        total: batchResult.total,
        successCount: batchResult.successCount,
        skippedCount: batchResult.skippedCount,
        conflictCount: batchResult.conflictCount,
        errorCount: batchResult.errorCount,
      }),
      ip,
      userAgent,
      parishId: user.parishId,
      createdAt: new Date().toISOString(),
    })

    return successResponse(c, batchResult)
  },
)

export default attendanceRouter
