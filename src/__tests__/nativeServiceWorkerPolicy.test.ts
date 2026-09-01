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
})
