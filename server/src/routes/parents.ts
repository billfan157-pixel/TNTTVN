import { Hono } from 'hono'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { errorResponse, successResponse } from '../utils/response.js'
import { getMyChildren } from '../services/parentService.js'
import { db } from '../db/index.js'
import { auditLogs } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { getClientIp } from '../utils/ip.js'
import {
  createTelegramLinkToken,
  getTelegramLinkStatus,
  revokeTelegramLink,
  setTelegramNotifications,
} from '../services/telegramLinkService.js'

// Cổng phụ huynh: mọi endpoint giới hạn role phuhuynh — phụ huynh chỉ thấy
// con của mình (khớp số điện thoại) và phiếu điểm qua /api/reports/report-card.
const parentsRouter = new Hono()
parentsRouter.use('*', authMiddleware)

parentsRouter.get('/my-children', roleMiddleware('phuhuynh'), async (c) => {
  const user = c.get('user') as JwtPayload
  const children = await getMyChildren(user.userId, user.parishId)
  return successResponse(c, children)
})

parentsRouter.post('/telegram/link-token', roleMiddleware('phuhuynh'), async (c) => {
  const user = c.get('user') as JwtPayload
  try {
    const result = await createTelegramLinkToken(user.userId, user.parishId)
    return successResponse(c, result, 201)
  } catch (error: any) {
    if (error?.code === 'PARENT_ACCOUNT_REQUIRED') {
      return errorResponse(c, error.code, error.message, 403)
    }
    console.error('Telegram link token creation failed:', error)
    return errorResponse(c, 'TELEGRAM_LINK_TOKEN_FAILED', 'Không thể tạo mã liên kết Telegram', 500)
  }
})

parentsRouter.get('/telegram/status', roleMiddleware('phuhuynh'), async (c) => {
  const user = c.get('user') as JwtPayload
  return successResponse(c, await getTelegramLinkStatus(user.userId, user.parishId))
})

parentsRouter.post('/telegram/notifications', roleMiddleware('phuhuynh'), async (c) => {
  const user = c.get('user') as JwtPayload
  let body: { enabled?: unknown }
  try {
    body = await c.req.json<{ enabled?: unknown }>()
  } catch {
    return errorResponse(c, 'VALIDATION_ERROR', 'Request body không hợp lệ', 400)
  }

  if (typeof body.enabled !== 'boolean') {
    return errorResponse(c, 'VALIDATION_ERROR', 'enabled phải là boolean', 400)
  }

  const links = await getTelegramLinkStatus(user.userId, user.parishId)
  const activeLinks = links.filter((link) => link.status === 'ACTIVE')
  if (activeLinks.length === 0) {
    return errorResponse(c, 'TELEGRAM_NOT_LINKED', 'Tài khoản chưa được liên kết Telegram', 404)
  }

  // Parent accounts are currently provisioned one-per-phone. Updating all
  // active links keeps consent explicit if a future account has multiple chats.
  for (const link of activeLinks) {
    await setTelegramNotifications(link.chatId, body.enabled)
  }

  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''
  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: user.userId,
    action: 'UPDATE_TELEGRAM_NOTIFICATIONS',
    entityType: 'parent',
    entityId: user.userId,
    newValue: JSON.stringify({ enabled: body.enabled }),
    ip,
    userAgent,
    parishId: user.parishId,
  })

  return successResponse(c, { enabled: body.enabled, updatedLinks: activeLinks.length })
})

parentsRouter.delete('/telegram/link', roleMiddleware('phuhuynh'), async (c) => {
  const user = c.get('user') as JwtPayload
  const links = await getTelegramLinkStatus(user.userId, user.parishId)
  const activeLinks = links.filter((link) => link.status === 'ACTIVE')
  for (const link of activeLinks) {
    await revokeTelegramLink(link.chatId)
  }

  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''
  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: user.userId,
    action: 'REVOKE_TELEGRAM_LINK',
    entityType: 'parent',
    entityId: user.userId,
    newValue: JSON.stringify({ revokedLinks: activeLinks.length }),
    ip,
    userAgent,
    parishId: user.parishId,
  })

  return successResponse(c, { revokedLinks: activeLinks.length })
})

export default parentsRouter
