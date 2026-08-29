import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OfflineStatusBanner } from '../../components/common/OfflineStatusBanner'
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
  CheckCircle2: 'svg',
}))

const mockStore = (overrides: Record<string, any> = {}) => {
  const state = { status: 'idle', pendingCount: 0, ...overrides }
  return vi.mocked(useSyncStore).mockImplementation((selector?: any) =>
    selector ? selector(state) : state,
  )
}

const mockOnline = (online: boolean) => {
  vi.mocked(useOnlineStatus).mockReturnValue(online)
}

describe('OfflineStatusBanner Component', () => {
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
})
