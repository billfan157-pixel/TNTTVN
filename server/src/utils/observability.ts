import * as Sentry from '@sentry/node'

/**
 * OBS-2 (2026-08-24): Sentry node SDK — error aggregation phía server.
 *
 * Opt-in qua env (chuẩn ADR-041): thiếu `SENTRY_DSN` → hoàn toàn vô hiệu,
 * zero overhead, vẫn còn structured console logs. Set `SENTRY_DSN` để bật
 * aggregation theo stack trace mà không gửi request body/header chứa PII.
 */

export interface ObservabilityStatus {
  enabled: boolean
}

let initialized = false

export function isSentryNodeEnabled(): boolean {
  return initialized
}

export function initSentryNode(): ObservabilityStatus {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn || process.env.NODE_ENV === 'test') {
    return { enabled: false }
  }
  if (initialized) return { enabled: true }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      // Giá trị conservatively thấp — server xử lý PII trẻ em/phụ huynh;
      // performance tracing không phải mục tiêu chính của OBS-2.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0') || 0,
      // Không gửi header/body request (PII) — chỉ metadata kỹ thuật.
      sendDefaultPii: false,
    })
    initialized = true
  } catch (err) {
    // Init lỗi KHÔNG được làm sập server — observability là lớp phụ trợ.
    console.error(JSON.stringify({
      level: 'WARN',
      type: 'SENTRY_INIT_FAILED',
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    }))
  }
  return { enabled: initialized }
}

/**
 * Capture an toàn dùng ở mọi error path (onError, unhandledRejection,
 * uncaughtException) — no-op khi chưa init, không bao giờ throw ra caller.
 */
export function captureServerException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined)
  } catch {
    // never throw from telemetry
  }
}
