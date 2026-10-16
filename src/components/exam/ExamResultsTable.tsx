import React, { useCallback, useMemo, useState } from 'react'
import { Eye, Search, Trash2, X } from 'lucide-react'
import { deleteScanReviewSnapshot, loadScanReviewSnapshot, purgeExpiredScanReviewSnapshots, type ScanReviewSnapshot } from '../../lib/scanReviewStorage'
import type { ExamResult } from '../../types'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { ModalPortal } from '../common/ModalPortal'
import { StudentName } from '../common/StudentName'
import { Badge } from '../common/ui/Badge'

/** Nhãn nguồn điểm dùng chung cho bảng desktop và thẻ mobile. */
function sourceLabel(source: ExamResult['source']): string {
  return source === 'qr_scan' ? 'QR' : source === 'omr' ? 'OMR' : 'Nhập tay'
}

function sourceTone(source: ExamResult['source']): 'primary' | 'success' | 'neutral' {
  return source === 'qr_scan' ? 'primary' : source === 'omr' ? 'success' : 'neutral'
}

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
  const closeSnapshot = useCallback(() => setSnapshot(null), [])
  const { dialogRef: trapRef } = useAccessibleDialog(Boolean(snapshot), closeSnapshot)
  const [reviewMessage, setReviewMessage] = useState('')
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'qr_scan' | 'omr' | 'quick_entry' | 'manual'>('all')
  // MOBILE-UX: < 1024px dùng danh sách thẻ thay bảng 1312px (Mã đề / Nguồn /
  // Thao tác từng bị trôi ngoài màn hình). jsdom không có matchMedia → bảng.
  const isMobile = useMediaQuery('(max-width: 1023.9px)')

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

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => (a.studentCode || '').localeCompare(b.studentCode || ''))
  }, [results])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sorted.filter(r => {
      if (sourceFilter !== 'all') {
        if (sourceFilter === 'manual' && r.source !== 'quick_entry') return false
        if (sourceFilter === 'qr_scan' && r.source !== 'qr_scan') return false
        if (sourceFilter === 'omr' && r.source !== 'omr') return false
      }
      if (!q) return true
      const name = (r.studentName || '').toLowerCase()
      const code = (r.studentCode || '').toLowerCase()
      const holy = (r.holyName || '').toLowerCase()
      return name.includes(q) || code.includes(q) || holy.includes(q)
    })
  }, [sorted, search, sourceFilter])

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-text-muted">
        Chưa có kết quả nào — nhập nhanh bên trên hoặc quét phiếu để bắt đầu.
      </div>
    )
  }

  return (
    <>
      {reviewMessage && (
        <div role="status" className="mb-2 rounded-xl border border-surface-border bg-surface-app px-3 py-2 text-xs font-semibold text-text-muted">
          {reviewMessage}
        </div>
      )}

      {/* Filter toolbar */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Tìm tên hoặc mã thiếu nhi..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input min-h-9 w-full pl-8 pr-3 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-text-muted font-medium">Nguồn:</span>
          {(['all', 'qr_scan', 'omr', 'manual'] as const).map(src => {
            const label = src === 'all' ? 'Tất cả' : src === 'qr_scan' ? 'QR' : src === 'omr' ? 'OMR' : 'Nhập tay'
            const isSelected = sourceFilter === src
            return (
              <button
                key={src}
                type="button"
                onClick={() => setSourceFilter(src)}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors ${
                  isSelected
                    ? 'bg-parish-primary text-white shadow-2xs'
                    : 'bg-surface-app border border-surface-border text-text-secondary hover:bg-surface-hover'
                }`}
              >
                {label}
              </button>
            )
          })}
          <span className="ml-2 text-text-muted text-xs">
            ({filtered.length}/{results.length})
          </span>
        </div>
      </div>

      {isMobile ? (
        /* MOBILE-UX: mỗi kết quả một thẻ — điểm, mã đề, nguồn và thao tác đều
           thấy trong màn hình; nút thao tác đạt chuẩn chạm 44px. */
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-surface-border bg-surface-card py-6 text-center text-xs text-text-muted">
              Không tìm thấy kết quả phù hợp với bộ lọc tìm kiếm.
            </div>
          ) : (
            filtered.map((r, i) => (
              <div key={r.id} className="flex flex-col gap-2.5 rounded-xl border border-surface-border bg-surface-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs text-text-muted">{i + 1}.</span>
                    <StudentName holyName={r.holyName} fullName={r.studentName} size="base" />
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold text-text-muted">{r.studentCode}</span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  <span className="text-base font-extrabold text-parish-primary">
                    {r.score}<span className="ml-0.5 text-xs font-medium text-text-muted">điểm</span>
                  </span>
                  <Badge tone={sourceTone(r.source)}>{sourceLabel(r.source)}</Badge>
                  <span className="text-text-muted">
                    Mã đề <b className="text-text-main">{r.examVersion ?? 'A'}</b>
                  </span>
                  {essayMode && (
                    <span className="text-text-muted">
                      Điểm TL <b className="text-text-main">{typeof r.essayScore === 'number' ? r.essayScore : '—'}</b>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 border-t border-surface-border/60 pt-2">
                  {sessionId && (r.source === 'omr' || r.source === 'qr_scan') && (
                    <button
                      type="button"
                      onClick={() => void openReview(r.studentId)}
                      className="btn btn-secondary btn-sm min-h-11 flex-1"
                      title="Xem ảnh rà soát được giữ trên thiết bị này"
                    >
                      <Eye size={14} /> Ảnh rà soát
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(r.id)}
                    className="btn btn-danger btn-sm min-h-11 flex-1"
                    title="Xóa kết quả (để quét lại hoặc nhập lại)"
                  >
                    <Trash2 size={14} /> Xóa
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-sm bg-surface-card text-text-main">
            <thead>
              <tr className="text-left text-xs font-bold text-text-muted border-b border-surface-border bg-surface-app">
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">#</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">Mã Số</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">Thiếu Nhi</th>
                {essayMode && <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">Điểm TL</th>}
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">Điểm</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">Mã đề</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider" scope="col">Nguồn</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-right" scope="col" aria-label="Thao tác">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/60 bg-surface-card">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={essayMode ? 8 : 7} className="text-center py-6 text-xs text-text-muted">
                    Không tìm thấy kết quả phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={r.id} className="bg-surface-card hover:bg-surface-app/70 transition-colors">
                    <td className="px-3 py-2.5 text-text-muted text-xs">{i + 1}</td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{r.studentCode}</td>
                    <td className="px-3 py-2.5">
                      <StudentName holyName={r.holyName} fullName={r.studentName} size="base" />
                    </td>
                    {essayMode && (
                      <td className="px-3 py-2.5 font-semibold text-xs">
                        {typeof r.essayScore === 'number' ? r.essayScore : <span className="text-text-muted">—</span>}
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-extrabold text-parish-primary text-sm">{r.score}</td>
                    <td className="px-3 py-2.5 font-black text-xs">{r.examVersion ?? 'A'}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={sourceTone(r.source)}>
                        {sourceLabel(r.source)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {sessionId && (r.source === 'omr' || r.source === 'qr_scan') && (
                        <button
                          type="button"
                          onClick={() => void openReview(r.studentId)}
                          className="mr-2 inline-flex items-center gap-1 text-xs text-parish-primary hover:underline font-semibold"
                          title="Xem ảnh rà soát được giữ trên thiết bị này"
                        >
                          <Eye size={13} /> Ảnh
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemove(r.id)}
                        className="inline-flex items-center gap-0.5 text-xs text-parish-danger hover:underline font-semibold"
                        title="Xóa kết quả (để quét lại hoặc nhập lại)"
                      >
                        <Trash2 size={12} /> Xóa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {snapshot && (
        <ModalPortal>
          <div role="dialog" aria-modal="true" aria-label="Ảnh rà soát phiếu" className="app-modal-layer--nested fixed inset-0 flex items-center justify-center bg-black/80 p-3" onClick={closeSnapshot}>
            <div ref={trapRef} className="flex max-h-[94vh] max-w-3xl flex-col overflow-hidden rounded-2xl bg-surface-card p-4 border border-surface-border shadow-2xl" onClick={event => event.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-text-muted">
                  Ảnh cục bộ · tự xóa lúc {new Date(snapshot.expiresAt).toLocaleString('vi-VN')}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={closeSnapshot}>
                  <X size={14} /> Đóng
                </button>
              </div>
              <img src={snapshot.dataUrl} alt="Phiếu đã quét để rà soát" className="min-h-0 max-h-[78vh] w-auto rounded-xl object-contain" />
              <button type="button" className="btn btn-danger btn-sm mt-3 self-end" onClick={() => void deleteReview()}>
                <Trash2 size={14} /> Xóa ảnh ngay
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}

export default ExamResultsTable
