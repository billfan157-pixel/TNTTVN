import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ParentForgotPasswordModal } from '../../components/auth/ParentForgotPasswordModal'

const { requestParentPasswordReset } = vi.hoisted(() => ({
  requestParentPasswordReset: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, api: { ...actual.api, requestParentPasswordReset } }
})

describe('ParentForgotPasswordModal', () => {
  beforeEach(() => {
    requestParentPasswordReset.mockReset()
    requestParentPasswordReset.mockResolvedValue({
      accepted: true,
      message: 'Nếu số điện thoại khớp tài khoản phụ huynh, yêu cầu đã được gửi tới Admin.',
    })
  })

  it('prefills the login phone and submits a reset request without child KBA', async () => {
    render(<ParentForgotPasswordModal isOpen onClose={vi.fn()} initialPhone="0901234567" />)

    expect(screen.getByLabelText(/Số điện thoại đăng nhập/i)).toHaveValue('0901234567')
    fireEvent.click(screen.getByRole('button', { name: /Gửi yêu cầu cho Admin/i }))

    await waitFor(() => expect(requestParentPasswordReset).toHaveBeenCalledWith('0901234567'))
    expect(await screen.findByText(/Đã tiếp nhận yêu cầu/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/ngày sinh|tên của trẻ/i)).not.toBeInTheDocument()
  })

  it('validates the phone locally before calling the server', () => {
    render(<ParentForgotPasswordModal isOpen onClose={vi.fn()} initialPhone="123" />)
    fireEvent.click(screen.getByRole('button', { name: /Gửi yêu cầu cho Admin/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/10 chữ số/i)
    expect(requestParentPasswordReset).not.toHaveBeenCalled()
  })
})
