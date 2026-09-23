import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// REGRESSION (2026-09-23): authStore.login() từng flip authReady:false khi submit →
// RootLayout unmount trang login giữa chừng → login thất bại làm mất username/mật khẩu
// đã gõ. Cơ chế được khóa ở mức store (authStore.test.ts); test này khóa contract UX
// cuối: sau login thất bại, form vẫn mounted với đủ giá trị + error hiển thị.

const { mockApi, snapshotStore } = vi.hoisted(() => ({
  mockApi: {
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue({ serverConfirmed: true }),
    changePassword: vi.fn(),
    me: vi.fn(),
  },
  snapshotStore: new Map<string, string>(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return { ...actual, api: mockApi }
})

vi.mock('../../lib/db', () => ({
  AUTH_SNAPSHOT_KEY: 'parish_auth_user',
  clearAuthSnapshot: vi.fn(async () => snapshotStore.clear()),
  dexieStorage: {
    getItem: vi.fn(async (k: string) => snapshotStore.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { snapshotStore.set(k, v) }),
    removeItem: vi.fn(async (k: string) => { snapshotStore.delete(k) }),
  },
}))

vi.mock('../../lib/pushManager', () => ({
  initPushSubscription: vi.fn().mockResolvedValue(undefined),
  disablePushSubscription: vi.fn().mockResolvedValue(undefined),
  isNativePushAvailable: vi.fn(() => false),
}))

vi.mock('../../stores/resetStores', () => ({
  resetAllStoresToDefault: vi.fn().mockResolvedValue(undefined),
}))

import { StaffLoginPage } from '../../pages/StaffLoginPage'
import { ParentLoginPage } from '../../pages/ParentLoginPage'
import { useAuthStore } from '../../stores/authStore'

describe('login pages — giữ thông tin đã gõ khi login thất bại', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      authReady: true,
      error: null,
      requiresPasswordChange: false,
    })
  })

  it('Cổng GLV/Nhân sự: username + password còn nguyên sau khi login thất bại', async () => {
    mockApi.login.mockRejectedValueOnce(new Error('Tên đăng nhập hoặc mật khẩu không chính xác!'))

    render(<StaffLoginPage />)
    fireEvent.change(screen.getByLabelText(/Tên Đăng Nhập/i), { target: { value: 'glv01' } })
    fireEvent.change(screen.getByLabelText('Mật Khẩu'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /Đăng Nhập Ngay/i }))

    expect(await screen.findByText('Tên đăng nhập hoặc mật khẩu không chính xác!')).toBeInTheDocument()
    expect(screen.getByDisplayValue('glv01')).toBeInTheDocument()
    expect(screen.getByDisplayValue('secret123')).toBeInTheDocument()
    expect(useAuthStore.getState().authReady).toBe(true)
  })

  it('Cổng Phụ Huynh: SĐT + password còn nguyên sau khi login thất bại', async () => {
    mockApi.login.mockRejectedValueOnce(new Error('Tên đăng nhập hoặc mật khẩu không chính xác!'))

    render(<ParentLoginPage />)
    fireEvent.change(screen.getByLabelText(/Số Điện Thoại/i), { target: { value: '0901234567' } })
    fireEvent.change(screen.getByLabelText('Mật Khẩu'), { target: { value: 'secret456' } })
    fireEvent.click(screen.getByRole('button', { name: /Đăng Nhập Ngay/i }))

    expect(await screen.findByText('Tên đăng nhập hoặc mật khẩu không chính xác!')).toBeInTheDocument()
    expect(screen.getByDisplayValue('0901234567')).toBeInTheDocument()
    expect(screen.getByDisplayValue('secret456')).toBeInTheDocument()
    expect(useAuthStore.getState().authReady).toBe(true)
  })
})
