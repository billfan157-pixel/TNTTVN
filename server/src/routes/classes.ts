import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, roleMiddleware, getUserClassIds, isAdmin } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { getClasses, getClassById, createClass, updateClass, deleteClass, getAvailableTeachers, assignUserToClass, removeUserFromClass } from '../services/classService.js'
import { db } from '../db/index.js'
import { academicYears } from '../db/schema.js'
import { normalizeAcademicYear, computeAcademicYearDateRange, parseAcademicYear } from '../utils/academicYear.js'

const classesRouter = new Hono()
classesRouter.use('*', authMiddleware)

const classSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  branchId: z.string().trim().min(1),
  academicYearId: z.string().trim().min(1),
  room: z.string().trim().max(50).optional(),
  idempotencyKey: z.string().optional(),
})

classesRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  let list = await getClasses(user.parishId)
  if (!isAdmin(user)) {
    const classIds = await getUserClassIds(user.userId, user.parishId)
    list = list.filter(item => classIds.includes(item.id))
  }
  return listResponse(c, list)
})

classesRouter.get('/available-teachers', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const list = await getAvailableTeachers(user.parishId)
  return listResponse(c, list)
})

classesRouter.post('/:id/assignments', roleMiddleware('admin'), zValidator('json', z.object({
  userId: z.string().min(1),
  roleInClass: z.enum(['chunhiem', 'phuta']),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const { userId, roleInClass } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const result = await assignUserToClass(id, userId, roleInClass, user.userId, user.parishId, ip, userAgent)
  if ('error' in result) return errorResponse(c, result.error as string, result.message as string, 400)
  return successResponse(c, { ok: true, classId: id, userId, roleInClass })
})

classesRouter.delete('/:id/assignments/:userId', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const userId = c.req.param('userId')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const result = await removeUserFromClass(id, userId, user.userId, user.parishId, ip, userAgent)
  if ('error' in result) return errorResponse(c, result.error as string, result.message as string, 404)
  return successResponse(c, { ok: true, classId: id, userId })
})

classesRouter.get('/branches', async (c) => {
  const user = c.get('user') as JwtPayload
  const { branches } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')
  const { db } = await import('../db/index.js')
  const list = await db.select().from(branches).where(eq(branches.parishId, user.parishId))
  return listResponse(c, list)
})

classesRouter.get('/academic-years', async (c) => {
  const user = c.get('user') as JwtPayload
  const { academicYears } = await import('../db/schema.js')
  const { eq, desc } = await import('drizzle-orm')
  const { db } = await import('../db/index.js')
  const list = await db.select().from(academicYears).where(eq(academicYears.parishId, user.parishId)).orderBy(desc(academicYears.startDate))
  return listResponse(c, list)
})

const academicYearSchema = z.object({
  id: z.string().trim().min(1).max(30),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
})

// AY-F5 (audit 2026-08-21): chặn năm học id tự do ("abc") và ngày không hợp lệ.
// Trước đây normalizeAcademicYear giữ nguyên chuỗi lạ và computeAcademicYearDateRange
// trả range 2000-2099 cho năm không parse được → getOpenSemester (match theo khoảng
// ngày) và bounding chuyên cần ADR-017-F2 bị lệch.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * F7 (audit): Tạo năm học server-side. Trước đây "Mở Năm Học Mới" chỉ set local
 * (AcademicYearPage → setCurrentYear) → các thiết bị khác không thấy năm học mới,
 * điểm/điểm danh của năm mới vẫn leo lên server nhưng year-scoping lệch giữa máy.
 * Idempotent: năm đã tồn tại → trả về row hiện có (không lỗi duplicate).
 */
classesRouter.post('/academic-years', roleMiddleware('admin'), zValidator('json', academicYearSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { id, startDate, endDate } = c.req.valid('json')
  const normId = normalizeAcademicYear(id)

  if (!parseAcademicYear(normId)) {
    return errorResponse(c, 'ACADEMIC_YEAR_INVALID', `Định dạng năm học không hợp lệ (phải là YYYY-YYYY, ví dụ 2025-2026): "${normId}"`, 400)
  }

  const range = computeAcademicYearDateRange(normId)
  const effectiveStart = startDate || range.startDate
  const effectiveEnd = endDate || range.endDate
  if (!isValidDateString(effectiveStart) || !isValidDateString(effectiveEnd)) {
    return errorResponse(c, 'ACADEMIC_YEAR_INVALID', 'Ngày bắt đầu/kết thúc phải đúng định dạng YYYY-MM-DD', 400)
  }
  if (effectiveStart >= effectiveEnd) {
    return errorResponse(c, 'ACADEMIC_YEAR_INVALID', 'Ngày bắt đầu phải trước ngày kết thúc', 400)
  }

  const now = new Date().toISOString()

  try {
    const row = {
      id: normId,
      startDate: effectiveStart,
      endDate: effectiveEnd,
      isLocked: 0,
      parishId: user.parishId,
      createdAt: now,
      updatedAt: now,
      updatedBy: user.userId,
    }
    await db.insert(academicYears).values(row as any).onConflictDoNothing()
    
    const [existing] = await db
      .select()
      .from(academicYears)
      .where(and(eq(academicYears.id, normId), eq(academicYears.parishId, user.parishId)))
      .limit(1)
      
    if (existing) {
      return successResponse(c, existing, existing.createdAt === now ? 201 : 200)
    }
    
    return successResponse(c, row, 201)
  } catch (err: any) {
    return errorResponse(c, 'ACADEMIC_YEAR_CREATE_ERROR', err?.message || 'Lỗi khi tạo năm học', 400)
  }
})

classesRouter.get('/:id', async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  if (!isAdmin(user)) {
    const classIds = await getUserClassIds(user.userId, user.parishId)
    if (!classIds.includes(id)) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền truy cập lớp học này', 403)
    }
  }
  const result = await getClassById(id, user.parishId)
  if (!result) return errorResponse(c, 'NOT_FOUND', 'Lớp học không tồn tại', 404)
  return successResponse(c, result)
})

