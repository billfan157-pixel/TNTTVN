import type { LiturgicalDay, ParishEvent } from '../types/liturgical'

/**
 * Escape text strictly according to RFC 5545 iCalendar specification
 */
function escapeIcsText(text: string): string {
  if (!text) return ''
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Format YYYY-MM-DD to YYYYMMDD for all-day calendar events
 */
function formatIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

/**
 * Calculate the next day YYYYMMDD for inclusive RFC 5545 all-day DTEND
 */
function getNextDayIcsDate(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    const d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)))
    d.setUTCDate(d.getUTCDate() + 1)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}${m}${day}`
  }
  return formatIcsDate(dateStr)
}

export interface IcsExportOptions {
  calendarName?: string
  parishName?: string
  includeGospelVerse?: boolean
}

/**
 * Generate a complete RFC 5545 compliant iCalendar string (.ics)
 * Compatible with Apple Calendar (iOS/macOS), Google Calendar, and Microsoft Outlook.
 */
export function generateLiturgicalIcs(
  liturgicalDays: LiturgicalDay[],
  parishEvents: ParishEvent[] = [],
  options?: IcsExportOptions
): string {
  const calendarName = options?.calendarName || 'Lịch Phụng Vụ & Xứ Đoàn TNTT'
  const parishName = options?.parishName || 'Giáo Xứ Gia Tôn'

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TNTT Parish Platform//Liturgical & Parish Calendar//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
    'X-WR-CALDESC:Lịch Phụng Vụ Công Giáo chuẩn HĐGMVN & Lịch Sinh Hoạt Xứ Đoàn Thiếu Nhi Thánh Thể',
  ]

  const nowStamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

  // 1. Process Liturgical Days
  liturgicalDays.forEach((day) => {
    const dtStart = formatIcsDate(day.date)
    const dtEnd = getNextDayIcsDate(day.date)
    const uid = `liturgical-${day.date}-${nowStamp.slice(0, 8)}@tntt.parish`

    // Summary formatting
    const rankPrefix = day.rank === 'SOLEMNITY' ? '⭐ [LỄ TRỌNG] ' : day.rank === 'FEAST' ? '🌿 [LỄ KÍNH] ' : ''
    const summary = `${rankPrefix}${day.title} (Áo ${day.colorName})`

    // Description construction
    const descParts: string[] = [
      `Mùa: ${day.seasonName}`,
      `Bậc lễ: ${day.rankName}`,
      `Màu áo lễ: ${day.colorName}`,
      day.isHolyDayOfObligation ? '⚠️ LỄ BUỘC THAM DỰ THÁNH LỄ' : '',
    ]

    if (day.readings?.gospel) {
      descParts.push(`Phúc Âm: ${day.readings.gospel}`)
    }
    if (day.readings?.gospelVerse) {
      descParts.push(`Lời Chúa tâm niệm: "${day.readings.gospelVerse}"`)
    }
    if (day.subTitle) {
      descParts.push(`Ghi chú: ${day.subTitle}`)
    }

    const description = descParts.filter(Boolean).join('\n')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${nowStamp}`)
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`)
    lines.push(`DTEND;VALUE=DATE:${dtEnd}`)
    lines.push(`SUMMARY:${escapeIcsText(summary)}`)
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`)
    lines.push(`LOCATION:${escapeIcsText(parishName)}`)
    lines.push('CATEGORIES:Lịch Phụng Vụ,Công Giáo,TNTT')
    lines.push('STATUS:CONFIRMED')
    lines.push('TRANSP:TRANSPARENT')
    lines.push('END:VEVENT')
  })

  // 2. Process Parish & TNTT Events
  parishEvents.forEach((ev) => {
    const dtStart = formatIcsDate(ev.date)
    const dtEnd = getNextDayIcsDate(ev.date)
    const uid = `parish-event-${ev.id || ev.date}@tntt.parish`

    const summary = `🚩 [XỨ ĐOÀN] ${ev.title}`
    const descParts: string[] = [
      `Loại sự kiện: ${ev.categoryName}`,
      ev.time ? `Thời gian: ${ev.time}` : '',
      ev.location ? `Địa điểm: ${ev.location}` : '',
      ev.description ? `Chi tiết: ${ev.description}` : '',
    ]

    const description = descParts.filter(Boolean).join('\n')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${nowStamp}`)
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`)
    lines.push(`DTEND;VALUE=DATE:${dtEnd}`)
    lines.push(`SUMMARY:${escapeIcsText(summary)}`)
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`)
    lines.push(`LOCATION:${escapeIcsText(ev.location || parishName)}`)
    lines.push('CATEGORIES:Sự Kiện Xứ Đoàn,TNTT')
    lines.push('STATUS:CONFIRMED')
    lines.push('TRANSP:TRANSPARENT')
    lines.push('END:VEVENT')
  })

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

/**
 * Triggers direct browser download of the generated .ics file
 */
export function downloadIcsFile(icsContent: string, filename: string = 'lich-phung-vu-tntt.ics'): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Build direct 1-tap Google Calendar add URL for an event
 */
export function buildGoogleCalendarUrl(event: {
  title: string
  date: string
  description?: string
  location?: string
}): string {
  const dtStart = formatIcsDate(event.date)
  const dtEnd = getNextDayIcsDate(event.date)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${dtStart}/${dtEnd}`,
    details: event.description || '',
    location: event.location || 'Giáo Xứ Gia Tôn',
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
