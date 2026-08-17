import type {
  LiturgicalColor,
  LiturgicalDay,
  LiturgicalRank,
  LiturgicalReadings,
  LiturgicalSeason,
  SundayCycle,
  WeekdayCycle,
} from '../types/liturgical'
import {
  FIXED_LITURGICAL_CALENDAR,
  LITURGICAL_COLORS,
  LITURGICAL_RANKS,
  LITURGICAL_SEASONS,
} from '../constants/liturgical'

/**
 * Thuật toán Meeus/Jones/Butcher: Tính ngày Lễ Phục Sinh của năm dương lịch
 */
export function calculateEaster(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3 = Tháng 3, 4 = Tháng 4
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
}

/**
 * Tiện ích cộng trừ ngày chuẩn xác theo UTC
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function formatDateKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateInput(input: Date | string): Date {
  if (typeof input === 'string') {
    const parts = input.split('-')
    if (parts.length === 3) {
      return new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)))
    }
  }
  const d = new Date(input)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/**
 * Xác định chu kỳ Năm Phụng Vụ (Năm A, B, C cho Chúa Nhật và Năm I, II cho Ngày thường)
 */
export function getLiturgicalCycles(date: Date): { sundayCycle: SundayCycle; weekdayCycle: WeekdayCycle } {
  const year = date.getUTCFullYear()
  
  // Tính ngày khởi đầu Mùa Vọng của năm hiện tại
  const dec25 = new Date(Date.UTC(year, 11, 25))
  const dayOfWeekDec25 = dec25.getUTCDay()
  const daysToSubtract = dayOfWeekDec25 === 0 ? 28 : (dayOfWeekDec25 + 21)
  const adventStart = addDays(dec25, -daysToSubtract)

  // Nếu ngày hiện tại >= Chúa Nhật I Mùa Vọng -> Thuộc năm phụng vụ mới (năm sau)
  const liturgicalYear = date.getTime() >= adventStart.getTime() ? year + 1 : year

  // Chu kỳ Chúa Nhật: liturgicalYear % 3 (1 -> Năm A, 2 -> Năm B, 0 -> Năm C)
  const remainder = liturgicalYear % 3
  const sundayCycle: SundayCycle = remainder === 1 ? 'A' : remainder === 2 ? 'B' : 'C'

  // Chu kỳ Ngày thường: Năm chẵn là Năm II, Năm lẻ là Năm I
  const weekdayCycle: WeekdayCycle = liturgicalYear % 2 === 0 ? 'II' : 'I'

  return { sundayCycle, weekdayCycle }
}

/**
 * Tính toán các Ngày Lễ Di Động theo Lễ Phục Sinh và Giáng Sinh của 1 năm
 */
