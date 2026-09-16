import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { OPERATIONS_POLL_INTERVAL_MS, useOperationsAutoRefresh } from '../../hooks/useOperationsAutoRefresh'

/**
 * W4.1: the poll must be read-only cadence only — visible tab + active gate.
 * Fake timers + a document.visibilityState stub prove the two guards without
 * a network stack (tick is injected, so the hook's contract is timing only).
 */
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

describe('useOperationsAutoRefresh (W4.1)', () => {
  beforeEach(() => { vi.useFakeTimers(); setVisibility('visible') })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('ticks on the interval while active and visible, and stops when inactive', () => {
    const tick = vi.fn()
    const { rerender } = renderHook(({ active }) => useOperationsAutoRefresh(tick, { active }), { initialProps: { active: true } })

    vi.advanceTimersByTime(OPERATIONS_POLL_INTERVAL_MS)
    expect(tick).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(OPERATIONS_POLL_INTERVAL_MS * 2)
    expect(tick).toHaveBeenCalledTimes(3)

    rerender({ active: false })
    tick.mockClear()
    vi.advanceTimersByTime(OPERATIONS_POLL_INTERVAL_MS * 3)
    expect(tick).not.toHaveBeenCalled()
  })

  it('skips ticks while the document is hidden and resumes when visible again', () => {
    const tick = vi.fn()
    renderHook(() => useOperationsAutoRefresh(tick, { active: true }))

    setVisibility('hidden')
    vi.advanceTimersByTime(OPERATIONS_POLL_INTERVAL_MS * 3)
    expect(tick).not.toHaveBeenCalled()

    setVisibility('visible')
    vi.advanceTimersByTime(OPERATIONS_POLL_INTERVAL_MS)
    expect(tick).toHaveBeenCalledTimes(1)
  })
})
