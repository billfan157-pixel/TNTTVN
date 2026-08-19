import { afterEach, describe, expect, it, vi } from 'vitest'
import { installNativeMediaDevicesGuard } from '../lib/nativeMediaGuard'

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')

function restoreMediaDevices(): void {
  if (originalDescriptor) {
    Object.defineProperty(navigator, 'mediaDevices', originalDescriptor)
  } else {
    delete (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices
  }
}

afterEach(() => {
  restoreMediaDevices()
})

describe('installNativeMediaDevicesGuard', () => {
  it('installs a rejection-only getUserMedia fallback when WKWebView does not expose mediaDevices', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    })

    installNativeMediaDevicesGuard()

    expect(typeof navigator.mediaDevices?.getUserMedia).toBe('function')
    await expect(navigator.mediaDevices.getUserMedia({ video: true })).rejects.toThrow(
      'Camera trực tiếp chưa khả dụng trong WebView',
    )
  })

  it('does not replace a real browser getUserMedia implementation', () => {
    const getUserMedia = vi.fn()
    const mediaDevices = { getUserMedia } as unknown as MediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    })

    installNativeMediaDevicesGuard()

    expect(navigator.mediaDevices).toBe(mediaDevices)
    expect(navigator.mediaDevices.getUserMedia).toBe(getUserMedia)
  })
})
