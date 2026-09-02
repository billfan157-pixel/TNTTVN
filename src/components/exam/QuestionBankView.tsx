import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  ExternalLink,
  Eye,
  FilePlus2,
  FileUp,
  HelpCircle,
  Info,
  Layers3,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import type {
  ExamBlueprint,
  ExamBlueprintRule,
  QuestionBankItem,
  QuestionBankStatus,
  QuestionBankType,
  QuestionDifficulty,
} from '../../types'
import { useAuth } from '../../hooks/useAuth'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { Badge, type BadgeTone, Button, Surface } from '../common/ui'
import { TabPanel, Tabs, type SelectionItem } from '../common/ui/SelectionControls'
import { ModalShell } from '../common/ModalShell'
import { PageHeader } from '../common/PageHeader'
import { QuestionEditorModal } from './QuestionEditorModal'
import { QuestionBankImportModal } from './QuestionBankImportModal'
import {
  EMPTY_QUESTION,
  mutationFromQuestionForm,
  questionFormFromItem,
  type QuestionForm,
} from '../../utils/questionEditorModel'

const TYPE_LABELS: Record<QuestionBankType, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng / Sai',
  multiple_select: 'Nhiều đáp án',
  short_answer: 'Trả lời ngắn',
  fill_blank: 'Điền khuyết',
  matching: 'Nối cặp',
  essay: 'Tự luận',
}

const STATUS_LABELS: Record<QuestionBankStatus, string> = {
  draft: 'Bản nháp',
  in_review: 'Chờ duyệt',
  approved: 'Đã duyệt',
  active: 'Đang dùng',
  archived: 'Lưu trữ',
}

const STATUS_TONES: Record<QuestionBankStatus, BadgeTone> = {
  draft: 'neutral',
  in_review: 'warning',
  approved: 'info',
  active: 'success',
  archived: 'neutral',
}

const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  recognition: 'Nhận biết',
  understanding: 'Thông hiểu',
  application: 'Vận dụng',
}

const DIFFICULTY_TONES: Record<QuestionDifficulty, BadgeTone> = {
  recognition: 'info',
  understanding: 'purple',
  application: 'orange',
}

type ViewTab = 'questions' | 'blueprints' | 'builder'

