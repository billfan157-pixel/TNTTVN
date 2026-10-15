import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopSidebar } from '../components/desktop/DesktopSidebar'
import { useAuthStore } from '../stores/authStore'
import { useLeaveRequestStore } from '../stores/leaveRequestStore'

const fetchPendingCount = useLeaveRequestStore.getState().fetchPendingCount
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'admin-1', username: 'admin', fullName: 'Admin', role: 'admin', status: 'ACTIVE', parishId: 'parish-1' },
  })
  useLeaveRequestStore.setState({ fetchPendingCount: vi.fn() })
})
afterEach(() => useLeaveRequestStore.setState({ fetchPendingCount }))

const filters = {
  selectedBranchId: 'all', setSelectedBranchId: vi.fn(),
  selectedClassId: 'all', setSelectedClassId: vi.fn(),
  classes: [], branches: {},
}

describe('desktop navigation responsiveness', () => {
  it('preloads on pointer/keyboard intent and acknowledges a slow destination without moving aria-current', () => {
    const preloadTab = vi.fn()
    const setActiveTab = vi.fn(() => new Promise<void>(() => {}))
    render(<DesktopSidebar {...filters} activeTab="dashboard" setActiveTab={setActiveTab} preloadTab={preloadTab} />)
    const grades = screen.getByRole('button', { name: 'Bảng Điểm' })

    fireEvent.pointerEnter(grades)
    fireEvent.focus(grades)
    expect(preloadTab).toHaveBeenCalledTimes(2)
    expect(preloadTab).toHaveBeenLastCalledWith('grades')
    fireEvent.click(grades)

    expect(grades).toHaveAttribute('aria-busy', 'true')
    expect(grades).toHaveClass('sidebar-nav-item-active')
    expect(grades).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Tổng Quan' })).toHaveAttribute('aria-current', 'page')
  })

  it('preserves the latest rapid intent while an earlier route commits', () => {
    const setActiveTab = vi.fn(() => new Promise<void>(() => {}))
    const { rerender } = render(<DesktopSidebar {...filters} activeTab="dashboard" setActiveTab={setActiveTab} />)
    fireEvent.click(screen.getByRole('button', { name: 'Điểm Danh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Báo Cáo' }))

    rerender(<DesktopSidebar {...filters} activeTab="attendance" setActiveTab={setActiveTab} />)
    const reports = screen.getByRole('button', { name: 'Báo Cáo' })
    expect(reports).toHaveAttribute('aria-busy', 'true')
    rerender(<DesktopSidebar {...filters} activeTab="reports" setActiveTab={setActiveTab} />)
    expect(reports).not.toHaveAttribute('aria-busy')
    expect(reports).toHaveAttribute('aria-current', 'page')
  })

  it('allows the current page to supersede a pending destination', () => {
    const setActiveTab = vi.fn((_tab: string) => new Promise<void>(() => {}))
    render(<DesktopSidebar {...filters} activeTab="dashboard" setActiveTab={setActiveTab} />)

    fireEvent.click(screen.getByRole('button', { name: 'Điểm Danh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tổng Quan' }))

    expect(setActiveTab.mock.calls.map(([tab]) => tab)).toEqual(['attendance', 'dashboard'])
    expect(screen.getByRole('button', { name: 'Điểm Danh' })).not.toHaveAttribute('aria-busy')
  })
})
