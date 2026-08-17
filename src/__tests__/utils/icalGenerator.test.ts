import { describe, it, expect } from 'vitest'
import {
  generateLiturgicalIcs,
  buildGoogleCalendarUrl,
} from '../../utils/icalGenerator'
import { getLiturgicalDay } from '../../utils/liturgicalEngine'
import type { ParishEvent } from '../../types/liturgical'

describe('icalGenerator Unit Tests (RFC 5545 iCalendar standard)', () => {
  it('generateLiturgicalIcs tạo chuỗi .ics hợp lệ tuân thủ RFC 5545', () => {
    const day1 = getLiturgicalDay('2026-08-15') // Đức Mẹ Hồn Xác Lên Trời
    const day2 = getLiturgicalDay('2026-11-24') // Các Thánh Tử Đạo Việt Nam

    const parishEvents: ParishEvent[] = [
      {
        id: 'EV-01',
        date: '2026-08-20',
        title: 'Trại Hè Thiếu Nhi Thánh Thể',
        category: 'CAMP',
        categoryName: 'Hội Trại / Dã Ngoại',
        time: '07:30',
        location: 'Khu Du Lịch Bửu Long',
        description: 'Trại hè bế mạc niên học 2025-2026',
      },
    ]

    const icsContent = generateLiturgicalIcs([day1, day2], parishEvents, {
      calendarName: 'Lịch Phụng Vụ Test',
      parishName: 'Giáo Xứ Gia Tôn',
    })

    // Validate VCALENDAR structure
    expect(icsContent).toContain('BEGIN:VCALENDAR')
    expect(icsContent).toContain('VERSION:2.0')
    expect(icsContent).toContain('X-WR-CALNAME:Lịch Phụng Vụ Test')
    expect(icsContent).toContain('END:VCALENDAR')

    // Validate VEVENT entries
    expect(icsContent).toContain('BEGIN:VEVENT')
    expect(icsContent).toContain('SUMMARY:⭐ [LỄ TRỌNG] Đức Mẹ Hồn Xác Lên Trời (và Đức Mẹ La Vang) (Áo Trắng)')
    expect(icsContent).toContain('DTSTART;VALUE=DATE:20260815')
    expect(icsContent).toContain('DTEND;VALUE=DATE:20260816')
    expect(icsContent).toContain('CATEGORIES:Lịch Phụng Vụ,Công Giáo,TNTT')

    // Validate Parish Event entry
    expect(icsContent).toContain('SUMMARY:🚩 [XỨ ĐOÀN] Trại Hè Thiếu Nhi Thánh Thể')
    expect(icsContent).toContain('LOCATION:Khu Du Lịch Bửu Long')
  })

  it('buildGoogleCalendarUrl tạo đường dẫn web thêm sự kiện chuẩn xác', () => {
    const url = buildGoogleCalendarUrl({
      title: 'Lễ Đức Mẹ Hồn Xác Lên Trời',
      date: '2026-08-15',
      description: 'Lễ Trọng - Áo Trắng',
      location: 'Giáo Xứ Gia Tôn',
    })

    expect(url).toContain('calendar.google.com/calendar/render')
    expect(url).toContain('action=TEMPLATE')
    expect(url).toContain('dates=20260815%2F20260816')
    expect(url).toContain('text=L%E1%BB%85+%C4%90%E1%BB%A9c+M%E1%BA%B9+H%E1%BB%93n+X%C3%A1c+L%C3%AAn+Tr%E1%BB%9Di')
  })
})
