import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  Eye,
  TrendingUp,
  RefreshCw,
  Users,
  GitBranch,
  GraduationCap,
  Lock,
  FileEdit,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { PageHeader } from '../components/common/PageHeader'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
// Polish 5.1/5.2/5.3 (2026-08-22): trạng thái loading/error/empty chuẩn DS thay banner tự dựng
import { EmptyState, ErrorState, SkeletonCardGrid, SkeletonTable } from '../components/common/StateFeedback'

interface AuditLog {
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

interface AuditMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface PolicyHistoryEntry {
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

interface PolicySummary {
  policyUpdates: number
  gradeOverrides: number
  promotionDecisions: number
  semesterLocks: number
  total: number
}

const POLICY_TYPE_COLORS: Record<string, string> = {
  POLICY_UPDATE: 'bg-orange-500/10 text-orange-600',
  GRADE_OVERRIDE: 'bg-violet-500/10 text-violet-600',
  PROMOTION_DECISION: 'bg-emerald-500/10 text-emerald-600',
  SEMESTER_LOCK: 'bg-rose-500/10 text-rose-600',
}

const POLICY_TYPE_LABELS: Record<string, string> = {
  POLICY_UPDATE: 'Cập Nhật Chính Sách',
  GRADE_OVERRIDE: 'Ghi Đè Điểm',
  PROMOTION_DECISION: 'Quyết Định Xét Lên',
  SEMESTER_LOCK: 'Khóa/Mở Sổ Điểm',
}

const POLICY_SUMMARY_CARDS = [
  { key: 'policyUpdates', label: 'Cập Nhật Chính Sách', desc: 'Thay đổi trọng số / ngưỡng GPA', icon: GitBranch, color: 'text-orange-600 bg-orange-500/10' },
  { key: 'gradeOverrides', label: 'Ghi Đè Điểm', desc: 'Điều chỉnh điểm thủ công', icon: FileEdit, color: 'text-violet-600 bg-violet-500/10' },
  { key: 'promotionDecisions', label: 'Quyết Định Xét Lên', desc: 'Phê duyệt / điều chỉnh xét lên', icon: GraduationCap, color: 'text-emerald-600 bg-emerald-500/10' },
  { key: 'semesterLocks', label: 'Khóa / Mở Sổ Điểm', desc: 'Khóa/mở học kỳ', icon: Lock, color: 'text-rose-600 bg-rose-500/10' },
]

// AUDIT-FIX (2026-08-12): Server ghi audit với action GENERIC 'CREATE'/'UPDATE'/'DELETE'
// + entityType ('grade'/'attendance'/'student'/'notice'/'class'...) — xem
// gradeService.ts / attendanceService.ts / studentService.ts. Bảng cũ chỉ map
// 'UPSERT_GRADE'/'UPSERT_ATTENDANCE' (action KHÔNG tồn tại trong server) → import
// điểm hiển thị raw "CREATE" không nhãn và filter "Cập nhật điểm" trả 0 kết quả.
// Label/color/filter giờ hiểu đúng (action × entityType).
const CRUD_LABELS: Record<string, string> = {
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

const SPECIAL_ACTIONS: Record<string, string> = {
  CREATE_USER: 'Tạo tài khoản',
  UPDATE_USER_STATUS: 'Cập nhật trạng thái',
  UPDATE_USER_ASSIGNMENTS: 'Cập nhật phân công',
  RESET_PASSWORD: 'Reset mật khẩu',
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

const FALLBACK_ACTION_LABELS: Record<string, string> = {
  CREATE: 'Thêm mới',
  UPDATE: 'Cập nhật',
  DELETE: 'Xóa',
}

function getActionLabel(action: string, entityType?: string | null): string {
  if (entityType) {
    const crud = CRUD_LABELS[`${action}|${entityType}`]
    if (crud) return crud
  }
  return SPECIAL_ACTIONS[action] || FALLBACK_ACTION_LABELS[action] || action
}

const CRUD_COLORS: Record<string, string> = {
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

const SPECIAL_ACTION_COLORS: Record<string, string> = {
  CREATE_USER: 'bg-emerald-500/10 text-emerald-600',
  UPDATE_USER_STATUS: 'bg-amber-500/10 text-amber-600',
  UPDATE_USER_ASSIGNMENTS: 'bg-sky-500/10 text-sky-600',
  RESET_PASSWORD: 'bg-orange-500/10 text-orange-600',
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

function getActionColor(action: string, entityType?: string | null): string {
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

const RAW_FILTER_ACTIONS: { value: string; label: string }[] = [
  { value: 'CREATE', label: 'Thêm mới (mọi đối tượng)' },
  { value: 'UPDATE', label: 'Cập nhật (mọi đối tượng)' },
  { value: 'DELETE', label: 'Xóa' },
  { value: 'UPDATE|grade', label: 'Cập nhật điểm' },
  { value: 'UPDATE|attendance', label: 'Cập nhật điểm danh' },
  ...Object.entries(SPECIAL_ACTIONS).map(([key, label]) => ({ value: key, label })),
]

const FILTER_ACTIONS: { value: string; label: string }[] = Array.from(
  new Map(RAW_FILTER_ACTIONS.map(item => [item.value, item])).values()
)

// ADR-047 — UI "Bảng Điều Khiển Chính Sách" được gộp vào tab "Chính Sách & Tác Động"
// của trang Nhật Ký Hệ Thống (endpoint /api/audit-logs/policy-history giữ nguyên).
type ViewMode = 'all' | 'policy'

export function AuditLogPage() {
  const [mode, setMode] = useState<ViewMode>('all')

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [meta, setMeta] = useState<AuditMeta>({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterAction, setFilterAction] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [policyData, setPolicyData] = useState<PolicyHistoryEntry[]>([])
  const [policySummary, setPolicySummary] = useState<PolicySummary>({ policyUpdates: 0, gradeOverrides: 0, promotionDecisions: 0, semesterLocks: 0, total: 0 })
  const [policyLoading, setPolicyLoading] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [policyPage, setPolicyPage] = useState(1)
  const [policyTotal, setPolicyTotal] = useState(0)
  const [policyTotalPages, setPolicyTotalPages] = useState(0)
  const [policyLimit] = useState(50)
  const [selectedPolicyType, setSelectedPolicyType] = useState<string | null>(null)
  const [policyExpandedId, setPolicyExpandedId] = useState<string | null>(null)

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, any> = { page, limit: 25 }
      if (filterAction.includes('|')) {
        const [act, ent] = filterAction.split('|')
        params.action = act
        params.entityType = ent
      } else if (filterAction) {
        params.action = filterAction
      }
      if (filterEntity) params.entityType = filterEntity
      const res = await api.getAuditLogs(params)
      setLogs(res.data || [])
      const metaData = res.meta || { page: 1, limit: 25, total: 0 }
      setMeta({
        page: metaData.page,
        limit: metaData.limit,
        total: metaData.total,
        totalPages: (metaData as any).totalPages || Math.ceil((metaData.total || 0) / (metaData.limit || 25))
      })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không thể tải nhật ký hoạt động'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [filterAction, filterEntity])

  const fetchPolicyHistory = useCallback(async (pageNum: number = 1) => {
    setPolicyLoading(true)
    setPolicyError(null)
    try {
      const res = await api.getPolicyHistory({ page: pageNum, limit: policyLimit })
      setPolicyData(res.data || [])
      setPolicyPage(res.meta?.page || 1)
      setPolicyTotal(res.meta?.total || 0)
      setPolicyTotalPages(res.meta?.totalPages || 1)
      if (res.meta?.summary) setPolicySummary(res.meta.summary)
    } catch (err) {
      setPolicyError(err instanceof ApiError ? err.message : 'Không thể tải lịch sử chính sách')
    } finally {
      setPolicyLoading(false)
    }
  }, [policyLimit])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { if (mode === 'policy') fetchPolicyHistory(1) }, [mode, fetchPolicyHistory])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatDateTime = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleString('vi-VN', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    } catch { return dateString }
  }

  const renderDiff = (oldVal: string | null, newVal: string | null) => {
    const parseJson = (s: string | null) => { try { return s ? JSON.parse(s) : null } catch { return s } }
    const old = parseJson(oldVal)
    const nw = parseJson(newVal)
    return (
      <div className="grid grid-cols-2 gap-3 mt-2">
        {old && (
          <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">
            <p className="text-xs font-semibold text-rose-600 mb-1">Giá trị cũ</p>
            <pre className="text-xs text-text-muted whitespace-pre-wrap">{JSON.stringify(old, null, 2)}</pre>
          </div>
        )}
        {nw && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
            <p className="text-xs font-semibold text-emerald-600 mb-1">Giá trị mới</p>
            <pre className="text-xs text-text-muted whitespace-pre-wrap">{JSON.stringify(nw, null, 2)}</pre>
          </div>
        )}
      </div>
    )
  }

  const getPolicyTypeColor = (type?: string): string => type ? POLICY_TYPE_COLORS[type] || 'bg-surface-hover' : 'bg-surface-hover'
  const getPolicyTypeLabel = (type?: string): string => type ? POLICY_TYPE_LABELS[type] || type : 'Unknown'

  const renderPolicyMetadataContent = (entry: PolicyHistoryEntry): string => {
    const meta = entry.policyMetadata
    if (!meta) return 'Không có chi tiết'
    switch (meta.type) {
      case 'POLICY_UPDATE':
        return `Thay đổi: ${meta.changedFields?.join(', ') || 'N/A'} — ${meta.summary?.note || ''}`
      case 'GRADE_OVERRIDE':
        return `Ghi đè ${meta.scoreField || 'N/A'} = ${meta.manualValue ?? 'N/A'} (Policy: ${meta.policyVersionId?.slice(-10) || 'N/A'})`
      case 'PROMOTION_DECISION':
        return `Xét lên: GPA ${meta.gpa?.toFixed(2) || 'N/A'} → ${meta.decision || 'N/A'} (Policy: ${meta.policyVersionId?.slice(-10) || 'N/A'})`
      case 'SEMESTER_LOCK':
        return `HK ${meta.semester}: ${meta.locked ? 'Khóa' : 'Mở'} (Policy: ${meta.policyVersionId?.slice(-10) || 'N/A'})`
      default:
        return 'Không có chi tiết'
    }
  }

  const renderPolicyImpactNote = (entry: PolicyHistoryEntry): string | null => {
    const meta = entry.policyMetadata
    if (!meta || meta.type !== 'POLICY_UPDATE' || !meta.summary) return null
    const s = meta.summary
    if (s.gpaBefore !== null && s.gpaBefore !== undefined && s.gpaAfter !== null && s.gpaAfter !== undefined) {
      return `Ảnh hưởng GPA: ${s.gpaBefore.toFixed(2)} → ${s.gpaAfter.toFixed(2)} (${s.labelBefore || '—'} → ${s.labelAfter || '—'})`
    }
    return s.note || null
  }

  const renderPolicyExpanded = (entry: PolicyHistoryEntry) => {
    const meta = entry.policyMetadata
    if (!meta) return null
    return (
      <div className="mt-2 space-y-1 text-xs text-text-main">
        {meta.type === 'POLICY_UPDATE' && (
          <>
            {meta.previousVersion && <p><span className="font-semibold">Phiên bản trước:</span> {meta.previousVersion.slice(-10)}</p>}
            {meta.currentVersion && <p><span className="font-semibold">Phiên bản mới:</span> {meta.currentVersion.slice(-10)}</p>}
            {meta.changedFields && meta.changedFields.length > 0 && (
              <div>
                <p className="font-semibold">Thay đổi:</p>
                <ul className="list-disc list-inside">{meta.changedFields.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            {renderPolicyImpactNote(entry) && <p className="mt-1"><span className="font-semibold">Tác động GPA:</span> {renderPolicyImpactNote(entry)}</p>}
          </>
        )}
        {meta.type === 'GRADE_OVERRIDE' && (
          <>
            {entry.studentName && <p><span className="font-semibold">Thiếu nhi:</span> {entry.studentName}</p>}
            <p><span className="font-semibold">Trường:</span> {meta.scoreField}</p>
            <p><span className="font-semibold">Giá trị:</span> {meta.manualValue}</p>
            {meta.academicYear && <p><span className="font-semibold">Năm học:</span> {meta.academicYear}</p>}
            {meta.semester != null && <p><span className="font-semibold">Học kỳ:</span> {meta.semester}</p>}
            <p><span className="font-semibold">Policy ID:</span> {meta.policyVersionId?.slice(-10)}</p>
          </>
        )}
        {meta.type === 'PROMOTION_DECISION' && (
          <>
            {entry.studentName && <p><span className="font-semibold">Thiếu nhi:</span> {entry.studentName}</p>}
            <p><span className="font-semibold">GPA:</span> {meta.gpa?.toFixed(2)}</p>
            <p><span className="font-semibold">Quyết định:</span> {meta.decision}</p>
            <p><span className="font-semibold">Policy ID:</span> {meta.policyVersionId?.slice(-10)}</p>
          </>
        )}
        {meta.type === 'SEMESTER_LOCK' && (
          <>
            <p><span className="font-semibold">Học kỳ:</span> {meta.semester}</p>
            <p><span className="font-semibold">Trạng thái:</span> {meta.locked ? 'Khóa' : 'Mở'}</p>
            <p><span className="font-semibold">Policy ID:</span> {meta.policyVersionId?.slice(-10)}</p>
          </>
        )}
      </div>
    )
  }

  const filteredPolicyData = selectedPolicyType
    ? policyData.filter((entry) => entry.policyMetadata?.type === selectedPolicyType)
    : policyData

  return (
    <DesktopAppShell width="wide" className="flex flex-col gap-6">
      <PageHeader
        icon={<ClipboardList className="w-5 h-5" />}
        title="Nhật Ký Hệ Thống"
        description={mode === 'all' ? `${meta.total} bản ghi` : `${policyTotal} sự kiện chính sách`}
        actions={
          <div className="view-tabs">
            <button
              type="button"
              onClick={() => setMode('all')}
              className={`view-tab ${mode === 'all' ? 'is-active' : ''}`}
              aria-pressed={mode === 'all'}
            >
              Toàn Bộ Nhật Ký
            </button>
            <button
              type="button"
              onClick={() => setMode('policy')}
              className={`view-tab ${mode === 'policy' ? 'is-active' : ''}`}
              aria-pressed={mode === 'policy'}
            >
              <TrendingUp size={13} />
              Chính Sách & Tác Động
            </button>
          </div>
        }
      />

      {error && mode === 'all' && (
        <ErrorState
          title="Không thể tải nhật ký"
          message={error}
          onRetry={() => fetchLogs(meta.page > 1 ? meta.page : 1)}
        />
      )}

      {mode === 'all' && (
        <>
          <div className="flex gap-3 flex-wrap">
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="form-select text-sm font-medium"
            >
              <option value="">Tất cả hành động</option>
              {FILTER_ACTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              className="form-select text-sm font-medium"
            >
              <option value="">Tất cả đối tượng</option>
              <option value="user">Tài khoản</option>
              <option value="student">Thiếu nhi</option>
              <option value="grade">Điểm số</option>
              <option value="attendance">Điểm danh</option>
              <option value="class">Lớp học</option>
              <option value="exam_session">Kỳ thi</option>
              <option value="notice">Thông báo</option>
              <option value="settings">Cấu hình hệ thống</option>
              <option value="auth">Xác thực / Đăng nhập</option>
              <option value="parent">Phụ huynh</option>
            </select>
          </div>

          <div className="app-panel overflow-hidden">
            {loading ? (
              <div className="p-4" role="status" aria-label="Đang tải dữ liệu">
                <SkeletonTable rows={6} cols={4} />
              </div>
            ) : logs.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Chưa có nhật ký nào"
                description="Các thao tác trên hệ thống sẽ được ghi lại tại đây."
              />
            ) : (
              <div className="divide-y divide-surface-border">
                {logs.map((log) => (
                  <div key={log.id} className="px-4 py-3 hover:bg-surface-hover/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 bg-surface-hover rounded-lg flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-text-muted" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-text-main">{log.userName || log.userId}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getActionColor(log.action, log.entityType)}`}>
                              {getActionLabel(log.action, log.entityType)}
                            </span>
                            {log.entityType && (
                              <span className="text-xs text-text-muted">
                                [{log.entityType}] {log.entityId?.slice(0, 12)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Clock className="w-3 h-3 text-text-muted" />
                            <span className="text-xs text-text-muted">{formatDate(log.createdAt)}</span>
                            {log.ip && <span className="text-xs text-text-muted">• IP: {log.ip}</span>}
                          </div>
                        </div>
                      </div>
                      {(log.oldValue || log.newValue) && (
                        <button
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                          aria-label={expandedId === log.id ? 'Thu gọn chi tiết' : 'Xem chi tiết'}
                          aria-expanded={expandedId === log.id}
                          className="p-1.5 hover:bg-surface-hover rounded-lg text-text-muted"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {expandedId === log.id && renderDiff(log.oldValue, log.newValue)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {meta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">Trang {meta.page}/{meta.totalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchLogs(meta.page - 1)}
                  disabled={meta.page <= 1}
                  aria-label="Trang trước"
                  title="Trang trước"
                  className="p-2 bg-surface-card border border-surface-border rounded-lg disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => fetchLogs(meta.page + 1)}
                  disabled={meta.page >= meta.totalPages}
                  aria-label="Trang sau"
                  title="Trang sau"
                  className="p-2 bg-surface-card border border-surface-border rounded-lg disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'policy' && (
        <>
          <div className="flex items-center justify-between">
            <button
              onClick={() => fetchPolicyHistory(1)}
              disabled={policyLoading}
              className="px-3 py-2 rounded-lg bg-parish-primary/10 text-parish-primary hover:bg-parish-primary/20 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${policyLoading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {POLICY_SUMMARY_CARDS.map((card) => {
              const Icon = card.icon
              const value = policySummary[card.key as keyof PolicySummary] ?? 0
              return (
                <div key={card.key} className="entity-card p-4 flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-main leading-tight">{value}</p>
                    <p className="text-sm font-semibold text-text-main">{card.label}</p>
                    <p className="text-xs text-text-muted">{card.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedPolicyType(null)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedPolicyType === null ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-secondary hover:text-text-main'}`}
            >
              Tất Cả ({policySummary.total || policyTotal})
            </button>
            {Object.entries(POLICY_TYPE_LABELS).map(([type, label]) => {
              const count = type === 'POLICY_UPDATE' ? policySummary.policyUpdates
                : type === 'GRADE_OVERRIDE' ? policySummary.gradeOverrides
                : type === 'PROMOTION_DECISION' ? policySummary.promotionDecisions
                : policySummary.semesterLocks
              return (
                <button
                  key={type}
                  onClick={() => setSelectedPolicyType(type)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedPolicyType === type ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-secondary hover:text-text-main'}`}
                >
                  {label} ({count})
                </button>
              )
            })}
          </div>

          {policyError && (
            <ErrorState
              title="Không thể tải lịch sử chính sách"
              message={policyError}
              onRetry={() => fetchPolicyHistory(1)}
            />
          )}
          {policyLoading && <SkeletonCardGrid count={4} />}
          {!policyLoading && filteredPolicyData.length === 0 && (
            <EmptyState
              icon={TrendingUp}
              title="Không có thay đổi chính sách"
              description="Các lần cập nhật trọng số điểm, ghi đè điểm, xét lên lớp và khóa sổ sẽ hiển thị tại đây."
            />
          )}

          {!policyLoading && filteredPolicyData.length > 0 && (
            <div className="space-y-3">
              {filteredPolicyData.map((entry) => {
                const impactNote = renderPolicyImpactNote(entry)
                const isExpanded = policyExpandedId === entry.id
                return (
                  <div key={entry.id} className="border border-surface-border rounded-lg overflow-hidden transition-all hover:shadow-md">
                    <button
                      onClick={() => setPolicyExpandedId(isExpanded ? null : entry.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1 text-left">
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${getPolicyTypeColor(entry.policyMetadata?.type)}`}>
                          {getPolicyTypeLabel(entry.policyMetadata?.type)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-text-main">{renderPolicyMetadataContent(entry)}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-text-muted flex-wrap">
                            <span>{entry.userName || 'Unknown User'}</span>
                            <span>•</span>
                            <span>{formatDateTime(entry.createdAt)}</span>
                            {entry.studentName && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-parish-primary/10 text-parish-primary font-medium">
                                  <Users className="w-3 h-3" />
                                  {entry.studentName}
                                </span>
                              </>
                            )}
                          </div>
                          {impactNote && <p className="text-xs text-text-secondary mt-1 italic">{impactNote}</p>}
                        </div>
                      </div>
                      <div className="text-text-muted">{isExpanded ? '−' : '+'}</div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-surface-border p-4 bg-surface-hover space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-text-muted">Chi Tiết Chính Sách</p>
                          {renderPolicyExpanded(entry)}
                        </div>
                        <div className="text-xs text-text-muted border-t border-surface-border pt-2">
                          <p>ID: {entry.id}</p>
                          {entry.entityId && <p>Entity ID: {entry.entityId}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!policyLoading && filteredPolicyData.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">
                Hiển thị {(policyPage - 1) * policyLimit + 1} đến {Math.min(policyPage * policyLimit, policyTotal)} trong {policyTotal} mục
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => policyPage > 1 && fetchPolicyHistory(policyPage - 1)}
                  disabled={policyPage === 1}
                  className="px-3 py-2 rounded-lg bg-surface-hover text-text-main disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-border text-sm font-medium"
                >
                  Trước
                </button>
                <div className="px-3 py-2 text-text-main text-sm font-medium">Trang {policyPage} / {policyTotalPages}</div>
                <button
                  onClick={() => policyPage < policyTotalPages && fetchPolicyHistory(policyPage + 1)}
                  disabled={policyPage >= policyTotalPages}
                  className="px-3 py-2 rounded-lg bg-surface-hover text-text-main disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-border text-sm font-medium"
                >
                  Tiếp
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </DesktopAppShell>
  )
}

export default AuditLogPage
