import { Hono } from 'hono'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { successResponse, errorResponse } from '../utils/response.js'
import { reportingApplicationService } from '../services/ReportingApplicationService.js'
import { normalizeAcademicYear } from '../utils/academicYear.js'
import { generatePDFFromHTML } from '../services/pdfService.js'

const reportingRouter = new Hono()
reportingRouter.use('*', authMiddleware)

/**
 * R4 Endpoint: GET /api/reports/report-card/:studentId
 * Read-Only CQRS Student Report Card Projection
 */
reportingRouter.get('/report-card/:studentId', roleMiddleware('admin', 'chunhiem', 'phuta', 'phuhuynh'), async (c) => {
  const user = c.get('user') as JwtPayload
  const studentId = c.req.param('studentId')
  const academicYear = normalizeAcademicYear(c.req.query('academicYear'))

  try {
    const reportCard = await reportingApplicationService.getStudentReportCard(user, studentId, academicYear)
    if (!reportCard) {
      return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy phiếu điểm của thiếu nhi', 404)
    }

    return successResponse(c, reportCard)
  } catch (err: any) {
    const status = Number(err?.status || err?.statusCode || 0)
    // Lỗi nghiệp vụ phân loại tường minh (403 spec sở hữu...) → giữ nguyên trạng.
    if (status > 0) {
      const code = status === 403 ? 'FORBIDDEN' : 'REPORT_GENERATION_ERROR'
      return errorResponse(c, code, err.message || 'Lỗi khi tạo phiếu điểm', status)
    }
    // OBS-FIX (2026-08-22): trước đây mọi exception không có .status bị nuốt IM LẶNG
    // và tự gán 400 REPORT_GENERATION_ERROR → lỗi thật (DB/schema/data prod) không bao giờ
    // xuất hiện trong server logs, không thể chẩn đoán sự cố production (case phụ huynh
    // GET /report-card/ST-60725fbf?academicYear=2026-2027 → 400 không rõ nguyên nhân).
    // Giờ: log đầy đủ server-side + trả 500 với message chung (không lộ err.message nội bộ).
    console.error(`[GET ${c.req.path}] Report card generation failed:`, err)
    return errorResponse(c, 'REPORT_GENERATION_ERROR', 'Lỗi khi tạo phiếu điểm. Vui lòng thử lại sau.', 500)
  }
})

reportingRouter.get('/classes', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  const user = c.get('user') as JwtPayload
  const academicYear = normalizeAcademicYear(c.req.query('academicYear'))
  try {
    return successResponse(c, await reportingApplicationService.listClasses(user, academicYear))
  } catch (err: any) {
    const status = Number(err?.status || err?.statusCode || 0)
    if (status > 0) return errorResponse(c, 'REPORT_GENERATION_ERROR', err.message || 'Lỗi khi tải danh sách lớp báo cáo', status)
    console.error(`[GET ${c.req.path}] Report class listing failed:`, err)
    return errorResponse(c, 'REPORT_GENERATION_ERROR', 'Lỗi khi tải danh sách lớp báo cáo. Vui lòng thử lại sau.', 500)
  }
})

/**
 * R4 Endpoint: GET /api/reports/class-summary/:classId
 * Read-Only CQRS Class Academic & Attendance Summary
 */
reportingRouter.get('/class-summary/:classId', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  const user = c.get('user') as JwtPayload
  const classId = c.req.param('classId')
  const academicYear = normalizeAcademicYear(c.req.query('academicYear'))

  try {
    const classSummary = await reportingApplicationService.getClassSummary(user, classId, academicYear)
    if (!classSummary) {
      return errorResponse(c, 'NOT_FOUND', 'Không tìm thấy báo cáo tổng hợp lớp', 404)
    }

    return successResponse(c, classSummary)
  } catch (err: any) {
    const status = Number(err?.status || err?.statusCode || 0)
    if (status > 0) {
      const code = status === 403 ? 'FORBIDDEN' : 'REPORT_GENERATION_ERROR'
      return errorResponse(c, code, err.message || 'Lỗi khi tạo báo cáo tổng hợp lớp', status)
    }
    console.error(`[GET ${c.req.path}] Class summary generation failed:`, err)
    return errorResponse(c, 'REPORT_GENERATION_ERROR', 'Lỗi khi tạo báo cáo tổng hợp lớp. Vui lòng thử lại sau.', 500)
  }
})

/**
 * POST /api/reports/generate-pdf
 * Generate PDF from HTML content (server-side via Puppeteer)
 * Body: { htmlContent: string, options?: { format?: 'A4'|'A3'|'Letter', landscape?: boolean, margin?: {...} } }
 */
reportingRouter.post('/generate-pdf', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  try {
    const body = await c.req.json()
    const { htmlContent, options } = body

    if (!htmlContent || typeof htmlContent !== 'string') {
      return errorResponse(c, 'BAD_REQUEST', 'htmlContent là bắt buộc và phải là string', 400)
    }

    // The caller supplies this HTML. The renderer sanitizes it and denies all
    // outbound resources before loading it in Chromium.
    const pdfBuffer = await generatePDFFromHTML(htmlContent, options || {})

    return c.body(pdfBuffer, 200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report_${Date.now()}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    })
  } catch (err: any) {
    console.error('[PDF Generation Error]:', err)
    return errorResponse(c, 'PDF_GENERATION_FAILED', 'Không thể tạo file PDF', 500)
  }
})

export default reportingRouter
