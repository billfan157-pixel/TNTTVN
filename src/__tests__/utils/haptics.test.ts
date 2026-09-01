import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hapticFeedback } from '../../utils/haptics'

describe('hapticFeedback utility', () => {
  let vibrateMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vibrateMock = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { vibrate: vibrateMock })
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('triggers light vibration with 8ms', () => {
    const result = hapticFeedback.light()
    expect(result).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith(8)
  })

  it('triggers medium vibration with 16ms', () => {
    const result = hapticFeedback.medium()
    expect(result).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith(16)
  })

  it('triggers success vibration pattern [12, 40, 20]', () => {
    const result = hapticFeedback.success()
    expect(result).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith([12, 40, 20])
  })

  it('triggers warning vibration pattern [25, 40, 25]', () => {
    const result = hapticFeedback.warning()
    expect(result).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith([25, 40, 25])
  })

  it('triggers error vibration pattern [35, 60, 35]', () => {
    const result = hapticFeedback.error()
    expect(result).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith([35, 60, 35])
  })

  it('triggers selection vibration with 4ms', () => {
    const result = hapticFeedback.selection()
    expect(result).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith(4)
  })

  it('respects prefers-reduced-motion by suppressing vibration', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    })

    const result = hapticFeedback.success()
    expect(result).toBe(false)
    expect(vibrateMock).not.toHaveBeenCalled()
  })

  it('gracefully returns false when vibrate throws error', () => {
    vibrateMock.mockImplementation(() => {
      throw new Error('NotAllowedError')
    })

    const result = hapticFeedback.light()
    expect(result).toBe(false)
  })
})
