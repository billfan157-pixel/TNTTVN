/**
 * Hợp đồng mobile của ExamResultsTable (< 1024px): mỗi kết quả một thẻ — điểm,
 * mã đề, nguồn và thao tác nằm trong màn hình thay vì bảng 1312px phải cuộn
 * ngang. Ảnh rà soát chỉ xuất hiện với kết quả quét (OMR/QR).
 * jsdom không có matchMedia (hook trả false = bảng desktop), nên test phải stub
 * mobile tường minh.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ExamResultsTable } from '../../components/exam/ExamResultsTable'
import type { ExamResult } from '../../types'

function stubMobileViewport() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
  }))
}

const scanned: ExamResult = {
  id: 'R1',
  examSessionId: 'S1',
  studentId: 'ST-1',
  score: 8.5,
  source: 'omr',
  createdAt: '2026-10-01T03:00:00.000Z',
  studentCode: 'TN001',
  studentName: 'Nguyễn Văn An',
  holyName: 'Giuse',
  examVersion: 'B',
}

const manual: ExamResult = {
  id: 'R2',
  examSessionId: 'S1',
  studentId: 'ST-2',
  score: 7,
  source: 'quick_entry',
  createdAt: '2026-10-01T03:05:00.000Z',
  studentCode: 'TN002',
  studentName: 'Trần Bình',
}

describe('ExamResultsTable — danh sách thẻ mobile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('render một thẻ cho mỗi kết quả với điểm, mã đề và thao tác riêng', () => {
    stubMobileViewport()
    render(<ExamResultsTable results={[scanned, manual]} onRemove={vi.fn()} sessionId="S1" />)

    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('8.5')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument()
    // 'OMR' xuất hiện 2 lần: nút lọc nguồn trên toolbar + badge nguồn của thẻ.
    expect(screen.getAllByText('OMR')).toHaveLength(2)
    expect(screen.getByText('B')).toBeInTheDocument()
    // Chỉ kết quả quét mới có ảnh rà soát; mọi thẻ đều xóa được.
    expect(screen.getAllByRole('button', { name: /Ảnh rà soát/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Xóa/ })).toHaveLength(2)
  })

  it('xóa đúng kết quả từ nút trên thẻ', () => {
    stubMobileViewport()
    const onRemove = vi.fn()
    render(<ExamResultsTable results={[scanned]} onRemove={onRemove} sessionId="S1" />)

    fireEvent.click(screen.getByRole('button', { name: /Xóa/ }))
    expect(onRemove).toHaveBeenCalledWith('R1')
  })

  it('hiện điểm tự luận trên thẻ ở chế độ tự luận', () => {
    stubMobileViewport()
    render(<ExamResultsTable results={[{ ...scanned, essayScore: 2.5 }]} onRemove={vi.fn()} essayMode />)

    expect(screen.getByText('Điểm TL')).toBeInTheDocument()
    expect(screen.getByText('2.5')).toBeInTheDocument()
  })
})
