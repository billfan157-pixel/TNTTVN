/**
 * Unified vocabulary and dictionary of labels for the Operations subsystem (Wave A / P2-VOC).
 * Consolidates labels across events, tasks, workstreams (Mảng), participants,
 * dispatches, reminders, and positions to prevent UI terminology drift.
 */

export const EVENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PLANNING: 'Lập kế hoạch',
  PREPARING: 'Đang chuẩn bị',
  READY: 'Sẵn sàng',
  LIVE: 'Đang diễn ra',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Chờ xếp lịch',
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang làm',
  BLOCKED: 'Bị chặn',
  DONE: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
}

export const TASK_PHASE_LABELS: Record<string, string> = {
  PREPARATION: 'Chuẩn bị',
  EXECUTION: 'Thực hiện',
  WRAP_UP: 'Tổng kết',
}

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  URGENT: 'Khẩn cấp',
}

export const EVENT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'FEAST_DAY', label: 'Lễ / Bổn mạng' },
  { value: 'CAMP', label: 'Trại / Sa mạc' },
  { value: 'TRAINING', label: 'Huấn luyện' },
  { value: 'SACRAMENT', label: 'Bí tích' },
  { value: 'RETREAT', label: 'Tĩnh tâm' },
  { value: 'MEETING', label: 'Họp' },
  { value: 'OTHER', label: 'Khác' },
]

export const PARTICIPANT_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Dự kiến',
  CONFIRMED: 'Đã xác nhận',
  DECLINED: 'Từ chối',
  ATTENDED: 'Đã tham dự',
  ABSENT: 'Vắng',
}

export const DISPATCH_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Lên lịch',
  PENDING: 'Đang chờ',
  ACCEPTED: 'Đã nhận',
  CANCELLED: 'Đã hủy',
}

export const ASSIGNMENT_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Phụ trách chính',
  CONTRIBUTOR: 'Người hỗ trợ',
}

export const WORKSTREAM_FIELD_LABEL = 'Mảng công việc'
