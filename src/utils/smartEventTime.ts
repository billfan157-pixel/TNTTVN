const pad = (n: number) => n.toString().padStart(2, '0')

export function toLocalInputValue(date: Date): string {
  const yyyy = date.getFullYear()
  const MM = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`
}

export function parseDateInput(value: string): Date | null {
  if (!value || typeof value !== 'string') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatFriendlyDate(date: Date): string {
  try {
    const raw = date.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    return raw.replace('Chủ Nhật', 'Chúa Nhật')
  } catch {
    return ''
  }
}

export function formatFriendlyTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export interface DurationInfo {
  isValid: boolean
  diffMinutes: number
  durationText: string
  isSameDay: boolean
  isOvernight: boolean
  isMultiDay: boolean
  summaryText: string
  warning?: string
}

export function calculateEventDuration(startsAtStr: string, endsAtStr: string): DurationInfo {
  const start = parseDateInput(startsAtStr)
  const end = parseDateInput(endsAtStr)

  if (!start || !end) {
    return {
      isValid: false,
      diffMinutes: 0,
      durationText: '',
      isSameDay: true,
      isOvernight: false,
      isMultiDay: false,
      summaryText: '',
    }
  }

  const diffMs = end.getTime() - start.getTime()
  const diffMinutes = Math.round(diffMs / 60_000)

  if (diffMinutes <= 0) {
    return {
      isValid: false,
      diffMinutes,
      durationText: '',
      isSameDay: start.toDateString() === end.toDateString(),
      isOvernight: false,
      isMultiDay: false,
      summaryText: '',
      warning: 'Giờ kết thúc phải sau giờ bắt đầu.',
    }
  }

  const isSameDay = start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()

  const isOvernight = !isSameDay && diffMinutes <= 36 * 60
  const isMultiDay = !isSameDay && diffMinutes > 36 * 60

  let durationText = ''
  const days = Math.floor(diffMinutes / (24 * 60))
  const remainingHours = Math.floor((diffMinutes % (24 * 60)) / 60)
  const remainingMinutes = diffMinutes % 60

  if (days > 0) {
    if (days === 1 && remainingHours >= 8) {
      durationText = `2 ngày 1 đêm (${Math.round(diffMinutes / 60)} giờ)`
    } else if (days === 2 && remainingHours >= 8) {
      durationText = `3 ngày 2 đêm (${Math.round(diffMinutes / 60)} giờ)`
    } else if (remainingHours > 0) {
      durationText = `${days} ngày ${remainingHours} giờ`
    } else {
      durationText = `${days} ngày`
    }
  } else {
    const hours = Math.floor(diffMinutes / 60)
    if (hours > 0 && remainingMinutes > 0) {
      durationText = `${hours} giờ ${remainingMinutes} phút`
    } else if (hours > 0) {
      durationText = `${hours} giờ`
    } else {
      durationText = `${remainingMinutes} phút`
    }
  }

  const startTimeStr = formatFriendlyTime(start)
  const endTimeStr = formatFriendlyTime(end)
  const startDateStr = formatFriendlyDate(start)
  const endDateStr = formatFriendlyDate(end)

  let summaryText = ''
  if (isSameDay) {
    summaryText = `${startDateStr}: ${startTimeStr} → ${endTimeStr} (${durationText})`
  } else {
    summaryText = `${startDateStr} ${startTimeStr} → ${endDateStr} ${endTimeStr} (${durationText})`
  }

  let warning: string | undefined
  if (diffMinutes > 7 * 24 * 60) {
    warning = 'Sự kiện kéo dài hơn 7 ngày, vui lòng kiểm tra lại ngày kết thúc.'
  }

  return {
    isValid: true,
    diffMinutes,
    durationText,
    isSameDay,
    isOvernight,
    isMultiDay,
    summaryText,
    warning,
  }
}

export function addMinutesToDateTime(dateTimeStr: string, minutes: number): string {
  const d = parseDateInput(dateTimeStr)
  if (!d) return ''
  const newDate = new Date(d.getTime() + minutes * 60_000)
  return toLocalInputValue(newDate)
}

export function getUpcomingDay(targetDayOfWeek: number, defaultTime = '08:00'): string {
  const now = new Date()
  const currentDay = now.getDay()
  let daysToAdd = (targetDayOfWeek - currentDay + 7) % 7
  if (daysToAdd === 0) {
    daysToAdd = 7
  }
  const target = new Date(now)
  target.setDate(now.getDate() + daysToAdd)
  const [hh, mm] = defaultTime.split(':').map(Number)
  target.setHours(hh || 8, mm || 0, 0, 0)
  return toLocalInputValue(target)
}

export function getTodayPreset(defaultTime = '08:00'): string {
  const now = new Date()
  const [hh, mm] = defaultTime.split(':').map(Number)
  now.setHours(hh || 8, mm || 0, 0, 0)
  return toLocalInputValue(now)
}

export interface DurationPreset {
  label: string
  minutes: number
  tag?: string
}

export const DURATION_PRESETS: DurationPreset[] = [
  { label: '+1 giờ', minutes: 60, tag: 'Họp / Tĩnh tâm' },
  { label: '+1.5 giờ', minutes: 90, tag: 'Thánh Lễ / Giáo lý' },
  { label: '+2 giờ', minutes: 120, tag: 'Sinh hoạt Xứ đoàn' },
  { label: '+3 giờ', minutes: 180, tag: 'Tập huấn' },
  { label: '+4 giờ', minutes: 240, tag: 'Nửa ngày' },
]

export function extractDatePart(dateTimeStr: string): string {
  if (!dateTimeStr) return ''
  return dateTimeStr.slice(0, 10)
}

export function extractTimePart(dateTimeStr: string, defaultTime = '08:00'): string {
  if (!dateTimeStr || dateTimeStr.length < 16) return defaultTime
  return dateTimeStr.slice(11, 16)
}

export function combineDateTime(dateStr: string, timeStr = '08:00'): string {
  if (!dateStr) return ''
  const validDate = dateStr.slice(0, 10)
  const validTime = (timeStr || '08:00').slice(0, 5)
  return `${validDate}T${validTime}`
}

export function isSameCalendarDay(str1: string, str2: string): boolean {
  if (!str1 || !str2) return true
  return extractDatePart(str1) === extractDatePart(str2)
}

