import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { errorResponse, successResponse } from '../utils/response.js'
import {
  commitTiniAttendance, listTiniCandidates, listTiniLinks, previewTiniAttendance,
  retireTiniLink, saveSuggestedTiniLinks, saveTiniLink,
} from '../services/TiniAttendanceImportService.js'

const router = new Hono()
router.use('*', authMiddleware, roleMiddleware('admin'))

function sendFailure(c: any, cause: unknown) {
  const fault = cause as Error & { status?: number }
  const status = fault.status && [400, 403, 404, 409, 413].includes(fault.status) ? fault.status : 500
  return errorResponse(c, status === 409 ? 'TINI_IMPORT_CONFLICT' : 'TINI_IMPORT_ERROR',
    status === 500 ? 'Không thể xử lý tệp TINI. Vui lòng thử lại.' : fault.message, status)
}

router.post('/preview', zValidator('json', z.object({ sourceFile: z.string().max(1024 * 1024) }).strict()), async c => {
  const user = c.get('user') as JwtPayload
  try {
    return successResponse(c, await previewTiniAttendance(c.req.valid('json').sourceFile,
      user.userId, user.parishId), 201)
  } catch (cause) { return sendFailure(c, cause) }
})

router.post('/commit', zValidator('json', z.object({
  runId: z.string().min(1).max(100),
  sourceFile: z.string().max(1024 * 1024),
  selectedIndexes: z.array(z.number().int().min(0)).min(1).max(500),
}).strict()), async c => {
  const user = c.get('user') as JwtPayload
  const command = c.req.valid('json')
  try {
    return successResponse(c, await commitTiniAttendance(command.sourceFile, command.runId,
      command.selectedIndexes, { userId: user.userId, parishId: user.parishId,
        role: user.role, epoch: user.tokenVersion }))
  } catch (cause) { return sendFailure(c, cause) }
})

router.get('/links', async c => {
  const user = c.get('user') as JwtPayload
  try { return successResponse(c, await listTiniLinks(user.parishId)) }
  catch (cause) { return sendFailure(c, cause) }
})

const linkSchema = z.object({
  entityKind: z.enum(['student', 'class']),
  externalScope: z.string().regex(/^[A-Za-z0-9_-]{0,64}$/),
  externalId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  targetId: z.string().min(1).max(100),
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().min(8).max(500),
  sourceYearLabel: z.string().regex(/^\d{4}-\d{4}$/).optional(),
}).strict()

router.post('/links', zValidator('json', linkSchema), async c => {
  const user = c.get('user') as JwtPayload
  try {
    return successResponse(c, await saveTiniLink({ ...c.req.valid('json'),
      parishId: user.parishId, actorId: user.userId }), 201)
  } catch (cause) { return sendFailure(c, cause) }
})

router.post('/links/bulk', zValidator('json', z.object({
  runId: z.string().min(1).max(100),
  sourceFile: z.string().max(1024 * 1024),
  selected: z.array(z.object({
    entityKind: z.enum(['student', 'class']),
    externalId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    targetId: z.string().min(1).max(100),
  }).strict()).min(1).max(500),
  reason: z.string().trim().min(8).max(500),
}).strict()), async c => {
  const user = c.get('user') as JwtPayload
  const command = c.req.valid('json')
  try {
    return successResponse(c, await saveSuggestedTiniLinks({
      raw: command.sourceFile, runId: command.runId, selected: command.selected,
      reason: command.reason, parishId: user.parishId, actorId: user.userId,
    }), 201)
  } catch (cause) { return sendFailure(c, cause) }
})

router.post('/links/:id/retire', zValidator('json', z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(8).max(500),
}).strict()), async c => {
  const user = c.get('user') as JwtPayload
  try {
    return successResponse(c, await retireTiniLink({ id: c.req.param('id'),
      ...c.req.valid('json'), parishId: user.parishId, actorId: user.userId }))
  } catch (cause) { return sendFailure(c, cause) }
})

router.get('/candidates', async c => {
  const user = c.get('user') as JwtPayload
  const sourceYear = c.req.query('year')
  if (!sourceYear || !/^\d{4}-\d{4}$/.test(sourceYear)) {
    return errorResponse(c, 'TINI_IMPORT_ERROR', 'Thiếu niên học cần đối chiếu.', 400)
  }
  try {
    return successResponse(c, await listTiniCandidates(user.parishId, sourceYear))
  } catch (cause) { return sendFailure(c, cause) }
})

export default router
