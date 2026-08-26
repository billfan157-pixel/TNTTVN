import { createMiddleware } from 'hono/factory'
import { getClientIp } from '../utils/ip.js'
import { client } from '../db/index.js'

const SELF = "'self'"

const CSP = [
  `default-src ${SELF}`,
  `script-src ${SELF}`,
  // A-NEW-23 (2026-08-11): chặn <style> element inline trong main document
  // (style-src-elem fallback về style-src = 'self') — chống CSS injection/exfiltration.
  // Giữ style-attribute cho React inline style (100+ chỗ) qua style-src-attr riêng.
  // Main document KHÔNG có <style> (Vite build xuất CSS external);
  // popup print/export dùng Blob URL (document riêng, không kế thừa server CSP).
  `style-src ${SELF}; style-src-attr 'unsafe-inline'`,
  `img-src ${SELF} data:`,
  `connect-src ${SELF} https://o0.ingest.sentry.io`,
  `font-src ${SELF} https://fonts.gstatic.com`,
  `base-uri ${SELF}`,
  `form-action ${SELF}`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `worker-src ${SELF}`,
  `manifest-src ${SELF}`,
].join('; ')

export const securityHeaders = createMiddleware(async (c, next) => {
  c.header('Content-Security-Policy', `${CSP}; report-uri /api/csp-report`)
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '0')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  // A-NEW-28 (2026-08-11): A-NEW-20 (P2) — API chứa dữ liệu nhạy cảm (vd GET export
  // snapshot toàn bộ parish) → cấm cache mọi response API (browser + proxy trung
  // gian). Trước đây không set Cache-Control → response sensitive GET có thể bị
  // heuristic-cache.
  c.header('Cache-Control', 'no-store')
  await next()
})

interface RateLimitEntry {
  count: number
  resetAt: number
}

const WINDOW_MS = 60_000
const MAX_REQUESTS = 1000

// A-NEW-23 (2026-08-11) + Fix P2 (2026-08-14): rate limit state hoàn toàn sử dụng
// bảng rate_limits (SQLite file dùng chung). KHÔNG còn in-memory Map fallback.
// Kiến trúc chuyển sang "fail-closed": Nếu DB sập, API trả về HTTP 500 thay vì
// fail-open (bypass rate limit) như trước đây, bảo đảm Security > Availability.

async function getRateLimitEntry(key: string): Promise<RateLimitEntry> {
  const now = Date.now()
  const res = await client.execute({
    sql: `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
          ON CONFLICT(key) DO UPDATE SET
            count = CASE WHEN rate_limits.reset_at < ? THEN 1 ELSE rate_limits.count + 1 END,
            reset_at = CASE WHEN rate_limits.reset_at < ? THEN ? ELSE rate_limits.reset_at END
          RETURNING count, reset_at`,
    args: [key, now + WINDOW_MS, now, now, now + WINDOW_MS],
  })
  const row = res.rows[0] as unknown as { count: number | bigint; reset_at: number | bigint } | undefined
  return { count: Number(row?.count ?? 1), resetAt: Number(row?.reset_at ?? now + WINDOW_MS) }
}

const cleanupInterval = setInterval(() => {
  const now = Date.now()
  // DB: dọn row hết hạn (chống phình bảng) — best-effort.
  client.execute({ sql: 'DELETE FROM rate_limits WHERE reset_at <= ?', args: [now] }).catch(() => {})
}, 60_000)
if (cleanupInterval.unref) cleanupInterval.unref()

export const rateLimiter = createMiddleware(async (c, next) => {
  const ip = getClientIp(c)
  const entry = await getRateLimitEntry(ip)
  c.header('X-RateLimit-Limit', String(MAX_REQUESTS))
  c.header('X-RateLimit-Remaining', String(Math.max(0, MAX_REQUESTS - entry.count)))
  c.header('X-RateLimit-Reset', String(entry.resetAt))
  if (entry.count >= MAX_REQUESTS) {
    return c.json({ error: 'Too many requests, try again later' }, 429)
  }
  await next()
})

export const loginRateLimiter = createMiddleware(async (c, next) => {
  const ip = getClientIp(c)
  const entry = await getRateLimitEntry(`login:${ip}`)
  if (entry.count > 10) {
    return c.json({ error: 'Too many login attempts, try again later' }, 429)
  }
  await next()
})

// JWT refresh rotation: tối đa 30 lần/60s/IP — chống brute-force refresh token
// (rotation đã revoke token cũ, nhưng kẻ tấn công vẫn có thể thử token đánh cắp).
export const refreshRateLimiter = createMiddleware(async (c, next) => {
  const ip = getClientIp(c)
  const entry = await getRateLimitEntry(`refresh:${ip}`)
  if (entry.count > 30) {
    return c.json({ error: 'Quá nhiều lần làm mới phiên, vui lòng thử lại sau' }, 429)
  }
  await next()
})

// PURGE v2.3: tối đa 10 lần gọi purge/60s/IP — thao tác phá hủy dữ liệu không thể spam.
export const purgeRateLimiter = createMiddleware(async (c, next) => {
  const ip = getClientIp(c)
  const entry = await getRateLimitEntry(`purge:${ip}`)
  if (entry.count > 10) {
    return c.json({ error: 'Quá nhiều lần thử xóa dữ liệu, vui lòng thử lại sau' }, 429)
  }
  await next()
})

// A06 (2026-08-10): re-authentication cho reset-password + admin-change-password —
// tối đa 10/60s/IP, tách khỏi cửa sổ đăng nhập.
export const adminReauthRateLimiter = createMiddleware(async (c, next) => {
  const ip = getClientIp(c)
  const entry = await getRateLimitEntry(`admin-reauth:${ip}`)
  if (entry.count > 10) {
    return c.json({ error: 'Quá nhiều lần thử xác nhận, vui lòng thử lại sau' }, 429)
  }
  await next()
})

// ADR-058: endpoint self-reset đã ngừng (410); giữ giới hạn 10/60s/IP để chặn spam
// vào compatibility route trong thời gian các client cũ còn tồn tại.
export const parentForgotRateLimiter = createMiddleware(async (c, next) => {
  const ip = getClientIp(c)
  const entry = await getRateLimitEntry(`parent-forgot:${ip}`)
  if (entry.count > 10) {
    return c.json({ error: 'Quá nhiều lần thử đặt lại mật khẩu. Vui lòng đợi 1 phút hoặc liên hệ Ban Giáo Lý.' }, 429)
  }
  await next()
})


