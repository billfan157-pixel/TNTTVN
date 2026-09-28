import { createAdaptorServer } from '@hono/node-server'
import app from './app.js'
import { startRateLimitCleanup, stopRateLimitCleanup } from './middleware/security.js'
import { client } from './db/index.js'
import { assertDatabaseReady } from './db/schemaHealth.js'
import { assertSingleParishDeploymentData } from './db/deploymentParishHealth.js'
import { assertDeploymentParishConfiguration, getEnforcedDeploymentParishId } from './utils/deploymentParish.js'
import { getParishTimeZone } from './utils/parishTimeZone.js'
import { seedIfEmpty } from './seed.js'
import { initNotificationQueue, stopNotificationQueue } from './services/notificationQueue.js'
import { initSundayReminderScheduler, stopSundayReminderScheduler } from './services/sundayReminderScheduler.js'
import { initOperationsReminderScheduler, stopOperationsReminderScheduler } from './services/operationsReminderService.js'
import { initOperationsEventLifecycleScheduler, stopOperationsEventLifecycleScheduler } from './services/operationsEventLifecycleService.js'
import { initOperationsTaskDispatchScheduler, stopOperationsTaskDispatchScheduler } from './services/operationsTaskDispatchService.js'
import { initOperationsManagerReminderScheduler, stopOperationsManagerReminderScheduler } from './services/operationsManagerReminderService.js'
import { initOperationsReceiptMaintenance, stopOperationsReceiptMaintenance } from './services/operationsReceiptMaintenance.js'
import { initBackupScheduler, stopBackupScheduler } from './services/backupScheduler.js'
import { runImportMaintenanceCycle, startImportRollbackSnapshotCleanup } from './services/importService.js'
import { closeBrowser } from './services/pdfService.js'
import { initSentryNode, captureServerException } from './utils/observability.js'

// Initialize Node observability before database readiness and HTTP bind.
initSentryNode()

// A-NEW-49 (2026-08-17): Railway injects PORT env at runtime và DÙNG giá trị này
// cho healthcheck + public routing. Code cũ (3f01bd0) đọc process.env.PORT → bind
// 8080 → healthcheck /health PASS. Bản rewrite đọc SERVER_PORT (không set) → bind
// 3001 trong khi Railway probe 8080 → "service unavailable" (deploy FAILED 3f6bc7e1).
// SERVER_PORT giữ làm override tường minh (docker-compose/local); PORT là contract
// Railway (docker-compose cũng dùng PORT=3000 theo .env.example) — fallback 3001 dev.
const PORT = Number(process.env.SERVER_PORT) || Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'
// During cutover Render can continue serving older native clients while
// Cloudflare owns the shared Turso background queue and scheduled writers.
const nodeOwnsMaintenance = process.env.CATEVIA_MAINTENANCE_OWNER !== 'cloudflare'
const deploymentParishId = assertDeploymentParishConfiguration()
const enforcedDeploymentParishId = getEnforcedDeploymentParishId() ? deploymentParishId : null

// D3 data-integrity hard gate: db/index.ts has already run bootstrap/migrations as
// part of module initialization. Validate the executable schema BEFORE seeding,
// opening the HTTP port, or starting background workers. Any partial migration,
// malformed tenant index, missing latest column, composite-PK drift, or FK
// violation must abort startup rather than serving traffic on an unsafe schema.
try {
  getParishTimeZone()
  await assertDatabaseReady(client)
  if (enforcedDeploymentParishId) {
    await assertSingleParishDeploymentData(client, enforcedDeploymentParishId)
  }
} catch (err) {
  console.error('[startup] Configuration/database/deployment parish readiness check failed:', err)
  throw err
}
// Initial bootstrap is also part of the serving boundary. seedIfEmpty() writes the
// required admin/config/permissions atomically; if it fails (including missing or
// weak SEED_ADMIN_PASSWORD on a fresh DB), do not bind HTTP or start workers.
try {
  await seedIfEmpty()
  if (enforcedDeploymentParishId) {
    await assertSingleParishDeploymentData(client, enforcedDeploymentParishId)
  }
} catch (err) {
  console.error('[startup] Initial database seed failed:', err)
  throw err
}

// Import row writes are intentionally partial-success, but stale `processing`
// control rows must converge immediately after a restart rather than waiting
// for an operator to reopen Import History. Run the tenant-scoped recovery
// before accepting traffic; a failure aborts startup instead of hiding stale
// provenance. The periodic worker repeats this maintenance without an initial
// duplicate run.
if (nodeOwnsMaintenance) {
  try {
    await runImportMaintenanceCycle()
  } catch (err) {
    console.error('[startup] Import recovery maintenance failed:', err)
    throw err
  }
}

// Optional policy-gated receipt maintenance must validate and complete its
// startup pass before the server accepts traffic.
if (nodeOwnsMaintenance) {
  try {
    await initOperationsReceiptMaintenance()
  } catch (err) {
    console.error('[startup] Operations receipt maintenance failed:', err)
    throw err
  }
}

