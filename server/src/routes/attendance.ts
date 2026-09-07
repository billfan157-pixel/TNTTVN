import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, getUserClassIds, isAdmin } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { getAttendance } from '../services/attendanceService.js'
import { getStudentIdsForClasses, getAcademicReadStudentIds, academicReadScope } from '../services/classAccessQueryService.js'
import { isValidIsoDate } from '../utils/date.js'

const attendanceRouter = new Hono()
attendanceRouter.use('*', authMiddleware)

const attendanceDateSchema = z.string().refine(isValidIsoDate, 'Ngày điểm danh phải là ngày YYYY-MM-DD có thật')

const attendanceSchema = z.object({
  studentId: z.string().trim().min(1),
  date: attendanceDateSchema,
  type: z.enum(['SundayMass', 'CatechismClass']),
  status: z.enum(['Present', 'AbsentExcused', 'AbsentUnexcused']),
  note: z.string().trim().max(500).optional(),
  version: z.coerce.number().int().min(0).optional(),
})

attendanceRouter.get('/', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  const user = c.get('user') as JwtPayload
  const studentId = c.req.query('studentId')
  const date = c.req.query('date')
  const type = c.req.query('type') as 'SundayMass' | 'CatechismClass' | undefined
  const updatedAfter = c.req.query('updatedAfter')
  if (c.req.query('includeScope') === 'true') {
    const result = await runDbTransaction(async tx => {
      const ids = await getAcademicReadStudentIds(user.userId, user.parishId, { role: user.role, epoch: user.tokenVersion }, tx)
      const scope = academicReadScope(user.parishId, user.userId, ids, null)
      const mode = updatedAfter && c.req.query('scopeRevision') === scope.revision ? 'delta' : 'full'
      // Sync snapshot is complete within scope: ignore UI student/date/type filters.
      const records = await getAttendance(user.parishId, undefined, undefined, undefined, mode === 'delta' ? updatedAfter : undefined, ids, tx)
      return { records, scope, mode }
    })
    return successResponse(c, result)
  }
  if (isAdmin(user)) {
    const list = await getAttendance(user.parishId, studentId, date, type, updatedAfter)
    return listResponse(c, list)
  }
  const classIds = await getUserClassIds(user.userId, user.parishId)
  const studentIds = await getStudentIdsForClasses(user.parishId, classIds)
  const list = await getAttendance(user.parishId, studentId, date, type, updatedAfter, studentIds)
  return listResponse(c, list)
})

import { attendanceApplicationService } from '../services/AttendanceApplicationService.js'
import { batchAttendanceApplicationService } from '../services/BatchAttendanceApplicationService.js'
import { VersionConflictError } from '../domain/errors.js'
import { db, runDbTransaction } from '../db/index.js'
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
      expected: { role: user.role, epoch: user.tokenVersion },
      ip,
      userAgent,
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
      // Cap tường minh chống DoS — một lớp ~50–100 học sinh; 500 đủ dư địa cho
      // batch toàn khối, chặn payload hàng trăm nghìn row chỉ bị chặn gián tiếp
      // bởi bodyLimit trước đây.
      records: z.array(
        z.object({
          studentId: z.string(),
          status: z.enum(['Present', 'AbsentExcused', 'AbsentUnexcused']),
          note: z.string().optional(),
          version: z.coerce.number().int().min(0).optional(),
        }),
      ).max(500),
      date: attendanceDateSchema,
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
      expected: { role: user.role, epoch: user.tokenVersion },
      ip,
      userAgent,
      auditAction: 'BATCH_MARK_ATTENDANCE_ITEM' as const,
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
    }).catch(error => {
      // Each successful item already committed with its own atomic audit row.
      // A diagnostic batch summary must not turn acknowledged partial-success
      // work into an apparent total failure that users may retry blindly.
      console.error('[attendance] failed to write batch summary audit', error)
    })

    return successResponse(c, batchResult)
  },
)

export default attendanceRouter
