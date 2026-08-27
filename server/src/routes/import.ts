import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, getUserClassIds, isAdmin, checkUserClassAccess } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { listResponse, successResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { generateId } from '../utils/id.js'
import { validateImport, importStudents, undoImport, getImportHistory, getMappingMemory, saveMappingMemory, deleteMappingMemory } from '../services/importService.js'
import { getClasses } from '../services/classService.js'
import { importBatchStudents, importBatches, students } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'

const importRouter = new Hono()
importRouter.use('*', authMiddleware)

const stringField = (max: number) => z.preprocess((v) => (v == null ? '' : String(v)), z.string().trim().max(max))
const importRowSchema = z.object({
  rowIndex: z.coerce.number().int().min(0).max(100000),
  holyName: stringField(100), fullName: stringField(200), gender: stringField(10),
  dateOfBirth: stringField(20), parentName: stringField(200), parentPhone: stringField(20),
  address: stringField(500), branch: stringField(50), className: stringField(200),
  service: z.preprocess((v) => (v == null ? undefined : String(v)), z.string().trim().max(50).optional()),
})

const boundedRecord = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.record(z.string().max(200), valueSchema).refine((value) => Object.keys(value).length <= 2000, 'Tối đa 2000 ánh xạ')

importRouter.post('/validate', roleMiddleware('admin', 'chunhiem'), zValidator('json', z.object({
  // Cap tường minh chống DoS bộ nhớ (trước đây chỉ bị chặn gián tiếp bởi bodyLimit 10MB).
  // 2000 dòng ≈ quy mô giáo xứ lớn nhất + dư địa; khớp convention cap batch của repo.
  rows: z.array(importRowSchema).max(2000),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const { rows } = c.req.valid('json')
  try {
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)

    const classes = await getClasses(user.parishId)
    const availableClasses = allowedClassIds !== null ? classes.filter(c => allowedClassIds.includes(c.id)) : classes
    const flatClasses = availableClasses.map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      branchId: c.branchId,
      branchName: c.branchName || '',
    }))

    const result = await validateImport(rows, user.parishId, flatClasses, allowedClassIds)
    return successResponse(c, result)
  } catch (err: any) {
    const msg = err?.message || String(err)
    const stack = err?.stack || ''
    const referenceId = generateId('ERR')
    console.error(JSON.stringify({
      level: 'ERROR',
      type: 'VALIDATE_IMPORT_FAILED',
      referenceId,
      parishId: user.parishId,
      userId: user.userId,
      rowCount: rows?.length ?? 0,
      error: msg,
      stack: stack.slice(0, 2000),
    }))
    // Giữ hợp đồng cũ (success envelope) nhưng trả 500 có code để client hiển thị đúng
    return errorResponse(c, 'VALIDATE_FAILED', `Không thể kiểm tra dữ liệu lúc này. Mã tham chiếu: ${referenceId}`, 500)
  }
})

importRouter.post('/import', roleMiddleware('admin', 'chunhiem'), zValidator('json', z.object({
  // Cap tường minh chống DoS — xem chú thích POST /validate.
  rows: z.array(importRowSchema).max(2000),
  classMappings: boundedRecord(z.string().trim().max(100).nullable()),
  newClasses: z.array(z.object({
    name: z.string().trim().min(1).max(200), branch: z.string().trim().min(1).max(50),
    academicYearId: z.string().trim().min(1).max(100),
  })).max(2000).optional().default([]),
  duplicateActions: boundedRecord(z.enum(['skip', 'update', 'create'])),
  fileName: z.string().trim().max(255).optional(),
  serviceExclusions: z.array(z.number().int().min(0).max(100000)).max(2000).optional(),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const body = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''
  const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)

  try {
    const result = await importStudents(body, user.userId, user.parishId, ip, userAgent, allowedClassIds)
    return successResponse(c, result)
  } catch (err: any) {
    const message = String(err?.message || '')
    if (message.includes('không có quyền')) return errorResponse(c, 'FORBIDDEN', message, 403)
    const referenceId = generateId('ERR')
    console.error('[import] POST /import error:', { referenceId, parishId: user.parishId, userId: user.userId, error: err })
    return errorResponse(c, 'IMPORT_FAILED', `Không thể import dữ liệu lúc này. Mã tham chiếu: ${referenceId}`, 500)
  }
})

importRouter.post('/undo/:batchId', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const batchId = c.req.param('batchId')

  try {
    const result = await undoImport(batchId, user.parishId)
    return successResponse(c, result)
  } catch (err: any) {
    return errorResponse(c, 'UNDO_FAILED', err.message, 400)
  }
})

