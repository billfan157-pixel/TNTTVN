import type { OperationEvent, OperationTask } from '../../lib/api/operations'

/** Shared pure view helpers for the Operations workspace (page + extracted forms). */
export function toIso(value: string) {
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
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const zone = eventTimezone && eventTimezone !== browserZone ? eventTimezone : null
  const text = date.toLocaleString('vi-VN', zone ? { timeZone: zone } : undefined)
  if (!zone) return text
  const short = new Intl.DateTimeFormat('vi-VN', { timeZone: zone, timeZoneName: 'short' }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value
  return `${text} (${short ?? zone})`
}

/** Select options for OperationEvent.eventType, shared by create/edit forms (A4' audit 2026-09-12). */
export const EVENT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'FEAST_DAY', label: 'Lễ / Bổn mạng' },
  { value: 'CAMP', label: 'Trại / Sa mạc' },
  { value: 'TRAINING', label: 'Huấn luyện' },
  { value: 'SACRAMENT', label: 'Bí tích' },
  { value: 'RETREAT', label: 'Tĩnh tâm' },
  { value: 'MEETING', label: 'Họp' },
  { value: 'OTHER', label: 'Khác' },
]

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
