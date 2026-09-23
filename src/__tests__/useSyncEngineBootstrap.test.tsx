import { StrictMode } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncEngine } from '../hooks/useSyncEngine'
import { runInitialSync, runSyncFlow } from '../lib/syncCoordinator'

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => boolean) => selector({ isAuthenticated: true }),
}))
vi.mock('../stores/syncStore', () => ({
  useSyncStore: { getState: () => ({ setStatus: vi.fn(), setLastError: vi.fn() }) },
}))
vi.mock('../lib/syncTrigger', () => ({ registerSyncRunner: () => () => {} }))
vi.mock('../lib/syncCoordinator', () => ({ runInitialSync: vi.fn(), runSyncFlow: vi.fn() }))

function Harness() {
  useSyncEngine()
  return null
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('sync bootstrap lifecycle', () => {
  it('starts once under StrictMode and does not launch a competing timed pull', async () => {
    vi.useFakeTimers()
    let finishInitial!: () => void
    vi.mocked(runInitialSync).mockImplementation(() => new Promise<void>(resolve => { finishInitial = resolve }))
    const view = render(<StrictMode><Harness /></StrictMode>)

    await act(async () => { await Promise.resolve() })
    expect(runInitialSync).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
    expect(runSyncFlow).not.toHaveBeenCalled()

    await act(async () => { finishInitial(); await Promise.resolve() })
    view.unmount()
  })
})
