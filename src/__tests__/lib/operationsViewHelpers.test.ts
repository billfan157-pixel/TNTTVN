import { describe, expect, it } from 'vitest'
import { canUseFieldTasks, eventCountdownLabel, eventTypeLabel, fieldLayerUnitIds, formatEventInstant, formatEventSchedule, groupEventsByType, sortEventsByUpcoming } from '../../components/operations/operationsViewHelpers'

describe('formatEventInstant (W2.11)', () => {
  it('renders in the recorded timezone and tags it when it differs from the browser', () => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const foreign = browserZone === 'Pacific/Auckland' ? 'Pacific/Fiji' : 'Pacific/Auckland'
    const text = formatEventInstant('2026-10-01T01:00:00Z', foreign)
    expect(text).not.toBe(new Date('2026-10-01T01:00:00Z').toLocaleString('vi-VN'))
    // The tag keeps the reading unambiguous on any device.
    expect(text).toMatch(/\(/)
  })

  it('falls back to plain local rendering when zones match or are absent', () => {
    const iso = '2026-10-01T01:00:00Z'
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(formatEventInstant(iso, browserZone)).toBe(new Date(iso).toLocaleString('vi-VN'))
    expect(formatEventInstant(iso, null)).toBe(new Date(iso).toLocaleString('vi-VN'))
    expect(formatEventInstant(iso, undefined)).toBe(new Date(iso).toLocaleString('vi-VN'))
  })
})

describe('eventTypeLabel / groupEventsByType (U-19)', () => {
  it('labels known codes and buckets unknown/legacy codes as "Khác"', () => {
    expect(eventTypeLabel('CAMP')).toBe('Trại / Sa mạc')
    expect(eventTypeLabel('FEAST_DAY')).toBe('Lễ / Bổn mạng')
    // Legacy/unknown codes must never surface as a raw code to the reader.
    expect(eventTypeLabel('FEAST')).toBe('Khác')
    expect(eventTypeLabel(null)).toBe('Khác')
    expect(eventTypeLabel(undefined)).toBe('Khác')
  })

  it('splits events into one window per type in canonical order', () => {
    const windows = groupEventsByType([
      { id: 'e1', eventType: 'MEETING' },
      { id: 'e2', eventType: 'CAMP' },
      { id: 'e3', eventType: 'FEAST_DAY' },
      { id: 'e4', eventType: 'LEGACY_PILGRIMAGE' },
    ])
    expect(windows.map(window => window.key)).toEqual(['FEAST_DAY', 'CAMP', 'MEETING', 'OTHER'])
    expect(windows.map(window => window.label)).toEqual(['Lễ / Bổn mạng', 'Trại / Sa mạc', 'Họp', 'Khác'])
    expect(windows[0].events).toEqual([{ id: 'e3', eventType: 'FEAST_DAY' }])
    // Unknown code lands in the trailing bucket instead of disappearing.
    expect(windows[3].events).toEqual([{ id: 'e4', eventType: 'LEGACY_PILGRIMAGE' }])
  })

  it('drops empty windows and preserves row order inside a window', () => {
    const windows = groupEventsByType([{ id: 'a', eventType: 'OTHER' }, { id: 'b', eventType: 'OTHER' }])
    expect(windows).toHaveLength(1)
    expect(windows[0].events.map(event => event.id)).toEqual(['a', 'b'])
    expect(groupEventsByType([])).toEqual([])
  })
})

