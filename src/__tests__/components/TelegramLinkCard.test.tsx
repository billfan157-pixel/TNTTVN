import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { TelegramLinkCard } from '../../components/common/TelegramLinkCard'
import { api } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  api: {
    getTelegramLinkStatus: vi.fn(),
    createTelegramLinkToken: vi.fn(),
    setTelegramNotifications: vi.fn(),
    revokeTelegramLink: vi.fn(),
  },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { username: '0901234567', fullName: 'Nguyễn Văn Ba' } }),
}))

vi.mock('../../components/common/ConfirmDialog', () => ({
  ConfirmDialog: (props: any) => props.isOpen ? (
    <div data-testid="confirm-dialog">
      <button onClick={props.onConfirm}>Xác Nhận</button>
      <button onClick={props.onCancel}>Hủy</button>
    </div>
  ) : null,
}))

describe('TelegramLinkCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Chưa liên kết" and a "Tạo Mã Liên Kết" button when no active links', async () => {
    vi.mocked(api.getTelegramLinkStatus).mockResolvedValue([])
    await act(async () => { render(<TelegramLinkCard />) })

    expect(screen.getByText('Chưa liên kết')).toBeDefined()
    expect(screen.getByText('Tạo Mã Liên Kết')).toBeDefined()
  })

  it('creates a link token and displays it with copy button', async () => {
    vi.mocked(api.getTelegramLinkStatus).mockResolvedValue([])
    vi.mocked(api.createTelegramLinkToken).mockResolvedValue({ token: 'TOKEN-ABC-123', expiresAt: new Date(Date.now() + 600000).toISOString() })

    await act(async () => { render(<TelegramLinkCard />) })
    await act(async () => {
      fireEvent.click(screen.getByText('Tạo Mã Liên Kết'))
    })

    expect(api.createTelegramLinkToken).toHaveBeenCalledTimes(1)
    expect(screen.getByText('TOKEN-ABC-123')).toBeDefined()
    expect(screen.getByText('Sao Chép')).toBeDefined()
  })

  it('shows linked status with toggle and revoke buttons when linked', async () => {
    vi.mocked(api.getTelegramLinkStatus).mockResolvedValue([
      { chatId: 'c1', telegramUsername: 'phuhuynh_a', status: 'ACTIVE', notificationsEnabled: 1, linkedAt: '2026-08-01T00:00:00Z', lastSeenAt: '2026-08-15T00:00:00Z' },
    ])

    await act(async () => { render(<TelegramLinkCard />) })

    expect(screen.getByText('Đã liên kết')).toBeDefined()
    expect(screen.getByText(/@phuhuynh_a/)).toBeDefined()
    expect(screen.getByText('Tắt Thông Báo')).toBeDefined()
    expect(screen.getByText('Hủy Liên Kết')).toBeDefined()
  })

  it('toggles notifications off and refreshes status', async () => {
    vi.mocked(api.getTelegramLinkStatus)
      .mockResolvedValueOnce([
        { chatId: 'c1', telegramUsername: null, status: 'ACTIVE', notificationsEnabled: 1, linkedAt: null, lastSeenAt: null },
      ])
      .mockResolvedValueOnce([
        { chatId: 'c1', telegramUsername: null, status: 'ACTIVE', notificationsEnabled: 0, linkedAt: null, lastSeenAt: null },
      ])
    vi.mocked(api.setTelegramNotifications).mockResolvedValue({ enabled: false, updatedLinks: 1 })

    await act(async () => { render(<TelegramLinkCard />) })
    await act(async () => {
      fireEvent.click(screen.getByText('Tắt Thông Báo'))
    })

    expect(api.setTelegramNotifications).toHaveBeenCalledWith(false)
    expect(api.getTelegramLinkStatus).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Bật Thông Báo')).toBeDefined()
  })

  it('revokes the link after confirm dialog', async () => {
    vi.mocked(api.getTelegramLinkStatus)
      .mockResolvedValueOnce([
        { chatId: 'c1', telegramUsername: null, status: 'ACTIVE', notificationsEnabled: 1, linkedAt: null, lastSeenAt: null },
      ])
      .mockResolvedValueOnce([])
    vi.mocked(api.revokeTelegramLink).mockResolvedValue({ revokedLinks: 1 })

    await act(async () => { render(<TelegramLinkCard />) })
    await act(async () => {
      fireEvent.click(screen.getByText('Hủy Liên Kết'))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Xác Nhận'))
    })

    expect(api.revokeTelegramLink).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Tạo Mã Liên Kết')).toBeDefined()
  })
})
