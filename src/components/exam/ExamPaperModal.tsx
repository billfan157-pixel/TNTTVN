import React, { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Printer, Eye, EyeOff, LayoutGrid,
  Columns, FileText, CheckSquare,
  Square, Users, User, FileSpreadsheet, Layers3, Globe,
  QrCode, ClipboardList, SlidersHorizontal, ChevronDown, Download,
  ZoomIn, ZoomOut, CheckCircle2, BookOpen
} from 'lucide-react'
import {
  buildExamPaperHtml,
  buildBatchExamPapersHtml,
  printExamPaper,
  printBatchExamPapers,
  buildBatchAnswerSheetsHtml,
  printBatchAnswerSheets,
  printQrSheet,
  buildQrSheetHtml,
  type ExamPaperPrintOptions,
  type StudentSheetInfo,
  type BatchAnswerSheetParams
} from '../../utils/examSheets'
import { generateExamQrCodes } from '../../lib/qr'
import { ReportExportService, sanitizeFilename } from '../../services/reportExportService'
import { useSettingsStore } from '../../stores/settingsStore'
import { useToastStore } from '../../stores/toastStore'
import { exportExamToWord, exportExamToExcel } from '../../utils/examExporter'
import { EXAM_VERSION_CODES, normalizeAnswerVariants } from '../../lib/examVariants'
import { assertContiguousQuestionIndexes, prepareExamDocumentForOutput } from '../../lib/examPrintSafety'
import type { ExamQuestion, ExamAnswerVariants, ExamType, ExamVersionCode, MultipleChoiceOption } from '../../types'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { useEffectiveMode } from '../../hooks/useEffectiveMode'

export type ExamDocType = 'exam_paper' | 'question_reader' | 'answer_sheet' | 'qr_sheet'

interface ExamPaperModalProps {
  isOpen: boolean
  onClose: () => void
  subject: string
  classLabel: string
  academicYear: string
  questions?: ExamQuestion[]
  students?: StudentSheetInfo[]
  sessionId?: string
  answerKey?: Record<number, MultipleChoiceOption>
  answerVariants?: Partial<ExamAnswerVariants>
  examType?: ExamType
  maxScore?: number
  questionCount?: number
  scoreTypeLabel?: string
  initialDocType?: 'exam_paper' | 'answer_sheet' | 'qr_sheet'
}