export function getMobileLiturgicalEvents(year: number): Record<string, Partial<LiturgicalDay>> {
  const easter = calculateEaster(year)
  const events: Record<string, Partial<LiturgicalDay>> = {}

  // 1. Chu kỳ Mùa Chay & Tam Nhật Vượt Qua
  const ashWednesday = addDays(easter, -46)
  events[formatDateKey(ashWednesday)] = {
    title: 'Thứ Tư Lễ Tro',
    subTitle: 'Khởi đầu Mùa Chay Thánh',
    season: 'LENT',
    color: 'PURPLE',
    rank: 'SOLEMNITY',
    isHolyDayOfObligation: false,
    readings: { firstReading: 'Ge 2, 12-18', psalm: 'Tv 50', secondReading: '2 Cr 5, 20 - 6, 2', gospel: 'Mt 6, 1-6. 16-18', gospelVerse: 'Hãy thật lòng sám hối và tin vào Tin Mừng.' },
  }

  // 5 Chúa Nhật Mùa Chay
  for (let i = 1; i <= 5; i++) {
    const lentSunday = addDays(ashWednesday, 4 + (i - 1) * 7)
    const isLaetare = i === 4 // Chúa Nhật IV Mùa Chay - Màu Hồng
    events[formatDateKey(lentSunday)] = {
      title: `Chúa Nhật ${i === 1 ? 'I' : i === 2 ? 'II' : i === 3 ? 'III' : i === 4 ? 'IV' : 'V'} Mùa Chay${isLaetare ? ' (Chúa Nhật Hân Hoan - Laetare)' : ''}`,
      season: 'LENT',
      color: isLaetare ? 'ROSE' : 'PURPLE',
      rank: 'SOLEMNITY',
      isSunday: true,
      isHolyDayOfObligation: true,
    }
  }

  // Tuần Thánh
  const palmSunday = addDays(easter, -7)
  events[formatDateKey(palmSunday)] = {
    title: 'Chúa Nhật Lễ Lá',
    subTitle: 'Kỷ niệm cuộc Thương Khó của Chúa',
    season: 'LENT',
    color: 'RED',
    rank: 'SOLEMNITY',
    isSunday: true,
    isHolyDayOfObligation: true,
  }

  const holyThursday = addDays(easter, -3)
  events[formatDateKey(holyThursday)] = {
    title: 'Thứ Năm Tuần Thánh',
    subTitle: 'Thánh Lễ Tiệc Ly - Thiết lập Bí Tích Thánh Thể & Chức Linh Mục',
    season: 'EASTER_TRIDUUM',
    color: 'WHITE',
    rank: 'SOLEMNITY',
  }

  const goodFriday = addDays(easter, -2)
  events[formatDateKey(goodFriday)] = {
    title: 'Thứ Sáu Tuần Thánh',
    subTitle: 'Tưởng niệm cuộc Thương Khó và Tử Nạn của Chúa Giêsu',
    season: 'EASTER_TRIDUUM',
    color: 'RED',
    rank: 'SOLEMNITY',
  }

  const holySaturday = addDays(easter, -1)
  events[formatDateKey(holySaturday)] = {
    title: 'Thứ Bảy Tuần Thánh',
    subTitle: 'Canh Thức Vượt Qua - Mừng Chúa Phục Sinh',
    season: 'EASTER_TRIDUUM',
    color: 'WHITE',
    rank: 'SOLEMNITY',
  }

  // 2. Chu kỳ Mùa Phục Sinh
  events[formatDateKey(easter)] = {
    title: 'Đại Lễ Phục Sinh',
    subTitle: 'Chúa Ki-tô Sống Lại Khải Hoàn - Allêluia',
    season: 'EASTER',
    color: 'WHITE',
    rank: 'SOLEMNITY',
    isSunday: true,
    isHolyDayOfObligation: true,
    readings: { gospelVerse: 'Chúa đã sống lại thật rồi, Allêluia!' },
  }

  // Chúa Nhật II Phục Sinh (Lòng Chúa Thương Xót)
  const divineMercy = addDays(easter, 7)
  events[formatDateKey(divineMercy)] = {
    title: 'Chúa Nhật II Phục Sinh (Đại Lễ Lòng Chúa Thương Xót)',
    season: 'EASTER',
    color: 'WHITE',
    rank: 'SOLEMNITY',
    isSunday: true,
    isHolyDayOfObligation: true,
  }

  for (let i = 3; i <= 6; i++) {
    const easterSun = addDays(easter, (i - 1) * 7)
    events[formatDateKey(easterSun)] = {
      title: `Chúa Nhật ${i === 3 ? 'III' : i === 4 ? 'IV (Chúa Chiên Lành)' : i === 5 ? 'V' : 'VI'} Phục Sinh`,
      season: 'EASTER',
      color: 'WHITE',
      rank: 'SOLEMNITY',
      isSunday: true,
      isHolyDayOfObligation: true,
    }
  }

  // Lễ Thăng Thiên (Tại Việt Nam cử hành vào Chúa Nhật VII Phục Sinh)
  const ascension = addDays(easter, 42)
  events[formatDateKey(ascension)] = {
    title: 'Chúa Lên Trời (Lễ Thăng Thiên)',
    season: 'EASTER',
    color: 'WHITE',
    rank: 'SOLEMNITY',
    isSunday: true,
    isHolyDayOfObligation: true,
  }

  // Lễ Chúa Thánh Thần Hiện Xuống (Pentecost)
  const pentecost = addDays(easter, 49)
  events[formatDateKey(pentecost)] = {
    title: 'Đại Lễ Chúa Thánh Thần Hiện Xuống',
    subTitle: 'Bế mạc Mùa Phục Sinh',
    season: 'EASTER',
    color: 'RED',
    rank: 'SOLEMNITY',
    isSunday: true,
    isHolyDayOfObligation: true,
  }

  // 3. Các Lễ Trọng Mùa Thường Niên sau Phục Sinh
  const trinitySunday = addDays(pentecost, 7)
  events[formatDateKey(trinitySunday)] = {
    title: 'Lễ Chúa Ba Ngôi',
    season: 'ORDINARY_TIME',
    color: 'WHITE',
    rank: 'SOLEMNITY',
    isSunday: true,
    isHolyDayOfObligation: true,
  }

  const corpusChristi = addDays(pentecost, 14)
  events[formatDateKey(corpusChristi)] = {
    title: 'Lễ Mình Máu Thánh Chúa Kitô (Quan Thầy TNTTVN)',
    subTitle: 'Bổn Mạng Phong Trào Thiếu Nhi Thánh Thể',
    season: 'ORDINARY_TIME',
    color: 'WHITE',
    rank: 'SOLEMNITY',
    isSunday: true,
    isHolyDayOfObligation: true,
  }

  const sacredHeart = addDays(pentecost, 19) // Thứ Sáu sau Lễ Mình Máu Thánh Chúa
  events[formatDateKey(sacredHeart)] = {
    title: 'Lễ Thánh Tâm Chúa Giêsu',
    season: 'ORDINARY_TIME',
    color: 'WHITE',
    rank: 'SOLEMNITY',
  }

  const immaculateHeart = addDays(pentecost, 20) // Thứ Bảy sau Lễ Thánh Tâm
  events[formatDateKey(immaculateHeart)] = {
    title: 'Trái Tim Vô Nhiễm Mẹ Maria',
    season: 'ORDINARY_TIME',
    color: 'WHITE',
    rank: 'MEMORIAL',
  }

  // 4. Mùa Vọng & Giáng Sinh
  const dec25 = new Date(Date.UTC(year, 11, 25))
  const dayOfWeekDec25 = dec25.getUTCDay()
  const daysToAdvent = dayOfWeekDec25 === 0 ? 28 : (dayOfWeekDec25 + 21)
  const advent1 = addDays(dec25, -daysToAdvent)

  for (let i = 1; i <= 4; i++) {
    const advSun = addDays(advent1, (i - 1) * 7)
    const isGaudete = i === 3 // Chúa Nhật III Mùa Vọng - Màu Hồng
    events[formatDateKey(advSun)] = {
      title: `Chúa Nhật ${i === 1 ? 'I' : i === 2 ? 'II' : i === 3 ? 'III' : 'IV'} Mùa Vọng${isGaudete ? ' (Chúa Nhật Vui - Gaudete)' : ''}`,
      season: 'ADVENT',
      color: isGaudete ? 'ROSE' : 'PURPLE',
      rank: 'SOLEMNITY',
      isSunday: true,
      isHolyDayOfObligation: true,
    }
  }

  // Chúa Kitô Vua (Chúa Nhật cuối cùng trước Chúa Nhật I Mùa Vọng)
  const christTheKing = addDays(advent1, -7)
  events[formatDateKey(christTheKing)] = {
    title: 'Lễ Chúa Kitô Vua Vũ Trụ (Chúa Nhật XXXIV Thường Niên)',
    subTitle: 'Bế mạc Năm Phụng Vụ',
    season: 'ORDINARY_TIME',
    color: 'WHITE',
    rank: 'SOLEMNITY',
    isSunday: true,
    isHolyDayOfObligation: true,
  }

  // Lễ Hiển Linh (Chúa Nhật giữa ngày 2/1 và 8/1 tại VN)
  const jan2 = new Date(Date.UTC(year, 0, 2))
  const dayOfJan2 = jan2.getUTCDay()
  const epiphanyDays = dayOfJan2 === 0 ? 0 : (7 - dayOfJan2)
  const epiphany = addDays(jan2, epiphanyDays)
  events[formatDateKey(epiphany)] = {
    title: 'Lễ Chúa Hiển Linh (Lễ Ba Vua)',
    season: 'CHRISTMAS',
    color: 'WHITE',
    rank: 'SOLEMNITY',
    isSunday: true,
    isHolyDayOfObligation: true,
  }

  // Lễ Chúa Giêsu Chịu Phép Rửa (Chúa Nhật sau Lễ Hiển Linh)
  const baptismOfLord = addDays(epiphany, 7)
  events[formatDateKey(baptismOfLord)] = {
    title: 'Lễ Chúa Giêsu Chịu Phép Rửa',
    subTitle: 'Kết thúc Mùa Giáng Sinh',
    season: 'CHRISTMAS',
    color: 'WHITE',
    rank: 'FEAST',
    isSunday: true,
    isHolyDayOfObligation: true,
  }

  return events
}

