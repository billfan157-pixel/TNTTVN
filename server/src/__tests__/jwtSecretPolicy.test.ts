import { afterEach, describe, it, expect, vi } from 'vitest'
import { resolveJwtSecrets } from '../utils/jwtSecretPolicy.js'

const access = 'a'.repeat(32)
const refresh = 'r'.repeat(32)
afterEach(() => { vi.unstubAllEnvs() })

describe('AUTH-P2-002 production JWT configuration', () => {
  it.each([
    {}, { JWT_SECRET: access },
    { JWT_SECRET: 'short', JWT_REFRESH_SECRET: refresh },
    { JWT_SECRET: access, JWT_REFRESH_SECRET: 'short' },
    { JWT_SECRET: access, JWT_REFRESH_SECRET: access },
    { VITEST: 'true' },
  ])('fails closed for invalid production configuration %#', configuration => {
    expect(() => resolveJwtSecrets({ NODE_ENV: 'production', ...configuration })).toThrow()
  })

  it('accepts separate secrets at the documented minimum', () => {
    expect(resolveJwtSecrets({ NODE_ENV: 'production', JWT_SECRET: access, JWT_REFRESH_SECRET: refresh }))
      .toEqual({ accessSecret: access, refreshSecret: refresh })
  })

  it('keeps intentional dev/test fallback', () => {
    for (const NODE_ENV of ['development', 'test']) {
      const result = resolveJwtSecrets({ NODE_ENV })
      expect(result.accessSecret.length).toBeGreaterThanOrEqual(32)
      expect(result.refreshSecret).toBe(result.accessSecret)
    }
  })

  it('never includes configured values in errors', () => {
    try {
      resolveJwtSecrets({ NODE_ENV: 'production', JWT_SECRET: 'private-value', JWT_REFRESH_SECRET: refresh })
      expect.fail('must reject')
    } catch (error) {
      expect(String(error)).not.toContain('private-value')
      expect(String(error)).not.toContain(refresh)
    }
  })

  it('enforces policy while loading the real auth middleware, before it can handle traffic', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    // Satisfy the independent production parish prerequisite so this import
    // reaches the JWT guard. Keep it local: global scope disables multi-parish tests.
    vi.stubEnv('DEPLOYMENT_PARISH_ID', 'gia-ton')
    vi.stubEnv('JWT_SECRET', 'too-short')
    vi.stubEnv('JWT_REFRESH_SECRET', refresh)
    vi.resetModules()
    await expect(import('../middleware/auth.js')).rejects.toThrow('JWT_SECRET must contain at least 32')
    vi.stubEnv('JWT_SECRET', access)
    vi.resetModules()
    const middleware = await import('../middleware/auth.js')
    expect(middleware.authMiddleware).toBeTypeOf('function')
  })
})
