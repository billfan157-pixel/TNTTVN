import React, { useState, useMemo, useEffect } from 'react'
import {
  X, Printer, Download, Eye, EyeOff, LayoutGrid,
  Columns, Settings2, FileText, CheckCircle2, CheckSquare,
  Square, Award, Users, User, FileSpreadsheet, Layers3, Globe
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
import { exportExamToWord, exportExamToExcel, exportExamToHtml } from '../../utils/examExporter'
import { EXAM_VERSION_CODES, normalizeAnswerVariants } from '../../lib/examVariants'
import type { ExamQuestion, ExamAnswerVariants, ExamVersionCode, MultipleChoiceOption } from '../../types'

interface ExamPaperModalProps {
  isOpen: boolean
  onClose: () => void
  subject: string
  classLabel: string
  academicYear: string
  questions: ExamQuestion[]
  students?: StudentSheetInfo[]
  sessionId?: string
  answerKey?: Record<number, MultipleChoiceOption>
  answerVariants?: Partial<ExamAnswerVariants>
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
  answerKey,
  answerVariants,
}) => {
  const [showAnswerKey, setShowAnswerKey] = useState(false)
  const [includeExplanations, setIncludeExplanations] = useState(true)
  const [layoutColumns, setLayoutColumns] = useState<1 | 2>(2)
  const [includeAnswerGrid, setIncludeAnswerGrid] = useState(true)
  const [includeGradingBox, setIncludeGradingBox] = useState(true)
  const [durationMinutes, setDurationMinutes] = useState(45)
  const [printMode, setPrintMode] = useState<'single' | 'batch'>('single')
  const [selectedVersion, setSelectedVersion] = useState<ExamVersionCode>('A')

  const parishName = useSettingsStore(s => s.settings.parishName) || 'Giáo Xứ Mẫu Tâm'
  const dioceseName = useSettingsStore(s => s.settings.dioceseName) || 'Giáo Phận Sài Gòn'

  const variants = useMemo(() => {
    return normalizeAnswerVariants(answerVariants, answerKey, questions.length)
  }, [answerVariants, answerKey, questions.length])

  const availableVersions = useMemo(() => {
    return EXAM_VERSION_CODES.filter(code => Boolean(variants[code]))
  }, [variants])

  const effectiveQuestions = useMemo(() => {
    const activeKey = variants[selectedVersion] || answerKey || {}
    return questions.map((q, idx) => {
      const qNum = q.index || idx + 1
      return {
        ...q,
        index: qNum,
        correctOption: activeKey[qNum] || q.correctOption || 'A',
      }
    })
  }, [questions, variants, selectedVersion, answerKey])

  const printOptions: ExamPaperPrintOptions = useMemo(() => ({
    parishName,
    dioceseName,
    subject,
    classLabel,
    academicYear,
    durationMinutes,
    questions: effectiveQuestions,
    showAnswerKey,
    includeExplanations,
    layoutColumns,
    includeAnswerGrid,
    includeGradingBox,
    sessionId,
    examVersion: selectedVersion,
  }), [parishName, dioceseName, subject, classLabel, academicYear, durationMinutes, effectiveQuestions, showAnswerKey, includeExplanations, layoutColumns, includeAnswerGrid, includeGradingBox, sessionId, selectedVersion])

  const previewHtml = useMemo(() => {
    if (!effectiveQuestions || effectiveQuestions.length === 0) return ''
    if (printMode === 'batch' && students.length > 0) {
      return buildBatchExamPapersHtml(students.slice(0, 2), printOptions)
    }
    return buildExamPaperHtml(printOptions)
  }, [printOptions, effectiveQuestions, printMode, students])

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

  const handleDownloadPdf = () => {
    if (!previewHtml) return
    const filename = `De_Thi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}_Ma${selectedVersion}`
    ReportExportService.exportPdf(previewHtml, filename)
  }

  const handleDownloadHtml = () => {
    if (!previewHtml) return
    const filename = `De_Thi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}_Ma${selectedVersion}.html`
    ReportExportService.downloadHTML(previewHtml, filename)
    useToastStore.getState().addToast(`Đã xuất file HTML đề thi: ${filename}`, 'success')
  }

  const handleDownloadWord = () => {
    exportExamToWord({
      parishName,
      dioceseName,
      subject,
      classLabel,
      academicYear,
      durationMinutes,
      questions: effectiveQuestions,
      selectedVersion,
      includeAnswerKey: showAnswerKey,
      includeExplanations,
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
      questions: effectiveQuestions,
      selectedVersion,
      answerVariants,
      answerKey,
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
              <h3 id="exam-paper-title" className="font-black text-lg text-parish-primary m-0">In & Xuất Đề Thi Gộp Chuẩn OMR</h3>
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

            {/* Mã Đề Selector (nếu có cấu hình nhiều mã đề) */}
            {availableVersions.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-text-muted font-semibold flex items-center gap-1">
                  <Layers3 size={13} /> Mã Đề:
                </span>
                <div className="flex bg-surface-card rounded-lg border border-surface-border p-0.5">
                  {availableVersions.map(code => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setSelectedVersion(code)}
                      className={`px-2 py-0.5 rounded text-xs font-black transition-all ${
                        selectedVersion === code ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
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

            {/* Explanations Toggle (khi bật đáp án) */}
            {showAnswerKey && (
              <button
                type="button"
                onClick={() => setIncludeExplanations(!includeExplanations)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 ${
                  includeExplanations
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                    : 'bg-surface-card border-surface-border text-text-muted'
                }`}
                title="Kèm lời giải thích và hướng dẫn chấm chi tiết"
              >
                {includeExplanations ? <CheckSquare size={14} /> : <Square size={14} />}
                💡 Lời Giải Chi Tiết
              </button>
            )}

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

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadWord}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
              title="Xuất bản đề thi Microsoft Word (.doc) chuẩn OMR"
            >
              <FileText size={14} className="text-blue-600" /> Xuất Word
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
              title="Xuất trực tiếp file PDF chất lượng cao"
            >
              <Printer size={14} className="text-rose-600" /> Xuất PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
              title="Tải file HTML độc lập để mở trên trình duyệt và in"
            >
              <Globe size={14} className="text-sky-600" /> Tải HTML
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
