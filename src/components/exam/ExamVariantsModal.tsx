import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronDown, ClipboardList, Eye, FileCheck2, FileText, Layers3, Loader2, LockKeyhole, Plus, Save, ShieldCheck, SlidersHorizontal, Trash2, WandSparkles, WifiOff } from 'lucide-react'
import { EXAM_SHUFFLE_CHOICES, EXAM_VERSION_CODES, formatExamVersionLabel, normalizeAnswerVariants, planExamShuffle } from '../../lib/examVariants'
import { api } from '../../lib/api'
import { useExamStore } from '../../stores/examStore'
import type { ExamQuestion, ExamSession, ExamShuffleMode, ExamShufflePolicy, ExamVariantManifestSet, ExamVariantPreview, ExamVersionCode, MultipleChoiceOption } from '../../types'
import { ModalShell } from '../common/ModalShell'
import { EmptyState } from '../common/StateFeedback'
import { Badge, Button, FilterChips, Surface, TabPanel, Tabs } from '../common/ui'

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
  questions?: ExamQuestion[]
  plan?: ReturnType<typeof planExamShuffle>
}

function lintQuestionsForVariants(rawQuestions: unknown, questionCount: number, shuffleMode: ExamShuffleMode, policy: ExamShufflePolicy, held: number[]): VariantLintResult {
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
  for (const q of questions) {
    if (q.type === 'essay' && (q.isPlaceholder || typeof q.question !== 'string' || !q.question.trim())) {
      issues.push('Câu ' + q.index + ': cần nội dung tự luận hợp lệ.')
    }
    if (q.explanation !== undefined && typeof q.explanation !== 'string') issues.push('Câu ' + q.index + ': lời giải phải là văn bản.')
  }

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
  }

  return {
    canGenerate: issues.length === 0,
    totalMc: mc.length,
    issues,
    questions,
    plan: issues.length === 0 ? planExamShuffle(questions, shuffleMode, policy, held) : undefined,
  }
}

