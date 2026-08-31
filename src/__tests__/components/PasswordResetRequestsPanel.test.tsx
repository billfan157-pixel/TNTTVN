import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PasswordResetRequestsPanel } from '../../components/desktop/PasswordResetRequestsPanel'

const mocks = vi.hoisted(() => ({
  getPasswordResetRequests: vi.fn(),
  resolvePasswordResetRequest: vi.fn(),
  dismissPasswordResetRequest: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, api: { ...actual.api, ...mocks } }
})

describe('PasswordResetRequestsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPasswordResetRequests.mockResolvedValue([{
      id: 'PWR-1',
      userId: 'USR-PARENT',
      fullName: 'Phụ huynh Nguyễn Văn A',
      username: '0901234567',
      phone: '0901234567',
      status: 'PENDING',
      requestCount: 2,
      lastRequestedAt: '2026-08-31T10:00:00.000Z',
    }])
    mocks.resolvePasswordResetRequest.mockResolvedValue({
      username: '0901234567',
      tempPassword: 'Reset@123456',
      fullName: 'Phụ huynh Nguyễn Văn A',
    })
  })

  it('requires verification acknowledgement and admin re-auth before resolving', async () => {
    const onUsersRefresh = vi.fn()
    render(<PasswordResetRequestsPanel onUsersRefresh={onUsersRefresh} />)

    expect(await screen.findByText('Phụ huynh Nguyễn Văn A')).toBeInTheDocument()
    expect(screen.getByText('Đã gửi 2 lần')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Xác minh & cấp mật khẩu/i }))

    const submit = screen.getByRole('button', { name: 'Cấp mật khẩu tạm' })
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /đã kiểm tra danh tính/i }))
    fireEvent.change(screen.getByLabelText(/Mật khẩu hiện tại của Admin/i), { target: { value: 'Admin@Test123' } })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)

    await waitFor(() => expect(mocks.resolvePasswordResetRequest).toHaveBeenCalledWith('PWR-1', 'Admin@Test123'))
    expect(await screen.findByText('Reset@123456')).toBeInTheDocument()
    expect(onUsersRefresh).toHaveBeenCalled()
  })
})
