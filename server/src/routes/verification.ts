import { Hono } from 'hono'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { signReportPayload, verifyReportSignature } from '../utils/hmacSigner.js'
import { successResponse, errorResponse } from '../utils/response.js'
import { db } from '../db/index.js'
import { students, classes, auditLogs } from '../db/schema.js'
import { and, eq, isNull } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { getClientIp } from '../utils/ip.js'

const verificationRouter = new Hono()

/**
 * POST /api/verification/sign
 * Cấp chữ ký HMAC cho một phiếu điểm / chứng nhận.
 * Chỉ staff trong đúng parish mới được cấp chữ ký.
 * Body: { studentId: string, academicYear: string, certId: string }
 */
verificationRouter.post('/sign', authMiddleware, roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  try {
    const user = c.get('user') as JwtPayload
    const { studentId, academicYear, certId } = await c.req.json()
    if (typeof studentId !== 'string' || !studentId.trim() || typeof academicYear !== 'string' || !academicYear.trim() || typeof certId !== 'string' || !certId.trim()) {
      return errorResponse(c, 'BAD_REQUEST', 'Thiếu thông tin bắt buộc (studentId, academicYear, certId)', 400)
    }

    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId.trim()), eq(students.parishId, user.parishId), isNull(students.deletedAt)))
      .limit(1)

    if (!student) {
      return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy thiếu nhi trong giáo xứ hiện tại', 404)
    }

    const normalizedStudentId = studentId.trim()
    const normalizedAcademicYear = academicYear.trim()
    const normalizedCertId = certId.trim()
    const signature = signReportPayload(user.parishId, normalizedStudentId, normalizedAcademicYear, normalizedCertId)

    // AUDIT-F4 (2026-08-22): cấp chữ ký HMAC cho phiếu điểm/chứng nhận là hành
    // động có giá trị xác thực — phải để vết ai ký cho ai. KHÔNG lưu chữ ký vào
    // audit (chữ ký public qua QR — chỉ log metadata).
    await db.insert(auditLogs).values({
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
    })
  } catch (err: any) {
    return errorResponse(c, 'SIGN_ERROR', err.message || 'Không thể ký HMAC', 500)
  }
})

/**
 * GET /api/verification/verify
 * Kiểm tra tính nguyên vẹn của phiếu điểm khi quét QR.
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

    const isValid = verifyReportSignature(parishId, studentId, academicYear, certId, sig)
    if (!isValid) {
      return successResponse(c, { verified: false, message: 'Mã QR không hợp lệ hoặc phiếu điểm đã bị chỉnh sửa!' })
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
      return successResponse(c, { verified: false, message: 'Không tìm thấy phiếu điểm trong giáo xứ được ký.' })
    }

    return successResponse(c, {
      verified: true,
      message: 'Phiếu điểm chính hãng được xác thực bởi hệ thống Brave Davinci!',
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
