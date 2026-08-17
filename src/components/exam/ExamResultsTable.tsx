import React from 'react'
import type { ExamResult } from '../../types'

interface ExamResultsTableProps {
  results: ExamResult[]
  onRemove: (resultId: string) => void
}

/**
 * Smart Exam Grading — ExamResultsTable: danh sách kết quả đã lưu của phiên.
 */
export const ExamResultsTable: React.FC<ExamResultsTableProps> = ({ results, onRemove }) => {
  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-text-muted">
        Chưa có kết quả nào — nhập nhanh bên trên hoặc in phiếu QR để quét (Phase 2).
      </div>
    )
  }

  const sorted = [...results].sort((a, b) => (a.studentCode || '').localeCompare(b.studentCode || ''))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm bg-surface-card text-text-main">
        <thead>
          <tr className="text-left text-xs font-bold text-text-muted border-b border-surface-border">
            <th className="py-2 pr-2" scope="col">#</th>
            <th className="py-2 pr-2" scope="col">Mã Số</th>
            <th className="py-2 pr-2" scope="col">Thiếu Nhi</th>
            <th className="py-2 pr-2" scope="col">Điểm</th>
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
              <td className="py-2 pr-2 font-bold text-parish-primary">{r.score}</td>
              <td className="py-2 pr-2">
                <span className="badge badge-neutral text-xs">{r.source === 'qr_scan' ? 'QR' : r.source === 'omr' ? 'OMR' : 'Nhập tay'}</span>
              </td>
              <td className="py-2 text-right">
                <button onClick={() => onRemove(r.id)} className="text-xs text-parish-danger hover:underline" title="Xóa kết quả (re-scan hoặc nhập lại)">
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
