import React, { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { HeartHandshake, Loader2, AlertCircle, Users2, ChevronRight, Megaphone, UserRound, FileText, CalendarPlus, Clock, CheckCircle2, XCircle, Ban } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useParentPortal } from '../../hooks/useParentPortal'
import { useNoticeStore } from '../../stores/noticeStore'
import { useLeaveRequestStore } from '../../stores/leaveRequestStore'
import { LeaveRequestModal } from './LeaveRequestModal'
import { getClassificationLabel } from '../../utils/grades'
import { normalizeAcademicYear } from '../../utils/academicYear'
import { BRANCHES } from '../../constants/branches'

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v))

const PROMOTION_LABELS: Record<string, string> = {
  PROMOTED: 'Được lên lớp',
  RETAINED: 'Ở lại lớp',
  GRADUATED: 'Tốt nghiệp',
  CONDITIONALLY_PROMOTED: 'Lên lớp có điều kiện',
  TRANSFERRED: 'Chuyển ngành',
}

const SESSION_LABELS: Record<string, string> = {
  SundayMass: 'Thánh Lễ',
  CatechismClass: 'Giáo Lý',
  EucharisticAdoration: 'Chầu Thánh Thể',
}

export const ParentDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { children, loading, error, selectedId, report, reportLoading, reportError, selectChild } = useParentPortal()
  const notices = useNoticeStore((s) => s.notices)
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)

  const requests = useLeaveRequestStore((s) => s.requests)
  const fetchRequests = useLeaveRequestStore((s) => s.fetchRequests)
  const cancelRequest = useLeaveRequestStore((s) => s.cancelRequest)

  const selectedChild = children.find(c => c.id === selectedId) ?? null

  useEffect(() => {
    if (selectedChild) {
      fetchRequests({ studentId: selectedChild.id })
    }
  }, [selectedChild?.id, fetchRequests])

  const childRequests = requests.filter((r) => r.studentId === selectedChild?.id)

  const sem1Gpa = report?.grades.find(g => g.semester === 1)?.gpa ?? null
  const sem2Gpa = report?.grades.find(g => g.semester === 2)?.gpa ?? null
  const latestGpa = sem2Gpa ?? sem1Gpa
  const recentNotices = [...notices]
    .sort((a, b) => new Date(b.date ?? b.createdAt ?? 0).getTime() - new Date(a.date ?? a.createdAt ?? 0).getTime())
    .slice(0, 3)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-parish-primary/15 flex items-center justify-center text-parish-primary shrink-0">
          <HeartHandshake className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-main">
            Chào, {user?.fullName || 'Quý Phụ Huynh'}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Tổng quan học tập của con tại Giáo Xứ Gia Tôn.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950 text-rose-600 text-sm rounded-lg border border-rose-200 dark:border-rose-900">
          <AlertCircle size={16} />{error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-text-muted" /></div>
      ) : children.length === 0 ? (
        <div className="text-center py-16 text-text-muted space-y-2 bg-surface-card border border-surface-border rounded-xl">
          <Users2 size={40} className="mx-auto opacity-40" />
          <p className="text-sm font-medium text-text-main">Chưa có thiếu nhi nào được liên kết với số điện thoại này.</p>
          <p className="text-xs">Vui lòng liên hệ Ban Giáo Lý để kiểm tra lại số điện thoại phụ huynh.</p>
        </div>
      ) : (
        <>
          {children.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {children.map(child => (
                <button
                  key={child.id}
                  onClick={() => selectChild(child.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm whitespace-nowrap transition-colors ${
                    selectedId === child.id
                      ? 'border-parish-primary bg-parish-primary-light dark:bg-parish-primary/10 text-parish-primary font-semibold'
                      : 'border-surface-border bg-surface-card text-text-muted hover:border-parish-primary/60'
                  }`}
                >
                  <UserRound size={14} />
                  {child.holyName} {child.fullName}
                </button>
              ))}
            </div>
          )}

          <section className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-4">
            {reportLoading ? (
              <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
            ) : reportError ? (
              <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950 text-rose-600 text-sm rounded-lg border border-rose-200 dark:border-rose-900">
                <AlertCircle size={16} />{reportError}
              </div>
            ) : report && selectedChild ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-text-main">
                      {selectedChild.holyName} {selectedChild.fullName}
                    </h2>
                    <p className="text-xs text-text-muted mt-0.5">
                      {BRANCHES[selectedChild.branch as keyof typeof BRANCHES]?.name ?? selectedChild.branch}
                      {' · '}{selectedChild.className}
                      {report.academicYear ? ` · ${normalizeAcademicYear(report.academicYear)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setIsLeaveModalOpen(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-card hover:bg-surface-hover border border-surface-border text-parish-primary text-xs font-bold rounded-lg shadow-xs transition-colors"
                    >
                      <CalendarPlus size={14} /> Xin Phép Nghỉ
                    </button>
                    <button
                      onClick={() => navigate({ to: '/parent' })}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-parish-primary hover:bg-parish-primary/90 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <FileText size={14} /> Xem Chi Tiết & In Kết Quả Học Tập
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-surface-hover border border-surface-border">
                    <span className="text-text-muted text-xs block">Học Kỳ 1</span>
                    <span className="text-xl font-bold text-text-main">{fmt(sem1Gpa)}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-hover border border-surface-border">
                    <span className="text-text-muted text-xs block">Học Kỳ 2</span>
                    <span className="text-xl font-bold text-text-main">{fmt(sem2Gpa)}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-hover border border-surface-border">
                    <span className="text-text-muted text-xs block">Xếp Loại</span>
                    <span className="text-lg font-bold text-parish-primary">
                      {latestGpa != null ? getClassificationLabel(latestGpa) : '—'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-hover border border-surface-border">
                    <span className="text-text-muted text-xs block">Chuyên Cần</span>
                    <span className="text-xl font-bold text-text-main">
                      {report.attendanceSummary.overallAttendanceRate}%
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-md bg-surface-hover border border-surface-border text-text-muted">
                    Lễ: {report.attendanceSummary.massPresentCount}/{report.attendanceSummary.massTotalCount} buổi
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-surface-hover border border-surface-border text-text-muted">
                    Giáo lý: {report.attendanceSummary.catechismPresentCount}/{report.attendanceSummary.catechismTotalCount} buổi
                  </span>
                  {report.promotion && (
                    <span className="px-2.5 py-1 rounded-md bg-parish-primary-light border border-parish-primary/40 text-parish-primary font-semibold">
                      Kết quả năm: {PROMOTION_LABELS[report.promotion.status] ?? report.promotion.status}
                    </span>
                  )}
                </div>

                {/* Leave Requests for Selected Child */}
                <div className="pt-3 border-t border-surface-border">
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={14} className="text-parish-primary" /> Lịch Sử Đơn Xin Nghỉ Phép
                    </h3>
                    <button
                      onClick={() => setIsLeaveModalOpen(true)}
                      className="text-xs text-parish-primary font-bold hover:underline"
                    >
                      + Tạo đơn mới
                    </button>
                  </div>

                  {childRequests.length === 0 ? (
                    <p className="text-xs text-text-muted italic py-1 m-0">Chưa có đơn xin nghỉ phép nào gần đây.</p>
                  ) : (
                    <div className="space-y-2">
                      {childRequests.slice(0, 3).map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-surface-hover border border-surface-border text-xs flex-wrap gap-2"
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="mt-0.5">
                              {req.status === 'APPROVED' ? (
                                <CheckCircle2 size={16} className="text-emerald-500" />
                              ) : req.status === 'REJECTED' ? (
                                <XCircle size={16} className="text-rose-500" />
                              ) : req.status === 'CANCELLED' ? (
                                <Ban size={16} className="text-text-muted" />
                              ) : (
                                <Clock size={16} className="text-amber-500 animate-pulse" />
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-text-main">
                                Nghỉ ngày: {req.date} ({(req.sessionTypes || []).map((st) => SESSION_LABELS[st] || st).join(', ')})
                              </div>
                              <div className="text-text-muted mt-0.5">Lý do: {req.reason}</div>
                              {req.reviewNote && (
                                <div className="text-parish-primary mt-0.5 font-medium">
                                  Phản hồi từ {req.reviewerName || 'GLV'}: {req.reviewNote}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`badge ${
                                req.status === 'APPROVED'
                                  ? 'badge-success'
                                  : req.status === 'REJECTED'
                                  ? 'badge-danger'
                                  : req.status === 'CANCELLED'
                                  ? 'badge-neutral'
                                  : 'badge-warning'
                              }`}
                            >
                              {req.status === 'APPROVED'
                                ? 'Đã chấp thuận'
                                : req.status === 'REJECTED'
                                ? 'Từ chối'
                                : req.status === 'CANCELLED'
                                ? 'Đã hủy'
                                : 'Chờ xét duyệt'}
                            </span>
                            {req.status === 'PENDING' && (
                              <button
                                onClick={() => cancelRequest(req.id)}
                                className="text-[11px] text-rose-500 hover:underline font-bold"
                              >
                                Hủy đơn
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted text-center py-8">Đang tải kết quả học tập…</p>
            )}
          </section>

          {selectedChild && (
            <LeaveRequestModal
              isOpen={isLeaveModalOpen}
              onClose={() => setIsLeaveModalOpen(false)}
              studentId={selectedChild.id}
              studentName={selectedChild.fullName}
              holyName={selectedChild.holyName}
              className={selectedChild.className}
              onSuccess={() => fetchRequests({ studentId: selectedChild.id })}
            />
          )}
        </>
      )}

      <section className="bg-surface-card border border-surface-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
            <Megaphone size={16} className="text-parish-primary" /> Thông Báo Mới Nhất
          </h3>
          {notices.length > 0 && (
            <button
              onClick={() => navigate({ to: '/notices' })}
              className="text-xs text-parish-primary font-semibold flex items-center gap-0.5 hover:underline"
            >
              Xem tất cả <ChevronRight size={14} />
            </button>
          )}
        </div>
        {recentNotices.length === 0 ? (
          <p className="text-sm text-text-muted">Chưa có thông báo nào.</p>
        ) : (
          <div className="divide-y divide-surface-border/60">
            {recentNotices.map(n => (
              <button
                key={n.id}
                onClick={() => navigate({ to: '/notices' })}
                className="w-full text-left py-2.5 flex items-start justify-between gap-3 group"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-main truncate group-hover:text-parish-primary transition-colors">
                    {n.title}
                  </div>
                  <div className="text-xs text-text-muted truncate mt-0.5">
                    {new Date(n.date ?? n.createdAt ?? 0).toLocaleDateString('vi-VN')} · {n.author}
                  </div>
                </div>
                <ChevronRight size={16} className="text-text-muted shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default ParentDashboard
