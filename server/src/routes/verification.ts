import { Hono } from 'hono'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { signReportPayload, verifyReportSignature } from '../utils/hmacSigner.js'
import { successResponse, errorResponse } from '../utils/response.js'
import { db, runDbTransaction } from '../db/index.js'
import { students, classes, academicYears, auditLogs } from '../db/schema.js'
import { checkUserClassAccess } from '../services/classAccessQueryService.js'
import { and, eq, isNull } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { getClientIp } from '../utils/ip.js'
import { getEnforcedDeploymentParishId } from '../utils/deploymentParish.js'

const verificationRouter = new Hono()

/**
 * POST /api/verification/sign
 * Ký các định danh trong QR, KHÔNG chứng thực nội dung phiếu điểm/chứng nhận.
 * Chỉ staff có quyền trên lớp hiện hành, trong đúng parish, mới được ký.
 * Body: { studentId: string, academicYear: string, certId: string }
 */
verificationRouter.post('/sign', authMiddleware, roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  try {
    const user = c.get('user') as JwtPayload
    const { studentId, academicYear, certId } = await c.req.json()
    if (typeof studentId !== 'string' || !studentId.trim() || typeof academicYear !== 'string' || !academicYear.trim() || typeof certId !== 'string' || !certId.trim()) {
      return errorResponse(c, 'BAD_REQUEST', 'Thiếu thông tin bắt buộc (studentId, academicYear, certId)', 400)
    }

    return await runDbTransaction(async (tx) => {
      const [student] = await tx
        .select({ id: students.id, classId: students.classId })
        .from(students)
        .where(and(eq(students.id, studentId.trim()), eq(students.parishId, user.parishId), isNull(students.deletedAt)))
        .limit(1)

      if (!student) {
        return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy thiếu nhi trong giáo xứ hiện tại', 404)
      }

      if (!(await checkUserClassAccess(user.userId, user.parishId, student.classId, tx))) {
        return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền cấp mã xác thực cho thiếu nhi này', 403)
      }
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears)
        .where(and(eq(academicYears.id, academicYear.trim()), eq(academicYears.parishId, user.parishId))).limit(1)
      if (!year) return errorResponse(c, 'BAD_REQUEST', 'Năm học không tồn tại trong giáo xứ', 400)

      const normalizedStudentId = studentId.trim()
      const normalizedAcademicYear = academicYear.trim()
      const normalizedCertId = certId.trim()
      const signature = signReportPayload(user.parishId, normalizedStudentId, normalizedAcademicYear, normalizedCertId)

      // Trace who signed the identifiers; do not log the public bearer signature.
      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: user.userId,
        action: 'VERIFICATION_SIGN',
        entityType: 'verification',
        entityId: `${normalizedStudentId}:${normalizedCertId}`,
        newValue: JSON.stringify({ academicYear: normalizedAcademicYear, certId: normalizedCertId }),
        ip: getClientIp(c),
        userAgent: c.req.header('user-agent') || '',
        parishId: user.parishId,
      })

      return successResponse(c, {
        parishId: user.parishId,
        studentId: normalizedStudentId,
        academicYear: normalizedAcademicYear,
        certId: normalizedCertId,
        signature,
        verificationScope: 'signed_identifiers',
      })
    })
  } catch (err: any) {
    return errorResponse(c, 'SIGN_ERROR', err.message || 'Không thể ký HMAC', 500)
  }
})

/**
 * GET /api/verification/verify
 * Kiểm tra chữ ký các định danh QR; không kiểm nội dung bản in hay issuance.
 * Query params: parishId, studentId, academicYear, certId, sig
 * Public by design, nhưng parishId là một phần của signed payload và mọi DB lookup
 * đều phải dùng tenant scope.
 */
verificationRouter.get('/verify', async (c) => {
  try {
    const parishId = c.req.query('parishId')
    const studentId = c.req.query('studentId')
    const academicYear = c.req.query('academicYear')
    const certId = c.req.query('certId')
    const sig = c.req.query('sig')

    if (!parishId || !studentId || !academicYear || !certId || !sig) {
      return errorResponse(c, 'BAD_REQUEST', 'Thiếu tham số xác thực (parishId, studentId, academicYear, certId, sig)', 400)
    }

    const deploymentParishId = getEnforcedDeploymentParishId()
    if (deploymentParishId && parishId !== deploymentParishId) {
      return successResponse(c, { verified: false, message: 'Chữ ký hoặc thông tin định danh trong mã QR không hợp lệ.' })
    }

    const isValid = verifyReportSignature(parishId, studentId, academicYear, certId, sig)
    if (!isValid) {
      return successResponse(c, { verified: false, message: 'Chữ ký hoặc thông tin định danh trong mã QR không hợp lệ.' })
    }

    const [record] = await db
      .select({
        code: students.code,
        holyName: students.holyName,
        fullName: students.fullName,
        className: classes.name,
      })
      .from(students)
      .leftJoin(classes, and(eq(students.classId, classes.id), eq(students.parishId, classes.parishId), eq(classes.parishId, parishId)))
      .where(and(eq(students.id, studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
      .limit(1)

    if (!record) {
      return successResponse(c, { verified: false, message: 'Không tìm thấy thiếu nhi trong giáo xứ được ký.' })
    }

    return successResponse(c, {
      verified: true,
      verificationScope: 'signed_identifiers',
      message: 'Thông tin định danh trong mã QR có chữ ký hợp lệ. Kết quả này không xác nhận nội dung điểm số, bản in hoặc việc cấp chứng nhận.',
      student: {
        code: record.code,
        holyName: record.holyName,
        fullName: record.fullName,
        className: record.className || 'Chưa phân lớp',
      },
      parishId,
      academicYear,
      certId,
    })
  } catch (err: any) {
    return errorResponse(c, 'VERIFY_ERROR', err.message || 'Lỗi xác thực', 500)
  }
})

export default verificationRouter
