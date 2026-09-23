export interface AuditLog {
  id: string
  userId: string
  userName: string | null
  action: string
  entityType: string
  entityId: string | null
  oldValue: string | null
  newValue: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuditMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export type AuditSeverity = 'all' | 'critical' | 'warning' | 'info' | 'auth'

export type AuditDomain = 'all' | 'grade' | 'attendance' | 'student' | 'user' | 'system' | 'operations' | 'exam' | 'finance'

export interface PolicyHistoryEntry {
  id: string
  userId: string
  userName: string | null
  action: string
  entityType: string
  entityId: string | null
  oldValue: string | null
  newValue: string | null
  createdAt: string
  studentId?: string | null
  studentName?: string | null
  policyMetadata?: {
    type: 'POLICY_UPDATE' | 'GRADE_OVERRIDE' | 'PROMOTION_DECISION' | 'SEMESTER_LOCK'
    previousVersion?: string
    currentVersion?: string
    changedFields?: string[]
    summary?: { gpaBefore?: number | null; gpaAfter?: number | null; labelBefore?: string; labelAfter?: string; note?: string }
    policyVersionId?: string
    scoreField?: string
    manualValue?: number
    academicYear?: string | null
    semester?: number | null
    gpa?: number
    decision?: string
    locked?: boolean
  }
}

export interface PolicySummary {
  policyUpdates: number
  gradeOverrides: number
  promotionDecisions: number
  semesterLocks: number
  total: number
}

export const CRUD_LABELS: Record<string, string> = {
  'CREATE|grade': 'Thêm điểm',
  'UPDATE|grade': 'Cập nhật điểm',
  'CREATE|attendance': 'Thêm điểm danh',
  'UPDATE|attendance': 'Cập nhật điểm danh',
  'CREATE|student': 'Thêm thiếu nhi',
  'UPDATE|student': 'Sửa thiếu nhi',
  'DELETE|student': 'Xóa thiếu nhi',
  'CREATE|notice': 'Tạo thông báo',
  'UPDATE|notice': 'Sửa thông báo',
  'DELETE|notice': 'Xóa thông báo',
  'CREATE|class': 'Tạo lớp',
  'UPDATE|class': 'Sửa lớp',
  'DELETE|class': 'Xóa lớp',
  'UPDATE|settings': 'Cập nhật cấu hình',
  'UPDATE|parent': 'Cập nhật phụ huynh',
  'LOGIN|auth': 'Đăng nhập',
  'LOGIN_FAILED|auth': 'Đăng nhập thất bại',
}

export const SPECIAL_ACTIONS: Record<string, string> = {
  CREATE_USER: 'Tạo tài khoản',
  UPDATE_USER_STATUS: 'Cập nhật trạng thái',
  UPDATE_USER_ASSIGNMENTS: 'Cập nhật phân công',
  RESET_PASSWORD: 'Reset mật khẩu',
  PASSWORD_RESET_REQUESTED: 'Yêu cầu cấp lại mật khẩu',
  PASSWORD_RESET_REQUEST_FAILED: 'Xử lý yêu cầu mật khẩu thất bại',
  PASSWORD_RESET_REQUEST_DISMISSED: 'Bỏ qua yêu cầu mật khẩu',
  FORCE_LOGOUT: 'Buộc đăng xuất',
  CHANGE_PASSWORD: 'Đổi mật khẩu',
  ADMIN_CHANGE_PASSWORD: 'Admin đổi mật khẩu',
  REVEAL_PASSWORD: 'Xem mật khẩu tạm',
  LOGIN: 'Đăng nhập thành công',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  RESTORE_BACKUP: 'Khôi phục dữ liệu',
  RESTORE_BACKUP_FAILED: 'Khôi phục thất bại',
  SYSTEM_PURGE: 'Xóa toàn bộ dữ liệu',
  ASSIGN_CATECHIST: 'Phân công GLV',
  REMOVE_CATECHIST: 'Gỡ phân công GLV',
  DELETE_CLASS_ASSIGNMENT: 'Xóa phân công lớp',
  EXAM_FINALIZE: 'Hoàn tất phiên chấm',
  EXAM_REOPEN: 'Mở lại phiên chấm',
  EXAM_DELETE_SESSION: 'Xóa phiên chấm',
  EXAM_DELETE_RESULT: 'Xóa kết quả chấm',
  EXAM_SCORE_ENTERED: 'Nhập điểm bài thi',
  CANCEL_SESSION: 'Hủy phiên thi',
  FINALIZE_SESSION: 'Chốt kết quả thi',
  OVERRIDE_GRADE: 'Ghi đè điểm',
  RESTORE_GRADE: 'Khôi phục điểm',
  GRADE_UNDO: 'Hoàn tác nhập điểm',
  IMPORT_STARTED: 'Bắt đầu import',
  IMPORT_SUCCESS: 'Import thành công',
  IMPORT_FAILED: 'Import thất bại',
  IMPORT_UPDATE: 'Cập nhật qua import',
  IMPORT_CREATE: 'Thêm mới qua import',
  IMPORT_AUTO_CREATE_CLASS: 'Tạo lớp tự động khi import',
  IMPORT_STUDENTS: 'Nhập danh sách thiếu nhi',
  UNDO_IMPORT: 'Hoàn tác đợt import',
  LOCK_SEMESTER: 'Khóa sổ điểm',
  UNLOCK_SEMESTER: 'Mở khóa sổ điểm',
  EXECUTE_PROMOTION: 'Xét lên lớp',
  ROLLBACK_PROMOTION: 'Hoàn tác lên lớp',
  START_SEMESTER_2: 'Khởi động Học kỳ 2',
  FINALIZE_YEAR: 'Chốt năm học',
  PROMOTE_YEAR: 'Xét lên lớp năm học',
  COPY_YEAR: 'Tạo năm học mới',
  UPDATE_TELEGRAM_NOTIFICATIONS: 'Cập nhật thông báo Telegram',
  REVOKE_TELEGRAM_LINK: 'Hủy liên kết Telegram',
  SYNC_PARENTS: 'Đồng bộ tài khoản phụ huynh',
  UPDATE_PROFILE: 'Cập nhật hồ sơ cá nhân',
  NOTIFICATION_SEND: 'Gửi thông báo toàn xứ',
  VERIFICATION_SIGN: 'Cấp chữ ký phiếu điểm',
}

export const FALLBACK_ACTION_LABELS: Record<string, string> = {
  CREATE: 'Thêm mới',
  UPDATE: 'Cập nhật',
  DELETE: 'Xóa',
}

export function getActionLabel(action: string, entityType?: string | null): string {
  if (entityType) {
    const crud = CRUD_LABELS[`${action}|${entityType}`]
    if (crud) return crud
  }
  return SPECIAL_ACTIONS[action] || FALLBACK_ACTION_LABELS[action] || action
}

export function getActionSeverity(action: string): 'critical' | 'warning' | 'auth' | 'info' {
  if (
    action.includes('DELETE') ||
    action.includes('PURGE') ||
    action === 'RESTORE_BACKUP' ||
    action === 'RESTORE_BACKUP_FAILED' ||
    action === 'UNDO_IMPORT' ||
    action === 'FORCE_LOGOUT'
  ) {
    return 'critical'
  }
  if (
    action === 'LOGIN_FAILED' ||
    action === 'PASSWORD_RESET_REQUEST_FAILED' ||
    action === 'OVERRIDE_GRADE' ||
    action === 'RESTORE_GRADE' ||
    action === 'LOCK_SEMESTER' ||
    action === 'UNLOCK_SEMESTER' ||
    action === 'ROLLBACK_PROMOTION' ||
    action === 'REVOKE_TELEGRAM_LINK' ||
    action === 'IMPORT_FAILED'
  ) {
    return 'warning'
  }
  if (
    action.includes('LOGIN') ||
    action.includes('PASSWORD') ||
    action === 'CHANGE_PASSWORD' ||
    action === 'ADMIN_CHANGE_PASSWORD' ||
    action === 'REVEAL_PASSWORD'
  ) {
    return 'auth'
  }
  return 'info'
}

export const CRUD_COLORS: Record<string, string> = {
  'CREATE|grade': 'bg-violet-500/10 text-violet-600',
  'UPDATE|grade': 'bg-violet-500/10 text-violet-600',
  'CREATE|attendance': 'bg-teal-500/10 text-teal-600',
  'UPDATE|attendance': 'bg-teal-500/10 text-teal-600',
  'CREATE|student': 'bg-emerald-500/10 text-emerald-600',
  'UPDATE|student': 'bg-sky-500/10 text-sky-600',
  'DELETE|student': 'bg-rose-500/10 text-rose-600',
  'CREATE|notice': 'bg-emerald-500/10 text-emerald-600',
  'UPDATE|notice': 'bg-sky-500/10 text-sky-600',
  'DELETE|notice': 'bg-rose-500/10 text-rose-600',
  'CREATE|class': 'bg-emerald-500/10 text-emerald-600',
  'UPDATE|class': 'bg-sky-500/10 text-sky-600',
  'DELETE|class': 'bg-rose-500/10 text-rose-600',
  'UPDATE|settings': 'bg-amber-500/10 text-amber-600',
  'UPDATE|parent': 'bg-sky-500/10 text-sky-600',
  'LOGIN|auth': 'bg-emerald-500/10 text-emerald-600',
  'LOGIN_FAILED|auth': 'bg-rose-500/10 text-rose-600',
}

export const SPECIAL_ACTION_COLORS: Record<string, string> = {
  CREATE_USER: 'bg-emerald-500/10 text-emerald-600',
  UPDATE_USER_STATUS: 'bg-amber-500/10 text-amber-600',
  UPDATE_USER_ASSIGNMENTS: 'bg-sky-500/10 text-sky-600',
  RESET_PASSWORD: 'bg-orange-500/10 text-orange-600',
  PASSWORD_RESET_REQUESTED: 'bg-amber-500/10 text-amber-600',
  PASSWORD_RESET_REQUEST_FAILED: 'bg-rose-500/10 text-rose-600',
  PASSWORD_RESET_REQUEST_DISMISSED: 'bg-slate-500/10 text-slate-600',
  FORCE_LOGOUT: 'bg-rose-500/10 text-rose-600',
  CHANGE_PASSWORD: 'bg-sky-500/10 text-sky-600',
  ADMIN_CHANGE_PASSWORD: 'bg-orange-500/10 text-orange-600',
  REVEAL_PASSWORD: 'bg-orange-500/10 text-orange-600',
  LOGIN: 'bg-emerald-500/10 text-emerald-600',
  LOGIN_FAILED: 'bg-rose-500/10 text-rose-600',
  RESTORE_BACKUP: 'bg-emerald-500/10 text-emerald-600',
  RESTORE_BACKUP_FAILED: 'bg-rose-500/10 text-rose-600',
  SYSTEM_PURGE: 'bg-rose-500/10 text-rose-600',
  ASSIGN_CATECHIST: 'bg-emerald-500/10 text-emerald-600',
  REMOVE_CATECHIST: 'bg-rose-500/10 text-rose-600',
  DELETE_CLASS_ASSIGNMENT: 'bg-rose-500/10 text-rose-600',
  EXAM_FINALIZE: 'bg-emerald-500/10 text-emerald-600',
  EXAM_REOPEN: 'bg-sky-500/10 text-sky-600',
  EXAM_DELETE_SESSION: 'bg-rose-500/10 text-rose-600',
  EXAM_DELETE_RESULT: 'bg-rose-500/10 text-rose-600',
  EXAM_SCORE_ENTERED: 'bg-teal-500/10 text-teal-600',
  CANCEL_SESSION: 'bg-rose-500/10 text-rose-600',
  FINALIZE_SESSION: 'bg-emerald-500/10 text-emerald-600',
  OVERRIDE_GRADE: 'bg-violet-500/10 text-violet-600',
  RESTORE_GRADE: 'bg-amber-500/10 text-amber-600',
  GRADE_UNDO: 'bg-orange-500/10 text-orange-600',
  IMPORT_STARTED: 'bg-sky-500/10 text-sky-600',
  IMPORT_SUCCESS: 'bg-emerald-500/10 text-emerald-600',
  IMPORT_FAILED: 'bg-rose-500/10 text-rose-600',
  IMPORT_UPDATE: 'bg-sky-500/10 text-sky-600',
  IMPORT_CREATE: 'bg-emerald-500/10 text-emerald-600',
  IMPORT_AUTO_CREATE_CLASS: 'bg-sky-500/10 text-sky-600',
  IMPORT_STUDENTS: 'bg-emerald-500/10 text-emerald-600',
  UNDO_IMPORT: 'bg-orange-500/10 text-orange-600',
  LOCK_SEMESTER: 'bg-rose-500/10 text-rose-600',
  UNLOCK_SEMESTER: 'bg-emerald-500/10 text-emerald-600',
  EXECUTE_PROMOTION: 'bg-emerald-500/10 text-emerald-600',
  ROLLBACK_PROMOTION: 'bg-orange-500/10 text-orange-600',
  START_SEMESTER_2: 'bg-sky-500/10 text-sky-600',
  FINALIZE_YEAR: 'bg-emerald-500/10 text-emerald-600',
  PROMOTE_YEAR: 'bg-emerald-500/10 text-emerald-600',
  COPY_YEAR: 'bg-sky-500/10 text-sky-600',
  UPDATE_TELEGRAM_NOTIFICATIONS: 'bg-sky-500/10 text-sky-600',
  REVOKE_TELEGRAM_LINK: 'bg-rose-500/10 text-rose-600',
  SYNC_PARENTS: 'bg-teal-500/10 text-teal-600',
  UPDATE_PROFILE: 'bg-sky-500/10 text-sky-600',
  NOTIFICATION_SEND: 'bg-orange-500/10 text-orange-600',
  VERIFICATION_SIGN: 'bg-violet-500/10 text-violet-600',
}

export function getActionColor(action: string, entityType?: string | null): string {
  if (entityType) {
    const crud = CRUD_COLORS[`${action}|${entityType}`]
    if (crud) return crud
  }
  const special = SPECIAL_ACTION_COLORS[action]
  if (special) return special
  if (action === 'DELETE') return 'bg-rose-500/10 text-rose-600'
  if (action === 'UPDATE') return 'bg-sky-500/10 text-sky-600'
  if (action === 'CREATE') return 'bg-emerald-500/10 text-emerald-600'
  return 'bg-surface-hover text-text-secondary'
}

export function formatTimeAgo(isoDate: string): string {
  try {
    const diffMs = Date.now() - new Date(isoDate).getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'Vừa xong'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} phút trước`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours} giờ trước`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays} ngày trước`
    return new Date(isoDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return isoDate
  }
}

export function formatExactDateTime(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return isoDate
  }
}

const RAW_FILTER_ACTIONS: { value: string; label: string }[] = [
  { value: 'CREATE', label: 'Thêm mới (mọi đối tượng)' },
  { value: 'UPDATE', label: 'Cập nhật (mọi đối tượng)' },
  { value: 'DELETE', label: 'Xóa' },
  { value: 'UPDATE|grade', label: 'Cập nhật điểm' },
  { value: 'UPDATE|attendance', label: 'Cập nhật điểm danh' },
  ...Object.entries(SPECIAL_ACTIONS).map(([key, label]) => ({ value: key, label })),
]

export const FILTER_ACTIONS: { value: string; label: string }[] = Array.from(
  new Map(RAW_FILTER_ACTIONS.map(item => [item.value, item])).values()
)

