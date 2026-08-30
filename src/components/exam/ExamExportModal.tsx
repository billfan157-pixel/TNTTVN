import React, { useState, useMemo } from 'react'
import {
  X, Download, FileText, FileSpreadsheet, Copy, Check,
  Printer, Sparkles, Settings2, Eye, LayoutGrid, Columns,
  Layers3, BookOpen,    Code, Globe
} from 'lucide-react'
import type { ExamQuestion, ExamAnswerVariants, ExamVersionCode, MultipleChoiceOption } from '../../types'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { ModalPortal } from '../common/ModalPortal'
import {
  exportExamToWord,
  exportExamToHtml,
  exportExamToExcel,
  downloadExamText,
  downloadExamMarkdown,
  exportExamToJson,
  exportExamToText,
  exportExamToMarkdown,
  generateExamWordHtml,
  generateExamJsonString,
  resolveExportQuestions,
  type ExamExportOptions,
} from '../../utils/examExporter'
import { ReportExportService } from '../../services/reportExportService'
import { useSettingsStore } from '../../stores/settingsStore'
import { useToastStore } from '../../stores/toastStore'
import { EXAM_VERSION_CODES, normalizeAnswerVariants } from '../../lib/examVariants'

export interface ExamExportModalProps {
  isOpen: boolean
  onClose: () => void
  subject: string
  classLabel: string
  academicYear?: string
  semester?: number | string
  questions?: ExamQuestion[]
  questionCount?: number
  answerKey?: Record<number, MultipleChoiceOption>
  answerVariants?: Partial<ExamAnswerVariants>
  durationMinutes?: number
  maxScore?: number
}

type ExportFormat = 'word' | 'html' | 'pdf' | 'excel' | 'text' | 'markdown' | 'json'

