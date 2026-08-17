import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse, sendError } from '../utils/response.js'
import { academicYearLifecycleService } from '../services/AcademicYearLifecycleService.js'
import { normalizeAcademicYear } from '../utils/academicYear.js'

const academicYearsRouter = new Hono()
academicYearsRouter.use('*', authMiddleware)

/**
 * Academic Year Lifecycle API — state machine năm học:
 * checklist completeness → khóa HK → finalize (snapshot) → promote → copy năm mới.
 */
academicYearsRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const years = await academicYearLifecycleService.listAcademicYears(user.parishId)
  return listResponse(c, years)
})

academicYearsRouter.get('/:id/completeness', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = normalizeAcademicYear(c.req.param('id'))
  try {
    const checklist = await academicYearLifecycleService.getCompletenessChecklist(id, user.parishId)
    return successResponse(c, checklist)
  } catch (err: any) {
    const status = err.status || 400
    return errorResponse(c, status === 404 ? 'NOT_FOUND' : 'CHECKLIST_ERROR', err.message || 'Lỗi khi kiểm tra dữ liệu', status)
  }
})

academicYearsRouter.post('/:id/start-semester-2', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = normalizeAcademicYear(c.req.param('id'))
  try {
    const result = await academicYearLifecycleService.startSemester2(id, user.userId, user.parishId)
    return successResponse(c, result)
  } catch (err: any) {
    const status = err.status || 400
    return errorResponse(c, status === 403 ? 'SEMESTER_LOCKED' : status === 404 ? 'NOT_FOUND' : 'START_SEMESTER_2_ERROR', err.message || 'Lỗi khi chuyển sang học kỳ 2', status)
  }
})

academicYearsRouter.post('/:id/finalize', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = normalizeAcademicYear(c.req.param('id'))
  try {
    const summary = await academicYearLifecycleService.finalizeYear(id, user.userId, user.parishId)
    return successResponse(c, summary)
  } catch (err: any) {
    const status = err.status || 400
    return sendError(
      c,
      status === 403 ? 'SEMESTER_LOCKED' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'ALREADY_FINALIZED' : 'FINALIZE_ERROR',
      err.message || 'Lỗi khi chốt năm học',
      status,
      err.details
    )
  }
})

const copyYearSchema = z.object({
  newYearId: z.string().trim().min(1).max(30),
})

academicYearsRouter.post('/:id/copy', roleMiddleware('admin'), zValidator('json', copyYearSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = normalizeAcademicYear(c.req.param('id'))
  const newYearId = normalizeAcademicYear(c.req.valid('json').newYearId)
  try {
    const result = await academicYearLifecycleService.copyAcademicYear(id, newYearId, user.userId, user.parishId)
    return successResponse(c, result)
  } catch (err: any) {
    const status = err.status || 400
    return errorResponse(c, status === 404 ? 'NOT_FOUND' : 'COPY_YEAR_ERROR', err.message || 'Lỗi khi tạo năm học mới', status)
  }
})

const promoteSchema = z.object({
  nextYearId: z.string().trim().min(1).max(30),
})

academicYearsRouter.post('/:id/promote', roleMiddleware('admin'), zValidator('json', promoteSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = normalizeAcademicYear(c.req.param('id'))
  const nextYearId = normalizeAcademicYear(c.req.valid('json').nextYearId)
  try {
    const summary = await academicYearLifecycleService.promoteYear(id, nextYearId, user.userId, user.parishId)
    return successResponse(c, summary)
  } catch (err: any) {
    const status = err.status || 400
    return sendError(
      c,
      status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'ALREADY_PROMOTED' : 'PROMOTE_ERROR',
      err.message || 'Lỗi khi xét lên lớp',
      status,
      err.details
    )
  }
})

academicYearsRouter.post('/:id/archive', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = normalizeAcademicYear(c.req.param('id'))
  try {
    const result = await academicYearLifecycleService.archiveYear(id, user.userId, user.parishId)
    return successResponse(c, result)
  } catch (err: any) {
    const status = err.status || 400
    return errorResponse(c, status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'ALREADY_ARCHIVED' : 'ARCHIVE_ERROR', err.message || 'Lỗi khi lưu trữ năm học', status)
  }
})

export default academicYearsRouter
