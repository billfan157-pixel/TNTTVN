import React, { useMemo, useState } from 'react'
import { AlertTriangle, Layers3, Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import { EXAM_VERSION_CODES, normalizeAnswerVariants } from '../../lib/examVariants'
import { useExamStore } from '../../stores/examStore'
import type { ExamSession, ExamVersionCode, MultipleChoiceOption } from '../../types'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { ModalPortal } from '../common/ModalPortal'

interface ExamVariantsModalProps {
  session: ExamSession
  onClose: () => void
}

const OPTIONS: MultipleChoiceOption[] = ['A', 'B', 'C', 'D']

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
  const { updateAnswerVariants, saving } = useExamStore()
  const configured = EXAM_VERSION_CODES.filter(code => Boolean(variants[code]))
  const activeKey = variants[activeVersion] ?? {}

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
            <button key={code} type="button" onClick={() => setActiveVersion(code)} className={`min-h-10 rounded-xl border px-4 text-sm font-black ${activeVersion === code ? 'border-parish-primary bg-parish-primary text-white' : 'border-surface-border bg-surface-app text-text-main'}`}>Mã {code}</button>
          ))}
          <button type="button" className="btn btn-secondary min-h-10" onClick={addVersion} disabled={configured.length === EXAM_VERSION_CODES.length}><Plus size={15} /> Thêm mã đề</button>
          {activeVersion !== 'A' && <button type="button" className="btn btn-danger min-h-10" onClick={() => removeVersion(activeVersion)}><Trash2 size={15} /> Xóa mã {activeVersion}</button>}
        </div>

        {message && <div role="status" className="mx-3 mt-3 rounded-xl border border-surface-border bg-surface-app px-3 py-2 text-sm font-semibold">{message}</div>}
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Không xóa hoặc đổi một mã đề sau khi phát bài nếu chưa đối chiếu bản in. B–H hiện dùng với phiếu trả lời rời và đề đảo bên ngoài; chức năng In Đề &amp; Phiếu Gộp chưa tự đảo nội dung câu hỏi nên vẫn là mã A. Khi lưu, mọi kết quả OMR hiện có được máy chủ chấm lại theo đúng mã đề.
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: questionCount }, (_, index) => index + 1).map(question => (
              <div key={question} className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-app p-2">
                <span className="w-14 text-xs font-black text-text-muted">Câu {question}</span>
                <div className="grid flex-1 grid-cols-4 gap-1">
                  {OPTIONS.map(option => <button key={option} type="button" onClick={() => choose(question, option)} className={`min-h-10 rounded-lg border text-sm font-black ${activeKey[question] === option ? 'border-parish-primary bg-parish-primary text-white' : 'border-surface-border bg-surface-card text-text-main'}`}>{option}</button>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-surface-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-text-muted">Đã cấu hình {configured.length}/8 mã đề · đang sửa mã {activeVersion}</span>
          <button type="button" className="btn btn-primary min-h-11 justify-center" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Lưu và chấm lại</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
