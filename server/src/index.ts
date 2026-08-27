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
import { assertDatabaseReady } from './db/schemaHealth.js'
import { seedIfEmpty } from './seed.js'
import { isOriginAllowed, resolveAllowedOrigins } from './utils/originPolicy.js'
import { initTelegramBot, sendTelegramInfo, sendTelegramAlert } from './services/telegram.js'
import { registerOutboxSubscribers, startOutboxWorker, stopOutboxWorker } from './services/outboxService.js'
import { initNotificationQueue } from './services/notificationQueue.js'
import { initSundayReminderScheduler } from './services/sundayReminderScheduler.js'
import { initBackupScheduler, stopBackupScheduler } from './services/backupScheduler.js'
import { startImportRollbackSnapshotCleanup } from './services/importService.js'
import cspReportRouter from './routes/cspReport.js'
import { initSentryNode, captureServerException } from './utils/observability.js'

// OBS-2 (2026-08-24): Sentry node opt-in qua SENTRY_DSN — phải init TRƯỚC mọi
// error path khác để stack trace từ startup/onError đều được ghi nhận khi bật.
initSentryNode()

const app = new Hono()

app.onError((err, c) => {
  if (err.message && (err.message.includes('không hợp lệ') || err.message.includes('không đúng định dạng') || err.message.includes('required'))) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400)
  }
  // OBS-1 (2026-08-24): gắn requestId (từ loggerMiddleware) vào log lỗi để đối
  // chiếu 1-1 với structured request log — trước đây log onError tách rời,
  // không truy vết được về đúng request.
  const requestId = c.res.headers.get('x-request-id') || undefined
  console.error(JSON.stringify({
    level: 'ERROR',
    type: 'UNHANDLED_ERROR',
    timestamp: new Date().toISOString(),
    requestId,
    method: c.req.method,
    path: c.req.path,
    error: err?.message || String(err),
    stack: err?.stack,
  }))
  // OBS-2: gửi kèm context kỹ thuật (không PII) vào Sentry khi đã init.
  captureServerException(err, { requestId, method: c.req.method, path: c.req.path })
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
import parishEventsRouter from './routes/parishEvents.js'
import { loggerMiddleware } from './middleware/logger.js'
import { metricsMiddleware } from './middleware/metrics.js'

app.use('/*', loggerMiddleware)
app.use('/*', metricsMiddleware)
app.route('/', healthRouter)

// OBS-1 (2026-08-24): thu CSP violation reports (public, không auth — browser
// gửi tự động; đã bọc rateLimiter + bodyLimit toàn cục phía trên).
app.route('/api/csp-report', cspReportRouter)

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
app.route('/api/parish-events', parishEventsRouter)

// A-NEW-49 (2026-08-17): Railway injects PORT env at runtime và DÙNG giá trị này
// cho healthcheck + public routing. Code cũ (3f01bd0) đọc process.env.PORT → bind
// 8080 → healthcheck /health PASS. Bản rewrite đọc SERVER_PORT (không set) → bind
// 3001 trong khi Railway probe 8080 → "service unavailable" (deploy FAILED 3f6bc7e1).
// SERVER_PORT giữ làm override tường minh (docker-compose/local); PORT là contract
// Railway (docker-compose cũng dùng PORT=3000 theo .env.example) — fallback 3001 dev.
const PORT = Number(process.env.SERVER_PORT) || Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'

// D3 data-integrity hard gate: db/index.ts has already run bootstrap/migrations as
// part of module initialization. Validate the executable schema BEFORE seeding,
// opening the HTTP port, or starting background workers. Any partial migration,
// malformed tenant index, missing latest column, composite-PK drift, or FK
// violation must abort startup rather than serving traffic on an unsafe schema.
try {
  await assertDatabaseReady(client)
} catch (err) {
  console.error('[startup] Database schema readiness check failed:', err)
  throw err
}

// Initial bootstrap is also part of the serving boundary. seedIfEmpty() writes the
// required admin/config/permissions atomically; if it fails (including missing or
// weak SEED_ADMIN_PASSWORD on a fresh DB), do not bind HTTP or start workers.
try {
  await seedIfEmpty()
} catch (err) {
  console.error('[startup] Initial database seed failed:', err)
  throw err
}

// A-NEW-38 (2026-08-11): XÓA block reset admin password khỏi startup.
// Trước đây block này ghi đè passwordHash của admin `bill` mỗi lần khởi động khi
// SEED_ADMIN_PASSWORD tồn tại + (NODE_ENV != production hoặc ALLOW_SEED_ADMIN_RESET=true)
// → mật khẩu user đặt qua UI bị reset về SEED_ADMIN_PASSWORD sau mỗi restart/deploy
// (lỗi "sai mật khẩu" dù pass cũ vẫn đúng). Việc tạo admin ban đầu đã do seedIfEmpty()
// lo (chỉ chạy khi DB trống) — block này thừa và nguy hiểm. Không còn reset vô tình.

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST })
console.log(`Server running at http://${HOST}:${PORT}`)
const stopImportRollbackCleanup = startImportRollbackSnapshotCleanup()

const gracefulShutdown = async (signal: string) => {
  console.log(`[shutdown] Received ${signal}, shutting down gracefully...`)
  try { await client.execute('PRAGMA wal_checkpoint(TRUNCATE)') } catch {}
  stopBackupScheduler()
  stopImportRollbackCleanup()
  stopOutboxWorker()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// OBS-1 (2026-08-24): process-level error visibility. Trước đây unhandledRejection
// / uncaughtException chỉ phụ thuộc default behavior của Node — log rải rác,
// không alert, sự cố prod phải SSH vào container mới thấy (A-NEW-61/62).
// - unhandledRejection: log + Telegram alert, process SỐNG TIẾP (không giết
//   request đang chạy vì lỗi async không chạm state).
// - uncaughtException: log + checkpoint DB + alert + exit(1) fail-closed —
//   state sau exception đồng bộ không đáng tin, Railway sẽ restart container.
if (process.env.NODE_ENV !== 'test') {
  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.error(JSON.stringify({
      level: 'ERROR',
      type: 'UNHANDLED_REJECTION',
      timestamp: new Date().toISOString(),
      error: message,
      stack: reason instanceof Error ? reason.stack : undefined,
    }))
    captureServerException(reason, { kind: 'unhandledRejection' })
    void sendTelegramAlert(`Unhandled rejection: ${message.slice(0, 500)}`)
  })

  process.on('uncaughtException', (err) => {
    console.error(JSON.stringify({
      level: 'ERROR',
      type: 'UNCAUGHT_EXCEPTION',
      timestamp: new Date().toISOString(),
      error: err?.message || String(err),
      stack: err?.stack,
    }))
    captureServerException(err, { kind: 'uncaughtException' })
    void sendTelegramAlert(`Uncaught exception — container sẽ thoát: ${String(err?.message || err).slice(0, 500)}`)
    // Cho Telegram/log flush trước khi thoát; WAL checkpoint trong gracefulShutdown.
    setTimeout(() => { try { gracefulShutdown('uncaughtException') } catch { process.exit(1) } }, 1000)
  })
}

initTelegramBot()
registerOutboxSubscribers()
startOutboxWorker(10000)
await initNotificationQueue()
initSundayReminderScheduler()
initBackupScheduler()
sendTelegramInfo(`🟢 Server khởi động thành công\n🕐 ${new Date().toLocaleString('vi-VN')}\n📍 Port: ${PORT}`)
