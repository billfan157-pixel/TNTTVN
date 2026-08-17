import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiturgicalTodayWidget } from '../../components/desktop/LiturgicalTodayWidget'
import { MobileLiturgicalWidget } from '../../components/mobile/MobileLiturgicalWidget'
import { DesktopCalendarView } from '../../components/desktop/DesktopCalendarView'
import { getLiturgicalDay } from '../../utils/liturgicalEngine'

// Mock useNavigate from @tanstack/react-router
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

describe('Liturgical UI Components Tests', () => {
  it('LiturgicalTodayWidget render thông tin ngày phụng vụ chuẩn xác', () => {
    const today = getLiturgicalDay(new Date())
    render(<LiturgicalTodayWidget />)

    expect(screen.getByText(today.title)).toBeDefined()
    expect(screen.getByText(/Năm/)).toBeDefined()
    expect(screen.getByText('Xem Lịch Phụng Vụ')).toBeDefined()
  })

  it('MobileLiturgicalWidget render gọn gàng trên màn hình nhỏ', () => {
    const today = getLiturgicalDay(new Date())
    render(<MobileLiturgicalWidget />)

    expect(screen.getByText(today.title)).toBeDefined()
    expect(screen.getByText(today.rankName)).toBeDefined()
  })

  it('DesktopCalendarView render tiêu đề và bảng lịch đầy đủ 7 ngày trong tuần', () => {
    render(<DesktopCalendarView />)

    expect(screen.getByText('Lịch Phụng Vụ & Sự Kiện Xứ Đoàn')).toBeDefined()
    expect(screen.getByText('Chúa Nhật')).toBeDefined()
    expect(screen.getByText('Thứ Hai')).toBeDefined()
    expect(screen.getByText('Thứ Bảy')).toBeDefined()
    expect(screen.getAllByText(/Màu Áo Lễ/).length).toBeGreaterThan(0)
  })
})
