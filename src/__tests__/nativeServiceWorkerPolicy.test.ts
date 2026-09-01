import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ native: false }))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
  },
}))

vi.mock('../lib/api', () => ({ api: {} }))

import { registerServiceWorkerOnly } from '../lib/pushManager'

describe('native service worker policy', () => {
  afterEach(() => {
    platform.native = false
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps plugin auto-registration disabled so runtime policy is authoritative', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(viteConfig).toMatch(/injectRegister:\s*false/)
  })

  it('keeps Vite optimized-dependency hashes stable across normal dev restarts', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

    expect(packageJson.scripts.predev).toBeUndefined()
    expect(packageJson.scripts['clean:vite']).toContain("rmSync('node_modules/.vite'")
    expect(viteConfig).toContain("'src/**/*.{ts,tsx}'")
    expect(viteConfig).toMatch(/['"]jsqr['"]/)
    expect(viteConfig).toMatch(/['"]qrcode-generator['"]/)
  })

  it('registers the PWA worker on web through the runtime policy', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const getRegistrations = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: { register, getRegistrations } })

    await registerServiceWorkerOnly()

    expect(register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' })
    expect(getRegistrations).not.toHaveBeenCalled()
  })

  it('unregisters legacy workers and clears only PWA caches on Capacitor', async () => {
    platform.native = true
    const unregister = vi.fn().mockResolvedValue(true)
    const register = vi.fn()
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register,
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      },
    })
    const deleteCache = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue([
        'workbox-precache-v2-https://localhost/',
        'pages-cache',
        'static-resources',
        'domain-image-cache',
      ]),
      delete: deleteCache,
    })

    await registerServiceWorkerOnly()

    expect(register).not.toHaveBeenCalled()
    expect(unregister).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledTimes(3)
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache-v2-https://localhost/')
    expect(deleteCache).toHaveBeenCalledWith('pages-cache')
    expect(deleteCache).toHaveBeenCalledWith('static-resources')
    expect(deleteCache).not.toHaveBeenCalledWith('domain-image-cache')
  })

  it('unregisters dev workers and skips registration in development mode to prevent 504 outdated optimize dep', async () => {
    const unregister = vi.fn().mockResolvedValue(true)
    const register = vi.fn()
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }])
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register,
        getRegistrations,
      },
    })
    vi.stubEnv('MODE', 'development')

    await registerServiceWorkerOnly()

    expect(register).not.toHaveBeenCalled()
    expect(getRegistrations).toHaveBeenCalled()
    expect(unregister).toHaveBeenCalledOnce()
  })
})
