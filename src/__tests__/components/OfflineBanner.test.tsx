import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OfflineBanner } from '../../components/common/OfflineBanner'
import { useSyncStore } from '../../stores/syncStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => true),
}))

vi.mock('../../stores/syncStore', () => ({
  useSyncStore: vi.fn(),
}))

vi.mock('lucide-react', () => ({
  Wifi: 'svg',
  WifiOff: 'svg',
  RefreshCw: 'svg',
  AlertCircle: 'svg',
  Clock: 'svg',
}))

const mockStore = (overrides: Record<string, any> = {}) => {
  const state = { status: 'idle', pendingCount: 0, lastSyncAt: null, lastError: null, ...overrides }
  return vi.mocked(useSyncStore).mockImplementation((selector?: any) =>
    selector ? selector(state) : state,
  )
}

describe('OfflineBanner Component', () => {
  it('renders nothing when online and idle', () => {
    mockStore()
    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('renders offline banner when status is offline', () => {
    mockStore({ status: 'offline' })
    render(<OfflineBanner />)
    expect(screen.getByText('Bạn đang ngoại tuyến.')).toBeDefined()
  })

  it('renders syncing banner when status is syncing', () => {
    mockStore({ status: 'syncing', pendingCount: 5 })
    render(<OfflineBanner />)
    expect(screen.getByText('Đang đồng bộ dữ liệu...')).toBeDefined()
  })

  it('renders error banner when status is failed and pending', () => {
    mockStore({ status: 'failed', pendingCount: 2, lastError: 'Network error' })
    render(<OfflineBanner />)
    expect(screen.getByText('Đồng bộ thất bại.')).toBeDefined()
  })

  it('renders nothing when status is failed with no pending ops', () => {
    mockStore({ status: 'failed', pendingCount: 0 })
    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe('')
  })
})
