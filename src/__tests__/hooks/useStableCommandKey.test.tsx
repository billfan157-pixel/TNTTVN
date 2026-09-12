import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'

describe('useStableCommandKey', () => {
  it('reuses the key for an identical payload and rotates on change or release', () => {
    const { result } = renderHook(() => useStableCommandKey())
    const first = result.current.stableKey('create-task', { title: 'Trực cổng', version: 1 })
    expect(typeof first).toBe('string')
    expect(result.current.stableKey('create-task', { title: 'Trực cổng', version: 1 })).toBe(first)
    expect(result.current.stableKey('create-task', { title: 'Trực ngày', version: 1 })).not.toBe(first)
    expect(result.current.stableKey('assign-task', { title: 'Trực cổng', version: 1 })).not.toBe(first)
    result.current.releaseKey('create-task')
    expect(result.current.stableKey('create-task', { title: 'Trực cổng', version: 1 })).not.toBe(first)
  })
})