importRouter.get('/history', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100)
  const offset = Number(c.req.query('offset')) || 0

  const filterUserId = isAdmin(user) ? undefined : user.userId
  const result = await getImportHistory(user.parishId, limit, offset, filterUserId)
  return listResponse(c, result.rows, result.total)
})

// Mapping Memory (Learning System)
importRouter.get('/mappings', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const scope = (c.req.query('scope') || 'class') as 'class' | 'student'
  const academicYearId = c.req.query('academicYearId') || undefined
  const result = await getMappingMemory(user.parishId, scope, academicYearId)
  return successResponse(c, result)
})

importRouter.post('/mappings', roleMiddleware('admin', 'chunhiem'), zValidator('json', z.object({
  scope: z.enum(['class', 'student']),
  alias: z.string().min(1),
  entityId: z.string().min(1),
  entityName: z.string().optional(),
  academicYearId: z.string().optional(),
})), async (c) => {
  const user = c.get('user') as JwtPayload
  const body = c.req.valid('json')

  if (!isAdmin(user)) {
    if (body.scope === 'class') {
      const allowed = await checkUserClassAccess(user.userId, user.parishId, body.entityId)
      if (!allowed) {
        return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền lưu ghi nhớ ánh xạ cho lớp này', 403)
      }
    } else if (body.scope === 'student') {
      const [st] = await db
        .select({ classId: students.classId })
        .from(students)
        .where(and(eq(students.id, body.entityId), eq(students.parishId, user.parishId), isNull(students.deletedAt)))
        .limit(1)
      if (!st || !(await checkUserClassAccess(user.userId, user.parishId, st.classId))) {
        return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền lưu ghi nhớ ánh xạ cho thiếu nhi này', 403)
      }
    }
  }

  await saveMappingMemory({
    parishId: user.parishId,
    scope: body.scope,
    alias: body.alias,
    entityId: body.entityId,
    entityName: body.entityName,
    academicYearId: body.academicYearId,
    userId: user.userId,
  })
  return successResponse(c, { success: true })
})

importRouter.delete('/mappings/:id', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const id = c.req.param('id')
  await deleteMappingMemory(id, user.parishId)
  return successResponse(c, { success: true })
})

importRouter.get('/batch/:batchId', roleMiddleware('admin', 'chunhiem'), async (c) => {
  const user = c.get('user') as JwtPayload
  const batchId = c.req.param('batchId')

  if (!isAdmin(user)) {
    const [batch] = await db
      .select({ userId: importBatches.userId })
      .from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.parishId, user.parishId)))
      .limit(1)

    if (batch && batch.userId !== user.userId) {
      return errorResponse(c, 'FORBIDDEN', 'Bạn không có quyền xem chi tiết lượt import của người khác', 403)
    }
  }

  const details = await db
    .select()
    .from(importBatchStudents)
    .where(and(eq(importBatchStudents.batchId, batchId), eq(importBatchStudents.parishId, user.parishId)))
    .orderBy(importBatchStudents.rowIndex)

  const counts: Record<string, number> = {}
  for (const d of details) {
    counts[d.action] = (counts[d.action] || 0) + 1
  }

  return successResponse(c, { rows: details, counts })
})

export default importRouter
