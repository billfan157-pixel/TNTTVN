import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { successResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { promotionApplicationService } from '../services/PromotionApplicationService.js'
import { batchPromotionApplicationService } from '../services/BatchPromotionApplicationService.js'
import { db } from '../db/index.js'
import { auditLogs } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { normalizeAcademicYear } from '../utils/academicYear.js'

const promotionRouter = new Hono()
promotionRouter.use('*', authMiddleware)

/**
 * P2.1 Read-Only Endpoint: Evaluate Promotion for a Student
 * GET /api/promotion/evaluate/:studentId?academicYear=2025-2026
 */
promotionRouter.get('/evaluate/:studentId', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  const user = c.get('user') as JwtPayload
  const studentId = c.req.param('studentId')
  const academicYear = normalizeAcademicYear(c.req.query('academicYear'))

  try {
    const decision = await promotionApplicationService.evaluateStudentWithData({
      studentId,
      academicYear,
      parishId: user.parishId,
      user,
    })
    return successResponse(c, decision)
  } catch (err: any) {
    const status = err.status || 400
    const code = status === 404 ? 'NOT_FOUND' : 'EVALUATION_ERROR'
    return errorResponse(c, code, err.message || 'Lỗi khi đánh giá xét lên lớp', status)
  }
})

const approveSchema = z.object({
  studentId: z.string().min(1),
  academicYear: z.string().min(1),
  targetClassId: z.string().min(1),
  nextClassId: z.string().optional().nullable(),
  // F1 (audit 2026-08-21): chuyển ngành cùng transaction với snapshot — dùng bởi
  // batch-approve (panel "Xét Lên Lớp"); /approve đơn lẻ giữ ngữ nghĩa snapshot-only.
  newBranch: z.enum(['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi']).optional().nullable(),
  gpa: z.number().min(0).max(10),
  attendanceRate: z.number().min(0).max(100),
  conductSnapshot: z.string().optional().nullable(),
  manualDecision: z.enum(['PROMOTED', 'RETAINED', 'GRADUATED', 'CONDITIONALLY_PROMOTED', 'TRANSFERRED']).optional(),
  overrideReason: z.string().optional().nullable(),
})

/**
 * P2.2 & P2.3 Endpoint: Approve Promotion for a Single Student
 * POST /api/promotion/approve
 */
promotionRouter.post('/approve', roleMiddleware('admin', 'chunhiem'), zValidator('json', approveSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const payload = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const snapshot = await promotionApplicationService.approvePromotion({
      studentId: payload.studentId,
      academicYear: payload.academicYear,
      targetClassId: payload.targetClassId,
      nextClassId: payload.nextClassId,
      gpa: payload.gpa,
      attendanceRate: payload.attendanceRate,
      conductSnapshot: payload.conductSnapshot,
      manualDecision: payload.manualDecision,
      overrideReason: payload.overrideReason,
      userId: user.userId,
      parishId: user.parishId,
      user,
      ip,
      userAgent,
    })

    return successResponse(c, snapshot)
  } catch (err: any) {
    const status = err.status || 400
    const code = status === 403 ? 'FORBIDDEN' : status === 409 ? 'DATA_MISMATCH' : 'APPROVAL_ERROR'
    return errorResponse(c, code, err.message || 'Lỗi khi phê duyệt xét lên lớp', status)
  }
})

const batchApproveSchema = z.object({
  items: z.array(approveSchema).min(1).max(200),
  chunkSize: z.number().int().min(1).max(50).optional().default(10),
})

/**
 * P3 Endpoint: Batch Approve Promotion for Multiple Students (Partial Failure Semantics per ADR-008)
 * POST /api/promotion/batch-approve
 */
promotionRouter.post('/batch-approve', roleMiddleware('admin', 'chunhiem'), zValidator('json', batchApproveSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { items, chunkSize } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const commands = items.map((item) => ({
      ...item,
      userId: user.userId,
      parishId: user.parishId,
      user,
      ip,
      userAgent,
    }))

    const batchResult = await batchPromotionApplicationService.approveBatch(commands, chunkSize)

    // Audit Logging for Batch Execution
    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.userId,
      action: 'BATCH_APPROVE_PROMOTION',
      entityType: 'promotion_record_batch',
      entityId: `BATCH-${Date.now()}`,
      oldValue: null,
      newValue: JSON.stringify({
        total: batchResult.total,
        successCount: batchResult.successCount,
        skippedCount: batchResult.skippedCount,
        errorCount: batchResult.errorCount,
      }),
      ip,
      userAgent,
      parishId: user.parishId,
      createdAt: new Date().toISOString(),
    }).catch((error) => console.error('[promotion] failed to write diagnostic batch summary:', error))

    return successResponse(c, batchResult)
  } catch (err: any) {
    return errorResponse(c, 'BATCH_APPROVAL_ERROR', err.message || 'Lỗi khi xử lý phê duyệt hàng loạt', 400)
  }
})

export default promotionRouter