function ExamVariantPreviewPanel({ manifest }: { manifest: ExamVariantManifestSet }) {
  const codes = Object.keys(manifest.variants) as ExamVersionCode[]
  const [version, setVersion] = useState<ExamVersionCode>(codes.includes('B') ? 'B' : 'A')
  const [questionIndex, setQuestionIndex] = useState(0)
  useEffect(() => { setVersion(manifest.variants.B ? 'B' : 'A'); setQuestionIndex(0) }, [manifest])
  const entry = manifest.variants[version] ?? manifest.variants.A
  const questions = entry?.questions.filter(question => question.type !== 'essay') ?? []
  const question = questions[questionIndex] ?? questions[0]
  if (!entry || !question) return null
  const sourceIndex = entry.sourceQuestionOrder[question.index - 1]
  const sourceEntry = manifest.variants.A!
  const source = sourceEntry.questions[sourceEntry.sourceQuestionOrder.indexOf(sourceIndex)]
  if (!source) return null
  return (
    <section aria-label="Xem trước nội dung mã đề" className="min-w-0 space-y-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="form-group !mb-0 min-w-0"><span className="form-label">Mã xem trước</span>
          <select className="form-select w-full" value={version} onChange={event => { setVersion(event.target.value as ExamVersionCode); setQuestionIndex(0) }}>
            {codes.map(code => <option key={code} value={code}>{formatExamVersionLabel(code)}</option>)}
          </select>
        </label>
        <label className="form-group !mb-0 min-w-0"><span className="form-label">Câu xem trước</span>
          <select className="form-select w-full" value={questionIndex} onChange={event => setQuestionIndex(Number(event.target.value))}>
            {questions.map((item, index) => <option key={item.index} value={index}>Câu {item.index} · gốc {entry.sourceQuestionOrder[item.index - 1]}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-text-secondary" aria-live="polite">
        <span>Câu gốc <strong className="text-text-main">{sourceIndex}</strong></span>
        <ArrowRight size={13} aria-hidden="true" />
        <span>Câu <strong className="text-text-main">{question.index}</strong></span>
        <span className="ml-auto font-medium">Đáp án {sourceEntry.answerKey[source.index]} → {entry.answerKey[question.index]}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ title: 'Đề gốc · Mã A', item: source, key: sourceEntry.answerKey[source.index], original: true },
          { title: formatExamVersionLabel(version), item: question, key: entry.answerKey[question.index], original: false }].map(pane => (
          <Surface key={pane.title} variant="panel" className="min-w-0 overflow-hidden !shadow-none">
            <div className={'flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-3.5 py-3 ' + (pane.original ? 'bg-surface-sunken' : 'bg-parish-primary-light')}>
              <h5 className={'m-0 text-sm font-bold ' + (pane.original ? 'text-text-main' : 'text-parish-primary')}>{pane.title}</h5>
              <Badge tone={pane.original ? 'neutral' : 'primary'}>Đáp án {pane.key}</Badge>
            </div>
            <div className="space-y-3 p-3.5">
              <p className={'m-0 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed ' + (!pane.original && pane.item.question !== source.question ? 'text-parish-primary' : 'text-text-main')}>{pane.item.question}</p>
              <ol className="m-0 list-none space-y-2 p-0">
                {OPTIONS.map(code => {
                  const originalCode = pane.original ? code : entry.optionOrders[question.index]?.[OPTIONS.indexOf(code)]
                  const changed = !pane.original && originalCode && pane.item.options?.[code] !== source.options?.[originalCode]
                  const correct = pane.key === code
                  return (
                    <li key={code} className={'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm leading-relaxed ' + (correct ? 'border-parish-success/30 bg-parish-success-bg text-parish-success' : 'border-surface-border text-text-main')}>
                      <span className="shrink-0 font-bold">{code}.</span>
                      <span className={'min-w-0 flex-1 break-words ' + (changed ? 'font-semibold text-parish-primary' : '')}>
                        {pane.item.options?.[code]}
                        {changed && <span className="mt-1 block text-xs font-normal text-text-muted">Đã cập nhật tham chiếu</span>}
                      </span>
                      {correct && <Check size={15} className="mt-0.5 shrink-0" aria-label="Đáp án đúng" />}
                    </li>
                  )
                })}
              </ol>
              {pane.item.explanation && <details className="text-xs text-text-secondary">
                <summary className="min-h-11 content-center cursor-pointer font-semibold">Lời giải</summary>
                <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">{pane.item.explanation}</p>
              </details>}
            </div>
          </Surface>
        ))}
      </div>
      <p className="m-0 flex items-center gap-1.5 text-xs text-text-secondary"><CheckCircle2 size={14} className="shrink-0 text-parish-success" aria-hidden="true" /> Lựa chọn đúng được đánh dấu để dễ đối chiếu.</p>
    </section>
  )
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
  const [shufflePolicy, setShufflePolicy] = useState<ExamShufflePolicy>('fixed_aggregates')
  const [heldQuestions, setHeldQuestions] = useState<number[]>([])
  const [preview, setPreview] = useState<ExamVariantPreview>()
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [confirmedRewrite, setConfirmedRewrite] = useState(false)
  const [manualDirty, setManualDirty] = useState(false)
  const [workspace, setWorkspace] = useState<'automatic' | 'manual'>('automatic')
  const workspaceTabsId = useId()
  const previewPanelRef = useRef<HTMLElement>(null)
  const previewRequest = useRef(0)
  const { updateAnswerVariants, generateVariantManifests, saving, error } = useExamStore()
  const busy = saving || previewing
  const configured = EXAM_VERSION_CODES.filter(code => Boolean(variants[code]))
  const activeKey = variants[activeVersion] ?? {}
  const activeManifest = manifest?.variants[activeVersion]
  const close = () => { if (!busy) onClose() }

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
    () => lintQuestionsForVariants(session.questions, questionCount, shuffleMode, shufflePolicy, heldQuestions),
    [session.questions, questionCount, shuffleMode, shufflePolicy, heldQuestions],
  )
  const maxVariants = Math.max(1, lintResult.plan?.layouts.length ?? 1)
  useEffect(() => { setVariantCount(count => Math.min(count, maxVariants)) }, [maxVariants])
  useEffect(() => {
    if (!lintResult.questions) return
    const valid = new Set(lintResult.questions.filter(q => q.type !== 'essay').map(q => q.index))
    setHeldQuestions(current => current.every(index => valid.has(index)) ? current : current.filter(index => valid.has(index)))
  }, [lintResult.questions])
  useEffect(() => {
    previewRequest.current++
    setPreview(undefined)
    setConfirmedRewrite(false)
    setPreviewError('')
  }, [variantCount, shuffleMode, shufflePolicy, heldQuestions, session.id, session.questions, session.answerKey, session.answerVariants])
  useEffect(() => () => { previewRequest.current++ }, [])
  useEffect(() => {
    if (preview && window.matchMedia?.('(max-width: 1023px)').matches) {
      previewPanelRef.current?.scrollIntoView?.({ block: 'start' })
    }
  }, [preview])

  const addVersion = () => {
    const nextCode = EXAM_VERSION_CODES.find(code => !variants[code])
    if (!nextCode) return
    setVariants(current => ({ ...current, [nextCode]: { ...(current.A ?? {}) } }))
    setActiveVersion(nextCode)
    setMessage('')
    setManualDirty(true)
    setPreview(undefined)
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
    setManualDirty(true)
    setPreview(undefined)
  }

  const choose = (question: number, option: MultipleChoiceOption) => {
    setVariants(current => ({
      ...current,
      [activeVersion]: { ...(current[activeVersion] ?? {}), [question]: option },
    }))
    setMessage('')
    setManualDirty(true)
    setPreview(undefined)
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
    setManualDirty(false)
    setMessage(`Đã lưu ${configured.length} mã đề; chấm lại ${result.rescored} kết quả, bỏ qua ${result.skipped} kết quả không có dữ liệu đáp án.`)
  }

  const previewVariants = async () => {
    if (manualDirty) return
    const requestId = ++previewRequest.current
    setMessage('')
    setPreviewError('')
    setPreview(undefined)
    setConfirmedRewrite(false)
    setPreviewing(true)
    try {
      const next = await api.previewExamVariantManifests(session.id, variantCount, shuffleMode, { shufflePolicy, heldQuestionIndices: heldQuestions })
      if (requestId === previewRequest.current) setPreview(next)
    } catch (err) {
      if (requestId === previewRequest.current) setPreviewError((err as Error).message || 'Không thể xem trước mã đề.')
    } finally {
      setPreviewing(false)
    }
  }

  const generate = async () => {
    if (manualDirty || !preview || (shufflePolicy === 'rewrite_aggregates' && !confirmedRewrite)) return
    setMessage('')
    const generated = await generateVariantManifests(variantCount, shuffleMode, {
      shufflePolicy, heldQuestionIndices: heldQuestions, seed: preview.manifests.seed,
      expectedDefinitionHash: preview.definitionHash, analysisHash: preview.manifests.analysisHash,
    }, session.id)
    if (!generated) { setPreview(undefined); return }
    const next = normalizeAnswerVariants(generated.answerVariants, generated.answerKey, generated.questionCount ?? questionCount)
    setVariants(next)
    setActiveVersion('A')
    setManifest(readManifest(generated.variantManifests))
    setMessage(`Đã tạo ${Object.keys(next).length} mã đề khác nhau. Có thể chọn từng mã để đối chiếu câu gốc và đáp án, rồi mở In đề để xem bản in.`)
  }

  const automaticWorkspace = !manifestLocked && workspace === 'automatic'
  const previewDisabled = busy || manualDirty || !session.questions || !lintResult.canGenerate || !isOnline
  const generateDisabled = previewDisabled || !preview || (shufflePolicy === 'rewrite_aggregates' && !confirmedRewrite)

  return (
    <ModalShell isOpen onClose={close} title="Đáp án theo mã đề" icon={<Layers3 size={20} />} maxWidth="1120px"
      subtitle="Trộn thông minh, đối chiếu rõ ràng."
      closeOnOverlay={!busy}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2 text-xs text-text-secondary">
            {manifestLocked ? <LockKeyhole size={16} className="mt-0.5 shrink-0 text-parish-primary" /> : <ShieldCheck size={16} className="mt-0.5 shrink-0 text-parish-primary" />}
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 font-semibold text-text-main">{manifestLocked ? `${configured.length} mã đề đã khóa` : automaticWorkspace ? preview ? 'Đã có bản xem trước' : 'Kiểm tra trước khi khóa' : `${configured.length}/8 mã đề · ${formatExamVersionLabel(activeVersion)}`}</p>
              <p className="m-0">{manifestLocked ? 'Nội dung và đáp án được lưu cùng nhau.' : automaticWorkspace ? 'Sau khi tạo, đáp án được khóa cùng nội dung đề.' : 'Lưu đáp án sẽ chấm lại các bài đã có dữ liệu.'}</p>
            </div>
          </div>
          {automaticWorkspace ? (
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
              <Button variant="secondary" className="min-h-11 justify-center" disabled={previewDisabled} onClick={() => void previewVariants()}
                loading={previewing} leadingIcon={<Eye size={16} aria-hidden="true" />}>Xem trước</Button>
              <Button className="min-h-11 justify-center" disabled={generateDisabled} onClick={() => void generate()} loading={saving}
                title={!isOnline ? 'Cần kết nối mạng để tạo và khóa mã đề trên máy chủ' : !lintResult.canGenerate ? 'Cần sửa các câu hỏi có vấn đề trước khi tạo' : !preview ? 'Xem trước nội dung trước khi tạo và khóa' : undefined}
                leadingIcon={<LockKeyhole size={16} aria-hidden="true" />}>Tạo và khóa</Button>
            </div>
          ) : manifestLocked ? (
            <Button variant="secondary" className="min-h-11 justify-center" onClick={close}>Hoàn tất</Button>
          ) : (
            <Button className="min-h-11 justify-center" disabled={busy || !isOnline} onClick={() => void save()} loading={saving}
              leadingIcon={<Save size={16} aria-hidden="true" />}>Lưu và chấm lại</Button>
          )}
        </div>
      }>
      <div className="min-w-0 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-main">
            <FileText size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
            <span className="break-words">{session.subject}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{questionCount} câu trắc nghiệm</Badge>
            <Badge tone={manifestLocked ? 'success' : 'primary'} icon={manifestLocked ? <LockKeyhole size={12} aria-hidden="true" /> : undefined}>{manifestLocked ? 'Đã khóa mã đề' : 'Mã A là đề gốc'}</Badge>
          </div>
        </div>

        {!manifestLocked && <Tabs id={workspaceTabsId} ariaLabel="Cách thiết lập mã đề" value={workspace} onValueChange={setWorkspace}
          className="w-full sm:!w-fit [&>.view-tab]:flex-1 [&>.view-tab]:min-h-11"
          items={[
            { value: 'automatic', label: 'Trộn tự động', icon: <WandSparkles size={16} aria-hidden="true" />, disabled: busy },
            { value: 'manual', label: 'Nhập đáp án', icon: <ClipboardList size={16} aria-hidden="true" />, disabled: busy },
          ]} />}

        {message && <div role="status" className="flex items-start gap-2 rounded-xl border border-parish-success/30 bg-parish-success-bg px-3.5 py-3 text-sm text-parish-success"><CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{message}</span></div>}
        {error && <div role="alert" className="rounded-xl border border-parish-danger/30 bg-parish-danger-bg px-3.5 py-3 text-sm text-parish-danger">{error}</div>}
        {previewError && <div role="alert" className="rounded-xl border border-parish-danger/30 bg-parish-danger-bg px-3.5 py-3 text-sm text-parish-danger">{previewError}</div>}
        {!isOnline && !manifestLocked && <div className="flex items-center gap-2 rounded-xl border border-parish-danger/30 bg-parish-danger-bg px-3.5 py-3 text-xs font-medium text-parish-danger">
          <WifiOff size={16} className="shrink-0" aria-hidden="true" /><span>Cần kết nối mạng để tạo và lưu mã đề.</span>
        </div>}
        {manualDirty && !manifestLocked && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-parish-warning/30 bg-parish-warning-bg px-3.5 py-2 text-xs text-parish-warning">
          <span>Có đáp án chỉnh sửa chưa lưu. Bấm “Lưu và chấm lại” trước khi xem trước bộ mã tự động.</span>
          {automaticWorkspace && <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setWorkspace('manual')} trailingIcon={<ArrowRight size={14} aria-hidden="true" />}>Đến phần nhập đáp án</Button>}
        </div>}

        {!manifestLocked && <TabPanel tabsId={workspaceTabsId} value="automatic" activeValue={workspace}>
          <div className="grid min-w-0 items-start gap-3.5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
            <div className="min-w-0 space-y-3.5">
              <Surface as="section" className="overflow-hidden !shadow-none" aria-label="Cấu hình trộn">
                <div className="flex items-center gap-2.5 border-b border-surface-border px-4 py-3.5">
                  <SlidersHorizontal size={17} className="text-parish-primary" aria-hidden="true" />
                  <h4 className="typography-card-title m-0">Cấu hình trộn</h4>
                </div>
                <div className="space-y-3.5 p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-start gap-3">
                    <label className="form-group !mb-0 min-w-0">
                      <span className="form-label">Kiểu trộn</span>
                      <select className="form-select w-full min-w-0" value={shuffleMode} disabled={busy} onChange={event => setShuffleMode(event.target.value as ExamShuffleMode)}>
                        {EXAM_SHUFFLE_CHOICES.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                      </select>
                    </label>
                    <label className="form-group !mb-0 min-w-0">
                      <span className="form-label">Số mã</span>
                      <select className="form-select w-full" value={variantCount} disabled={busy} onChange={event => setVariantCount(Number(event.target.value))}>
                        {EXAM_VERSION_CODES.slice(0, maxVariants).map((_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                      </select>
                    </label>
                  </div>
                  <p className="m-0 text-xs leading-relaxed text-text-secondary">{EXAM_SHUFFLE_CHOICES.find(choice => choice.value === shuffleMode)?.description}</p>
                  <div className="flex flex-wrap gap-1.5" aria-label="Các mã đề sẽ tạo">
                    {EXAM_VERSION_CODES.slice(0, variantCount).map(code => <Badge key={code} tone={code === 'A' ? 'neutral' : 'primary'}>{code === 'A' ? 'A · Gốc' : `Mã ${code}`}</Badge>)}
                  </div>
                  <div className="border-t border-surface-border pt-3.5">
                    <label className="form-group !mb-0 min-w-0">
                      <span className="form-label">Xử lý lựa chọn tổng hợp</span>
                      <select className="form-select w-full min-w-0" value={shufflePolicy} disabled={busy || shuffleMode === 'questions_only'} onChange={event => setShufflePolicy(event.target.value as ExamShufflePolicy)}>
                        <option value="fixed_aggregates">Giữ vị trí lựa chọn tổng hợp</option>
                        <option value="rewrite_aggregates">Cập nhật cách diễn đạt sau trộn</option>
                      </select>
                    </label>
                    <p className="mb-0 mt-2 text-xs leading-relaxed text-text-secondary">{shuffleMode === 'questions_only' ? 'Lựa chọn A/B/C/D được giữ nguyên khi chỉ trộn câu.' : shufflePolicy === 'fixed_aggregates' ? 'Giữ vị trí các lựa chọn như “tất cả các ý trên”, trộn phần còn lại.' : 'Có thể đổi “trên/dưới” thành nhãn cụ thể. Cần xem trước và xác nhận.'}</p>
                  </div>
                  {lintResult.questions && <details className="group border-t border-surface-border text-xs text-text-secondary">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-text-main [&::-webkit-details-marker]:hidden">
                      Giữ thứ tự lựa chọn theo câu
                      <span className="flex shrink-0 items-center gap-2">{heldQuestions.length > 0 && <Badge tone="primary">{heldQuestions.length}</Badge>}<ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true" /></span>
                    </summary>
                    <p className="mb-2 mt-0 leading-relaxed">Chọn thêm câu cần giữ nguyên vị trí A/B/C/D.</p>
                    <div className="grid max-h-48 grid-cols-2 gap-x-2 overflow-y-auto">
                      {lintResult.questions.filter(item => item.type !== 'essay').map(item => <label key={item.index} className="flex min-h-11 cursor-pointer items-center gap-2">
                        <input type="checkbox" className="form-checkbox" disabled={busy} checked={heldQuestions.includes(item.index)}
                          onChange={event => setHeldQuestions(current => event.target.checked ? [...current, item.index].sort((a, b) => a - b) : current.filter(index => index !== item.index))} />
                        Giữ lựa chọn câu {item.index}
                      </label>)}
                    </div>
                  </details>}
                </div>
              </Surface>

              {lintResult.plan && <Surface as="section" className="space-y-3 p-4 !shadow-none" aria-label="Phân tích đề">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="m-0 text-sm font-bold text-text-main">Phân tích đề</h4>
                  <Badge tone="success" icon={<CheckCircle2 size={12} aria-hidden="true" />}>Sẵn sàng</Badge>
                </div>
                <dl className="m-0 grid grid-cols-3 divide-x divide-surface-border" aria-live="polite">
                  {[{ status: 'free', label: 'Độc lập' }, { status: 'constrained', label: 'Tham chiếu' }, { status: 'held', label: 'Giữ lựa chọn' }].map(item => <div key={item.status} className="px-1 text-center">
                    <dd className="m-0 text-lg font-bold tabular-nums text-text-main">{lintResult.plan!.summaries.filter(summary => summary.status === item.status).length}</dd>
                    <dt className="mt-1 text-xs text-text-secondary">{item.label}</dt>
                  </div>)}
                </dl>
                <p className="m-0 border-t border-surface-border pt-3 text-xs text-text-secondary">{lintResult.plan.capacityExact ? 'Tạo được tối đa ' : 'Đã tìm được '}<strong className="text-text-main">{maxVariants} mã khác nhau</strong>.</p>
                {lintResult.plan.orderReasons.map(reason => <p className="m-0 text-xs leading-relaxed text-parish-warning" key={reason}>{reason}</p>)}
                {lintResult.plan.summaries.some(item => item.status !== 'free') && <ul className="m-0 max-h-32 list-disc space-y-1.5 overflow-y-auto pl-4 text-xs leading-relaxed text-text-secondary">
                  {lintResult.plan.summaries.filter(item => item.status !== 'free').map(item => <li key={item.sourceIndex}>Câu {item.sourceIndex}: {shuffleMode === 'questions_only' ? 'giữ lựa chọn A/B/C/D.' : item.reasons.join(' ')} ({item.validOrderCount} thứ tự lựa chọn)</li>)}
                </ul>}
              </Surface>}
              {lintResult.issues.length > 0 && <div className="space-y-2 rounded-xl border border-parish-danger/30 bg-parish-danger-bg p-3.5 text-xs text-parish-danger">
                <div className="flex items-start gap-2 font-bold"><AlertTriangle size={16} className="shrink-0" aria-hidden="true" /><span>Phát hiện {lintResult.issues.length} vấn đề cần xử lý trước khi đảo đề:</span></div>
                <ul className="m-0 list-disc space-y-1 pl-5">{lintResult.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
              </div>}
            </div>

            <Surface ref={previewPanelRef} as="section" className="min-w-0 scroll-mt-1 overflow-hidden !shadow-none" aria-label="Bản xem trước">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-4 py-3.5">
                <div className="flex items-center gap-2.5"><Eye size={17} className="text-parish-primary" aria-hidden="true" /><h4 className="typography-card-title m-0">Xem trước & đối chiếu</h4></div>
                <Badge tone={preview ? 'success' : 'neutral'}>{preview ? 'Chưa khóa' : 'Chưa tạo bản xem trước'}</Badge>
              </div>
              <div className="min-w-0 p-4">
                {preview ? <div className="space-y-3.5">
                  <ExamVariantPreviewPanel manifest={preview.manifests} />
                  {shufflePolicy === 'rewrite_aggregates' && <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border border-parish-warning/30 bg-parish-warning-bg p-3 text-sm leading-relaxed text-text-main">
                    <input type="checkbox" className="form-checkbox mt-1 shrink-0" checked={confirmedRewrite} disabled={busy} onChange={event => setConfirmedRewrite(event.target.checked)} />
                    Tôi đã xem các tập lựa chọn được tham chiếu và đồng ý cách diễn đạt sau trộn.
                  </label>}
                </div> : previewing ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center" role="status">
                  <Loader2 size={28} className="animate-spin text-parish-primary" aria-hidden="true" />
                  <p className="m-0 text-sm font-semibold text-text-main">Đang chuẩn bị bản xem trước…</p>
                </div> : <div>
                  <EmptyState icon={FileCheck2} title="Xem rõ từng thay đổi" description="Chọn cấu hình rồi bấm “Xem trước” để so sánh đề gốc và đề sau trộn, trước khi tạo bộ mã." className="!px-2 !py-10 sm:!py-12" />
                  <ol className="m-0 grid list-none gap-3 border-t border-surface-border p-0 pt-3.5 sm:grid-cols-3">
                    {[{ title: 'Chọn cách trộn', detail: 'Thiết lập kiểu và số mã' }, { title: 'Đối chiếu nội dung', detail: 'Kiểm tra câu và đáp án' }, { title: 'Tạo và khóa', detail: 'Lưu bộ mã để in, chấm' }].map((step, index) => <li key={step.title} className="flex items-start gap-2 sm:flex-col">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-parish-primary-light text-xs font-bold text-parish-primary">{index + 1}</span>
                      <div><p className="m-0 text-xs font-semibold text-text-main">{step.title}</p><p className="mb-0 mt-1 text-xs leading-relaxed text-text-secondary">{step.detail}</p></div>
                    </li>)}
                  </ol>
                </div>}
              </div>
              <div className="flex items-start gap-2 border-t border-surface-border bg-surface-sunken px-4 py-3 text-xs leading-relaxed text-text-secondary">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-parish-primary" aria-hidden="true" />
                <span>Mã A giữ đề gốc. Câu chưa rõ giữ thứ tự lựa chọn; phần tự luận giữ thứ tự và điểm.</span>
              </div>
            </Surface>
          </div>
        </TabPanel>}

        {(manifestLocked || workspace === 'manual') && <div {...(!manifestLocked ? { id: `${workspaceTabsId}-panel-manual`, role: 'tabpanel', 'aria-labelledby': `${workspaceTabsId}-tab-manual`, tabIndex: 0 } : {})} className="min-w-0 space-y-3.5">
          <div className="flex items-start gap-2.5 rounded-xl border border-surface-border bg-surface-sunken p-3.5 text-xs leading-relaxed text-text-secondary">
            {manifestLocked ? <LockKeyhole size={17} className="mt-0.5 shrink-0 text-parish-primary" aria-hidden="true" /> : <ClipboardList size={17} className="mt-0.5 shrink-0 text-parish-primary" aria-hidden="true" />}
            <span>{manifestLocked
              ? `Đã lưu bộ mã đề: ${EXAM_SHUFFLE_CHOICES.find(choice => choice.value === (manifest?.shuffleMode ?? 'questions_and_options'))?.label}. Mỗi mã dùng nội dung và đáp án đã lưu trên máy chủ. Chỉ có thể sửa toàn bộ đề khi chưa từng chấm bài.`
              : 'Dùng cho đề đã trộn bên ngoài. Chọn mã đề rồi nhập đáp án đúng cho từng câu; mã A là đáp án gốc bắt buộc.'}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterChips ariaLabel="Chọn mã đề" value={activeVersion} onValueChange={setActiveVersion} className="flex-wrap"
              items={configured.map(code => ({ value: code, label: formatExamVersionLabel(code) }))} />
            {!manifestLocked && <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" className="min-h-11" onClick={addVersion} disabled={busy || configured.length === EXAM_VERSION_CODES.length} leadingIcon={<Plus size={15} aria-hidden="true" />}>Thêm mã đề</Button>
              {activeVersion !== 'A' && <Button variant="danger" size="sm" className="min-h-11" disabled={busy} onClick={() => removeVersion(activeVersion)} leadingIcon={<Trash2 size={15} aria-hidden="true" />}>Xóa {formatExamVersionLabel(activeVersion)}</Button>}
            </div>}
          </div>
          {activeManifest ? <section aria-label={`Đối chiếu mã ${activeVersion}`} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="typography-card-title m-0">Đối chiếu {formatExamVersionLabel(activeVersion)}</h4><Badge tone="neutral">{questionCount} đáp án</Badge></div>
            <p className="m-0 text-xs leading-relaxed text-text-secondary">Lựa chọn gốc cho biết A/B/C/D trên mã này lấy từ lựa chọn nào của đề A.</p>
            <div className="table-scroll rounded-xl border border-surface-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b-2 border-surface-border bg-surface-app text-xs font-bold uppercase tracking-wider text-text-muted"><tr>
                  <th scope="col" className="px-2.5 py-2.5 sm:px-4.5">Câu</th><th scope="col" className="px-2.5 py-2.5 sm:px-4.5">Gốc</th><th scope="col" className="px-2.5 py-2.5 sm:px-4.5">Lựa chọn gốc</th><th scope="col" className="px-2.5 py-2.5 sm:px-4.5">Đáp án</th>
                </tr></thead>
                <tbody>{activeManifest.questions.filter(q => q.type !== 'essay').map(q => <tr key={q.index} className="border-t border-surface-border hover:bg-surface-hover">
                  <th scope="row" className="px-2.5 py-2.5 font-semibold sm:px-4.5">{q.index}</th>
                  <td className="px-2.5 py-2.5 text-text-secondary sm:px-4.5">{activeManifest.sourceQuestionOrder[q.index - 1]}</td>
                  <td className="whitespace-nowrap px-2.5 py-2.5 font-mono text-text-secondary sm:px-4.5">{activeManifest.optionOrders[q.index]?.join('·')}</td>
                  <td className="px-2.5 py-2.5 font-bold text-parish-primary sm:px-4.5">{activeManifest.answerKey[q.index]}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section> : <section aria-label={`Nhập đáp án mã ${activeVersion}`} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="typography-card-title m-0">Đáp án {formatExamVersionLabel(activeVersion)}</h4>
              <Badge tone={Object.keys(activeKey).length === questionCount ? 'success' : 'warning'}>{Object.keys(activeKey).length}/{questionCount} câu đã nhập</Badge>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: questionCount }, (_, index) => index + 1).map(question => <div key={question} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-surface-border bg-surface-card px-3 py-2.5">
                <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-text-secondary">Câu {question}</span>
                <div className="grid min-w-0 flex-1 grid-cols-4 gap-1">
                  {OPTIONS.map(option => <Button key={option} variant={activeKey[question] === option ? 'primary' : 'secondary'} className="min-h-11 !px-0" aria-label={`Câu ${question}, đáp án ${option}`} aria-pressed={activeKey[question] === option} disabled={manifestLocked || busy} onClick={() => choose(question, option)}>{option}</Button>)}
                </div>
              </div>)}
            </div>
          </section>}
        </div>}
      </div>
    </ModalShell>
  )
}
