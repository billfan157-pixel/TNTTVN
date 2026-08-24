import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// OBS-2 (2026-08-24): Sentry node opt-in — thiếu SENTRY_DSN hoặc NODE_ENV=test
// phải disabled hoàn toàn; init lỗi không được làm sập server; captureServerException
// luôn no-op an toàn khi chưa init.

async function importFresh() {
  vi.resetModules()
  return await import('../../utils/observability.js')
}

describe('OBS-2: observability (Sentry node opt-in)', () => {
  beforeEach(() => vi.unstubAllEnvs())
  afterEach(() => vi.unstubAllEnvs())

  it('thiếu SENTRY_DSN → disabled, capture no-op không throw', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SENTRY_DSN', '')
    const mod = await importFresh()
    const status = mod.initSentryNode()
    expect(status.enabled).toBe(false)
    expect(mod.isSentryNodeEnabled()).toBe(false)
    // Không bao giờ throw ra caller dù chưa init.
    expect(() => mod.captureServerException(new Error('boom'), { path: '/x' })).not.toThrow()
  })

  it('NODE_ENV=test → luôn disabled kể cả khi có DSN (bảo vệ suite)', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/123')
    const mod = await importFresh()
    expect(mod.initSentryNode().enabled).toBe(false)
  })

  it('có DSN ở production → enabled; gọi lần 2 idempotent', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SENTRY_DSN', 'https://example-key@o0.ingest.sentry.io/456')
    const mod = await importFresh()
    expect(mod.initSentryNode().enabled).toBe(true)
    expect(mod.isSentryNodeEnabled()).toBe(true)
    expect(mod.initSentryNode()).toEqual({ enabled: true })
    // capture với context không throw.
    expect(() => mod.captureServerException(new Error('x'), { requestId: 'r1' })).not.toThrow()
  })

  it('DSN chỉ toàn khoảng trắng → coi như không cấu hình', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SENTRY_DSN', '   ')
    const mod = await importFresh()
    expect(mod.initSentryNode().enabled).toBe(false)
  })
})
