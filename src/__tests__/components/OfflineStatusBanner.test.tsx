import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { OfflineStatusBanner } from '../../components/common/OfflineStatusBanner'
import { useSyncStore } from '../../stores/syncStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { requestSync } from '../../lib/syncTrigger'

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => true),
}))

vi.mock('../../lib/syncTrigger', () => ({
  requestSync: vi.fn(async () => {}),
}))

vi.mock('../../stores/syncStore', () => {
  const store: any = vi.fn()
  store.getState = vi.fn(() => ({
    refreshCount: vi.fn(async () => 0),
    refreshConflictsCount: vi.fn(),
    setStatus: vi.fn(),
  }))
  return { useSyncStore: store }
})

vi.mock('lucide-react', () => ({
  Wifi: 'svg',
  WifiOff: 'svg',
  RefreshCw: 'svg',
  CheckCircle2: 'svg',
  AlertTriangle: 'svg',
}))

const mockStore = (overrides: Record<string, any> = {}) => {
  const state = { status: 'idle', pendingCount: 0, failedCount: 0, unresolvedConflictsCount: 0, ...overrides }
  return vi.mocked(useSyncStore).mockImplementation((selector?: any) =>
    selector ? selector(state) : state,
  )
}

const mockOnline = (online: boolean) => {
  vi.mocked(useOnlineStatus).mockReturnValue(online)
}

describe('OfflineStatusBanner Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stays visually silent when online, idle and fully synced', () => {
    mockStore()
    mockOnline(true)
    const { container } = render(<OfflineStatusBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('renders syncing banner when status is syncing', () => {
    mockStore({ status: 'syncing', pendingCount: 5 })
    mockOnline(true)
    render(<OfflineStatusBanner />)
    expect(screen.getByText(/Đang đồng bộ:/)).toBeDefined()
    expect(screen.getByText(/5 thay đổi/)).toBeDefined()
  })

  it('renders offline banner when offline with pending count badge', () => {
    mockStore({ status: 'idle', pendingCount: 3 })
  })

  it('renders syncing banner when status is syncing', () => {
    mockStore({ status: 'syncing', pendingCount: 5 })
    mockOnline(true)
    render(<OfflineStatusBanner />)
    expect(screen.getByText(/Đang đồng bộ:/)).toBeDefined()
    expect(screen.getByText(/5 thay đổi/)).toBeDefined()
  })

  it('renders offline banner when offline with pending count badge', () => {
    mockStore({ status: 'idle', pendingCount: 3 })
    mockOnline(false)
    render(<OfflineStatusBanner />)
    expect(screen.getByText(/Mất kết nối Internet:/)).toBeDefined()
    expect(screen.getByText(/3 thay đổi chờ gửi/)).toBeDefined()
  })

  it('renders pending-online banner when online with pending changes', () => {
    mockStore({ status: 'idle', pendingCount: 2 })
    mockOnline(true)
    render(<OfflineStatusBanner />)
    expect(screen.getByText(/Đã lưu trên máy:/)).toBeDefined()
  })

  it('renders conflict banner when there are unresolved conflicts', () => {
    mockStore({ status: 'idle', pendingCount: 0, unresolvedConflictsCount: 3 })
    mockOnline(true)
    render(<OfflineStatusBanner />)
    expect(screen.getByText(/Xung đột dữ liệu:/)).toBeDefined()
    expect(screen.getByText(/3/)).toBeDefined()
    expect(screen.getByText('Xem xung đột')).toBeDefined()
  })

  it('FE-F1: retry button sends a real sync command instead of faking a syncing status', async () => {
    const setStatus = vi.fn()
    const state = { status: 'failed', pendingCount: 1, failedCount: 0, unresolvedConflictsCount: 0 }
    const getState = vi.mocked(useSyncStore).getState as unknown as ReturnType<typeof vi.fn>
    getState.mockReturnValue({
      refreshCount: vi.fn(async () => 0),
      refreshConflictsCount: vi.fn(),
      setStatus,
    })
    vi.mocked(useSyncStore).mockImplementation((selector?: any) =>
      selector ? selector(state) : state,
    )
    mockOnline(true)
    render(<OfflineStatusBanner />)

    await act(async () => {
      screen.getByText('Thử lại').click()
    })

    expect(vi.mocked(requestSync)).toHaveBeenCalledTimes(1)
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('FE-F1: repeated retry clicks never fake or duplicate a sync flow', async () => {
    const setStatus = vi.fn()
    const state = { status: 'failed', pendingCount: 1, failedCount: 0, unresolvedConflictsCount: 0 }
    const getState = vi.mocked(useSyncStore).getState as unknown as ReturnType<typeof vi.fn>
    getState.mockReturnValue({
      refreshCount: vi.fn(async () => 0),
      refreshConflictsCount: vi.fn(),
      setStatus,
    })
    vi.mocked(useSyncStore).mockImplementation((selector?: any) =>
      selector ? selector(state) : state,
    )
    mockOnline(true)
    render(<OfflineStatusBanner />)

    await act(async () => {
      screen.getByText('Thử lại').click()
      screen.getByText('Thử lại').click()
    })

    // Each click issues one command through the coordinator; de-duplication is
    // owned by runSyncFlow (status/in-tab guard), never by the banner faking
    // status 'syncing' — which would block every later flow.
    expect(vi.mocked(requestSync)).toHaveBeenCalledTimes(2)
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('FE-F4: keeps a persistent rejected-changes banner independent of lastError', () => {
    mockStore({ status: 'idle', pendingCount: 0, failedCount: 2 })
    mockOnline(true)
    render(<OfflineStatusBanner />)
    expect(screen.getByText(/Thay đổi cần xử lý:/)).toBeDefined()
    expect(screen.getByText(/2 thao tác/)).toBeDefined()
  })

  it('FE-F4: offers a diagnostics path for rejected ops', async () => {
    mockStore({ status: 'idle', pendingCount: 0, failedCount: 1 })
    mockOnline(true)
    const onOpenDiagnostics = vi.fn()
    render(<OfflineStatusBanner onOpenDiagnostics={onOpenDiagnostics} />)

    await act(async () => {
      screen.getByText('Xem lý do').click()
    })

    expect(onOpenDiagnostics).toHaveBeenCalledTimes(1)
  })
})
