import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { BackendActivityIndicator } from '../../components/common/BackendActivityIndicator'
import { beginBackendActivity, endBackendActivity, resetBackendActivity } from '../../lib/backendActivity'

vi.mock('lucide-react', () => ({
  Loader2: 'svg',
}))

// UX-FEEDBACK-1: chỉ báo phải xuất hiện khi request kéo dài (người dùng không bị
// "đơ màn hình") nhưng KHÔNG được nhấp nháy cho các request nhanh.
describe('BackendActivityIndicator', () => {
  afterEach(() => {
    resetBackendActivity()
    vi.useRealTimers()
  })

  it('không render gì khi không có request backend nào đang bay', () => {
    render(<BackendActivityIndicator />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('chỉ hiện sau ngưỡng delay rồi tự ẩn khi request kết thúc', () => {
    vi.useFakeTimers()
    render(<BackendActivityIndicator delayMs={400} />)

    act(() => {
      beginBackendActivity()
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByRole('status')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(400)
    })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Đang xử lý')
    expect(status).toHaveAttribute('aria-busy', 'true')

    act(() => {
      endBackendActivity()
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('không hiện với request nhanh hơn ngưỡng (không nhấp nháy)', () => {
    vi.useFakeTimers()
    render(<BackendActivityIndicator delayMs={400} />)

    act(() => {
      beginBackendActivity()
    })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    act(() => {
      endBackendActivity()
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
