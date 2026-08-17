import React from 'react'
import { HeartHandshake, Loader2, AlertCircle, Users2, Printer, ChevronRight, UserRound } from 'lucide-react'
import { getClassificationLabel } from '../utils/grades'
import { generateParentReportCardHTML } from '../utils/pdfGenerator'
import { ReportExportService } from '../services/reportExportService'
import { normalizeAcademicYear } from '../utils/academicYear'
import { BRANCHES } from '../constants/branches'
import { useParentPortal } from '../hooks/useParentPortal'
import { TelegramLinkCard } from '../components/common/TelegramLinkCard'
import { PageHeader } from '../components/common/PageHeader'

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v))

const PROMOTION_LABELS: Record<string, string> = {
  PROMOTED: 'Được lên lớp',
  RETAINED: 'Ở lại lớp',
  GRADUATED: 'Tốt nghiệp',
  CONDITIONALLY_PROMOTED: 'Lên lớp có điều kiện',
  TRANSFERRED: 'Chuyển ngành',
}

export const ParentPage: React.FC = () => {
  const { children, loading, error, selectedId, report, reportLoading, reportError, selectChild } = useParentPortal()

  // B2 consolidation: template duy nhất bên utils/pdfGenerator (generateParentReportCardHTML) —
  // escaped + watermark + @page; print qua ReportExportService như mọi phiếu in khác.
  const handlePrint = () => {
    if (!report) return
    ReportExportService.print(generateParentReportCardHTML(report))
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
        <div className="text-center py-12 text-text-muted space-y-2">
          <Users2 size={36} className="mx-auto opacity-40" />
          <p className="text-sm">Chưa có thiếu nhi nào được liên kết với số điện thoại này.</p>
          <p className="text-xs">Vui lòng liên hệ Ban Giáo Lý để kiểm tra lại số điện thoại phụ huynh.</p>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            {children.map(child => (
              <button
                key={child.id}
                onClick={() => selectChild(child.id)}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
                  selectedId === child.id
                    ? 'border-parish-primary bg-parish-primary-light dark:bg-parish-primary/10'
                    : 'border-surface-border bg-surface-card hover:border-parish-primary/60'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-parish-primary/15 flex items-center justify-center text-parish-primary shrink-0">
                  <UserRound size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-text-main truncate">
                    {child.holyName} {child.fullName}
                  </div>
                  <div className="text-xs text-text-muted truncate">
                    {BRANCHES[child.branch as keyof typeof BRANCHES]?.name ?? child.branch} · {child.className} · {child.status}
                  </div>
                </div>
                <ChevronRight size={16} className="text-text-muted shrink-0" />
              </button>
            ))}
          </div>

          <section className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-4">
            {reportLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
            ) : reportError ? (
              <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950 text-rose-600 text-sm rounded-lg border border-rose-200 dark:border-rose-900">
                <AlertCircle size={16} />{reportError}
              </div>
            ) : report ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">
                    Kết Quả Học Tập — {normalizeAcademicYear(report.academicYear) || report.academicYear}
                  </h2>
                  <button onClick={handlePrint}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-parish-primary hover:bg-parish-primary/90 text-white text-xs font-semibold rounded-lg transition-colors">
                    <Printer size={14} /> In Kết Quả Học Tập
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-text-muted text-xs block">Học Kỳ 1</span><span className="font-semibold">{fmt(report.grades.find(g => g.semester === 1)?.gpa ?? null)}</span></div>
                  <div><span className="text-text-muted text-xs block">Học Kỳ 2</span><span className="font-semibold">{fmt(report.grades.find(g => g.semester === 2)?.gpa ?? null)}</span></div>
                  <div><span className="text-text-muted text-xs block">Xếp Loại</span>
                    <span className="font-semibold">{report.grades.some(g => g.gpa != null) ? getClassificationLabel(report.grades.filter(g => g.gpa != null)[0].gpa!) : '—'}</span>
                  </div>
                  <div><span className="text-text-muted text-xs block">Chuyên Cần</span><span className="font-semibold">{report.attendanceSummary.overallAttendanceRate}%</span></div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm bg-surface-card text-text-main">
                    <thead>
                      <tr className="text-left text-xs text-text-muted border-b border-surface-border">
                        <th className="py-2 pr-3 font-semibold" scope="col">Học Kỳ</th>
                        <th className="py-2 pr-3 font-semibold text-center" scope="col">Miệng</th>
                        <th className="py-2 pr-3 font-semibold text-center" scope="col">15 Phút</th>
                        <th className="py-2 pr-3 font-semibold text-center" scope="col">1 Tiết</th>
                        <th className="py-2 pr-3 font-semibold text-center" scope="col">Giữa Kỳ</th>
                        <th className="py-2 pr-3 font-semibold text-center" scope="col">Thi HK</th>
                        <th className="py-2 pr-3 font-semibold text-center" scope="col">ĐTB</th>
                        <th className="py-2 font-semibold text-center" scope="col">Xếp Loại</th>
                      </tr>
                    </thead>
                    <tbody className="bg-surface-card">
                      {report.grades.map(g => (
                        <tr key={g.semester} className="border-b border-surface-border/60 bg-surface-card hover:bg-surface-app transition-colors">
                          <td className="py-2 pr-3 font-semibold text-text-main">Học Kỳ {g.semester}</td>
                          <td className="py-2 pr-3 text-center">{fmt(g.scoreOral)}</td>
                          <td className="py-2 pr-3 text-center">{fmt(g.score15m)}</td>
                          <td className="py-2 pr-3 text-center">{fmt(g.score1Period)}</td>
                          <td className="py-2 pr-3 text-center">{fmt(g.scoreMidterm)}</td>
                          <td className="py-2 pr-3 text-center">{fmt(g.scoreFinal)}</td>
                          <td className="py-2 pr-3 text-center font-semibold">{fmt(g.gpa)}</td>
                          <td className="py-2 text-center">{getClassificationLabel(g.gpa ?? 0)}</td>
                        </tr>
                      ))}
                      {report.grades.length === 0 && (
                        <tr><td colSpan={8} className="py-4 text-center text-text-muted text-sm">Chưa có điểm cho năm học này.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-3 text-xs">
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
              </>
            ) : (
              <p className="text-sm text-text-muted text-center py-6">Chọn một thiếu nhi để xem kết quả học tập.</p>
            )}
          </section>
        </>
      )}

      <TelegramLinkCard />
    </div>
  )
}

export default ParentPage
