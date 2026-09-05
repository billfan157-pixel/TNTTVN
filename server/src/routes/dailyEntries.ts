import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, getUserClassIds, isAdmin } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { successResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import {
  upsertDailyEntries,
  deleteDailyEntry,
  listDailyEntries,
  DailyEntryNotFoundError,
  DailyEntryStateError,
  DailyEntryAccessError,
} from '../services/dailyEntryService.js'

const dailyEntriesRouter = new Hono()
dailyEntriesRouter.use('*', authMiddleware)

// Tier 2: attempts nhập tay là first-class ledger rows. id = mã entry ổn định
// của client (DG-...) → idempotent qua PK (parish_id,id), cùng id khác
// payload → 409 IDEMPOTENCY_CONFLICT (mẫu exam_result_mutations).
const entrySchema = z.object({
  id: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/),
  studentId: z.string().trim().min(1),
  academicYear: z.string().trim().regex(/^\d{4}-\d{4}$/),
  semester: z.coerce.number().int().min(1).max(2),
  scoreType: z.enum(['oral', '15m', '1period']),
  value: z.coerce.number().min(0).max(10),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const batchSchema = z.object({
  entries: z.array(entrySchema).min(1).max(500),
})

function handleServiceError(c: any, err: any) {
  if (err instanceof DailyEntryNotFoundError) return errorResponse(c, 'NOT_FOUND', err.message, 404)
  if (err instanceof DailyEntryStateError) return errorResponse(c, 'IDEMPOTENCY_CONFLICT', err.message, 409)
  if (err instanceof DailyEntryAccessError) return errorResponse(c, 'FORBIDDEN', err.message, 403)
  const status = err?.status
  if (status === 400) return errorResponse(c, 'VALIDATION_ERROR', err.message, 400)
  if (status === 403) return errorResponse(c, 'FORBIDDEN', err.message, 403)
  if (status === 404) return errorResponse(c, 'NOT_FOUND', err.message, 404)
  return errorResponse(c, 'DAILY_ENTRY_ERROR', err instanceof Error ? err.message : 'Lỗi điểm hằng ngày', 500)
}

// ─── Batch upsert (admin/chunhiem/phuta lớp mình) — partial-success itemized ───
dailyEntriesRouter.post(
  '/batch',
  roleMiddleware('admin', 'chunhiem', 'phuta'),
  zValidator('json', batchSchema),
  async (c) => {
    const user = c.get('user') as JwtPayload
    const { entries } = c.req.valid('json')
    const ip = getClientIp(c)
    const userAgent = c.req.header('user-agent') || ''
    try {
      const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
      const result = await upsertDailyEntries(entries, user.userId, user.parishId, ip, userAgent, allowedClassIds, { role: user.role, epoch: user.tokenVersion })
      return successResponse(c, result)
    } catch (err) {
      return handleServiceError(c, err)
    }
  },
)

// ─── Xóa 1 attempt tay (chỉ manual_entry) ───
dailyEntriesRouter.delete(
  '/:id',
  roleMiddleware('admin', 'chunhiem', 'phuta'),
  async (c) => {
    const user = c.get('user') as JwtPayload
    const id = c.req.param('id')
    const ip = getClientIp(c)
    const userAgent = c.req.header('user-agent') || ''
    try {
      const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
      const result = await deleteDailyEntry(id, user.userId, user.parishId, ip, userAgent, allowedClassIds, { role: user.role, epoch: user.tokenVersion })
      return successResponse(c, result)
    } catch (err) {
      return handleServiceError(c, err)
    }
  },
)

// ─── List attempts (tay + máy) cho UI daily read-only ───
dailyEntriesRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  try {
    const allowedClassIds = isAdmin(user) ? null : await getUserClassIds(user.userId, user.parishId)
    const semesterRaw = c.req.query('semester')
    const result = await listDailyEntries(
      {
        classId: c.req.query('classId') || undefined,
        studentId: c.req.query('studentId') || undefined,
        semester: semesterRaw !== undefined ? Number(semesterRaw) : undefined,
        academicYear: c.req.query('academicYear') || undefined,
        scoreType: c.req.query('scoreType') || undefined,
      },
      user.parishId,
      allowedClassIds,
    )
    return successResponse(c, result)
  } catch (err) {
    return handleServiceError(c, err)
  }
})

export default dailyEntriesRouter
