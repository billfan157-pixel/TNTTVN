import React, { useState, useEffect, useMemo } from 'react'
import {
  Calendar, CheckCircle2, XCircle, Clock, Search,
  RefreshCw, Check, X, Phone,
  Church, BookOpen, Flame
} from 'lucide-react'
import { useLeaveRequestStore } from '../../stores/leaveRequestStore'
import { useClassStore } from '../../stores/classStore'
import { useAuth } from '../../hooks/useAuth'
import { EmptyState, NoResultState, SkeletonTable } from '../common/StateFeedback'
import { ModalShell } from '../common/ModalShell'
import { formatDateVi } from '../../utils/formatDate'
import { PageHeader } from '../common/PageHeader'
import type { LeaveRequest, LeaveRequestStatus } from '../../types'
import { StudentName } from '../common/StudentName'

const SESSION_MAP: Record<string, { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  SundayMass: { label: 'Thánh Lễ', icon: Church },
  CatechismClass: { label: 'Giáo Lý', icon: BookOpen },
  EucharisticAdoration: { label: 'Chầu', icon: Flame },
}

export function DesktopLeaveRequests() {
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

  // Review Modal state
  const [reviewingRequest, setReviewingRequest] = useState<{ req: LeaveRequest; action: 'APPROVED' | 'REJECTED' } | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
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
  }, [requests, statusFilter, classFilter, dateFilter, searchQuery])

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'PENDING').length, [requests])

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
    <div className="product-view flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        icon={<Calendar size={20} />}
        title="Duyệt Đơn Xin Nghỉ Phép"
        description="Quản lý đơn xin phép nghỉ Thánh Lễ, Giáo Lý và Chầu Thánh Thể do phụ huynh gửi trực tuyến."
        actions={
          <>
            {pendingCount > 0 && (
              <span className="badge badge-warning flex items-center gap-1.5 px-3 py-1 text-xs">
                <Clock size={13} className="animate-pulse" /> {pendingCount} đơn chờ duyệt
              </span>
            )}
            <button
              onClick={() => fetchRequests()}
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Làm mới
            </button>
          </>
        }
      />

      {/* Controls & Filters */}
      <div className="view-toolbar">
        {/* Status Tabs */}
        <div className="view-tabs" role="tablist" aria-label="Trạng thái đơn xin nghỉ">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'ALL' ? 'bg-surface-card text-parish-primary shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Tất cả ({requests.length})
          </button>
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'PENDING' ? 'bg-surface-card text-amber-600 shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Chờ duyệt ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('APPROVED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'APPROVED' ? 'bg-surface-card text-emerald-600 shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Đã duyệt
          </button>
          <button
            onClick={() => setStatusFilter('REJECTED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === 'REJECTED' ? 'bg-surface-card text-rose-600 shadow-xs' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Từ chối
          </button>
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Class Filter */}
          {classList.length > 0 && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="form-select text-xs font-bold py-1.5 px-3 rounded-xl"
            >
              <option value="all">Tất cả các lớp</option>
              {classList.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          )}

          {/* Date Filter */}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="form-input text-xs font-medium py-1.5 px-3 rounded-xl"
            title="Lọc theo ngày"
          />

          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Tìm theo tên con / phụ huynh..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input text-xs font-medium pl-8 pr-3 py-1.5 rounded-xl w-48 sm:w-60 max-w-full"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="app-panel overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse text-sm text-left table-fixed min-w-0 bg-surface-card text-text-main">
            <colgroup>
              <col className="w-[50px]" />
              <col className="w-[110px]" />
              <col className="w-[180px]" />
              <col className="w-[120px]" />
              <col className="w-[180px]" />
              <col className="w-[160px]" />
              <col className="w-auto min-w-0" />
              <col className="w-[130px]" />
              {canReview && <col className="w-[140px]" />}
            </colgroup>
            <thead>
              <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3" scope="col">STT</th>
                <th className="py-2.5 px-3" scope="col">Ngày Nghỉ</th>
                <th className="py-2.5 px-3" scope="col">Thiếu Nhi</th>
                <th className="py-2.5 px-3" scope="col">Lớp</th>
                <th className="py-2.5 px-3" scope="col">Buổi Nghỉ</th>
                <th className="py-2.5 px-3" scope="col">Phụ Huynh</th>
                <th className="py-2.5 px-3" scope="col">Lý Do / Ghi Chú</th>
                <th className="py-2.5 px-3 text-center" scope="col">Trạng Thái</th>
                {canReview && <th className="py-2.5 px-3 text-center" scope="col">Thao Tác</th>}
              </tr>
            </thead>
            <tbody className="bg-surface-card">
              {loading ? (
                <tr>
                  <td colSpan={canReview ? 9 : 8} className="p-4">
                    <SkeletonTable rows={5} cols={canReview ? 9 : 8} />
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={canReview ? 9 : 8} className="p-8">
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
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req, idx) => (
                  <tr key={req.id} className="border-b border-surface-hover bg-surface-card hover:bg-surface-app transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-text-muted">{idx + 1}</td>

                    <td className="py-2.5 px-3 font-bold text-text-main">
                      {formatDateVi(req.date)}
                    </td>

                    <td className="py-2.5 px-3 overflow-hidden min-w-0">
                      <StudentName holyName={req.holyName} fullName={req.studentName || '—'} size="sm" />
                      {req.studentCode && (
                        <div className="text-xs text-text-muted">{req.studentCode}</div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 font-medium text-text-secondary">
                      {req.className || '—'}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {(req.sessionTypes || []).map((st) => {
                          const item = SESSION_MAP[st]
                          if (!item) return null
                          const Icon = item.icon
                          return (
                            <span
                              key={st}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-hover border border-surface-border text-[11px] font-bold text-text-main"
                            >
                              <Icon size={11} className="text-parish-primary" />
                              {item.label}
                            </span>
                          )
                        })}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="text-xs font-semibold text-text-main">{req.parentName}</div>
                      <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                        <Phone size={11} /> {req.parentPhone}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 overflow-hidden min-w-0">
                      <div className="text-xs text-text-main font-medium truncate" title={req.reason}>
                        {req.reason}
                      </div>
                      {req.reviewNote && (
                        <div className="text-[11px] text-parish-primary mt-0.5 italic truncate" title={req.reviewNote}>
                          Phản hồi: {req.reviewNote} ({req.reviewerName})
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`badge inline-flex items-center gap-1 ${
                          req.status === 'APPROVED'
                            ? 'badge-success'
                            : req.status === 'REJECTED'
                            ? 'badge-danger'
                            : req.status === 'CANCELLED'
                            ? 'badge-neutral'
                            : 'badge-warning'
                        }`}
                      >
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
                    </td>

                    {canReview && (
                      <td className="py-2.5 px-3 text-center">
                        {req.status === 'PENDING' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenReview(req, 'APPROVED')}
                              className="btn btn-primary btn-sm px-2.5 py-1 text-xs flex items-center gap-1"
                              title="Chấp thuận đơn"
                            >
                              <Check size={13} /> Duyệt
                            </button>
                            <button
                              onClick={() => handleOpenReview(req, 'REJECTED')}
                              className="btn btn-secondary btn-sm px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                              title="Từ chối đơn"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-text-disabled italic">Đã xử lý</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {reviewingRequest && (
        <ModalShell
          isOpen={!!reviewingRequest}
          onClose={() => setReviewingRequest(null)}
          title={
            reviewingRequest.action === 'APPROVED' ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-parish-success inline mr-2" />
                Xác Nhận Duyệt Đơn Xin Nghỉ
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-parish-danger inline mr-2" />
                Từ Chối Đơn Xin Nghỉ
              </>
            )
          }
          maxWidth="448px"
        >
          <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-surface-hover border border-surface-border text-xs space-y-1">
                <div>
                  <span className="text-text-muted">Thiếu nhi:</span>{' '}
                  <StudentName holyName={reviewingRequest.req.holyName} fullName={reviewingRequest.req.studentName || '—'} size="xs" /> ({reviewingRequest.req.className})
                </div>
                <div>
                  <span className="text-text-muted">Ngày nghỉ:</span>{' '}
                  <strong className="text-text-main">{reviewingRequest.req.date}</strong>
                </div>
                <div>
                  <span className="text-text-muted">Lý do phụ huynh:</span>{' '}
                  <span className="italic text-text-main">{reviewingRequest.req.reason}</span>
                </div>
              </div>

              {reviewingRequest.action === 'APPROVED' ? (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
                  ⚡ <strong>Tự động đồng bộ:</strong> Hệ thống sẽ tự động cập nhật bản ghi điểm danh ngày này thành <strong>"Có phép" (AbsentExcused)</strong> cho tất cả các buổi đã chọn.
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300">
                  ⚠️ Đơn sẽ bị từ chối và thông báo phản hồi sẽ được gửi tới phụ huynh.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
                  Ghi chú phản hồi cho phụ huynh (Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder={reviewingRequest.action === 'APPROVED' ? 'VD: Đã ghi nhận em nghỉ có phép' : 'VD: Ngày thi kết khóa bắt buộc có mặt...'}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="form-input w-full text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewingRequest(null)}
                  className="btn btn-secondary btn-sm"
                  disabled={submittingReview}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReview}
                  className={`btn btn-sm text-white font-bold flex items-center gap-1.5 ${
                    reviewingRequest.action === 'APPROVED' ? 'btn-primary' : 'btn-danger'
                  }`}
                  disabled={submittingReview}
                >
                  {submittingReview ? 'Đang xử lý...' : reviewingRequest.action === 'APPROVED' ? 'Xác nhận Duyệt' : 'Xác nhận Từ Chối'}
                </button>
              </div>
            </div>
        </ModalShell>
      )}
    </div>
  )
}
