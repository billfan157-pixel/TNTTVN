import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDelayedNotice } from '../../hooks/useDelayedNotice'

describe('useDelayedNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('không hiển thị notice trước khi hết delay', () => {
    const { result } = renderHook(() => useDelayedNotice(true, 10_000))
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(9_999)
    })
    expect(result.current).toBe(false)
  })

  it('hiển thị notice đúng sau delay khi active', () => {
    const { result } = renderHook(() => useDelayedNotice(true, 10_000))
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current).toBe(true)
  })

  it('reset ngay khi active tắt và tự re-arm cho lần chờ kế tiếp', () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedNotice(active, 5_000), {
      initialProps: { active: true },
    })
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(result.current).toBe(true)

    rerender({ active: false })
    expect(result.current).toBe(false)

    // Bật lại: phải chờ đủ delay mới, không kế thừa trạng thái cũ.
    rerender({ active: true })
    act(() => {
      vi.advanceTimersByTime(4_999)
    })
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(true)
  })

  it('không kích hoạt khi chưa từng active', () => {
    const { result } = renderHook(() => useDelayedNotice(false, 1_000))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).toBe(false)
  })
})
