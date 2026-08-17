import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { securityHeaders, rateLimiter, loginRateLimiter, refreshRateLimiter } from './middleware/security.js'
import authRouter from './routes/auth.js'
import studentsRouter from './routes/students.js'
import gradesRouter from './routes/grades.js'
import attendanceRouter from './routes/attendance.js'
import noticesRouter from './routes/notices.js'
import notificationsRouter from './routes/notifications.js'
import usersRouter from './routes/users.js'
import classesRouter from './routes/classes.js'
import auditLogsRouter from './routes/auditLogs.js'
import importRouter from './routes/import.js'
import settingsRouter from './routes/settings.js'
import { client } from './db/index.js'
import { seedIfEmpty } from './seed.js'
import { isOriginAllowed, resolveAllowedOrigins } from './utils/originPolicy.js'
import { initTelegramBot, sendTelegramInfo } from './services/telegram.js'
import { registerOutboxSubscribers, startOutboxWorker, stopOutboxWorker } from './services/outboxService.js'
import { initNotificationQueue } from './services/notificationQueue.js'
import { initSundayReminderScheduler } from './services/sundayReminderScheduler.js'
import { initBackupScheduler, stopBackupScheduler } from './services/backupScheduler.js'

const app = new Hono()

app.onError((err, c) => {
  if (err.message && (err.message.includes('không hợp lệ') || err.message.includes('không đúng định dạng') || err.message.includes('required'))) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400)
  }
  console.error(`[${c.req.method} ${c.req.path}] Unhandled error:`, err)
  const detail = process.env.NODE_ENV === 'development' ? err.message : undefined
  return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error', details: detail } }, 500)
})

// A13 (2026-08-10): CORS allowlist CỨNG — CHỈ tnttvn.vercel.app + localhost dev (hoặc
// CLIENT_ORIGIN env). Đã xóa wildcard `*.vercel.app` (trước đây cho phép bất kỳ
// project vercel nào — attack surface dư thừa; xem SECURITY_AUDIT_LOG A13).
const allowedOrigins = resolveAllowedOrigins()

// CORS - use Hono's built-in cors with dynamic origin (allowlist cứng — xem utils/originPolicy.ts)
app.use('/*', cors({
  origin: (origin) => isOriginAllowed(origin, allowedOrigins) ? origin : null,
  credentials: true,
  allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400,
}))

app.use('/*', securityHeaders)
app.use('/api/*', rateLimiter)
app.use('/api/*', bodyLimit({ maxSize: 10 * 1024 * 1024 }))
app.use('/api/auth/login', loginRateLimiter)
app.use('/api/auth/refresh', refreshRateLimiter)

import promotionRouter from './routes/promotion.js'
import reportingRouter from './routes/reporting.js'
import verificationRouter from './routes/verification.js'
import backupRouter from './routes/backup.js'
import healthRouter from './routes/health.js'
import semesterLocksRouter from './routes/semesterLocks.js'
import academicYearsRouter from './routes/academicYears.js'
import systemRouter from './routes/system.js'
import parentsRouter from './routes/parents.js'
import examsRouter from './routes/exams.js'
import leaveRequestsRouter from './routes/leaveRequests.js'
import { financesRouter } from './routes/finances.js'
import { loggerMiddleware } from './middleware/logger.js'
import { metricsMiddleware } from './middleware/metrics.js'

app.use('/*', loggerMiddleware)
app.use('/*', metricsMiddleware)
app.route('/', healthRouter)

app.route('/api/auth', authRouter)
// ADR-016 (routing audit): importRouter phải mount TRƯỚC studentsRouter vì cả hai cùng
// prefix /api/students và Hono ưu tiên route đăng ký trước ở cùng độ sâu — nếu không,
// GET /history, GET /mappings (static 1 segment) bị GET /:id nuốt → luôn 404 NOT_FOUND.
app.route('/api/students', importRouter)
app.route('/api/students', studentsRouter)
app.route('/api/grades', gradesRouter)
app.route('/api/attendance', attendanceRouter)
app.route('/api/notices', noticesRouter)
app.route('/api/notifications', notificationsRouter)
app.route('/api/users', usersRouter)
app.route('/api/classes', classesRouter)
app.route('/api/audit-logs', auditLogsRouter)
app.route('/api/settings', settingsRouter)
app.route('/api/promotion', promotionRouter)
app.route('/api/reports', reportingRouter)
app.route('/api/verification', verificationRouter)
app.route('/api/backup', backupRouter)
app.route('/api/semester-locks', semesterLocksRouter)
app.route('/api/academic-years', academicYearsRouter)
app.route('/api/system', systemRouter)
app.route('/api/parents', parentsRouter)
app.route('/api/exams', examsRouter)
app.route('/api/leave-requests', leaveRequestsRouter)
app.route('/api/finances', financesRouter)

// A-NEW-49 (2026-08-17): Railway injects PORT env at runtime và DÙNG giá trị này
// cho healthcheck + public routing. Code cũ (3f01bd0) đọc process.env.PORT → bind
// 8080 → healthcheck /health PASS. Bản rewrite đọc SERVER_PORT (không set) → bind
// 3001 trong khi Railway probe 8080 → "service unavailable" (deploy FAILED 3f6bc7e1).
// SERVER_PORT giữ làm override tường minh (docker-compose/local); PORT là contract
// Railway (docker-compose cũng dùng PORT=3000 theo .env.example) — fallback 3001 dev.
const PORT = Number(process.env.SERVER_PORT) || Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'

try {
  await seedIfEmpty()
} catch (err) {
  console.error('Seed failed:', err)
}

// A-NEW-38 (2026-08-11): XÓA block reset admin password khỏi startup.
// Trước đây block này ghi đè passwordHash của admin `bill` mỗi lần khởi động khi
// SEED_ADMIN_PASSWORD tồn tại + (NODE_ENV != production hoặc ALLOW_SEED_ADMIN_RESET=true)
// → mật khẩu user đặt qua UI bị reset về SEED_ADMIN_PASSWORD sau mỗi restart/deploy
// (lỗi "sai mật khẩu" dù pass cũ vẫn đúng). Việc tạo admin ban đầu đã do seedIfEmpty()
// lo (chỉ chạy khi DB trống) — block này thừa và nguy hiểm. Không còn reset vô tình.

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST })
console.log(`Server running at http://${HOST}:${PORT}`)

const gracefulShutdown = async (signal: string) => {
  console.log(`[shutdown] Received ${signal}, shutting down gracefully...`)
  try { await client.execute('PRAGMA wal_checkpoint(TRUNCATE)') } catch {}
  stopBackupScheduler()
  stopOutboxWorker()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

initTelegramBot()
registerOutboxSubscribers()
startOutboxWorker(10000)
await initNotificationQueue()
initSundayReminderScheduler()
initBackupScheduler()
sendTelegramInfo(`🟢 Server khởi động thành công\n🕐 ${new Date().toLocaleString('vi-VN')}\n📍 Port: ${PORT}`)