/**
 * Trả về thông tin đầy đủ của một Ngày Phụng Vụ bất kỳ
 */
export function getLiturgicalDay(inputDate: Date | string): LiturgicalDay {
  const date = parseDateInput(inputDate)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  const dayOfWeek = date.getUTCDay()
  const isSunday = dayOfWeek === 0
  const dateKey = formatDateKey(date)

  const { sundayCycle, weekdayCycle } = getLiturgicalCycles(date)
  const mobileEvents = getMobileLiturgicalEvents(year)

  // 1. Kiểm tra Lễ Di Động (Easter / Lent / Advent / Movable Solemnities)
  const mobileEvent = mobileEvents[dateKey]

  // 2. Kiểm tra Lễ Cố Định trong Lịch Phụng Vụ HĐGMVN
  const fixedEntry = FIXED_LITURGICAL_CALENDAR.find((f) => f.month === month && f.day === day)

  // 3. Quyết định Bậc Lễ và Mùa theo Bảng Thứ Bậc Ưu Tiên Phụng Vụ
  let selectedSeason: LiturgicalSeason = 'ORDINARY_TIME'
  let selectedColor: LiturgicalColor = 'GREEN'
  let selectedRank: LiturgicalRank = 'WEEKDAY'
  let selectedTitle = ''
  let selectedSubTitle: string | undefined = undefined
  let isHolyDayOfObligation = isSunday
  let readings: LiturgicalReadings | undefined = undefined

  // Xác định mùa nền tảng nếu không phải ngày lễ đặc biệt
  const easter = calculateEaster(year)
  const ashWednesday = addDays(easter, -46)
  const pentecost = addDays(easter, 49)
  
  const dec25 = new Date(Date.UTC(year, 11, 25))
  const dayOfWeekDec25 = dec25.getUTCDay()
  const daysToAdvent = dayOfWeekDec25 === 0 ? 28 : (dayOfWeekDec25 + 21)
  const advent1 = addDays(dec25, -daysToAdvent)

  const jan1 = new Date(Date.UTC(year, 0, 1))
  const jan2 = new Date(Date.UTC(year, 0, 2))
  const dayOfJan2 = jan2.getUTCDay()
  const epiphanyDays = dayOfJan2 === 0 ? 0 : (7 - dayOfJan2)
  const epiphany = addDays(jan2, epiphanyDays)
  const baptismOfLord = addDays(epiphany, 7)

  if (date.getTime() >= advent1.getTime() && date.getTime() < dec25.getTime()) {
    selectedSeason = 'ADVENT'
    selectedColor = 'PURPLE'
  } else if (date.getTime() >= dec25.getTime() || date.getTime() <= baptismOfLord.getTime()) {
    selectedSeason = 'CHRISTMAS'
    selectedColor = 'WHITE'
  } else if (date.getTime() >= ashWednesday.getTime() && date.getTime() < easter.getTime()) {
    selectedSeason = 'LENT'
    selectedColor = 'PURPLE'
  } else if (date.getTime() >= easter.getTime() && date.getTime() <= pentecost.getTime()) {
    selectedSeason = 'EASTER'
    selectedColor = 'WHITE'
  } else {
    selectedSeason = 'ORDINARY_TIME'
    selectedColor = 'GREEN'
  }

  // Trường hợp 1: Có Lễ Di Động (Lễ Trọng / Chúa Nhật mùa đặc biệt)
  if (mobileEvent) {
    selectedTitle = mobileEvent.title || ''
    selectedSubTitle = mobileEvent.subTitle
    selectedSeason = mobileEvent.season || selectedSeason
    selectedColor = mobileEvent.color || selectedColor
    selectedRank = mobileEvent.rank || (isSunday ? 'SOLEMNITY' : 'FEAST')
    isHolyDayOfObligation = mobileEvent.isHolyDayOfObligation ?? isSunday
    readings = mobileEvent.readings
  }
  // Trường hợp 2: Có Lễ Cố Định
  else if (fixedEntry) {
    // Nếu là Chúa Nhật Mùa Thường Niên và gặp Lễ Trọng -> Lễ Trọng chiếm ưu thế
    // Nếu gặp Lễ Kính/Lễ Nhớ trong tuần -> Lễ Kính/Lễ Nhớ chiếm ưu thế
    const isSolemnity = fixedEntry.rank === 'SOLEMNITY'

    if (isSolemnity || !isSunday) {
      selectedTitle = fixedEntry.title
      selectedRank = fixedEntry.rank
      selectedColor = fixedEntry.color
      isHolyDayOfObligation = fixedEntry.isHolyDayOfObligation ?? isSunday
      if (fixedEntry.gospelRef || fixedEntry.gospelVerse) {
        readings = {
          gospel: fixedEntry.gospelRef,
          gospelVerse: fixedEntry.gospelVerse,
        }
      }
    } else {
      // Chúa Nhật Mùa Thường Niên
      selectedTitle = `Chúa Nhật ${selectedSeason === 'ORDINARY_TIME' ? 'Thường Niên' : ''}`
      selectedRank = 'SOLEMNITY'
      selectedColor = LITURGICAL_SEASONS[selectedSeason].defaultColor
    }
  }
  // Trường hợp 3: Ngày thường hoặc Chúa Nhật thông thường
  else {
    const dayNames = ['Chúa Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
    selectedTitle = `${dayNames[dayOfWeek]} (${LITURGICAL_SEASONS[selectedSeason].name})`
    selectedRank = isSunday ? 'SOLEMNITY' : 'WEEKDAY'
    selectedColor = LITURGICAL_SEASONS[selectedSeason].defaultColor
  }

  const colorMeta = LITURGICAL_COLORS[selectedColor] || LITURGICAL_COLORS.GREEN
  const rankMeta = LITURGICAL_RANKS[selectedRank] || LITURGICAL_RANKS.WEEKDAY
  const seasonMeta = LITURGICAL_SEASONS[selectedSeason] || LITURGICAL_SEASONS.ORDINARY_TIME

  return {
    date: dateKey,
    title: selectedTitle,
    subTitle: selectedSubTitle,
    season: selectedSeason,
    seasonName: seasonMeta.name,
    color: selectedColor,
    colorName: colorMeta.name,
    colorHex: colorMeta.hex,
    rank: selectedRank,
    rankName: rankMeta.name,
    rankWeight: rankMeta.weight,
    isHolyDayOfObligation,
    isSunday,
    sundayCycle,
    weekdayCycle,
    readings,
  }
}

/**
 * Trả về danh sách ngày phụng vụ của một tháng đầy đủ (kèm padding các ngày đầu/cuối tháng để vẽ lịch)
 */
export function getLiturgicalMonthDays(year: number, month: number): LiturgicalDay[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const days: LiturgicalDay[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month - 1, d))
    days.push(getLiturgicalDay(date))
  }

  return days
}

/**
 * Lấy danh sách các Lễ Trọng sắp tới trong vòng N ngày
 */
export function getUpcomingSolemnities(startDate: Date = new Date(), limitCount: number = 5): LiturgicalDay[] {
  const result: LiturgicalDay[] = []
  let curr = parseDateInput(startDate)

  for (let i = 0; i < 90 && result.length < limitCount; i++) {
    const day = getLiturgicalDay(curr)
    if (day.rank === 'SOLEMNITY' || day.isHolyDayOfObligation) {
      result.push(day)
    }
    curr = addDays(curr, 1)
  }

  return result
}
