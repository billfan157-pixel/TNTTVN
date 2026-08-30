import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ForcePasswordChangeModal } from '../../components/common/ForcePasswordChangeModal'

const mockChangePassword = vi.fn()
let mockState: any = {}

vi.mock('../../stores/authStore', () => ({
  useAuthStore: Object.assign(
    (selector?: any) => {
      const state = {
        requiresPasswordChange: true,
        changePassword: mockChangePassword,
        isLoading: false,
        error: null,
        clearError: vi.fn(),
        user: { fullName: 'Admin User' },
        ...mockState,
      }
      return selector ? selector(state) : state
    },
    { getState: () => ({}), setState: vi.fn() },
  ),
}))

vi.mock('lucide-react', () => ({
  X: 'svg', Lock: 'svg', Eye: 'svg', EyeOff: 'svg',
  ShieldCheck: 'svg', AlertCircle: 'svg', Loader2: 'svg',
}))

function setMockState(overrides: Record<string, any>) {
  mockState = overrides
}

function fillForm(current: string, newPass: string, confirm: string) {
  if (current) fireEvent.change(screen.getByPlaceholderText('Nhập mật khẩu được cấp...'), { target: { value: current } })
  if (newPass) fireEvent.change(screen.getByPlaceholderText('Nhập mật khẩu mới...'), { target: { value: newPass } })
  if (confirm) fireEvent.change(screen.getByPlaceholderText('Nhập lại mật khẩu mới...'), { target: { value: confirm } })
}

describe('ForcePasswordChangeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState = {}
  })

  it('renders nothing when requiresPasswordChange is false', () => {
    setMockState({ requiresPasswordChange: false })
    const { container } = render(<ForcePasswordChangeModal />)
    expect(container.innerHTML).toBe('')
  })

  it('renders form when requiresPasswordChange is true', () => {
    render(<ForcePasswordChangeModal />)
    expect(screen.getByText('Đổi Mật Khẩu Bắt Buộc')).toBeDefined()
    expect(screen.getByText(/^Xin chào.*vui lòng đặt mật khẩu mới để tiếp tục\.$/)).toBeDefined()
    expect(screen.getByText('Đổi Mật Khẩu & Tiếp Tục')).toBeDefined()
  })

  it('shows password mismatch error', () => {
    render(<ForcePasswordChangeModal />)
    fillForm('', 'NewPass1!', 'DifferentPass1!')
    fireEvent.click(screen.getByText('Đổi Mật Khẩu & Tiếp Tục'))
    expect(screen.getByText((_, el) => el?.textContent === 'Mật khẩu xác nhận không khớp')).toBeDefined()
  })

  it('shows validation error for short password', () => {
    render(<ForcePasswordChangeModal />)
    fillForm('OldPass1!', 'Short1!', 'Short1!')
    fireEvent.click(screen.getByText('Đổi Mật Khẩu & Tiếp Tục'))
    expect(screen.getByText('Mật khẩu phải có ít nhất 8 ký tự')).toBeDefined()
  })

  it('shows validation error for missing uppercase', () => {
    render(<ForcePasswordChangeModal />)
    fillForm('OldPass1!', 'nouppercase1!', 'nouppercase1!')
    fireEvent.click(screen.getByText('Đổi Mật Khẩu & Tiếp Tục'))
    expect(screen.getByText('Mật khẩu phải có ít nhất 1 chữ HOA')).toBeDefined()
  })

  it('shows validation error for missing digit', () => {
    render(<ForcePasswordChangeModal />)
    fillForm('OldPass1!', 'NoDigit!', 'NoDigit!')
    fireEvent.click(screen.getByText('Đổi Mật Khẩu & Tiếp Tục'))
    expect(screen.getByText('Mật khẩu phải có ít nhất 1 chữ số')).toBeDefined()
  })

  it('shows validation error for missing special char', () => {
    render(<ForcePasswordChangeModal />)
    fillForm('OldPass12', 'NoSpecial1', 'NoSpecial1')
    fireEvent.click(screen.getByText('Đổi Mật Khẩu & Tiếp Tục'))
    expect(screen.getByText('Mật khẩu phải có ít nhất 1 ký tự đặc biệt')).toBeDefined()
  })

  it('shows error when new password equals current password', () => {
    render(<ForcePasswordChangeModal />)
    fillForm('SamePass1!', 'SamePass1!', 'SamePass1!')
    fireEvent.click(screen.getByText('Đổi Mật Khẩu & Tiếp Tục'))
    expect(screen.getByText('Mật khẩu mới phải khác mật khẩu hiện tại!')).toBeDefined()
  })

  it('calls changePassword with valid data and shows success', async () => {
    mockChangePassword.mockResolvedValue(true)
    render(<ForcePasswordChangeModal />)
    fillForm('OldPass1!', 'NewPass1!', 'NewPass1!')
    fireEvent.click(screen.getByText('Đổi Mật Khẩu & Tiếp Tục'))
    expect(mockChangePassword).toHaveBeenCalledWith('OldPass1!', 'NewPass1!')
    const successMsg = await screen.findByText('Đổi mật khẩu thành công! Đang chuyển hướng...')
    expect(successMsg).toBeDefined()
  })

  it('shows loading spinner during submission', () => {
    setMockState({ isLoading: true })
    render(<ForcePasswordChangeModal />)
    const spinner = document.body.querySelector('.animate-spin')
    expect(spinner).toBeDefined()
  })

  it('shows store error when present', () => {
    setMockState({ error: 'Server error' })
    render(<ForcePasswordChangeModal />)
    expect(screen.getByText('Server error')).toBeDefined()
  })

  it('shows password strength indicators when typing', () => {
    render(<ForcePasswordChangeModal />)
    fireEvent.change(screen.getByPlaceholderText('Nhập mật khẩu mới...'), { target: { value: 'Strong1!' } })
    expect(screen.getByText('Ít nhất 8 ký tự')).toBeDefined()
    expect(screen.getByText('Có chữ HOA (A-Z)')).toBeDefined()
    expect(screen.getByText('Có chữ số (0-9)')).toBeDefined()
    expect(screen.getByText('Có ký tự đặc biệt (!@#$...)')).toBeDefined()
  })
})
