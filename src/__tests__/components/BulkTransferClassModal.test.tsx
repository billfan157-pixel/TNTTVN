import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BulkTransferClassModal } from '../../components/common/BulkTransferClassModal'

const mockTransferStudents = vi.fn().mockResolvedValue(undefined)
const mockAddToast = vi.fn()

const mockStudents: any[] = [
  { id: 'ST-01', holyName: 'Giuse', fullName: 'Nguyễn Văn An', classId: 'CLS-AU1', branch: 'AuNhi' },
  { id: 'ST-02', holyName: 'Maria', fullName: 'Trần Thị Bình', classId: 'CLS-AU1', branch: 'AuNhi' },
]

const mockClasses: any[] = [
  { id: 'CLS-AU1', code: 'AU1', name: 'Ấu Nhi 1', branchId: 'AuNhi', homeroomTeacher: { fullName: 'Thầy Minh' } },
  { id: 'CLS-AU2', code: 'AU2', name: 'Ấu Nhi 2', branchId: 'AuNhi', homeroomTeacher: { fullName: 'Cô Lan' } },
  { id: 'CLS-TN1', code: 'TN1', name: 'Thiếu Nhi 1', branchId: 'ThieuNhi', homeroomTeacher: null },
]

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: (selector: any) => {
    const state = {
      students: mockStudents,
      transferStudents: mockTransferStudents,
    }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

vi.mock('../../stores/classStore', () => ({
  useClassStore: (selector: any) => {
    const state = {
      classes: mockClasses,
    }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

vi.mock('../../stores/toastStore', () => ({
  useToastStore: {
    getState: () => ({
      addToast: mockAddToast,
    }),
  },
}))

vi.mock('../../hooks/useAccessibleDialog', () => ({
  useAccessibleDialog: () => ({
    dialogRef: { current: null },
    titleId: 'dialog-title',
  }),
}))

describe('BulkTransferClassModal Component', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <BulkTransferClassModal
        isOpen={false}
        onClose={vi.fn()}
        studentIds={['ST-01', 'ST-02']}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders modal with student names and available target classes when open', () => {
    render(
      <BulkTransferClassModal
        isOpen={true}
        onClose={vi.fn()}
        studentIds={['ST-01', 'ST-02']}
      />
    )

    expect(screen.getByText('Chuyển Lớp Cho Thiếu Nhi')).toBeDefined()
    expect(screen.getByText('2 em')).toBeDefined()
    expect(screen.getByText('Nguyễn Văn An')).toBeDefined()
    expect(screen.getByText('Trần Thị Bình')).toBeDefined()

    // Available target classes (should not include CLS-AU1 since all selected students are in CLS-AU1)
    expect(screen.queryByRole('option', { name: /Ấu Nhi 1/ })).toBeNull()
    expect(screen.getByRole('option', { name: /Ấu Nhi 2/ })).toBeDefined()
    expect(screen.getByRole('option', { name: /Thiếu Nhi 1/ })).toBeDefined()
  })

  it('validates required target class and minimum reason length', async () => {
    render(
      <BulkTransferClassModal
        isOpen={true}
        onClose={vi.fn()}
        studentIds={['ST-01']}
      />
    )

    const submitBtn = screen.getByText('Xác Nhận Chuyển Lớp')
    expect(submitBtn.hasAttribute('disabled')).toBe(true)

    // Select target class
    const select = screen.getByLabelText(/Lớp học đích/i)
    fireEvent.change(select, { target: { value: 'CLS-AU2' } })

    // Button should still be disabled until reason is at least 5 chars
    expect(submitBtn.hasAttribute('disabled')).toBe(true)

    // Enter short reason
    const textarea = screen.getByLabelText(/Lý do chuyển lớp/i)
    fireEvent.change(textarea, { target: { value: 'abc' } })
    expect(submitBtn.hasAttribute('disabled')).toBe(true)

    // Enter valid reason >= 5 characters
    fireEvent.change(textarea, { target: { value: 'Chuyển sang lớp bạn thân' } })
    expect(submitBtn.hasAttribute('disabled')).toBe(false)
  })

  it('submits successfully and calls transferStudents, onSuccess and onClose', async () => {
    const handleClose = vi.fn()
    const handleSuccess = vi.fn()

    render(
      <BulkTransferClassModal
        isOpen={true}
        onClose={handleClose}
        studentIds={['ST-01', 'ST-02']}
        onSuccess={handleSuccess}
      />
    )

    // Select class
    const select = screen.getByLabelText(/Lớp học đích/i)
    fireEvent.change(select, { target: { value: 'CLS-AU2' } })

    // Enter reason
    const textarea = screen.getByLabelText(/Lý do chuyển lớp/i)
    fireEvent.change(textarea, { target: { value: 'Cân đối sĩ số lớp đầu năm' } })

    // Submit
    const submitBtn = screen.getByText('Xác Nhận Chuyển Lớp')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockTransferStudents).toHaveBeenCalledTimes(1)
      expect(mockTransferStudents).toHaveBeenCalledWith(
        ['ST-01', 'ST-02'],
        'CLS-AU2',
        'Cân đối sĩ số lớp đầu năm'
      )
      expect(mockAddToast).toHaveBeenCalledWith(
        'Đã chuyển thành công 2 thiếu nhi sang Ấu Nhi 2',
        'success'
      )
      expect(handleSuccess).toHaveBeenCalledTimes(1)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })
  })
})
