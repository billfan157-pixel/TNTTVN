import { useEffect, useMemo, useState } from 'react'
import { Archive, BookOpenCheck, CheckCircle2, FilePlus2, Layers3, Plus, Search, Send, Sparkles } from 'lucide-react'
import { api, type QuestionBankMutationInput } from '../../lib/api'
import type { ExamBlueprint, ExamBlueprintRule, QuestionBankItem, QuestionBankStatus, QuestionBankType, QuestionDifficulty } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { Button, Surface } from '../common/ui'

const TYPE_LABELS: Record<QuestionBankType, string> = {
  multiple_choice: 'Trắc nghiệm', true_false: 'Đúng / Sai', multiple_select: 'Nhiều đáp án', short_answer: 'Trả lời ngắn',
  fill_blank: 'Điền khuyết', matching: 'Nối cặp', essay: 'Tự luận',
}
const STATUS_LABELS: Record<QuestionBankStatus, string> = { draft: 'Nháp', in_review: 'Chờ duyệt', approved: 'Đã duyệt', active: 'Đang dùng', archived: 'Lưu trữ' }
const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = { recognition: 'Nhận biết', understanding: 'Thông hiểu', application: 'Vận dụng' }

type ViewTab = 'questions' | 'blueprints' | 'builder'
type QuestionForm = {
  questionType: 'multiple_choice' | 'essay'; stem: string; optionA: string; optionB: string; optionC: string; optionD: string;
  correctOption: 'A'|'B'|'C'|'D'; explanation: string; curriculumLevel: string; chapter: string; lesson: string;
  lessonOrder: string; topic: string; difficulty: QuestionDifficulty; tags: string; source: string;
}

const EMPTY_QUESTION: QuestionForm = {
  questionType: 'multiple_choice', stem: '', optionA: '', optionB: '', optionC: '', optionD: '', correctOption: 'A', explanation: '',
  curriculumLevel: '', chapter: '', lesson: '', lessonOrder: '', topic: '', difficulty: 'recognition', tags: '', source: '',
}

function mutationFromForm(form: QuestionForm): QuestionBankMutationInput {
  return {
    questionType: form.questionType,
    stem: form.stem,
    answerData: form.questionType === 'multiple_choice'
      ? { options: ['A','B','C','D'].map(id => ({ id, text: form[`option${id}` as keyof QuestionForm] })), correctOptionIds: [form.correctOption] }
      : { rubric: form.explanation || undefined },
    explanation: form.explanation || null,
    curriculumLevel: form.curriculumLevel || null,
    chapter: form.chapter || null,
    lesson: form.lesson || null,
    lessonOrder: form.lessonOrder ? Number(form.lessonOrder) : null,
    topic: form.topic || null,
    difficulty: form.difficulty,
    tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    source: form.source || null,
    provenance: 'human',
  }
}

function formFromQuestion(item: QuestionBankItem): QuestionForm {
  const answer = item.current.answerData
  const options = Array.isArray(answer.options) ? answer.options as Array<{id: string; text: string}> : []
  const option = (id: string) => options.find(value => value.id === id)?.text ?? ''
  const correct = Array.isArray(answer.correctOptionIds) ? String(answer.correctOptionIds[0] ?? 'A') : 'A'
  return {
    questionType: item.current.questionType === 'essay' ? 'essay' : 'multiple_choice', stem: item.current.stem,
    optionA: option('A'), optionB: option('B'), optionC: option('C'), optionD: option('D'), correctOption: /^[A-D]$/.test(correct) ? correct as 'A'|'B'|'C'|'D' : 'A',
    explanation: item.current.explanation ?? '', curriculumLevel: item.curriculumLevel ?? '', chapter: item.chapter ?? '', lesson: item.lesson ?? '',
    lessonOrder: item.lessonOrder == null ? '' : String(item.lessonOrder), topic: item.topic ?? '', difficulty: item.difficulty ?? 'recognition', tags: item.tags.join(', '), source: item.source ?? '',
  }
}