// A-NEW-38 (2026-08-11): XÓA block reset admin password khỏi startup.
// Trước đây block này ghi đè passwordHash của admin `bill` mỗi lần khởi động khi
// SEED_ADMIN_PASSWORD tồn tại + (NODE_ENV != production hoặc ALLOW_SEED_ADMIN_RESET=true)
// → mật khẩu user đặt qua UI bị reset về SEED_ADMIN_PASSWORD sau mỗi restart/deploy
// (lỗi "sai mật khẩu" dù pass cũ vẫn đúng). Việc tạo admin ban đầu đã do seedIfEmpty()
// lo (chỉ chạy khi DB trống) — block này thừa và nguy hiểm. Không còn reset vô tình.

// Durable delivery recovery and scheduler registration are part of readiness.
// Complete them before bind so /health or real traffic cannot observe a
// partially initialized runtime. Scheduler initializers only register timers;
// they do not run an unbounded startup tick.
if (nodeOwnsMaintenance) {
  await initNotificationQueue()
  initSundayReminderScheduler()
  initOperationsReminderScheduler()
  initOperationsEventLifecycleScheduler()
  initOperationsTaskDispatchScheduler()
  initOperationsManagerReminderScheduler()
  initBackupScheduler()
}
startRateLimitCleanup()

// WATCH-RESTART (2026-09-19): chu kỳ restart của `tsx --watch` (dev) giết child
// cũ; trên Windows socket :PORT có thể còn bị giữ vài giây (teardown/TIME_WAIT)
// nên child mới bind dính EADDRINUSE. `serve()` không gắn error listener → lỗi
// nổ thành uncaughtException, child chết và watcher rơi vào "Waiting for file
// changes" — backend nằm CHẾT cho đến lần lưu file kế tiếp (triệu chứng: 502
// khi đăng nhập dù terminal dev vẫn mở). Bind chủ động qua createAdaptorServer
// kèm retry ngắn để chu kỳ restart tự lành; hết số lần thử vẫn fail-closed.
const BIND_RETRY_LIMIT = 20
const BIND_RETRY_DELAY_MS = 500

const server = createAdaptorServer({ fetch: app.fetch })
if (process.env.NODE_ENV === 'test') {
  // Test giữ nguyên hành vi fail-fast, không retry.
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.once('listening', () => resolve())
    server.listen(PORT, HOST)
  })
} else {
  let bound = false
  for (let attempt = 1; !bound; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onListening = () => { cleanup(); resolve() }
        const onError = (err: NodeJS.ErrnoException) => { cleanup(); reject(err) }
        const cleanup = () => {
          server.off('listening', onListening)
          server.off('error', onError)
        }
        server.once('listening', onListening)
        server.once('error', onError)
        server.listen(PORT, HOST)
      })
      bound = true
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'EADDRINUSE' || attempt >= BIND_RETRY_LIMIT) throw err
      console.warn(`[startup] Port ${PORT} still held (EADDRINUSE) — retry ${attempt}/${BIND_RETRY_LIMIT} in ${BIND_RETRY_DELAY_MS}ms`)
      await new Promise((resolve) => setTimeout(resolve, BIND_RETRY_DELAY_MS))
    }
  }
}
console.log(`Server running at http://${HOST}:${PORT}`)
const stopImportRollbackCleanup = nodeOwnsMaintenance
  ? startImportRollbackSnapshotCleanup(60 * 60 * 1000, false)
  : () => {}

let shutdownPromise: Promise<void> | null = null
const gracefulShutdown = (signal: string, exitCode = 0): Promise<void> => {
  if (shutdownPromise) return shutdownPromise

  shutdownPromise = (async () => {
    console.log(`[shutdown] Received ${signal}, shutting down gracefully...`)
    const forceExitTimer = setTimeout(() => {
      console.error('[shutdown] Graceful shutdown deadline exceeded')
      process.exit(1)
    }, 10000)

    try {
      // Stop every producer first, then stop accepting requests. Active work is
      // awaited before draining delivery infrastructure and closing resources.
      stopImportRollbackCleanup()
      stopRateLimitCleanup()
      const backupStopped = stopBackupScheduler()
      const sundayStopped = stopSundayReminderScheduler()
      stopOperationsReminderScheduler()
      stopOperationsEventLifecycleScheduler()
      stopOperationsTaskDispatchScheduler()
      stopOperationsManagerReminderScheduler()
      stopOperationsReceiptMaintenance()
      const httpClosed = new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })

      await Promise.all([backupStopped, sundayStopped, httpClosed])
      await stopNotificationQueue()
      await closeBrowser()
      try { await client.execute('PRAGMA wal_checkpoint(TRUNCATE)') } catch {}
      client.close()
      clearTimeout(forceExitTimer)
      process.exit(exitCode)
    } catch (error) {
      clearTimeout(forceExitTimer)
      console.error('[shutdown] Resource cleanup failed:', error)
      process.exit(1)
    }
  })()

  return shutdownPromise
}

process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM') })
process.on('SIGINT', () => { void gracefulShutdown('SIGINT') })

// OBS-1 (2026-08-24): process-level error visibility. Trước đây unhandledRejection
// / uncaughtException chỉ phụ thuộc default behavior của Node — log rải rác,
// không alert, sự cố prod phải SSH vào container mới thấy (A-NEW-61/62).
// - unhandledRejection: structured log + Sentry, process SỐNG TIẾP (không giết
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
    void gracefulShutdown('uncaughtException', 1)
  })
}
