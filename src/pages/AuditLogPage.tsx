import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  TrendingUp,
  RefreshCw,
  Users,
  GitBranch,
  GraduationCap,
  Lock,
  FileEdit,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { AuditMetricsSummary } from '../lib/api/auditLogs'
import { PageHeader } from '../components/common/PageHeader'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { EmptyState, ErrorState, SkeletonCardGrid, SkeletonTable } from '../components/common/StateFeedback'
import {
  type AuditLog,
  type AuditMeta,
  type PolicyHistoryEntry,
  type PolicySummary,
} from '../components/audit/auditTypes'
import { AuditPulseBar } from '../components/audit/AuditPulseBar'
import { AuditToolbar, type AuditFilters } from '../components/audit/AuditToolbar'
import { AuditLogItem } from '../components/audit/AuditLogItem'
import { AuditExportModal } from '../components/audit/AuditExportModal'

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

type ViewMode = 'all' | 'policy'

const INITIAL_FILTERS: AuditFilters = {
  search: '',
  severity: 'all',
  entityType: '',
  action: '',
  startDate: '',
  endDate: '',
  datePreset: 'all',
}

export function AuditLogPage() {
  const [mode, setMode] = useState<ViewMode>('all')

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [meta, setMeta] = useState<AuditMeta>({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<AuditFilters>(INITIAL_FILTERS)
  const [metrics, setMetrics] = useState<AuditMetricsSummary | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)

  // Policy History tab state (ADR-047)
  const [policyData, setPolicyData] = useState<PolicyHistoryEntry[]>([])
  const [policySummary, setPolicySummary] = useState<PolicySummary>({
    policyUpdates: 0,
    gradeOverrides: 0,
    promotionDecisions: 0,
    semesterLocks: 0,
    total: 0,
  })
  const [policyLoading, setPolicyLoading] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [policyPage, setPolicyPage] = useState(1)
  const [policyTotal, setPolicyTotal] = useState(0)
  const [policyTotalPages, setPolicyTotalPages] = useState(0)
  const [policyLimit] = useState(50)
  const [selectedPolicyType, setSelectedPolicyType] = useState<string | null>(null)
  const [policyExpandedId, setPolicyExpandedId] = useState<string | null>(null)

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true)
    try {
      if (typeof api.getAuditMetrics === 'function') {
        const data = await api.getAuditMetrics()
        setMetrics(data)
      }
    } catch {
      // Non-blocking pulse failure
    } finally {
      setMetricsLoading(false)
    }
  }, [])

  const fetchLogs = useCallback(
    async (page = 1, customLimit?: number) => {
      setLoading(true)
      setError(null)
      try {
        const pageSize = customLimit || meta.limit || 25
        const params: Record<string, any> = { page, limit: pageSize }

        if (filters.action.includes('|')) {
          const [act, ent] = filters.action.split('|')
          params.action = act
          params.entityType = ent
        } else if (filters.action) {
          params.action = filters.action
        }

        if (filters.entityType) params.entityType = filters.entityType
        if (filters.startDate) params.startDate = filters.startDate
        if (filters.endDate) params.endDate = filters.endDate
        if (filters.search) params.search = filters.search
        if (filters.severity && filters.severity !== 'all') {
          params.severity = filters.severity
        }

        const res = await api.getAuditLogs(params)
        setLogs(res.data || [])
        const metaData = res.meta || { page: 1, limit: pageSize, total: 0 }
        setMeta({
          page: metaData.page,
          limit: metaData.limit,
          total: metaData.total,
          totalPages: (metaData as any).totalPages || Math.ceil((metaData.total || 0) / (metaData.limit || pageSize)),
        })
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Không thể tải nhật ký hoạt động'
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [filters, meta.limit]
  )

  const fetchPolicyHistory = useCallback(
    async (pageNum: number = 1) => {
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
    },
    [policyLimit]
  )

  useEffect(() => {
    fetchLogs(1)
  }, [fetchLogs])

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  useEffect(() => {
    if (mode === 'policy') fetchPolicyHistory(1)
  }, [mode, fetchPolicyHistory])

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= meta.totalPages) {
      fetchLogs(newPage)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handlePageSizeChange = (newSize: number) => {
    setMeta((prev) => ({ ...prev, limit: newSize }))
    fetchLogs(1, newSize)
  }

  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS)
  }

  const isFiltered = Boolean(
    filters.search ||
      filters.severity !== 'all' ||
      filters.entityType ||
      filters.action ||
      filters.datePreset !== 'all'
  )

  const formatDateTime = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return dateString
    }
  }

  const getPolicyTypeColor = (type?: string): string =>
    type ? POLICY_TYPE_COLORS[type] || 'bg-surface-hover' : 'bg-surface-hover'
  const getPolicyTypeLabel = (type?: string): string =>
    type ? POLICY_TYPE_LABELS[type] || type : 'Unknown'

  const renderPolicyMetadataContent = (entry: PolicyHistoryEntry): string => {
    const metaDetail = entry.policyMetadata
    if (!metaDetail) return 'Không có chi tiết'
    switch (metaDetail.type) {
      case 'POLICY_UPDATE':
        return `Thay đổi: ${metaDetail.changedFields?.join(', ') || 'N/A'} — ${metaDetail.summary?.note || ''}`
      case 'GRADE_OVERRIDE':
        return `Ghi đè ${metaDetail.scoreField || 'N/A'} = ${metaDetail.manualValue ?? 'N/A'} (Policy: ${
          metaDetail.policyVersionId?.slice(-10) || 'N/A'
        })`
      case 'PROMOTION_DECISION':
        return `Xét lên: GPA ${metaDetail.gpa?.toFixed(2) || 'N/A'} → ${metaDetail.decision || 'N/A'} (Policy: ${
          metaDetail.policyVersionId?.slice(-10) || 'N/A'
        })`
      case 'SEMESTER_LOCK':
        return `HK ${metaDetail.semester}: ${metaDetail.locked ? 'Khóa' : 'Mở'} (Policy: ${
          metaDetail.policyVersionId?.slice(-10) || 'N/A'
        })`
      default:
        return 'Không có chi tiết'
    }
  }

  const renderPolicyImpactNote = (entry: PolicyHistoryEntry): string | null => {
    const metaDetail = entry.policyMetadata
    if (!metaDetail || metaDetail.type !== 'POLICY_UPDATE' || !metaDetail.summary) return null
    const s = metaDetail.summary
    if (s.gpaBefore !== null && s.gpaBefore !== undefined && s.gpaAfter !== null && s.gpaAfter !== undefined) {
      return `Ảnh hưởng GPA: ${s.gpaBefore.toFixed(2)} → ${s.gpaAfter.toFixed(2)} (${s.labelBefore || '—'} → ${
        s.labelAfter || '—'
      })`
    }
    return s.note || null
  }

  const renderPolicyExpanded = (entry: PolicyHistoryEntry) => {
    const metaDetail = entry.policyMetadata
    if (!metaDetail) return null
    return (
      <div className="mt-2 space-y-1 text-xs text-text-main">
        {metaDetail.type === 'POLICY_UPDATE' && (
          <>
            {metaDetail.previousVersion && (
              <p>
                <span className="font-semibold">Phiên bản trước:</span> {metaDetail.previousVersion.slice(-10)}
              </p>
            )}
            {metaDetail.currentVersion && (
              <p>
                <span className="font-semibold">Phiên bản mới:</span> {metaDetail.currentVersion.slice(-10)}
              </p>
            )}
            {metaDetail.changedFields && metaDetail.changedFields.length > 0 && (
              <div>
                <p className="font-semibold">Thay đổi:</p>
                <ul className="list-disc list-inside">
                  {metaDetail.changedFields.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {renderPolicyImpactNote(entry) && (
              <p className="mt-1">
                <span className="font-semibold">Tác động GPA:</span> {renderPolicyImpactNote(entry)}
              </p>
            )}
          </>
        )}
        {metaDetail.type === 'GRADE_OVERRIDE' && (
          <>
            {entry.studentName && (
              <p>
                <span className="font-semibold">Thiếu nhi:</span> {entry.studentName}
              </p>
            )}
            <p>
              <span className="font-semibold">Trường:</span> {metaDetail.scoreField}
            </p>
            <p>
              <span className="font-semibold">Giá trị:</span> {metaDetail.manualValue}
            </p>
            {metaDetail.academicYear && (
              <p>
                <span className="font-semibold">Năm học:</span> {metaDetail.academicYear}
              </p>
            )}
            {metaDetail.semester != null && (
              <p>
                <span className="font-semibold">Học kỳ:</span> {metaDetail.semester}
              </p>
            )}
            <p>
              <span className="font-semibold">Policy ID:</span> {metaDetail.policyVersionId?.slice(-10)}
            </p>
          </>
        )}
        {metaDetail.type === 'PROMOTION_DECISION' && (
          <>
            {entry.studentName && (
              <p>
                <span className="font-semibold">Thiếu nhi:</span> {entry.studentName}
              </p>
            )}
            <p>
              <span className="font-semibold">GPA:</span> {metaDetail.gpa?.toFixed(2)}
            </p>
            <p>
              <span className="font-semibold">Quyết định:</span> {metaDetail.decision}
            </p>
            <p>
              <span className="font-semibold">Policy ID:</span> {metaDetail.policyVersionId?.slice(-10)}
            </p>
          </>
        )}
        {metaDetail.type === 'SEMESTER_LOCK' && (
          <>
            <p>
              <span className="font-semibold">Học kỳ:</span> {metaDetail.semester}
            </p>
            <p>
              <span className="font-semibold">Trạng thái:</span> {metaDetail.locked ? 'Khóa' : 'Mở'}
            </p>
            <p>
              <span className="font-semibold">Policy ID:</span> {metaDetail.policyVersionId?.slice(-10)}
            </p>
          </>
        )}
      </div>
    )
  }

  const filteredPolicyData = selectedPolicyType
    ? policyData.filter((entry) => entry.policyMetadata?.type === selectedPolicyType)
    : policyData

  return (
    <DesktopAppShell width="wide">
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
        <div className="space-y-4">
          {/* TẦNG 1: Thước đo Xung nhịp & An ninh */}
          <AuditPulseBar
            metrics={metrics}
            loading={metricsLoading}
            onRefreshMetrics={fetchMetrics}
          />

          {/* TẦNG 2: Thanh công cụ điều tra thông minh */}
          <AuditToolbar
            filters={filters}
            onChangeFilters={setFilters}
            onRefresh={() => fetchLogs(meta.page)}
            onOpenExport={() => setIsExportOpen(true)}
            isFiltered={isFiltered}
            onResetFilters={handleResetFilters}
          />

          {/* TẦNG 3: Danh sách dòng nhật ký & Visual Diff */}
          <div className="app-panel overflow-hidden border border-surface-border rounded-2xl shadow-xs bg-surface-card">
            {loading ? (
              <div className="p-4" role="status" aria-label="Đang tải dữ liệu">
                <SkeletonTable rows={6} cols={4} />
              </div>
            ) : logs.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Chưa có nhật ký nào"
                description={
                  isFiltered
                    ? 'Không tìm thấy bản ghi phù hợp với các tiêu chí tìm kiếm.'
                    : 'Các thao tác trên hệ thống sẽ được ghi lại tại đây.'
                }
              />
            ) : (
              <div className="divide-y divide-surface-border/60">
                {logs.map((log, idx) => (
                  <AuditLogItem
                    key={`${log.id}-${idx}`}
                    log={log}
                    isExpanded={expandedId === log.id}
                    onToggleExpand={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Thanh phân trang Admin chuyên nghiệp */}
          {meta.total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2 bg-surface-card border border-surface-border rounded-xl text-xs text-text-muted">
              <div className="flex items-center gap-2">
                <span>
                  Hiển thị {(meta.page - 1) * meta.limit + 1} - {Math.min(meta.page * meta.limit, meta.total)} trong tổng số{' '}
                  <strong className="text-text-main">{meta.total.toLocaleString('vi-VN')}</strong> bản ghi
                </span>

                <div className="h-3 w-px bg-surface-border mx-1 hidden sm:block" />

                <div className="hidden sm:flex items-center gap-1">
                  <span>Mỗi trang:</span>
                  {[25, 50, 100].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => handlePageSizeChange(size)}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                        meta.limit === size
                          ? 'bg-parish-primary text-white'
                          : 'bg-surface-hover text-text-secondary hover:text-text-main'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {meta.totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePageChange(1)}
                    disabled={meta.page <= 1}
                    aria-label="Trang đầu"
                    title="Về trang đầu"
                    className="p-1.5 bg-surface-card border border-surface-border rounded-lg disabled:opacity-30 hover:bg-surface-hover transition-colors"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePageChange(meta.page - 1)}
                    disabled={meta.page <= 1}
                    aria-label="Trang trước"
                    title="Trang trước"
                    className="p-1.5 bg-surface-card border border-surface-border rounded-lg disabled:opacity-30 hover:bg-surface-hover transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <span className="px-2 py-1 font-semibold text-text-main">
                    Trang {meta.page} / {meta.totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => handlePageChange(meta.page + 1)}
                    disabled={meta.page >= meta.totalPages}
                    aria-label="Trang sau"
                    title="Trang sau"
                    className="p-1.5 bg-surface-card border border-surface-border rounded-lg disabled:opacity-30 hover:bg-surface-hover transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePageChange(meta.totalPages)}
                    disabled={meta.page >= meta.totalPages}
                    aria-label="Trang cuối"
                    title="Đến trang cuối"
                    className="p-1.5 bg-surface-card border border-surface-border rounded-lg disabled:opacity-30 hover:bg-surface-hover transition-colors"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Modal Xuất Báo Cáo */}
          <AuditExportModal
            isOpen={isExportOpen}
            onClose={() => setIsExportOpen(false)}
            currentFilters={filters}
            totalMatching={meta.total}
          />
        </div>
      )}

      {/* Tab Chính Sách & Tác Động (ADR-047 Policy History) */}
      {mode === 'policy' && (
        <div className="space-y-4">
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

          <div className="flex gap-2 flex-wrap items-center">
            <button
              onClick={() => setSelectedPolicyType(null)}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                selectedPolicyType === null
                  ? 'bg-parish-primary text-white shadow-xs'
                  : 'bg-surface-hover text-text-secondary hover:text-text-main'
              }`}
            >
              Tất Cả ({policySummary.total || policyTotal})
            </button>
            {Object.entries(POLICY_TYPE_LABELS).map(([type, label]) => {
              const count =
                type === 'POLICY_UPDATE'
                  ? policySummary.policyUpdates
                  : type === 'GRADE_OVERRIDE'
                  ? policySummary.gradeOverrides
                  : type === 'PROMOTION_DECISION'
                  ? policySummary.promotionDecisions
                  : policySummary.semesterLocks
              return (
                <button
                  key={type}
                  onClick={() => setSelectedPolicyType(type)}
                  className={`min-h-[40px] px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    selectedPolicyType === type
                      ? 'bg-parish-primary text-white shadow-xs'
                      : 'bg-surface-hover text-text-secondary hover:text-text-main'
                  }`}
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
                  <div
                    key={entry.id}
                    className="border border-surface-border rounded-lg overflow-hidden transition-all hover:shadow-md"
                  >
                    <button
                      onClick={() => setPolicyExpandedId(isExpanded ? null : entry.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1 text-left">
                        <div
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${getPolicyTypeColor(
                            entry.policyMetadata?.type
                          )}`}
                        >
                          {getPolicyTypeLabel(entry.policyMetadata?.type)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-text-main">
                            {renderPolicyMetadataContent(entry)}
                          </p>
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
                Hiển thị {(policyPage - 1) * policyLimit + 1} đến{' '}
                {Math.min(policyPage * policyLimit, policyTotal)} trong {policyTotal} mục
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => policyPage > 1 && fetchPolicyHistory(policyPage - 1)}
                  disabled={policyPage === 1}
                  className="px-3 py-2 rounded-lg bg-surface-hover text-text-main disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-border text-sm font-medium"
                >
                  Trước
                </button>
                <div className="px-3 py-2 text-text-main text-sm font-medium">
                  Trang {policyPage} / {policyTotalPages}
                </div>
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
        </div>
      )}
    </DesktopAppShell>
  )
}

export default AuditLogPage
