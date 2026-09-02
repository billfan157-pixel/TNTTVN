import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, getUserClassIds, isAdmin } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentClassId,
} from '../services/studentService.js'
import { db } from '../db/index.js'
import { classes } from '../db/schema.js'
import { and, eq, isNull } from 'drizzle-orm'
import { isValidIsoDate } from '../utils/date.js'

const studentsRouter = new Hono()
studentsRouter.use('*', authMiddleware)

const optionalDateSchema = z.union([
  z.string().refine(isValidIsoDate, 'Ngày phải là ngày YYYY-MM-DD có thật'),
  z.literal(''),
]).optional()

const studentSchema = z.object({
  holyName: z.string().trim().min(1).max(100),
  fullName: z.string().trim().min(1).max(200),
  gender: z.enum(['Nam', 'Nữ']),
  dateOfBirth: z.union([z.string().refine(isValidIsoDate, 'Ngày sinh phải là ngày YYYY-MM-DD có thật'), z.literal('')]),
  baptismDate: optionalDateSchema,
  firstCommunionDate: optionalDateSchema,
  confirmationDate: optionalDateSchema,
  parentName: z.string().trim().max(200).default(''),
  parentPhone: z.string().trim().max(20).refine(val => !val || /^(\+84|0)\d{9,10}$/.test(val), 'Số điện thoại không hợp lệ').default(''),
  address: z.string().trim().max(500).default(''),
  branch: z.enum(['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi']),
  classId: z.string().trim().min(1),
  status: z.enum(['Đang học', 'Nghỉ học', 'Tạm vắng']).default('Đang học'),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().trim().optional(),
})

studentsRouter.get('/', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  const user = c.get('user') as JwtPayload
  const updatedAfter = c.req.query('updatedAfter')
  const updatedBefore = c.req.query('updatedBefore')
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(10000, Math.max(1, parseInt(c.req.query('limit') || '50', 10)))
  // Roster read scope is parish-wide for all staff. Class assignments still
  // gate every write route below and all grade/attendance/exam operations.
  const result = await getStudents(user.parishId, updatedAfter, limit, page, updatedBefore)
  return listResponse(c, result.data, result.total)
})

studentsRouter.get('/:id', roleMiddleware('admin', 'chunhiem', 'phuta'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const student = await getStudentById(id, user.parishId)
  if (!student) return errorResponse(c, 'NOT_FOUND', 'Học sinh không tồn tại', 404)
  return successResponse(c, student)
})

studentsRouter.post('/', roleMiddleware('admin', 'chunhiem'), zValidator('json', studentSchema), async (c) => {
  try {
    const user = c.get('user') as JwtPayload
    const data = c.req.valid('json')
    const ip = getClientIp(c)
    const userAgent = c.req.header('user-agent') || ''

    const [classExists] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.parishId, user.parishId), isNull(classes.deletedAt)))
      .limit(1)
    if (!classExists) {
      return errorResponse(c, 'CLASS_REQUIRED', 'Vui lòng tạo lớp học trước khi thêm học sinh', 409)
    }

    if (!isAdmin(user)) {
      const classIds = await getUserClassIds(user.userId, user.parishId)
      if (data.classId && !classIds.includes(data.classId)) {
        return errorResponse(c, 'FORBIDDEN', 'Bạn không được phân công lớp này', 403)
      }
    }

    const created = await createStudent(data, user.userId, user.parishId, ip, userAgent, data.idempotencyKey)
    return successResponse(c, created, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi tạo học sinh'
    return errorResponse(c, 'CREATE_FAILED', message, 400)
  }
})

studentsRouter.put('/:id', roleMiddleware('admin', 'chunhiem'), zValidator('json', studentSchema.partial()), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  if (!isAdmin(user)) {
    const classIds = await getUserClassIds(user.userId, user.parishId)
    const existingClassId = await getStudentClassId(id, user.parishId)
    if (existingClassId && !classIds.includes(existingClassId)) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền sửa học sinh này', 403)
    }
    if (data.classId && !classIds.includes(data.classId)) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không được phân công lớp này', 403)
    }
  }

  try {
    const updated = await updateStudent(id, data, user.userId, user.parishId, ip, userAgent)
    if (!updated) return errorResponse(c, 'NOT_FOUND', 'Học sinh không tồn tại', 404)
    return successResponse(c, updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi cập nhật học sinh'
    return errorResponse(c, 'UPDATE_FAILED', message, 400)
  }
})

studentsRouter.delete('/:id', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const success = await deleteStudent(id, user.userId, user.parishId, ip, userAgent)
  if (!success) return errorResponse(c, 'NOT_FOUND', 'Học sinh không tồn tại', 404)
  return successResponse(c, { id, deleted: true })
})

export default studentsRouter
