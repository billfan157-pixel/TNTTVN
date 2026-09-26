import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Layers3, Loader2, LockKeyhole, Plus, Save, Trash2, WandSparkles, WifiOff, X } from 'lucide-react'
import { EXAM_VERSION_CODES, formatExamVersionLabel, normalizeAnswerVariants } from '../../lib/examVariants'
import { useExamStore } from '../../stores/examStore'
import type { ExamQuestion, ExamSession, ExamVersionCode, MultipleChoiceOption } from '../../types'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { ModalPortal } from '../common/ModalPortal'

interface ExamVariantsModalProps {
  session: ExamSession
  onClose: () => void
}

const OPTIONS: MultipleChoiceOption[] = ['A', 'B', 'C', 'D']

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

  const mc = questions.filter(q => (q.type ?? 'multiple_choice') !== 'essay')
  if (mc.length !== questionCount) {
    return {
      canGenerate: false,
      totalMc: mc.length,
      issues: [`Số câu trắc nghiệm (${mc.length}) không khớp với cấu hình phiên (${questionCount} câu).`],
    }
  }

  const issues: string[] = []
  const positional = /(?:tất cả|cả\s+[abcd]|không có đáp án|all of|none of|both\s+[abcd])/iu

  for (const q of mc) {
    if (!q.options || !q.correctOption) {
      issues.push(`Câu ${q.index}: Thiếu danh sách lựa chọn A/B/C/D hoặc đáp án đúng.`)
      continue
    }
    const values = (['A', 'B', 'C', 'D'] as const).map(code => (q.options![code] || '').trim().toLocaleLowerCase('vi'))
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
  const { dialogRef: trapRef } = useAccessibleDialog(true, onClose)
  const [activeVersion, setActiveVersion] = useState<ExamVersionCode>('A')
  const [message, setMessage] = useState('')
  const [variantCount, setVariantCount] = useState(4)
  const [manifestLocked, setManifestLocked] = useState(Boolean(session.variantManifests))
  const { updateAnswerVariants, generateVariantManifests, saving } = useExamStore()
  const configured = EXAM_VERSION_CODES.filter(code => Boolean(variants[code]))
  const activeKey = variants[activeVersion] ?? {}

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
    const generated = await generateVariantManifests(variantCount)
    if (!generated) return
    const next = normalizeAnswerVariants(generated.answerVariants, generated.answerKey, questionCount)
    setVariants(next)
    setActiveVersion('A')
    setManifestLocked(true)
    setMessage(`Đã tạo và khóa ${Object.keys(next).length} mã đề. Bản in/QR sẽ dùng đúng manifest đã lưu trên máy chủ.`)
  }

  return (
    <ModalPortal>
    <div role="dialog" aria-modal="true" aria-labelledby="variants-title" className="app-modal-layer fixed inset-0 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <div ref={trapRef} className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h4 id="variants-title" className="m-0 flex items-center gap-2 font-black text-parish-primary"><Layers3 size={18} /> Đáp án theo mã đề</h4>
            <p className="m-0 text-[11px] text-text-muted">Mỗi phiếu mang mã đề trong QR; máy chủ luôn chấm lại bằng đáp án tương ứng.</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}><X size={15} /> Đóng</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-surface-border p-3">
          {configured.map(code => (
            <button
              key={code}
              type="button"
              onClick={() => setActiveVersion(code)}
              className={`min-h-10 rounded-xl border px-4 text-sm font-black ${activeVersion === code ? 'border-parish-primary bg-parish-primary text-white' : 'border-surface-border bg-surface-app text-text-main'}`}
            >
              {formatExamVersionLabel(code)}
            </button>
          ))}
          {!manifestLocked && <button type="button" className="btn btn-secondary min-h-10" onClick={addVersion} disabled={configured.length === EXAM_VERSION_CODES.length}><Plus size={15} /> Thêm mã đề</button>}
          {!manifestLocked && activeVersion !== 'A' && <button type="button" className="btn btn-danger min-h-10" onClick={() => removeVersion(activeVersion)}><Trash2 size={15} /> Xóa {formatExamVersionLabel(activeVersion)}</button>}
        </div>

        {message && <div role="status" className="mx-3 mt-3 rounded-xl border border-surface-border bg-surface-app px-3 py-2 text-sm font-semibold">{message}</div>}
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-parish-warning/30 bg-parish-warning-bg p-3 text-xs text-parish-warning">
            {manifestLocked ? <LockKeyhole size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <span>
              {manifestLocked
                ? 'Bộ mã đề đã được máy chủ vật chất hóa và khóa bất biến. Mỗi mã có thứ tự câu, thứ tự đáp án, answer key và content hash riêng.'
                : 'Có thể nhập đáp án cho đề đảo bên ngoài, hoặc dùng Exam Studio để máy chủ tạo 1–8 mã đề bất biến. Sau khi tạo tự động, không thể sửa riêng answer key hay đảo lại phiên này.'}
            </span>
          </div>
          {!manifestLocked && (
            <div className="mb-3 flex flex-col gap-3 rounded-xl border border-parish-primary/20 bg-parish-primary-light p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-parish-primary">Exam Studio — tạo đề tự động</div>
                  <div className="text-xs text-text-muted">Trộn câu trắc nghiệm và A/B/C/D; giữ phần tự luận sau phần OMR. Câu có “tất cả/không đáp án nào” sẽ được phát hiện trước.</div>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-text-main">
                  Số mã
                  <select className="form-select min-h-10 w-20" value={variantCount} onChange={event => setVariantCount(Number(event.target.value))}>
                    {EXAM_VERSION_CODES.map((_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
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
                  <span>Đang ngoại tuyến. Việc tạo và khóa mã đề đòi hỏi máy chủ tính toán PRNG và băm nội dung để bảo đảm bất biến khi in/chấm.</span>
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: questionCount }, (_, index) => index + 1).map(question => (
              <div key={question} className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-app p-2">
                <span className="w-14 text-xs font-black text-text-muted">Câu {question}</span>
                <div className="grid flex-1 grid-cols-4 gap-1">
                  {OPTIONS.map(option => <button key={option} type="button" disabled={manifestLocked} onClick={() => choose(question, option)} className={`min-h-10 rounded-lg border text-sm font-black disabled:cursor-not-allowed ${activeKey[question] === option ? 'border-parish-primary bg-parish-primary text-white' : 'border-surface-border bg-surface-card text-text-main'}`}>{option}</button>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-surface-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-text-muted">Đã cấu hình {configured.length}/8 mã đề · đang sửa {formatExamVersionLabel(activeVersion)}</span>
          {!manifestLocked && <button type="button" className="btn btn-primary min-h-11 justify-center" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Lưu và chấm lại</button>}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
