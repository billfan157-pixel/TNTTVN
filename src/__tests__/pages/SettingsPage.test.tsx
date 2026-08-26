import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { changePassword, adminChangePassword, authUser } = vi.hoisted(() => ({
  changePassword: vi.fn(),
  adminChangePassword: vi.fn(),
  authUser: {
    id: 'USR-001',
    username: 'bill',
    fullName: 'Admin Trưởng',
    role: 'admin',
    parishId: 'gia-ton',
    status: 'ACTIVE',
  },
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: authUser, role: 'admin' }) }))
vi.mock('../../stores/filterStore', () => ({
  useFilterStore: (selector: (state: { viewMode: 'auto'; setViewMode: () => void }) => unknown) => selector({ viewMode: 'auto', setViewMode: vi.fn() }),
}))
vi.mock('../../stores/authStore', () => {
  const state = { user: authUser, logout: vi.fn(), setUser: vi.fn() }
  return { useAuthStore: Object.assign(() => state, { getState: () => state }) }
})
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    api: { ...actual.api, changePassword, adminChangePassword, updateProfile: vi.fn() },
  }
})

import SettingsPage from '../../pages/SettingsPage'

describe('SettingsPage — self-service password change', () => {
  it('superadmin nhập mật khẩu hiện tại và dùng endpoint self-service', async () => {
    changePassword.mockResolvedValue({ success: true, accessToken: 'new-access-token' })
    const { container } = render(<SettingsPage />)

    fireEvent.change(container.querySelector('#cp-current')!, { target: { value: 'OldPassword1!' } })
    fireEvent.change(container.querySelector('#cp-new')!, { target: { value: 'NewPassword1!' } })
    fireEvent.change(container.querySelector('#cp-confirm')!, { target: { value: 'NewPassword1!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cập Nhật Mật Khẩu' }))

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('OldPassword1!', 'NewPassword1!'))
    expect(adminChangePassword).not.toHaveBeenCalled()
    expect(await screen.findByText(/Phiên hiện tại đã được làm mới/)).toBeTruthy()
  })
})