export function QuestionBankView() {
  const { role, user } = useAuth()
  const classes = useClassStore(state => state.classes)
  const branches = useClassStore(state => state.branches)
  const fetchClassCatalog = useClassStore(state => state.fetchAll)
  const resolveActiveYear = useAcademicYearStore(state => state.resolveActiveYear)

  const [tab, setTab] = useState<ViewTab>('questions')
  const [questions, setQuestions] = useState<QuestionBankItem[]>([])
  const [blueprints, setBlueprints] = useState<ExamBlueprint[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<QuestionBankItem | null>(null)
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
  const [inspectBlueprint, setInspectBlueprint] = useState<ExamBlueprint | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<QuestionForm>(EMPTY_QUESTION)
  const [editorOpen, setEditorOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<QuestionBankStatus | ''>('')
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | ''>('')
  const [branchFilter, setBranchFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'warning' | 'info' } | null>(null)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  // Blueprint creation state
  const [bpName, setBpName] = useState('')
  const [bpBranchId, setBpBranchId] = useState('')
  const [bpClassId, setBpClassId] = useState('')
  const [bpRules, setBpRules] = useState<ExamBlueprintRule[]>([
    { questionType: 'multiple_choice', difficulty: 'recognition', questionCount: 4, pointsEach: 1 },
    { questionType: 'multiple_choice', difficulty: 'understanding', questionCount: 4, pointsEach: 1 },
    { questionType: 'multiple_choice', difficulty: 'application', questionCount: 2, pointsEach: 1 },
  ])

  // Exam builder state
  const [buildBranchId, setBuildBranchId] = useState('')
  const [build, setBuild] = useState({
    mode: 'manual' as 'manual' | 'blueprint',
    blueprintId: '',
    classId: '',
    subject: 'Giáo lý',
    scoreType: '1period',
    semester: 1 as 1 | 2,
    academicYear: resolveActiveYear(),
    maxScore: 10,
    variantCount: 1,
  })
  const [createdExamId, setCreatedExamId] = useState<string | null>(null)

  const loadQuestions = async () => {
    setLoading(true)
    try {
      const selectedClass = classes.find(item => item.id === classFilter)
      const result = await api.listQuestionBank({
        search: search.trim() || undefined,
        status: status || undefined,
        difficulty: difficulty || undefined,
        branchId: branchFilter || undefined,
        curriculumLevel: selectedClass?.name,
        limit: 100,
      })
      setQuestions(result.items)
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: 'warning' })
    } finally {
      setLoading(false)
    }
  }

  const loadBlueprints = async () => {
    try {
      setBlueprints(await api.listExamBlueprints())
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: 'warning' })
    }
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
      .catch(error => {
        if (active) setMessage({ text: (error as Error).message, tone: 'warning' })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    void fetchClassCatalog()
  }, [fetchClassCatalog])

  useEffect(() => {
    const updateConnectivity = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateConnectivity)
    window.addEventListener('offline', updateConnectivity)
    return () => {
      window.removeEventListener('online', updateConnectivity)
      window.removeEventListener('offline', updateConnectivity)
    }
  }, [])

  const resetFilters = () => {
    setSearch('')
    setStatus('')
    setDifficulty('')
    setBranchFilter('')
    setClassFilter('')
  }

  const hasActiveFilters = Boolean(search || status || difficulty || branchFilter || classFilter)

  const editorClasses = useMemo(
    () =>
      classes.map(item => ({
        id: item.id,
        name: item.name,
        branchId: item.branchId,
        academicYear: item.academicYear ?? item.academicYearId,
      })),
    [classes],
  )
  const branchOptions = useMemo(() => branches.map(item => ({ id: item.id, name: item.name })), [branches])
  const filterClasses = useMemo(
    () => classes.filter(item => !branchFilter || item.branchId === branchFilter),
    [branchFilter, classes],
  )
  const blueprintClasses = useMemo(() => classes.filter(item => item.branchId === bpBranchId), [bpBranchId, classes])
  const buildClasses = useMemo(
    () => classes.filter(item => !buildBranchId || item.branchId === buildBranchId),
    [buildBranchId, classes],
  )

  const totalBpQuestions = bpRules.reduce((sum, rule) => sum + rule.questionCount, 0)
  const totalBpPoints = bpRules.reduce((sum, rule) => sum + rule.questionCount * rule.pointsEach, 0)

  // KPI Metrics
  const activeCount = useMemo(() => questions.filter(q => q.status === 'active').length, [questions])
  const inReviewCount = useMemo(() => questions.filter(q => q.status === 'in_review').length, [questions])
  const draftCount = useMemo(() => questions.filter(q => q.status === 'draft').length, [questions])

  const saveQuestion = async () => {
    if (!online) {
      setMessage({ text: 'Tạo/sửa câu hỏi cần kết nối mạng để khóa version trên server.', tone: 'warning' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const result = editingId
        ? await api.reviseQuestionBankItem(editingId, mutationFromQuestionForm(form))
        : await api.createQuestionBankItem(mutationFromQuestionForm(form))
      setForm(EMPTY_QUESTION)
      setEditingId(null)
      setEditorOpen(false)
      setPreview(result)
      setMessage({
        text: editingId
          ? 'Đã tạo phiên bản mới; các đề lịch sử không thay đổi.'
          : 'Đã tạo câu hỏi mới ở trạng thái nháp.',
        tone: 'success',
      })
      await loadQuestions()
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: 'warning' })
    } finally {
      setSaving(false)
    }
  }

  const lifecycle = async (item: QuestionBankItem, action: 'submit' | 'approve' | 'activate' | 'archive' | 'reject') => {
    if (!online) {
      setMessage({ text: 'Quy trình duyệt câu hỏi yêu cầu kết nối mạng.', tone: 'warning' })
      return
    }
    try {
      const updated = await api.transitionQuestionBankItem(item.id, action)
      setPreview(updated)
      setMessage({ text: `Đã cập nhật trạng thái câu hỏi sang: ${STATUS_LABELS[updated.status]}`, tone: 'success' })
      await loadQuestions()
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: 'warning' })
    }
  }

  const createBlueprintNow = async () => {
    if (!online) {
      setMessage({ text: 'Tạo ma trận đề cần kết nối mạng.', tone: 'warning' })
      return
    }
    try {
      const blueprintClass = classes.find(item => item.id === bpClassId)
      const created = await api.createExamBlueprint({
        name: bpName,
        branchId: bpBranchId || null,
        curriculumLevel: blueprintClass?.name ?? null,
        totalQuestions: totalBpQuestions,
        maxScore: totalBpPoints,
        rules: bpRules,
      })
      setBpName('')
      setMessage({ text: `Đã tạo ma trận “${created.name}” ở trạng thái nháp.`, tone: 'success' })
      await loadBlueprints()
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: 'warning' })
    }
  }

  const buildExam = async () => {
    if (!online) {
      setMessage({ text: 'Sinh đề từ ngân hàng là thao tác server-authoritative và cần kết nối mạng.', tone: 'warning' })
      return
    }
    try {
      const session = await api.buildExamFromQuestionBank({
        ...build,
        questionIds: build.mode === 'manual' ? [...selected] : undefined,
        blueprintId: build.mode === 'blueprint' ? build.blueprintId : undefined,
      })
      setCreatedExamId(session.id)
      setMessage({
        text: `Đã tạo đề thi thành công với mã ${session.id}. Đề thi đã xuất hiện trong danh sách chấm thi.`,
        tone: 'success',
      })
      setSelected(new Set())
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: 'warning' })
    }
  }

  const navTabs: SelectionItem<ViewTab>[] = [
    {
      value: 'questions',
      label: 'Ngân hàng câu hỏi',
      icon: <BookOpenCheck size={16} />,
      ariaLabel: 'Tab danh mục câu hỏi trong ngân hàng',
    },
    {
      value: 'blueprints',
      label: 'Ma trận đề thi',
      icon: <Layers3 size={16} />,
      ariaLabel: 'Tab thiết lập ma trận đề thi',
    },
    {
      value: 'builder',
      label: selected.size > 0 ? `Tạo đề thi (${selected.size} câu đã chọn)` : 'Tạo đề thi',
      icon: <Sparkles size={16} />,
      ariaLabel: 'Tab sinh đề thi từ ngân hàng',
    },
  ]

  // Selected questions objects for manual builder preview
  const selectedQuestions = useMemo(
    () => questions.filter(q => selected.has(q.id)),
    [questions, selected],
  )

  const handleOpenPreview = async (item: QuestionBankItem) => {
    try {
      const fullItem = await api.getQuestionBankItem(item.id)
      setPreview(fullItem)
      // If viewport is small (<1280px), open modal
      if (typeof window !== 'undefined' && window.innerWidth < 1280) {
        setMobilePreviewOpen(true)
      }
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: 'warning' })
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. Header chính phân hệ chuẩn PageHeader (DS §5) */}
      <PageHeader
        title="Ngân Hàng Câu Hỏi & Đề Thi"
        description="Question Bank → Blueprint → Immutable Exam → OMR Variants. Dữ liệu đề thi lưu trữ dưới dạng snapshot bất biến."
        icon={<BookOpenCheck className="h-5 w-5 text-parish-primary" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={online ? 'success' : 'warning'}>
              {online ? 'Server sẵn sàng' : 'Chỉ đọc khi offline'}
            </Badge>
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<FileUp className="h-4 w-4" />}
              onClick={() => setImportOpen(true)}
            >
              Import Excel / Word
            </Button>
            <Button
              size="sm"
              variant="primary"
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditingId(null)
                setForm(EMPTY_QUESTION)
                setEditorOpen(true)
              }}
            >
              Tạo câu hỏi nháp
            </Button>
          </div>
        }
      />

      {/* 2. Thanh KPI Metrics Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Surface variant="card" className="p-3.5 border-l-4 border-l-parish-primary">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Tổng câu hỏi</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-text-main">{questions.length}</span>
            <span className="text-xs font-semibold text-text-muted">câu</span>
          </div>
        </Surface>
        <Surface variant="card" className="p-3.5 border-l-4 border-l-parish-success">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Đang sử dụng</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-parish-success">{activeCount}</span>
            <Badge tone="success">Active</Badge>
          </div>
        </Surface>
        <Surface variant="card" className="p-3.5 border-l-4 border-l-parish-warning">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Chờ phê duyệt</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-parish-warning">{inReviewCount}</span>
            <Badge tone="warning">Cần duyệt</Badge>
          </div>
        </Surface>
        <Surface variant="card" className="p-3.5 border-l-4 border-l-surface-border">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Bản nháp</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-text-secondary">{draftCount}</span>
            <Badge tone="neutral">Nháp</Badge>
          </div>
        </Surface>
      </div>

      {/* 3. Navigation Tabs theo chuẩn Design System (DS §1.9) */}
      <Tabs
        id="question-bank-tabs"
        ariaLabel="Điều hướng không gian ngân hàng câu hỏi và tạo đề"
        items={navTabs}
        value={tab}
        onValueChange={setTab}
        className="self-start flex-wrap"
      />

      {/* Notification banner */}
      {message && (
        <Surface
          variant="card"
          className={`flex items-center justify-between gap-3 p-3.5 border-l-4 ${
            message.tone === 'success'
              ? 'border-l-parish-success bg-[var(--color-parish-success-bg)] text-text-main'
              : 'border-l-parish-warning bg-[var(--color-parish-warning-bg)] text-text-main'
          }`}
        >
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            {message.tone === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-parish-success shrink-0" />
            ) : (
              <Info className="h-5 w-5 text-parish-warning shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            type="button"
            className="btn btn-icon btn-ghost h-7 w-7 text-text-muted hover:text-text-main"
            onClick={() => setMessage(null)}
            aria-label="Đóng thông báo"
          >
            <X className="h-4 w-4" />
          </button>
        </Surface>
      )}

      {/* ─── TAB 1: NGÂN HÀNG CÂU HỎI ─── */}
      <TabPanel tabsId="question-bank-tabs" value="questions" activeValue={tab}>
        <div className="space-y-4">
          {/* Bộ lọc thông minh */}
          <Surface variant="card" className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 items-end">
              <div className="form-group sm:col-span-2 lg:col-span-2">
                <label className="form-label text-xs" htmlFor="qb-search">
                  Tìm kiếm
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-text-muted" aria-hidden="true" />
                  <input
                    id="qb-search"
                    className="form-input min-h-10 w-full pl-9 text-sm"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Tìm câu hỏi, bài học, chủ đề, tag..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') void loadQuestions()
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-2.5 text-text-muted hover:text-text-main"
                      aria-label="Xóa từ khóa tìm kiếm"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-xs" htmlFor="qb-branch">
                  Ngành
                </label>
                <select
                  id="qb-branch"
                  className="form-select min-h-10 w-full text-sm"
                  value={branchFilter}
                  onChange={e => {
                    setBranchFilter(e.target.value)
                    setClassFilter('')
                  }}
                >
                  <option value="">-- Mọi ngành --</option>
                  {branchOptions.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label text-xs" htmlFor="qb-class">
                  Khối lớp
                </label>
                <select
                  id="qb-class"
                  className="form-select min-h-10 w-full text-sm"
                  value={classFilter}
                  disabled={!branchFilter}
                  onChange={e => setClassFilter(e.target.value)}
                >
                  <option value="">-- Mọi lớp trong ngành --</option>
                  {filterClasses.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.academicYear ? ` · ${item.academicYear}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label text-xs" htmlFor="qb-status">
                  Trạng thái
                </label>
                <select
                  id="qb-status"
                  className="form-select min-h-10 w-full text-sm"
                  value={status}
                  onChange={e => setStatus(e.target.value as QuestionBankStatus | '')}
                >
                  <option value="">-- Mọi trạng thái --</option>
                  {Object.entries(STATUS_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Button className="flex-1" loading={loading} onClick={() => void loadQuestions()}>
                  Lọc
                </Button>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0"
                    title="Đặt lại bộ lọc"
                    onClick={() => {
                      resetFilters()
                      void Promise.resolve().then(() => void loadQuestions())
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-surface-border pt-2.5 text-xs text-text-muted">
              <span>
                Hiển thị <strong>{questions.length}</strong> câu hỏi phù hợp
              </span>
              {selected.size > 0 && (
                <span className="font-bold text-parish-primary">
                  Đã chọn {selected.size} câu để sinh đề
                </span>
              )}
            </div>
          </Surface>

          {/* Master-Detail Split: Left Danh sách, Right Preview (Desktop) */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(380px,0.7fr)] items-start">
            {/* Cột trái: Danh sách câu hỏi */}
            <div className="space-y-3">
              {questions.length === 0 && !loading && (
                <Surface variant="card" className="p-8 text-center">
                  <BookOpenCheck className="mx-auto h-12 w-12 text-text-muted/40 mb-3" />
                  <h4 className="text-base font-bold text-text-main">Chưa tìm thấy câu hỏi phù hợp</h4>
                  <p className="mt-1 text-sm text-text-muted">
                    Thử thay đổi bộ lọc hoặc thêm câu hỏi mới vào ngân hàng.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    {hasActiveFilters && (
                      <Button variant="secondary" size="sm" onClick={resetFilters}>
                        Xóa bộ lọc
                      </Button>
                    )}
                    <Button
                      size="sm"
                      leadingIcon={<Plus className="h-4 w-4" />}
                      onClick={() => {
                        setEditingId(null)
                        setForm(EMPTY_QUESTION)
                        setEditorOpen(true)
                      }}
                    >
                      Tạo câu hỏi ngay
                    </Button>
                  </div>
                </Surface>
              )}

              {questions.map(item => {
                const checked = selected.has(item.id)
                const isCurrentPreview = preview?.id === item.id

                return (
                  <Surface
                    as="article"
                    variant="entity"
                    key={item.id}
                    className={`p-4 transition-colors ${
                      isCurrentPreview
                        ? 'ring-2 ring-parish-primary bg-surface-selected border-parish-primary'
                        : 'hover:border-surface-border/80'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox chọn vào đề thi */}
                      <div className="pt-0.5">
                        <label className="flex cursor-pointer items-center">
                          <input
                            aria-label={`Chọn câu hỏi: ${item.current.stem}`}
                            type="checkbox"
                            className="h-5 w-5 rounded border-surface-border text-parish-primary focus:ring-parish-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                            checked={checked}
                            disabled={item.status !== 'active'}
                            title={
                              item.status !== 'active'
                                ? 'Chỉ câu hỏi ở trạng thái "Đang dùng" mới có thể chọn vào đề thi.'
                                : 'Chọn câu hỏi này vào đề thi'
                            }
                            onChange={e => {
                              setSelected(current => {
                                const next = new Set(current)
                                if (e.target.checked) next.add(item.id)
                                else next.delete(item.id)
                                return next
                              })
                            }}
                          />
                        </label>
                      </div>

                      {/* Nội dung tóm tắt & Preview trigger */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <Badge tone="neutral">{TYPE_LABELS[item.current.questionType]}</Badge>
                          <Badge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                          {item.difficulty && (
                            <Badge tone={DIFFICULTY_TONES[item.difficulty]}>
                              {DIFFICULTY_LABELS[item.difficulty]}
                            </Badge>
                          )}
                          {item.provenance === 'ai' && (
                            <Badge tone="warning" icon={<Sparkles className="h-3 w-3 mr-1" />}>
                              AI
                            </Badge>
                          )}
                        </div>

                        <button
                          type="button"
                          className="w-full text-left group"
                          onClick={() => void handleOpenPreview(item)}
                        >
                          <h3 className="text-sm font-bold text-text-main sm:text-base line-clamp-2 group-hover:text-parish-primary transition-colors">
                            {item.current.stem}
                          </h3>
                        </button>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted border-t border-surface-border/50 pt-2">
                          <span className="truncate">
                            {[item.curriculumLevel, item.lesson, item.topic].filter(Boolean).join(' · ') ||
                              'Chưa gắn taxonomy'}{' '}
                            · <span className="font-semibold">v{item.currentVersion}</span>
                          </span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-semibold text-parish-primary hover:underline text-xs"
                            onClick={() => void handleOpenPreview(item)}
                          >
                            <span>Chi tiết</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </Surface>
                )
              })}

              {/* Sticky Batch Action Bar khi có câu hỏi được chọn */}
              {selected.size > 0 && (
                <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-parish-primary/30 bg-surface-card/95 p-3.5 shadow-toast backdrop-blur-md">
                  <div className="flex items-center gap-2 text-sm font-bold text-text-main">
                    <CheckSquare className="h-5 w-5 text-parish-primary" />
                    <span>
                      Đã chọn <strong>{selected.size}</strong> câu hỏi
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                      Bỏ chọn
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      trailingIcon={<ArrowRight className="h-4 w-4" />}
                      onClick={() => {
                        setBuild(v => ({ ...v, mode: 'manual' }))
                        setTab('builder')
                      }}
                    >
                      Tạo đề ngay ({selected.size})
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Cột phải: Desktop Sticky Preview Panel */}
            <div className="hidden xl:block sticky top-4">
              {preview ? (
                <Surface variant="card" className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 border-b border-surface-border pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge tone={STATUS_TONES[preview.status]}>{STATUS_LABELS[preview.status]}</Badge>
                        <Badge tone="info">Phiên bản v{preview.currentVersion}</Badge>
                        {preview.difficulty && (
                          <Badge tone={DIFFICULTY_TONES[preview.difficulty]}>
                            {DIFFICULTY_LABELS[preview.difficulty]}
                          </Badge>
                        )}
                      </div>
                      <h3 className="mt-2 text-base font-extrabold text-text-main leading-snug">
                        {preview.current.stem}
                      </h3>
                    </div>
                    <Button size="sm" variant="quiet" onClick={() => setPreview(null)} aria-label="Đóng preview">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Danh sách đáp án */}
                  {preview.current.questionType === 'multiple_choice' && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                        Các phương án trả lời:
                      </span>
                      {((preview.current.answerData.options ?? []) as Array<{ id: string; text: string }>).map(
                        option => {
                          const isCorrect = (
                            (preview.current.answerData.correctOptionIds ?? []) as string[]
                          ).includes(option.id)
                          return (
                            <div
                              key={option.id}
                              className={`rounded-xl border p-2.5 text-sm transition-colors ${
                                isCorrect
                                  ? 'border-[var(--color-parish-success)] bg-[var(--color-parish-success-bg)] text-[var(--color-parish-success-hover)] font-bold'
                                  : 'border-surface-border bg-surface-app text-text-main'
                              }`}
                            >
                              <span className="inline-block w-6 font-bold">{option.id}.</span>
                              <span>{option.text}</span>
                              {isCorrect && (
                                <span className="ml-2 text-xs font-semibold text-parish-success">
                                  (Đáp án đúng)
                                </span>
                              )}
                            </div>
                          )
                        },
                      )}
                    </div>
                  )}

                  {/* Lời giải / Rubric */}
                  {preview.current.explanation && (
                    <div className="rounded-xl border border-surface-border bg-surface-sunken p-3 text-sm text-text-secondary">
                      <strong className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1">
                        {preview.current.questionType === 'essay' ? 'Rubric / Hướng dẫn chấm:' : 'Lời giải chi tiết:'}
                      </strong>
                      <p className="whitespace-pre-line">{preview.current.explanation}</p>
                    </div>
                  )}

                  {/* Thông tin sử dụng */}
                  {preview.usage && preview.usage.length > 0 && (
                    <div className="rounded-xl border border-surface-border bg-surface-app p-3 text-xs text-text-secondary">
                      <strong className="block font-bold mb-1">Lịch sử xuất hiện trong kỳ thi:</strong>
                      <span>
                        Đã sử dụng trong <strong>{preview.usage.length}</strong> đề thi. Gần nhất:{' '}
                        {preview.usage[0].subject} ({preview.usage[0].academicYear}).
                      </span>
                    </div>
                  )}

                  {/* Các nút hành động quy trình duyệt */}
                  <div className="border-t border-surface-border pt-3 space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                      Thao tác nghiệp vụ:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(role === 'admin' || (preview.createdBy === user?.id && preview.status === 'draft')) &&
                        preview.status !== 'archived' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leadingIcon={<FilePlus2 className="h-4 w-4" />}
                            onClick={() => {
                              setEditingId(preview.id)
                              setForm(questionFormFromItem(preview, editorClasses))
                              setEditorOpen(true)
                            }}
                          >
                            Tạo phiên bản mới
                          </Button>
                        )}
                      {preview.status === 'draft' && (role === 'admin' || preview.createdBy === user?.id) && (
                        <Button
                          size="sm"
                          variant="primary"
                          leadingIcon={<Send className="h-4 w-4" />}
                          onClick={() => void lifecycle(preview, 'submit')}
                        >
                          Gửi duyệt
                        </Button>
                      )}
                      {role === 'admin' && preview.status === 'in_review' && (
                        <>
                          <Button size="sm" variant="primary" onClick={() => void lifecycle(preview, 'approve')}>
                            Phê duyệt
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => void lifecycle(preview, 'reject')}>
                            Trả về nháp
                          </Button>
                        </>
                      )}
                      {role === 'admin' && preview.status === 'approved' && (
                        <Button
                          size="sm"
                          variant="primary"
                          leadingIcon={<CheckCircle2 className="h-4 w-4" />}
                          onClick={() => void lifecycle(preview, 'activate')}
                        >
                          Kích hoạt sử dụng
                        </Button>
                      )}
                      {role === 'admin' && (preview.status === 'active' || preview.status === 'approved') && (
                        <Button
                          size="sm"
                          variant="danger"
                          leadingIcon={<Archive className="h-4 w-4" />}
                          onClick={() => void lifecycle(preview, 'archive')}
                        >
                          Lưu trữ
                        </Button>
                      )}
                    </div>
                  </div>
                </Surface>
              ) : (
                <Surface variant="card" className="p-8 text-center text-sm text-text-muted">
                  <HelpCircle className="mx-auto h-8 w-8 text-text-muted/40 mb-2" />
                  <p className="font-bold text-text-main">Chưa chọn câu hỏi xem trước</p>
                  <p className="mt-1 text-xs">
                    Bấm vào bất kỳ câu hỏi nào ở danh sách bên trái để xem đầy đủ đáp án, lời giải và các bước duyệt.
                  </p>
                </Surface>
              )}
            </div>
          </div>
        </div>
      </TabPanel>

      {/* ─── TAB 2: MA TRẬN ĐỀ (BLUEPRINTS) ─── */}
      <TabPanel tabsId="question-bank-tabs" value="blueprints" activeValue={tab}>
        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          {/* Cột trái: Thiết lập ma trận đề mới */}
          <Surface variant="card" className="p-5 space-y-4">
            <div className="border-b border-surface-border pb-3">
              <h3 className="typography-card-title text-base font-extrabold text-text-main">
                Thiết lập ma trận đề mới
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Ma trận đề quy định tỷ lệ câu hỏi, hình thức và thang điểm cho đề thi tự động.
              </p>
            </div>

            <div className="space-y-3">
              <div className="form-group">
                <label className="form-label text-xs" htmlFor="bp-name">
                  Tên ma trận <span className="text-parish-danger">*</span>
                </label>
                <input
                  id="bp-name"
                  className="form-input min-h-10 w-full text-sm"
                  value={bpName}
                  onChange={e => setBpName(e.target.value)}
                  placeholder="VD: HK I Thiếu Nhi 1 — Đề 10 câu trắc nghiệm"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="bp-branch">
                    Ngành áp dụng
                  </label>
                  <select
                    id="bp-branch"
                    className="form-select min-h-10 w-full text-sm"
                    value={bpBranchId}
                    onChange={e => {
                      setBpBranchId(e.target.value)
                      setBpClassId('')
                    }}
                  >
                    <option value="">-- Mọi ngành trong Xứ đoàn --</option>
                    {branchOptions.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="bp-class">
                    Khối lớp áp dụng
                  </label>
                  <select
                    id="bp-class"
                    className="form-select min-h-10 w-full text-sm"
                    value={bpClassId}
                    disabled={!bpBranchId}
                    onChange={e => setBpClassId(e.target.value)}
                  >
                    <option value="">-- Dùng chung toàn ngành --</option>
                    {blueprintClasses.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.academicYear ? ` · ${item.academicYear}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Danh sách quy tắc phân bổ */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    Các dòng quy tắc ({bpRules.length})
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() =>
                      setBpRules(rows => [
                        ...rows,
                        { questionType: 'multiple_choice', difficulty: 'recognition', questionCount: 1, pointsEach: 1 },
                      ])
                    }
                  >
                    Thêm dòng
                  </Button>
                </div>

                <div className="space-y-2">
                  {bpRules.map((rule, index) => (
                    <Surface variant="sunken" className="p-3 border border-surface-border/70 rounded-xl" key={index}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-extrabold text-parish-primary">
                          Quy tắc #{index + 1}
                        </span>
                        {bpRules.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-icon btn-ghost h-6 w-6 text-text-muted hover:text-parish-danger"
                            title="Xóa quy tắc này"
                            onClick={() => setBpRules(rows => rows.filter((_, i) => i !== index))}
                            aria-label={`Xóa quy tắc ${index + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-4">
                        <div className="form-group">
                          <label className="form-label text-xs">Loại câu</label>
                          <select
                            className="form-select min-h-9 text-xs"
                            value={rule.questionType}
                            onChange={e =>
                              setBpRules(rows =>
                                rows.map((row, i) =>
                                  i === index ? { ...row, questionType: e.target.value as QuestionBankType } : row,
                                ),
                              )
                            }
                          >
                            <option value="multiple_choice">Trắc nghiệm</option>
                            <option value="essay">Tự luận</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label text-xs">Mức độ</label>
                          <select
                            className="form-select min-h-9 text-xs"
                            value={rule.difficulty ?? ''}
                            onChange={e =>
                              setBpRules(rows =>
                                rows.map((row, i) =>
                                  i === index
                                    ? { ...row, difficulty: (e.target.value || null) as QuestionDifficulty | null }
                                    : row,
                                ),
                              )
                            }
                          >
                            <option value="">Mọi mức độ</option>
                            {Object.entries(DIFFICULTY_LABELS).map(([id, label]) => (
                              <option key={id} value={id}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label text-xs">Số lượng câu</label>
                          <input
                            className="form-input min-h-9 text-xs"
                            type="number"
                            min="1"
                            value={rule.questionCount}
                            onChange={e =>
                              setBpRules(rows =>
                                rows.map((row, i) =>
                                  i === index ? { ...row, questionCount: Math.max(1, Number(e.target.value)) } : row,
                                ),
                              )
                            }
                            aria-label="Số lượng câu"
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label text-xs">Điểm / câu</label>
                          <input
                            className="form-input min-h-9 text-xs"
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={rule.pointsEach}
                            onChange={e =>
                              setBpRules(rows =>
                                rows.map((row, i) =>
                                  i === index ? { ...row, pointsEach: Number(e.target.value) } : row,
                                ),
                              )
                            }
                            aria-label="Điểm mỗi câu"
                          />
                        </div>
                      </div>
                    </Surface>
                  ))}
                </div>
              </div>

              {/* Thống kê quy tắc & Kiểm tra tính hợp lệ */}
              <div className="rounded-xl border border-surface-border bg-surface-card p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-text-muted block">Tổng kết cấu trúc ma trận:</span>
                  <span className="text-sm font-extrabold text-text-main">
                    {totalBpQuestions} câu hỏi · {totalBpPoints} điểm
                  </span>
                </div>
                <Badge tone={totalBpPoints === 10 ? 'success' : 'warning'}>
                  {totalBpPoints === 10 ? 'Thang 10 chuẩn' : `Thang ${totalBpPoints}đ`}
                </Badge>
              </div>

              {!Number.isInteger(totalBpPoints) && (
                <div className="rounded-xl border border-[var(--color-parish-warning)]/30 bg-[var(--color-parish-warning-bg)] p-2.5 text-xs text-text-secondary flex items-center gap-2">
                  <Info className="h-4 w-4 text-parish-warning shrink-0" />
                  <span>Tổng điểm phải là số nguyên từ 1 đến 10 để khớp thang điểm của hệ thống chấm bài.</span>
                </div>
              )}

              <Button
                fullWidth
                disabled={!bpName.trim() || totalBpQuestions < 1 || totalBpPoints > 10 || !Number.isInteger(totalBpPoints)}
                onClick={() => void createBlueprintNow()}
              >
                Lưu ma trận nháp
              </Button>
            </div>
          </Surface>

          {/* Cột phải: Danh sách các ma trận hiện có */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="typography-card-title text-base font-extrabold text-text-main">
                Danh sách ma trận đề thi ({blueprints.length})
              </h3>
            </div>

            {blueprints.length === 0 && (
              <Surface variant="card" className="p-8 text-center text-sm text-text-muted">
                <Layers3 className="mx-auto h-8 w-8 text-text-muted/40 mb-2" />
                <p className="font-bold text-text-main">Chưa có ma trận đề nào</p>
                <p className="mt-1 text-xs">
                  Tạo ma trận ở biểu mẫu bên trái để tự động sinh các đề thi hoán vị.
                </p>
              </Surface>
            )}

            {blueprints.map(blueprint => (
              <Surface key={blueprint.id} variant="entity" className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={blueprint.status === 'active' ? 'success' : 'neutral'}>
                        {blueprint.status === 'active' ? 'Đang hoạt động' : 'Bản nháp'}
                      </Badge>
                      <span className="text-xs text-text-muted">v{blueprint.version}</span>
                    </div>
                    <h4 className="mt-1.5 font-extrabold text-text-main text-base">{blueprint.name}</h4>
                    <p className="mt-1 text-xs text-text-muted">
                      Cấu trúc: <strong>{blueprint.totalQuestions} câu hỏi</strong> · Thang điểm:{' '}
                      <strong>{blueprint.maxScore} điểm</strong>
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                    {blueprint.rules && blueprint.rules.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<Eye className="h-3.5 w-3.5" />}
                        onClick={() => setInspectBlueprint(blueprint)}
                      >
                        Xem quy tắc
                      </Button>
                    )}

                    {role === 'admin' && blueprint.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={async () => {
                          try {
                            await api.setExamBlueprintStatus(blueprint.id, 'active')
                            await loadBlueprints()
                            setMessage({ text: `Đã kích hoạt ma trận “${blueprint.name}”.`, tone: 'success' })
                          } catch (error) {
                            setMessage({ text: (error as Error).message, tone: 'warning' })
                          }
                        }}
                      >
                        Kích hoạt
                      </Button>
                    )}
                  </div>
                </div>
              </Surface>
            ))}
          </div>
        </div>
      </TabPanel>

      {/* ─── TAB 3: TẠO ĐỀ THI (IMMUTABLE EXAM BUILDER) ─── */}
      <TabPanel tabsId="question-bank-tabs" value="builder" activeValue={tab}>
        <Surface variant="card" className="p-5 sm:p-6 space-y-6">
          <div className="border-b border-surface-border pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-parish-primary" />
              <h3 className="typography-card-title text-base font-extrabold text-text-main">
                Sinh đề thi có snapshot bất biến
              </h3>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Đề thi sau khi sinh sẽ được snapshot bất biến, kèm danh sách mã đề và đáp án OMR sẵn sàng cho việc chấm điểm.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Nhóm 1: Thông tin lớp & môn thi */}
            <div className="space-y-4 rounded-2xl border border-surface-border bg-surface-sunken p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                1. Thông tin kỳ thi &amp; Lớp học
              </h4>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="b-branch">
                    Ngành học
                  </label>
                  <select
                    id="b-branch"
                    className="form-select min-h-10 w-full text-sm"
                    value={buildBranchId}
                    onChange={e => {
                      setBuildBranchId(e.target.value)
                      setBuild(v => ({ ...v, classId: '' }))
                    }}
                  >
                    <option value="">-- Chọn ngành --</option>
                    {branchOptions.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="b-class">
                    Lớp kiểm tra <span className="text-parish-danger">*</span>
                  </label>
                  <select
                    id="b-class"
                    className="form-select min-h-10 w-full text-sm"
                    value={build.classId}
                    disabled={!buildBranchId}
                    onChange={e => setBuild(v => ({ ...v, classId: e.target.value }))}
                  >
                    <option value="">-- Chọn lớp --</option>
                    {buildClasses.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.academicYear ? ` · ${item.academicYear}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="b-subject">
                    Tên môn / Bài kiểm tra
                  </label>
                  <input
                    id="b-subject"
                    className="form-input min-h-10 w-full text-sm"
                    value={build.subject}
                    onChange={e => setBuild(v => ({ ...v, subject: e.target.value }))}
                    placeholder="VD: Giáo lý Bạn Trẻ"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="b-scoretype">
                    Hình thức điểm
                  </label>
                  <select
                    id="b-scoretype"
                    className="form-select min-h-10 w-full text-sm"
                    value={build.scoreType}
                    onChange={e => setBuild(v => ({ ...v, scoreType: e.target.value }))}
                  >
                    <option value="15m">15 phút</option>
                    <option value="1period">1 tiết</option>
                    <option value="midterm">Giữa kỳ</option>
                    <option value="final">Cuối kỳ</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="b-academic-year">
                    Năm học
                  </label>
                  <input
                    id="b-academic-year"
                    className="form-input min-h-10 w-full text-sm"
                    value={build.academicYear}
                    onChange={e => setBuild(v => ({ ...v, academicYear: e.target.value }))}
                    placeholder="2026-2027"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="b-semester">
                    Học kỳ
                  </label>
                  <select
                    id="b-semester"
                    className="form-select min-h-10 w-full text-sm"
                    value={build.semester}
                    onChange={e => setBuild(v => ({ ...v, semester: Number(e.target.value) as 1 | 2 }))}
                  >
                    <option value="1">Học kỳ I</option>
                    <option value="2">Học kỳ II</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label text-xs" htmlFor="b-variants">
                    Số mã đề
                  </label>
                  <select
                    id="b-variants"
                    className="form-select min-h-10 w-full text-sm"
                    value={build.variantCount}
                    onChange={e => setBuild(v => ({ ...v, variantCount: Number(e.target.value) }))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(count => (
                      <option key={count} value={count}>
                        {count} mã đề (hoán vị)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Nhóm 2: Nguồn câu hỏi */}
            <div className="space-y-4 rounded-2xl border border-surface-border bg-surface-sunken p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                2. Nguồn câu hỏi &amp; Cơ chế sinh đề
              </h4>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    build.mode === 'manual'
                      ? 'border-parish-primary bg-surface-selected ring-1 ring-parish-primary'
                      : 'border-surface-border bg-surface-card hover:bg-surface-hover'
                  }`}
                  onClick={() => setBuild(v => ({ ...v, mode: 'manual' }))}
                >
                  <div className="font-bold text-sm text-text-main">Thủ công</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Từ {selected.size} câu hỏi đã chọn trong giỏ
                  </div>
                </button>

                <button
                  type="button"
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    build.mode === 'blueprint'
                      ? 'border-parish-primary bg-surface-selected ring-1 ring-parish-primary'
                      : 'border-surface-border bg-surface-card hover:bg-surface-hover'
                  }`}
                  onClick={() => setBuild(v => ({ ...v, mode: 'blueprint' }))}
                >
                  <div className="font-bold text-sm text-text-main">Theo ma trận</div>
                  <div className="text-xs text-text-muted mt-0.5">Tự động chọn ngẫu nhiên có kiểm soát</div>
                </button>
              </div>

              {build.mode === 'manual' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>
                      Các câu hỏi đã chọn vào đề (<strong>{selected.size} câu</strong>):
                    </span>
                    {selected.size > 0 && (
                      <button
                        type="button"
                        className="text-parish-danger hover:underline text-xs"
                        onClick={() => setSelected(new Set())}
                      >
                        Xóa tất cả
                      </button>
                    )}
                  </div>

                  {selected.size === 0 ? (
                    <div className="rounded-xl border border-dashed border-surface-border bg-surface-card p-4 text-center text-xs text-text-muted">
                      <p>Chưa có câu hỏi nào được chọn.</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-2"
                        onClick={() => setTab('questions')}
                      >
                        Chuyển sang Ngân hàng để chọn câu
                      </Button>
                    </div>
                  ) : (
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {selectedQuestions.map((q, idx) => (
                        <div
                          key={q.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-surface-border bg-surface-card p-2 text-xs"
                        >
                          <span className="font-medium text-text-main truncate">
                            <strong>#{idx + 1}</strong>: {q.current.stem}
                          </span>
                          <button
                            type="button"
                            className="text-text-muted hover:text-parish-danger shrink-0"
                            onClick={() =>
                              setSelected(current => {
                                const next = new Set(current)
                                next.delete(q.id)
                                return next
                              })
                            }
                            aria-label="Bỏ chọn câu này"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {build.mode === 'blueprint' && (
                <div className="space-y-3">
                  <div className="form-group">
                    <label className="form-label text-xs" htmlFor="b-blueprint-select">
                      Chọn ma trận đề đang kích hoạt <span className="text-parish-danger">*</span>
                    </label>
                    <select
                      id="b-blueprint-select"
                      className="form-select min-h-10 w-full text-sm"
                      value={build.blueprintId}
                      onChange={e => setBuild(v => ({ ...v, blueprintId: e.target.value }))}
                    >
                      <option value="">-- Chọn ma trận đã Active --</option>
                      {blueprints
                        .filter(bp => bp.status === 'active')
                        .map(bp => (
                          <option key={bp.id} value={bp.id}>
                            {bp.name} ({bp.totalQuestions} câu · {bp.maxScore}đ)
                          </option>
                        ))}
                    </select>
                  </div>

                  {build.blueprintId && (
                    <div className="rounded-xl border border-surface-border bg-surface-card p-3 text-xs text-text-secondary">
                      {(() => {
                        const bp = blueprints.find(b => b.id === build.blueprintId)
                        if (!bp) return null
                        return (
                          <div>
                            <strong className="block font-bold text-text-main mb-1">
                              Cấu trúc yêu cầu: {bp.totalQuestions} câu hỏi · Thang điểm {bp.maxScore}đ
                            </strong>
                            <p className="text-text-muted">
                              Hệ thống sẽ bốc ngẫu nhiên có kiểm soát các câu hỏi đang hoạt động khớp với taxonomy của ma trận. Nếu thiếu câu hỏi, giao dịch sẽ tự động dừng an toàn.
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Ghi chú ràng buộc nghiệp vụ snapshot bất biến */}
          <div className="rounded-xl border border-[var(--color-parish-warning)]/30 bg-[var(--color-parish-warning-bg)] p-3 text-xs text-text-secondary flex items-start gap-2.5">
            <Info className="h-4 w-4 text-parish-warning shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block text-text-main">
                Nguyên tắc bất biến của đề thi (ADR-096):
              </strong>
              <span>
                Toàn bộ nội dung câu hỏi, phương án và bảng đáp án chuẩn sẽ được đóng băng snapshot bất biến ngay tại thời điểm tạo. Mọi sửa đổi câu hỏi trong ngân hàng sau này sẽ không làm thay đổi đề thi đã sinh.
              </span>
            </div>
          </div>

          {/* Nút hành động sinh đề */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-text-muted">
              {build.mode === 'manual'
                ? `Đã chọn ${selected.size} câu hỏi`
                : build.blueprintId
                ? 'Đã chọn ma trận tự động'
                : 'Cần chọn ma trận đề'}
            </div>

            <Button
              size="lg"
              variant="primary"
              leadingIcon={<Sparkles className="h-5 w-5" />}
              disabled={
                !build.classId ||
                (build.mode === 'manual' ? selected.size === 0 : !build.blueprintId)
              }
              onClick={() => void buildExam()}
            >
              Tạo đề thi hoàn chỉnh
            </Button>
          </div>

          {/* Thông báo kết quả sinh đề */}
          {createdExamId && (
            <div className="rounded-xl border border-[var(--color-parish-success)]/30 bg-[var(--color-parish-success-bg)] p-4 text-sm text-text-main flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-parish-success shrink-0" />
                <span>
                  Đã tạo đề thi <strong>{createdExamId}</strong> với snapshot bất biến.
                </span>
              </div>
              <Button
                size="sm"
                variant="primary"
                trailingIcon={<ExternalLink className="h-4 w-4" />}
                onClick={() => {
                  // Jump to exam tab in GradesPage if accessible
                  const examTabBtn = document.querySelector<HTMLButtonElement>('[id*="grade-view-tabs-tab-exam"]')
                  if (examTabBtn) {
                    examTabBtn.click()
                  }
                }}
              >
                Đi đến danh sách chấm bài
              </Button>
            </div>
          )}
        </Surface>
      </TabPanel>

      {/* ─── MODALS ─── */}

      {/* Modal soạn câu hỏi */}
      <QuestionEditorModal
        isOpen={editorOpen}
        editing={Boolean(editingId)}
        form={form}
        setForm={setForm}
        branches={branchOptions}
        classes={editorClasses}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setEditorOpen(false)
            setEditingId(null)
            setForm(EMPTY_QUESTION)
          }
        }}
        onSave={() => void saveQuestion()}
      />

      {/* Modal import Word / Excel */}
      <QuestionBankImportModal
        isOpen={importOpen}
        branches={branchOptions}
        classes={editorClasses}
        onClose={() => setImportOpen(false)}
        onImported={count => {
          setMessage({
            text: `Đã import thành công ${count} câu hỏi vào trạng thái bản nháp.`,
            tone: 'success',
          })
          void loadQuestions()
        }}
      />

      {/* Modal xem trước câu hỏi trên Mobile / Tablet (<1280px) */}
      <ModalShell
        isOpen={mobilePreviewOpen && Boolean(preview)}
        onClose={() => setMobilePreviewOpen(false)}
        title="Chi tiết câu hỏi"
        subtitle={`Phiên bản v${preview?.currentVersion ?? 1} · Trạng thái: ${preview ? STATUS_LABELS[preview.status] : ''}`}
        icon={<BookOpenCheck className="h-5 w-5 text-parish-primary" />}
        maxWidth="680px"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMobilePreviewOpen(false)}>
              Đóng
            </Button>
          </div>
        }
      >
        {preview && (
          <div className="space-y-4">
            <div className="rounded-xl border border-surface-border bg-surface-card p-3.5">
              <div className="flex flex-wrap gap-1.5 mb-2">
                <Badge tone={STATUS_TONES[preview.status]}>{STATUS_LABELS[preview.status]}</Badge>
                <Badge tone="info">{TYPE_LABELS[preview.current.questionType]}</Badge>
                {preview.difficulty && (
                  <Badge tone={DIFFICULTY_TONES[preview.difficulty]}>
                    {DIFFICULTY_LABELS[preview.difficulty]}
                  </Badge>
                )}
              </div>
              <h3 className="text-base font-bold text-text-main">{preview.current.stem}</h3>
            </div>

            {preview.current.questionType === 'multiple_choice' && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Các đáp án:</span>
                {((preview.current.answerData.options ?? []) as Array<{ id: string; text: string }>).map(opt => {
                  const isCorrect = (
                    (preview.current.answerData.correctOptionIds ?? []) as string[]
                  ).includes(opt.id)
                  return (
                    <div
                      key={opt.id}
                      className={`rounded-xl border p-2.5 text-sm ${
                        isCorrect
                          ? 'border-[var(--color-parish-success)] bg-[var(--color-parish-success-bg)] text-[var(--color-parish-success-hover)] font-bold'
                          : 'border-surface-border bg-surface-card'
                      }`}
                    >
                      <span className="font-bold mr-1.5">{opt.id}.</span> {opt.text}
                      {isCorrect && (
                        <span className="ml-2 text-xs font-semibold text-parish-success">(Đúng)</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {preview.current.explanation && (
              <div className="rounded-xl border border-surface-border bg-surface-sunken p-3 text-sm text-text-secondary">
                <strong className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1">
                  Lời giải / Hướng dẫn:
                </strong>
                <p className="whitespace-pre-line">{preview.current.explanation}</p>
              </div>
            )}

            <div className="border-t border-surface-border pt-3">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-2">
                Thao tác quy trình:
              </span>
              <div className="flex flex-wrap gap-2">
                {(role === 'admin' || (preview.createdBy === user?.id && preview.status === 'draft')) &&
                  preview.status !== 'archived' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      leadingIcon={<FilePlus2 className="h-4 w-4" />}
                      onClick={() => {
                        setMobilePreviewOpen(false)
                        setEditingId(preview.id)
                        setForm(questionFormFromItem(preview, editorClasses))
                        setEditorOpen(true)
                      }}
                    >
                      Sửa / Tạo bản mới
                    </Button>
                  )}
                {preview.status === 'draft' && (role === 'admin' || preview.createdBy === user?.id) && (
                  <Button
                    size="sm"
                    variant="primary"
                    leadingIcon={<Send className="h-4 w-4" />}
                    onClick={() => {
                      setMobilePreviewOpen(false)
                      void lifecycle(preview, 'submit')
                    }}
                  >
                    Gửi duyệt
                  </Button>
                )}
                {role === 'admin' && preview.status === 'in_review' && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setMobilePreviewOpen(false)
                        void lifecycle(preview, 'approve')
                      }}
                    >
                      Duyệt
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setMobilePreviewOpen(false)
                        void lifecycle(preview, 'reject')
                      }}
                    >
                      Trả về nháp
                    </Button>
                  </>
                )}
                {role === 'admin' && preview.status === 'approved' && (
                  <Button
                    size="sm"
                    variant="primary"
                    leadingIcon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={() => {
                      setMobilePreviewOpen(false)
                      void lifecycle(preview, 'activate')
                    }}
                  >
                    Kích hoạt
                  </Button>
                )}
                {role === 'admin' && (preview.status === 'active' || preview.status === 'approved') && (
                  <Button
                    size="sm"
                    variant="danger"
                    leadingIcon={<Archive className="h-4 w-4" />}
                    onClick={() => {
                      setMobilePreviewOpen(false)
                      void lifecycle(preview, 'archive')
                    }}
                  >
                    Lưu trữ
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </ModalShell>

      {/* Modal xem chi tiết quy tắc ma trận đề */}
      <ModalShell
        isOpen={Boolean(inspectBlueprint)}
        onClose={() => setInspectBlueprint(null)}
        title={inspectBlueprint?.name ?? 'Chi tiết ma trận đề'}
        subtitle={`Tổng số: ${inspectBlueprint?.totalQuestions ?? 0} câu hỏi · Thang điểm: ${inspectBlueprint?.maxScore ?? 0}đ`}
        icon={<Layers3 className="h-5 w-5 text-parish-primary" />}
        maxWidth="640px"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInspectBlueprint(null)}>
              Đóng
            </Button>
          </div>
        }
      >
        {inspectBlueprint && (
          <div className="space-y-3">
            <div className="rounded-xl border border-surface-border bg-surface-sunken p-3 text-xs text-text-secondary">
              Phân cấp mục tiêu: <strong>{inspectBlueprint.curriculumLevel || 'Dùng chung toàn ngành'}</strong> · Trạng thái:{' '}
              <Badge tone={inspectBlueprint.status === 'active' ? 'success' : 'neutral'}>
                {inspectBlueprint.status === 'active' ? 'Đang hoạt động' : 'Bản nháp'}
              </Badge>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Cấu trúc các dòng quy tắc phân bổ:
              </span>
              {(inspectBlueprint.rules ?? []).map((rule, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-surface-border bg-surface-card p-3 text-xs flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-text-main">
                      #{idx + 1}. {TYPE_LABELS[rule.questionType]}
                    </span>
                    <span className="text-text-muted ml-2">
                      ({rule.difficulty ? DIFFICULTY_LABELS[rule.difficulty] : 'Mọi mức độ'})
                    </span>
                  </div>
                  <div className="font-extrabold text-parish-primary text-sm">
                    {rule.questionCount} câu × {rule.pointsEach}đ = {rule.questionCount * rule.pointsEach}đ
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  )
}

export default QuestionBankView
