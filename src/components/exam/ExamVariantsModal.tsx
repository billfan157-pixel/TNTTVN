import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Layers3, Loader2, LockKeyhole, Plus, Save, Trash2, WandSparkles, WifiOff } from 'lucide-react'
import { EXAM_SHUFFLE_CHOICES, EXAM_VERSION_CODES, formatExamVersionLabel, normalizeAnswerVariants } from '../../lib/examVariants'
import { useExamStore } from '../../stores/examStore'
import type { ExamQuestion, ExamSession, ExamShuffleMode, ExamVariantManifestSet, ExamVersionCode, MultipleChoiceOption } from '../../types'
import { ModalShell } from '../common/ModalShell'

interface ExamVariantsModalProps {
  session: ExamSession
  onClose: () => void
}

const OPTIONS: MultipleChoiceOption[] = ['A', 'B', 'C', 'D']

function readManifest(value: ExamSession['variantManifests']): ExamVariantManifestSet | undefined {
  if (!value) return undefined
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return parsed?.schemaVersion === 1 && parsed.variants && typeof parsed.variants === 'object' && !Array.isArray(parsed.variants)
      ? parsed as ExamVariantManifestSet : undefined
  } catch { return undefined }
}

interface VariantLintResult {
  canGenerate: boolean
  totalMc: number
  issues: string[]
}

function lintQuestionsForVariants(rawQuestions: unknown, questionCount: number): VariantLintResult {
  let questions: ExamQuestion[] = []
  if (Array.isArray(rawQuestions)) {
    questions = rawQuestions as ExamQuestion[]
  } else if (typeof rawQuestions === 'string' && rawQuestions.trim()) {
    try {
      const parsed = JSON.parse(rawQuestions)
      if (Array.isArray(parsed)) questions = parsed as ExamQuestion[]
    } catch {
      return { canGenerate: false, totalMc: 0, issues: ['Dữ liệu câu hỏi của phiên không phải định dạng JSON hợp lệ.'] }
    }
  }

  if (questions.length === 0) {
    return { canGenerate: false, totalMc: 0, issues: ['Phiên chưa có nội dung câu hỏi để tự động đảo đề.'] }
  }
  if (questions.some(q => !q || typeof q !== 'object' || Array.isArray(q))) {
    return { canGenerate: false, totalMc: 0, issues: ['Danh sách câu hỏi chứa dữ liệu không hợp lệ.'] }
  }

  const mc = questions.filter(q => (q.type ?? 'multiple_choice') !== 'essay')
  if (mc.length !== questionCount) {
    return {
      canGenerate: false,
      totalMc: mc.length,
      issues: [`Số câu trắc nghiệm (${mc.length}) không khớp với cấu hình phiên (${questionCount} câu).`],
    }
  }

  const issues: string[] = []
  if (questions.some(q => !Number.isInteger(q.index) || q.index < 1) || new Set(questions.map(q => q.index)).size !== questions.length) {
    issues.push('Số thứ tự câu hỏi phải là số nguyên dương và không trùng nhau.')
  }
  const positional = /(?:tất cả|cả\s+[abcd]|không có đáp án|all of|none of|both\s+[abcd])/iu

  for (const q of mc) {
    if (q.isPlaceholder || typeof q.question !== 'string' || !q.question.trim()) {
      issues.push(`Câu ${q.index}: Cần nhập nội dung câu hỏi thật.`)
    }
    if (!q.options || !OPTIONS.includes(q.correctOption!) || OPTIONS.some(code => typeof q.options![code] !== 'string' || !q.options![code].trim())) {
      issues.push(`Câu ${q.index}: Thiếu danh sách lựa chọn A/B/C/D hoặc đáp án đúng.`)
      continue
    }
    const values = OPTIONS.map(code => q.options![code].normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('vi'))
    if (new Set(values).size !== values.length) {
      issues.push(`Câu ${q.index}: Có phương án trùng lặp nội dung.`)
    }
    if (values.some(v => positional.test(v))) {
      issues.push(`Câu ${q.index}: Có phương án phụ thuộc vị trí ("tất cả các đáp án", "không có đáp án nào"...). Cần sửa trước khi đảo.`)
    }
  }

  return {
    canGenerate: issues.length === 0,
    totalMc: mc.length,
    issues,
  }
}

