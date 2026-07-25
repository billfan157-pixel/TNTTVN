import React, { useState } from 'react'
import { Upload, CheckCircle2, AlertCircle, X, Loader2, FileSpreadsheet, Clipboard } from 'lucide-react'
import { parseGradeFile, buildGradeRecords, type ParsedGradeRow } from '../../utils/excelImporter'
import { parseGradeText } from '../../utils/excelGradeParser'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { calculateGradeAverage } from '../../utils/grades'
import * as Sentry from '@sentry/react'

interface Props {
  isOpen: boolean
  onClose: () => void
  semester: 1 | 2
}

export const ExcelGradeImportModal: React.FC<Props> = ({ isOpen, onClose, semester }) => {
  const [parsedRows, setParsedRows] = useState<ParsedGradeRow[]>([])
  const [fileName, setFileName] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  const students = useStudentStore((s) => s.students)
  const batchSaveGrades = useGradeStore((s) => s.batchSaveGrades)
  const academicYear = useAcademicYearStore((s) => s.currentYear)

  if (!isOpen) return null

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setPastedText('')

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (!result || !(result instanceof ArrayBuffer)) return
      const rows = parseGradeFile(result, students)
      setParsedRows(rows)
    }
    reader.readAsArrayBuffer(file)
  }

  const handlePasteText = (text: string) => {
    setPastedText(text)
    if (!text.trim()) {
      setParsedRows([])
      return
    }
    const result = parseGradeText(text, students)
    const convertedRows: ParsedGradeRow[] = result.rows.map((r, idx) => ({
      rowNum: idx + 1,
      studentCode: r.studentCode || r.matchedStudent?.code || '',
      studentName: r.matchedStudent
        ? `${r.matchedStudent.holyName || ''} ${r.matchedStudent.fullName || ''}`.trim()
        : r.fullName,
      matchedStudent: r.matchedStudent || null,
      scoreOral: r.scoreOral,
      score15m: r.score15m,
      score1Period: r.score1Period,
      scoreMidterm: r.scoreMidterm,
      scoreFinal: r.scoreFinal,
      scoreDaoDuc: r.scoreDaoDuc,
      comments: r.comments,
      isValid: r.isValid,
      errors: r.errors,
    }))
    setParsedRows(convertedRows)
  }

  const handleImport = async () => {
    setIsImporting(true)
    try {
      const records = buildGradeRecords(parsedRows, semester, academicYear)
      batchSaveGrades(records)
      alert(`Đã nhập thành công ${records.length} bản ghi điểm cho Học Kỳ ${semester}!`)
      onClose()
    } catch (err) {
      Sentry.captureException(err)
      alert('Có lỗi xảy ra khi nhập dữ liệu điểm. Vui lòng thử lại!')
    } finally {
      setIsImporting(false)
    }
  }

  const validCount = parsedRows.filter((r) => r.isValid).length
  const invalidCount = parsedRows.filter((r) => !r.isValid).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-lg">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-main">Import Bảng Điểm Lớp Từ Excel</h2>
              <p className="text-xs text-text-muted">
                Hỗ trợ file `.xlsx`, `.xls`, `.csv` hoặc dán trực tiếp — Học Kỳ {semester} ({academicYear})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Options: Upload vs Paste */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                Option 1: Tải File Excel Từ Máy Tính
              </label>
              <label className="flex items-center gap-2 px-4 py-2.5 bg-surface-hover hover:bg-surface-hover/80 text-text-main text-sm font-medium rounded-lg cursor-pointer border border-surface-border transition-colors">
                <Upload className="w-4 h-4 text-parish-primary" />
                <span className="truncate">{fileName || 'Chọn file .xlsx / .xls / .csv...'}</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
              </label>
              <p className="mt-1 text-[11px] text-text-muted">
                Cần có cột "Mã TN" / "Họ và Tên" và các cột điểm (Miệng, 15P, 1 Tiết, Giữa Kỳ, Cuối Kỳ, Đạo Đức)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                Option 2: Dán Copy Trực Tiếp Từ Excel
              </label>
              <div className="relative">
                <textarea
                  value={pastedText}
                  onChange={(e) => handlePasteText(e.target.value)}
                  placeholder="Dán các cột copy từ bảng Excel vào đây... (Ví dụ: Mã TN	Họ và Tên	Miệng	15P	1T	GK	CK	Đạo Đức)"
                  rows={2}
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-xs font-mono text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                />
              </div>
            </div>
          </div>

          {/* Validation Summary */}
          {parsedRows.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-surface-hover/40 rounded-lg border border-surface-border">
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> {validCount} Dòng Hợp Lệ
                </span>
                {invalidCount > 0 && (
                  <span className="flex items-center gap-1 text-rose-600 font-semibold">
                    <AlertCircle className="w-4 h-4" /> {invalidCount} Dòng Không Khớp Học Sinh Hoặc Lỗi
                  </span>
                )}
              </div>
              <span className="text-xs text-text-muted">Tổng số: {parsedRows.length} dòng</span>
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="overflow-x-auto border border-surface-border rounded-lg max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-surface-hover text-text-muted uppercase font-semibold sticky top-0">
                  <tr>
                    <th className="p-2 border-b border-surface-border text-center">Trạng thái</th>
                    <th className="p-2 border-b border-surface-border">Học sinh</th>
                    <th className="p-2 border-b border-surface-border text-center">Miệng</th>
                    <th className="p-2 border-b border-surface-border text-center">15 Phút</th>
                    <th className="p-2 border-b border-surface-border text-center">1 Tiết</th>
                    <th className="p-2 border-b border-surface-border text-center">Giữa Kỳ</th>
                    <th className="p-2 border-b border-surface-border text-center">Cuối Kỳ</th>
                    <th className="p-2 border-b border-surface-border text-center">Đạo Đức</th>
                    <th className="p-2 border-b border-surface-border text-center">ĐTB Dự Kiến</th>
                    <th className="p-2 border-b border-surface-border">Ghi Chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {parsedRows.map((r, idx) => {
                    const name = r.matchedStudent
                      ? `${r.matchedStudent.holyName || ''} ${r.matchedStudent.fullName || ''}`.trim()
                      : r.studentName || `Dòng ${r.rowNum}`

                    const avgRes = calculateGradeAverage({
                      scoreOral: r.scoreOral,
                      score15m: r.score15m,
                      score1Period: r.score1Period,
                      scoreMidterm: r.scoreMidterm,
                      scoreFinal: r.scoreFinal,
                    })

                    return (
                      <tr key={idx} className={r.isValid ? 'hover:bg-surface-hover/20' : 'bg-rose-500/10'}>
                        <td className="p-2 text-center">
                          {r.isValid ? (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-full">
                              OK
                            </span>
                          ) : (
                            <span
                              className="px-2 py-0.5 text-[10px] font-semibold bg-rose-100 dark:bg-rose-950 text-rose-600 rounded-full"
                              title={r.errors.join(', ')}
                            >
                              {r.errors[0] || 'Lỗi'}
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-semibold text-text-main whitespace-nowrap">{name}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.scoreOral ?? '—'}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.score15m ?? '—'}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.score1Period ?? '—'}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.scoreMidterm ?? '—'}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.scoreFinal ?? '—'}</td>
                        <td className="p-2 text-center text-text-main font-bold">{r.scoreDaoDuc ?? '—'}</td>
                        <td className="p-2 text-center">
                          {avgRes.score !== null ? (
                            <span className="font-extrabold text-emerald-600">{avgRes.score}</span>
                          ) : (
                            <span className="text-text-muted italic">—</span>
                          )}
                        </td>
                        <td className="p-2 text-text-muted max-w-[150px] truncate">{r.comments || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-border bg-surface-hover/30">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:bg-surface-hover transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleImport}
            disabled={validCount === 0 || isImporting}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors"
          >
            {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Nhập {validCount} Bản Ghi Điểm</span>
          </button>
        </div>
      </div>
    </div>
  )
}
