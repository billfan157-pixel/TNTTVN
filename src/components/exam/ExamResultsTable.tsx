import React, { useState } from 'react'
import { Eye, Trash2, X } from 'lucide-react'
import { deleteScanReviewSnapshot, loadScanReviewSnapshot, purgeExpiredScanReviewSnapshots, type ScanReviewSnapshot } from '../../lib/scanReviewStorage'
import type { ExamResult } from '../../types'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface ExamResultsTableProps {
  results: ExamResult[]
  onRemove: (resultId: string) => void
  sessionId?: string
  /** EXAM-MIXED: hiện thêm cột điểm tự luận (thành phần của điểm tổng). */
  essayMode?: boolean
}

/**
 * Smart Exam Grading — ExamResultsTable: danh sách kết quả đã lưu của phiên.
 */
export const ExamResultsTable: React.FC<ExamResultsTableProps> = ({ results, onRemove, sessionId, essayMode }) => {
  const [snapshot, setSnapshot] = useState<ScanReviewSnapshot | null>(null)
  // PHA 1 nợ (audit A19): focus trap cho review overlay
  const trapRef = useFocusTrap(Boolean(snapshot))
  const [reviewMessage, setReviewMessage] = useState('')

  React.useEffect(() => { void purgeExpiredScanReviewSnapshots() }, [])

  const openReview = async (studentId: string) => {
    if (!sessionId) return
    const retained = await loadScanReviewSnapshot(sessionId, studentId)
    if (!retained) {
      setReviewMessage('Không có ảnh cục bộ hoặc ảnh đã tự xóa sau 24 giờ.')
      return
    }
    setReviewMessage('')
    setSnapshot(retained)
  }

  const deleteReview = async () => {
    if (!snapshot) return
    await deleteScanReviewSnapshot(snapshot.sessionId, snapshot.studentId)
    setSnapshot(null)
    setReviewMessage('Đã xóa ảnh rà soát khỏi thiết bị này.')
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-text-muted">
        Chưa có kết quả nào — nhập nhanh bên trên hoặc in phiếu QR để quét (Phase 2).
      </div>
    )
  }

  const sorted = [...results].sort((a, b) => (a.studentCode || '').localeCompare(b.studentCode || ''))

  return (
    <>
    {reviewMessage && <div role="status" className="mb-2 rounded-lg border border-surface-border bg-surface-app px-3 py-2 text-xs font-semibold text-text-muted">{reviewMessage}</div>}
    <div className="overflow-x-auto">
      <table className="w-full text-sm bg-surface-card text-text-main">
        <thead>
          <tr className="text-left text-xs font-bold text-text-muted border-b border-surface-border">
            <th className="py-2 pr-2" scope="col">#</th>
            <th className="py-2 pr-2" scope="col">Mã Số</th>
            <th className="py-2 pr-2" scope="col">Thiếu Nhi</th>
            {essayMode && <th className="py-2 pr-2" scope="col">Điểm TL</th>}
            <th className="py-2 pr-2" scope="col">Điểm</th>
            <th className="py-2 pr-2" scope="col">Mã đề</th>
            <th className="py-2 pr-2" scope="col">Nguồn</th>
            <th className="py-2" scope="col" aria-label="Thao tác" />
          </tr>
        </thead>
        <tbody className="bg-surface-card">
          {sorted.map((r, i) => (
            <tr key={r.id} className="border-b border-surface-border/60 bg-surface-card hover:bg-surface-app transition-colors">
              <td className="py-2 pr-2 text-text-muted">{i + 1}</td>
              <td className="py-2 pr-2 font-mono text-sm">{r.studentCode}</td>
              <td className="py-2 pr-2 font-semibold text-base">
                {r.holyName && <span className="text-amber-600 mr-1">{r.holyName}</span>}
                {r.studentName}
              </td>
              {essayMode && (
                <td className="py-2 pr-2 font-semibold">
                  {typeof r.essayScore === 'number' ? r.essayScore : <span className="text-text-muted">—</span>}
                </td>
              )}
              <td className="py-2 pr-2 font-bold text-parish-primary">{r.score}</td>
              <td className="py-2 pr-2 font-black">{r.examVersion ?? 'A'}</td>
              <td className="py-2 pr-2">
                <span className="badge badge-neutral text-xs">{r.source === 'qr_scan' ? 'QR' : r.source === 'omr' ? 'OMR' : 'Nhập tay'}</span>
              </td>
              <td className="py-2 text-right">
                {sessionId && (r.source === 'omr' || r.source === 'qr_scan') && <button onClick={() => void openReview(r.studentId)} className="mr-3 inline-flex items-center gap-1 text-xs text-parish-primary hover:underline" title="Xem ảnh rà soát được giữ trên thiết bị này"><Eye size={13} /> Ảnh</button>}
                <button onClick={() => onRemove(r.id)} className="text-xs text-parish-danger hover:underline" title="Xóa kết quả (re-scan hoặc nhập lại)">
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {snapshot && (
      <div role="dialog" aria-modal="true" aria-label="Ảnh rà soát phiếu" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3" onClick={() => setSnapshot(null)}>
        <div ref={trapRef} className="flex max-h-[94vh] max-w-3xl flex-col overflow-hidden rounded-2xl bg-surface-card p-3" onClick={event => event.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-semibold text-text-muted">Ảnh cục bộ · tự xóa lúc {new Date(snapshot.expiresAt).toLocaleString('vi-VN')}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => setSnapshot(null)}><X size={14} /> Đóng</button></div>
          <img src={snapshot.dataUrl} alt="Phiếu đã quét để rà soát" className="min-h-0 max-h-[78vh] w-auto rounded-xl object-contain" />
          <button type="button" className="btn btn-danger mt-2 self-end" onClick={() => void deleteReview()}><Trash2 size={14} /> Xóa ảnh ngay</button>
        </div>
      </div>
    )}
    </>
  )
}