export const ExamVariantsModal: React.FC<ExamVariantsModalProps> = ({ session, onClose }) => {
  const questionCount = session.questionCount ?? 20
  const initial = useMemo(
    () => normalizeAnswerVariants(session.answerVariants, session.answerKey, questionCount),
    [session.answerVariants, session.answerKey, questionCount],
  )
  const [variants, setVariants] = useState(initial)
  const [activeVersion, setActiveVersion] = useState<ExamVersionCode>('A')
  const [message, setMessage] = useState('')
  const [variantCount, setVariantCount] = useState(4)
  const [manifest, setManifest] = useState(() => readManifest(session.variantManifests))
  const manifestLocked = Boolean(manifest || session.variantManifests)
  const [shuffleMode, setShuffleMode] = useState<ExamShuffleMode>(manifest?.shuffleMode ?? 'questions_and_options')
  const { updateAnswerVariants, generateVariantManifests, saving, error } = useExamStore()
  const configured = EXAM_VERSION_CODES.filter(code => Boolean(variants[code]))
  const activeKey = variants[activeVersion] ?? {}
  const activeManifest = manifest?.variants[activeVersion]
  const close = () => { if (!saving) onClose() }

  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const lintResult = useMemo(
    () => lintQuestionsForVariants(session.questions, questionCount),
    [session.questions, questionCount],
  )
  const maxVariants = shuffleMode !== 'questions_only' ? 8
    : lintResult.totalMc < 2 ? 1 : lintResult.totalMc === 2 ? 2 : lintResult.totalMc === 3 ? 6 : 8
  useEffect(() => { setVariantCount(count => Math.min(count, maxVariants)) }, [maxVariants])

  const addVersion = () => {
    const nextCode = EXAM_VERSION_CODES.find(code => !variants[code])
    if (!nextCode) return
    setVariants(current => ({ ...current, [nextCode]: { ...(current.A ?? {}) } }))
    setActiveVersion(nextCode)
    setMessage('')
  }

  const removeVersion = (code: ExamVersionCode) => {
    if (code === 'A') return
    setVariants(current => {
      const next = { ...current }
      delete next[code]
      return next
    })
    setActiveVersion('A')
    setMessage('')
  }

  const choose = (question: number, option: MultipleChoiceOption) => {
    setVariants(current => ({
      ...current,
      [activeVersion]: { ...(current[activeVersion] ?? {}), [question]: option },
    }))
    setMessage('')
  }

  const save = async () => {
    if (manifestLocked) {
      setMessage('Bộ mã đề tự động đã khóa bất biến; không thể sửa đáp án riêng lẻ.')
      return
    }
    if (!variants.A) {
      setMessage('Mã đề A là đáp án gốc bắt buộc.')
      return
    }
    for (const code of configured) {
      const count = Object.keys(variants[code] ?? {}).length
      if (count !== questionCount) {
        setMessage(`Mã đề ${code} còn thiếu ${questionCount - count} đáp án.`)
        setActiveVersion(code)
        return
      }
    }
    const result = await updateAnswerVariants(variants, questionCount)
    if (!result) return
    setMessage(`Đã lưu ${configured.length} mã đề; chấm lại ${result.rescored} kết quả, bỏ qua ${result.skipped} kết quả không có dữ liệu đáp án.`)
  }

  const generate = async () => {
    setMessage('')
    const generated = await generateVariantManifests(variantCount, shuffleMode)
    if (!generated) return
    const next = normalizeAnswerVariants(generated.answerVariants, generated.answerKey, generated.questionCount ?? questionCount)
    setVariants(next)
    setActiveVersion('A')
    setManifest(readManifest(generated.variantManifests))
    setMessage(`Đã tạo ${Object.keys(next).length} mã đề khác nhau. Có thể chọn từng mã để đối chiếu câu gốc và đáp án, rồi mở In đề để xem bản in.`)
  }

  return (
    <ModalShell isOpen onClose={close} title="Đáp án theo mã đề" icon={<Layers3 size={20} />} maxWidth="960px"
      subtitle="Tạo mã đề và đối chiếu đáp án trước khi in."
      closeOnOverlay={!saving}
      footer={<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-text-muted">Đã cấu hình {configured.length}/8 mã đề · đang {manifestLocked ? 'xem' : 'sửa'} {formatExamVersionLabel(activeVersion)}</span>
        {!manifestLocked && <button type="button" className="btn btn-primary min-h-11 justify-center" disabled={saving || !isOnline} onClick={() => void save()}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Lưu và chấm lại</button>}
      </div>}>
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Chọn mã đề">
          {configured.map(code => (
            <button
              key={code}
              type="button"
              onClick={() => setActiveVersion(code)}
              aria-pressed={activeVersion === code}
              className={`btn ${activeVersion === code ? 'btn-primary' : 'btn-secondary'}`}
            >
              {formatExamVersionLabel(code)}
            </button>
          ))}
          {!manifestLocked && <button type="button" className="btn btn-secondary" onClick={addVersion} disabled={saving || configured.length === EXAM_VERSION_CODES.length}><Plus size={15} /> Thêm mã đề</button>}
          {!manifestLocked && activeVersion !== 'A' && <button type="button" className="btn btn-danger" disabled={saving} onClick={() => removeVersion(activeVersion)}><Trash2 size={15} /> Xóa {formatExamVersionLabel(activeVersion)}</button>}
        </div>

        {message && <div role="status" className="mb-3 rounded-xl border border-parish-success/30 bg-parish-success-bg px-3 py-2 text-sm text-parish-success">{message}</div>}
        {error && <div role="alert" className="mb-3 rounded-xl border border-parish-danger/30 bg-parish-danger-bg px-3 py-2 text-sm text-parish-danger">{error}</div>}
        <div>
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-parish-warning/30 bg-parish-warning-bg p-3 text-xs text-parish-warning">
            {manifestLocked ? <LockKeyhole size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <span>
              {manifestLocked
                ? `Đã lưu bộ mã đề: ${EXAM_SHUFFLE_CHOICES.find(choice => choice.value === (manifest?.shuffleMode ?? 'questions_and_options'))?.label}. Mỗi mã dùng nội dung và đáp án đã lưu trên máy chủ.`
                : 'Có thể nhập đáp án cho đề trộn bên ngoài, hoặc tạo mã tự động bên dưới. Sau khi tạo, đáp án được khóa cùng nội dung đề. Chỉ có thể sửa toàn bộ đề khi chưa từng chấm bài.'}
            </span>
          </div>
          {!manifestLocked && (
            <div className="mb-3 flex flex-col gap-3 rounded-xl border border-parish-primary/20 bg-parish-primary-light p-3">
              <div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-parish-primary">Tạo mã đề tự động</div>
                  <div className="text-xs text-text-muted">Mã A giữ đề gốc. Các mã B–H trộn theo lựa chọn; phần tự luận giữ thứ tự và điểm sau phần trắc nghiệm.</div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <label className="form-group !mb-0">
                  <span className="form-label">Kiểu trộn</span>
                  <select className="form-select w-full" value={shuffleMode} disabled={saving} onChange={event => setShuffleMode(event.target.value as ExamShuffleMode)}>
                    {EXAM_SHUFFLE_CHOICES.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-text-main">
                  Số mã
                  <select className="form-select w-20" value={variantCount} disabled={saving} onChange={event => setVariantCount(Number(event.target.value))}>
                    {EXAM_VERSION_CODES.slice(0, maxVariants).map((_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-primary min-h-10"
                  disabled={saving || !session.questions || !lintResult.canGenerate || !isOnline}
                  title={!isOnline ? 'Cần kết nối mạng để tạo và khóa mã đề trên máy chủ' : !lintResult.canGenerate ? 'Cần sửa các câu hỏi có vấn đề trước khi tạo' : undefined}
                  onClick={() => void generate()}
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <WandSparkles size={15} />} Tạo và khóa
                </button>
              </div>

              {!isOnline && (
                <div className="flex items-center gap-2 rounded-lg border border-parish-danger/30 bg-parish-danger-bg p-2 text-xs font-medium text-parish-danger">
                  <WifiOff size={15} className="shrink-0" />
                  <span>Cần kết nối mạng để tạo và lưu mã đề.</span>
                </div>
              )}

              {lintResult.issues.length > 0 && (
                <div className="flex flex-col gap-1 rounded-lg border border-parish-danger/30 bg-parish-danger-bg p-2 text-xs text-parish-danger">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>Phát hiện {lintResult.issues.length} vấn đề cần xử lý trước khi đảo đề:</span>
                  </div>
                  <ul className="m-0 list-disc pl-5 space-y-0.5">
                    {lintResult.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {lintResult.canGenerate && session.questions && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-parish-success">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>Sẵn sàng đảo {lintResult.totalMc} câu trắc nghiệm sang {variantCount} mã đề ({EXAM_VERSION_CODES.slice(0, variantCount).map(c => formatExamVersionLabel(c)).join(', ')}).</span>
                </div>
              )}
            </div>
          )}
          {activeManifest && <section aria-label={`Đối chiếu mã ${activeVersion}`} className="space-y-3">
            <h4 className="typography-card-title m-0">Đối chiếu {formatExamVersionLabel(activeVersion)}</h4>
            <p className="m-0 text-xs text-text-muted">Thứ tự lựa chọn gốc cho biết A/B/C/D trên mã này lấy từ lựa chọn nào của đề A.</p>
            <div className="table-scroll rounded-xl border border-surface-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-app text-text-muted"><tr><th scope="col" className="px-4.5 py-2.5">Câu trên đề</th><th scope="col" className="px-4.5 py-2.5">Câu gốc</th><th scope="col" className="px-4.5 py-2.5">Thứ tự lựa chọn gốc</th><th scope="col" className="px-4.5 py-2.5">Đáp án</th></tr></thead>
                <tbody>{activeManifest.questions.filter(q => q.type !== 'essay').map(q => <tr key={q.index} className="border-t border-surface-border">
                  <th scope="row" className="px-4.5 py-2.5">{q.index}</th>
                  <td className="px-4.5 py-2.5">{activeManifest.sourceQuestionOrder[q.index - 1]}</td>
                  <td className="whitespace-nowrap px-4.5 py-2.5 font-mono">{activeManifest.optionOrders[q.index]?.join('·')}</td>
                  <td className="px-4.5 py-2.5 font-bold text-parish-primary">{activeManifest.answerKey[q.index]}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>}
          {!activeManifest && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: questionCount }, (_, index) => index + 1).map(question => (
              <div key={question} className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-app p-2">
                <span className="w-14 text-xs font-black text-text-muted">Câu {question}</span>
                <div className="grid flex-1 grid-cols-4 gap-1">
                  {OPTIONS.map(option => <button key={option} type="button" aria-label={`Câu ${question}, đáp án ${option}`} aria-pressed={activeKey[question] === option} disabled={manifestLocked || saving} onClick={() => choose(question, option)} className={`btn !px-0 ${activeKey[question] === option ? 'btn-primary' : 'btn-secondary'}`}>{option}</button>)}
                </div>
              </div>
            ))}
          </div>}
        </div>
    </ModalShell>
  )
}