export const ExamPaperModal: React.FC<ExamPaperModalProps> = ({
  isOpen,
  onClose,
  subject,
  classLabel,
  academicYear,
  questions = [],
  students = [],
  sessionId = 'SESS-001',
  answerKey,
  answerVariants,
  examType = 'multiple_choice',
  maxScore = 10,
  questionCount = 20,
  scoreTypeLabel = 'Kiểm Tra',
  initialDocType = 'exam_paper',
}) => {
  const effectiveMode = useEffectiveMode()
  const isMobile = effectiveMode === 'mobile'

  const [docType, setDocType] = useState<ExamDocType>(
    initialDocType === 'exam_paper' && isMobile ? 'question_reader' : initialDocType
  )
  const [showAnswerKey, setShowAnswerKey] = useState(false)
  const [includeExplanations, setIncludeExplanations] = useState(true)
  const [layoutColumns, setLayoutColumns] = useState<1 | 2>(2)
  const [includeAnswerGrid, setIncludeAnswerGrid] = useState(true)
  const [includeGradingBox, setIncludeGradingBox] = useState(true)
  const [durationMinutes, setDurationMinutes] = useState(45)
  const [printMode, setPrintMode] = useState<'single' | 'batch'>('single')
  const [selectedVersion, setSelectedVersion] = useState<ExamVersionCode>('A')
  const [showMobileOptions, setShowMobileOptions] = useState(false)
  const [mobileZoom, setMobileZoom] = useState<'fit' | '100'>('fit')
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(360)
  const { dialogRef, titleId } = useAccessibleDialog(isOpen, onClose)

  const parishName = useSettingsStore(s => s.settings.parishName) || 'Giáo Xứ Mẫu Tâm'
  const dioceseName = useSettingsStore(s => s.settings.dioceseName) || 'Giáo Phận Sài Gòn'

  // Đo chiều rộng khung chứa thực tế trên mobile để scale A4 chính xác
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width)
        }
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [isOpen])

  const variants = useMemo(() => {
    return normalizeAnswerVariants(answerVariants, answerKey, questions.length)
  }, [answerVariants, answerKey, questions.length])

  const availableVersions = useMemo(() => {
    const list = EXAM_VERSION_CODES.filter(code => Boolean(variants[code]))
    return list.length > 0 ? list : (['A'] as ExamVersionCode[])
  }, [variants])

  const effectiveSelectedVersion = availableVersions.includes(selectedVersion)
    ? selectedVersion
    : (availableVersions[0] ?? 'A')

  useEffect(() => {
    if (selectedVersion !== effectiveSelectedVersion) {
      setSelectedVersion(effectiveSelectedVersion)
    }
  }, [selectedVersion, effectiveSelectedVersion])

  // P0 Guard: Tự động chuyển về Mẫu Chung (single) khi bật Hiện Đáp Án
  useEffect(() => {
    if (showAnswerKey && printMode === 'batch') {
      setPrintMode('single')
    }
  }, [showAnswerKey, printMode])

  const questionIntegrityError = useMemo(() => {
    if (questions.length === 0) return null
    try {
      assertContiguousQuestionIndexes(questions)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Thứ tự câu hỏi không hợp lệ cho OMR.'
    }
  }, [questions])

  const effectiveQuestions = useMemo(() => {
    const activeKey = variants[effectiveSelectedVersion] || answerKey || {}
    const sorted = [...questions].sort((a, b) => (a.index || 0) - (b.index || 0))
    return sorted.map((q, idx) => {
      const qNum = q.index || idx + 1
      return {
        ...q,
        index: qNum,
        correctOption: activeKey[qNum] || q.correctOption || 'A',
      }
    })
  }, [questions, variants, effectiveSelectedVersion, answerKey])

  const printOptions: ExamPaperPrintOptions = useMemo(() => ({
    parishName,
    dioceseName,
    subject,
    scoreTypeLabel: scoreTypeLabel || 'Kiểm Tra',
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
    examVersion: effectiveSelectedVersion,
  }), [parishName, dioceseName, subject, scoreTypeLabel, classLabel, academicYear, durationMinutes, effectiveQuestions, showAnswerKey, includeExplanations, layoutColumns, includeAnswerGrid, includeGradingBox, sessionId, effectiveSelectedVersion])

  const sampleStudent: StudentSheetInfo = useMemo(() => ({
    id: 'GENERIC',
    code: '',
    name: '',
  }), [])

  const effectiveStudents = useMemo(() => (
    students.length > 0 ? students : [sampleStudent]
  ), [students, sampleStudent])

  const batchAnswerSheetParams: BatchAnswerSheetParams = useMemo(() => ({
    sessionId,
    subject,
    scoreTypeLabel: scoreTypeLabel || 'Kiểm Tra',
    classLabel,
    maxScore: maxScore || 10,
    examType: examType || 'multiple_choice',
    questionCount: questionCount || questions.length || 20,
    examVersion: effectiveSelectedVersion,
  }), [sessionId, subject, scoreTypeLabel, classLabel, maxScore, examType, questionCount, questions.length, effectiveSelectedVersion])

  const qrSvgs = useMemo(() => {
    return generateExamQrCodes(sessionId, effectiveStudents).map((q, i) => ({
      ...q,
      name: effectiveStudents[i].name,
      code: effectiveStudents[i].code,
    }))
  }, [sessionId, effectiveStudents])

  const previewHtml = useMemo(() => {
    if (docType === 'answer_sheet') {
      if (printMode === 'batch' && students.length > 0) {
        return prepareExamDocumentForOutput(buildBatchAnswerSheetsHtml(students.slice(0, 2), batchAnswerSheetParams))
      }
      return prepareExamDocumentForOutput(buildBatchAnswerSheetsHtml([sampleStudent], batchAnswerSheetParams))
    }

    if (docType === 'qr_sheet') {
      return buildQrSheetHtml(`${classLabel} — ${subject} (Thẻ Mã QR)`, qrSvgs)
    }

    if (questionIntegrityError) {
      return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#b91c1c;"><h3>Không thể tạo phiếu OMR an toàn.</h3><p>${questionIntegrityError}</p><p>Hãy sửa thứ tự câu thành duy nhất và liên tục 1..N.</p></body></html>`
    }

    if (effectiveQuestions.length === 0) {
      return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#64748b;"><h3>Chưa có nội dung câu hỏi cho đề thi.</h3><p>Vui lòng chuyển qua tab <b>Phiếu Trả Lời Rời A4</b> hoặc <b>Thẻ Mã QR</b> để xem phiếu làm bài.</p></body></html>`
    }

    const rawHtml = printMode === 'batch' && students.length > 0
      ? buildBatchExamPapersHtml(students.slice(0, 2), printOptions)
      : buildExamPaperHtml(printOptions)
    return prepareExamDocumentForOutput(rawHtml)
  }, [docType, printMode, students, sampleStudent, batchAnswerSheetParams, classLabel, subject, qrSvgs, effectiveQuestions, printOptions, questionIntegrityError])

  if (!isOpen) return null

  const guardExamPaperIntegrity = (): boolean => {
    if (docType === 'answer_sheet' || docType === 'qr_sheet') return true
    if (!questionIntegrityError) return true
    useToastStore.getState().addToast(questionIntegrityError, 'error', 7000)
    return false
  }

  const handlePrint = () => {
    if (!guardExamPaperIntegrity()) return
    if (docType === 'answer_sheet') {
      const answerSheetStudents = printMode === 'batch' && students.length > 0 ? students : [sampleStudent]
      printBatchAnswerSheets(answerSheetStudents, batchAnswerSheetParams)
      return
    }
    if (docType === 'qr_sheet') {
      printQrSheet(`${classLabel} — ${subject} (Thẻ Mã QR)`, qrSvgs)
      return
    }
    if (printMode === 'batch' && students.length > 0) {
      printBatchExamPapers(students, printOptions)
    } else {
      printExamPaper(printOptions)
    }
  }

  const handleDownloadPdf = () => {
    if (!guardExamPaperIntegrity()) return
    const isBatch = printMode === 'batch' && students.length > 0

    if (docType === 'answer_sheet') {
      const htmlToExport = buildBatchAnswerSheetsHtml(isBatch ? students : [sampleStudent], batchAnswerSheetParams)
      const filename = sanitizeFilename(`Phieu_Tra_Loi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}_${isBatch ? `CaLop_${students.length}Em` : `Ma${effectiveSelectedVersion}`}`)
      ReportExportService.exportPdf(htmlToExport, filename)
      return
    }

    if (docType === 'qr_sheet') {
      const htmlToExport = buildQrSheetHtml(`${classLabel} — ${subject} (Thẻ Mã QR)`, qrSvgs)
      const filename = sanitizeFilename(`The_Ma_QR_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}`)
      ReportExportService.exportPdf(htmlToExport, filename)
      return
    }

    const htmlToExport = isBatch
      ? buildBatchExamPapersHtml(students, printOptions)
      : buildExamPaperHtml(printOptions)
    if (!htmlToExport) return
    const filename = sanitizeFilename(`De_Thi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}_${isBatch ? `CaLop_${students.length}Em` : `Ma${effectiveSelectedVersion}`}`)
    ReportExportService.exportPdf(htmlToExport, filename)
  }

  const handleDownloadHtml = () => {
    if (!guardExamPaperIntegrity()) return
    const isBatch = printMode === 'batch' && students.length > 0

    if (docType === 'answer_sheet') {
      const htmlToExport = buildBatchAnswerSheetsHtml(isBatch ? students : [sampleStudent], batchAnswerSheetParams)
      const filename = sanitizeFilename(`Phieu_Tra_Loi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}_${isBatch ? `CaLop_${students.length}Em` : `Ma${effectiveSelectedVersion}`}.html`)
      ReportExportService.downloadHTML(htmlToExport, filename)
      useToastStore.getState().addToast(`Đã xuất file HTML Phiếu Trả Lời: ${filename}`, 'success')
      return
    }

    if (docType === 'qr_sheet') {
      const htmlToExport = buildQrSheetHtml(`${classLabel} — ${subject} (Thẻ Mã QR)`, qrSvgs)
      const filename = sanitizeFilename(`The_Ma_QR_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}.html`)
      ReportExportService.downloadHTML(htmlToExport, filename)
      useToastStore.getState().addToast(`Đã xuất file HTML Thẻ Mã QR: ${filename}`, 'success')
      return
    }

    const htmlToExport = isBatch
      ? buildBatchExamPapersHtml(students, printOptions)
      : buildExamPaperHtml(printOptions)
    if (!htmlToExport) return
    const filename = sanitizeFilename(`De_Thi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}_${isBatch ? `CaLop_${students.length}Em` : `Ma${effectiveSelectedVersion}`}.html`)
    ReportExportService.downloadHTML(htmlToExport, filename)
    useToastStore.getState().addToast(`Đã xuất file HTML đề thi (${isBatch ? `${students.length} học viên` : 'Mẫu chung'}): ${filename}`, 'success')
  }

  const handleDownloadWord = () => {
    if (!guardExamPaperIntegrity()) return
    const isBatch = printMode === 'batch' && students.length > 0
    exportExamToWord({
      parishName,
      dioceseName,
      subject,
      classLabel,
      academicYear,
      durationMinutes,
      questions: effectiveQuestions,
      selectedVersion: effectiveSelectedVersion,
      answerVariants,
      answerKey,
      includeAnswerKey: showAnswerKey,
      includeExplanations,
      includeStudentInfo: true,
      includeQuickAnswerGrid: includeAnswerGrid,
      layoutColumns,
      sessionId,
      students: isBatch ? students : undefined,
    })
  }

  const handleDownloadExcel = () => {
    void exportExamToExcel({
      subject,
      classLabel,
      academicYear,
      questions: effectiveQuestions,
      selectedVersion: effectiveSelectedVersion,
      answerVariants,
      answerKey,
      includeAnswerKey: true,
      includeExplanations: true,
    }).catch(console.error)
  }

  // Tính toán scale factor để trang A4 (794px) vừa khít chiều rộng điện thoại
  const a4Scale = Math.min(1, Math.max(0.35, (containerWidth - 12) / 794))

  const modalContent = (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[1100] flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-surface-card w-full shadow-2xl flex flex-col border border-surface-border ${
          isMobile
            ? 'h-full max-h-dvh rounded-none p-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]'
            : 'max-w-6xl h-[94vh] rounded-2xl p-4 sm:p-6'
        }`}
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border pb-2 sm:pb-3 mb-2 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center font-bold shrink-0">
              {isMobile ? (
                <BookOpen size={18} />
              ) : (
                <>
                  {docType === 'exam_paper' && <FileText size={20} />}
                  {docType === 'answer_sheet' && <ClipboardList size={20} />}
                  {docType === 'qr_sheet' && <QrCode size={20} />}
                </>
              )}
            </div>
            <div className="min-w-0">
              <h3 id={titleId} className="font-black text-sm sm:text-lg text-parish-primary m-0 truncate">
                {isMobile ? 'Xem Đề Thi & Tài Liệu' : 'In & Xuất Tài Liệu Kiểm Tra'}
              </h3>
              <p className="text-[11px] sm:text-xs text-text-muted m-0 truncate">
                {subject} · Lớp {classLabel} · Niên khóa {academicYear}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            {isMobile && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                title="Tải bản PDF về điện thoại"
              >
                <Download size={13} /> PDF
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Đóng cửa sổ"
              className="min-h-9 min-w-9 p-1.5 rounded-xl text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors flex items-center justify-center"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Document Type Selector Tabs */}
        {isMobile ? (
          <div className="grid grid-cols-4 gap-1 p-1 bg-surface-app rounded-xl border border-surface-border mb-2 shrink-0 text-[11px]">
            <button
              type="button"
              onClick={() => setDocType('question_reader')}
              className={`py-1.5 px-1 rounded-lg font-bold transition-all flex items-center justify-center gap-1 truncate ${
                docType === 'question_reader'
                  ? 'bg-parish-primary text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <BookOpen size={12} className="shrink-0" />
              <span className="truncate">Đọc Đề</span>
            </button>
            <button
              type="button"
              onClick={() => setDocType('exam_paper')}
              className={`py-1.5 px-1 rounded-lg font-bold transition-all flex items-center justify-center gap-1 truncate ${
                docType === 'exam_paper'
                  ? 'bg-parish-primary text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <FileText size={12} className="shrink-0" />
              <span className="truncate">Đề A4</span>
            </button>
            <button
              type="button"
              onClick={() => setDocType('answer_sheet')}
              className={`py-1.5 px-1 rounded-lg font-bold transition-all flex items-center justify-center gap-1 truncate ${
                docType === 'answer_sheet'
                  ? 'bg-parish-primary text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <ClipboardList size={12} className="shrink-0" />
              <span className="truncate">Phiếu A4</span>
            </button>
            <button
              type="button"
              onClick={() => setDocType('qr_sheet')}
              className={`py-1.5 px-1 rounded-lg font-bold transition-all flex items-center justify-center gap-1 truncate ${
                docType === 'qr_sheet'
                  ? 'bg-parish-primary text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <QrCode size={12} className="shrink-0" />
              <span className="truncate">Thẻ QR</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 p-1 bg-surface-app rounded-xl border border-surface-border mb-3 shrink-0">
            <button
              type="button"
              onClick={() => setDocType('exam_paper')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                docType === 'exam_paper'
                  ? 'bg-parish-primary text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <FileText size={15} /> 1. Đề Thi & Phiếu Gộp
            </button>
            <button
              type="button"
              onClick={() => setDocType('answer_sheet')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                docType === 'answer_sheet'
                  ? 'bg-parish-primary text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <ClipboardList size={15} /> 2. Phiếu Trả Lời Rời A4
            </button>
            <button
              type="button"
              onClick={() => setDocType('qr_sheet')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                docType === 'qr_sheet'
                  ? 'bg-parish-primary text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <QrCode size={15} /> 3. Thẻ Mã QR Học Sinh
            </button>
          </div>
        )}

        {/* Toolbar Controls */}
        {isMobile ? (
          /* ================= MOBILE CONTROLS (TỐI GIẢN 1 HÀNG, KHÔNG IN ẤN) ================= */
          <div className="flex flex-col gap-1.5 mb-2 shrink-0">
            <div className="flex items-center justify-between gap-1.5 p-1.5 bg-surface-app rounded-xl border border-surface-border overflow-x-auto">
              
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Chế độ xem: Theo lớp vs Mẫu chung (chỉ áp dụng khi xem A4 sheet) */}
                {docType !== 'qr_sheet' && docType !== 'question_reader' && students.length > 0 && (
                  <div className="flex items-center bg-surface-card rounded-lg border border-surface-border p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (!showAnswerKey) setPrintMode('batch')
                      }}
                      disabled={showAnswerKey}
                      className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                        showAnswerKey
                          ? 'opacity-40 cursor-not-allowed text-text-muted'
                          : printMode === 'batch'
                            ? 'bg-parish-primary text-white'
                            : 'text-text-muted hover:text-text-main'
                      }`}
                      title="Xem theo từng học sinh trong lớp"
                    >
                      <Users size={12} /> Lớp ({students.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintMode('single')}
                      className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                        printMode === 'single' ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                      }`}
                      title="Xem mẫu chung"
                    >
                      <User size={12} /> Mẫu Chung
                    </button>
                  </div>
                )}

                {/* Mã Đề Selector */}
                {docType !== 'qr_sheet' && availableVersions.length > 1 && (
                  <div className="flex items-center bg-surface-card rounded-lg border border-surface-border p-0.5">
                    <span className="text-[11px] text-text-muted font-bold px-1 flex items-center">
                      <Layers3 size={11} className="mr-0.5" /> Mã:
                    </span>
                    {availableVersions.map(code => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setSelectedVersion(code)}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-black transition-all ${
                          effectiveSelectedVersion === code ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                )}

                {/* Answer Key Toggle */}
                {(docType === 'exam_paper' || docType === 'question_reader') && (
                  <button
                    type="button"
                    onClick={() => setShowAnswerKey(!showAnswerKey)}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-1 ${
                      showAnswerKey
                        ? 'bg-parish-primary text-white border-parish-primary shadow-xs'
                        : 'bg-surface-card border-surface-border text-text-secondary'
                    }`}
                  >
                    {showAnswerKey ? <Eye size={12} /> : <EyeOff size={12} />}
                    {showAnswerKey ? 'Hiện ĐA' : 'Ẩn ĐA'}
                  </button>
                )}
              </div>

              {/* Tùy chỉnh chi tiết Toggle Button (Mobile) */}
              {docType === 'exam_paper' && (
                <button
                  type="button"
                  onClick={() => setShowMobileOptions(!showMobileOptions)}
                  className={`px-2 py-1 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-1 shrink-0 ${
                    showMobileOptions
                      ? 'bg-parish-primary-light border-parish-primary/40 text-parish-primary'
                      : 'bg-surface-card border-surface-border text-text-muted hover:text-text-main'
                  }`}
                >
                  <SlidersHorizontal size={12} />
                  <span>Tùy chỉnh</span>
                  <ChevronDown size={11} className={`transition-transform duration-200 ${showMobileOptions ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>

            {/* Collapsible Secondary Options for Mobile */}
            {showMobileOptions && docType === 'exam_paper' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 bg-surface-app rounded-xl border border-surface-border text-xs animate-in fade-in duration-150">
                {showAnswerKey && (
                  <button
                    type="button"
                    onClick={() => setIncludeExplanations(!includeExplanations)}
                    className={`px-2 py-1.5 rounded-lg border font-bold transition-all flex items-center justify-center gap-1 ${
                      includeExplanations
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                        : 'bg-surface-card border-surface-border text-text-muted'
                    }`}
                  >
                    {includeExplanations ? <CheckSquare size={12} /> : <Square size={12} />} 💡 Lời Giải
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={() => setIncludeAnswerGrid(!includeAnswerGrid)}
                  className={`px-2 py-1.5 rounded-lg border font-bold transition-all flex items-center justify-center gap-1 ${
                    includeAnswerGrid
                      ? 'bg-parish-primary-light border-parish-primary/30 text-parish-primary'
                      : 'bg-surface-card border-surface-border text-text-muted'
                  }`}
                >
                  {includeAnswerGrid ? <CheckSquare size={12} /> : <Square size={12} />} Khung Tô
                </button>

                <button
                  type="button"
                  onClick={() => setIncludeGradingBox(!includeGradingBox)}
                  className={`px-2 py-1.5 rounded-lg border font-bold transition-all flex items-center justify-center gap-1 ${
                    includeGradingBox
                      ? 'bg-parish-primary-light border-parish-primary/30 text-parish-primary'
                      : 'bg-surface-card border-surface-border text-text-muted'
                  }`}
                >
                  {includeGradingBox ? <CheckSquare size={12} /> : <Square size={12} />} Khung Điểm
                </button>

                <div className="flex items-center bg-surface-card rounded-lg border border-surface-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setLayoutColumns(2)}
                    className={`flex-1 py-1 rounded text-[11px] font-bold transition-all flex items-center justify-center gap-0.5 ${
                      layoutColumns === 2 ? 'bg-parish-primary text-white' : 'text-text-muted'
                    }`}
                  >
                    <Columns size={11} /> 2 Cột
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutColumns(1)}
                    className={`flex-1 py-1 rounded text-[11px] font-bold transition-all flex items-center justify-center gap-0.5 ${
                      layoutColumns === 1 ? 'bg-parish-primary text-white' : 'text-text-muted'
                    }`}
                  >
                    <LayoutGrid size={11} /> 1 Cột
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ================= DESKTOP CONTROLS (TRUNG TÂM IN ẤN ĐẦY ĐỦ) ================= */
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 sm:p-3 bg-surface-app rounded-xl border border-surface-border mb-3 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              {docType !== 'qr_sheet' && students.length > 0 && (
                <div className="flex items-center bg-surface-card rounded-lg border border-surface-border p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!showAnswerKey) setPrintMode('batch')
                    }}
                    disabled={showAnswerKey}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                      showAnswerKey
                        ? 'opacity-40 cursor-not-allowed text-text-muted'
                        : printMode === 'batch'
                          ? 'bg-parish-primary text-white'
                          : 'text-text-muted hover:text-text-main'
                    }`}
                    title={
                      showAnswerKey
                        ? 'Không thể in cả lớp ở chế độ Hiện Đáp Án (đáp án chỉ dành cho Giáo Lý Viên)'
                        : 'In cho từng học sinh, mỗi em có mã QR và họ tên riêng'
                    }
                  >
                    <Users size={13} /> In Cả Lớp ({students.length} em)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintMode('single')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                      printMode === 'single' ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                    }`}
                    title="Mẫu chung (học sinh tự điền họ tên/SBD)"
                  >
                    <User size={13} /> Mẫu Chung
                  </button>
                </div>
              )}

              {docType !== 'qr_sheet' && availableVersions.length > 1 && (
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
                          effectiveSelectedVersion === code ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {docType === 'exam_paper' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAnswerKey(!showAnswerKey)}
                    className={`btn btn-sm text-xs font-bold flex items-center gap-1.5 ${
                      showAnswerKey ? 'btn-primary' : 'btn-secondary'
                    }`}
                  >
                    {showAnswerKey ? <Eye size={14} /> : <EyeOff size={14} />}
                    {showAnswerKey ? 'Hiện Đáp Án' : 'Ẩn Đáp Án'}
                  </button>

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
                      💡 Lời Giải
                    </button>
                  )}

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
                    Khung Điểm
                  </button>

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

                  <div className="flex items-center gap-1 text-xs text-text-muted">
                    <span>Thời gian:</span>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={durationMinutes}
                      onChange={e => setDurationMinutes(Math.max(5, Number(e.target.value) || 45))}
                      className="w-12 px-1.5 py-1 bg-surface-card border border-surface-border rounded-lg text-center font-bold text-text-main focus:outline-hidden"
                    />
                    <span>phút</span>
                  </div>
                </>
              )}

              {docType === 'answer_sheet' && (
                <span className="badge badge-neutral text-xs font-bold">
                  {(examType === 'multiple_choice' || examType === 'mixed') ? `${questionCount} Câu Trắc Nghiệm` : `Tự Luận (Tối đa ${maxScore} điểm)`}
                </span>
              )}

              {docType === 'qr_sheet' && (
                <span className="badge badge-neutral text-xs font-bold">
                  {students.length} Học Viên Trong Lớp
                </span>
              )}
            </div>

            {/* Action Export / Print Buttons (Desktop) */}
            <div className="flex items-center gap-2 flex-wrap">
              {docType === 'exam_paper' && (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadWord}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
                    title="Xuất file Word (.doc) để chỉnh sửa câu hỏi"
                  >
                    <FileText size={14} className="text-blue-600" /> {printMode === 'batch' && students.length > 0 ? `Xuất Word (${students.length} Bản)` : 'Xuất Word'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadExcel}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
                    title="Xuất bảng câu hỏi & đáp án Excel (.xlsx)"
                  >
                    <FileSpreadsheet size={14} className="text-emerald-600" /> Xuất Excel
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
                title="Xuất trực tiếp file PDF vector chất lượng cao"
              >
                <Printer size={14} className="text-rose-600" /> {printMode === 'batch' && students.length > 0 && docType !== 'qr_sheet' ? `Xuất PDF (${students.length} Bản)` : 'Xuất PDF'}
              </button>
              <button
                type="button"
                onClick={handleDownloadHtml}
                className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
                title="Tải file HTML độc lập để mở trên trình duyệt và in"
              >
                <Globe size={14} className="text-sky-600" /> {printMode === 'batch' && students.length > 0 && docType !== 'qr_sheet' ? `Tải HTML (${students.length} Bản)` : 'Tải HTML'}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs font-bold shadow-xs"
              >
                <Printer size={14} /> {
                  docType === 'qr_sheet'
                    ? 'In Thẻ Mã QR'
                    : docType === 'answer_sheet'
                      ? (printMode === 'batch' && students.length > 0 ? `In Phiếu Trả Lời (${students.length} Bản)` : 'In Phiếu Trả Lời')
                      : (printMode === 'batch' && students.length > 0 ? `In Cả Lớp (${students.length} Bản)` : 'In Đề Thi & Phiếu Gộp')
                }
              </button>
            </div>
          </div>
        )}

        {/* Content Viewport Area */}
        <div ref={containerRef} className="flex-1 min-h-0 bg-slate-200 dark:bg-slate-900 rounded-xl overflow-hidden border border-surface-border flex flex-col p-1 sm:p-3">
          
          {/* Mobile Question Reader View */}
          {isMobile && docType === 'question_reader' ? (
            <div className="flex-1 min-h-0 overflow-y-auto bg-surface-card rounded-lg p-3 space-y-3">
              {effectiveQuestions.length === 0 ? (
                <div className="text-center py-10 text-text-muted">
                  <FileText size={36} className="mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-sm">Chưa có nội dung câu hỏi trích xuất</p>
                  <p className="text-xs">Chuyển sang tab <b>Đề A4</b> hoặc <b>Phiếu A4</b> để xem tài liệu.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-surface-border">
                    <span className="text-xs font-bold text-parish-primary">
                      Danh sách {effectiveQuestions.length} câu hỏi · Mã đề {effectiveSelectedVersion}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {showAnswerKey ? '✅ Đang hiện đáp án' : '🔒 Đang ẩn đáp án'}
                    </span>
                  </div>

                  {effectiveQuestions.map((q) => {
                    const isMc = q.type !== 'essay'
                    return (
                      <div key={q.index} className="p-3 bg-surface-app rounded-xl border border-surface-border space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-black text-sm text-text-main">
                            Câu {q.index}: {q.points !== undefined && <span className="font-normal text-xs text-text-muted">({q.points}đ)</span>}
                          </span>
                          {q.type === 'essay' && (
                            <span className="badge badge-neutral text-[10px]">Tự Luận</span>
                          )}
                        </div>

                        <p className="text-sm text-text-main font-medium leading-relaxed m-0 whitespace-pre-line">
                          {q.question}
                        </p>

                        {isMc && q.options && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                            {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                              const optText = q.options ? q.options[optKey] : ''
                              if (!optText) return null
                              const isCorrect = showAnswerKey && q.correctOption === optKey
                              return (
                                <div
                                  key={optKey}
                                  className={`p-2 rounded-lg border text-xs flex items-start gap-2 transition-all ${
                                    isCorrect
                                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-bold'
                                      : 'bg-surface-card border-surface-border text-text-secondary'
                                  }`}
                                >
                                  <span className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-black shrink-0 ${
                                    isCorrect ? 'bg-emerald-600 text-white' : 'bg-surface-app text-text-muted'
                                  }`}>
                                    {optKey}
                                  </span>
                                  <span className="flex-1 leading-snug">{optText}</span>
                                  {isCorrect && <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {showAnswerKey && q.explanation && (
                          <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                            <strong>💡 Lời giải:</strong> {q.explanation}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          ) : (
            /* A4 Print Sheet Iframe View (Mobile Fit/100% Zoom & Desktop View) */
            <div className="flex-1 min-h-0 flex flex-col">
              {isMobile && (
                <div className="flex items-center justify-between gap-2 px-1 pb-1.5 mb-1 border-b border-surface-border/50 text-[11px] text-text-muted shrink-0">
                  <span className="truncate font-medium">
                    {mobileZoom === 'fit' ? '📱 Khung in chuẩn A4 (Co vừa màn hình)' : '🔍 Tỷ lệ gốc 100% (Vuốt ngang/dọc)'}
                  </span>
                  <div className="flex items-center bg-surface-card rounded-lg border border-surface-border p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setMobileZoom('fit')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-1 ${
                        mobileZoom === 'fit' ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                      }`}
                    >
                      <ZoomOut size={11} /> Vừa màn hình
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileZoom('100')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-1 ${
                        mobileZoom === '100' ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                      }`}
                    >
                      <ZoomIn size={11} /> 100% A4
                    </button>
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 w-full overflow-auto flex justify-center items-start bg-slate-200 dark:bg-slate-900 rounded-lg">
                <div
                  className="bg-white shadow-xl rounded-sm transition-all"
                  style={
                    isMobile && mobileZoom === 'fit'
                      ? {
                          width: '794px',
                          minWidth: '794px',
                          transform: `scale(${a4Scale})`,
                          transformOrigin: 'top center',
                          marginBottom: `calc((1123px * ${1 - a4Scale}) * -1)`,
                        }
                      : {
                          width: '794px',
                          minWidth: '794px',
                        }
                  }
                >
                  <iframe
                    srcDoc={previewHtml}
                    title="Xem trước tài liệu kiểm tra"
                    className="w-[794px] min-w-[794px] h-[1123px] border-none bg-white block"
                  />
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body)
  }
  return modalContent
}

export default ExamPaperModal
