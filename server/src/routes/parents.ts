import { Hono } from 'hono'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { errorResponse, successResponse } from '../utils/response.js'
import { getMyChildren } from '../services/parentService.js'

// Cổng phụ huynh: mọi endpoint giới hạn role phuhuynh — phụ huynh chỉ thấy
// con của mình (khớp số điện thoại) và phiếu điểm qua /api/reports/report-card.
const parentsRouter = new Hono()
parentsRouter.use('*', authMiddleware)

parentsRouter.get('/my-children', roleMiddleware('phuhuynh'), async (c) => {
  const user = c.get('user') as JwtPayload
  const children = await getMyChildren(user.userId, user.parishId)
  return successResponse(c, children)
})

const retiredTelegramChannel = (c: any) => errorResponse(
  c,
  'CHANNEL_RETIRED',
  'Catevia không còn hỗ trợ thông báo hoặc liên kết Telegram. Vui lòng sử dụng thông báo trong ứng dụng.',
  410,
)

// Compatibility tombstones for installed clients that still expose the former
// Telegram surface. Authentication and parent-role checks remain fail-closed.
parentsRouter.post('/telegram/link-token', roleMiddleware('phuhuynh'), retiredTelegramChannel)
parentsRouter.get('/telegram/status', roleMiddleware('phuhuynh'), retiredTelegramChannel)
parentsRouter.post('/telegram/notifications', roleMiddleware('phuhuynh'), retiredTelegramChannel)
parentsRouter.delete('/telegram/link', roleMiddleware('phuhuynh'), retiredTelegramChannel)

export default parentsRouter
