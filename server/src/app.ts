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
import { ALLOWED_CORS_HEADERS, isOriginAllowed, resolveAllowedOrigins } from './utils/originPolicy.js'
import cspReportRouter from './routes/cspReport.js'
import { captureServerException } from './utils/observability.js'
import { classifyOnError } from './utils/onErrorClassification.js'
import { withPasswordCpuNamespace, type PasswordCpuNamespace } from './utils/passwordCompute.js'
import { withBlobBucket, type BlobBucket } from './services/blobStorage.js'

const app = new Hono()

// Cloudflare Durable Object bindings belong to the current request. Node
// requests have no binding and retain their existing local bcrypt behavior.
app.use('*', (c, next) => withPasswordCpuNamespace(
  (c.env as { PASSWORD_CPU?: PasswordCpuNamespace } | undefined)?.PASSWORD_CPU,
  () => withBlobBucket((c.env as { BLOB_BUCKET?: BlobBucket } | undefined)?.BLOB_BUCKET, next),
))

app.onError((err, c) => {
  // P1-2: classification lives in utils/onErrorClassification so it is
  // unit-testable without booting the server. Explicit 4xx statuses are
  // authoritative; only curated Vietnamese validation phrases map to 400.
  // English substrings like "required" are never sniffed — Drizzle/libSQL
  // messages stay on the 500 + UNHANDLED_ERROR + Sentry path.
  const classification = classifyOnError(err)
  // OBS-1 (2026-08-24): gắn requestId (từ loggerMiddleware) vào log lỗi để đối
  // chiếu 1-1 với structured request log — trước đây log onError tách rời,
  // không truy vết được về đúng request.
  const requestId = c.res.headers.get('x-request-id') || undefined
  if (classification.kind === 'client') {
    console.error(JSON.stringify({
      level: 'WARN',
      type: 'CLIENT_ERROR',
      timestamp: new Date().toISOString(),
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: classification.status,
      code: classification.code,
      error: classification.clientMessage,
    }))
    return c.json({ success: false, error: { code: classification.code, message: classification.clientMessage } }, classification.status as 400)
  }
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
  // Operations and other retry-safe commands use a custom idempotency header;
  // production browser calls are cross-origin and therefore preflighted.
  allowHeaders: ALLOWED_CORS_HEADERS,
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
import parishProfileRouter from './routes/parishProfile.js'
import feedbackRouter from './routes/feedback.js'
import passwordResetRequestsRouter from './routes/passwordResetRequests.js'
import syncRouter from './routes/sync.js'
import questionBankRouter from './routes/questionBank.js'
import dailyEntriesRouter from './routes/dailyEntries.js'
import operationsRouter from './routes/operations.js'
import tiniAttendanceImportRouter from './routes/tiniAttendanceImport.js'
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
app.route('/api/tini-attendance-import', tiniAttendanceImportRouter)
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
app.route('/api/parish-profile', parishProfileRouter)
app.route('/api/feedback', feedbackRouter)
app.route('/api/password-reset-requests', passwordResetRequestsRouter)
app.route('/api/sync', syncRouter)
app.route('/api/question-bank', questionBankRouter)
app.route('/api/daily-entries', dailyEntriesRouter)
app.route('/api/operations', operationsRouter)

export default app
