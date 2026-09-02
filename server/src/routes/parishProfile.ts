import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { deleteObject, getObject, isR2Enabled, putObject } from '../services/blobStorage.js'
import {
  createExternalParishAsset,
  createParishPeople,
  createParishPerson,
  createParishRecord,
  createParishTerm,
  createParishUnit,
  createUploadedParishAsset,
  deleteParishAsset,
  deleteParishPerson,
  deleteParishRecord,
  deleteParishTerm,
  deleteParishUnit,
  getDownloadableParishAsset,
  getParishProfileSnapshot,
  updateParishAsset,
  updateParishPerson,
  updateParishProfile,
  updateParishRecord,
  updateParishTerm,
  updateParishUnit,
} from '../services/parishProfileService.js'
import type { MutationContext, ParishProfileRole } from '../types/parishProfile.js'
import { getClientIp } from '../utils/ip.js'
import { errorResponse, successResponse } from '../utils/response.js'
import { isValidIsoDate } from '../utils/date.js'

const parishProfileRouter = new Hono()
parishProfileRouter.use('*', authMiddleware)
parishProfileRouter.use('*', roleMiddleware('admin', 'chunhiem', 'phuta'))

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD')
  .refine(isValidIsoDate, 'Ngày không tồn tại trong lịch')
const nullableDateField = z.union([dateField, z.literal(''), z.null()]).optional()
const nullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional()
const idList = z.array(z.string().trim().min(1).max(80)).max(50).default([])
const visibility = z.enum(['STAFF', 'ADMIN'])
const currentYear = new Date().getUTCFullYear()

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(150),
  patronName: nullableText(150),
  foundedDate: nullableDateField,
  motto: nullableText(300),
  description: nullableText(5000),
})

const personSchema = z.object({
  linkedUserId: nullableText(80),
  holyName: nullableText(100),
  fullName: z.string().trim().min(1).max(200),
  birthYear: z.number().int().min(1900).max(currentYear).nullable().optional(),
  biography: nullableText(5000),
  serviceStatus: z.enum(['ACTIVE', 'FORMER', 'DECEASED']),
  visibility,
})
const peopleImportSchema = z.object({ people: z.array(personSchema).min(1).max(100) })

const unitSchema = z.object({
  parentId: nullableText(80),
  name: z.string().trim().min(1).max(200),
  unitType: z.enum(['BOARD', 'COMMITTEE', 'BRANCH', 'CHAPTER', 'OTHER']),
  description: nullableText(3000),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
})

const termSchema = z.object({
  personId: z.string().trim().min(1).max(80),
  unitId: nullableText(80),
  positionTitle: z.string().trim().min(1).max(200),
  rankTitle: nullableText(150),
  startDate: dateField,
  endDate: nullableDateField,
  notes: nullableText(3000),
}).superRefine((value, ctx) => {
  if (value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Ngày kết thúc không được trước ngày bắt đầu' })
  }
})

const recordSchema = z.object({
  recordType: z.enum(['MILESTONE', 'ACTIVITY', 'ACHIEVEMENT']),
  title: z.string().trim().min(1).max(250),
  summary: nullableText(1000),
  content: nullableText(20000),
  occurredOn: dateField,
  endedOn: nullableDateField,
  location: nullableText(300),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  visibility,
  showOnTimeline: z.boolean().default(true),
  sourceEventId: nullableText(80),
  personIds: idList,
  assetIds: idList,
}).superRefine((value, ctx) => {
  if (value.endedOn && value.endedOn < value.occurredOn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endedOn'], message: 'Ngày kết thúc không được trước ngày bắt đầu' })
  }
})

const assetBaseSchema = z.object({
  assetType: z.enum(['IMAGE', 'VIDEO', 'POSTER', 'DOCUMENT', 'MINUTES', 'CERTIFICATE', 'OTHER']),
  title: z.string().trim().min(1).max(250),
  description: nullableText(3000),
  capturedOn: nullableDateField,
  visibility,
  recordIds: idList,
})

