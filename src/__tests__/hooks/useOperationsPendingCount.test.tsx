import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOperationsPendingCount } from '../../hooks/useOperationsPendingCount'
import { useAuthStore } from '../../stores/authStore'
import { useOperationsStore } from '../../stores/operationsStore'

vi.mock('@sentry/react', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('../../router', () => ({ router: {} }))

const originalFetch = useOperationsStore.getState().fetch

describe('Operations badge session bootstrap boundary', () => {
  beforeEach(() => {
    useAuthStore.setState({ authReady: false, isAuthenticated: false })
    useOperationsStore.getState().clear()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useOperationsStore.setState({ fetch: originalFetch })
  })

  it('waits for authentication and bootstrap, then fetches and subscribes to the server snapshot', async () => {
    const fetch = vi.spyOn(useOperationsStore.getState(), 'fetch').mockResolvedValue(undefined)
    const { result } = renderHook(() => useOperationsPendingCount(true))
    await act(async () => {})
    expect(fetch).not.toHaveBeenCalled()

    act(() => useAuthStore.setState({ isAuthenticated: true }))
    await act(async () => {})
    expect(fetch).not.toHaveBeenCalled()

    act(() => useAuthStore.setState({ authReady: true }))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    act(() => useOperationsStore.setState({ source: 'server', dispatchInvitations: [{ id: 'invitation' } as never] }))
    expect(result.current).toBe(1)

    act(() => useAuthStore.setState({ isAuthenticated: false }))
    expect(result.current).toBe(0)
    act(() => useOperationsStore.setState({ dispatchInvitations: [{ id: 'late-invitation' } as never] }))
    expect(result.current).toBe(0)
  })

  it('does not fetch in an authenticated workspace where the badge is disabled', async () => {
    useAuthStore.setState({ authReady: true, isAuthenticated: true })
    const fetch = vi.spyOn(useOperationsStore.getState(), 'fetch').mockResolvedValue(undefined)
    renderHook(() => useOperationsPendingCount(false))
    await act(async () => {})
    expect(fetch).not.toHaveBeenCalled()
  })
})
