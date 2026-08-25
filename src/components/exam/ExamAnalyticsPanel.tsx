import React, { useMemo } from 'react'
import { BarChart3, X } from 'lucide-react'
import { computeExamAnalytics } from '../../lib/examAnalytics'
import { normalizeAnswerVariants } from '../../lib/examVariants'
import { isMcGradedExamType } from '../../types'
import type { ExamSession, ExamResult } from '../../types'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface ExamAnalyticsPanelProps {
  session: ExamSession
  results: ExamResult[]
  onClose: () => void
}

const formatPercent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`

export const ExamAnalyticsPanel: React.FC<ExamAnalyticsPanelProps> = ({ session, results, onClose }) => {
  const variants = useMemo(
    () => normalizeAnswerVariants(session.answerVariants, session.answerKey, session.questionCount),
    [session.answerVariants, session.answerKey, session.questionCount],
  )
  const analytics = useMemo(
    () => computeExamAnalytics(results, isMcGradedExamType(session.examType) ? session.questionCount ?? 0 : 0, session.maxScore, variants),
    [results, session.examType, session.questionCount, session.maxScore, variants],
  )
  const maxFrequency = Math.max(1, ...analytics.distribution.map(item => item.count))
  // PHA 1 nợ (audit A19): focus trap
  const trapRef = useFocusTrap(true)

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="exam-analytics-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <div ref={trapRef} className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div><h4 id="exam-analytics-title" className="m-0 flex items-center gap-2 font-black text-parish-primary"><BarChart3 size={18} /> Phân tích phiên chấm</h4><p className="m-0 text-[11px] text-text-muted">{session.subject} · {analytics.count} kết quả</p></div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}><X size={15} /> Đóng</button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5">
          {[
            ['Trung bình', analytics.mean], ['Trung vị', analytics.median], ['Thấp nhất', analytics.min], ['Cao nhất', analytics.max], ['Đạt ≥50%', formatPercent(analytics.passRate)],
          ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-surface-border bg-surface-app p-3 text-center"><div className="text-[11px] font-bold text-text-muted">{label}</div><div className="text-xl font-black text-parish-primary">{value ?? '—'}</div></div>)}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3 pt-0">
          <section className="mb-4 rounded-xl border border-surface-border p-3">
            <h5 className="mb-3 font-black text-text-main">Phổ điểm</h5>
            {analytics.distribution.length === 0 ? <p className="text-sm text-text-muted">Chưa có dữ liệu.</p> : <div className="flex h-40 items-end gap-1 overflow-x-auto">{analytics.distribution.map(item => <div key={item.score} className="flex min-w-10 flex-1 flex-col items-center justify-end gap-1"><span className="text-[10px] font-bold">{item.count}</span><div className="w-full rounded-t bg-parish-primary" style={{ height: `${Math.max(5, item.count / maxFrequency * 110)}px` }} /><span className="text-[10px] text-text-muted">{item.score}</span></div>)}</div>}
            {analytics.versions.length > 1 && <p className="mt-3 text-xs font-semibold text-text-muted">Theo mã đề: {analytics.versions.map(item => `${item.version}: ${item.count}`).join(' · ')}</p>}
          </section>

          {isMcGradedExamType(session.examType) && (
            <section className="rounded-xl border border-surface-border">
              <div className="border-b border-surface-border p-3"><h5 className="m-0 font-black text-text-main">Phân tích từng câu</h5><p className="m-0 text-[11px] text-text-muted">Độ phân biệt dùng point-biserial; chỉ tính khi có ít nhất 5 bài và tồn tại cả nhóm đúng/sai.{session.examType === 'mixed' ? ' (Chỉ áp dụng cho phần trắc nghiệm.)' : ''}</p></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="text-left text-xs text-text-muted"><tr><th className="p-2">Câu</th><th className="p-2">Đúng</th><th className="p-2">Trống</th><th className="p-2">A</th><th className="p-2">B</th><th className="p-2">C</th><th className="p-2">D</th><th className="p-2">Độ phân biệt</th></tr></thead><tbody>{analytics.items.map(item => <tr key={item.questionIndex} className="border-t border-surface-border"><td className="p-2 font-black">{item.questionIndex}</td><td className={`p-2 font-bold ${(item.correctRate ?? 0) < 0.4 ? 'text-red-600' : (item.correctRate ?? 0) > 0.85 ? 'text-emerald-600' : ''}`}>{formatPercent(item.correctRate)}</td><td className="p-2">{formatPercent(item.blankRate)}</td><td className="p-2">{item.counts.A}</td><td className="p-2">{item.counts.B}</td><td className="p-2">{item.counts.C}</td><td className="p-2">{item.counts.D}</td><td className={`p-2 font-bold ${item.discrimination !== null && item.discrimination < 0 ? 'text-red-600' : ''}`}>{item.discrimination ?? '—'}</td></tr>)}</tbody></table></div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