describe('schedule ordering + row time display (U-19b)', () => {
  const now = new Date('2026-09-21T09:00:00Z')

  it('puts ongoing/upcoming first by nearest start and ended events last', () => {
    const endedYesterday = { id: 'ended', startsAt: '2026-09-20T08:00:00Z', endsAt: '2026-09-20T10:00:00Z' }
    const endedLongAgo = { id: 'ended-long', startsAt: '2026-08-01T08:00:00Z', endsAt: '2026-08-01T10:00:00Z' }
    const ongoing = { id: 'ongoing', startsAt: '2026-09-20T09:00:00Z', endsAt: '2026-09-22T18:00:00Z' }
    const soon = { id: 'soon', startsAt: '2026-09-22T08:00:00Z', endsAt: '2026-09-22T10:00:00Z' }
    const later = { id: 'later', startsAt: '2026-11-01T08:00:00Z', endsAt: '2026-11-01T10:00:00Z' }
    const input = [endedLongAgo, later, endedYesterday, soon, ongoing]

    expect(sortEventsByUpcoming(input, now).map(event => event.id)).toEqual(['ongoing', 'soon', 'later', 'ended', 'ended-long'])
    // Pure helper: the caller's array is never reordered in place.
    expect(input.map(event => event.id)).toEqual(['ended-long', 'later', 'ended', 'soon', 'ongoing'])
  })

  it('keeps input order when a timestamp is unusable instead of reshuffling on NaN', () => {
    const unusable = { id: 'bad', startsAt: 'không-phải-ngày', endsAt: null }
    const valid = { id: 'ok', startsAt: '2026-09-22T08:00:00Z', endsAt: '2026-09-22T10:00:00Z' }
    expect(sortEventsByUpcoming([unusable, valid], now).map(event => event.id)).toEqual(['ok', 'bad'])
    expect(sortEventsByUpcoming([], now)).toEqual([])
  })

  it('orders windows by the soonest event when asked, canonical order otherwise', () => {
    const events = [
      { id: 'm1', eventType: 'MEETING' },
      { id: 'c1', eventType: 'CAMP' },
      { id: 'x1', eventType: 'LEGACY_PILGRIMAGE' },
    ]
    expect(groupEventsByType(events).map(window => window.key)).toEqual(['CAMP', 'MEETING', 'OTHER'])
    expect(groupEventsByType(events, { orderWindowsBySoonest: true }).map(window => window.key)).toEqual(['MEETING', 'CAMP', 'OTHER'])
  })

  it('renders a single-day window, a cross-day range and a foreign-zone tag', () => {
    const sameDay = formatEventSchedule('2026-10-01T08:00:00+07:00', '2026-10-01T17:00:00+07:00', 'Asia/Ho_Chi_Minh')
    expect(sameDay).toContain('01/10/2026')
    expect(sameDay).toContain('08:00 – 17:00')

    const camp = formatEventSchedule('2026-10-01T08:00:00+07:00', '2026-10-03T17:00:00+07:00', 'Asia/Ho_Chi_Minh')
    expect(camp).toContain('01/10/2026 08:00 → 03/10/2026 17:00')

    // Reader in another zone still reads the planning time, tagged for clarity.
    const foreign = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Pacific/Auckland' ? 'Pacific/Fiji' : 'Pacific/Auckland'
    expect(formatEventSchedule('2026-10-01T08:00:00Z', '2026-10-01T17:00:00Z', foreign)).toMatch(/\(.+\)$/)
  })

  it('labels the countdown for ongoing, today, tomorrow, N days and ended', () => {
    const local = new Date(2026, 8, 21, 9, 0, 0)
    const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 0, 0).toISOString()

    expect(eventCountdownLabel(at(20, 8), at(22, 18), local)).toBe('Đang diễn ra')
    expect(eventCountdownLabel(at(21, 14), at(21, 17), local)).toBe('Hôm nay')
    expect(eventCountdownLabel(at(22, 14), at(22, 17), local)).toBe('Ngày mai')
    expect(eventCountdownLabel(at(24, 14), at(24, 17), local)).toBe('Còn 3 ngày')
    expect(eventCountdownLabel(at(10, 14), at(10, 17), local)).toBe('Đã kết thúc')
  })
})

describe('U-21 tầng Mảng: fieldLayerUnitIds / canUseFieldTasks', () => {
  const options = {
    canCreateXuDoanEvent: false,
    xuDoanOrganizers: [],
    units: [
      { id: 'U1', name: 'Ban Truyền thông', unitType: 'COMMITTEE' as const, canCreateEvent: true, canCreateTask: true, organizers: [], myRole: 'COMMITTEE_LEADER' },
      { id: 'U2', name: 'Ngành Nghĩa', unitType: 'BRANCH' as const, canCreateEvent: false, canCreateTask: false, organizers: [], myRole: null },
    ],
  }

  it('chỉ lấy đơn vị mà caller giữ vai trò (myRole) làm tầng Mảng', () => {
    expect([...fieldLayerUnitIds(options)]).toEqual(['U1'])
    expect(fieldLayerUnitIds(null).size).toBe(0)
    expect(fieldLayerUnitIds(undefined).size).toBe(0)
  })

  it('quyền tầng Mảng theo đúng đơn vị sở hữu, có fallback cho người vận hành', () => {
    const fieldUnitIds = fieldLayerUnitIds(options)
    expect(canUseFieldTasks({ unitId: 'U1', fieldUnitIds, blanket: false })).toBe(true)
    expect(canUseFieldTasks({ unitId: 'U2', fieldUnitIds, blanket: false })).toBe(false)
    expect(canUseFieldTasks({ unitId: null, fieldUnitIds, blanket: false })).toBe(false)
    // Admin override / blanket: không giữ vai trò đơn vị nào nhưng có quyền bao trùm.
    expect(canUseFieldTasks({ unitId: 'U2', fieldUnitIds, blanket: true })).toBe(true)
  })
})
