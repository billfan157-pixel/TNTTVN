import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileBottomNav } from '../components/mobile/MobileBottomNav'
import { useAuthStore } from '../stores/authStore'

describe('mobile navigation responsiveness', () => {
  it('warms the destination on pointer intent and acknowledges a pending route immediately', () => {
    useAuthStore.setState({
      user: { id: 'admin-1', username: 'admin', fullName: 'Admin', role: 'admin', status: 'ACTIVE', parishId: 'parish-1' },
    })
    const preloadTab = vi.fn()
    const navigation = new Promise<void>(() => {})
    const setActiveTab = vi.fn(() => navigation)

    render(
      <MobileBottomNav
        activeTab="home"
        setActiveTab={setActiveTab}
        preloadTab={preloadTab}
      />,
    )

    const attendance = screen.getByRole('button', { name: 'Điểm danh' })
    fireEvent.pointerDown(attendance)
    fireEvent.click(attendance)

    expect(preloadTab).toHaveBeenCalledWith('attendance')
    expect(setActiveTab).toHaveBeenCalledWith('attendance')
    expect(attendance).toHaveClass('is-active', 'is-pending')
    expect(attendance).toHaveAttribute('aria-busy', 'true')
    expect(attendance).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Trang chủ' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the newest pending tab when an older rapid navigation commits first', () => {
    useAuthStore.setState({
      user: { id: 'admin-1', username: 'admin', fullName: 'Admin', role: 'admin', status: 'ACTIVE', parishId: 'parish-1' },
    })
    const navigation = new Promise<void>(() => {})
    const setActiveTab = vi.fn(() => navigation)
    const { rerender } = render(
      <MobileBottomNav activeTab="home" setActiveTab={setActiveTab} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Điểm danh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Báo cáo' }))

    rerender(<MobileBottomNav activeTab="attendance" setActiveTab={setActiveTab} />)
    expect(screen.getByRole('button', { name: 'Báo cáo' })).toHaveClass('is-active', 'is-pending')
    expect(screen.getByRole('button', { name: 'Báo cáo' })).toHaveAttribute('aria-busy', 'true')

    rerender(<MobileBottomNav activeTab="reports" setActiveTab={setActiveTab} />)
    expect(screen.getByRole('button', { name: 'Báo cáo' })).not.toHaveClass('is-pending')
    expect(screen.getByRole('button', { name: 'Báo cáo' })).toHaveAttribute('aria-current', 'page')
  })
})
