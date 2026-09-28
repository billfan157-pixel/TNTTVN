import { afterEach, describe, expect, it, vi } from 'vitest'

const providers = vi.hoisted(() => ({
  web: vi.fn(),
  native: vi.fn(),
}))
vi.mock('../../services/webPushService.js', () => ({ sendWebPushToUsers: providers.web, sendWebPushToParish: vi.fn() }))
vi.mock('../../services/nativePushService.js', () => ({ sendNativePushToUsers: providers.native, sendNativePushToParish: vi.fn() }))

const previousRuntime = process.env.CATEVIA_RUNTIME
const previousWebSocketPair = (globalThis as { WebSocketPair?: unknown }).WebSocketPair

afterEach(() => {
  providers.web.mockReset()
  providers.native.mockReset()
  if (previousRuntime === undefined) delete process.env.CATEVIA_RUNTIME
  else process.env.CATEVIA_RUNTIME = previousRuntime
  if (previousWebSocketPair === undefined) delete (globalThis as { WebSocketPair?: unknown }).WebSocketPair
  else Object.defineProperty(globalThis, 'WebSocketPair', { configurable: true, value: previousWebSocketPair })
})

describe('Worker push outbound budget', () => {
  it('leaves room for Turso and OAuth subrequests while deferring excess devices', async () => {
    process.env.CATEVIA_RUNTIME = 'cloudflare-worker'
    Object.defineProperty(globalThis, 'WebSocketPair', { configurable: true, value: function WebSocketPair() {} })
    providers.web.mockResolvedValue({ configured: true, sent: 12, failed: 0, total: 30, removed: 0,
      successfulEndpoints: Array.from({ length: 12 }, (_, i) => `https://push.example/${i}`), deferred: 18 })
    providers.native.mockResolvedValue({ configured: true, sent: 0, failed: 0, total: 10, removed: 0, skipped: 0,
      platforms: { android: true, ios: true }, successfulTokens: [], deferred: 10 })

    const { sendAppPushToUsers, WORKER_PUSH_DELIVERIES_PER_CYCLE } = await import('../../services/appPushService.js')
    const result = await sendAppPushToUsers('parish', ['user'], { title: 'T', body: 'B' })
    expect(WORKER_PUSH_DELIVERIES_PER_CYCLE).toBe(12)
    expect(providers.web).toHaveBeenCalledWith('parish', ['user'], { title: 'T', body: 'B' }, undefined, 12)
    expect(providers.native).toHaveBeenCalledWith('parish', ['user'], { title: 'T', body: 'B' }, undefined, 0)
    expect(result).toMatchObject({ sent: 12, deferred: 28 })
  })
})
