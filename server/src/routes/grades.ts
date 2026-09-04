import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, roleMiddleware, getUserClassIds, isAdmin, checkUserClassAccess } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { getGrades, upsertGrade, upsertGradeBatch, undoGradeImport } from '../services/gradeService.js'
import { VersionConflictError } from '../domain/errors.js'
import { getStudentsByClassIds, getStudentClassId } from '../services/studentService.js'
import { db } from '../db/index.js'
import { gradeImportHashes, grades } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { getCurrentAcademicYear } from '../utils/academicYear.js'
import { academicYearLifecycleService } from '../services/AcademicYearLifecycleService.js'

const gradesRouter = new Hono()
gradesRouter.use('*', authMiddleware)

const scorePreprocess = z.preprocess((val) => {
  if (val === '' || val === undefined || val === null) return null
  if (typeof val === 'string') {
    const parsed = parseFloat(val.replace(',', '.'))
    return isNaN(parsed) ? null : parsed
  }
  return val
}, z.number().min(0).max(10).nullable().optional())

// Exported cho regression test (academicYear "" → default năm hiện tại).
export const gradeSchema = z.object({
  studentId: z.string().trim().min(1),
  // ADR-016 (sync-fix): Payload legacy/offline có thể mang academicYear: "" (chuỗi
  // rỗng từ currentYear chưa seed). Coi "" như thiếu → default năm hiện tại.
  // Trước đây "" vượt qua .optional() (key có tồn tại) nhưng fail .min(1) →
  // toàn bộ /grades/batch trả 400 → sync engine retry vô hạn.
  academicYear: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '') ? undefined : val,
    z.string().trim().min(1).optional().default(() => getCurrentAcademicYear())
  ),
  semester: z.coerce.number().int().min(1).max(2),
  scoreOral: scorePreprocess,
  score15m: scorePreprocess,
  score1Period: scorePreprocess,
  scoreMidterm: scorePreprocess,
  scoreFinal: scorePreprocess,
  scoreDaoDuc: scorePreprocess,
  scoreOral_source: z.string().nullable().optional(),
  score15m_source: z.string().nullable().optional(),
  score1Period_source: z.string().nullable().optional(),
  scoreMidterm_source: z.string().nullable().optional(),
  scoreFinal_source: z.string().nullable().optional(),
  scoreOral_updated_at: z.string().nullable().optional(),
  score15m_updated_at: z.string().nullable().optional(),
  score1Period_updated_at: z.string().nullable().optional(),
  scoreMidterm_updated_at: z.string().nullable().optional(),
  scoreFinal_updated_at: z.string().nullable().optional(),
  comments: z.string().trim().max(500).nullable().optional(),
  version: z.coerce.number().int().min(0).optional(),
  clearFields: z.array(z.enum(['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc'])).optional(),
  overrideReasonNote: z.string().trim().max(500).nullable().optional(),
})

gradesRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const updatedAfter = c.req.query('updatedAfter')
  if (isAdmin(user)) {
    const list = await getGrades(user.parishId, undefined, undefined, updatedAfter)
    return listResponse(c, list)
  }
  const classIds = await getUserClassIds(user.userId, user.parishId)
  const { data: studentsInClass } = await getStudentsByClassIds(user.parishId, classIds, updatedAfter)
  const studentIds = studentsInClass.map(s => s.id)
  // RBAC semester gating: tài khoản không phải admin chỉ đọc học kỳ đang mở
  // (current_semester của năm học hoạt động) — không được đọc học kỳ khác.
  const openSemester = await academicYearLifecycleService.getOpenSemester(user.parishId)
  const list = await getGrades(user.parishId, undefined, openSemester, updatedAfter, studentIds)
  return listResponse(c, list)
})

gradesRouter.post('/', roleMiddleware('admin', 'chunhiem'), zValidator('json', gradeSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  // ADR-016 (S24): Không pre-check từng item — pass classIds vào service,
  // access check được thực hiện trong cùng transaction với write (đóng TOCTOU).
  const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)

  try {
    const result = await upsertGrade(data, user.userId, user.parishId, ip, userAgent, undefined, allowedClassIds)
    return successResponse(c, result)
  } catch (err: any) {
    if (err instanceof VersionConflictError) {
      return c.json({
        success: false,
        error: { code: 'VERSION_CONFLICT', message: err.message, details: err.currentGrade },
        timestamp: new Date().toISOString(),
      }, 409)
    }
    const status = err.status || err.statusCode || 500
    const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi lưu điểm'
    const isFK = msg.toLowerCase().includes('foreign key')
    const isConstraint = msg.toLowerCase().includes('constraint')
    if (isFK || isConstraint) {
      return c.json({
        success: false,
        error: { code: isFK ? 'STUDENT_NOT_FOUND' : 'DUPLICATE_GRADE', message: isFK ? 'Thiếu nhi không tồn tại trong hệ thống' : 'Điểm đã tồn tại cho học kỳ này' },
      }, 400)
    }
    if (status === 403) {
      return errorResponse(c, 'FORBIDDEN', msg, 403)
    }
    console.error('[grades] POST / error:', err)
    return c.json({
      success: false,
      error: { code: 'GRADE_SAVE_ERROR', message: msg },
    }, status)
  }
})

