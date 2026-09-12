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