const externalAssetSchema = assetBaseSchema.extend({
  externalUrl: z.string().trim().max(1500).url().refine(value => {
    const protocol = new URL(value).protocol
    return protocol === 'https:'
  }, 'Tư liệu ngoài phải dùng HTTPS'),
})

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const ALLOWED_UPLOADS = {
  'image/jpeg': { extension: 'jpg', signature: (buf: Buffer) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  'image/png': { extension: 'png', signature: (buf: Buffer) => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', signature: (buf: Buffer) => buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP' },
  'application/pdf': { extension: 'pdf', signature: (buf: Buffer) => buf.subarray(0, 5).toString('ascii') === '%PDF-' },
} as const

function mutationContext(c: any): MutationContext {
  const user = c.get('user') as JwtPayload
  return {
    userId: user.userId,
    parishId: user.parishId,
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent') || '',
  }
}

function serviceFailure(c: any, error: unknown) {
  const err = error as Error & { status?: number; code?: string }
  const status = [400, 403, 404, 409, 500].includes(err.status ?? 0) ? err.status! : 500
  const message = status === 500 ? 'Không thể xử lý Hồ sơ Xứ đoàn' : err.message
  return errorResponse(c, err.code || 'PARISH_PROFILE_ERROR', message, status)
}

function parseRecordIds(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return idList.parse(parsed)
  } catch {
    throw Object.assign(new Error('recordIds phải là mảng JSON hợp lệ'), { status: 400, code: 'INVALID_RECORD_IDS' })
  }
}

function safeOriginalFilename(name: string): string {
  return [...path.basename(name)]
    .filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .slice(0, 255) || 'tu-lieu'
}

parishProfileRouter.get('/', async c => {
  try {
    const user = c.get('user') as JwtPayload
    return successResponse(c, await getParishProfileSnapshot(user.parishId, user.role as ParishProfileRole))
  } catch (error) {
    return serviceFailure(c, error)
  }
})

parishProfileRouter.put('/profile', roleMiddleware('admin'), zValidator('json', profileSchema), async c => {
  try { return successResponse(c, await updateParishProfile(c.req.valid('json'), mutationContext(c))) }
  catch (error) { return serviceFailure(c, error) }
})

parishProfileRouter.post('/people', roleMiddleware('admin'), zValidator('json', personSchema), async c => {
  try { return successResponse(c, await createParishPerson(c.req.valid('json'), mutationContext(c)), 201) }
  catch (error) { return serviceFailure(c, error) }
})
parishProfileRouter.post('/people/import', roleMiddleware('admin'), zValidator('json', peopleImportSchema), async c => {
  try { return successResponse(c, { people: await createParishPeople(c.req.valid('json').people, mutationContext(c)) }, 201) }
  catch (error) { return serviceFailure(c, error) }
})
parishProfileRouter.put('/people/:id', roleMiddleware('admin'), zValidator('json', personSchema), async c => {
  try { return successResponse(c, await updateParishPerson(c.req.param('id'), c.req.valid('json'), mutationContext(c))) }
  catch (error) { return serviceFailure(c, error) }
})
parishProfileRouter.delete('/people/:id', roleMiddleware('admin'), async c => {
  try { return successResponse(c, { deleted: await deleteParishPerson(c.req.param('id'), mutationContext(c)) }) }
  catch (error) { return serviceFailure(c, error) }
})

parishProfileRouter.post('/units', roleMiddleware('admin'), zValidator('json', unitSchema), async c => {
  try { return successResponse(c, await createParishUnit(c.req.valid('json'), mutationContext(c)), 201) }
  catch (error) { return serviceFailure(c, error) }
})
parishProfileRouter.put('/units/:id', roleMiddleware('admin'), zValidator('json', unitSchema), async c => {
  try { return successResponse(c, await updateParishUnit(c.req.param('id'), c.req.valid('json'), mutationContext(c))) }
  catch (error) { return serviceFailure(c, error) }
})
parishProfileRouter.delete('/units/:id', roleMiddleware('admin'), async c => {
  try { return successResponse(c, { deleted: await deleteParishUnit(c.req.param('id'), mutationContext(c)) }) }
  catch (error) { return serviceFailure(c, error) }
})

parishProfileRouter.post('/terms', roleMiddleware('admin'), zValidator('json', termSchema), async c => {
  try { return successResponse(c, await createParishTerm(c.req.valid('json'), mutationContext(c)), 201) }
  catch (error) { return serviceFailure(c, error) }
})
parishProfileRouter.put('/terms/:id', roleMiddleware('admin'), zValidator('json', termSchema), async c => {
  try { return successResponse(c, await updateParishTerm(c.req.param('id'), c.req.valid('json'), mutationContext(c))) }
  catch (error) { return serviceFailure(c, error) }
})
parishProfileRouter.delete('/terms/:id', roleMiddleware('admin'), async c => {
  try { return successResponse(c, { deleted: await deleteParishTerm(c.req.param('id'), mutationContext(c)) }) }
  catch (error) { return serviceFailure(c, error) }
})

