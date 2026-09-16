import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MobileBottomNav } from '../../components/mobile/MobileBottomNav'

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ role: 'admin' }),
}))

describe('MobileBottomNav Workspace Navigation', () => {
  it('renders academic navigation tabs when activeWorkspace is academic', () => {
    render(
      <MobileBottomNav
        activeTab="home"
        setActiveTab={vi.fn()}
        activeWorkspace="academic"
      />
    )
    expect(screen.getByText(/Trang chủ/i)).toBeDefined()
    expect(screen.getByText(/Điểm danh/i)).toBeDefined()
    expect(screen.getByText(/Bảng điểm/i)).toBeDefined()
    expect(screen.getByText(/Thiếu nhi/i)).toBeDefined()
    expect(screen.getByText(/Báo cáo/i)).toBeDefined()
  })

  it('renders organization navigation tabs when activeWorkspace is organization', () => {
    render(
      <MobileBottomNav
        activeTab="parish-home"
        setActiveTab={vi.fn()}
        activeWorkspace="organization"
      />
    )
    // Wave 0 DECIDED: Tổng Quan · Lịch · Công Việc · Thông Báo · Hồ Sơ
    expect(screen.getByText(/Tổng quan/i)).toBeDefined()
    expect(screen.getByText(/Lịch xứ/i)).toBeDefined()
    expect(screen.getByText(/Công việc/i)).toBeDefined()
    expect(screen.getByText(/Thông báo/i)).toBeDefined()
    expect(screen.getByText(/Hồ sơ xứ/i)).toBeDefined()
    expect(screen.queryByText(/Huynh trưởng/i)).toBeNull()
    expect(screen.queryByText(/Sổ quỹ/i)).toBeNull()
  })

  // W2.10: pending-operations badge on the org "Công Việc" tab.
  it('W2.10: badges the Công Việc tab with the pending count', () => {
    render(
      <MobileBottomNav
        activeTab="parish-home"
        setActiveTab={vi.fn()}
        activeWorkspace="organization"
        operationsBadge={3}
      />
    )
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Công Việc · 3 việc chờ phản hồi' })).toBeInTheDocument()
  })

  it('W2.10: caps the badge at 99+ and hides it at zero', () => {
    const { rerender } = render(
      <MobileBottomNav activeTab="parish-home" setActiveTab={vi.fn()} activeWorkspace="organization" operationsBadge={150} />
    )
    expect(screen.getByText('99+')).toBeInTheDocument()
    rerender(<MobileBottomNav activeTab="parish-home" setActiveTab={vi.fn()} activeWorkspace="organization" operationsBadge={0} />)
    expect(screen.queryByText('99+')).toBeNull()
    expect(screen.getByRole('button', { name: 'Công Việc' })).toBeInTheDocument()
  })
})
