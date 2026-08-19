import React, { useState, useMemo, useEffect } from 'react'
import {
  X, Printer, Download, Eye, EyeOff, LayoutGrid,
  Columns, Settings2, FileText, CheckCircle2, CheckSquare,
  Square, Award, Users, User, FileSpreadsheet
} from 'lucide-react'
import {
  buildExamPaperHtml,
  buildBatchExamPapersHtml,
  printExamPaper,
  printBatchExamPapers,
  type ExamPaperPrintOptions,
  type StudentSheetInfo
} from '../../utils/examSheets'
import { ReportExportService } from '../../services/reportExportService'
import { useSettingsStore } from '../../stores/settingsStore'
import { exportExamToWord, exportExamToExcel } from '../../utils/examExporter'
import type { ExamQuestion } from '../../types'

interface ExamPaperModalProps {
  isOpen: boolean
  onClose: () => void
  subject: string
  classLabel: string
  academicYear: string
  questions: ExamQuestion[]
  students?: StudentSheetInfo[]
  sessionId?: string
}

export const ExamPaperModal: React.FC<ExamPaperModalProps> = ({
  isOpen,
  onClose,
  subject,
  classLabel,
  academicYear,
  questions,
  students = [],
  sessionId = 'SESS-001',
}) => {
  const [showAnswerKey, setShowAnswerKey] = useState(false)
  const [layoutColumns, setLayoutColumns] = useState<1 | 2>(2)
  const [includeAnswerGrid, setIncludeAnswerGrid] = useState(true)
  const [includeGradingBox, setIncludeGradingBox] = useState(true)
  const [durationMinutes, setDurationMinutes] = useState(45)
  const [printMode, setPrintMode] = useState<'single' | 'batch'>('single')

  const parishName = useSettingsStore(s => s.settings.parishName) || 'Giáo Xứ Mẫu Tâm'
  const dioceseName = useSettingsStore(s => s.settings.dioceseName) || 'Giáo Phận Sài Gòn'

  const printOptions: ExamPaperPrintOptions = useMemo(() => ({
    parishName,
    dioceseName,
    subject,
    classLabel,
    academicYear,
    durationMinutes,
    questions,
    showAnswerKey,
    layoutColumns,
    includeAnswerGrid,
    includeGradingBox,
    sessionId,
  }), [parishName, dioceseName, subject, classLabel, academicYear, durationMinutes, questions, showAnswerKey, layoutColumns, includeAnswerGrid, includeGradingBox, sessionId])

  const previewHtml = useMemo(() => {
    if (!questions || questions.length === 0) return ''
    if (printMode === 'batch' && students.length > 0) {
      return buildBatchExamPapersHtml(students.slice(0, 2), printOptions)
    }
    return buildExamPaperHtml(printOptions)
  }, [printOptions, questions, printMode, students])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handlePrint = () => {
    if (printMode === 'batch' && students.length > 0) {
      printBatchExamPapers(students, printOptions)
    } else {
      printExamPaper(printOptions)
    }
  }

  const handleDownloadHtml = () => {
    if (!previewHtml) return
    const filename = `De_Thi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}.html`
    ReportExportService.downloadHTML(previewHtml, filename)
  }

  const handleDownloadWord = () => {
    exportExamToWord({
      parishName,
      dioceseName,
      subject,
      classLabel,
      academicYear,
      durationMinutes,
      questions,
      includeAnswerKey: showAnswerKey,
      includeExplanations: false,
      includeStudentInfo: true,
      includeQuickAnswerGrid: includeAnswerGrid,
      layoutColumns,
    })
  }

  const handleDownloadExcel = () => {
    exportExamToExcel({
      subject,
      classLabel,
      academicYear,
      questions,
      includeAnswerKey: true,
      includeExplanations: true,
    })
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="exam-paper-title" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-card rounded-2xl p-6 w-full max-w-6xl shadow-2xl h-[94vh] flex flex-col border border-surface-border" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border pb-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center font-bold">
              <FileText size={20} />
            </div>
            <div>
              <h3 id="exam-paper-title" className="font-black text-lg text-parish-primary m-0">In Đề Thi & Phiếu Làm Bài Gộp (Tiết Kiệm Giấy & OMR)</h3>
              <p className="text-xs text-text-muted m-0 mt-0.5">
                {subject} · Lớp {classLabel} · Niên khóa {academicYear} ({questions.length} câu hỏi) — Tích hợp 4 Marker OMR và mã QR quét chấm tự động
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 bg-surface-app rounded-xl border border-surface-border mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Chế độ in: Mẫu chung vs Theo danh sách học sinh */}
            {students.length > 0 && (
              <div className="flex items-center bg-surface-card rounded-lg border border-surface-border p-0.5">
                <button
                  type="button"
                  onClick={() => setPrintMode('batch')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                    printMode === 'batch' ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                  }`}
                  title="In cho từng học sinh, mỗi em có mã QR và họ tên riêng"
                >
                  <Users size={13} /> In Cả Lớp ({students.length} em)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMode('single')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                    printMode === 'single' ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                  }`}
                  title="In mẫu đề thi chung (học sinh tự điền họ tên/SBD)"
                >
                  <User size={13} /> Mẫu Chung
                </button>
              </div>
            )}

            {/* Answer Key Toggle */}
            <button
              type="button"
              onClick={() => setShowAnswerKey(!showAnswerKey)}
              className={`btn btn-sm text-xs font-bold flex items-center gap-1.5 ${
                showAnswerKey ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {showAnswerKey ? <Eye size={14} /> : <EyeOff size={14} />}
              {showAnswerKey ? 'Hiện Đáp Án (Bản Giáo Viên)' : 'Ẩn Đáp Án (Bản Học Sinh)'}
            </button>

            {/* Answer Grid Toggle */}
            <button
              type="button"
              onClick={() => setIncludeAnswerGrid(!includeAnswerGrid)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 ${
                includeAnswerGrid
                  ? 'bg-parish-primary-light border-parish-primary/30 text-parish-primary'
                  : 'bg-surface-card border-surface-border text-text-muted'
              }`}
              title="Khung tô đáp án nhanh (A B C D) ngay dưới tiêu đề"
            >
              {includeAnswerGrid ? <CheckSquare size={14} /> : <Square size={14} />}
              Khung Tô Đáp Án
            </button>

            {/* Grading Box Toggle */}
            <button
              type="button"
              onClick={() => setIncludeGradingBox(!includeGradingBox)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 ${
                includeGradingBox
                  ? 'bg-parish-primary-light border-parish-primary/30 text-parish-primary'
                  : 'bg-surface-card border-surface-border text-text-muted'
              }`}
              title="Khung Điểm và Lời Phê của Giáo lý viên"
            >
              {includeGradingBox ? <CheckSquare size={14} /> : <Square size={14} />}
              Khung Điểm & Lời Phê
            </button>

            {/* Layout Column Toggle */}
            <div className="flex items-center bg-surface-card rounded-lg border border-surface-border p-0.5">
              <button
                type="button"
                onClick={() => setLayoutColumns(2)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                  layoutColumns === 2 ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                }`}
                title="Bố cục 2 cột (tiết kiệm giấy A4)"
              >
                <Columns size={13} /> 2 Cột
              </button>
              <button
                type="button"
                onClick={() => setLayoutColumns(1)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                  layoutColumns === 1 ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                }`}
                title="Bố cục 1 cột"
              >
                <LayoutGrid size={13} /> 1 Cột
              </button>
            </div>

            {/* Duration Minutes Input */}
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <span>Thời gian:</span>
              <input
                type="number"
                min={5}
                max={180}
                value={durationMinutes}
                onChange={e => setDurationMinutes(Math.max(5, Number(e.target.value) || 45))}
                className="w-14 px-2 py-1 bg-surface-card border border-surface-border rounded-lg text-center font-bold text-text-main focus:outline-hidden"
              />
              <span>phút</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadWord}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
              title="Xuất bản đề thi Microsoft Word (.doc)"
            >
              <FileText size={14} className="text-blue-600" /> Xuất Word
            </button>
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
              title="Xuất bảng câu hỏi & đáp án Excel (.xlsx)"
            >
              <FileSpreadsheet size={14} className="text-emerald-600" /> Xuất Excel
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
            >
              <Download size={14} /> Tải HTML
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs font-bold shadow-xs"
            >
              <Printer size={14} /> {printMode === 'batch' && students.length > 0 ? `In Cả Lớp (${students.length} Bản)` : 'In Đề Thi & Phiếu Gộp'}
            </button>
          </div>
        </div>

        {/* Live Preview Iframe */}
        <div className="flex-1 min-h-0 bg-slate-200 dark:bg-slate-900 rounded-xl overflow-hidden border border-surface-border flex justify-center p-3">
          <div className="w-full max-w-[210mm] h-full bg-white shadow-xl rounded-sm overflow-hidden">
            <iframe
              srcDoc={previewHtml}
              title="Xem trước đề thi gộp phiếu trả lời"
              className="w-full h-full border-none bg-white"
            />
          </div>
        </div>

      </div>
    </div>
  )
}
