import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
} from '../services/studentService.js'

const studentsRouter = new Hono()
studentsRouter.use('*', authMiddleware)

const studentSchema = z.object({
  holyName: z.string().trim().min(1).max(100),
  fullName: z.string().trim().min(1).max(200),
  gender: z.enum(['Nam', 'Nữ']),
  dateOfBirth: z.string(),
  baptismDate: z.string().trim().optional(),
  firstCommunionDate: z.string().trim().optional(),
  confirmationDate: z.string().trim().optional(),
  parentName: z.string().trim().min(1).max(200).default(''),
  parentPhone: z.string().trim().min(1).max(20).regex(/^(\+84|0)\d{9,10}$/, 'Số điện thoại không hợp lệ').default(''),
  address: z.string().trim().min(1).max(500).default(''),
  branch: z.enum(['ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi']),
  classId: z.string().trim().min(1),
  status: z.enum(['Đang học', 'Nghỉ học', 'Tạm vắng']).default('Đang học'),
  notes: z.string().trim().max(1000).optional(),
})

studentsRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const updatedAfter = c.req.query('updatedAfter')
  const list = await getStudents(user.parishId, updatedAfter)
  return listResponse(c, list)
})

studentsRouter.get('/:id', async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const student = await getStudentById(id, user.parishId)
  if (!student) return errorResponse(c, 'NOT_FOUND', 'Học sinh không tồn tại', 404)
  return successResponse(c, student)
})

studentsRouter.post('/', roleMiddleware('admin', 'chunhiem'), zValidator('json', studentSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const data = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const created = await createStudent(data, user.userId, user.parishId, ip, userAgent)
  return successResponse(c, created, 201)
})

studentsRouter.put('/:id', roleMiddleware('admin', 'chunhiem'), zValidator('json', studentSchema.partial()), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const updated = await updateStudent(id, data, user.userId, user.parishId, ip, userAgent)
  if (!updated) return errorResponse(c, 'NOT_FOUND', 'Học sinh không tồn tại', 404)
  return successResponse(c, updated)
})

studentsRouter.delete('/:id', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || ''
  const userAgent = c.req.header('user-agent') || ''

  const success = await deleteStudent(id, user.userId, user.parishId, ip, userAgent)
  if (!success) return errorResponse(c, 'NOT_FOUND', 'Học sinh không tồn tại', 404)
  return successResponse(c, { id, deleted: true })
})

export default studentsRouter
