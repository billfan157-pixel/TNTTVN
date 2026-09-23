import type { OperationEvent, OperationTask, OperationsCreationOptions } from '../../lib/api/operations'
import { EVENT_TYPE_OPTIONS } from './operationsLabels'
export * from './operationsLabels'

/** Shared pure view helpers for the Operations workspace (page + extracted forms). */
export function toIso(value: string) {
  if (value.length === 10 && value.includes('-')) {
    return new Date(`${value}T23:59:59`).toISOString()
  }
  return new Date(value).toISOString()
}

export function toDateTimeInput(value: string) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export const isTerminalTask = (status: string) => status === 'DONE' || status === 'CANCELLED'

export const isClosedEvent = (status: string) => status === 'COMPLETED' || status === 'CANCELLED'

/**
 * W2.11: render an instant in the event's own recorded timezone - the zone the
 * planning actually happened in - instead of the reader's browser zone. When
 * the record's zone differs from the browser's, a short zone tag follows the
 * time so nobody misreads "14:00" as their local 14:00.
 */
export function formatEventInstant(iso: string, eventTimezone?: string | null): string {
  const date = new Date(iso)
  const zone = resolvedEventZone(eventTimezone)
  const text = date.toLocaleString('vi-VN', zone ? { timeZone: zone } : undefined)
  if (!zone) return text
  return `${text} (${shortZoneTag(date, zone)})`
}

/** Zone the record was planned in, or `null` when it matches the reader's browser zone. */
function resolvedEventZone(eventTimezone?: string | null) {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  return eventTimezone && eventTimezone !== browserZone ? eventTimezone : null
}

function shortZoneTag(date: Date, zone: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: zone, timeZoneName: 'short' })
    .formatToParts(date).find(part => part.type === 'timeZoneName')?.value ?? zone
}

/**
 * U-19b (2026-09-21): the list row must show *when* the event happens, not a raw
 * browser-local timestamp. Single-day events read "01/10/2026 · 08:00 – 17:00";
 * multi-day events keep both dates so a camp cannot be mistaken for a one-hour
 * meeting. Rendered in the event's recorded zone (same rule as the detail) so a
 * reader abroad never misreads the planning time; a foreign zone gets a tag.
 */
