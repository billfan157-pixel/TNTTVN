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
    expect(screen.getByText('Trang chủ')).toBeDefined()
    expect(screen.getByText('Điểm danh')).toBeDefined()
    expect(screen.getByText('Bảng điểm')).toBeDefined()
    expect(screen.getByText('Thiếu nhi')).toBeDefined()
    expect(screen.getByText('Báo cáo')).toBeDefined()
  })

  it('renders organization navigation tabs when activeWorkspace is organization', () => {
    render(
      <MobileBottomNav
        activeTab="parish-home"
        setActiveTab={vi.fn()}
        activeWorkspace="organization"
      />
    )
    expect(screen.getByText('Tổng quan')).toBeDefined()
    expect(screen.getByText('Huynh trưởng')).toBeDefined()
    expect(screen.getByText('Lịch xứ')).toBeDefined()
    expect(screen.getByText('Sổ quỹ')).toBeDefined()
    expect(screen.getByText('Hồ sơ xứ')).toBeDefined()
  })
})
