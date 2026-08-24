import React, { useState, useMemo, useEffect } from 'react'
import {
  X, Upload, FileText, CheckCircle2, AlertTriangle,
  Download, Eye, Sparkles, HelpCircle, Check, ListChecks
} from 'lucide-react'
import {
  parseExamFromText,
  parseExamFromExcel,
  generateSampleExamTemplateText,
  generateSampleExcelWorkbook,
  type ExamParseResult,
} from '../../utils/examParser'
import type { ExamQuestion, MultipleChoiceOption } from '../../types'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface ExamImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (data: {
    questions: ExamQuestion[]
    answerKey: Record<number, MultipleChoiceOption>
    questionCount: number
    subject?: string
  }) => void
}

export const ExamImportModal: React.FC<ExamImportModalProps> = ({ isOpen, onClose, onImport }) => {
  // PHA 1 nợ (audit A19): focus trap
  const trapRef = useFocusTrap(isOpen)
  const [activeTab, setActiveTab] = useState<'text' | 'excel'>('text')
  const [rawText, setRawText] = useState('')
  const [previewResult, setPreviewResult] = useState<ExamParseResult | null>(null)
  const [detectedSubject, setDetectedSubject] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleParseText = (textToParse: string) => {
    const res = parseExamFromText(textToParse)
    setPreviewResult(res)
    
    // Tự động nhận diện môn học nếu dòng đầu tiên có chữ "ĐỀ KIỂM TRA..."
    const firstLine = textToParse.trim().split('\n')[0] || ''
    if (firstLine.length > 5 && firstLine.length < 80 && !firstLine.toLowerCase().startsWith('câu')) {
      setDetectedSubject(firstLine.replace(/^[#*_\-\s]+/, '').trim())
    }
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setRawText(val)
    if (val.trim()) {
      handleParseText(val)
    } else {
      setPreviewResult(null)
    }
  }

  const handleLoadSample = () => {
    const sample = generateSampleExamTemplateText()
    setRawText(sample)
    handleParseText(sample)
    setDetectedSubject('Kiểm tra Giáo Lý & Phụng Vụ')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessing(true)
    try {
      const buffer = await file.arrayBuffer()
      const res = await parseExamFromExcel(buffer)
      setPreviewResult(res)
      setDetectedSubject(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDownloadExcelSample = () => {
    void (async () => {
      // PERF-XLSX-1: lazy-load xlsx khi user tải mẫu.
      const bytes = await generateSampleExcelWorkbook()
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Mau_De_Thi_Trac_Nghiem_TNTT.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })().catch(console.error)
  }

  const handleApply = () => {
    if (!previewResult || !previewResult.ok || previewResult.questions.length === 0) return
    onImport({
      questions: previewResult.questions,
      answerKey: previewResult.answerKey,
      questionCount: previewResult.questionCount,
      subject: detectedSubject || previewResult.rawSubject,
    })
    onClose()
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="exam-import-title" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={trapRef} className="bg-surface-card rounded-2xl p-6 w-full max-w-4xl shadow-2xl max-h-[92vh] flex flex-col border border-surface-border" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-parish-primary-light text-parish-primary flex items-center justify-center font-bold">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 id="exam-import-title" className="font-black text-lg text-parish-primary m-0">Import Đề Thi Trắc Nghiệm Thông Minh</h3>
              <p className="text-xs text-text-muted m-0 mt-0.5">Tự động nhận diện câu hỏi, các phương án A-B-C-D và bảng đáp án chuẩn</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex bg-surface-hover p-1 rounded-xl border border-surface-border">
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'text' ? 'bg-parish-primary text-white shadow-xs' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <FileText size={14} /> Dán Văn Bản (Word / Text)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('excel')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'excel' ? 'bg-parish-primary text-white shadow-xs' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Upload size={14} /> Tải File Excel (.xlsx)
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'text' && (
              <button
                type="button"
                onClick={handleLoadSample}
                className="btn btn-secondary btn-sm text-xs font-bold"
              >
                <Sparkles size={13} className="text-amber-500" /> Dán Đề Mẫu
              </button>
            )}
            {activeTab === 'excel' && (
              <button
                type="button"
                onClick={handleDownloadExcelSample}
                className="btn btn-secondary btn-sm text-xs font-bold"
              >
                <Download size={13} className="text-emerald-500" /> Tải Mẫu Excel
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
          
          {/* Input Panel */}
          <div className="flex flex-col gap-2 min-h-0">
            {activeTab === 'text' ? (
              <>
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span className="font-semibold">Nội dung đề thi:</span>
                  <span className="text-[11px] text-parish-primary">Hỗ trợ: Đáp án: A, *A, [A] hoặc bảng đáp án ở cuối</span>
                </div>
                <textarea
                  value={rawText}
                  onChange={handleTextChange}
                  placeholder={`Dán đề thi tại đây...\n\nVí dụ:\nCâu 1: Bí tích Thánh Thể là gì?\nA. Là bí tích tình yêu\n*B. Là của ăn đàng\nC. Là dấu chỉ hiệp thông\nD. Tất cả đều đúng\n\nCâu 2: ...\nĐáp án: B`}
                  className="w-full flex-1 p-3 bg-surface-app border border-surface-border rounded-xl font-mono text-xs text-text-main resize-none focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                />
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-surface-border rounded-xl bg-surface-app/50 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3">
                  <Upload size={24} />
                </div>
                <h4 className="font-bold text-sm text-text-main mb-1">Chọn File Excel Đề Thi</h4>
                <p className="text-xs text-text-muted max-w-xs mb-4">
                  Hỗ trợ định dạng .xlsx, .xls, .csv theo mẫu 7 cột (Câu, Nội dung, A, B, C, D, Đáp án)
                </p>
                <label className="btn btn-primary btn-sm cursor-pointer">
                  <span>Chọn File Từ Máy Tính</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Live Preview Panel */}
          <div className="flex flex-col gap-2 min-h-0 bg-surface-app p-4 rounded-xl border border-surface-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-parish-primary flex items-center gap-1.5">
                <Eye size={14} /> Xem Trước Kết Quả Phân Tích
              </span>
              {previewResult && previewResult.ok && (
                <span className="text-xs font-extrabold text-emerald-600 px-2 py-0.5 bg-emerald-500/10 rounded-full">
                  Đã nhận diện {previewResult.questionCount} câu
                </span>
              )}
            </div>

            {/* Error / Warning alerts */}
            {previewResult?.errors && previewResult.errors.length > 0 && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-600 font-semibold flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{previewResult.errors[0]}</span>
              </div>
            )}

            {previewResult?.warnings && previewResult.warnings.length > 0 && (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] text-amber-700 dark:text-amber-300">
                {previewResult.warnings[0]}
              </div>
            )}

            {/* Questions scroll view */}
            {previewResult && previewResult.ok ? (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {/* Answer Key Grid Quick View */}
                <div className="bg-surface-card p-3 rounded-lg border border-surface-border">
                  <div className="text-[11px] font-bold text-text-muted mb-1.5 flex items-center gap-1">
                    <ListChecks size={12} /> Bảng Đáp Án Chuẩn Đã Trích Xuất:
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 text-center">
                    {previewResult.questions.map(q => (
                      <div key={q.index} className="p-1 rounded bg-surface-hover border border-surface-border text-[10px]">
                        <span className="text-text-muted block">C{q.index}</span>
                        <strong className="text-parish-primary font-black text-xs">{q.correctOption}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Questions Details */}
                {previewResult.questions.map((q) => (
                  <div key={q.index} className="p-3 bg-surface-card rounded-lg border border-surface-border text-xs">
                    <div className="font-bold text-text-main mb-1.5 flex items-start gap-1">
                      <span className="text-parish-primary shrink-0">Câu {q.index}:</span>
                      <span>{q.question}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 pl-3">
                      {(['A', 'B', 'C', 'D'] as const).map(opt => (
                        <div
                          key={opt}
                          className={`p-1.5 rounded border text-[11px] transition-colors ${
                            q.correctOption === opt
                              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold'
                              : 'bg-surface-hover/60 border-surface-border text-text-muted'
                          }`}
                        >
                          <span className="font-black mr-1">{opt}.</span> {q.options[opt]}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-text-muted text-xs text-center p-4">
                <HelpCircle size={32} className="opacity-30 mb-2" />
                <p className="m-0">Chưa có dữ liệu phân tích.</p>
                <p className="m-0 text-[11px] opacity-75">Dán đề thi hoặc chọn file Excel để hệ thống tự động nhận diện.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-surface-border pt-4 mt-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            {previewResult?.ok && (
              <span>Sẵn sàng áp dụng cho <strong>{previewResult.questionCount} câu hỏi</strong></span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
              Hủy
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!previewResult || !previewResult.ok || previewResult.questions.length === 0}
              className="btn btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check size={14} /> Áp Dụng Vào Phiên Chấm
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
