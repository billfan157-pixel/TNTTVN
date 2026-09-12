import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { LeaveRequestModal } from '../../components/common/LeaveRequestModal'

const mockSubmitRequest = vi.fn()

vi.mock('../../stores/leaveRequestStore', () => ({
  useLeaveRequestStore: (selector: any) => {
    const state = {
      submitRequest: mockSubmitRequest,
    }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

vi.mock('../../hooks/useAccessibleDialog', () => ({
  useAccessibleDialog: () => ({
    dialogRef: { current: null },
  }),
}))

describe('LeaveRequestModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <LeaveRequestModal
        isOpen={false}
        onClose={vi.fn()}
        studentId="st-1"
        studentName="Nguyễn Văn A"
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders form elements with student name when open', () => {
    render(
      <LeaveRequestModal
        isOpen={true}
        onClose={vi.fn()}
        studentId="st-1"
        studentName="Nguyễn Văn A"
        holyName="Giuse"
        className="Ấu Nhi 1"
      />
    )

    expect(screen.getByText('Đơn Xin Phép Nghỉ')).toBeDefined()
    expect(screen.getByText(/Nguyễn Văn A/)).toBeDefined()
    expect(screen.getByText(/Ấu Nhi 1/)).toBeDefined()
    expect(screen.getByLabelText(/Ngày Xin Nghỉ/i)).toBeDefined()
  })

  it('shows error when submitted without reason', async () => {
    render(
      <LeaveRequestModal
        isOpen={true}
        onClose={vi.fn()}
        studentId="st-1"
        studentName="Nguyễn Văn A"
      />
    )

    const dateInput = screen.getByLabelText(/Ngày Xin Nghỉ/i)
    fireEvent.change(dateInput, { target: { value: '2026-09-06' } })

    const form = dateInput.closest('form')!
    await act(async () => {
      fireEvent.submit(form)
    })

    expect(screen.getByText('Vui lòng nhập lý do xin nghỉ (tối thiểu 3 ký tự)')).toBeDefined()
    expect(mockSubmitRequest).not.toHaveBeenCalled()

    const reasonInput = screen.getByPlaceholderText(/VD: Em bị sốt/i)
    expect(reasonInput.getAttribute('aria-invalid')).toBe('true')
  })

  it('submits request successfully when all required fields are provided', async () => {
    mockSubmitRequest.mockResolvedValueOnce({ id: 'req-1' })
    const onClose = vi.fn()
    const onSuccess = vi.fn()

    render(
      <LeaveRequestModal
        isOpen={true}
        onClose={onClose}
        studentId="st-1"
        studentName="Nguyễn Văn A"
        onSuccess={onSuccess}
      />
    )

    // Set date
    const dateInput = screen.getByLabelText(/Ngày Xin Nghỉ/i)
    fireEvent.change(dateInput, { target: { value: '2026-09-06' } })

    // Fill reason
    const reasonInput = screen.getByPlaceholderText(/VD: Em bị sốt/i)
    fireEvent.change(reasonInput, { target: { value: 'Em bị cảm sốt cần nghỉ dưỡng' } })

    // Submit form
    const form = dateInput.closest('form')!
    await act(async () => {
      fireEvent.submit(form)
    })

    expect(mockSubmitRequest).toHaveBeenCalledWith({
      studentId: 'st-1',
      date: '2026-09-06',
      sessionTypes: ['SundayMass', 'CatechismClass'],
      reason: 'Em bị cảm sốt cần nghỉ dưỡng',
    })
    expect(onClose).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalled()
  })
})
