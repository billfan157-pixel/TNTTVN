import { describe, it, expect, afterEach } from 'vitest'
import healthRouter from '../../routes/health.js'
import { metricsRegistry, normalizeMetricPath } from '../../middleware/metrics.js'

const OPS = 'ops-secret-token'
const authHeaders = { Authorization: `Bearer ${OPS}` }

describe('Operational Readiness: Health & Readiness Endpoint Tests', () => {
  afterEach(() => {
    delete process.env.OPS_TOKEN
    delete process.env.APP_RELEASE_ID
    delete process.env.RENDER_GIT_COMMIT
  })

  it('1. GET /health returns status ok and database connected (Liveness + Basic Readiness Probe)', async () => {
    const res = await healthRouter.request('/health')
    expect(res.status).toBe(200)

    const data = (await res.json()) as any
    expect(data.status).toBe('ok')
    expect(data.database).toBe('connected')
    expect(data.service).toBe('parish-lms-backend')
    expect(data.releaseId).toBe('unknown')
    expect(data.timestamp).toBeDefined()
  })

  it('1b. /health exposes only a sanitized immutable release id', async () => {
    process.env.RENDER_GIT_COMMIT = 'ccb6bf233eb571a53d7d4bcfe20b25edb4a933e1'
    let res = await healthRouter.request('/health')
    expect(((await res.json()) as any).releaseId).toBe('ccb6bf233eb571a53d7d4bcfe20b25edb4a933e1')

    process.env.APP_RELEASE_ID = '<script>alert(1)</script>'
    res = await healthRouter.request('/health')
    expect(((await res.json()) as any).releaseId).toBe('invalid')
  })

  it('2. GET /ready checks database connectivity (Readiness Probe)', async () => {
    process.env.OPS_TOKEN = OPS
    const res = await healthRouter.request('/ready', { headers: authHeaders })
    expect(res.status).toBe(200)

    const data = (await res.json()) as any
    expect(data.status).toBe('ready')
    expect(data.database).toBe('connected')
    expect(typeof data.latencyMs).toBe('number')
  })

  it('3. GET /metrics returns Prometheus-formatted metrics text', async () => {
    process.env.OPS_TOKEN = OPS
    metricsRegistry.recordRequest('GET', '/api/students/ST-123456', 200, 275)
    const res = await healthRouter.request('/metrics', { headers: authHeaders })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')

    const text = await res.text()
    expect(text).toContain('# HELP http_requests_total')
    expect(text).toContain('# TYPE http_request_duration_seconds histogram')
    expect(text).toContain('path="/api/students/:id"')
    expect(text).not.toContain('ST-123456')
    expect(text).toContain('http_request_duration_seconds_bucket')
    expect(text).toContain('http_request_duration_seconds_sum')
    expect(text).toContain('http_request_duration_seconds_count')
    expect(text).toContain('# HELP business_events_total')
  })

  it('3b. normalizes dynamic metric paths to bounded route labels', () => {
    expect(normalizeMetricPath('/api/students/ST-60725fbf?details=1')).toBe('/api/students/:id')
    expect(normalizeMetricPath('/api/users/550e8400-e29b-41d4-a716-446655440000')).toBe('/api/users/:id')
    expect(normalizeMetricPath('/api/audit-logs/2026')).toBe('/api/audit-logs/:id')
    expect(normalizeMetricPath('/api/academic-years')).toBe('/api/academic-years')
  })

  // A-NEW-18 (2026-08-11): /health PUBLIC nhưng /ready + /metrics yêu cầu Bearer OPS_TOKEN
  it('4. /health vẫn public khi OPS_TOKEN đã set', async () => {
    process.env.OPS_TOKEN = OPS
    const res = await healthRouter.request('/health')
    expect(res.status).toBe(200)
  })

  it('5. /ready + /metrics bị 403 khi thiếu/sai OPS_TOKEN', async () => {
    process.env.OPS_TOKEN = OPS
    expect((await healthRouter.request('/ready')).status).toBe(403)
    expect((await healthRouter.request('/metrics')).status).toBe(403)
    expect((await healthRouter.request('/ready', { headers: { Authorization: 'Bearer wrong' } })).status).toBe(403)
  })

  it('6. /ready + /metrics 200 khi Bearer OPS_TOKEN đúng', async () => {
    process.env.OPS_TOKEN = OPS
    const ready = await healthRouter.request('/ready', { headers: authHeaders })
    expect(ready.status).toBe(200)
    const metrics = await healthRouter.request('/metrics', { headers: authHeaders })
    expect(metrics.status).toBe(200)
  })

  // A-NEW-28 (2026-08-11): A-NEW-21 — fail-closed: KHÔNG set OPS_TOKEN → /ready + /metrics
  // bị 403 (không public); /health vẫn 200 (probe dùng endpoint này).
  it('7. fail-closed: chưa set OPS_TOKEN → /ready + /metrics 403, /health 200', async () => {
    delete process.env.OPS_TOKEN
    expect((await healthRouter.request('/ready')).status).toBe(403)
    expect((await healthRouter.request('/metrics')).status).toBe(403)
    expect((await healthRouter.request('/health')).status).toBe(200)
  })
})
