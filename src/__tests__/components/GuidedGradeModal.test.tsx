import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GuidedGradeModal } from '../../components/exam/GuidedGradeModal'

const students = [
  { id: 'ST-1', name: 'Nguyễn Văn An', code: 'TN001' },
  { id: 'ST-2', name: 'Trần Thị Bình', code: 'TN002' },
]

function renderModal(overrides: Partial<React.ComponentProps<typeof GuidedGradeModal>> = {}) {
  const props: React.ComponentProps<typeof GuidedGradeModal> = {
    students,
    savedScores: { 'ST-2': 8 },
    maxScore: 10,
    onSave: vi.fn().mockResolvedValue(true),
    onScanOmr: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<GuidedGradeModal {...props} />)
  return props
}

describe('GuidedGradeModal', () => {
  it('chỉ hiển thị danh sách học sinh được truyền từ lớp của phiên', () => {
    renderModal()
    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.getByText('Trần Thị Bình')).toBeInTheDocument()
    expect(screen.getByText('8/10')).toBeInTheDocument()
  })

  it('lọc theo tên hoặc mã thiếu nhi', () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('Tìm tên hoặc mã thiếu nhi…'), { target: { value: 'TN002' } })
    expect(screen.queryByText('Nguyễn Văn An')).not.toBeInTheDocument()
    expect(screen.getByText('Trần Thị Bình')).toBeInTheDocument()
  })

  it('lưu điểm quick entry rồi chuyển sang học sinh chưa chấm tiếp theo', async () => {
    const props = renderModal()
    fireEvent.click(screen.getByText('Nguyễn Văn An'))
    fireEvent.change(screen.getByLabelText('Điểm cần lưu'), { target: { value: '7.5' } })
    fireEvent.click(screen.getByRole('button', { name: /Lưu điểm cho Nguyễn Văn An/ }))

    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith('ST-1', 7.5))
    expect(screen.getByText('Đã lưu 7.5/10 cho Nguyễn Văn An.')).toBeInTheDocument()
  })

  it('không cho lưu điểm vượt thang điểm', () => {
    const props = renderModal()
    fireEvent.click(screen.getByText('Nguyễn Văn An'))
    fireEvent.change(screen.getByLabelText('Điểm cần lưu'), { target: { value: '11' } })
    expect(screen.getByText('Điểm phải nằm trong khoảng 0–10.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lưu điểm cho Nguyễn Văn An/ })).toBeDisabled()
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('mở quét OMR với danh tính học sinh đã chọn, không cần QR', () => {
    const props = renderModal()
    fireEvent.click(screen.getByText('Nguyễn Văn An'))
    fireEvent.click(screen.getByRole('button', { name: 'Chỉ quét khung OMR cho em này' }))
    expect(props.onScanOmr).toHaveBeenCalledWith(students[0])
  })
})
