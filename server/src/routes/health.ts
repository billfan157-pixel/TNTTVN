import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'
import { db } from '../db/index.js'
import { sql } from 'drizzle-orm'
import { metricsRegistry } from '../middleware/metrics.js'

const healthRouter = new Hono()

// A-NEW-18 (2026-08-11): /ready + /metrics là ops endpoints — gate bằng Bearer token
// (env OPS_TOKEN, so sánh timing-safe). /health giữ PUBLIC — healthcheckPath của
// Railway + docker-compose đều dùng /health (không bị ảnh hưởng).
// A-NEW-28 (2026-08-11): A-NEW-21 — FAIL-CLOSED: thiếu OPS_TOKEN → từ chối 403 thay
// vì fail-open public. Trước đây `if (!expected) return true` → deployment không set
// OPS_TOKEN (docker-compose) phơi /ready + /metrics công khai. Probe chuẩn của stack
// này đều dùng /health nên fail-closed không phá gì.
function opsAuth(c: { req: { header: (name: string) => string | undefined } }): boolean {
  const expected = process.env.OPS_TOKEN
  if (!expected) return false
  const auth = c.req.header('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}

/**
 * Liveness & Basic Readiness Probe for orchestrators (Railway / Docker Compose / K8s).
 * INF-04 (2026-08-14): Kiểm tra DB connectivity (SELECT 1) để trả 503 nếu DB hỏng/unreachable,
 * giúp orchestrator tự động phục hồi instance mà không làm lộ chi tiết nhạy cảm.
 */
healthRouter.get('/health', async (c) => {
  try {
    await db.run(sql`SELECT 1 as alive`)
    return c.json({
      status: 'ok',
      service: 'parish-lms-backend',
      database: 'connected',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    })
  } catch {
    return c.json({
      status: 'degraded',
      service: 'parish-lms-backend',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    }, 503)
  }
})

/**
 * Readiness Probe: Deep check inspecting DB connectivity & latency
 */
healthRouter.get('/ready', async (c) => {
  if (!opsAuth(c)) return c.json({ status: 'forbidden' }, 403)
  const start = performance.now()
  try {
    await db.run(sql`SELECT 1 as alive`)
    const latencyMs = Math.round(performance.now() - start)

    return c.json({
      status: 'ready',
      database: 'connected',
      latencyMs,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return c.json({
      status: 'not_ready',
      database: 'disconnected',
      error: err?.message || 'Database connection error',
      timestamp: new Date().toISOString(),
    }, 503)
  }
})

/**
 * Metrics Endpoint: Exposes Prometheus-compatible operational metrics
 */
healthRouter.get('/metrics', (c) => {
  if (!opsAuth(c)) return c.text('Forbidden', 403)
  c.header('Content-Type', 'text/plain; version=0.0.4')
  return c.text(metricsRegistry.toPrometheusFormat())
})

export default healthRouter