export function QuestionBankView() {
  const { role, user } = useAuth()
  const classes = useClassStore(state => state.classes)
  const resolveActiveYear = useAcademicYearStore(state => state.resolveActiveYear)
  const [tab, setTab] = useState<ViewTab>('questions')
  const [questions, setQuestions] = useState<QuestionBankItem[]>([])
  const [blueprints, setBlueprints] = useState<ExamBlueprint[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<QuestionBankItem | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<QuestionForm>(EMPTY_QUESTION)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<QuestionBankStatus | ''>('')
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | ''>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  const [bpName, setBpName] = useState('')
  const [bpLevel, setBpLevel] = useState('')
  const [bpRules, setBpRules] = useState<ExamBlueprintRule[]>([
    { questionType: 'multiple_choice', difficulty: 'recognition', questionCount: 4, pointsEach: 1 },
    { questionType: 'multiple_choice', difficulty: 'understanding', questionCount: 4, pointsEach: 1 },
    { questionType: 'multiple_choice', difficulty: 'application', questionCount: 2, pointsEach: 1 },
  ])
  const [build, setBuild] = useState({ mode: 'manual' as 'manual'|'blueprint', blueprintId: '', classId: '', subject: 'Giáo lý', scoreType: '1period', semester: 1 as 1|2, academicYear: resolveActiveYear(), maxScore: 10, variantCount: 1 })

  const loadQuestions = async () => {
    setLoading(true)
    try {
      const result = await api.listQuestionBank({ search: search || undefined, status: status || undefined, difficulty: difficulty || undefined, limit: 100 })
      setQuestions(result.items)
    } catch (error) { setMessage((error as Error).message) } finally { setLoading(false) }
  }
  const loadBlueprints = async () => {
    try { setBlueprints(await api.listExamBlueprints()) } catch (error) { setMessage((error as Error).message) }
  }
  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.all([api.listQuestionBank({ limit: 100 }), api.listExamBlueprints()])
      .then(([questionResult, blueprintResult]) => {
        if (!active) return
        setQuestions(questionResult.items)
        setBlueprints(blueprintResult)
      })
      .catch(error => { if (active) setMessage((error as Error).message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const updateConnectivity = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateConnectivity)
    window.addEventListener('offline', updateConnectivity)
    return () => {
      window.removeEventListener('online', updateConnectivity)
      window.removeEventListener('offline', updateConnectivity)
    }
  }, [])
  useEffect(() => { if (!build.classId && classes[0]) setBuild(value => ({ ...value, classId: classes[0].id })) }, [classes, build.classId])

  const filtered = useMemo(() => questions, [questions])
  const totalBpQuestions = bpRules.reduce((sum, rule) => sum + rule.questionCount, 0)
  const totalBpPoints = bpRules.reduce((sum, rule) => sum + rule.questionCount * rule.pointsEach, 0)

  const saveQuestion = async () => {
    if (!online) return setMessage('Tạo/sửa câu hỏi cần kết nối mạng để khóa version trên server.')
    setSaving(true); setMessage(null)
    try {
      const result = editingId ? await api.reviseQuestionBankItem(editingId, mutationFromForm(form)) : await api.createQuestionBankItem(mutationFromForm(form))
      setForm(EMPTY_QUESTION); setEditingId(null); setPreview(result); setMessage(editingId ? 'Đã tạo phiên bản mới; các đề lịch sử không thay đổi.' : 'Đã tạo câu hỏi nháp.')
      await loadQuestions()
    } catch (error) { setMessage((error as Error).message) } finally { setSaving(false) }
  }

  const lifecycle = async (item: QuestionBankItem, action: 'submit'|'approve'|'activate'|'archive'|'reject') => {
    if (!online) return setMessage('Workflow duyệt cần kết nối mạng.')
    try { const updated = await api.transitionQuestionBankItem(item.id, action); setPreview(updated); await loadQuestions() } catch (error) { setMessage((error as Error).message) }
  }

  const createBlueprintNow = async () => {
    if (!online) return setMessage('Tạo ma trận đề cần kết nối mạng.')
    try {
      const created = await api.createExamBlueprint({ name: bpName, curriculumLevel: bpLevel || null, totalQuestions: totalBpQuestions, maxScore: totalBpPoints, rules: bpRules })
      setBpName(''); setMessage(`Đã tạo ma trận “${created.name}” ở trạng thái nháp.`); await loadBlueprints()
    } catch (error) { setMessage((error as Error).message) }
  }

  const buildExam = async () => {
    if (!online) return setMessage('Sinh đề từ ngân hàng là thao tác server-authoritative và cần kết nối mạng.')
    try {
      const session = await api.buildExamFromQuestionBank({ ...build, questionIds: build.mode === 'manual' ? [...selected] : undefined, blueprintId: build.mode === 'blueprint' ? build.blueprintId : undefined })
      setMessage(`Đã tạo đề ${session.id} với snapshot bất biến. Đề đã xuất hiện trong tab Chấm bài.`)
      setSelected(new Set())
    } catch (error) { setMessage((error as Error).message) }
  }

  return (
    <div className="space-y-4">
      <Surface className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="typography-section-title flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-parish-primary" /> Ngân hàng câu hỏi & đề thi</h2><p className="mt-1 text-sm text-text-muted">Question Bank → Blueprint → Exam → Variant → OMR. Nội dung đề đã tạo luôn là snapshot bất biến.</p></div>
          <span className={`badge ${online ? 'badge-success' : 'badge-warning'}`}>{online ? 'Server sẵn sàng' : 'Chỉ đọc khi offline'}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Không gian ngân hàng câu hỏi">
          {([['questions','Câu hỏi'],['blueprints','Ma trận đề'],['builder','Tạo đề']] as const).map(([id,label]) => <Button key={id} size="sm" variant={tab === id ? 'primary' : 'secondary'} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</Button>)}
        </div>
      </Surface>

      {message && <Surface variant="sunken" className="border border-parish-primary/20 p-3 text-sm font-semibold text-text-secondary">{message}</Surface>}

      {tab === 'questions' && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <div className="space-y-3">
          <Surface className="p-3 sm:p-4"><div className="grid gap-2 sm:grid-cols-[1fr_160px_160px_auto]">
            <label className="relative"><Search aria-hidden className="absolute left-3 top-3.5 h-4 w-4 text-text-muted"/><input className="form-input min-h-11 w-full pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nội dung, bài, chủ đề, tag…" /></label>
            <select className="form-select min-h-11" value={status} onChange={e => setStatus(e.target.value as QuestionBankStatus|'')}><option value="">Mọi trạng thái</option>{Object.entries(STATUS_LABELS).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select>
            <select className="form-select min-h-11" value={difficulty} onChange={e => setDifficulty(e.target.value as QuestionDifficulty|'')}><option value="">Mọi mức độ</option>{Object.entries(DIFFICULTY_LABELS).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select>
            <Button onClick={() => void loadQuestions()} loading={loading}>Lọc</Button>
          </div></Surface>
          {filtered.length === 0 && !loading ? <Surface className="p-8 text-center text-sm text-text-muted">Chưa có câu hỏi phù hợp.</Surface> : filtered.map(item => {
            const checked = selected.has(item.id)
            return <Surface as="article" variant="entity" key={item.id} className="p-4">
              <div className="flex gap-3"><input aria-label={`Chọn ${item.current.stem}`} type="checkbox" className="mt-1 h-5 w-5" checked={checked} disabled={item.status !== 'active'} onChange={e => setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(item.id); else next.delete(item.id); return next })}/>
                <button className="min-w-0 flex-1 text-left" onClick={async () => { try { setPreview(await api.getQuestionBankItem(item.id)) } catch (error) { setMessage((error as Error).message) } }}>
                  <div className="flex flex-wrap gap-2"><span className="badge badge-neutral">{TYPE_LABELS[item.current.questionType]}</span><span className={`badge ${item.status === 'active' ? 'badge-success' : item.status === 'in_review' ? 'badge-warning' : 'badge-neutral'}`}>{STATUS_LABELS[item.status]}</span>{item.difficulty && <span className="badge badge-info">{DIFFICULTY_LABELS[item.difficulty]}</span>}{item.provenance === 'ai' && <span className="badge badge-warning"><Sparkles className="mr-1 h-3 w-3"/>AI</span>}</div>
                  <h3 className="mt-2 text-sm font-extrabold text-text-main sm:text-base">{item.current.stem}</h3><p className="mt-1 text-xs text-text-muted">{[item.curriculumLevel,item.lesson,item.topic].filter(Boolean).join(' · ') || 'Chưa gắn taxonomy'} · v{item.currentVersion}</p>
                </button>
              </div>
            </Surface>
          })}
        </div>
        <div className="space-y-4">
          {preview && <Surface className="p-4"><div className="flex items-start justify-between gap-2"><div><span className="badge badge-info">Preview v{preview.currentVersion}</span><h3 className="mt-2 font-extrabold text-text-main">{preview.current.stem}</h3></div><Button size="sm" variant="quiet" onClick={() => setPreview(null)}>Đóng</Button></div>
            {preview.current.questionType === 'multiple_choice' && <div className="mt-3 space-y-2">{((preview.current.answerData.options ?? []) as Array<{id:string;text:string}>).map(option => <div key={option.id} className={`rounded-lg border p-2 text-sm ${((preview.current.answerData.correctOptionIds ?? []) as string[]).includes(option.id) ? 'border-success bg-success/10 font-bold' : 'border-surface-border'}`}>{option.id}. {option.text}</div>)}</div>}
            {preview.current.explanation && <p className="mt-3 rounded-lg bg-surface-sunken p-3 text-sm text-text-secondary"><strong>Lời giải:</strong> {preview.current.explanation}</p>}
            {preview.usage && <p className="mt-3 text-xs font-semibold text-text-muted">Đã dùng {preview.usage.length} lần. {preview.usage[0] ? `Gần nhất: ${preview.usage[0].subject} (${preview.usage[0].academicYear}).` : ''}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {(role === 'admin' || (preview.createdBy === user?.id && preview.status === 'draft')) && preview.status !== 'archived' && <Button size="sm" variant="secondary" onClick={() => { setEditingId(preview.id); setForm(formFromQuestion(preview)) }}>Tạo phiên bản mới</Button>}
              {preview.status === 'draft' && (role === 'admin' || preview.createdBy === user?.id) && <Button size="sm" leadingIcon={<Send className="h-4 w-4"/>} onClick={() => void lifecycle(preview,'submit')}>Gửi duyệt</Button>}
              {role === 'admin' && preview.status === 'in_review' && <><Button size="sm" onClick={() => void lifecycle(preview,'approve')}>Duyệt</Button><Button size="sm" variant="secondary" onClick={() => void lifecycle(preview,'reject')}>Trả về nháp</Button></>}
              {role === 'admin' && preview.status === 'approved' && <Button size="sm" leadingIcon={<CheckCircle2 className="h-4 w-4"/>} onClick={() => void lifecycle(preview,'activate')}>Cho phép sử dụng</Button>}
              {role === 'admin' && (preview.status === 'active' || preview.status === 'approved') && <Button size="sm" variant="danger" leadingIcon={<Archive className="h-4 w-4"/>} onClick={() => void lifecycle(preview,'archive')}>Lưu trữ</Button>}
            </div>
          </Surface>}
          <Surface className="p-4"><h3 className="font-extrabold text-text-main">{editingId ? 'Tạo phiên bản mới' : 'Tạo câu hỏi nháp'}</h3><div className="mt-3 space-y-3">
            <select className="form-select min-h-11 w-full" value={form.questionType} onChange={e => setForm(v => ({...v,questionType:e.target.value as QuestionForm['questionType']}))}><option value="multiple_choice">Trắc nghiệm 4 đáp án</option><option value="essay">Tự luận</option></select>
            <textarea className="form-input min-h-24 w-full" value={form.stem} onChange={e => setForm(v => ({...v,stem:e.target.value}))} placeholder="Nội dung câu hỏi" />
            {form.questionType === 'multiple_choice' && <div className="grid gap-2 sm:grid-cols-2">{(['A','B','C','D'] as const).map(id => <label key={id} className="flex items-center gap-2"><input type="radio" checked={form.correctOption === id} onChange={() => setForm(v => ({...v,correctOption:id}))}/><input className="form-input min-h-11 min-w-0 flex-1" value={form[`option${id}`]} onChange={e => setForm(v => ({...v,[`option${id}`]:e.target.value}))} placeholder={`Phương án ${id}`} /></label>)}</div>}
            <textarea className="form-input min-h-20 w-full" value={form.explanation} onChange={e => setForm(v => ({...v,explanation:e.target.value}))} placeholder={form.questionType === 'essay' ? 'Rubric / gợi ý chấm' : 'Lời giải / giải thích'} />
            <div className="grid gap-2 sm:grid-cols-2"><input className="form-input min-h-11" value={form.curriculumLevel} onChange={e => setForm(v => ({...v,curriculumLevel:e.target.value}))} placeholder="Cấp/lớp giáo lý (vd: Thiếu Nhi 1)"/><select className="form-select min-h-11" value={form.difficulty} onChange={e => setForm(v => ({...v,difficulty:e.target.value as QuestionDifficulty}))}>{Object.entries(DIFFICULTY_LABELS).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select><input className="form-input min-h-11" value={form.lesson} onChange={e => setForm(v => ({...v,lesson:e.target.value}))} placeholder="Bài"/><input className="form-input min-h-11" type="number" value={form.lessonOrder} onChange={e => setForm(v => ({...v,lessonOrder:e.target.value}))} placeholder="Số thứ tự bài"/><input className="form-input min-h-11" value={form.topic} onChange={e => setForm(v => ({...v,topic:e.target.value}))} placeholder="Chủ đề"/><input className="form-input min-h-11" value={form.tags} onChange={e => setForm(v => ({...v,tags:e.target.value}))} placeholder="Tags, cách nhau bằng dấu phẩy"/></div>
            <div className="flex gap-2"><Button fullWidth loading={saving} onClick={() => void saveQuestion()} leadingIcon={<FilePlus2 className="h-4 w-4"/>}>{editingId ? 'Lưu phiên bản mới' : 'Lưu câu hỏi nháp'}</Button>{editingId && <Button variant="secondary" onClick={() => { setEditingId(null); setForm(EMPTY_QUESTION) }}>Hủy</Button>}</div>
          </div></Surface>
        </div>
      </div>}

      {tab === 'blueprints' && <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <Surface className="p-4"><h3 className="font-extrabold text-text-main">Tạo ma trận đề</h3><div className="mt-3 space-y-3"><input className="form-input min-h-11 w-full" value={bpName} onChange={e => setBpName(e.target.value)} placeholder="Tên ma trận (vd: HK1 Thiếu Nhi 1)"/><input className="form-input min-h-11 w-full" value={bpLevel} onChange={e => setBpLevel(e.target.value)} placeholder="Cấp/lớp giáo lý"/>
          {bpRules.map((rule,index) => <Surface variant="sunken" className="p-3" key={index}><div className="grid gap-2 sm:grid-cols-2"><select className="form-select min-h-10" value={rule.questionType} onChange={e => setBpRules(rows => rows.map((row,i) => i === index ? {...row,questionType:e.target.value as QuestionBankType}:row))}><option value="multiple_choice">Trắc nghiệm</option><option value="essay">Tự luận</option></select><select className="form-select min-h-10" value={rule.difficulty ?? ''} onChange={e => setBpRules(rows => rows.map((row,i) => i === index ? {...row,difficulty:(e.target.value || null) as QuestionDifficulty|null}:row))}><option value="">Mọi mức độ</option>{Object.entries(DIFFICULTY_LABELS).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select><input className="form-input min-h-10" type="number" min="1" value={rule.questionCount} onChange={e => setBpRules(rows => rows.map((row,i) => i === index ? {...row,questionCount:Number(e.target.value)}:row))} aria-label="Số câu"/><input className="form-input min-h-10" type="number" min="0.1" step="0.1" value={rule.pointsEach} onChange={e => setBpRules(rows => rows.map((row,i) => i === index ? {...row,pointsEach:Number(e.target.value)}:row))} aria-label="Điểm mỗi câu"/></div></Surface>)}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-text-secondary"><span>{totalBpQuestions} câu · {totalBpPoints} điểm</span><Button size="sm" variant="secondary" leadingIcon={<Plus className="h-4 w-4"/>} onClick={() => setBpRules(rows => [...rows,{questionType:'multiple_choice',questionCount:1,pointsEach:1}])}>Thêm dòng</Button></div>{!Number.isInteger(totalBpPoints) && <p className="text-xs font-semibold text-warning">Tổng điểm phải là số nguyên từ 1 đến 10 để khớp thang điểm phiên thi.</p>}<Button fullWidth disabled={!bpName || totalBpQuestions < 1 || totalBpPoints > 10 || !Number.isInteger(totalBpPoints)} onClick={() => void createBlueprintNow()}>Lưu ma trận nháp</Button></div></Surface>
        <div className="space-y-3">{blueprints.map(blueprint => <Surface key={blueprint.id} variant="entity" className="p-4"><div className="flex items-start justify-between gap-3"><div><span className={`badge ${blueprint.status === 'active' ? 'badge-success':'badge-neutral'}`}>{blueprint.status}</span><h3 className="mt-2 font-extrabold text-text-main">{blueprint.name}</h3><p className="mt-1 text-sm text-text-muted">{blueprint.totalQuestions} câu · {blueprint.maxScore} điểm · v{blueprint.version}</p></div>{role === 'admin' && blueprint.status === 'draft' && <Button size="sm" onClick={async () => { try { await api.setExamBlueprintStatus(blueprint.id,'active'); await loadBlueprints() } catch(error){setMessage((error as Error).message)} }}>Kích hoạt</Button>}</div></Surface>)}</div>
      </div>}

      {tab === 'builder' && <Surface className="p-4 sm:p-5"><div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-parish-primary"/><h3 className="font-extrabold text-text-main">Tạo đề có snapshot bất biến</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <select className="form-select min-h-11" value={build.mode} onChange={e => setBuild(v => ({...v,mode:e.target.value as 'manual'|'blueprint'}))}><option value="manual">Manual — {selected.size} câu đã chọn</option><option value="blueprint">Auto — theo ma trận</option></select>
        {build.mode === 'blueprint' && <select className="form-select min-h-11" value={build.blueprintId} onChange={e => setBuild(v => ({...v,blueprintId:e.target.value}))}><option value="">Chọn ma trận Active</option>{blueprints.filter(bp => bp.status === 'active').map(bp => <option key={bp.id} value={bp.id}>{bp.name}</option>)}</select>}
        <select className="form-select min-h-11" value={build.classId} onChange={e => setBuild(v => ({...v,classId:e.target.value}))}><option value="">Chọn lớp</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input className="form-input min-h-11" value={build.subject} onChange={e => setBuild(v => ({...v,subject:e.target.value}))} placeholder="Tên/môn kiểm tra"/>
        <select className="form-select min-h-11" value={build.scoreType} onChange={e => setBuild(v => ({...v,scoreType:e.target.value}))}><option value="15m">15 phút</option><option value="1period">1 tiết</option><option value="midterm">Giữa kỳ</option><option value="final">Cuối kỳ</option></select>
        <input className="form-input min-h-11" value={build.academicYear} onChange={e => setBuild(v => ({...v,academicYear:e.target.value}))} placeholder="2026-2027"/>
        <select className="form-select min-h-11" value={build.semester} onChange={e => setBuild(v => ({...v,semester:Number(e.target.value) as 1|2}))}><option value="1">Học kỳ I</option><option value="2">Học kỳ II</option></select>
        <select className="form-select min-h-11" value={build.variantCount} onChange={e => setBuild(v => ({...v,variantCount:Number(e.target.value)}))}>{[1,2,3,4,5,6,7,8].map(count => <option key={count} value={count}>{count} mã đề</option>)}</select>
      </div><div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-text-secondary">Sinh đề, publish, mã đề và answer key luôn yêu cầu server. Nếu blueprint thiếu câu, toàn bộ transaction bị hủy và trả chi tiết dòng constraint thiếu — không có đề thiếu âm thầm.</div><Button className="mt-4" leadingIcon={<Sparkles className="h-4 w-4"/>} disabled={!build.classId || (build.mode === 'manual' ? selected.size === 0 : !build.blueprintId)} onClick={() => void buildExam()}>Tạo đề hoàn chỉnh</Button></Surface>}
    </div>
  )
}

export default QuestionBankView
