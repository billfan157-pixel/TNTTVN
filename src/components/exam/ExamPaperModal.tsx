import React, { useState, useMemo, useEffect } from 'react'
import {
  X, Printer, Eye, EyeOff, LayoutGrid,
  Columns, FileText, CheckSquare,
  Square, Users, User, FileSpreadsheet, Layers3, Globe,
  QrCode, ClipboardList
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
import { ReportExportService } from '../../services/reportExportService'
import { useSettingsStore } from '../../stores/settingsStore'
import { useToastStore } from '../../stores/toastStore'
import { exportExamToWord, exportExamToExcel } from '../../utils/examExporter'
import { EXAM_VERSION_CODES, normalizeAnswerVariants } from '../../lib/examVariants'
import { assertContiguousQuestionIndexes, prepareExamDocumentForOutput } from '../../lib/examPrintSafety'
import type { ExamQuestion, ExamAnswerVariants, ExamVersionCode, MultipleChoiceOption } from '../../types'

export type ExamDocType = 'exam_paper' | 'answer_sheet' | 'qr_sheet'

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
  examType?: 'written' | 'multiple_choice'
  maxScore?: number
  questionCount?: number
  scoreTypeLabel?: string
  initialDocType?: ExamDocType
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
  const [docType, setDocType] = useState<ExamDocType>(initialDocType)
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
    const list = EXAM_VERSION_CODES.filter(code => Boolean(variants[code]))
    return list.length > 0 ? list : (['A'] as ExamVersionCode[])
  }, [variants])

  const effectiveSelectedVersion = availableVersions.includes(selectedVersion)
    ? selectedVersion
    : (availableVersions[0] ?? 'A')

  // Nếu cấu hình mã đề thay đổi khi modal đang mở, không để state cũ lọt vào
  // QR / answer sheet / filename. Đồng bộ UI về một mã thực sự còn cấu hình.
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
  }), [parishName, dioceseName, subject, classLabel, academicYear, durationMinutes, effectiveQuestions, showAnswerKey, includeExplanations, layoutColumns, includeAnswerGrid, includeGradingBox, sessionId, effectiveSelectedVersion])

  // Mẫu Chung phải là tài liệu không định danh. `GENERIC` cố ý đi qua legacy
  // payload và bị shared QR parser reject, nên scanner không thể auto-bind nhầm.
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

    // docType === 'exam_paper'
    if (effectiveQuestions.length === 0) {
      return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#64748b;"><h3>Chưa có nội dung câu hỏi cho đề thi gộp.</h3><p>Vui lòng chuyển qua tab <b>Phiếu Trả Lời Rời A4</b> hoặc <b>Thẻ Mã QR</b> để in phiếu làm bài.</p></body></html>`
    }
    const rawHtml = printMode === 'batch' && students.length > 0
      ? buildBatchExamPapersHtml(students.slice(0, 2), printOptions)
      : buildExamPaperHtml(printOptions)
    // Preview phải phản ánh đúng tài liệu vật lý: answer-key không còn marker
    // machine-readable, student form dùng foreground SVG markers.
    return prepareExamDocumentForOutput(rawHtml)
  }, [docType, printMode, students, sampleStudent, batchAnswerSheetParams, classLabel, subject, qrSvgs, effectiveQuestions, printOptions, questionIntegrityError])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const guardExamPaperIntegrity = (): boolean => {
    if (docType !== 'exam_paper' || !questionIntegrityError) return true
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
      const filename = `Phieu_Tra_Loi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}_${isBatch ? `CaLop_${students.length}Em` : `Ma${effectiveSelectedVersion}`}`
      ReportExportService.exportPdf(htmlToExport, filename)
      return
    }

    if (docType === 'qr_sheet') {
      const htmlToExport = buildQrSheetHtml(`${classLabel} — ${subject} (Thẻ Mã QR)`, qrSvgs)
      const filename = `The_Ma_QR_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}`
      ReportExportService.exportPdf(htmlToExport, filename)
      return
    }

    const htmlToExport = isBatch
      ? buildBatchExamPapersHtml(students, printOptions)
      : buildExamPaperHtml(printOptions)
    if (!htmlToExport) return
    const filename = `De_Thi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}_${isBatch ? `CaLop_${students.length}Em` : `Ma${effectiveSelectedVersion}`}`
    ReportExportService.exportPdf(htmlToExport, filename)
  }

  const handleDownloadHtml = () => {
    if (!guardExamPaperIntegrity()) return
    const isBatch = printMode === 'batch' && students.length > 0

    if (docType === 'answer_sheet') {
      const htmlToExport = buildBatchAnswerSheetsHtml(isBatch ? students : [sampleStudent], batchAnswerSheetParams)
      const filename = `Phieu_Tra_Loi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}_${isBatch ? `CaLop_${students.length}Em` : `Ma${effectiveSelectedVersion}`}.html`
      ReportExportService.downloadHTML(htmlToExport, filename)
      useToastStore.getState().addToast(`Đã xuất file HTML Phiếu Trả Lời: ${filename}`, 'success')
      return
    }

    if (docType === 'qr_sheet') {
      const htmlToExport = buildQrSheetHtml(`${classLabel} — ${subject} (Thẻ Mã QR)`, qrSvgs)
      const filename = `The_Ma_QR_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}.html`
      ReportExportService.downloadHTML(htmlToExport, filename)
      useToastStore.getState().addToast(`Đã xuất file HTML Thẻ Mã QR: ${filename}`, 'success')
      return
    }

    const htmlToExport = isBatch
      ? buildBatchExamPapersHtml(students, printOptions)
      : buildExamPaperHtml(printOptions)
    if (!htmlToExport) return
    const filename = `De_Thi_${subject.replace(/\s+/g, '_')}_${classLabel.replace(/\s+/g, '_')}_${isBatch ? `CaLop_${students.length}Em` : `Ma${effectiveSelectedVersion}`}.html`
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
    exportExamToExcel({
      subject,
      classLabel,
      academicYear,
      questions: effectiveQuestions,
      selectedVersion: effectiveSelectedVersion,
      answerVariants,
      answerKey,
      includeAnswerKey: true,
      includeExplanations: true,
    })
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="exam-paper-title" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-card rounded-2xl p-4 sm:p-6 w-full max-w-6xl shadow-2xl h-[94vh] flex flex-col border border-surface-border" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border pb-3 mb-2.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center font-bold">
              {docType === 'exam_paper' && <FileText size={20} />}
              {docType === 'answer_sheet' && <ClipboardList size={20} />}
              {docType === 'qr_sheet' && <QrCode size={20} />}
            </div>
            <div>
              <h3 id="exam-paper-title" className="font-black text-lg text-parish-primary m-0">In & Xuất Tài Liệu Kiểm Tra</h3>
              <p className="text-xs text-text-muted m-0 mt-0.5">
                {subject} · Lớp {classLabel} · Niên khóa {academicYear}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* 3 Document Type Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-app rounded-xl border border-surface-border mb-3">
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

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 bg-surface-app rounded-xl border border-surface-border mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            
            {/* Chế độ in: Mẫu chung vs Theo danh sách học sinh (áp dụng cho Đề thi & Phiếu trả lời) */}
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
                  title="In mẫu chung (học sinh tự điền họ tên/SBD)"
                >
                  <User size={13} /> Mẫu Chung
                </button>
              </div>
            )}

            {/* Mã Đề Selector */}
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

            {/* Options for Exam Paper */}
            {docType === 'exam_paper' && (
              <>
                {/* Answer Key Toggle */}
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

                {/* Explanations Toggle */}
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
                  Khung Điểm
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

            {/* Badges for Answer Sheet */}
            {docType === 'answer_sheet' && (
              <span className="badge badge-neutral text-xs font-bold">
                {examType === 'multiple_choice' ? `${questionCount} Câu Trắc Nghiệm` : `Tự Luận (Tối đa ${maxScore} điểm)`}
              </span>
            )}

            {/* Badges for QR Sheet */}
            {docType === 'qr_sheet' && (
              <span className="badge badge-neutral text-xs font-bold">
                {students.length} Học Viên Trong Lớp
              </span>
            )}
          </div>

          {/* Action Export / Print Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {docType === 'exam_paper' && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadWord}
                  className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
                  title="Xuất file Word (.doc) để chỉnh sửa câu hỏi (khuyến khích in trực tiếp hoặc xuất PDF để đảm bảo chuẩn OMR)"
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

        {/* Live Preview Iframe */}
        <div className="flex-1 min-h-0 bg-slate-200 dark:bg-slate-900 rounded-xl overflow-hidden border border-surface-border flex justify-center p-3">
          <div className="w-full max-w-[210mm] h-full bg-white shadow-xl rounded-sm overflow-hidden">
            <iframe
              srcDoc={previewHtml}
              title="Xem trước tài liệu kiểm tra"
              className="w-full h-full border-none bg-white"
            />
          </div>
        </div>

      </div>
    </div>
  )
}
