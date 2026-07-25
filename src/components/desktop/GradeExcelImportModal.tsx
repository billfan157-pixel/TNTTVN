import React, { useState, useMemo, useEffect } from 'react'
import { FileSpreadsheet, Upload, CheckCircle2, AlertCircle, AlertTriangle, X, Loader2, Save } from 'lucide-react'
import {
  parseGradeExcelFile,
  parseGradeText,
  type ParsedGradeImportResult,
  type ParsedGradeRow,
} from '../../utils/excelGradeParser'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { calculateGradeAverage } from '../../utils/grades'
import type { GradeRecord } from '../../types'
import * as Sentry from '@sentry/react'

interface Props {
  isOpen: boolean
  onClose: () => void
  initialClassId?: string
  initialSemester?: 1 | 2
}

export const GradeExcelImportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  initialClassId = 'all',
  initialSemester = 1,
}) => {
  const currentAcademicYear = useAcademicYearStore((s) => s.currentYear)
  const students = useStudentStore((s) => s.students)
  const classList = useClassStore((s) => s.getClassList())
  const batchSaveGrades = useGradeStore((s) => s.batchSaveGrades)

  const [selectedClassId, setSelectedClassId] = useState<string>(initialClassId)
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(initialSemester)
  const [pastedText, setPastedText] = useState('')
  const [parseResult, setParseResult] = useState<ParsedGradeImportResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSelectedClassId(initialClassId)
      setSelectedSemester(initialSemester)
      setPastedText('')
      setParseResult(null)
    }
  }, [isOpen, initialClassId, initialSemester])

  const targetStudents = useMemo(() => {
    if (selectedClassId === 'all') return students
    return students.filter((s) => s.classId === selectedClassId)
  }, [students, selectedClassId])

  if (!isOpen) return null

  const handleParseText = (text: string) => {
    setPastedText(text)
    if (!text.trim()) {
      setParseResult(null)
      return
    }
    const result = parseGradeText(text, targetStudents)
    setParseResult(result)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsProcessing(true)
    try {
      if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        const text = await file.text()
        handleParseText(text)
      } else {
        const result = await parseGradeExcelFile(file, targetStudents)
        setParseResult(result)
      }
    } catch (err) {
      Sentry.captureException(err)
      alert('Không thể đọc file Excel. Vui lòng kiểm tra định dạng file và thử lại!')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleApplyImport = async () => {
    if (!parseResult || parseResult.validCount === 0) return

    setIsSaving(true)
    try {
      const recordsToSave: (Partial<GradeRecord> & { studentId: string; semester: 1 | 2 })[] = []

      for (const row of parseResult.rows) {
        if (row.isValid && row.matchedStudent) {
          recordsToSave.push({
            studentId: row.matchedStudent.id,
            semester: selectedSemester,
            academicYear: currentAcademicYear,
            scoreOral: row.scoreOral,
            score15m: row.score15m,
            score1Period: row.score1Period,
            scoreMidterm: row.scoreMidterm,
            scoreFinal: row.scoreFinal,
            scoreDaoDuc: row.scoreDaoDuc,
            comments: row.comments || '',
          })
        }
      }

      batchSaveGrades(recordsToSave)
      alert(`Đã cập nhật bảng điểm cho ${recordsToSave.length} thiếu nhi thành công!`)
      onClose()
    } catch (err) {
      Sentry.captureException(err)
      alert('Có lỗi xảy ra khi lưu bảng điểm. Vui lòng thử lại!')
    } finally {
      setIsSaving(false)
    }
  }

  const selectedClassName = classList.find((c) => c.id === selectedClassId)?.name || 'Tất cả các lớp'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 rounded-xl border border-emerald-200">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-main m-0">Import Danh Sách Điểm Lớp Từ Excel</h2>
              <p className="text-xs text-text-muted mt-0.5 m-0">
                Tải file `.xlsx`, `.xls`, `.csv` hoặc dán trực tiếp từ bảng tính Excel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Target Filter Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-surface-hover/30 p-4 rounded-xl border border-surface-border">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Chọn Lớp Học</label>
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value)
                  setParseResult(null)
                }}
                className="w-full px-3 py-2 bg-white border border-surface-border rounded-lg text-sm text-text-main font-semibold focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
              >
                <option value="all">-- Tất cả các lớp ({students.length} em) --</option>
                {classList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Chọn Học Kỳ</label>
              <div className="flex bg-white p-1 rounded-lg border border-surface-border h-[38px]">
                <button
                  type="button"
                  onClick={() => setSelectedSemester(1)}
                  className={`flex-1 text-xs font-bold rounded-md transition-colors ${
                    selectedSemester === 1
                      ? 'bg-parish-primary text-white'
                      : 'text-text-secondary hover:bg-slate-100'
                  }`}
                >
                  Học Kỳ I
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSemester(2)}
                  className={`flex-1 text-xs font-bold rounded-md transition-colors ${
                    selectedSemester === 2
                      ? 'bg-parish-primary text-white'
                      : 'text-text-secondary hover:bg-slate-100'
                  }`}
                >
                  Học Kỳ II
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Năm Học</label>
              <input
                type="text"
                disabled
                value={currentAcademicYear}
                className="w-full px-3 py-2 bg-slate-100 border border-surface-border rounded-lg text-sm text-text-muted font-bold cursor-not-allowed"
              />
            </div>
          </div>

          {/* Import Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                Tải File Excel (.xlsx, .xls, .csv)
              </label>
              <label className="flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 text-text-main text-sm font-semibold rounded-xl cursor-pointer border-2 border-dashed border-emerald-300 transition-colors shadow-xs">
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                ) : (
                  <Upload className="w-5 h-5 text-emerald-600" />
                )}
                <span>{isProcessing ? 'Đang phân tích file...' : 'Chọn file Excel từ máy tính...'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isProcessing}
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
                Hoặc Dán Nội Dung Copy Từ Bảng Excel
              </label>
              <textarea
                value={pastedText}
                onChange={(e) => handleParseText(e.target.value)}
                placeholder="Dán các cột copy từ Excel tại đây... (Ví dụ: STT	Mã TN	Tên Thánh	Họ và Tên	Miệng	15P	1T	GK	CK	Đạo Đức)"
                rows={2}
                className="w-full px-3 py-1.5 bg-white border border-surface-border rounded-xl text-xs font-mono text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
              />
            </div>
          </div>

          {/* Summary Status Bar */}
          {parseResult && (
            <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 bg-slate-50 rounded-xl border border-surface-border text-xs">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-bold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {parseResult.validCount} Học Sinh Hợp Lệ
                </span>
                {parseResult.unmatchedCount > 0 && (
                  <span className="flex items-center gap-1.5 font-bold text-amber-700">
                    <AlertTriangle className="w-4 h-4 text-amber-500" /> {parseResult.unmatchedCount} Không Khớp Với Lớp
                  </span>
                )}
                {parseResult.errorCount > 0 && (
                  <span className="flex items-center gap-1.5 font-bold text-rose-700">
                    <AlertCircle className="w-4 h-4 text-rose-500" /> {parseResult.errorCount} Lỗi Dữ Liệu
                  </span>
                )}
              </div>
              <span className="text-text-muted font-medium">
                Tổng cộng: <strong>{parseResult.rows.length}</strong> dòng dữ liệu • Lớp target:{' '}
                <strong>{selectedClassName}</strong>
              </span>
            </div>
          )}

          {/* Preview Data Table */}
          {parseResult && parseResult.rows.length > 0 && (
            <div className="border border-surface-border rounded-xl max-h-72 overflow-y-auto overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-parish-primary text-white font-bold uppercase sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5 text-center">Trạng Thái</th>
                    <th className="p-2.5">Mã TN</th>
                    <th className="p-2.5">Tên Thánh & Họ Tên</th>
                    <th className="p-2.5 text-center">Miệng</th>
                    <th className="p-2.5 text-center">15P</th>
                    <th className="p-2.5 text-center">1 Tiết</th>
                    <th className="p-2.5 text-center">Giữa Kỳ</th>
                    <th className="p-2.5 text-center">Cuối Kỳ</th>
                    <th className="p-2.5 text-center">Đạo Đức</th>
                    <th className="p-2.5 text-center">ĐTB Dự Kiến</th>
                    <th className="p-2.5">Ghi Chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border bg-white">
                  {parseResult.rows.map((row: ParsedGradeRow, idx: number) => {
                    const avgRes = calculateGradeAverage({
                      scoreOral: row.scoreOral,
                      score15m: row.score15m,
                      score1Period: row.score1Period,
                      scoreMidterm: row.scoreMidterm,
                      scoreFinal: row.scoreFinal,
                    })

                    return (
                      <tr
                        key={idx}
                        className={
                          !row.matchedStudent
                            ? 'bg-amber-50/60'
                            : !row.isValid
                            ? 'bg-rose-50/60'
                            : idx % 2 === 0
                            ? 'bg-white hover:bg-slate-50'
                            : 'bg-slate-50/40 hover:bg-slate-100/50'
                        }
                      >
                        <td className="p-2 text-center">
                          {row.isValid ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300">
                              Hợp Lệ
                            </span>
                          ) : !row.matchedStudent ? (
                            <span
                              className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-300 cursor-help"
                              title={row.warnings.join(', ')}
                            >
                              Chưa Khớp
                            </span>
                          ) : (
                            <span
                              className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 rounded-full border border-rose-300 cursor-help"
                              title={row.errors.join(', ')}
                            >
                              Lỗi Điểm
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono text-text-muted">{row.matchedStudent?.code || row.studentCode || '—'}</td>
                        <td className="p-2">
                          <div className="font-bold text-slate-800">
                            {row.matchedStudent ? (
                              <span>
                                <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-xs mr-1 text-[11px]">
                                  {row.matchedStudent.holyName}
                                </span>
                                {row.matchedStudent.fullName}
                              </span>
                            ) : (
                              <span>
                                {row.holyName ? <span className="mr-1">{row.holyName}</span> : null}
                                {row.fullName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-center font-bold">{row.scoreOral ?? '—'}</td>
                        <td className="p-2 text-center font-bold">{row.score15m ?? '—'}</td>
                        <td className="p-2 text-center font-bold">{row.score1Period ?? '—'}</td>
                        <td className="p-2 text-center font-bold">{row.scoreMidterm ?? '—'}</td>
                        <td className="p-2 text-center font-bold">{row.scoreFinal ?? '—'}</td>
                        <td className="p-2 text-center font-bold">{row.scoreDaoDuc ?? '—'}</td>
                        <td className="p-2 text-center">
                          {avgRes.score !== null ? (
                            <span className="font-extrabold text-emerald-600">{avgRes.score}</span>
                          ) : (
                            <span className="text-text-muted italic">—</span>
                          )}
                        </td>
                        <td className="p-2 text-text-muted text-[11px] truncate max-w-[120px]">
                          {row.comments || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-surface-border bg-slate-50/50">
          <div className="text-xs text-text-muted font-medium">
            {parseResult && parseResult.validCount > 0 ? (
              <span>Sẵn sàng lưu điểm cho {parseResult.validCount} thiếu nhi đã được khớp.</span>
            ) : (
              <span>Vui lòng chọn file Excel hoặc dán dữ liệu điểm để xem trước.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-text-muted hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Hủy Bỏ
            </button>
            <button
              onClick={handleApplyImport}
              disabled={!parseResult || parseResult.validCount === 0 || isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Lưu {parseResult?.validCount || 0} Kết Quả Vào Hệ Thống</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
