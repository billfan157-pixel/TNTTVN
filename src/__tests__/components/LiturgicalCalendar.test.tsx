import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LiturgicalTodayWidget } from '../../components/desktop/LiturgicalTodayWidget'
import { MobileLiturgicalWidget } from '../../components/mobile/MobileLiturgicalWidget'
import { DesktopCalendarView } from '../../components/desktop/DesktopCalendarView'
import { MobileCalendarView } from '../../components/mobile/MobileCalendarView'
import { getLiturgicalDay } from '../../utils/liturgicalEngine'

// Mock useNavigate from @tanstack/react-router
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

describe('Liturgical UI Components Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('LiturgicalTodayWidget render thông tin ngày phụng vụ chuẩn xác', () => {
    const today = getLiturgicalDay(new Date())
    render(<LiturgicalTodayWidget />)

    expect(screen.getByText(today.title)).toBeDefined()
    expect(
      screen.getByText(`${today.seasonName} • Năm ${today.sundayCycle || 'A'}`),
    ).toBeDefined()
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

  it('MobileCalendarView render header, bộ điều hướng tháng và SegmentedControl 3 tab', () => {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    render(<MobileCalendarView />)

    // Kiểm tra SubpageHeader và Month Switcher
    expect(screen.getByText(`Tháng ${month}, ${year}`)).toBeDefined()
    expect(screen.getByText(`Tháng ${month} năm ${year}`)).toBeDefined()
    expect(screen.getByRole('button', { name: /Về ngày hôm nay/i })).toBeDefined()

    // Kiểm tra 3 tabs: Lịch Tháng, Lịch Trình, Lễ Trọng
    expect(screen.getByRole('radio', { name: /Lịch Tháng/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: /Lịch Trình/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: /Lễ Trọng/i })).toBeDefined()
  })

  it('MobileCalendarView hiển thị đầy đủ chi tiết ngày phụng vụ được chọn và EmptyState sự kiện', () => {
    const today = getLiturgicalDay(new Date())
    render(<MobileCalendarView />)

    // Kiểm tra thẻ chi tiết ngày
    expect(screen.getAllByText(today.title).length).toBeGreaterThan(0)
    expect(screen.getAllByText(today.seasonName).length).toBeGreaterThan(0)
    expect(screen.getByText(/Mùa Phụng Vụ/i)).toBeDefined()
    expect(screen.getByText(/Màu Áo Lễ/i)).toBeDefined()
    expect(screen.getByText(/Chu Kỳ Lời Chúa/i)).toBeDefined()
    expect(screen.getByText(/Quy Chế/i)).toBeDefined()

    // Kiểm tra nút Google Calendar & nút chia sẻ
    expect(screen.getByTitle(/Google Calendar/i)).toBeDefined()
    expect(screen.getByTitle(/Chia sẻ thông tin phụng vụ/i)).toBeDefined()

    // Kiểm tra EmptyState chuẩn khi không có sự kiện xứ đoàn
    expect(screen.getByText('Chưa có sự kiện xứ đoàn')).toBeDefined()
  })

  it('MobileCalendarView chuyển đổi tab sang Lịch Trình và Lễ Trọng mượt mà', () => {
    render(<MobileCalendarView />)

    // Chuyển sang tab Lịch Trình
    const agendaTab = screen.getByRole('radio', { name: /Lịch Trình/i })
    fireEvent.click(agendaTab)

    expect(screen.getByText(/Bộ lọc lịch trình:/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Lễ Trọng & Buộc/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Sự kiện xứ đoàn/i })).toBeDefined()

    // Chuyển sang tab Lễ Trọng
    const solemnitiesTab = screen.getByRole('radio', { name: /Lễ Trọng/i })
    fireEvent.click(solemnitiesTab)

    expect(screen.getByText('Lễ Trọng & Lễ Buộc Sắp Tới')).toBeDefined()
    expect(screen.getByText('Các ngày lễ quan trọng trong năm phụng vụ')).toBeDefined()
  })

  it('MobileCalendarView mở ModalShell xuất lịch và hiển thị các phạm vi xuất .ics', () => {
    render(<MobileCalendarView />)

    // Mở modal xuất lịch qua nút download trên header
    const exportBtn = screen.getByRole('button', { name: /Đồng bộ và xuất lịch/i })
    fireEvent.click(exportBtn)

    expect(screen.getByText(/Đồng Bộ & Xuất Lịch \(\.ics\)/i)).toBeDefined()
    expect(screen.getByText(/Chọn phạm vi xuất lịch:/i)).toBeDefined()
    expect(screen.getByText(/Chỉ Lễ Trọng & Lễ Buộc/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Tải File Lịch \(\.ics\)/i })).toBeDefined()
  })
})

