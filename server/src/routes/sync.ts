import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { successResponse } from '../utils/response.js'

const syncRouter = new Hono()
syncRouter.use('*', authMiddleware)

// The client captures this watermark before pulling a snapshot window. It must
// never advance its durable cursor using the device clock.
syncRouter.get('/watermark', (c) => successResponse(c, {
  serverTime: new Date().toISOString(),
  cursorVersion: 1,
}))

export default syncRouter
