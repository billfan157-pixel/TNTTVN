import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Upload, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { QuestionDifficulty } from '../../types'
import { parseQuestionBankFile, toQuestionBankImportItems, type QuestionBankFileParseResult } from '../../utils/questionBankImport'
import { ModalShell } from '../common/ModalShell'
import { Button, Badge } from '../common/ui'
import type { QuestionBranchOption, QuestionClassOption } from './QuestionEditorModal'

interface QuestionBankImportModalProps {
  isOpen: boolean
  branches: QuestionBranchOption[]
  classes: QuestionClassOption[]
  onClose: () => void
  onImported: (count: number) => void
}

export function QuestionBankImportModal({ isOpen, branches, classes, onClose, onImported }: QuestionBankImportModalProps) {
  const [branchId, setBranchId] = useState('')
  const [classId, setClassId] = useState('')
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('recognition')
  const [tags, setTags] = useState('')
  const [lesson, setLesson] = useState('')
  const [lessonOrder, setLessonOrder] = useState('')
  const [topic, setTopic] = useState('')
  const [result, setResult] = useState<QuestionBankFileParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setResult(null)
    setError(null)
    setProcessing(false)
  }, [isOpen])

  const classOptions = useMemo(() => classes.filter(cls => cls.branchId === branchId), [branchId, classes])
  const selectedClass = classes.find(cls => cls.id === classId)
  const canImport = Boolean(result?.parsed.ok && result.parsed.questions.length && branchId && selectedClass && !processing)

  const handleFile = async (file?: File) => {
    if (!file) return
    setProcessing(true)
    setError(null)
    setResult(null)
    try {
      setResult(await parseQuestionBankFile(file))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đọc file đã chọn.')
    } finally {
      setProcessing(false)
    }
  }

  const handleImport = async () => {
    if (!result || !selectedClass || !canImport) return
    setProcessing(true)
    setError(null)
    try {
      const items = toQuestionBankImportItems(result, {
        branchId,
        curriculumLevel: selectedClass.name,
        difficulty,
        tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
        lesson: lesson || null,
        lessonOrder: lessonOrder ? Number(lessonOrder) : null,
        topic: topic || null,
      })
      const response = await api.importQuestionBankItems(items)
      onImported(response.importedCount)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import thất bại; không có câu hỏi nào được tạo.')
    } finally {
      setProcessing(false)
    }
  }

  const warnings = [...(result?.extractorWarnings ?? []), ...(result?.parsed.warnings ?? [])]

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Import câu hỏi từ Excel / Word"
      subtitle="Tệp được phân tích cục bộ trên trình duyệt, cho phép kiểm tra danh sách câu hỏi trước khi tạo nháp."
      icon={<FileSpreadsheet className="h-5 w-5 text-parish-primary" />}
      maxWidth="980px"
      closeOnOverlay={!processing}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={processing}>
            Hủy
          </Button>
          <Button loading={processing} disabled={!canImport} onClick={() => void handleImport()}>
            Import {result?.parsed.questions.length ?? 0} câu ở trạng thái nháp
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
        {/* Cột trái: Thiết lập thuộc tính áp dụng chung */}
        <div className="space-y-3">
          <div className="rounded-xl border border-surface-border bg-surface-sunken p-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
              1. Phân loại chung cho tệp
            </h4>
            <div className="space-y-2.5">
              <div className="form-group">
                <label className="form-label text-xs" htmlFor="qbi-branch">
                  Ngành bắt buộc <span className="text-parish-danger">*</span>
                </label>
                <select
                  id="qbi-branch"
                  className="form-select min-h-10 w-full text-sm"
                  value={branchId}
                  onChange={event => {
                    setBranchId(event.target.value)
                    setClassId('')
                  }}
                >
                  <option value="">-- Chọn ngành áp dụng --</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label text-xs" htmlFor="qbi-class">
                  Khối lớp bắt buộc <span className="text-parish-danger">*</span>
                </label>
                <select
                  id="qbi-class"
                  className="form-select min-h-10 w-full text-sm"
                  value={classId}
                  disabled={!branchId}
                  onChange={event => setClassId(event.target.value)}
                >
                  <option value="">-- Chọn lớp áp dụng --</option>
                  {classOptions.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}{cls.academicYear ? ` · ${cls.academicYear}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label text-xs" htmlFor="qbi-difficulty">
                  Mức độ mặc định
                </label>
                <select
                  id="qbi-difficulty"
                  className="form-select min-h-10 w-full text-sm"
                  value={difficulty}
                  onChange={event => setDifficulty(event.target.value as QuestionDifficulty)}
                >
                  <option value="recognition">Nhận biết (Cơ bản)</option>
                  <option value="understanding">Thông hiểu</option>
                  <option value="application">Vận dụng</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="qbi-lesson">Bài học</label>
                  <input
                    id="qbi-lesson"
                    className="form-input min-h-9 text-xs"
                    value={lesson}
                    onChange={event => setLesson(event.target.value)}
                    placeholder="VD: Bài 5"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="qbi-lesson-order">Thứ tự bài</label>
                  <input
                    id="qbi-lesson-order"
                    className="form-input min-h-9 text-xs"
                    type="number"
                    min="0"
                    value={lessonOrder}
                    onChange={event => setLessonOrder(event.target.value)}
                    placeholder="Số TT"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-xs" htmlFor="qbi-topic">Chủ đề bài học</label>
                <input
                  id="qbi-topic"
                  className="form-input min-h-9 w-full text-xs"
                  value={topic}
                  onChange={event => setTopic(event.target.value)}
                  placeholder="VD: Bí tích Khai Tâm"
                />
              </div>

              <div className="form-group">
                <label className="form-label text-xs" htmlFor="qbi-tags">Tags (phân cách bằng dấu phẩy)</label>
                <input
                  id="qbi-tags"
                  className="form-input min-h-9 w-full text-xs"
                  value={tags}
                  onChange={event => setTags(event.target.value)}
                  placeholder="on-tap, hoc-ky-1..."
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-surface-border bg-surface-card p-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
              2. Chọn tệp tải lên
            </h4>
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-parish-primary/40 bg-parish-primary-light/40 p-4 text-center transition-colors hover:border-parish-primary hover:bg-parish-primary-light">
              <Upload className="mb-2 h-6 w-6 text-parish-primary" />
              <span className="text-sm font-bold text-text-main">Chọn file Excel hoặc Word</span>
              <span className="mt-1 text-xs text-text-muted">
                .xlsx, .xls, .csv, .docx
              </span>
              <span className="mt-0.5 text-xs text-text-muted">
                Tối đa 5 MB · 50 câu/file
              </span>
              <input
                className="sr-only"
                type="file"
                accept=".xlsx,.xls,.csv,.docx"
                onChange={event => void handleFile(event.target.files?.[0])}
              />
            </label>
          </div>
        </div>

        {/* Cột phải: Xem trước kết quả nhận diện */}
        <div className="flex flex-col min-h-96 rounded-2xl border border-surface-border bg-surface-sunken p-4">
          <div className="border-b border-surface-border pb-2.5 mb-3 flex items-center justify-between">
            <div>
              <h4 className="typography-card-title text-text-main text-sm font-bold">
                Xem trước nội dung phân tích
              </h4>
              <p className="text-xs text-text-muted mt-0.5">
                Kiểm tra câu hỏi và đáp án trước khi chính thức ghi nhận vào Ngân hàng.
              </p>
            </div>
            {result && (
              <Badge tone="info">
                {result.kind === 'word' ? 'Word .docx' : 'Excel'}
              </Badge>
            )}
          </div>

          {processing && !result && (
            <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-parish-primary border-t-transparent mb-3" />
              <p className="text-sm font-medium text-text-secondary">Đang đọc và phân tích cấu trúc tệp...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[var(--color-parish-danger)]/30 bg-[var(--color-parish-danger-bg)] p-3 text-sm text-[var(--color-parish-danger)] flex items-start gap-2.5 mb-3">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Lỗi xử lý file</strong>
                <span>{error}</span>
              </div>
            </div>
          )}

          {!result && !error && !processing && (
            <div className="flex flex-1 flex-col items-center justify-center text-center p-8 text-text-muted">
              <FileSpreadsheet className="h-10 w-10 text-text-muted/50 mb-2" />
              <p className="text-sm font-medium">Chưa có tệp nào được chọn.</p>
              <p className="text-xs mt-1 max-w-sm">
                Vui lòng chọn Ngành, Khối lớp và tải lên tệp mẫu .docx hoặc .xlsx để hệ thống tự động bóc tách câu hỏi.
              </p>
            </div>
          )}

          {result && (
            <div className="flex-1 space-y-3 overflow-y-auto">
              <div className="rounded-xl border border-surface-border bg-surface-card p-3 flex items-center justify-between gap-3">
                <div>
                  <h5 className="font-bold text-text-main text-sm truncate max-w-md">{result.fileName}</h5>
                  <p className="text-xs text-text-muted mt-0.5 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-parish-success" />
                    <span>Nhận diện: <strong>{result.parsed.mcQuestionCount}</strong> câu trắc nghiệm · <strong>{result.parsed.essayQuestionCount}</strong> câu tự luận</span>
                  </p>
                </div>
                <Badge tone={result.parsed.ok ? 'success' : 'warning'}>
                  {result.parsed.ok ? 'Cấu trúc hợp lệ' : 'Cần kiểm tra'}
                </Badge>
              </div>

              {result.parsed.errors.length > 0 && (
                <div className="rounded-xl border border-[var(--color-parish-danger)]/30 bg-[var(--color-parish-danger-bg)] p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-parish-danger)]">
                    <AlertCircle className="h-4 w-4" />
                    <span>Các lỗi phát hiện ({result.parsed.errors.length})</span>
                  </div>
                  {result.parsed.errors.map((item, idx) => (
                    <p key={idx} className="text-xs text-[var(--color-parish-danger)] pl-5">
                      • {item}
                    </p>
                  ))}
                </div>
              )}

              {warnings.length > 0 && (
                <details className="rounded-xl border border-[var(--color-parish-warning)]/30 bg-[var(--color-parish-warning-bg)] p-2.5 text-xs text-text-secondary">
                  <summary className="cursor-pointer font-bold text-[var(--color-parish-warning)] flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{warnings.length} cảnh báo cần lưu ý (bấm để xem)</span>
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {warnings.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Danh sách câu hỏi mẫu nhận diện ({result.parsed.questions.length} câu)
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {result.parsed.questions.slice(0, 15).map(question => (
                    <div
                      key={question.index}
                      className="rounded-xl border border-surface-border bg-surface-card p-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-text-main">
                          Câu {question.index}: {question.question}
                        </span>
                        <span className="shrink-0 font-bold text-parish-primary">
                          {question.type === 'essay' ? 'Tự luận' : `Đáp án: ${question.correctOption}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {result.parsed.questions.length > 15 && (
                  <p className="text-center text-xs font-medium text-text-muted pt-1">
                    ...và {result.parsed.questions.length - 15} câu hỏi khác sẽ được import đồng thời trong lô này.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

export default QuestionBankImportModal