export function formatEventSchedule(startsAt: string, endsAt: string, eventTimezone?: string | null): string {
  const zone = resolvedEventZone(eventTimezone)
  const options: Intl.DateTimeFormatOptions = zone ? { timeZone: zone } : {}
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const dateFormat = new Intl.DateTimeFormat('vi-VN', { ...options, day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeFormat = new Intl.DateTimeFormat('vi-VN', { ...options, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const startDate = dateFormat.format(start)
  const endDate = dateFormat.format(end)
  const text = startDate === endDate
    ? `${startDate} · ${timeFormat.format(start)} – ${timeFormat.format(end)}`
    : `${startDate} ${timeFormat.format(start)} → ${endDate} ${timeFormat.format(end)}`
  return zone ? `${text} (${shortZoneTag(start, zone)})` : text
}

/**
 * Reader-relative urgency hint shown next to the schedule: ongoing → ended →
 * whole days until the start. Computed on the reader's civil days on purpose —
 * it is a hint, never a recorded fact, so it cannot contradict the scheduled
 * range displayed beside it.
 */
export function eventCountdownLabel(startsAt: string, endsAt: string, now: Date = new Date()): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (end.getTime() < now.getTime()) return 'Đã kết thúc'
  if (start.getTime() <= now.getTime()) return 'Đang diễn ra'
  const civilDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((civilDay(start) - civilDay(now)) / 86_400_000)
  if (days <= 0) return 'Hôm nay'
  if (days === 1) return 'Ngày mai'
  return `Còn ${days} ngày`
}

/**
 * U-19b: "sự kiện sắp diễn ra xếp trước". Events that have not ended yet lead the
 * list, ordered by start ascending (nearest first, so an ongoing camp or the next
 * meeting is always at the top); events that already ended follow, most recent
 * first. Returns a new array; invalid dates keep their input position instead of
 * being reshuffled by NaN comparisons.
 */
export function sortEventsByUpcoming<T extends { startsAt: string; endsAt?: string | null }>(events: T[], now: Date = new Date()): T[] {
  const nowMs = now.getTime()
  return events
    .map((event, index) => ({
      event,
      index,
      rank: new Date(event.endsAt ?? event.startsAt).getTime() >= nowMs ? 0 : 1,
      start: new Date(event.startsAt).getTime(),
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      const scheduleDiff = a.rank === 0 ? a.start - b.start : b.start - a.start
      if (Number.isFinite(scheduleDiff) && scheduleDiff !== 0) return scheduleDiff
      return a.index - b.index
    })
    .map(entry => entry.event)
}

/**
 * U-21 (2026-09-21): tầng Mảng thuộc về Ban/Ngành sở hữu Mảng. `creation-options`
 * là projection server-authoritative cho biết caller là Trưởng/Phó của đơn vị nào
 * (`myRole != null`) — đúng bằng tập đơn vị mà caller có quyền tầng Mảng. UI dùng
 * tập này để chỉ mời những hành động server sẽ chấp nhận; command path vẫn tự kiểm
 * capability trên resource thật nên đây không phải biên authorization.
 */
export function fieldLayerUnitIds(creationOptions: OperationsCreationOptions | null | undefined): Set<string> {
  return new Set((creationOptions?.units ?? []).filter(unit => Boolean(unit.myRole)).map(unit => unit.id))
}

/**
 * Quyền tầng Mảng trên một Mảng cụ thể: caller là Trưởng/Phó của đúng đơn vị sở hữu
 * Mảng, hoặc là người vận hành có quyền bao trùm (admin override / blanket) — nhận
 * biết qua `blanket` khi caller không giữ vai trò đơn vị nào nhưng vẫn có task.create.
 */
export function canUseFieldTasks(input: { unitId: string | null | undefined; fieldUnitIds: Set<string>; blanket: boolean }): boolean {
  if (input.blanket) return true
  return Boolean(input.unitId && input.fieldUnitIds.has(input.unitId))
}


/** VI label for an event type; unknown codes read as the "Khác" bucket instead of a raw code. */
export function eventTypeLabel(value: string | null | undefined) {
  const fallback = EVENT_TYPE_OPTIONS.find(option => option.value === 'OTHER')!.label
  return EVENT_TYPE_OPTIONS.find(option => option.value === value)?.label ?? fallback
}

export interface EventTypeWindow<T> {
  key: string
  label: string
  events: T[]
}

/**
 * U-19 (2026-09-21): the "Sự Kiện & Công Việc Đang Diễn Ra" pane used to be one
 * flat list, so the event type was invisible unless the reader opened the detail
 * modal. Group the loaded rows into one window per event type; unknown/legacy
 * codes fall into the trailing "Khác" window so no event is ever hidden.
 *
 * `orderWindowsBySoonest` (U-19b) makes the window order follow the input order
 * of the schedule-sorted rows — pass it with `sortEventsByUpcoming` so the pane
 * leads with the type whose next event happens first, while the default stays
 * the canonical option order for callers that need a stable type rail.
 */
export function groupEventsByType<T extends { eventType: string }>(
  events: T[],
  options: { orderWindowsBySoonest?: boolean } = {},
): Array<EventTypeWindow<T>> {
  const windows: Array<EventTypeWindow<T>> = EVENT_TYPE_OPTIONS.map(option => ({ key: option.value, label: option.label, events: [] }))
  const fallbackWindow = windows[windows.length - 1]
  const firstIndexByWindow = new Map<string, number>()
  events.forEach((event, index) => {
    const window = windows.find(candidate => candidate.key === event.eventType) ?? fallbackWindow
    if (window.events.length === 0) firstIndexByWindow.set(window.key, index)
    window.events.push(event)
  })
  const visibleWindows = windows.filter(window => window.events.length > 0)
  if (!options.orderWindowsBySoonest) return visibleWindows
  return visibleWindows.sort((a, b) => (firstIndexByWindow.get(a.key) ?? 0) - (firstIndexByWindow.get(b.key) ?? 0))
}

/** A schedule is invalid when only one bound is set or the end is not after the start (A4' audit 2026-09-12). */
export function isTaskScheduleInvalid(scheduledStartAt: string, scheduledEndAt: string) {
  return Boolean(
    (scheduledStartAt && !scheduledEndAt)
    || (!scheduledStartAt && scheduledEndAt)
    || (scheduledStartAt && scheduledEndAt && scheduledEndAt <= scheduledStartAt),
  )
}

export const canCreateEventTask = (status: OperationEvent['status']) => ['DRAFT', 'PLANNING', 'PREPARING', 'READY'].includes(status)

export const taskPhaseLabel: Record<OperationTask['phase'], string> = {
  PREPARATION: 'Trước sự kiện', EXECUTION: 'Trong sự kiện', FOLLOW_UP: 'Sau sự kiện',
}

// W3.2: shared status vocabulary + lifecycle maps, moved out of OperationsPage
// so the extracted EventList / MyTaskBoard sections (and the page) import one
// source of truth instead of duplicating the tables.
export const statusLabel: Record<string, string> = {
  DRAFT: 'Bản nháp', PLANNING: 'Kế hoạch', PREPARING: 'Chuẩn bị', READY: 'Sẵn sàng', LIVE: 'Đang diễn ra', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
  BACKLOG: 'Chờ xếp việc', TODO: 'Chưa làm', IN_PROGRESS: 'Đang làm', BLOCKED: 'Bị chặn', DONE: 'Hoàn tất',
}

export const statusTone = (status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' => {
  if (status === 'DONE' || status === 'COMPLETED' || status === 'READY') return 'success'
  if (status === 'BLOCKED' || status === 'CANCELLED') return 'danger'
  if (status === 'IN_PROGRESS' || status === 'LIVE') return 'primary'
  if (status === 'PLANNING' || status === 'PREPARING' || status === 'TODO') return 'warning'
  return 'neutral'
}

export const reminderKindLabel = { TASK_DUE: 'Nhắc hạn công việc', EVENT_START: 'Nhắc giờ bắt đầu sự kiện', OVERDUE: 'Công việc quá hạn', MANAGER_PREP: 'Sự kiện đủ người nhận việc' } as const
export const reminderStatusLabel = { PENDING: 'Đang chờ', ENQUEUED: 'Đang gửi', SENT: 'Đã gửi', FAILED: 'Không gửi được', CANCELLED: 'Đã hủy' } as const

export const nextEventStatus: Partial<Record<OperationEvent['status'], OperationEvent['status']>> = {
  DRAFT: 'PLANNING', PLANNING: 'PREPARING', PREPARING: 'READY', READY: 'LIVE', LIVE: 'COMPLETED',
}
export const previousEventStatus: Partial<Record<OperationEvent['status'], OperationEvent['status']>> = {
  PLANNING: 'DRAFT', PREPARING: 'PLANNING', READY: 'PREPARING', LIVE: 'READY',
}
export const transitionLabel: Partial<Record<OperationEvent['status'], string>> = {
  PLANNING: 'Bắt đầu lập kế hoạch', PREPARING: 'Chuyển sang chuẩn bị', READY: 'Đánh dấu sẵn sàng', LIVE: 'Bắt đầu sự kiện', COMPLETED: 'Hoàn tất sự kiện',
}


/** Honest offline/cache copy for Operations (ADR-110 lean cache). */
export function operationsOfflineBannerText(input: {
  source: 'server' | 'cache' | 'none'
  cacheSavedAt: string | null
}): string {
  if (input.source === 'cache') {
    const when = input.cacheSavedAt
      ? ` (${new Date(input.cacheSavedAt).toLocaleString('vi-VN')})`
      : ''
    return (
      `Đang xem bản sao máy chủ gần nhất${when}. ` +
      'Bản offline chỉ gồm danh sách sự kiện và việc đã lưu — không có hộp nhắc, lời mời nhận việc, hay quyền tạo/sửa. ' +
      'Hãy làm mới khi có mạng trước khi thao tác.'
    )
  }
  return (
    'Operations đang ngoại tuyến. Cần kết nối máy chủ để tạo hoặc cập nhật; ' +
    'ứng dụng không báo thành công giả. Nhắc việc và phân quyền chỉ tải được khi online.'
  )
}
