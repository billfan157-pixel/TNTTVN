import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { securityHeaders, rateLimiter, loginRateLimiter } from './middleware/security.js'
import authRouter from './routes/auth.js'
import studentsRouter from './routes/students.js'
import gradesRouter from './routes/grades.js'
import attendanceRouter from './routes/attendance.js'
import noticesRouter from './routes/notices.js'
import notificationsRouter from './routes/notifications.js'
import usersRouter from './routes/users.js'
import { saveDb } from './db/index.js'
import { initTelegramBot, sendTelegramInfo } from './services/telegram.js'

const app = new Hono()

const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://localhost:4173', 'https://tnttvn.vercel.app']

app.use('/*', securityHeaders)
app.use('/*', cors({ origin: allowedOrigins, credentials: true }))
app.use('/api/*', rateLimiter)
app.use('/api/*', bodyLimit({ maxSize: 10 * 1024 * 1024 }))
app.use('/api/auth/login', loginRateLimiter)

app.get('/health', async (c) => {
  try {
    saveDb()
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
  } catch (err) {
    return c.json({ status: 'error', message: 'Database unavailable' }, 503)
  }
})

app.route('/api/auth', authRouter)
app.route('/api/students', studentsRouter)
app.route('/api/grades', gradesRouter)
app.route('/api/attendance', attendanceRouter)
app.route('/api/notices', noticesRouter)
app.route('/api/notifications', notificationsRouter)
app.route('/api/users', usersRouter)

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'

serve({ fetch: app.fetch, port: PORT, hostname: HOST })
console.log(`Server running at http://${HOST}:${PORT}`)

initTelegramBot()
sendTelegramInfo(`🟢 Server khởi động thành công\n🕐 ${new Date().toLocaleString('vi-VN')}\n📍 Port: ${PORT}`)
