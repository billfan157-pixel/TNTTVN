import React, { useState, useEffect, useMemo, useCallback, useId } from 'react'
import {
  Calendar, CheckCircle2, XCircle, Clock, Search, RefreshCw,
  Check, X, Phone, Church, BookOpen, Flame, Filter, CalendarClock
} from 'lucide-react'
import { useLeaveRequestStore } from '../../stores/leaveRequestStore'
import { useClassStore } from '../../stores/classStore'
import { useAuth } from '../../hooks/useAuth'
import { EmptyState, NoResultState, SkeletonTable } from '../common/StateFeedback'
import type { LeaveRequest, LeaveRequestStatus } from '../../types'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { StudentName } from '../common/StudentName'
import { ModalPortal } from '../common/ModalPortal'

const SESSION_MAP: Record<string, { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  SundayMass: { label: 'Thánh Lễ', icon: Church },
  CatechismClass: { label: 'Giáo Lý', icon: BookOpen },
  EucharisticAdoration: { label: 'Chầu', icon: Flame },
}

const STATUS_TABS: { key: 'ALL' | LeaveRequestStatus; label: string; color: string }[] = [
  { key: 'ALL', label: 'Tất cả', color: 'text-parish-primary' },
  { key: 'PENDING', label: 'Chờ duyệt', color: 'text-amber-600' },
  { key: 'APPROVED', label: 'Đã duyệt', color: 'text-emerald-600' },
  { key: 'REJECTED', label: 'Từ chối', color: 'text-rose-600' },
]

