import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ColdStartNotice } from '../../components/common/ColdStartNotice'

vi.mock('lucide-react', () => ({
  Hourglass: 'svg',
}))

describe('ColdStartNotice', () => {
  it('hiển thị ghi chú máy chủ đang khởi động với role status', () => {
    render(<ColdStartNotice />)
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('Máy chủ có thể đang khởi động')
    expect(notice).toHaveTextContent('không cần tải lại trang')
  })

  it('cho phép ghi đè className (vd đẩy xuống dưới nút submit)', () => {
    render(<ColdStartNotice className="mt-4" />)
    expect(screen.getByRole('status')).toHaveClass('mt-4')
  })
})
