import type { Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { isCloudflareWorkerRuntime } from './cloudflareRuntime.js'

/**
 * Trích xuất Client IP chính xác, chống spoof qua proxy headers.
 *
 * A15 (2026-08-10): trước đây tin tưởng trực tiếp cf-connecting-ip / x-real-ip /
 * x-forwarded-for (first value) — CẢ BA đều do client tự đặt được nên rate limiter
 * (login/refresh/purge/reveal/admin-reauth) có thể bị bypass bằng header giả.
 *
 * Policy hiện tại:
 * - Mặc định (KHÔNG đặt TRUST_PROXY): chỉ tin IP socket thật (`getConnInfo`).
 *   Client không thể giả mạo socket IP → limiter luôn đúng client.
 * - Khi TRUST_PROXY=true (chỉ bật khi có reverse proxy CHÚNG TA KIỂM SOÁT đứng
 *   trước — docker-compose Nginx theo SSOT DEPLOYMENT_GUIDE):
 *   1. x-real-ip (nginx luôn ghi đè bằng $remote_addr — đáng tin)
 *   2. x-forwarded-for → lấy giá trị CUỐI (được proxy đáng tin APPEND/ghi đè),
 *      KHÔNG lấy giá trị đầu (client tự đặt).
 *
 * Triển khai:
 * - docker-compose (Nginx): set TRUST_PROXY=true.
 * - Railway/VPS (DOCKERFILE trực tiếp, không proxy): KHÔNG set TRUST_PROXY —
 *   socket IP thật vẫn chính xác vì không có proxy nào ở giữa.
 */
function cloudflareWorkerIp(c: Context): string {
  const verified = c.req.header('x-catevia-client-ip')?.trim()
  if (verified && /^[0-9a-f:.]{2,45}$/i.test(verified)) return verified

  const hasProxyHeaders = ['x-forwarded-for', 'x-real-ip']
    .some((name) => Boolean(c.req.header(name)?.trim()))
  if (hasProxyHeaders) return 'unknown'

  const value = c.req.header('cf-connecting-ip')?.trim()
  return value && /^[0-9a-f:.]{2,45}$/i.test(value) ? value : 'unknown'
}

function socketIp(c: Context): string {
  try {
    const addr = getConnInfo(c).remote.address
    if (addr) return addr
  } catch {
    // Context thiếu conninfo (unit test mock) — fallthrough xuống 'unknown'
  }
  return 'unknown'
}

export function getClientIp(c: Context): string {
  if (isCloudflareWorkerRuntime()) {
    return cloudflareWorkerIp(c)
  }

  if (!(process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1')) {
    return socketIp(c)
  }

  const realIp = c.req.header('x-real-ip')
  if (realIp && realIp.trim()) return realIp.trim()

  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const lastValue = parts[parts.length - 1]
    if (lastValue) return lastValue
  }

  return socketIp(c)
}