// Cap tường minh chống DoS (trước đây chỉ bị chặn gián tiếp bởi bodyLimit 10MB).
// Sync engine gửi toàn bộ pending edits trong 1 call — 2000 đủ dư địa cho nhiều lớp.
gradesRouter.post('/batch', roleMiddleware('admin', 'chunhiem'), zValidator('json', z.object({ grades: z.array(gradeSchema).max(2000) })), async (c) => {
  const user = c.get('user') as JwtPayload
  const { grades: gradeList } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  // ADR-016 (S24): Access check chuyển vào service (cùng tx với write) — đóng TOCTOU.
  const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)

  const results = await upsertGradeBatch(gradeList, user.userId, user.parishId, ip, userAgent, allowedClassIds)
  const conflicts = results.filter(r => r.status === 'conflict')
  if (conflicts.length > 0) {
    return c.json({
      success: true,
      data: { results },
      error: {
        code: 'PARTIAL_CONFLICT',
        message: `${conflicts.length} điểm bị xung đột phiên bản, các điểm còn lại đã lưu thành công`,
        details: conflicts,
      },
      timestamp: new Date().toISOString(),
    }, 200)
  }
  return successResponse(c, { results })
})

// ─── Duplicate Import Detection ───
gradesRouter.post('/check-import-duplicate', roleMiddleware('admin', 'chunhiem'), zValidator('json', z.object({
  hash: z.string().min(1),
  classId: z.string().min(1),
  semester: z.number().int().min(1).max(2),
  academicYear: z.string().min(1),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const { hash, classId, semester, academicYear } = c.req.valid('json')

  if (user.role !== 'admin') {
    const hasAccess = await checkUserClassAccess(user.userId, user.parishId, classId)
    if (!hasAccess) return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền truy cập lớp học này', 403)
  }

  const [existing] = await db
    .select()
    .from(gradeImportHashes)
    .where(and(
      eq(gradeImportHashes.hash, hash),
      eq(gradeImportHashes.classId, classId),
      eq(gradeImportHashes.semester, semester),
      eq(gradeImportHashes.academicYear, academicYear),
      eq(gradeImportHashes.parishId, user.parishId),
    ))
    .orderBy(desc(gradeImportHashes.createdAt))
    .limit(1)

  if (existing) {
    return successResponse(c, {
      isDuplicate: true,
      importedAt: existing.createdAt,
      totalRows: existing.totalRows,
    })
  }
  return successResponse(c, { isDuplicate: false })
})

gradesRouter.post('/register-import', roleMiddleware('admin', 'chunhiem'), zValidator('json', z.object({
  hash: z.string().min(1),
  classId: z.string().min(1),
  semester: z.number().int().min(1).max(2),
  academicYear: z.string().min(1),
  totalRows: z.number().int().min(0),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const { hash, classId, semester, academicYear, totalRows } = c.req.valid('json')

  if (user.role !== 'admin') {
    const hasAccess = await checkUserClassAccess(user.userId, user.parishId, classId)
    if (!hasAccess) return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền truy cập lớp học này', 403)
  }

  await db.insert(gradeImportHashes).values({
    id: generateId('GIH'),
    hash,
    classId,
    semester,
    academicYear,
    totalRows,
    userId: user.userId,
    parishId: user.parishId,
  })

  return successResponse(c, { registered: true })
})

// ADR-028 (2026-08-12): Khôi phục đợt nhập điểm — đảo ngược lần ghi gần nhất của
// từng bảng điểm dựa trên audit_logs (CREATE → xóa row, UPDATE → khôi phục oldValue).
// Giới hạn: trong vòng 7 ngày, chỉ khi entry mới nhất là CREATE/UPDATE (chưa có
// thay đổi khác sau đợt nhập). admin: toàn parish; chunhiem: chỉ lớp được bổ nhiệm.
gradesRouter.post('/undo-import', roleMiddleware('admin', 'chunhiem'), zValidator('json', z.object({
  semester: z.number().int().min(1).max(2),
  academicYear: z.string().trim().min(1),
  studentIds: z.array(z.string().trim().min(1)).min(1).max(500),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const { semester, academicYear, studentIds } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  // ADR-016 (S24): access check chuyển vào service (cùng tx với write).
  const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)

  const results = await undoGradeImport(
    studentIds.map((studentId) => ({ studentId })),
    semester,
    academicYear,
    user.userId,
    user.parishId,
    ip,
    userAgent,
    allowedClassIds,
  )
  return successResponse(c, { results })
})

// ─── Phase 2: Grade Override API Endpoints ───

const overrideSchema = z.object({
  scoreField: z.enum(['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc']),
  manualValue: z.number().min(0).max(10),
  reasonCode: z.enum(['TeacherAdjustment', 'SpecialAssignment', 'Appeal', 'DataCorrection', 'PrincipalApproval']).optional(),
  reasonNote: z.string().trim().max(500).optional(),
  studentId: z.string().optional(),
  academicYear: z.string().optional(),
  semester: z.number().int().min(1).max(2).optional(),
})

import { gradeApplicationService } from '../services/GradeApplicationService.js'

gradesRouter.patch('/:id/override', roleMiddleware('admin', 'chunhiem'), zValidator('json', overrideSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const gradeId = c.req.param('id')
  const data = c.req.valid('json')
  const idempotencyKey = c.req.header('idempotency-key') || c.req.header('x-idempotency-key')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const result = await gradeApplicationService.overrideScore({
      gradeId: gradeId !== 'new' ? gradeId : '',
      studentId: data.studentId,
      scoreField: data.scoreField,
      manualValue: data.manualValue,
      reasonCode: data.reasonCode,
      reasonNote: data.reasonNote,
      userId: user.userId,
      parishId: user.parishId,
      ip,
      userAgent,
      idempotencyKey: idempotencyKey || undefined,
    })

    return successResponse(c, result)
  } catch (err: any) {
    const status = err.status || err.statusCode || 400
    const code = status === 403 ? 'FORBIDDEN' : status === 409 ? 'VERSION_CONFLICT' : 'OVERRIDE_ERROR'
    return errorResponse(c, code, err.message || 'Lỗi khi ghi đè điểm số', status)
  }
})

gradesRouter.delete('/:id/override', roleMiddleware('admin', 'chunhiem'), zValidator('json', z.object({
  scoreField: z.enum(['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc']),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const gradeId = c.req.param('id')
  const { scoreField } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const result = await gradeApplicationService.restoreScore({
      gradeId,
      scoreField,
      userId: user.userId,
      parishId: user.parishId,
      ip,
      userAgent,
    })
    return successResponse(c, result)
  } catch (err: any) {
    const status = err.status || err.statusCode || 400
    const code = status === 403 ? 'FORBIDDEN' : status === 409 ? 'VERSION_CONFLICT' : 'RESTORE_ERROR'
    return errorResponse(c, code, err.message || 'Lỗi khi khôi phục điểm số', status)
  }
})

gradesRouter.get('/:id/override/history', async (c) => {
  const user = c.get('user') as JwtPayload
  const gradeId = c.req.param('id')
  
  if (!isAdmin(user)) {
    const [g] = await db.select({ studentId: grades.studentId }).from(grades).where(and(eq(grades.id, gradeId), eq(grades.parishId, user.parishId))).limit(1)
    if (g) {
      const studentClassId = await getStudentClassId(g.studentId, user.parishId)
      if (!studentClassId || !await checkUserClassAccess(user.userId, user.parishId, studentClassId)) {
        return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền xem lịch sử ghi đè điểm của thiếu nhi này', 403)
      }
    }
  }

  const history = await gradeApplicationService.getOverrideHistory(gradeId, user.parishId)
  return listResponse(c, history)
})

gradesRouter.post('/restore-batch', roleMiddleware('admin', 'chunhiem'), zValidator('json', z.object({
  items: z.array(z.object({
    gradeId: z.string().min(1),
    scoreField: z.enum(['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc']),
  })).min(1),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const { items } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  if (!isAdmin(user)) {
    for (const item of items) {
      const [g] = await db.select({ studentId: grades.studentId }).from(grades).where(and(eq(grades.id, item.gradeId), eq(grades.parishId, user.parishId))).limit(1)
      if (g) {
        const studentClassId = await getStudentClassId(g.studentId, user.parishId)
        if (!studentClassId || !await checkUserClassAccess(user.userId, user.parishId, studentClassId)) {
          return errorResponse(c, 'FORBIDDEN', `Bạn không có quyền khôi phục điểm ghi đè cho bảng điểm ${item.gradeId}`, 403)
        }
      }
    }
  }

  const results = await gradeApplicationService.restoreScoreBatch(items, user.userId, user.parishId, ip, userAgent)
  return successResponse(c, { results })
})

export default gradesRouter