export const ExamExportModal: React.FC<ExamExportModalProps> = ({
  isOpen,
  onClose,
  subject,
  classLabel,
  academicYear = '',
  semester = 1,
  questions = [],
  questionCount,
  answerKey,
  answerVariants,
  durationMinutes: initialDuration = 45,
  maxScore = 10,
}) => {
  const [activeFormat, setActiveFormat] = useState<ExportFormat>('word')
  const { dialogRef: trapRef } = useAccessibleDialog(isOpen, onClose)
  const [selectedVersion, setSelectedVersion] = useState<ExamVersionCode>('A')
  const [durationMinutes, setDurationMinutes] = useState(initialDuration)
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true)
  const [includeExplanations, setIncludeExplanations] = useState(true)
  const [includeStudentInfo, setIncludeStudentInfo] = useState(true)
  const [includeQuickAnswerGrid, setIncludeQuickAnswerGrid] = useState(true)
  const [layoutColumns, setLayoutColumns] = useState<1 | 2>(2)
  const [activeTab, setActiveTab] = useState<'options' | 'preview'>('options')
  const [copied, setCopied] = useState(false)

  const settings = useSettingsStore(s => s.settings)
  const parishName = settings.parishName || 'Giáo Xứ'
  const dioceseName = settings.dioceseName || 'Giáo Phận'

  const effectiveQuestions = useMemo(() => {
    return resolveExportQuestions({
      subject,
      classLabel,
      academicYear,
      questions,
      questionCount,
      answerKey,
    })
  }, [subject, classLabel, academicYear, questions, questionCount, answerKey])

  const variants = useMemo(() => {
    return normalizeAnswerVariants(answerVariants, answerKey, effectiveQuestions.length)
  }, [answerVariants, answerKey, effectiveQuestions.length])

  const availableVersions = useMemo(() => {
    return EXAM_VERSION_CODES.filter(code => Boolean(variants[code]))
  }, [variants])

  const exportOptions: ExamExportOptions = useMemo(() => ({
    subject,
    classLabel,
    academicYear,
    semester,
    durationMinutes,
    maxScore,
    questions: effectiveQuestions,
    questionCount: effectiveQuestions.length,
    answerKey,
    answerVariants,
    selectedVersion,
    includeAnswerKey,
    includeExplanations,
    includeStudentInfo,
    includeQuickAnswerGrid,
    layoutColumns,
    parishName,
    dioceseName,
  }), [
    subject, classLabel, academicYear, semester, durationMinutes, maxScore,
    effectiveQuestions, answerKey, answerVariants, selectedVersion,
    includeAnswerKey, includeExplanations, includeStudentInfo,
    includeQuickAnswerGrid, layoutColumns, parishName, dioceseName
  ])

  const previewContent = useMemo(() => {
    if (activeFormat === 'text') return exportExamToText(exportOptions)
    if (activeFormat === 'markdown') return exportExamToMarkdown(exportOptions)
    if (activeFormat === 'json') return generateExamJsonString(exportOptions)
    if (activeFormat === 'word' || activeFormat === 'html' || activeFormat === 'pdf') return generateExamWordHtml(exportOptions)
    return ''
  }, [activeFormat, exportOptions])

  if (!isOpen) return null

  const handleDownload = () => {
    switch (activeFormat) {
      case 'word':
        exportExamToWord(exportOptions)
        break
      case 'html':
        exportExamToHtml(exportOptions)
        break
      case 'excel':
        void exportExamToExcel(exportOptions).catch(console.error)
        break
      case 'text':
        downloadExamText(exportOptions)
        break
      case 'markdown':
        downloadExamMarkdown(exportOptions)
        break
      case 'json':
        exportExamToJson(exportOptions)
        break
      case 'pdf': {
        const html = generateExamWordHtml(exportOptions)
        ReportExportService.print(html)
        break
      }
    }
  }

  const handleCopyClipboard = async () => {
    let contentToCopy = ''
    if (activeFormat === 'text') contentToCopy = exportExamToText(exportOptions)
    else if (activeFormat === 'markdown') contentToCopy = exportExamToMarkdown(exportOptions)
    else if (activeFormat === 'json') contentToCopy = generateExamJsonString(exportOptions)
    else contentToCopy = exportExamToText(exportOptions)

    try {
      await navigator.clipboard.writeText(contentToCopy)
      setCopied(true)
      useToastStore.getState().addToast('Đã sao chép nội dung đề thi vào bộ nhớ tạm!', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      useToastStore.getState().addToast('Không thể sao chép vào bộ nhớ tạm', 'error')
    }
  }

  const handlePrint = () => {
    const html = generateExamWordHtml(exportOptions)
    ReportExportService.print(html)
  }

  return (
    <ModalPortal>
    <div role="dialog" aria-modal="true" aria-labelledby="exam-export-title" className="app-modal-layer fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
      <div ref={trapRef} className="bg-surface-card rounded-2xl p-6 w-full max-w-5xl shadow-2xl max-h-[94vh] flex flex-col border border-surface-border" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center font-bold">
              <Download size={20} />
            </div>
            <div>
              <h3 id="exam-export-title" className="font-black text-lg text-parish-primary m-0">Xuất Đề Thi & Bảng Đáp Án</h3>
              <p className="text-xs text-text-muted m-0 mt-0.5">
                {subject} · Lớp {classLabel} {academicYear ? `· Niên khóa ${academicYear}` : ''} ({effectiveQuestions.length} câu hỏi)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Format Selector Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setActiveFormat('word')}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
              activeFormat === 'word'
                ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                : 'bg-surface-card border-surface-border text-text-muted hover:text-text-main hover:bg-surface-hover'
            }`}
          >
            <FileText size={20} className={activeFormat === 'word' ? 'text-blue-600 dark:text-blue-400' : 'text-text-muted'} />
            <span className="text-xs font-semibold">Word (.doc)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFormat('html')}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
              activeFormat === 'html'
                ? 'bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400 font-bold shadow-xs'
                : 'bg-surface-card border-surface-border text-text-muted hover:text-text-main hover:bg-surface-hover'
            }`}
          >
            <Globe size={20} className={activeFormat === 'html' ? 'text-sky-600 dark:text-sky-400' : 'text-text-muted'} />
            <span className="text-xs font-semibold">HTML (.html)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFormat('pdf')}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
              activeFormat === 'pdf'
                ? 'bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400 font-bold shadow-xs'
                : 'bg-surface-card border-surface-border text-text-muted hover:text-text-main hover:bg-surface-hover'
            }`}
          >
            <Printer size={20} className={activeFormat === 'pdf' ? 'text-rose-600 dark:text-rose-400' : 'text-text-muted'} />
            <span className="text-xs font-semibold">In / PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFormat('excel')}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
              activeFormat === 'excel'
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-xs'
                : 'bg-surface-card border-surface-border text-text-muted hover:text-text-main hover:bg-surface-hover'
            }`}
          >
            <FileSpreadsheet size={20} className={activeFormat === 'excel' ? 'text-emerald-600 dark:text-emerald-400' : 'text-text-muted'} />
            <span className="text-xs font-semibold">Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFormat('text')}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
              activeFormat === 'text'
                ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 font-bold shadow-xs'
                : 'bg-surface-card border-surface-border text-text-muted hover:text-text-main hover:bg-surface-hover'
            }`}
          >
            <Copy size={20} className={activeFormat === 'text' ? 'text-amber-600 dark:text-amber-400' : 'text-text-muted'} />
            <span className="text-xs font-semibold">Văn Bản (.txt)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFormat('markdown')}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
              activeFormat === 'markdown'
                ? 'bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400 font-bold shadow-xs'
                : 'bg-surface-card border-surface-border text-text-muted hover:text-text-main hover:bg-surface-hover'
            }`}
          >
            <BookOpen size={20} className={activeFormat === 'markdown' ? 'text-purple-600 dark:text-purple-400' : 'text-text-muted'} />
            <span className="text-xs font-semibold">Markdown (.md)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFormat('json')}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
              activeFormat === 'json'
                ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                : 'bg-surface-card border-surface-border text-text-muted hover:text-text-main hover:bg-surface-hover'
            }`}
          >
            <Code size={20} className={activeFormat === 'json' ? 'text-indigo-600 dark:text-indigo-400' : 'text-text-muted'} />
            <span className="text-xs font-semibold">JSON (.json)</span>
          </button>
        </div>

        {/* Navigation Tabs (Tùy chọn vs Xem trước) */}
        <div className="flex items-center justify-between gap-3 mb-3 border-b border-surface-border pb-2">
          <div className="flex bg-surface-hover p-1 rounded-xl border border-surface-border">
            <button
              type="button"
              onClick={() => setActiveTab('options')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'options' ? 'bg-parish-primary text-white shadow-xs' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Settings2 size={14} /> Tùy Chọn Xuất
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'preview' ? 'bg-parish-primary text-white shadow-xs' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Eye size={14} /> Xem Trước Nội Dung
            </button>
          </div>

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
        </div>

        {/* Tab Body */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {activeTab === 'options' ? (
            <div className="space-y-4 py-2">
              
              {/* Tùy chỉnh nội dung đề thi */}
              <div className="p-4 bg-surface-app rounded-xl border border-surface-border">
                <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText size={15} className="text-parish-primary" /> Thiết lập nội dung đề thi
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none text-text-main">
                    <input
                      type="checkbox"
                      checked={includeStudentInfo}
                      onChange={e => setIncludeStudentInfo(e.target.checked)}
                      className="rounded border-surface-border text-parish-primary focus:ring-parish-primary"
                    />
                    <span>Khung điền thông tin học sinh (Họ tên, Lớp, Điểm)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none text-text-main">
                    <input
                      type="checkbox"
                      checked={includeQuickAnswerGrid}
                      onChange={e => setIncludeQuickAnswerGrid(e.target.checked)}
                      className="rounded border-surface-border text-parish-primary focus:ring-parish-primary"
                    />
                    <span>Khung ô điền đáp án nhanh A/B/C/D</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none text-text-main">
                    <input
                      type="checkbox"
                      checked={includeAnswerKey}
                      onChange={e => setIncludeAnswerKey(e.target.checked)}
                      className="rounded border-surface-border text-parish-primary focus:ring-parish-primary"
                    />
                    <span>Đính kèm Bảng Đáp Án cho Giáo Lý Viên</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none text-text-main">
                    <input
                      type="checkbox"
                      checked={includeExplanations}
                      onChange={e => setIncludeExplanations(e.target.checked)}
                      className="rounded border-surface-border text-parish-primary focus:ring-parish-primary"
                    />
                    <span>Kèm Lời giải thích / Hướng dẫn chấm chi tiết</span>
                  </label>
                </div>
              </div>

              {/* Bố cục & Thời gian */}
              <div className="p-4 bg-surface-app rounded-xl border border-surface-border">
                <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <LayoutGrid size={15} className="text-parish-primary" /> Bố cục trang & Thời gian làm bài
                </h4>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted font-semibold">Bố cục câu hỏi:</span>
                    <div className="flex bg-surface-card rounded-lg border border-surface-border p-0.5">
                      <button
                        type="button"
                        onClick={() => setLayoutColumns(2)}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                          layoutColumns === 2 ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                        }`}
                      >
                        <Columns size={13} /> 2 Cột (Tiết kiệm trang)
                      </button>
                      <button
                        type="button"
                        onClick={() => setLayoutColumns(1)}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                          layoutColumns === 1 ? 'bg-parish-primary text-white' : 'text-text-muted hover:text-text-main'
                        }`}
                      >
                        <LayoutGrid size={13} /> 1 Cột (Rộng rãi)
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted font-semibold">Thời gian làm bài:</span>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={durationMinutes}
                      onChange={e => setDurationMinutes(Math.max(5, Number(e.target.value) || 45))}
                      className="w-16 px-2.5 py-1 bg-surface-card border border-surface-border rounded-lg text-center font-bold text-xs text-text-main focus:outline-none"
                    />
                    <span className="text-xs text-text-muted">phút</span>
                  </div>
                </div>
              </div>

              {/* Thông tin hỗ trợ định dạng */}
              <div className="p-3 rounded-xl border border-surface-border bg-surface-card text-xs text-text-muted flex items-start gap-2.5">
                <Sparkles size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-text-main m-0">Định dạng khuyên dùng:</p>
                  <p className="m-0 mt-0.5">
                    • <strong>Word (.doc)</strong>: Phù hợp nhất để chỉnh sửa, thêm logo xứ, căn lề và in phát đề trên giấy A4.<br />
                    • <strong>Excel (.xlsx)</strong>: Lưu trữ toàn bộ câu hỏi và bảng đáp án các mã đề để quản lý ngân hàng câu hỏi hoặc tái import.<br />
                    • <strong>Văn bản Text / Markdown</strong>: Sao chép nhanh vào Quizizz, Google Forms, Zalo hoặc hệ thống học tập trực tuyến.
                  </p>
                </div>
              </div>

            </div>
          ) : (
            <div className="h-full flex flex-col">
              {activeFormat === 'word' || activeFormat === 'html' || activeFormat === 'pdf' ? (
                <div className="bg-slate-200 dark:bg-slate-900 rounded-xl overflow-hidden border border-surface-border flex justify-center p-3 h-[480px]">
                  <div className="w-full max-w-[210mm] h-full bg-white shadow-md rounded-sm overflow-hidden">
                    <iframe
                      srcDoc={previewContent}
                      title="Xem trước đề thi"
                      className="w-full h-full border-none bg-white"
                    />
                  </div>
                </div>
              ) : (
                <pre className="p-4 bg-surface-app rounded-xl border border-surface-border text-xs font-mono text-text-main overflow-auto max-h-[480px] whitespace-pre-wrap select-all">
                  {previewContent}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer Toolbar */}
        <div className="border-t border-surface-border pt-4 mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyClipboard}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
              title="Sao chép nội dung câu hỏi và đáp án vào clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {copied ? 'Đã sao chép!' : 'Sao chép văn bản'}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold"
              title="In trực tiếp hoặc xuất PDF qua hộp thoại in của trình duyệt"
            >
              <Printer size={14} /> In / Lưu PDF
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-sm text-xs font-bold"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs font-bold shadow-xs"
            >
              <Download size={14} />
              {activeFormat === 'word' && 'Tải File Word (.doc)'}
              {activeFormat === 'html' && 'Tải File HTML (.html)'}
              {activeFormat === 'excel' && 'Tải File Excel (.xlsx)'}
              {activeFormat === 'pdf' && 'In / Xuất PDF'}
              {activeFormat === 'text' && 'Tải File Text (.txt)'}
              {activeFormat === 'markdown' && 'Tải File Markdown (.md)'}
              {activeFormat === 'json' && 'Tải File JSON (.json)'}
            </button>
          </div>
        </div>

      </div>
    </div>
    </ModalPortal>
  )
}
