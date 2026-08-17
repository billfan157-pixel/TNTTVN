import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  EmptyState,
  NoResultState,
  ErrorState,
  SkeletonTable,
  SkeletonCardGrid,
} from '../../components/common/StateFeedback'

describe('StateFeedback Components (DS v3.1)', () => {
  it('renders EmptyState with custom title, description, and action button', () => {
    const onAction = vi.fn()
    render(
      <EmptyState
        title="Chưa có học sinh"
        description="Lớp này hiện chưa có danh sách học sinh nào."
        actionLabel="Thêm học sinh mới"
        onAction={onAction}
      />
    )

    expect(screen.getByText('Chưa có học sinh')).toBeInTheDocument()
    expect(screen.getByText('Lớp này hiện chưa có danh sách học sinh nào.')).toBeInTheDocument()
    const actionBtn = screen.getByRole('button', { name: 'Thêm học sinh mới' })
    expect(actionBtn).toBeInTheDocument()
    fireEvent.click(actionBtn)
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders NoResultState with default title and reset button', () => {
    const onReset = vi.fn()
    render(<NoResultState onReset={onReset} />)

    expect(screen.getByText('Không tìm thấy kết quả phù hợp')).toBeInTheDocument()
    const resetBtn = screen.getByRole('button', { name: 'Xóa bộ lọc' })
    expect(resetBtn).toBeInTheDocument()
    fireEvent.click(resetBtn)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('renders ErrorState with error message and retry button', () => {
    const onRetry = vi.fn()
    render(
      <ErrorState
        title="Lỗi tải dữ liệu"
        message="Không thể kết nối tới máy chủ."
        retryLabel="Thử lại ngay"
        onRetry={onRetry}
      />
    )

    expect(screen.getByText('Lỗi tải dữ liệu')).toBeInTheDocument()
    expect(screen.getByText('Không thể kết nối tới máy chủ.')).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: 'Thử lại ngay' })
    expect(retryBtn).toBeInTheDocument()
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders SkeletonTable with specified rows and cols', () => {
    const { container } = render(<SkeletonTable rows={4} cols={3} />)
    const table = screen.getByRole('status')
    expect(table).toBeInTheDocument()
    const ths = container.querySelectorAll('th')
    expect(ths.length).toBe(3)
    const trs = container.querySelectorAll('tbody tr')
    expect(trs.length).toBe(4)
  })

  it('renders SkeletonCardGrid with specified card count', () => {
    const { container } = render(<SkeletonCardGrid count={5} />)
    const grid = screen.getByRole('status')
    expect(grid).toBeInTheDocument()
    const cards = container.querySelectorAll('.skeleton-card')
    expect(cards.length).toBe(5)
  })
})