classesRouter.post('/', roleMiddleware('admin'), zValidator('json', classSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const [yearExists] = await db
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(eq(academicYears.parishId, user.parishId))
    .limit(1)
  if (!yearExists) {
    return errorResponse(c, 'ACADEMIC_YEAR_REQUIRED', 'Vui lòng tạo năm học trước khi tạo lớp học', 409)
  }

  try {
    const created = await createClass(data, user.userId, user.parishId, ip, userAgent, data.idempotencyKey)
    return successResponse(c, created, 201)
  } catch (err: any) {
    // ERR-F6 (audit 2026-08-21): ràng buộc DB phải trả 4xx rõ nghĩa thay vì
    // lộ 500 INTERNAL qua app.onError.
    const msg = String(err?.message || '')
    if (msg.includes('UNIQUE constraint failed')) {
      return errorResponse(c, 'CLASS_CODE_EXISTS', 'Mã lớp đã tồn tại trong năm học này', 409)
    }
    if (msg.includes('FOREIGN KEY constraint failed')) {
      return errorResponse(c, 'INVALID_REFERENCE', 'Ngành học (branchId) hoặc năm học (academicYearId) không tồn tại', 400)
    }
    throw err
  }
})

classesRouter.put('/:id', roleMiddleware('admin'), zValidator('json', classSchema.partial()), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const updated = await updateClass(id, data, user.userId, user.parishId, ip, userAgent)
    if (!updated) return errorResponse(c, 'NOT_FOUND', 'Lớp học không tồn tại', 404)
    return successResponse(c, updated)
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('UNIQUE constraint failed')) {
      return errorResponse(c, 'CLASS_CODE_EXISTS', 'Mã lớp đã tồn tại trong năm học này', 409)
    }
    if (msg.includes('FOREIGN KEY constraint failed')) {
      return errorResponse(c, 'INVALID_REFERENCE', 'Ngành học (branchId) hoặc năm học (academicYearId) không tồn tại', 400)
    }
    throw err
  }
})

classesRouter.delete('/:id', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const success = await deleteClass(id, user.userId, user.parishId, ip, userAgent)
  if (!success) return errorResponse(c, 'NOT_FOUND', 'Lớp học không tồn tại', 404)
  return successResponse(c, { id, deleted: true })
})

export default classesRouter
