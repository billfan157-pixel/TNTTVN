import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { api } from '../../lib/api'
import type { QuestionDifficulty } from '../../types'
import { parseQuestionBankFile, toQuestionBankImportItems, type QuestionBankFileParseResult } from '../../utils/questionBankImport'
import { ModalShell } from '../common/ModalShell'
import { Button } from '../common/ui'
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
    setResult(null); setError(null); setProcessing(false)
  }, [isOpen])

  const classOptions = useMemo(() => classes.filter(cls => cls.branchId === branchId), [branchId, classes])
  const selectedClass = classes.find(cls => cls.id === classId)
  const canImport = Boolean(result?.parsed.ok && result.parsed.questions.length && branchId && selectedClass && !processing)

  const handleFile = async (file?: File) => {
    if (!file) return
    setProcessing(true); setError(null); setResult(null)
    try { setResult(await parseQuestionBankFile(file)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể đọc file đã chọn.') }
    finally { setProcessing(false) }
  }

  const handleImport = async () => {
    if (!result || !selectedClass || !canImport) return
    setProcessing(true); setError(null)
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Import thất bại; không có câu hỏi nào được tạo.') }
    finally { setProcessing(false) }
  }

  const warnings = [...(result?.extractorWarnings ?? []), ...(result?.parsed.warnings ?? [])]
  return <ModalShell
    isOpen={isOpen}
    onClose={onClose}
    title="Import câu hỏi từ Excel / Word"
    subtitle="File được đọc tại thiết bị, preview trước và chỉ gửi dữ liệu câu hỏi đã chuẩn hóa lên server."
    icon={<FileSpreadsheet className="h-5 w-5" />}
    maxWidth="960px"
    closeOnOverlay={!processing}
    footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose} disabled={processing}>Hủy</Button><Button loading={processing} disabled={!canImport} onClick={() => void handleImport()}>Import {result?.parsed.questions.length ?? 0} câu ở trạng thái nháp</Button></div>}
  >
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">
        <select className="form-select min-h-11 w-full" value={branchId} onChange={event => { setBranchId(event.target.value); setClassId('') }}><option value="">Chọn ngành bắt buộc</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        <select className="form-select min-h-11 w-full" value={classId} disabled={!branchId} onChange={event => setClassId(event.target.value)}><option value="">Chọn lớp bắt buộc</option>{classOptions.map(cls => <option key={cls.id} value={cls.id}>{cls.name}{cls.academicYear ? ` · ${cls.academicYear}` : ''}</option>)}</select>
        <select className="form-select min-h-11 w-full" value={difficulty} onChange={event => setDifficulty(event.target.value as QuestionDifficulty)}><option value="recognition">Nhận biết</option><option value="understanding">Thông hiểu</option><option value="application">Vận dụng</option></select>
        <input className="form-input min-h-11 w-full" value={lesson} onChange={event => setLesson(event.target.value)} placeholder="Bài (áp dụng toàn file)" />
        <input className="form-input min-h-11 w-full" type="number" min="0" value={lessonOrder} onChange={event => setLessonOrder(event.target.value)} placeholder="Số thứ tự bài" />
        <input className="form-input min-h-11 w-full" value={topic} onChange={event => setTopic(event.target.value)} placeholder="Chủ đề" />
        <input className="form-input min-h-11 w-full" value={tags} onChange={event => setTags(event.target.value)} placeholder="Tags, cách nhau bằng dấu phẩy" />
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-parish-primary/30 bg-parish-primary/5 p-4 text-center">
          <Upload className="mb-2 h-6 w-6 text-parish-primary" /><span className="text-sm font-extrabold text-text-main">Chọn file Excel hoặc Word</span><span className="mt-1 text-xs text-text-muted">.xlsx, .xls, .csv, .docx · tối đa 5 MB và 50 câu/file</span>
          <input className="sr-only" type="file" accept=".xlsx,.xls,.csv,.docx" onChange={event => void handleFile(event.target.files?.[0])} />
        </label>
      </div>
      <div className="min-h-72 rounded-xl bg-surface-sunken p-4">
        {processing && !result ? <p className="text-sm font-semibold text-text-muted">Đang đọc và phân tích file…</p> : null}
        {error && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-semibold text-danger">{error}</p>}
        {!result && !error && <div className="flex h-full min-h-64 items-center justify-center text-center text-sm text-text-muted">Chọn ngành, lớp và file để xem preview trước khi import.</div>}
        {result && <div className="space-y-3"><div><span className="badge badge-info">{result.kind === 'word' ? 'Word .docx' : 'Excel'}</span><h3 className="mt-2 font-extrabold text-text-main">{result.fileName}</h3><p className="text-sm text-text-muted">Nhận diện {result.parsed.mcQuestionCount} câu trắc nghiệm · {result.parsed.essayQuestionCount} câu tự luận.</p></div>
          {result.parsed.errors.map(item => <p key={item} className="rounded-lg bg-danger/10 p-2 text-sm font-semibold text-danger">{item}</p>)}
          {warnings.length > 0 && <details className="rounded-lg border border-warning/30 bg-warning/10 p-2 text-sm text-text-secondary"><summary className="cursor-pointer font-bold">{warnings.length} cảnh báo cần kiểm tra</summary><ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></details>}
          <div className="max-h-72 space-y-2 overflow-y-auto">{result.parsed.questions.slice(0, 12).map(question => <div key={question.index} className="rounded-lg border border-surface-border bg-surface-card p-2 text-sm"><strong>Câu {question.index}:</strong> {question.question}<span className="ml-2 text-xs font-semibold text-text-muted">{question.type === 'essay' ? 'Tự luận' : `Đáp án ${question.correctOption}`}</span></div>)}</div>
          {result.parsed.questions.length > 12 && <p className="text-xs font-semibold text-text-muted">Còn {result.parsed.questions.length - 12} câu khác sẽ được import cùng batch.</p>}
        </div>}
      </div>
    </div>
  </ModalShell>
}

export default QuestionBankImportModal
