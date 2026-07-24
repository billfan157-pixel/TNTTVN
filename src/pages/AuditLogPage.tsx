import { useState, useEffect } from 'react'
import { ClipboardList, Filter, ChevronLeft, ChevronRight, User, Clock, Eye } from 'lucide-react'
import { api } from '../lib/api'

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

const ACTION_LABELS: Record<string, string> = {
  CREATE_USER: 'Tạo tài khoản',
  UPDATE_USER_STATUS: 'Cập nhật trạng thái',
  RESET_PASSWORD: 'Reset mật khẩu',
  FORCE_LOGOUT: 'Buộc đăng xuất',
  CHANGE_PASSWORD: 'Đổi mật khẩu',
  CREATE_STUDENT: 'Thêm thiếu nhi',
  UPDATE_STUDENT: 'Sửa thiếu nhi',
  DELETE_STUDENT: 'Xóa thiếu nhi',
  UPSERT_GRADE: 'Cập nhật điểm',
  UPSERT_ATTENDANCE: 'Cập nhật điểm danh',
  CREATE_NOTICE: 'Tạo thông báo',
  DELETE_NOTICE: 'Xóa thông báo',
}

const ACTION_COLORS: Record<string, string> = {
  CREATE_USER: 'bg-emerald-500/10 text-emerald-600',
  UPDATE_USER_STATUS: 'bg-amber-500/10 text-amber-600',
  RESET_PASSWORD: 'bg-orange-500/10 text-orange-600',
  FORCE_LOGOUT: 'bg-rose-500/10 text-rose-600',
  CHANGE_PASSWORD: 'bg-blue-500/10 text-blue-600',
  CREATE_STUDENT: 'bg-emerald-500/10 text-emerald-600',
  UPDATE_STUDENT: 'bg-blue-500/10 text-blue-600',
  DELETE_STUDENT: 'bg-rose-500/10 text-rose-600',
  UPSERT_GRADE: 'bg-violet-500/10 text-violet-600',
  UPSERT_ATTENDANCE: 'bg-teal-500/10 text-teal-600',
  CREATE_NOTICE: 'bg-emerald-500/10 text-emerald-600',
  DELETE_NOTICE: 'bg-rose-500/10 text-rose-600',
}

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [meta, setMeta] = useState<AuditMeta>({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchLogs = async (page = 1) => {
    setLoading(true)
    try {
      const params: Record<string, any> = { page, limit: 25 }
      if (filterAction) params.action = filterAction
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
      console.error('Failed to fetch audit logs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [filterAction, filterEntity])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-parish-primary/10 rounded-xl flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-parish-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-main">Nhật Ký Hệ Thống</h1>
            <p className="text-xs text-text-muted">{meta.total} bản ghi</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main"
        >
          <option value="">Tất cả hành động</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value)}
          className="px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main"
        >
          <option value="">Tất cả đối tượng</option>
          <option value="user">Tài khoản</option>
          <option value="student">Thiếu nhi</option>
          <option value="grade">Điểm số</option>
          <option value="attendance">Điểm danh</option>
          <option value="notice">Thông báo</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-text-muted text-sm">Đang tải...</div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <ClipboardList className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">Chưa có nhật ký nào</p>
          </div>
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
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ACTION_COLORS[log.action] || 'bg-slate-500/10 text-slate-600'}`}>
                          {ACTION_LABELS[log.action] || log.action}
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

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">Trang {meta.page}/{meta.totalPages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchLogs(meta.page - 1)}
              disabled={meta.page <= 1}
              className="p-2 bg-surface-card border border-surface-border rounded-lg disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchLogs(meta.page + 1)}
              disabled={meta.page >= meta.totalPages}
              className="p-2 bg-surface-card border border-surface-border rounded-lg disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AuditLogPage
