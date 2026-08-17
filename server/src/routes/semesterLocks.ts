import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { db } from '../db/index.js'
import { semesterLocks, academicYears, auditLogs } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { normalizeAcademicYear } from '../utils/academicYear.js'
import { drizzleSemesterLockRepository } from '../repositories/DrizzleSemesterLockRepository.js'
import { deriveAcademicYearStatus, isTerminalStatus } from '../domain/AcademicYearStatus.js'
import { getCurrentPolicyVersionId } from '../services/parishSettingsService.js'

const semesterLocksRouter = new Hono()
semesterLocksRouter.use('*', authMiddleware)

const setLockSchema = z.object({
  academicYear: z.string().trim().min(1),
  semester: z.coerce.number().int().min(1).max(2),
  isLocked: z.boolean(),
  unlockReason: z.string().trim().max(500).optional(),
})

/**
 * F2 (audit): Trước đây semester_locks chỉ được ghi từ test — không có API/UI nào
 * khóa sổ điểm được. GET này cho phép client đọc trạng thái khóa HK1/HK2 theo năm học.
 */
semesterLocksRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const academicYear = c.req.query('academicYear')
  const conditions = [eq(semesterLocks.parishId, user.parishId)]
  if (academicYear) {
    conditions.push(eq(semesterLocks.academicYear, normalizeAcademicYear(academicYear)))
  }
  const rows = await db.select().from(semesterLocks).where(and(...conditions))
  return listResponse(c, rows)
})

/**
 * F2 (audit): Khóa/mở khóa sổ điểm một học kỳ. Đây là điều kiện tiên quyết của
 * xét thăng tiến (PromotionSpecifications) và là rào cản chống sửa điểm sau khóa
 * (gradeService/attendanceService/GradeApplicationService).
 */
semesterLocksRouter.post('/', roleMiddleware('admin'), zValidator('json', setLockSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { academicYear, semester, isLocked, unlockReason } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const normYear = normalizeAcademicYear(academicYear)
  try {
    // AYL-02 (audit): gate theo state machine — API không được phá vỡ chuỗi
    // trạng thái mà AcademicYearLifecycleService đang bảo vệ.
    const [year] = await db
      .select({ status: academicYears.status, isLocked: academicYears.isLocked, currentSemester: academicYears.currentSemester })
      .from(academicYears)
      .where(and(eq(academicYears.id, normYear), eq(academicYears.parishId, user.parishId)))
      .limit(1)
    if (!year) {
      return errorResponse(c, 'ACADEMIC_YEAR_NOT_FOUND', `Không tìm thấy năm học ${normYear}`, 404)
    }

    const hk1Locked = await drizzleSemesterLockRepository.isLocked(normYear, 1, user.parishId)
    const hk2Locked = await drizzleSemesterLockRepository.isLocked(normYear, 2, user.parishId)
    const status = deriveAcademicYearStatus(year, { semester1Locked: hk1Locked, semester2Locked: hk2Locked })

    if (isTerminalStatus(status) || year.isLocked === 1) {
      return errorResponse(c, 'SEMESTER_LOCK_STATE_CONFLICT', `Năm học ${normYear} đã chốt/đóng sổ (${status}) — không thể khóa hoặc mở khóa học kỳ`, 409)
    }
    if (semester === 2 && isLocked && !hk1Locked) {
      return errorResponse(c, 'SEMESTER_LOCK_STATE_CONFLICT', `Phải khóa sổ điểm HK1 của năm học ${normYear} trước khi khóa HK2`, 403)
    }
    if (semester === 1 && !isLocked && hk2Locked) {
      return errorResponse(c, 'SEMESTER_LOCK_STATE_CONFLICT', `Không thể mở khóa HK1 khi HK2 của năm học ${normYear} đang khóa`, 403)
    }

    await drizzleSemesterLockRepository.setLockState(
      normYear,
      semester,
      isLocked,
      user.userId,
      user.parishId,
      unlockReason
    )

    // ADR-047: Capture policy version at lock time for audit trail
    const policyVersionId = await getCurrentPolicyVersionId(user.parishId)
    const auditMetadata = {
      academicYear: normYear,
      semester,
      isLocked,
      unlockReason: unlockReason || null,
      policyVersionIdAtLock: policyVersionId,
      lockedReason: isLocked ? `Semester ${semester} locked for finalization` : `Semester ${semester} unlocked for re-grading`,
    }

    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.userId,
      action: isLocked ? 'LOCK_SEMESTER' : 'UNLOCK_SEMESTER',
      entityType: 'semester_lock',
      entityId: `${normYear}-${semester}`,
      oldValue: null,
      newValue: JSON.stringify(auditMetadata),
      ip,
      userAgent,
      parishId: user.parishId,
      createdAt: new Date().toISOString(),
    })

    return successResponse(c, { academicYear: normYear, semester, isLocked })
  } catch (err: any) {
    return errorResponse(c, 'LOCK_UPDATE_FAILED', err.message || 'Lỗi khi cập nhật khóa sổ điểm', 400)
  }
})

export default semesterLocksRouter
