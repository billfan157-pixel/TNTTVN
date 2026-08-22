import React, { useState, useEffect } from 'react'
import { HeartHandshake, Loader2, AlertCircle, Users2, Printer, CheckCircle2, GraduationCap, CalendarPlus, Clock, XCircle, Ban } from 'lucide-react'
import { getClassificationLabel } from '../utils/grades'
import { generateParentReportCardHTML } from '../utils/pdfGenerator'
import { ReportExportService } from '../services/reportExportService'
import { normalizeAcademicYear } from '../utils/academicYear'
import { BRANCHES } from '../constants/branches'
import { useParentPortal } from '../hooks/useParentPortal'
import { LeaveRequestModal } from '../components/common/LeaveRequestModal'
import { useLeaveRequestStore } from '../stores/leaveRequestStore'
import { TelegramLinkCard } from '../components/common/TelegramLinkCard'
import { PageHeader } from '../components/common/PageHeader'
import { ChildAvatar, AttendanceBar, StatCard, PromotionBanner } from '../components/common/ParentWidgets'
import { classificationTextClass, classificationChipClass } from '../utils/parentDisplay'

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

export const ParentPage: React.FC = () => {
  const { children, loading, error, selectedId, report, reportLoading, reportError, selectChild } = useParentPortal()
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

  // B2 consolidation: template duy nhất bên utils/pdfGenerator (generateParentReportCardHTML) —
  // escaped + watermark + @page; print qua ReportExportService như mọi phiếu in khác.
  const handlePrint = () => {
    if (!report) return
    ReportExportService.print(generateParentReportCardHTML(report))
  }

  const sem1Gpa = report?.grades.find(g => g.semester === 1)?.gpa ?? null
  const sem2Gpa = report?.grades.find(g => g.semester === 2)?.gpa ?? null
  const latestGpa = sem2Gpa ?? sem1Gpa
  const latestClassification = latestGpa != null ? getClassificationLabel(latestGpa) : null

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader
        icon={<HeartHandshake className="w-5 h-5" />}
        title="Con Của Tôi"
        description="Kết quả học tập và chuyên cần của các em — liên kết qua số điện thoại phụ huynh đã đăng ký"
      />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950 text-rose-600 text-sm rounded-lg border border-rose-200 dark:border-rose-900">
          <AlertCircle size={16} />{error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-text-muted" /></div>
      ) : children.length === 0 ? (
        <div className="text-center py-12 text-text-muted space-y-2 bg-surface-card border border-surface-border rounded-2xl shadow-card">
          <Users2 size={36} className="mx-auto opacity-40" />
          <p className="text-sm">Chưa có thiếu nhi nào được liên kết với số điện thoại này.</p>
          <p className="text-xs">Vui lòng liên hệ Ban Giáo Lý để kiểm tra lại số điện thoại phụ huynh.</p>
        </div>
      ) : (
        <>
          <div className={`grid gap-3 ${children.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {children.map(child => {
              const active = selectedId === child.id
              return (
                <button
                  key={child.id}
                  onClick={() => selectChild(child.id)}
                  aria-pressed={active}
                  className={`group relative flex items-center gap-3.5 p-4 rounded-2xl border text-left transition-all ${
                    active
                      ? 'border-parish-primary bg-parish-primary-light dark:bg-parish-primary/10 shadow-card ring-1 ring-parish-primary/30'
                      : 'border-surface-border bg-surface-card shadow-xs hover:border-parish-primary/60'
                  }`}
                >
                  <ChildAvatar id={child.id} holyName={child.holyName} fullName={child.fullName} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-text-main truncate">
                      {child.holyName} {child.fullName}
                    </div>
                    <div className="text-xs text-text-muted truncate mt-0.5">
                      {BRANCHES[child.branch as keyof typeof BRANCHES]?.name ?? child.branch} · {child.className} · {child.status}
                    </div>
                  </div>
                  {active && <CheckCircle2 size={18} className="text-parish-primary shrink-0" />}
                </button>
              )
            })}
          </div>

          <section className="bg-surface-card border border-surface-border rounded-2xl p-5 md:p-6 space-y-5 shadow-card">
            {reportLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
            ) : reportError ? (
              <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950 text-rose-600 text-sm rounded-lg border border-rose-200 dark:border-rose-900">
                <AlertCircle size={16} />{reportError}
              </div>
            ) : report ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider m-0">
                    Kết Quả Học Tập — {normalizeAcademicYear(report.academicYear) || report.academicYear}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setIsLeaveModalOpen(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-card hover:bg-surface-hover border border-surface-border text-parish-primary text-xs font-bold rounded-lg transition-colors shadow-xs"
                    >
                      <CalendarPlus size={14} /> Xin Phép Nghỉ
                    </button>
                    <button onClick={handlePrint}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-parish-primary hover:bg-parish-primary/90 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs">
                      <Printer size={14} /> In Kết Quả Học Tập
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Học Kỳ 1" value={fmt(sem1Gpa)} valueClassName="text-xl mt-1" />
                  <StatCard label="Học Kỳ 2" value={fmt(sem2Gpa)} valueClassName="text-xl mt-1" />
                  <StatCard
                    label="Xếp Loại"
                    value={latestClassification ?? '—'}
                    valueClassName={`text-lg mt-1.5 ${latestClassification ? classificationTextClass(latestClassification) : ''}`}
                  />
                  <StatCard label="Chuyên Cần" value={`${report.attendanceSummary.overallAttendanceRate}%`} valueClassName="text-xl mt-1" />
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

                <div className="rounded-xl border border-surface-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm bg-surface-card text-text-main">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted border-b border-surface-border bg-surface-hover/60">
                          <th className="py-2.5 pl-4 pr-3 font-bold" scope="col">Học Kỳ</th>
                          <th className="py-2.5 pr-3 font-bold text-center" scope="col">Miệng</th>
                          <th className="py-2.5 pr-3 font-bold text-center" scope="col">15 Phút</th>
                          <th className="py-2.5 pr-3 font-bold text-center" scope="col">1 Tiết</th>
                          <th className="py-2.5 pr-3 font-bold text-center" scope="col">Giữa Kỳ</th>
                          <th className="py-2.5 pr-3 font-bold text-center" scope="col">Thi HK</th>
                          <th className="py-2.5 pr-3 font-bold text-center" scope="col">ĐTB</th>
                          <th className="py-2.5 pr-4 font-bold text-center" scope="col">Xếp Loại</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.grades.map(g => {
                          const rowLabel = g.gpa != null ? getClassificationLabel(g.gpa) : null
                          return (
                            <tr key={g.semester} className="border-b border-surface-border/60 last:border-b-0 hover:bg-surface-app transition-colors">
                              <td className="py-2.5 pl-4 pr-3 font-semibold text-text-main">Học Kỳ {g.semester}</td>
                              <td className="py-2.5 pr-3 text-center tabular-nums">{fmt(g.scoreOral)}</td>
                              <td className="py-2.5 pr-3 text-center tabular-nums">{fmt(g.score15m)}</td>
                              <td className="py-2.5 pr-3 text-center tabular-nums">{fmt(g.score1Period)}</td>
                              <td className="py-2.5 pr-3 text-center tabular-nums">{fmt(g.scoreMidterm)}</td>
                              <td className="py-2.5 pr-3 text-center tabular-nums">{fmt(g.scoreFinal)}</td>
                              <td className="py-2.5 pr-3 text-center font-extrabold tabular-nums">{fmt(g.gpa)}</td>
                              <td className="py-2.5 pr-4 text-center">
                                {rowLabel && (
                                  <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-semibold ${classificationChipClass(rowLabel)}`}>
                                    {rowLabel}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        {report.grades.length === 0 && (
                          <tr><td colSpan={8} className="py-5 text-center text-text-muted text-sm">Chưa có điểm cho năm học này.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedChild && (
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
                        {childRequests.map((req) => (
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
                )}
              </>
            ) : (
              <p className="text-sm text-text-muted text-center py-6 m-0">Chọn một thiếu nhi để xem kết quả học tập.</p>
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

      <TelegramLinkCard />
    </div>
  )
}

export default ParentPage