export const MobileLeaveRequests: React.FC = () => {
  const { role } = useAuth()
  const canReview = role === 'admin' || role === 'chunhiem' || role === 'phuta'

  const requests = useLeaveRequestStore((s) => s.requests)
  const loading = useLeaveRequestStore((s) => s.loading)
  const fetchRequests = useLeaveRequestStore((s) => s.fetchRequests)
  const reviewRequest = useLeaveRequestStore((s) => s.reviewRequest)

  const classList = useClassStore((s) => s.getClassList)()

  const [statusFilter, setStatusFilter] = useState<'ALL' | LeaveRequestStatus>('ALL')
  const [classFilter, setClassFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  const [reviewingRequest, setReviewingRequest] = useState<{ req: LeaveRequest; action: 'APPROVED' | 'REJECTED' } | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const closeReview = useCallback(() => setReviewingRequest(null), [])
  const { dialogRef, titleId } = useAccessibleDialog(Boolean(reviewingRequest), closeReview)
  const reviewNoteId = useId()

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const filteredRequests = useMemo(() => {
    const list = requests.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
      if (classFilter !== 'all' && r.classId !== classFilter) return false
      if (dateFilter && r.date !== dateFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchName = r.studentName?.toLowerCase().includes(q)
        const matchHoly = r.holyName?.toLowerCase().includes(q)
        const matchCode = r.studentCode?.toLowerCase().includes(q)
        const matchParent = r.parentName?.toLowerCase().includes(q)
        if (!matchName && !matchHoly && !matchCode && !matchParent) return false
      }
      return true
    })
    // Mobile UX: đơn chờ duyệt luôn nổi lên đầu danh sách
    return list.sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1
      if (b.status === 'PENDING' && a.status !== 'PENDING') return 1
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [requests, statusFilter, classFilter, dateFilter, searchQuery])

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'PENDING').length, [requests])
  const activeFilterCount = (classFilter !== 'all' ? 1 : 0) + (dateFilter ? 1 : 0) + (searchQuery ? 1 : 0)

  const handleOpenReview = (req: LeaveRequest, action: 'APPROVED' | 'REJECTED') => {
    setReviewingRequest({ req, action })
    setReviewNote('')
  }

  const handleConfirmReview = async () => {
    if (!reviewingRequest) return
    setSubmittingReview(true)
    try {
      await reviewRequest(reviewingRequest.req.id, reviewingRequest.action, reviewNote.trim() || undefined)
      setReviewingRequest(null)
      fetchRequests()
    } catch {
      // Error handled by store toast
    } finally {
      setSubmittingReview(false)
    }
  }

  return (
    <div className="product-view flex flex-col gap-3 pb-8">
      {/* Header */}
      <div className="mobile-page-header">
        <div className="mobile-page-header__identity">
          <div className="mobile-page-header__icon">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="mobile-page-header__title truncate">
              Đơn Xin Nghỉ Phép
            </h3>
            <p className="mobile-page-header__description truncate">
              {pendingCount > 0 ? (
                <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                  <Clock size={12} className="animate-pulse" /> {pendingCount} đơn chờ duyệt
                </span>
              ) : (
                'Không có đơn chờ xử lý'
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchRequests()}
          className="btn btn-secondary mobile-btn flex items-center gap-1.5 shrink-0"
          disabled={loading}
          aria-label="Làm mới danh sách"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Status Tabs */}
      <div className="view-tabs" role="tablist" aria-label="Trạng thái đơn xin nghỉ">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={`view-tab ${statusFilter === tab.key ? 'is-active' : ''}`}
            role="tab"
            aria-selected={statusFilter === tab.key}
          >
            {tab.label}
            {tab.key === 'PENDING' && pendingCount > 0 && (
              <span className={`text-xs font-extrabold px-1.5 py-0.5 rounded-full ${
                statusFilter === 'PENDING' ? 'bg-white text-parish-primary' : 'bg-parish-danger text-white'
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters toggle */}
      <button
        type="button"
        onClick={() => setShowFilters((v) => !v)}
        className="btn btn-secondary mobile-btn flex items-center justify-center gap-1.5 min-h-[44px]"
        aria-expanded={showFilters}
      >
        <Filter size={14} aria-hidden="true" />
        Bộ lọc
        {activeFilterCount > 0 && (
          <span className="text-xs font-extrabold px-1.5 py-0.5 rounded-full bg-parish-primary text-white">
            {activeFilterCount}
          </span>
        )}
      </button>

      {showFilters && (
        <div className="mobile-filter-panel flex flex-col gap-3">
          {classList.length > 0 && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="form-select text-sm font-bold w-full min-h-[44px] rounded-xl"
              aria-label="Lọc theo lớp"
            >
              <option value="all">Tất cả các lớp</option>
              {classList.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          )}

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="form-input text-sm font-medium w-full min-h-[44px] rounded-xl"
            title="Lọc theo ngày"
            aria-label="Lọc theo ngày"
          />

          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Tìm theo tên con / phụ huynh..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input text-sm font-medium pl-10 pr-3 w-full min-h-[44px] rounded-xl"
              aria-label="Tìm kiếm"
            />
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setClassFilter('all')
                setDateFilter('')
                setSearchQuery('')
              }}
              className="btn btn-secondary mobile-btn text-xs min-h-[44px]"
            >
              Xóa bộ lọc ({activeFilterCount})
            </button>
          )}
        </div>
      )}

      {/* Request Cards */}
      {loading ? (
        <div className="app-panel p-3">
          <SkeletonTable rows={4} cols={1} />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="app-panel">
          {requests.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="Chưa có đơn xin phép nghỉ nào"
              description="Khi phụ huynh nộp đơn xin phép qua Cổng Phụ Huynh, các đơn sẽ hiển thị tại đây để quý Trưởng xét duyệt."
            />
          ) : (
            <NoResultState
              title="Không tìm thấy đơn xin nghỉ phù hợp"
              description="Hãy thử thay đổi bộ lọc trạng thái, lớp học hoặc ngày tìm kiếm."
              onReset={() => {
                setStatusFilter('ALL')
                setClassFilter('all')
                setDateFilter('')
                setSearchQuery('')
              }}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredRequests.map((req) => {
            const statusColor =
              req.status === 'APPROVED'
                ? 'badge-success'
                : req.status === 'REJECTED'
                ? 'badge-danger'
                : req.status === 'CANCELLED'
                ? 'badge-neutral'
                : 'badge-warning'
            return (
              <div
                key={req.id}
                className={`entity-card p-4 ${
                  req.status === 'PENDING' ? 'border-amber-300 dark:border-amber-700' : 'border-surface-border'
                }`}
              >
                {/* Student + Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <StudentName holyName={req.holyName} fullName={req.studentName || '—'} size="base" />
                    <div className="text-xs text-text-muted mt-0.5 font-medium">
                      {req.studentCode}
                      {req.studentCode && req.className ? ' • ' : ''}
                      {req.className}
                    </div>
                  </div>
                  <span className={`badge inline-flex items-center gap-1 shrink-0 ${statusColor}`}>
                    {req.status === 'APPROVED' ? (
                      <>
                        <CheckCircle2 size={12} /> Đã duyệt
                      </>
                    ) : req.status === 'REJECTED' ? (
                      <>
                        <XCircle size={12} /> Từ chối
                      </>
                    ) : req.status === 'CANCELLED' ? (
                      'Đã hủy'
                    ) : (
                      <>
                        <Clock size={12} className="animate-pulse" /> Chờ duyệt
                      </>
                    )}
                  </span>
                </div>

                {/* Date + Sessions */}
                <div className="flex items-center gap-2 mt-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-main bg-surface-hover border border-surface-border rounded-lg px-2.5 py-1.5">
                    <Calendar size={12} className="text-parish-primary" />
                    {req.date}
                  </span>
                  {(req.sessionTypes || []).map((st) => {
                    const item = SESSION_MAP[st]
                    if (!item) return null
                    const Icon = item.icon
                    return (
                      <span
                        key={st}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-hover border border-surface-border text-[11px] font-bold text-text-main"
                      >
                        <Icon size={11} className="text-parish-primary" />
                        {item.label}
                      </span>
                    )
                  })}
                </div>

                {/* Parent */}
                <div className="flex items-center gap-1.5 mt-2.5 text-xs">
                  <Phone size={11} className="text-text-muted shrink-0" />
                  <span className="font-semibold text-text-main">{req.parentName}</span>
                  <span className="text-text-muted">{req.parentPhone}</span>
                </div>

                {/* Reason */}
                <p className="text-[13px] text-text-main font-medium mt-2.5 leading-relaxed line-clamp-2">
                  {req.reason}
                </p>

                {req.reviewNote && (
                  <div className="text-[11px] text-parish-primary mt-1.5 italic font-medium">
                    Phản hồi: {req.reviewNote}
                    {req.reviewerName ? ` (${req.reviewerName})` : ''}
                  </div>
                )}

                {/* Actions */}
                {canReview && req.status === 'PENDING' && (
                  <div className="flex gap-2 mt-3.5">
                    <button
                      onClick={() => handleOpenReview(req, 'APPROVED')}
                      className="btn btn-primary flex-1 min-h-[44px] rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
                    >
                      <Check size={16} /> Duyệt
                    </button>
                    <button
                      onClick={() => handleOpenReview(req, 'REJECTED')}
                      className="flex-1 min-h-[44px] rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-rose-600 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <X size={16} /> Từ chối
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Review Bottom Sheet */}
      {reviewingRequest && (
        <ModalPortal>
        <div
          className="app-modal-layer fixed inset-0 flex items-end justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setReviewingRequest(null)}
          role="presentation"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-busy={submittingReview}
            className="bg-surface-card border border-surface-border rounded-t-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle */}
            <div className="flex justify-center pt-2.5">
              <div className="w-10 h-1 rounded-full bg-surface-border" />
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-border">
              <h3 id={titleId} className="text-base font-bold text-text-main m-0 flex items-center gap-2">
                {reviewingRequest.action === 'APPROVED' ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Xác Nhận Duyệt
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-rose-600" />
                    Từ Chối Đơn
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setReviewingRequest(null)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-main"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3.5">
              <div className="p-3.5 rounded-xl bg-surface-hover border border-surface-border text-xs space-y-1.5">
                <div>
                  <span className="text-text-muted">Thiếu nhi:</span>{' '}
                  <StudentName holyName={reviewingRequest.req.holyName} fullName={reviewingRequest.req.studentName || '—'} size="xs" />{' '}
                  <span className="text-text-muted">({reviewingRequest.req.className})</span>
                </div>
                <div>
                  <span className="text-text-muted">Ngày nghỉ:</span>{' '}
                  <strong className="text-text-main">{reviewingRequest.req.date}</strong>{' '}
                  <span className="text-text-muted">
                    ({reviewingRequest.req.sessionTypes.map((st) => SESSION_MAP[st]?.label).filter(Boolean).join(', ')})
                  </span>
                </div>
                <div>
                  <span className="text-text-muted">Phụ huynh:</span>{' '}
                  <strong className="text-text-main">{reviewingRequest.req.parentName}</strong>{' '}
                  <span className="text-text-muted">{reviewingRequest.req.parentPhone}</span>
                </div>
                <div>
                  <span className="text-text-muted">Lý do:</span>{' '}
                  <span className="italic text-text-main">{reviewingRequest.req.reason}</span>
                </div>
              </div>

              {reviewingRequest.action === 'APPROVED' ? (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
                  ⚡ <strong>Tự động đồng bộ:</strong> Hệ thống sẽ tự động cập nhật bản ghi điểm danh ngày này thành{' '}
                  <strong>"Có phép" (AbsentExcused)</strong> cho tất cả các buổi đã chọn.
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300">
                  ⚠️ Đơn sẽ bị từ chối và thông báo phản hồi sẽ được gửi tới phụ huynh.
                </div>
              )}

              <div>
                <label htmlFor={reviewNoteId} className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
                  Ghi chú phản hồi cho phụ huynh (Tùy chọn)
                </label>
                <input
                  id={reviewNoteId}
                  type="text"
                  placeholder={reviewingRequest.action === 'APPROVED' ? 'VD: Đã ghi nhận em nghỉ có phép' : 'VD: Ngày thi kết khóa bắt buộc có mặt...'}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="form-input w-full text-sm min-h-[44px]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setReviewingRequest(null)}
                  className="btn btn-secondary min-h-[44px] flex-1"
                  disabled={submittingReview}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReview}
                  className={`min-h-[44px] flex-1 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-1.5 ${
                    reviewingRequest.action === 'APPROVED' ? 'btn btn-primary' : 'btn btn-danger'
                  }`}
                  disabled={submittingReview}
                >
                  {submittingReview ? 'Đang xử lý...' : reviewingRequest.action === 'APPROVED' ? 'Xác nhận Duyệt' : 'Xác nhận Từ Chối'}
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}

export default MobileLeaveRequests