parishProfileRouter.post('/records', roleMiddleware('admin'), zValidator('json', recordSchema), async c => {
  try { return successResponse(c, await createParishRecord(c.req.valid('json'), mutationContext(c)), 201) }
  catch (error) { return serviceFailure(c, error) }
})
parishProfileRouter.put('/records/:id', roleMiddleware('admin'), zValidator('json', recordSchema), async c => {
  try { return successResponse(c, await updateParishRecord(c.req.param('id'), c.req.valid('json'), mutationContext(c))) }
  catch (error) { return serviceFailure(c, error) }
})
parishProfileRouter.delete('/records/:id', roleMiddleware('admin'), async c => {
  try { return successResponse(c, { deleted: await deleteParishRecord(c.req.param('id'), mutationContext(c)) }) }
  catch (error) { return serviceFailure(c, error) }
})

parishProfileRouter.post('/assets/external', roleMiddleware('admin'), zValidator('json', externalAssetSchema), async c => {
  try { return successResponse(c, await createExternalParishAsset(c.req.valid('json'), mutationContext(c)), 201) }
  catch (error) { return serviceFailure(c, error) }
})

parishProfileRouter.post('/assets/upload', roleMiddleware('admin'), async c => {
  let objectKey: string | null = null
  try {
    if (process.env.NODE_ENV === 'production' && !isR2Enabled) {
      return c.json({ success: false, error: { code: 'ARCHIVE_STORAGE_UNAVAILABLE', message: 'Kho tư liệu production chưa cấu hình R2' } }, 503)
    }
    const form = await c.req.raw.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
      return errorResponse(c, 'ARCHIVE_FILE_REQUIRED', 'Vui lòng chọn file tư liệu', 400)
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return errorResponse(c, 'ARCHIVE_FILE_SIZE', 'File tư liệu phải lớn hơn 0 và không vượt quá 8 MiB', 400)
    }
    const rule = ALLOWED_UPLOADS[file.type as keyof typeof ALLOWED_UPLOADS]
    if (!rule) return errorResponse(c, 'ARCHIVE_FILE_TYPE', 'Chỉ hỗ trợ JPEG, PNG, WebP hoặc PDF', 400)

    const base = assetBaseSchema.parse({
      assetType: form.get('assetType'),
      title: form.get('title'),
      description: form.get('description') || null,
      capturedOn: form.get('capturedOn') || null,
      visibility: form.get('visibility'),
      recordIds: parseRecordIds(form.get('recordIds')),
    })
    const bytes = Buffer.from(await file.arrayBuffer())
    if (!rule.signature(bytes)) return errorResponse(c, 'ARCHIVE_SIGNATURE_MISMATCH', 'Nội dung file không khớp định dạng khai báo', 400)

    const user = c.get('user') as JwtPayload
    const parishHash = createHash('sha256').update(user.parishId).digest('hex').slice(0, 20)
    objectKey = `archive/${parishHash}/${randomUUID()}.${rule.extension}`
    await putObject(objectKey, bytes, file.type)
    try {
      const created = await createUploadedParishAsset({
        ...base,
        objectKey,
        originalFilename: safeOriginalFilename(file.name),
        mimeType: file.type,
        sizeBytes: bytes.length,
        checksumSha256: createHash('sha256').update(bytes).digest('hex'),
      }, mutationContext(c))
      return successResponse(c, created, 201)
    } catch (error) {
      await deleteObject(objectKey).catch(() => undefined)
      objectKey = null
      throw error
    }
  } catch (error) {
    if (objectKey) await deleteObject(objectKey).catch(() => undefined)
    return serviceFailure(c, error)
  }
})

parishProfileRouter.put('/assets/:id', roleMiddleware('admin'), zValidator('json', assetBaseSchema), async c => {
  try { return successResponse(c, await updateParishAsset(c.req.param('id'), c.req.valid('json'), mutationContext(c))) }
  catch (error) { return serviceFailure(c, error) }
})
parishProfileRouter.delete('/assets/:id', roleMiddleware('admin'), async c => {
  try { return successResponse(c, { deleted: await deleteParishAsset(c.req.param('id'), mutationContext(c)) }) }
  catch (error) { return serviceFailure(c, error) }
})

parishProfileRouter.get('/assets/:id/download', async c => {
  try {
    const user = c.get('user') as JwtPayload
    const asset = await getDownloadableParishAsset(c.req.param('id'), user.parishId, user.role as ParishProfileRole)
    const body = await getObject(asset.objectKey!)
    if (!body) return errorResponse(c, 'ARCHIVE_OBJECT_MISSING', 'File tư liệu không còn tồn tại trong kho lưu trữ', 404)
    const filename = safeOriginalFilename(asset.originalFilename || `tu-lieu-${asset.id}`)
    c.header('Content-Type', asset.mimeType || 'application/octet-stream')
    c.header('Content-Length', String(body.length))
    c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    c.header('Cache-Control', 'private, no-store')
    return c.body(new Uint8Array(body))
  } catch (error) {
    return serviceFailure(c, error)
  }
})

export default parishProfileRouter
