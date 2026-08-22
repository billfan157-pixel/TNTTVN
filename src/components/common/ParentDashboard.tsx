import React, { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { HeartHandshake, Loader2, AlertCircle, Users2, ChevronRight, Megaphone, FileText, CalendarPlus, Clock, CheckCircle2, XCircle, Ban, CalendarDays, GraduationCap } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useParentPortal } from '../../hooks/useParentPortal'
import { useNoticeStore } from '../../stores/noticeStore'
import { useLeaveRequestStore } from '../../stores/leaveRequestStore'
import { LeaveRequestModal } from './LeaveRequestModal'
import { ChildAvatar, AttendanceBar, StatCard, DonutRing, PromotionBanner } from './ParentWidgets'
import { classificationTextClass } from '../../utils/parentDisplay'
import { getClassificationLabel } from '../../utils/grades'
import { normalizeAcademicYear } from '../../utils/academicYear'
import { BRANCHES } from '../../constants/branches'
import { DesktopAppShell } from '../desktop/DesktopAppShell'

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
  const latestClassification = latestGpa != null ? getClassificationLabel(latestGpa) : null
  const attendanceRate = report?.attendanceSummary.overallAttendanceRate ?? 0
  const recentNotices = [...notices]
    .sort((a, b) => new Date(b.date ?? b.createdAt ?? 0).getTime() - new Date(a.date ?? a.createdAt ?? 0).getTime())
    .slice(0, 3)

  return (
    <DesktopAppShell width="wide" className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-parish-primary to-parish-primary-hover dark:from-[#16305e] dark:to-[#101c3f] p-6 md:p-7 shadow-card">
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/[0.07] blur-3xl" />
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm flex items-center justify-center shrink-0">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">
                Chào, {user?.fullName || 'Quý Phụ Huynh'}
              </h1>
              <p className="text-sm text-white/80 mt-0.5 mb-0">
                Tổng quan học tập của con tại Giáo Xứ Gia Tôn.
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/20 text-xs font-semibold text-white/90 backdrop-blur-sm">
            <CalendarDays size={13} />
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950 text-rose-600 text-sm rounded-lg border border-rose-200 dark:border-rose-900">
          <AlertCircle size={16} />{error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-text-muted" /></div>
      ) : children.length === 0 ? (
        <div className="text-center py-16 text-text-muted space-y-2 bg-surface-card border border-surface-border rounded-2xl shadow-card">
          <Users2 size={40} className="mx-auto opacity-40" />
          <p className="text-sm font-medium text-text-main">Chưa có thiếu nhi nào được liên kết với số điện thoại này.</p>
          <p className="text-xs">Vui lòng liên hệ Ban Giáo Lý để kiểm tra lại số điện thoại phụ huynh.</p>
        </div>
      ) : (
        <>
          {children.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Chọn con để xem kết quả">
              {children.map(child => {
                const active = selectedId === child.id
                return (
                  <button
                    key={child.id}
                    onClick={() => selectChild(child.id)}
                    role="tab"
                    aria-selected={active}
                    className={`group flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full border whitespace-nowrap transition-all ${
                      active
                        ? 'border-parish-primary bg-parish-primary-light dark:bg-parish-primary/15 shadow-xs'
                        : 'border-surface-border bg-surface-card hover:border-parish-primary/50'
                    }`}
                  >
                    <ChildAvatar
                      id={child.id}
                      holyName={child.holyName}
                      fullName={child.fullName}
                      size={30}
                      className={active ? 'ring-2 ring-parish-primary/40' : 'opacity-80 group-hover:opacity-100 transition-opacity'}
                    />
                    <span className={`text-sm transition-colors ${active ? 'font-bold text-parish-primary' : 'font-medium text-text-muted group-hover:text-text-main'}`}>
                      {child.holyName} {child.fullName}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <section className="bg-surface-card border border-surface-border rounded-2xl p-5 md:p-6 space-y-5 shadow-card">
            {reportLoading ? (
              <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
            ) : reportError ? (
              <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950 text-rose-600 text-sm rounded-lg border border-rose-200 dark:border-rose-900">
                <AlertCircle size={16} />{reportError}
              </div>
            ) : report && selectedChild ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ChildAvatar id={selectedChild.id} holyName={selectedChild.holyName} fullName={selectedChild.fullName} size={46} />
                    <div className="min-w-0">
                      <h2 className="font-bold text-text-main truncate m-0">
                        {selectedChild.holyName} {selectedChild.fullName}
                      </h2>
                      <p className="text-xs text-text-muted mt-0.5 mb-0 truncate">
                        {BRANCHES[selectedChild.branch as keyof typeof BRANCHES]?.name ?? selectedChild.branch}
                        {' · '}{selectedChild.className}
                        {report.academicYear ? ` · ${normalizeAcademicYear(report.academicYear)}` : ''}
                      </p>
                    </div>
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

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard label="Học Kỳ 1" value={fmt(sem1Gpa)} valueClassName="text-xl mt-1" />
                  <StatCard label="Học Kỳ 2" value={fmt(sem2Gpa)} valueClassName="text-xl mt-1" />
                  <StatCard
                    label="Xếp Loại"
                    value={latestClassification ?? '—'}
                    valueClassName={`text-lg mt-1.5 ${latestClassification ? classificationTextClass(latestClassification) : ''}`}
                  />
                  <div className="p-3.5 rounded-xl border border-surface-border bg-gradient-to-br from-surface-hover to-transparent flex items-center gap-3">
                    <div className="relative shrink-0">
                      <DonutRing percent={attendanceRate} />
                      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-text-main tabular-nums">
                        {Math.round(attendanceRate)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Chuyên Cần</span>
                      <span className="block leading-tight text-xl font-extrabold text-text-main">
                        {report.attendanceSummary.overallAttendanceRate}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
                  <AttendanceBar
                    kind="mass"
                    present={report.attendanceSummary.massPresentCount}
                    total={report.attendanceSummary.massTotalCount}
                  />
                  <AttendanceBar
                    kind="catechism"
                    present={report.attendanceSummary.catechismPresentCount}
                    total={report.attendanceSummary.catechismTotalCount}
                  />
                </div>

                {report.promotion && (
                  <PromotionBanner
                    status={report.promotion.status}
                    label={PROMOTION_LABELS[report.promotion.status] ?? report.promotion.status}
                    icon={<GraduationCap size={18} />}
                  />
                )}

                <div className="pt-4 border-t border-surface-border">
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5 m-0">
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

      <section className="bg-surface-card border border-surface-border rounded-2xl p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-text-main flex items-center gap-2 m-0">
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
          <p className="text-sm text-text-muted m-0">Chưa có thông báo nào.</p>
        ) : (
          <div className="divide-y divide-surface-border/60">
            {recentNotices.map(n => (
              <button
                key={n.id}
                onClick={() => navigate({ to: '/notices' })}
                className="w-full text-left py-3 flex items-center justify-between gap-3 group"
              >
                <span className="flex items-start gap-2.5 min-w-0">
                  <span
                    aria-hidden
                    className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                      n.priority === 'urgent' ? 'bg-rose-500 animate-pulse' : n.priority === 'important' ? 'bg-amber-500' : 'bg-sky-400 opacity-70'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-text-main truncate group-hover:text-parish-primary transition-colors">
                      {n.title}
                    </span>
                    <span className="block text-xs text-text-muted truncate mt-0.5">
                      {new Date(n.date ?? n.createdAt ?? 0).toLocaleDateString('vi-VN')} · {n.author}
                    </span>
                  </span>
                </span>
                <ChevronRight size={16} className="text-text-muted shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        )}
      </section>
    </DesktopAppShell>
  )
}

export default ParentDashboard
