import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDbConfig } from '../db/dbConfig.js'
import { isCloudflareWorkerRuntime } from '../utils/cloudflareRuntime.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Cloudflare database boot boundary', () => {
  it('does not disable Node startup checks from an environment variable alone', () => {
    vi.stubEnv('CATEVIA_RUNTIME', 'cloudflare-worker')
    expect(isCloudflareWorkerRuntime()).toBe(false)
  })

  it('refuses local SQLite when running inside a Worker', () => {
    vi.stubEnv('CATEVIA_RUNTIME', 'cloudflare-worker')
    vi.stubEnv('TURSO_URL', '')
    vi.stubGlobal('WebSocketPair', class {})
    expect(isCloudflareWorkerRuntime()).toBe(true)
    expect(() => getDbConfig()).toThrow('TURSO_URL is required in Cloudflare Worker runtime')
  })
})
