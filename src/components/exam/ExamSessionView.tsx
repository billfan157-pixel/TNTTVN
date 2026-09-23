import React, { useCallback, useMemo, useState, useEffect } from 'react'
import { useStudentStore } from '../../stores/studentStore'
import { normalizeExamSessionClassFilter, scopeExamWorkspaceClasses } from '../../lib/examSessionScope'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useAuth } from '../../hooks/useAuth'
import { useExamStore, SCORE_TYPE_LABELS, DAILY_TYPES } from '../../stores/examStore'
import { api } from '../../lib/api'
import { QuickScoreEntry } from './QuickScoreEntry'
import { ExamResultsTable } from './ExamResultsTable'
import type { GuidedGradeStudent } from './GuidedGradeModal'
import { useToastStore } from '../../stores/toastStore'
import { getConfiguredExamVersions } from '../../lib/examVariants'
import { useEffectiveMode } from '../../hooks/useEffectiveMode'
import {
  ClipboardList, Plus, Printer, CheckCircle2, AlertTriangle, AlertCircle,
  RotateCcw, Loader2, Save, QrCode, ScanLine, Trash2,
  ListChecks, X, Sparkles, FileText, RefreshCw, Images, BarChart3, Layers3,
  Upload, School, Eye, Zap, Grid3X3, BookOpen, Search, ChevronRight, ArrowLeft,
} from 'lucide-react'
import type { ExamScoreType, ExamQuestion, ExamType } from '../../types'
import type { ExamImportScope } from '../../utils/examParser'
import { parseQuickAnswerString } from '../../utils/examQuickKeyParser'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { ModalPortal } from '../common/ModalPortal'
import { ErrorBoundary } from '../common/ErrorBoundary'
import { SubpageHeader } from '../common/SubpageHeader'
import { Badge, Button, Surface } from '../common/ui'
import { Tabs, TabPanel } from '../common/ui/SelectionControls'
import { lazyWithRetry } from '../../utils/lazyWithRetry'

// Dùng lazyWithRetry (thay vì React.lazy trần) để tự retry khi Vite dev trả
// 504 "Outdated Optimize Dep" cho qrcode-generator/jsqr trong lúc optimizer
// re-bundle. Lỗi transient này trước đây làm sập cả ExamPaperModal ngay lần
// fetch đầu tiên và rơi lên ErrorBoundary cấp route.
// Giữ nguyên factory `.then(m => ({ default: m.X }))` để TypeScript suy được
// đúng kiểu props của từng modal (như React.lazy trước đây).
const GuidedGradeModal = lazyWithRetry<typeof import('./GuidedGradeModal').GuidedGradeModal>(() => import('./GuidedGradeModal').then(module => ({ default: module.GuidedGradeModal })))
const ExamScanModal = lazyWithRetry<typeof import('./ExamScanModal').ExamScanModal>(() => import('./ExamScanModal').then(module => ({ default: module.ExamScanModal })))
const ExamImportModal = lazyWithRetry<typeof import('./ExamImportModal').ExamImportModal>(() => import('./ExamImportModal').then(module => ({ default: module.ExamImportModal })))
const ExamPaperModal = lazyWithRetry<typeof import('./ExamPaperModal').ExamPaperModal>(() => import('./ExamPaperModal').then(module => ({ default: module.ExamPaperModal })))
const ExamBatchScanModal = lazyWithRetry<typeof import('./ExamBatchScanModal').ExamBatchScanModal>(() => import('./ExamBatchScanModal').then(module => ({ default: module.ExamBatchScanModal })))
const ExamAnalyticsPanel = lazyWithRetry<typeof import('./ExamAnalyticsPanel').ExamAnalyticsPanel>(() => import('./ExamAnalyticsPanel').then(module => ({ default: module.ExamAnalyticsPanel })))
const ExamVariantsModal = lazyWithRetry<typeof import('./ExamVariantsModal').ExamVariantsModal>(() => import('./ExamVariantsModal').then(module => ({ default: module.ExamVariantsModal })))

const SCORE_TYPES: { id: ExamScoreType; label: string; daily: boolean }[] = [
  { id: 'oral', label: 'Điểm Miệng', daily: true },
  { id: '15m', label: '15 Phút', daily: true },
  { id: '1period', label: '1 Tiết', daily: true },
  { id: 'midterm', label: 'Giữa Kỳ', daily: false },
  { id: 'final', label: 'Cuối Kỳ', daily: false },
]


/** Hiển thị năm học an toàn — tránh năm rỗng trong UI. */
function normalizeActiveAY(ay: string): string {
  return ay?.trim() || new Date().getFullYear().toString()
}

const VALID_MC_OPTIONS = new Set(['A', 'B', 'C', 'D'])

/** UI-POLISH 2026-08-25: một phần đề nạp từ ô import (TN hoặc TL). */
interface ExamPartSummary {
  questions: ExamQuestion[]
  totalPoints: number
}

/**
 * Ghép 2 phần đề thành mảng questions của phiên:
 * TN index 1..N (khớp phiếu OMR), TL tiếp theo N+1..N+M (server validate
 * MC contiguous từ 1 — validateMcIndexLayout). Trả undefined khi rỗng.
 */
function mergeExamParts(mc: ExamPartSummary | null, essay: ExamPartSummary | null): ExamQuestion[] | undefined {
  if (!mc && !essay) return undefined
  const mcQs = (mc?.questions ?? []).map((q, i) => ({ ...q, index: i + 1 }))
  const essayQs = (essay?.questions ?? []).map((q, i) => ({ ...q, index: mcQs.length + i + 1 }))
  return [...mcQs, ...essayQs]
}

/**
 * Parse answerKey an toàn — dữ liệu từ server có thể hỏng (zod chỉ nhận string),
 * JSON.parse trực tiếp sẽ crash scan modal/xem đáp án.
 * Validate giá trị chỉ chứa A/B/C/D, bỏ các entry hợp lệ khác.
 */
function parseAnswerKeySafe(raw: unknown): Record<number, 'A' | 'B' | 'C' | 'D'> {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>)
    const result: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
    for (const [key, value] of entries) {
      const q = Number(key)
      if (Number.isInteger(q) && q >= 1 && VALID_MC_OPTIONS.has(value as string)) {
        result[q] = value as 'A' | 'B' | 'C' | 'D'
      }
    }
    return result
  }
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const q = Number(key)
      if (Number.isInteger(q) && q >= 1 && VALID_MC_OPTIONS.has(value as string)) {
        result[q] = value as 'A' | 'B' | 'C' | 'D'
      }
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Parse questions an toàn từ JSON string hoặc object array.
 */
function parseQuestionsSafe(raw: unknown): ExamQuestion[] {
  if (Array.isArray(raw)) return raw as ExamQuestion[]
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ExamQuestion[]) : []
  } catch {
    return []
  }
}

export const ExamSessionView: React.FC = () => {
  const effectiveMode = useEffectiveMode()
  const { can } = useAuth()
  // A-NEW (2026-08-12): phuta (trợ tá) cũng tạo + xóa phiên chấm cho lớp mình phụ trách.
  const canManage = can('admin', 'chunhiem', 'phuta')
  const canScan = can('admin', 'chunhiem', 'phuta')
  // A-NEW (2026-08-13): chunhiem/phuta mặc định chỉ được chọn lớp mình được phân công —
  // bộ lọc toàn cục ẩn với non-admin (RootLayout force 'all'). GET /classes là
  // parish-wide cho roster, nên workspace thi phải lọc bằng assignment marker.
  const isAdmin = can('admin')
  const classCatalog = useClassStore(s => s.classes)
  const classLoading = useClassStore(s => s.loading)
  const fetchClasses = useClassStore(s => s.fetchClasses)
  const assignedClasses = useMemo(
    () => scopeExamWorkspaceClasses(classCatalog, isAdmin),
    [classCatalog, isAdmin],
  )

  const students = useStudentStore(s => s.students)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const findClassById = useClassStore(s => s.findClassById)

  const [viewClassId, setViewClassId] = useState<string | null>(null)
  // Filter toàn cục dùng sentinel `all`; không được gửi nó như một class ID.
  const effectiveClassId = isAdmin ? normalizeExamSessionClassFilter(selectedClassId) : viewClassId

  const {
    sessions, results, loading, saving, finalizing, error, lastFinalize,
    loadClassSessions, loadMySessions, createSession, selectSession, refreshResults, saveScores, removeResult,
    completeAndFinalize, reopenSession, deleteSession, clearError,
  } = useExamStore()

  const [showCreate, setShowCreate] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showGuidedGrade, setShowGuidedGrade] = useState(false)
  const [fixedScanStudent, setFixedScanStudent] = useState<GuidedGradeStudent | null>(null)
  const [showAnswerKeyModal, setShowAnswerKeyModal] = useState(false)
  const closeAnswerKeyModal = useCallback(() => setShowAnswerKeyModal(false), [])
  const closeCreateModal = useCallback(() => {
    setShowCreate(false)
    setQuickKeyInput('')
    setReviewViewMode('matrix')
  }, [])
  const { dialogRef: answerKeyTrapRef, titleId: answerKeyTitleId } = useAccessibleDialog(showAnswerKeyModal, closeAnswerKeyModal)
  const { dialogRef: createTrapRef, titleId: createTitleId } = useAccessibleDialog(showCreate, closeCreateModal)
  const [rescoreLoading, setRescoreLoading] = useState(false)
  const [rescoreResult, setRescoreResult] = useState<{ rescored: number; skipped: number } | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  // UI-POLISH 2026-08-25: 2 Ô IMPORT RIÊNG — Phần Trắc Nghiệm / Phần Tự Luận.
  const [importScope, setImportScope] = useState<ExamImportScope>('multiple_choice')
  const [mcPart, setMcPart] = useState<ExamPartSummary | null>(null)
  const [essayPart, setEssayPart] = useState<ExamPartSummary | null>(null)
  const [showPaperModal, setShowPaperModal] = useState(false)
  const [showBatchScan, setShowBatchScan] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showVariants, setShowVariants] = useState(false)
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()
  const activeAY = useAcademicYearStore(s => s.currentYear)
  const [createForm, setCreateForm] = useState<{
    classId?: string
    subject: string
    scoreType: ExamScoreType
    maxScore: number
    examType: ExamType
    questionCount: number
    answerKey: Record<number, 'A' | 'B' | 'C' | 'D'>
    questions?: ExamQuestion[]
  }>({
    classId: '',
    subject: '',
    scoreType: '15m',
    maxScore: 10,
    examType: 'written',
    questionCount: 20,
    answerKey: {},
  })
  const [conflictsConfirmed, setConflictsConfirmed] = useState(false)
  const [createError, setCreateError] = useState('')
  const [quickKeyInput, setQuickKeyInput] = useState('')
  const [reviewViewMode, setReviewViewMode] = useState<'matrix' | 'details'>('matrix')
  const [sessionSearch, setSessionSearch] = useState('')
  const [sessionStatusFilter, setSessionStatusFilter] = useState<'all' | 'draft' | 'completed'>('all')
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'grade' | 'results'>('grade')

  useEffect(() => {
    // Tải danh sách lớp học nếu store chưa có hoặc rỗng
    if (classCatalog.length === 0) {
      fetchClasses()
    }
  }, [classCatalog.length, fetchClasses])

  useEffect(() => {
    // Khi mở modal tạo phiên, nếu chưa có classId mà danh sách lớp đã tải xong, tự động điền lớp
    if (showCreate && !createForm.classId && assignedClasses.length > 0) {
      const defaultId = (effectiveClassId && assignedClasses.some(c => c.id === effectiveClassId))
        ? effectiveClassId
        : assignedClasses[0].id
      setCreateForm(f => ({ ...f, classId: defaultId }))
    }
  }, [showCreate, createForm.classId, assignedClasses, effectiveClassId])

  useEffect(() => {
    // Non-admin: giữ null cho chế độ “Tất cả”; chỉ reset khi class đã chọn không
    // còn nằm trong phân công hiện tại.
    if (!isAdmin) {
      const first = assignedClasses[0]?.id ?? null
      setViewClassId(v => (v !== null && !assignedClasses.some(c => c.id === v) ? first : v))
      return
    }
  }, [isAdmin, assignedClasses])

  useEffect(() => {
    clearError()
  }, [effectiveClassId, clearError])

  useEffect(() => {
    if (effectiveClassId) {
      loadClassSessions(effectiveClassId)
    } else {
      // Khi chọn "Tất cả các lớp": tải toàn bộ phiên chấm (admin thấy toàn xứ đoàn, GLV thấy các lớp phụ trách)
      loadMySessions()
    }
  }, [effectiveClassId, loadClassSessions, loadMySessions])

  const activeSession = sessions.find(s => s.id === useExamStore.getState().selectedSessionId) || null
  const activeSessionClassId = activeSession?.classId || effectiveClassId

  const displayedSessions = useMemo(() => {
    return sessions.filter(s => {
      if (selectedSemester && s.semester !== selectedSemester) return false
      if (effectiveClassId && s.classId !== effectiveClassId) return false
      return true
    })
  }, [sessions, selectedSemester, effectiveClassId])

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase()
    return displayedSessions.filter(s => {
      if (sessionStatusFilter !== 'all' && s.status !== sessionStatusFilter) return false
      if (!q) return true
      const subject = s.subject.toLowerCase()
      const className = (findClassById(s.classId)?.name || '').toLowerCase()
      const scoreType = (SCORE_TYPE_LABELS[s.scoreType] || '').toLowerCase()
      return subject.includes(q) || className.includes(q) || scoreType.includes(q)
    })
  }, [displayedSessions, sessionSearch, sessionStatusFilter, findClassById])

  const totalSessionsCount = displayedSessions.length
  const draftSessionsCount = useMemo(() => displayedSessions.filter(s => s.status === 'draft').length, [displayedSessions])
  const completedSessionsCount = useMemo(() => displayedSessions.filter(s => s.status === 'completed').length, [displayedSessions])

  const classStudents = useMemo(
    () => activeSessionClassId
      ? students
          .filter(s => s.classId === activeSessionClassId && s.status === 'Đang học')
          .sort((a, b) => a.code.localeCompare(b.code))
          .map(s => ({ id: s.id, name: s.fullName, code: s.code, holyName: s.holyName }))
      : [],
    [activeSessionClassId, students]
  )

  const gradedStudentCount = results.length
  const totalStudentsInClass = classStudents.length
  const gradingProgressPercent = totalStudentsInClass > 0 ? Math.round((gradedStudentCount / totalStudentsInClass) * 100) : 0

  const savedScores = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of results) map[r.studentId] = r.score
    return map
  }, [results])

  const activeSessionQuestions = useMemo(
    () => (activeSession ? parseQuestionsSafe(activeSession.questions) : []),
    [activeSession]
  )
  // EXAM-MIXED: trần điểm phần tự luận = tổng points của các câu TL; phần TN tự chấm.
  const activeIsMixed = activeSession?.examType === 'mixed'
  const activeEssayMaxPoints = useMemo(
    () => Math.round(activeSessionQuestions
      .filter(q => q.type === 'essay')
      .reduce((sum, q) => sum + (q.points ?? 1), 0) * 100) / 100,
    [activeSessionQuestions]
  )
  // Điểm phần tự luận đã lưu từng em (để nhập/cập nhật lại đúng phần TL).
  const savedEssayScores = useMemo(() => {
    if (!activeIsMixed) return {}
    const map: Record<string, number> = {}
    for (const r of results) {
      if (typeof r.essayScore === 'number') map[r.studentId] = r.essayScore
    }
    return map
  }, [results, activeIsMixed])
  const activeExamVersions = useMemo(
    () => activeSession
      ? getConfiguredExamVersions(activeSession.answerVariants, activeSession.answerKey, activeSession.questionCount)
      : ['A' as const],
    [activeSession],
  )

  const handleOpenCreate = () => {
    if (classCatalog.length === 0) {
      fetchClasses()
    }
    const defaultId = (effectiveClassId && assignedClasses.some(c => c.id === effectiveClassId))
      ? effectiveClassId
      : (assignedClasses[0]?.id || '')
    setCreateForm(f => ({
      ...f,
      classId: defaultId,
    }))
    setCreateError('')
    setQuickKeyInput('')
    setReviewViewMode('matrix')
    setShowCreate(true)
  }

  // ─── UI-POLISH 2026-08-25: import theo từng phần ───
  /** Tổng điểm của một loại câu (points ?? 1) — payload import chỉ có totalPoints chung. */
  const sumPointsOf = (qs: ExamQuestion[], kind: 'mc' | 'essay') =>
    Math.round(qs
      .filter(q => (((q.type ?? 'multiple_choice') === 'essay') ? 'essay' : 'mc') === kind)
      .reduce((s, q) => s + (q.points ?? 1), 0) * 100) / 100

  const handleMcImport = (data: {
    questions: ExamQuestion[]
    answerKey: Record<number, 'A' | 'B' | 'C' | 'D'>
    mcQuestionCount: number
    subject?: string
  }) => {
    const part: ExamPartSummary = { questions: data.questions, totalPoints: sumPointsOf(data.questions, 'mc') }
    setMcPart(part)
    setCreateForm(f => ({
      ...f,
      subject: data.subject || f.subject,
      examType: essayPart ? 'mixed' : 'multiple_choice',
      questionCount: data.mcQuestionCount,
      answerKey: data.answerKey,
      questions: mergeExamParts(part, essayPart),
    }))
    setReviewViewMode('details')
    setCreateError('')
  }

  const handleEssayImport = (data: {
    questions: ExamQuestion[]
    subject?: string
  }) => {
    const part: ExamPartSummary = { questions: data.questions, totalPoints: sumPointsOf(data.questions, 'essay') }
    setEssayPart(part)
    setCreateForm(f => ({
      ...f,
      subject: data.subject || f.subject,
      // Có phần TL → đề mixed (bắt cặp với phần TN; thiếu TN sẽ bị chặn ở validate).
      examType: 'mixed',
      questions: mergeExamParts(mcPart, part),
    }))
    setReviewViewMode('details')
    setCreateError('')
  }

  const removeMcPart = () => {
    setMcPart(null)
    setCreateForm(f => ({
      ...f,
      questionCount: 20,
      answerKey: {},
      questions: mergeExamParts(null, essayPart),
      examType: f.examType === 'multiple_choice' ? 'written' : f.examType,
    }))
  }

  const removeEssayPart = () => {
    setEssayPart(null)
    setCreateForm(f => ({
      ...f,
      questions: mergeExamParts(mcPart, null),
      examType: f.examType === 'mixed' ? 'multiple_choice' : f.examType,
    }))
  }

  // UI-POLISH 2026-08-25: đổi hình thức → dọn phần đề không còn phù hợp
  // (import 2 phần TN/TL CHỈ dành cho hình thức Kết hợp; MC chỉ ô TN; written không import).
  const handleExamTypeChange = (next: ExamType) => {
    setCreateError('')
    if (next === 'written') {
      setMcPart(null)
      setEssayPart(null)
      setCreateForm(f => ({ ...f, examType: next, questions: undefined, answerKey: {}, questionCount: 20 }))
      return
    }
    if (next === 'multiple_choice') {
      setEssayPart(null)
      setCreateForm(f => ({ ...f, examType: next, questions: mergeExamParts(mcPart, null) }))
      return
    }
    setCreateForm(f => ({ ...f, examType: next, questions: mergeExamParts(mcPart, essayPart) }))
  }

  const handleCreate = async () => {
    const targetClassId = createForm.classId || effectiveClassId
    if (!targetClassId) {
      setCreateError('Vui lòng chọn lớp học để tạo phiên chấm.')
      return
    }
    if (!createForm.subject.trim()) {
      setCreateError('Vui lòng nhập tên bài kiểm tra / môn học.')
      return
    }
    // UI-POLISH 2026-08-25: ràng buộc theo 2 phần đề đã nạp.
    if (createForm.examType === 'mixed' && !mcPart) {
      setCreateError('Đề Kết hợp cần PHẦN TRẮC NGHIỆM — bấm Import ở ô "Phần Trắc Nghiệm" hoặc đổi hình thức khác.')
      return
    }
    if (createForm.examType === 'multiple_choice' && essayPart) {
      setCreateError('Đang nạp PHẦN TỰ LUẬN — chọn hình thức "Kết hợp TN + TL" hoặc gỡ phần tự luận.')
      return
    }
    // Trắc nghiệm bắt buộc có đủ đáp án cho từng câu — nếu không, OMR detector
    // không chấm được (câu thiếu key → isCorrect undefined → điểm lệch).
    if (createForm.examType === 'multiple_choice' || createForm.examType === 'mixed') {
      const missingCount = createForm.questionCount - Object.keys(createForm.answerKey).length
      if (missingCount > 0) {
        setCreateError(`Còn ${missingCount} câu trắc nghiệm chưa có đáp án — điền đủ đáp án A/B/C/D trước khi tạo phiên.`)
        return
      }
      const bad = Object.keys(createForm.answerKey).find(q => Number(q) > createForm.questionCount)
      if (bad) setCreateError(`Đáp án câu ${bad} vượt quá ${createForm.questionCount} câu.`)
      if (createForm.examType === 'mixed') {
        const hasEssay = (createForm.questions ?? []).some(q => q.type === 'essay')
        if (!hasEssay) {
          setCreateError('Đề mixed phải có ít nhất một câu tự luận — import lại đề có phần TỰ LUẬN hoặc chọn hình thức khác.')
          return
        }
      }
    }
    // Cảnh báo tạo trùng: đã có phiên draft cùng lớp + môn + loại điểm (cùng học kỳ).
    const duplicateDraft = sessions.find(s =>
      s.classId === targetClassId &&
      s.status === 'draft' &&
      s.semester === selectedSemester &&
      s.scoreType === createForm.scoreType &&
      s.subject.trim().toLowerCase() === createForm.subject.trim().toLowerCase()
    )
    if (duplicateDraft) {
      const proceed = await askConfirm({
        title: 'Tạo phiên trùng?',
        message: `Đã có phiên chấm draft "${duplicateDraft.subject}" cùng môn/loại điểm "${SCORE_TYPE_LABELS[createForm.scoreType]}" trong học kỳ này. Hoàn tất 2 phiên trùng sẽ ghi đè điểm lẫn nhau. Tạo thêm phiên mới?`,
        confirmText: 'Vẫn tạo',
        variant: 'warning',
      })
      if (!proceed) return
    }
    const session = await createSession({
      classId: targetClassId,
      subject: createForm.subject.trim(),
      scoreType: createForm.scoreType,
      maxScore: createForm.maxScore,
      academicYear: useAcademicYearStore.getState().resolveActiveYear(),
      semester: selectedSemester,
      examType: createForm.examType,
      // questionCount = số câu TRẮC NGHIỆM (khớp phiếu OMR 1..N) với mọi hình thức có phần TN.
      questionCount: createForm.examType === 'multiple_choice' || createForm.examType === 'mixed' ? createForm.questionCount : undefined,
      answerKey: createForm.examType === 'multiple_choice' || createForm.examType === 'mixed'
        ? (JSON.stringify(createForm.answerKey) as any)
        : undefined,
      questions: createForm.questions ? JSON.stringify(createForm.questions) : undefined,
    })
    if (session) {
      setShowCreate(false)
      setCreateError('')
      setQuickKeyInput('')
      setMcPart(null)
      setEssayPart(null)
      setCreateForm({
        classId: '',
        subject: '',
        scoreType: '15m',
        maxScore: 10,
        examType: 'written',
        questionCount: 20,
        answerKey: {},
        questions: undefined,
      })
      selectSession(session.id)
    }
  }

  const handleSaveScore = async (studentId: string, score: number, opts?: { essay?: boolean }) => {
    // EXAM-MIXED: score ở đây là ĐIỂM TỰ LUẬN — server tự cộng phần TN đã quét.
    if (opts?.essay) {
      return (await saveScores([{ studentId, score, essayScore: score, source: 'quick_entry' }])) !== null
    }
    return (await saveScores([{ studentId, score, source: 'quick_entry' }])) !== null
  }

  const handleRemoveResult = async (resultId: string) => {
    const r = results.find(x => x.id === resultId)
    if (!r) return
    const ok = await askConfirm({
      title: 'Xóa kết quả',
      message: `Xóa kết quả ${r.score} của ${r.studentName || r.studentId}? Bạn có thể quét lại hoặc nhập lại sau.`,
      confirmText: 'Xóa',
      variant: 'danger',
    })
    if (!ok) return
    await removeResult(r.studentId)
  }

  const handleFinalize = async () => {
    // Cảnh báo học sinh chưa có điểm trước khi hoàn tất — tránh finalize sớm nửa lớp.
    const gradedIds = new Set(results.map(r => r.studentId))
    const missing = classStudents.filter(s => !gradedIds.has(s.id))
    if (missing.length > 0) {
      const preview = missing.slice(0, 5).map(s => `${s.name} (${s.code})`).join(', ')
      const proceed = await askConfirm({
        title: `Hoàn tất khi còn ${missing.length} thiếu nhi chưa có điểm?`,
        message: `Chưa có kết quả cho: ${missing.length > 5 ? `${preview}… (+${missing.length - 5} khác)` : preview}. Hoàn tất sẽ đóng phiên và ghi điểm hiện tại vào bảng điểm (${results.length}/${classStudents.length} học sinh).`,
        confirmText: 'Hoàn Tất',
        variant: 'warning',
      })
      if (!proceed) return
    }
    const result = await completeAndFinalize()
    if (result && result.conflicts.length === 0) {
      setConflictsConfirmed(true)
    }
  }

  const handleDeleteSession = async () => {
    if (!activeSession) return
    const n = results.length
    const ok = await askConfirm({
      title: 'Xóa phiên chấm',
      message: `Xóa phiên chấm "${activeSession.subject}"? Toàn bộ ${n} kết quả trong phiên sẽ bị xóa vĩnh viễn (phiên chưa hoàn tất).`,
      confirmText: 'Xóa',
      variant: 'danger',
    })
    if (!ok) return
    const okResult = await deleteSession(activeSession.id)
    if (okResult) setConflictsConfirmed(false)
  }

  const hasBlockedConflicts = !!lastFinalize && lastFinalize.conflicts.length > 0
  const requiresAnswerKey = createForm.examType === 'multiple_choice' || createForm.examType === 'mixed'
  const completedAnswerCount = requiresAnswerKey
    ? Array.from({ length: createForm.questionCount }, (_, index) => index + 1)
        .filter(question => Boolean(createForm.answerKey[question])).length
    : 0

  const missingQuestions = useMemo(() => {
    if (!requiresAnswerKey) return []
    const missing: number[] = []
    for (let q = 1; q <= createForm.questionCount; q++) {
      if (!createForm.answerKey[q]) missing.push(q)
    }
    return missing
  }, [requiresAnswerKey, createForm.questionCount, createForm.answerKey])

  const handleApplyQuickKey = () => {
    if (!quickKeyInput.trim()) return
    const parsed = parseQuickAnswerString(quickKeyInput, createForm.questionCount)
    const count = Object.keys(parsed).length
    if (count === 0) {
      setCreateError('Không nhận diện được đáp án A/B/C/D từ chuỗi vừa nhập. Vui lòng kiểm tra lại (VD: ABCD... hoặc 1A 2B 3C...).')
      return
    }
    setCreateForm(f => ({
      ...f,
      answerKey: { ...f.answerKey, ...parsed },
    }))
    setQuickKeyInput('')
    setCreateError('')
  }

  const handleClearAnswerKey = () => {
    setCreateForm(f => ({ ...f, answerKey: {} }))
    setCreateError('')
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-xl border border-parish-danger/30 bg-parish-danger-bg/40 px-4 py-3 text-sm text-parish-danger flex items-center gap-2">
          <AlertTriangle size={16} />
          <span className="flex-1 font-semibold">{error}</span>
          <button type="button" className="text-xs underline font-bold" onClick={clearError}>Đóng</button>
        </div>
      )}

      {!activeSession ? (
        /* ========================================================================= */
        /* 1. CATALOG VIEW: DANH SÁCH & LƯỚI PHIÊN CHẤM (FULL-WIDTH 3 CỘT DESKTOP)   */
        /* ========================================================================= */
        <div className="flex flex-col gap-5">
          {/* Header */}
          {effectiveMode === 'mobile' ? (
            <SubpageHeader
              icon={<ClipboardList size={16} />}
              title="Chấm Bài Kiểm Tra"
              meta={
                <span className="truncate">
                  {effectiveClassId
                    ? `${findClassById(effectiveClassId)?.name || 'Lớp'} · QR & OMR · NH ${normalizeActiveAY(activeAY)}`
                    : `Tất cả lớp · QR & OMR · NH ${normalizeActiveAY(activeAY)}`}
                </span>
              }
              actions={
                canManage ? (
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="subpage-header__btn subpage-header__btn--primary"
                  >
                    <Plus size={13} /> Tạo Phiên
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-1.5 rounded-xl border border-surface-border bg-surface-card shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                  <ClipboardList size={16} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-text-primary truncate">
                    Chấm Bài Kiểm Tra
                  </h2>
                  <p className="text-xs text-text-muted truncate hidden xl:block">
                    {effectiveClassId
                      ? `Lớp: ${findClassById(effectiveClassId)?.name || 'Lớp'} · Học kỳ ${selectedSemester} · Năm học ${normalizeActiveAY(activeAY)}`
                      : `Tất cả các lớp · Học kỳ ${selectedSemester} · Năm học ${normalizeActiveAY(activeAY)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone="primary">Học kỳ {selectedSemester}</Badge>
                {canManage && (
                  <Button
                    size="sm"
                    variant="primary"
                    leadingIcon={<Plus className="h-4 w-4" />}
                    onClick={handleOpenCreate}
                    className="h-8.5 text-xs font-bold"
                  >
                    Tạo Phiên Chấm
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 4 Thẻ KPI Metrics Tổng Quan */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Surface variant="card" className="p-3.5 flex flex-col justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Tổng số phiên</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-text-main">{totalSessionsCount}</span>
                <span className="text-xs text-text-muted">Học kỳ {selectedSemester}</span>
              </div>
            </Surface>

            <Surface variant="card" className="p-3.5 flex flex-col justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Đang chấm (Draft)</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-parish-primary">{draftSessionsCount}</span>
                <Badge tone="primary">Đang mở</Badge>
              </div>
            </Surface>

            <Surface variant="card" className="p-3.5 flex flex-col justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Đã hoàn tất</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-parish-success">{completedSessionsCount}</span>
                <Badge tone="success">Khóa sổ</Badge>
              </div>
            </Surface>

            <Surface variant="card" className="p-3.5 flex flex-col justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Phiên đang chọn</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-text-muted">—</span>
                <span className="text-xs text-text-muted">Chưa mở phiên</span>
              </div>
            </Surface>
          </div>

          {/* Class chips cho GLV */}
          {!isAdmin && assignedClasses.length > 0 && (
            <div className="mobile-scroll-row -mx-1 px-1 pb-1">
              <button
                type="button"
                onClick={() => setViewClassId(null)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  viewClassId === null ? 'bg-parish-primary text-white shadow-2xs' : 'bg-surface-hover text-text-secondary'
                }`}
              >
                Tất cả ({assignedClasses.length} lớp)
              </button>
              {assignedClasses.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setViewClassId(c.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    viewClassId === c.id ? 'bg-parish-primary text-white shadow-2xs' : 'bg-surface-hover text-text-secondary'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Catalog Filter & Search Toolbar */}
          <Surface variant="card" className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Tìm kiếm theo tên môn, lớp, loại điểm..."
                  value={sessionSearch}
                  onChange={e => setSessionSearch(e.target.value)}
                  className="form-input min-h-9 w-full pl-9 pr-8 text-xs"
                />
                {sessionSearch && (
                  <button
                    type="button"
                    onClick={() => setSessionSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Filter status pills */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              {(['all', 'draft', 'completed'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSessionStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    sessionStatusFilter === st
                      ? 'bg-parish-primary text-white shadow-2xs'
                      : 'bg-surface-app border border-surface-border text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {st === 'all' ? `Tất cả (${displayedSessions.length})` : st === 'draft' ? `Đang chấm (${draftSessionsCount})` : `Đã xong (${completedSessionsCount})`}
                </button>
              ))}
            </div>
          </Surface>

          {/* Session Grid Cards (Desktop 3 Cột Rộng Rãi) */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-text-muted py-16">
              <Loader2 size={20} className="animate-spin text-parish-primary" /> Đang tải danh sách phiên chấm…
            </div>
          ) : filteredSessions.length === 0 ? (
            <Surface variant="card" className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-parish-primary/10 text-parish-primary flex items-center justify-center mb-3">
                <ClipboardList size={28} />
              </div>
              <h3 className="font-bold text-base text-text-main m-0 mb-1">
                {displayedSessions.length === 0
                  ? (effectiveClassId
                      ? `Chưa có phiên chấm nào cho ${findClassById(effectiveClassId)?.name || 'lớp này'}`
                      : 'Chưa có phiên chấm nào trong học kỳ này')
                  : 'Không tìm thấy phiên chấm phù hợp'}
              </h3>
              <p className="text-xs text-text-muted max-w-sm m-0 mb-4">
                {displayedSessions.length === 0
                  ? 'Tạo phiên kiểm tra mới để bắt đầu nhập điểm hoặc quét phiếu trả lời OMR cho thiếu nhi.'
                  : 'Hãy thử tìm kiếm với từ khóa khác hoặc thay đổi bộ lọc trạng thái.'}
              </p>
              {canManage && displayedSessions.length === 0 && (
                <Button leadingIcon={<Plus size={15} />} onClick={handleOpenCreate}>
                  Tạo Phiên Chấm Đầu Tiên
                </Button>
              )}
            </Surface>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSessions.map(s => {
                const sessionClass = findClassById(s.classId)
                return (
                  <Surface
                    key={s.id}
                    as="button"
                    type="button"
                    variant="card"
                    interactive
                    aria-label={`${s.subject} — ${sessionClass?.name || 'chưa xếp lớp'} — ${s.status === 'draft' ? 'Vào Chấm Điểm' : 'Xem Kết Quả'}`}
                    className="p-4 w-full text-left flex flex-col justify-between gap-4 border border-surface-border hover:border-parish-primary/50 hover:shadow-card transition-colors cursor-pointer group"
                    onClick={() => selectSession(s.id)}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge tone="primary">{SCORE_TYPE_LABELS[s.scoreType]}</Badge>
                          {sessionClass && (
                            <Badge tone="neutral" className="max-w-[130px] truncate">
                              {sessionClass.name}
                            </Badge>
                          )}
                        </div>
                        <Badge tone={s.status === 'draft' ? 'primary' : 'success'}>
                          {s.status === 'draft' ? 'Đang chấm' : 'Đã hoàn tất'}
                        </Badge>
                      </div>

                      <div>
                        <h4 className="font-black text-base text-text-main group-hover:text-parish-primary transition-colors m-0 line-clamp-1">
                          {s.subject}
                        </h4>
                        <p className="text-xs text-text-muted mt-1 m-0">
                          Thang điểm {s.maxScore}đ · {s.examType === 'mixed' ? 'Kết hợp TN+TL' : s.examType === 'multiple_choice' ? 'Trắc nghiệm OMR' : 'Tự luận'}
                        </p>
                      </div>

                      <div className="text-xs text-text-muted flex items-center justify-between pt-1 border-t border-surface-border/60">
                        <span>Học kỳ {s.semester === 2 ? 'II' : 'I'}</span>
                        <span>Năm học {s.academicYear}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-surface-border flex items-center justify-between">
                      <span className="text-xs font-medium text-text-muted">
                        {s.status === 'draft' ? 'Chưa khóa điểm' : 'Đã vào bảng điểm'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-parish-primary group-hover:translate-x-0.5 transition-transform">
                        {s.status === 'draft' ? 'Vào Chấm Điểm' : 'Xem Kết Quả'}
                        <ChevronRight size={14} />
                      </span>
                    </div>
                  </Surface>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* 2. WORKSPACE VIEW: KHÔNG GIAN CHẤM ĐIỂM TOÀN MÀN HÌNH (FULL-WIDTH 100%)    */
        /* ========================================================================= */
        <div className="flex flex-col gap-4">
          {/* Workspace Navigation Bar: Quay lại + Chọn phiên nhanh */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-card p-3 sm:px-4 rounded-xl border border-surface-border shadow-xs">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={<ArrowLeft size={16} />}
                onClick={() => selectSession(null as any)}
                className="font-bold text-text-secondary hover:text-text-main"
              >
                Danh sách phiên
              </Button>
              <div className="h-4 w-px bg-surface-border hidden sm:block" />
              <span className="text-xs text-text-muted hidden sm:inline">Chuyển phiên:</span>
              <div className="relative">
                <select
                  aria-label="Chọn phiên chấm hiện tại"
                  value={activeSession.id}
                  onChange={e => selectSession(e.target.value)}
                  className="form-input text-xs font-bold py-1 px-2.5 pr-7 rounded-lg min-h-8 bg-surface-app border border-surface-border cursor-pointer"
                >
                  {displayedSessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.subject} ({findClassById(s.classId)?.name || 'Lớp'} - {SCORE_TYPE_LABELS[s.scoreType]})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick info badges */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Badge tone={activeSession.status === 'draft' ? 'primary' : 'success'}>
                {activeSession.status === 'draft' ? 'Phiên đang mở' : 'Phiên đã khóa'}
              </Badge>
              <span className="text-xs font-bold text-text-muted">
                Học kỳ {activeSession.semester === 2 ? 'II' : 'I'} · {activeSession.academicYear}
              </span>
            </div>
          </div>

          {/* Active Session Card (Full Width) */}
          <Surface variant="card" className="p-4 sm:p-5 flex flex-col gap-4">
            {/* Active Session Header Banner */}
            <div className="flex flex-col gap-3 pb-3 border-b border-surface-border">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {findClassById(activeSession.classId) && (
                      <Badge tone="neutral">
                        {findClassById(activeSession.classId)?.name}
                      </Badge>
                    )}
                    <Badge tone="primary">
                      {SCORE_TYPE_LABELS[activeSession.scoreType]}
                    </Badge>
                    <Badge tone={activeSession.status === 'draft' ? 'primary' : 'success'}>
                      {activeSession.status === 'draft' ? 'Đang chấm' : 'Đã hoàn tất'}
                    </Badge>
                    {activeSession.examType && (
                      <span className="text-xs font-semibold text-text-muted">
                        ({activeSession.examType === 'mixed' ? 'Kết hợp TN+TL' : activeSession.examType === 'multiple_choice' ? 'Trắc nghiệm OMR' : 'Tự luận'})
                      </span>
                    )}
                  </div>
                  <h2 className="font-black text-xl text-text-main m-0">
                    {activeSession.subject}
                  </h2>
                  <p className="text-xs text-text-muted mt-1 m-0">
                    {DAILY_TYPES.includes(activeSession.scoreType as any)
                      ? 'Điểm vào cột hằng ngày (tính trung bình)'
                      : 'Điểm ghi thẳng vào cột Giữa Kỳ / Cuối Kỳ'}
                    {' · '}Thang điểm {activeSession.maxScore}đ · {activeSession.questionCount ? `${activeSession.questionCount} câu hỏi` : ''}
                  </p>
                </div>

                {/* Quick Progress Bar Widget */}
                <div className="flex items-center gap-3 bg-surface-app p-2.5 rounded-xl border border-surface-border self-start sm:self-auto">
                  <div className="text-right">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">Tiến độ chấm</span>
                    <span className="text-sm font-black text-parish-primary">
                      {results.length}/{classStudents.length} em ({gradingProgressPercent}%)
                    </span>
                  </div>
                  <div className="w-20 sm:w-28 h-2 bg-surface-border rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full bg-parish-primary transition-[width] duration-300 rounded-full"
                      style={{ width: `${gradingProgressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Primary Action Clusters Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
                {/* Nhóm Chấm Bài & Quét OMR */}
                <div className="flex items-center gap-2 flex-wrap">
                  {canScan && activeSession.status === 'draft' && (
                    <>
                      <Button
                        size="sm"
                        leadingIcon={<ListChecks size={15} />}
                        onClick={() => setShowGuidedGrade(true)}
                        disabled={classStudents.length === 0}
                      >
                        Chấm Ổn Định
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        leadingIcon={<ScanLine size={15} />}
                        onClick={() => { setFixedScanStudent(null); setShowScanner(true) }}
                      >
                        Quét QR + OMR
                      </Button>
                      {(activeSession.examType === 'multiple_choice' || activeSession.examType === 'mixed') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          leadingIcon={<Images size={14} />}
                          onClick={() => setShowBatchScan(true)}
                          title="Chấm nhiều ảnh cùng lúc"
                        >
                          Chấm Nhiều Ảnh
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {/* Nhóm Tiện Ích & Quản Trị */}
                <div className="flex items-center gap-2 flex-wrap">
                  {(activeSession.examType === 'multiple_choice' || activeSession.examType === 'mixed') && canManage && activeSession.status === 'draft' && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm min-h-9 text-xs"
                      onClick={() => setShowVariants(true)}
                      title="Quản lý các mã đề hoán vị"
                    >
                      <Layers3 size={13} /> Mã Đề ({activeExamVersions.length})
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm min-h-9 text-xs"
                    onClick={() => setShowAnalytics(true)}
                    disabled={results.length === 0}
                    title="Xem phân tích phổ điểm"
                  >
                    <BarChart3 size={13} /> Phân Tích
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm min-h-9 text-xs"
                    onClick={() => setShowPaperModal(true)}
                    title={effectiveMode === 'mobile' ? 'Xem trước nội dung đề thi' : 'In đề thi & phiếu trả lời OMR'}
                  >
                    {effectiveMode === 'mobile' ? <Eye size={13} /> : <Printer size={13} />}
                    {effectiveMode === 'mobile' ? 'Xem Đề Thi' : 'In Đề & Phiếu'}
                  </button>
                  {(activeSession.examType === 'multiple_choice' || activeSession.examType === 'mixed') && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm min-h-9 text-xs"
                      onClick={() => setShowAnswerKeyModal(true)}
                      title="Xem đáp án chuẩn của bài kiểm tra"
                    >
                      <ListChecks size={13} /> Đáp Án
                    </button>
                  )}

                  {canManage && activeSession.status === 'completed' && can('admin') && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm min-h-9 text-xs text-parish-warning"
                      onClick={async () => {
                        const ok = await askConfirm({
                          title: 'Mở lại phiên chấm',
                          message: 'Mở lại phiên chấm? Điểm đã ghi vào bảng điểm sẽ giữ nguyên; kết quả mới sẽ ghi đè theo ma trận xung đột.',
                          confirmText: 'Mở lại',
                          variant: 'warning',
                        })
                        if (ok) await reopenSession()
                      }}
                    >
                      <RotateCcw size={13} /> Mở Lại
                    </button>
                  )}

                  {canManage && activeSession.status === 'draft' && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm min-h-9 text-xs"
                      onClick={handleDeleteSession}
                      title="Xóa phiên chấm này"
                    >
                      <Trash2 size={13} /> Xóa
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Conflicts Alert */}
            {hasBlockedConflicts && (
              <div className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg/40 p-4">
                <div className="flex items-center gap-2 font-bold text-sm text-parish-warning mb-1">
                  <AlertTriangle size={16} /> {lastFinalize!.conflicts.length} học sinh bị chặn ghi đè điểm tay
                </div>
                <ul className="text-xs text-text-secondary list-disc ml-5 space-y-1">
                  {lastFinalize!.conflicts.map(c => (
                    <li key={c.studentId}>
                      {c.studentName}: điểm hiện tại <b>{c.existingScore ?? '—'}</b> (nguồn {c.existingSource === 'excel_import' ? 'nhập Excel' : c.existingSource === 'override' ? 'ghi đè chính thức' : 'nhập tay'}) — điểm scan <b>{c.scannedScore}</b>. Không tự ghi đè — xử lý qua Ghi Đè Điểm ở Ma Trận.
                    </li>
                  ))}
                </ul>
                {conflictsConfirmed && (
                  <div className="mt-2 flex items-center gap-2 text-xs font-bold text-parish-success">
                    <CheckCircle2 size={15} /> Phiên đã đóng. Những em bị chặn nằm ngoài finalize — không bị ảnh hưởng điểm tay.
                  </div>
                )}
              </div>
            )}

            {/* Finalize Success Alert */}
            {lastFinalize && lastFinalize.conflicts.length === 0 && conflictsConfirmed && (
              <div className="rounded-xl border border-parish-success/30 bg-parish-success-bg/40 p-4 flex items-start gap-2 text-xs text-parish-success font-medium">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <div>
                  Hoàn tất phiên chấm thành công:{' '}
                  <b>{lastFinalize.dailyCount}</b> học sinh vào điểm hằng ngày,
                  <b> {lastFinalize.directCount}</b> học sinh ghi trực tiếp (Giữa Kỳ/Cuối Kỳ).
                </div>
              </div>
            )}

            {/* Tabs: Nhập Điểm Nhanh / Bảng Kết Quả (FULL-WIDTH 100%) */}
            <div className="space-y-3">
              <Tabs
                id="active-session-tabs"
                ariaLabel="Nội dung phiên chấm"
                items={[
                  {
                    value: 'grade',
                    label: activeIsMixed
                      ? `Nhập Điểm Tự Luận (0–${activeEssayMaxPoints}đ)`
                      : 'Nhập Điểm Nhanh',
                    icon: <Save size={14} />,
                  },
                  {
                    value: 'results',
                    label: `Kết quả đã lưu (${results.length})`,
                    icon: <QrCode size={14} />,
                  },
                ]}
                value={activeWorkspaceTab}
                onValueChange={v => setActiveWorkspaceTab(v as 'grade' | 'results')}
              />

              <TabPanel tabsId="active-session-tabs" value="grade" activeValue={activeWorkspaceTab}>
                {canScan && activeSession.status === 'draft' ? (
                  <QuickScoreEntry
                    students={classStudents}
                    savedScores={activeIsMixed ? savedEssayScores : savedScores}
                    maxScore={activeIsMixed ? activeEssayMaxPoints : activeSession.maxScore}
                    onSave={(studentId, score) => handleSaveScore(studentId, score, { essay: activeIsMixed })}
                    disabled={saving}
                    essayMode={activeIsMixed}
                    totalScores={activeIsMixed ? savedScores : undefined}
                  />
                ) : (
                  <div className="p-8 text-center text-xs text-text-muted bg-surface-app rounded-xl border border-surface-border">
                    Phiên chấm này đã hoàn tất hoặc bạn không có quyền nhập điểm. Vui lòng chuyển sang tab &quot;Kết quả đã lưu&quot; để xem chi tiết điểm số của các em.
                  </div>
                )}
              </TabPanel>

              <TabPanel tabsId="active-session-tabs" value="results" activeValue={activeWorkspaceTab}>
                <ExamResultsTable
                  results={results}
                  sessionId={activeSession.id}
                  essayMode={activeIsMixed}
                  onRemove={canScan && activeSession.status === 'draft' ? handleRemoveResult : () => {}}
                />
              </TabPanel>
            </div>

            {/* Finalize Action Bar */}
            {canManage && activeSession.status === 'draft' && (
              <div className="flex flex-col gap-2 border-t border-surface-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-text-muted">
                  {results.length}/{classStudents.length} học sinh có điểm — hoàn tất sẽ đóng phiên và ghi vào bảng điểm (không thể sửa trực tiếp).
                </span>
                <Button
                  size="md"
                  onClick={handleFinalize}
                  disabled={finalizing || results.length === 0}
                  leadingIcon={finalizing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                >
                  {finalizing ? 'Đang hoàn tất…' : 'Hoàn Tất Phiên Chấm'}
                </Button>
              </div>
            )}
          </Surface>
        </div>
      )}

      {showGuidedGrade && activeSession && (
        <React.Suspense fallback={null}>
        <GuidedGradeModal
          students={classStudents}
          savedScores={activeIsMixed ? savedEssayScores : savedScores}
          maxScore={activeIsMixed ? activeEssayMaxPoints : activeSession.maxScore}
          essayMode={activeIsMixed}
          totalScores={activeIsMixed ? savedScores : undefined}
          onSave={(studentId, score) => handleSaveScore(studentId, score, { essay: activeIsMixed })}
          onScanOmr={student => {
            setFixedScanStudent(student)
            setShowGuidedGrade(false)
            setShowScanner(true)
          }}
          onClose={() => setShowGuidedGrade(false)}
        />
        </React.Suspense>
      )}

      {/* Scan modal — tự động QR+OMR hoặc OMR với học sinh đã chọn. */}
      {/* ERR-ISO-1: boundary riêng — lỗi camera/OMR chỉ hạ modal, không crash cả phiên chấm. */}
      {showScanner && activeSession && (
        <ErrorBoundary
          onReset={() => { setShowScanner(false); setFixedScanStudent(null) }}
          fallback={(
            <div className="modal-overlay app-modal-layer" role="alert">
              <div className="modal-content w-[90%] max-w-[400px] p-6 text-center">
                <p className="typography-body text-text-secondary">Quét OMR gặp lỗi. Hãy đóng và thử lại.</p>
                <button
                  type="button"
                  className="btn btn-secondary text-[13px] px-4 py-2 rounded-lg mt-4"
                  onClick={() => { setShowScanner(false); setFixedScanStudent(null) }}
                >
                  Đóng
                </button>
              </div>
            </div>
          )}
        >
        <React.Suspense fallback={null}>
        <ExamScanModal
          sessionId={activeSession.id}
          maxScore={activeSession.maxScore}
          examType={activeSession.examType}
          questionCount={activeSession.questionCount}
          answerKey={parseAnswerKeySafe(activeSession.answerKey)}
          answerVariants={activeSession.answerVariants}
          fixedStudent={fixedScanStudent ?? undefined}
          onClose={() => { setShowScanner(false); setFixedScanStudent(null) }}
        />
        </React.Suspense>
        </ErrorBoundary>
      )}



      {showBatchScan && activeSession && (
        <React.Suspense fallback={null}>
        <ExamBatchScanModal session={activeSession} students={classStudents} onClose={() => setShowBatchScan(false)} />
        </React.Suspense>
      )}

      {showAnalytics && activeSession && (
        <React.Suspense fallback={null}>
        <ExamAnalyticsPanel session={activeSession} results={results} onClose={() => setShowAnalytics(false)} />
        </React.Suspense>
      )}

      {showVariants && activeSession && (
        <React.Suspense fallback={null}>
        <ExamVariantsModal session={activeSession} onClose={() => setShowVariants(false)} />
        </React.Suspense>
      )}

      {/* Answer Key Viewer Modal for Active Session */}
      {showAnswerKeyModal && activeSession && (
        <ModalPortal>
        <div role="dialog" aria-modal="true" aria-labelledby={answerKeyTitleId} className="app-modal-layer fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeAnswerKeyModal}>
          <div ref={answerKeyTrapRef} className="bg-surface-card rounded-2xl p-5 w-full max-w-lg shadow-2xl flex flex-col gap-3 max-h-[90vh] border border-surface-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div>
                <h4 id={answerKeyTitleId} className="font-extrabold text-parish-primary flex items-center gap-2 m-0">
                  <ListChecks className="text-parish-primary" size={18} />
                  Đáp Án Chuẩn — {activeSession.subject}
                </h4>
                <p className="text-xs text-text-muted mt-0.5 m-0 font-medium">
                  {activeSession.questionCount || 20} câu hỏi trắc nghiệm{activeIsMixed ? ` · ${activeEssayMaxPoints}đ tự luận` : ''} · Thang điểm {activeSession.maxScore}
                </p>
              </div>
              <button onClick={closeAnswerKeyModal} className="btn btn-secondary btn-sm rounded-xl">
                <X size={14} /> Đóng
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto p-2 bg-surface-app rounded-xl border border-surface-border">
              {(() => {
                const parsedKey = parseAnswerKeySafe(activeSession.answerKey) || {}
                const total = activeSession.questionCount || 20

                return Array.from({ length: total }).map((_, i) => {
                  const q = i + 1
                  const ans = parsedKey[q] || '—'
                  return (
                    <div key={q} className="flex items-center justify-between p-2 bg-surface-card rounded-xl border border-surface-border shadow-2xs">
                      <span className="text-xs font-bold text-text-muted">Câu {q}:</span>
                      <span className="w-6 h-6 rounded-lg bg-parish-primary text-white font-black text-xs flex items-center justify-center shadow-xs">
                        {ans}
                      </span>
                    </div>
                  )
                })
              })()}
            </div>

            {/* Re-score button for draft MC sessions */}
            {activeSession.status === 'draft' && (activeSession.examType === 'multiple_choice' || activeSession.examType === 'mixed') && (
              <div className="flex items-center gap-2 pt-2 border-t border-surface-border">
                <button
                  onClick={async () => {
                    if (!activeSession.answerKey) return
                    const ok = await askConfirm({
                      title: 'Chấm lại điểm?',
                      message: `Cập nhật answer key và chấm lại điểm cho ${results.length} kết quả OMR hiện có. Kết quả nhập tay sẽ không bị thay đổi.`,
                      confirmText: 'Chấm lại',
                      variant: 'warning',
                    })
                    if (!ok) return
                    setRescoreLoading(true)
                    setRescoreResult(null)
                    try {
                      const answerKeyStr = typeof activeSession.answerKey === 'string'
                        ? activeSession.answerKey
                        : JSON.stringify(activeSession.answerKey)
                      const res = await api.updateAnswerKey(activeSession.id, answerKeyStr, activeSession.questionCount || 20)
                      setRescoreResult({ rescored: res.rescored, skipped: res.skipped })
                      await refreshResults()
                    } catch (err: any) {
                      useToastStore.getState().addToast(err?.message || 'Lỗi khi chấm lại', 'error')
                    } finally {
                      setRescoreLoading(false)
                    }
                  }}
                  disabled={rescoreLoading}
                  className="btn btn-secondary btn-sm rounded-xl gap-1.5 font-bold disabled:opacity-50"
                >
                  {rescoreLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Chấm Lại Điểm
                </button>
                {rescoreResult && (
                  <span className="text-xs font-bold text-parish-success">
                    Đã chấm lại {rescoreResult.rescored} kết quả · giữ nguyên {rescoreResult.skipped} kết quả nhập tay
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Create modal */}
      {showCreate && (
        <ModalPortal>
        <div role="dialog" aria-modal="true" aria-labelledby={createTitleId} className="app-modal-layer fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={closeCreateModal}>
          <div ref={createTrapRef} className="bg-surface-card rounded-t-3xl sm:rounded-2xl w-full max-w-2xl lg:max-w-5xl shadow-2xl max-h-[96dvh] sm:max-h-[92vh] lg:max-h-[88vh] overflow-hidden flex flex-col border border-surface-border" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-surface-card shrink-0 border-b border-surface-border px-4 pt-2 sm:px-6 sm:pt-4 pb-3">
              <div className="flex justify-center py-1 sm:hidden" aria-hidden="true">
                <span className="h-1 w-10 rounded-full bg-surface-border" />
              </div>
              <div className="flex items-start justify-between gap-3 pt-1">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-parish-primary/10 text-parish-primary flex items-center justify-center shrink-0">
                    <Layers3 size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 id={createTitleId} className="font-extrabold text-parish-primary text-base sm:text-lg m-0">Tạo Phiên Chấm</h4>
                      <span className="badge badge-primary font-bold">Mới</span>
                    </div>
                    <p className="text-xs text-text-muted m-0 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>Năm học <strong>{normalizeActiveAY(activeAY)}</strong></span>
                      <span>·</span>
                      <span>Học kỳ <strong>{selectedSemester}</strong></span>
                    </p>
                  </div>
                </div>
                <button type="button" onClick={closeCreateModal} className="mobile-touch-target shrink-0 rounded-xl text-text-muted hover:bg-surface-hover hover:text-text-main flex items-center justify-center" aria-label="Đóng tạo phiên chấm">
                  <X size={20} />
                </button>
              </div>

              {/* Dynamic Progress Indicator */}
              {(() => {
                const hasClass = !!(createForm.classId || effectiveClassId)
                const hasSubject = !!createForm.subject.trim()
                const hasImport = createForm.examType === 'written' || !!mcPart || !!essayPart
                const hasAnswers = !requiresAnswerKey || completedAnswerCount === createForm.questionCount
                const filled = [hasClass, hasSubject, hasImport, hasAnswers].filter(Boolean).length
                const isComplete = filled === 4
                return (
                  <div className="mt-3 pt-2.5 border-t border-surface-border/60 flex items-center justify-between gap-3" aria-live="polite">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-text-secondary whitespace-nowrap">Tiến độ:</span>
                      <span className="text-xs text-text-muted truncate">
                        {!hasClass
                          ? 'Chưa chọn lớp học áp dụng'
                          : !hasSubject
                          ? 'Chưa nhập tên bài kiểm tra'
                          : requiresAnswerKey && completedAnswerCount < createForm.questionCount
                          ? `Đang thiếu ${createForm.questionCount - completedAnswerCount} câu đáp án`
                          : 'Sẵn sàng khởi tạo phiên chấm'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-24 sm:w-32 h-2 rounded-full bg-surface-hover overflow-hidden">
                        <div
                          className={`h-full transition-[width] duration-300 ${isComplete ? 'bg-emerald-500' : 'bg-parish-primary'}`}
                          style={{ width: `${(filled / 4) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-text-muted">{filled}/4</span>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="min-h-0 overflow-y-auto px-4 py-3.5 sm:px-6 sm:py-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-4">
              {/* CỘT TRÁI: THIẾT LẬP THÔNG TIN BÀI THI & ĐIỂM */}
              <div className={`${createForm.examType === 'written' ? 'lg:col-span-12' : 'lg:col-span-5'} flex flex-col gap-3.5 mb-3 lg:mb-0`}>
                {/* Lớp học */}
                <div className="p-3.5 rounded-2xl bg-surface-hover/40 border border-surface-border/70 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-text-secondary flex items-center gap-1.5 m-0">
                      <span className="w-5 h-5 rounded-md bg-parish-primary/10 text-parish-primary flex items-center justify-center">
                        <School size={12} />
                      </span>
                      Lớp học áp dụng <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {effectiveClassId && createForm.classId === effectiveClassId && (
                        <span className="text-xs text-text-muted bg-surface-card px-2 py-0.5 rounded-full border border-surface-border">
                          Mặc định theo bộ lọc
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => fetchClasses()}
                        disabled={classLoading}
                        title="Tải lại danh sách lớp học"
                        className="text-xs text-parish-primary hover:underline font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw size={11} className={classLoading ? 'animate-spin' : ''} />
                        {classLoading ? 'Đang tải...' : 'Làm mới'}
                      </button>
                    </div>
                  </div>
                  <select
                    aria-label="Lớp học cho phiên chấm"
                    value={createForm.classId || ''}
                    onChange={e => {
                      setCreateForm(f => ({ ...f, classId: e.target.value }))
                      setCreateError('')
                    }}
                    disabled={classLoading}
                    className="w-full px-3 py-2.5 rounded-xl border border-surface-border bg-surface-card text-text-main text-xs font-semibold focus:border-parish-primary focus:outline-none min-h-[44px]"
                  >
                    {classLoading ? (
                      <option value="">Đang tải danh sách lớp học...</option>
                    ) : assignedClasses.length === 0 ? (
                      <option value="">
                        {isAdmin ? '-- Chưa có lớp học nào trong hệ thống --' : '-- Bạn chưa được phân công phụ trách lớp nào --'}
                      </option>
                    ) : (
                      <>
                        <option value="">-- Chọn lớp học áp dụng ({assignedClasses.length} lớp) --</option>
                        {assignedClasses.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>

                  {!classLoading && assignedClasses.length === 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2 mt-1">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <div>
                        {isAdmin ? (
                          <p className="m-0">
                            Chưa tìm thấy lớp học nào trong hệ thống. Vui lòng bấm <strong>&quot;Làm mới&quot;</strong> hoặc tạo lớp mới tại mục <strong>Thiếu Nhi → Quản lý Lớp</strong>.
                          </p>
                        ) : (
                          <p className="m-0">
                            Tài khoản của bạn chưa được phân công phụ trách lớp nào. Vui lòng liên hệ Ban Quản Trị để được phân công lớp trước khi tạo phiên chấm.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Hình thức Bài Kiểm Tra */}
                <div className="p-3.5 rounded-2xl bg-surface-hover/40 border border-surface-border/70 flex flex-col gap-2.5">
                  <label className="text-xs font-bold text-text-secondary flex items-center gap-1.5 m-0">
                    <span className="w-5 h-5 rounded-md bg-parish-primary/10 text-parish-primary flex items-center justify-center">
                      <Layers3 size={12} />
                    </span>
                    Hình thức Bài Kiểm Tra
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" aria-label="Hình thức bài kiểm tra">
                    <button
                      type="button"
                      onClick={() => handleExamTypeChange('written')}
                      aria-pressed={createForm.examType === 'written'}
                      className={`min-h-[54px] rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-colors ${
                        createForm.examType === 'written'
                          ? 'border-parish-primary bg-parish-primary text-white shadow-sm'
                          : 'border-surface-border bg-surface-card text-text-secondary hover:bg-surface-hover hover:border-parish-primary/30'
                      }`}
                    >
                      <span className="block text-xs font-black">Tự luận</span>
                      <span className="block mt-0.5 text-xs font-normal opacity-85">Nhập điểm trực tiếp 0–10</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExamTypeChange('multiple_choice')}
                      aria-pressed={createForm.examType === 'multiple_choice'}
                      className={`min-h-[54px] rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-colors ${
                        createForm.examType === 'multiple_choice'
                          ? 'border-parish-primary bg-parish-primary text-white shadow-sm'
                          : 'border-surface-border bg-surface-card text-text-secondary hover:bg-surface-hover hover:border-parish-primary/30'
                      }`}
                    >
                      <span className="block text-xs font-black">Trắc nghiệm</span>
                      <span className="block mt-0.5 text-xs font-normal opacity-85">A/B/C/D · quét OMR</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExamTypeChange('mixed')}
                      title="Kết hợp phần trắc nghiệm (quét OMR tự chấm) và phần tự luận (nhập tay)"
                      aria-pressed={createForm.examType === 'mixed'}
                      className={`min-h-[54px] rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-colors ${
                        createForm.examType === 'mixed'
                          ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                          : 'border-surface-border bg-surface-card text-text-secondary hover:bg-surface-hover hover:border-violet-500/30'
                      }`}
                    >
                      <span className="block text-xs font-black">Kết hợp TN + TL</span>
                      <span className="block mt-0.5 text-xs font-normal opacity-85">Quét TN, nhập điểm TL</span>
                    </button>
                  </div>
                </div>

                {/* Loại Điểm, Môn học & Thang điểm */}
                <div className="p-3.5 rounded-2xl bg-surface-hover/40 border border-surface-border/70 flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-bold text-text-secondary mb-2 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-md bg-amber-500/10 text-amber-600 flex items-center justify-center">
                        <BarChart3 size={12} />
                      </span>
                      Loại Điểm
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0 sm:px-0 sm:mx-0 mobile-scroll-row">
                      {SCORE_TYPES.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setCreateForm(f => ({ ...f, scoreType: t.id }))}
                          aria-pressed={createForm.scoreType === t.id}
                          className={`shrink-0 sm:shrink min-w-[110px] sm:min-w-0 min-h-[46px] rounded-xl border px-2.5 py-2 text-xs font-bold transition-colors text-left sm:text-center ${
                            createForm.scoreType === t.id
                              ? 'border-parish-primary bg-parish-primary text-white shadow-sm'
                              : 'border-surface-border bg-surface-card text-text-secondary hover:bg-surface-hover hover:border-parish-primary/20'
                          }`}
                        >
                          <span className="block font-black text-xs">{t.label}</span>
                          <span className="block text-xs font-normal opacity-85">
                            {t.daily ? 'vào điểm hằng ngày' : 'ghi trực tiếp'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                    <div>
                      <label className="block text-xs font-bold text-text-secondary mb-1.5">
                        Môn / Nội dung kiểm tra <span className="text-red-500">*</span>
                      </label>
                      <input
                        aria-label="Môn hoặc nội dung kiểm tra"
                        value={createForm.subject}
                        onChange={e => setCreateForm(f => ({ ...f, subject: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                        placeholder="VD: Kiểm tra chương 3"
                        enterKeyHint="next"
                        className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-surface-border bg-surface-card focus:border-parish-primary focus:outline-none text-sm font-semibold"
                      />
                    </div>
                    <div className="sm:w-[140px]">
                      <label className="block text-xs font-bold text-text-secondary mb-1.5">Thang điểm</label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setCreateForm(f => ({ ...f, maxScore: Math.max(1, f.maxScore - 1) }))}
                          className="w-10 h-11 rounded-xl border border-surface-border bg-surface-card text-text-secondary hover:bg-surface-hover flex items-center justify-center shrink-0 font-bold"
                          aria-label="Giảm thang điểm"
                        >
                          −
                        </button>
                        <input
                          aria-label="Thang điểm phiên chấm"
                          type="number"
                          inputMode="decimal"
                          pattern="[0-9]*"
                          min={1}
                          max={10}
                          value={createForm.maxScore}
                          onChange={e => setCreateForm(f => ({ ...f, maxScore: Math.min(10, Math.max(1, Number(e.target.value) || 10)) }))}
                          className="flex-1 min-h-[44px] px-2 py-2 rounded-xl border border-surface-border bg-surface-card focus:border-parish-primary focus:outline-none text-center font-bold text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setCreateForm(f => ({ ...f, maxScore: Math.min(10, f.maxScore + 1) }))}
                          className="w-10 h-11 rounded-xl border border-surface-border bg-surface-card text-text-secondary hover:bg-surface-hover flex items-center justify-center shrink-0 font-bold"
                          aria-label="Tăng thang điểm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Thông báo chế độ tự luận */}
                {createForm.examType === 'written' && (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-200 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 size={16} />
                    </div>
                    <div className="text-xs">
                      <p className="font-black m-0 mb-1">Hình thức Tự Luận — Sẵn sàng tạo phiên</p>
                      <p className="text-text-muted m-0">
                        Phiên tự luận không yêu cầu ma trận đáp án. Sau khi bấm &quot;Tạo Phiên&quot;, bạn có thể nhập điểm trực tiếp từ 0–{createForm.maxScore} cho từng học sinh trên danh sách hoặc qua ô nhập nhanh.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* CỘT PHẢI: VÙNG LÀM VIỆC IMPORT & MA TRẬN ĐÁP ÁN (Dành cho Trắc nghiệm & Kết hợp) */}
              {createForm.examType !== 'written' && (
                <div className="lg:col-span-7 flex flex-col gap-3.5">
                  {/* Smart Import Hub */}
                  <div className="p-3.5 rounded-2xl bg-surface-hover/40 border border-surface-border/70 flex flex-col gap-2.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={14} className="text-amber-500" />
                      <span className="text-xs font-bold text-text-main">
                        {createForm.examType === 'mixed' ? 'Import Đề Thi (2 phần) — Tự Động Phân Tích:' : 'Import Đề Trắc Nghiệm — Tự Động Phân Tích:'}
                      </span>
                    </div>
                    <div className={`grid grid-cols-1 ${createForm.examType === 'mixed' ? 'sm:grid-cols-2' : ''} gap-2`}>
                      {/* Ô PHẦN TRẮC NGHIỆM */}
                      <div className={`p-3 rounded-xl border ${mcPart ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-surface-card border-surface-border'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-black text-text-main uppercase tracking-wide flex items-center gap-1">
                            <ListChecks size={12} className={mcPart ? 'text-emerald-600 dark:text-emerald-400' : 'text-text-muted'} /> Phần Trắc Nghiệm
                          </span>
                          {mcPart && (
                            <button type="button" onClick={removeMcPart} className="text-[10px] underline text-text-muted hover:text-rose-600 font-semibold">
                              Gỡ
                            </button>
                          )}
                        </div>
                        {mcPart ? (
                          <>
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold m-0 mb-0.5 flex items-center gap-1">
                              <CheckCircle2 size={12} /> {mcPart.questions.length} câu · {mcPart.totalPoints}đ — đáp án đã tự điền
                            </p>
                            <button
                              type="button"
                              onClick={() => { setImportScope('multiple_choice'); setShowImportModal(true) }}
                              className="text-[11px] underline text-text-muted hover:text-parish-primary font-semibold"
                            >
                              Đổi đề trắc nghiệm
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="text-[11px] text-text-muted m-0 mb-1.5">Câu hỏi A/B/C/D + đáp án (dán Word/Text hoặc Excel)</p>
                            <button
                              type="button"
                              onClick={() => { setImportScope('multiple_choice'); setShowImportModal(true) }}
                              className="btn btn-primary btn-sm text-[11px] font-bold"
                            >
                              <Upload size={12} /> Import Trắc Nghiệm
                            </button>
                          </>
                        )}
                      </div>

                      {/* Ô PHẦN TỰ LUẬN */}
                      {createForm.examType === 'mixed' && (
                        <div className={`p-3 rounded-xl border ${essayPart ? 'bg-violet-500/10 border-violet-500/30' : 'bg-surface-card border-surface-border'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-black text-text-main uppercase tracking-wide flex items-center gap-1">
                              <FileText size={12} className={essayPart ? 'text-violet-600 dark:text-violet-300' : 'text-text-muted'} /> Phần Tự Luận
                            </span>
                            {essayPart && (
                              <button type="button" onClick={removeEssayPart} className="text-[10px] underline text-text-muted hover:text-rose-600 font-semibold">
                                Gỡ
                              </button>
                            )}
                          </div>
                          {essayPart ? (
                            <>
                              <p className="text-[11px] text-violet-700 dark:text-violet-300 font-bold m-0 mb-0.5 flex items-center gap-1">
                                <CheckCircle2 size={12} /> {essayPart.questions.length} câu · {essayPart.totalPoints}đ — chấm bằng nhập tay
                              </p>
                              <button
                                type="button"
                                onClick={() => { setImportScope('essay'); setShowImportModal(true) }}
                                className="text-[11px] underline text-text-muted hover:text-parish-primary font-semibold"
                              >
                                Đổi đề tự luận
                              </button>
                            </>
                          ) : (
                            <>
                              <p className="text-[11px] text-text-muted m-0 mb-1.5">Câu hỏi + điểm từng câu (chấm nhập tay)</p>
                              <button
                                type="button"
                                onClick={() => { setImportScope('essay'); setShowImportModal(true) }}
                                className="btn btn-secondary btn-sm text-[11px] font-bold"
                              >
                                <Upload size={12} /> Import Tự Luận
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {createForm.examType === 'mixed' && (!mcPart || !essayPart) && (
                      <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl text-[11px] text-amber-700 dark:text-amber-300">
                        Đề Kết hợp cần CẢ HAI phần: {!mcPart && <><strong>Phần Trắc Nghiệm</strong> (bấm Import ở ô bên trái) </>}
                        {!mcPart && !essayPart && 'và '}
                        {!essayPart && <><strong>Phần Tự Luận</strong> (bấm Import ở ô bên phải)</>}
                        {' '}— mỗi phần nạp riêng rồi ghép tự động khi tạo phiên.
                      </div>
                    )}
                  </div>

                  {/* Answer Key Workspace */}
                  <div className="p-3.5 rounded-2xl bg-surface-hover/40 border border-surface-border/70 flex flex-col gap-3 lg:rounded-xl lg:border lg:border-surface-border lg:bg-surface-card lg:p-3">
                    {/* Header Workspace */}
                    <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-surface-border/60">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-main flex items-center gap-1.5">
                          <ListChecks size={14} className="text-parish-primary" />
                          Đáp Án Chuẩn ({completedAnswerCount}/{createForm.questionCount})
                        </span>
                        {Boolean(createForm.questions && createForm.questions.length > 0) && (
                          <span className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <CheckCircle2 size={11} /> {createForm.questions?.length} câu hỏi
                          </span>
                        )}
                      </div>

                      {Boolean(createForm.questions && createForm.questions.length > 0) && (
                        <div className="flex items-center p-0.5 bg-surface-app rounded-lg border border-surface-border text-xs">
                          <button
                            type="button"
                            onClick={() => setReviewViewMode('matrix')}
                            className={`px-2.5 py-1 rounded-md font-bold transition-colors flex items-center gap-1 ${
                              reviewViewMode === 'matrix'
                                ? 'bg-surface-card text-parish-primary shadow-xs'
                                : 'text-text-muted hover:text-text-main'
                            }`}
                          >
                            <Grid3X3 size={12} /> Ma trận nhanh
                          </button>
                          <button
                            type="button"
                            onClick={() => setReviewViewMode('details')}
                            className={`px-2.5 py-1 rounded-md font-bold transition-colors flex items-center gap-1 ${
                              reviewViewMode === 'details'
                                ? 'bg-surface-card text-parish-primary shadow-xs'
                                : 'text-text-muted hover:text-text-main'
                            }`}
                          >
                            <BookOpen size={12} /> Chi tiết câu hỏi
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Mode 1: Detailed Question List View */}
                    {reviewViewMode === 'details' && Boolean(createForm.questions && createForm.questions.length > 0) ? (
                      <div className="flex flex-col gap-2.5 max-h-[46dvh] sm:max-h-60 overflow-y-auto p-2 bg-surface-app rounded-xl border border-surface-border">
                        {createForm.questions?.map((questionItem, idx) => {
                          const qNum = questionItem.index || (idx + 1)
                          const isEssay = questionItem.type === 'essay'
                          const currentAnswer = createForm.answerKey[qNum]

                          return (
                            <div
                              key={qNum}
                              className="p-3 rounded-xl bg-surface-card border border-surface-border flex flex-col gap-2 transition-colors hover:border-parish-primary/30"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                                    isEssay ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' : 'bg-parish-primary/10 text-parish-primary'
                                  }`}>
                                    {isEssay ? `Câu ${qNum} (Tự luận)` : `Câu ${qNum} (Trắc nghiệm)`}
                                  </span>
                                  {questionItem.points !== undefined && (
                                    <span className="text-[11px] text-text-muted font-bold">
                                      {questionItem.points} điểm
                                    </span>
                                  )}
                                </div>
                                {!isEssay && (
                                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-md ${
                                    currentAnswer
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  }`}>
                                    {currentAnswer ? `Đáp án đúng: ${currentAnswer}` : 'Chưa có đáp án'}
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-text-main font-semibold m-0 leading-relaxed">
                                {questionItem.question}
                              </p>

                              {!isEssay && questionItem.options && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
                                  {(['A', 'B', 'C', 'D'] as const).map(opt => {
                                    const optText = questionItem.options?.[opt]
                                    if (!optText && optText !== '') return null
                                    const isSelected = currentAnswer === opt
                                    return (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() => {
                                          setCreateForm(f => ({ ...f, answerKey: { ...f.answerKey, [qNum]: opt } }))
                                          setCreateError('')
                                        }}
                                        className={`p-2 rounded-lg border text-left text-xs transition-colors flex items-start gap-2 ${
                                          isSelected
                                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 font-bold shadow-xs'
                                            : 'border-surface-border bg-surface-app text-text-secondary hover:bg-surface-hover hover:border-parish-primary/30'
                                        }`}
                                      >
                                        <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 font-black text-xs ${
                                          isSelected ? 'bg-emerald-600 text-white' : 'bg-surface-card text-text-muted border border-surface-border'
                                        }`}>
                                          {opt}
                                        </span>
                                        <span className="flex-1 leading-snug">{optText || `Phương án ${opt}`}</span>
                                        {isSelected && <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      /* Mode 2: Quick Key Matrix Mode */
                      <>
                        {/* Controls row */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-text-secondary whitespace-nowrap">
                              {createForm.examType === 'mixed' ? 'Số câu trắc nghiệm:' : 'Số câu hỏi:'}
                            </label>
                            <input
                              aria-label="Số câu hỏi trắc nghiệm"
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={50}
                              value={createForm.questionCount}
                              onChange={e => {
                                const n = Math.min(50, Math.max(1, Number(e.target.value) || 20))
                                setCreateForm(f => {
                                  const answerKey = { ...f.answerKey }
                                  for (let q = n + 1; q <= f.questionCount; q++) delete answerKey[q]
                                  return { ...f, questionCount: n, answerKey }
                                })
                                setCreateError('')
                              }}
                              className="w-16 min-h-[36px] px-2 py-1 rounded-lg border border-surface-border bg-surface-card text-center font-bold text-xs focus:border-parish-primary focus:outline-none"
                            />
                            <span className="text-xs text-text-muted">(1–50, khớp mẫu phiếu)</span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-text-secondary mr-0.5 hidden sm:inline">Đáp án nhanh:</span>
                            {(['A', 'B', 'C', 'D'] as const).map(opt => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => {
                                  setCreateForm(f => {
                                    const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
                                    for (let q = 1; q <= f.questionCount; q++) answerKey[q] = opt
                                    return { ...f, answerKey }
                                  })
                                  setCreateError('')
                                }}
                                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-black transition-colors ${
                                  Object.values(createForm.answerKey).every(v => v === opt) && Object.keys(createForm.answerKey).length === createForm.questionCount
                                    ? 'bg-parish-primary text-white shadow-sm'
                                    : 'bg-surface-card border border-surface-border text-text-secondary hover:bg-parish-primary-light hover:text-parish-primary'
                                }`}
                              >
                                Toàn {opt}
                              </button>
                            ))}
                            {completedAnswerCount > 0 && (
                              <button
                                type="button"
                                onClick={handleClearAnswerKey}
                                title="Xóa toàn bộ đáp án đã chọn"
                                className="min-h-[34px] px-2 py-1 rounded-lg text-xs font-semibold text-text-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1"
                              >
                                <RotateCcw size={12} /> Xóa hết
                              </button>
                            )}
                          </div>
                        </div>

                        {/* ⚡ Quick Answer String Input Bar */}
                        <div className="flex items-center gap-1.5 bg-surface-card p-1.5 rounded-xl border border-surface-border">
                          <input
                            type="text"
                            value={quickKeyInput}
                            onChange={e => setQuickKeyInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleApplyQuickKey() } }}
                            placeholder="Dán chuỗi đáp án (VD: ABCD... hoặc 1A 2B 3C...)"
                            className="flex-1 px-2.5 py-1 text-xs bg-transparent border-none text-text-main placeholder:text-text-muted focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleApplyQuickKey}
                            disabled={!quickKeyInput.trim()}
                            className="btn btn-primary btn-sm min-h-[32px] px-3 text-xs font-bold gap-1 disabled:opacity-40"
                          >
                            <Zap size={12} /> Áp dụng
                          </button>
                        </div>

                        {/* Real-time missing questions alert */}
                        {missingQuestions.length > 0 ? (
                          <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                            <AlertCircle size={14} className="shrink-0 text-amber-600" />
                            <span className="truncate">
                              Còn thiếu {missingQuestions.length} câu: Câu {missingQuestions.slice(0, 8).join(', ')}{missingQuestions.length > 8 ? '…' : ''}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                            <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                            <span>Đã điền đầy đủ {createForm.questionCount}/{createForm.questionCount} đáp án chuẩn</span>
                          </div>
                        )}

                        {/* Answer Key Matrix Grid (5 Columns on Desktop for spacious touch targets) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-[46dvh] sm:max-h-60 overflow-y-auto p-2 bg-surface-app rounded-xl border border-surface-border">
                          {Array.from({ length: createForm.questionCount }).map((_, i) => {
                            const q = i + 1
                            const current = createForm.answerKey[q]
                            const isMissing = !current
                            return (
                              <div
                                key={q}
                                className={`p-2 rounded-xl bg-surface-card border transition-colors flex flex-col gap-1.5 ${
                                  isMissing
                                    ? 'border-amber-500/40 bg-amber-500/[0.02]'
                                    : 'border-surface-border/80 hover:border-parish-primary/40'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`text-xs font-bold ${isMissing ? 'text-amber-600 dark:text-amber-400 font-extrabold' : 'text-text-main'}`}>
                                    Câu {q}
                                  </span>
                                  {current ? (
                                    <span className="w-5 h-5 rounded-md bg-parish-primary/10 text-parish-primary font-black text-xs flex items-center justify-center">
                                      {current}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                      Chưa chọn
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-4 gap-1" role="group" aria-label={`Đáp án cho câu ${q}`}>
                                  {(['A', 'B', 'C', 'D'] as const).map(opt => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => {
                                        setCreateForm(f => ({ ...f, answerKey: { ...f.answerKey, [q]: opt } }))
                                        setCreateError('')
                                      }}
                                      aria-label={`Câu ${q}, đáp án ${opt}`}
                                      aria-pressed={current === opt}
                                      className={`w-11 h-11 sm:w-auto sm:h-7.5 rounded-lg text-xs font-black transition-colors flex items-center justify-center ${
                                        current === opt
                                          ? 'bg-parish-primary text-white shadow-sm ring-2 ring-parish-primary/20 scale-[1.02]'
                                          : 'bg-surface-app border border-surface-border text-text-secondary hover:bg-parish-primary/10 hover:border-parish-primary/30 hover:text-parish-primary'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Thông báo lỗi nếu có */}
              {createError && (
                <div role="alert" className="mt-3 rounded-xl bg-parish-warning-bg/40 border border-parish-warning/30 px-3 py-2 text-xs font-semibold text-parish-warning lg:col-span-12">
                  {createError}
                </div>
              )}

              {/* Sticky Footer Actions */}
              <div className="sticky bottom-0 -mx-4 sm:-mx-5 mt-4 border-t border-surface-border bg-surface-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 lg:col-span-12 lg:mx-0 lg:rounded-b-2xl">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {requiresAnswerKey ? (
                    <p className={`m-0 text-xs font-semibold ${completedAnswerCount === createForm.questionCount ? 'text-emerald-600 dark:text-emerald-300' : 'text-text-muted'}`} aria-live="polite">
                      Đáp án: {completedAnswerCount}/{createForm.questionCount} câu
                    </p>
                  ) : (
                    <p className="m-0 text-xs text-text-muted">Sẵn sàng nhập điểm trực tiếp sau khi tạo phiên.</p>
                  )}
                  <div className="flex gap-2 sm:justify-end">
                    <button className="btn btn-secondary flex-1 min-h-[44px] sm:flex-none" onClick={closeCreateModal}>Hủy</button>
                    <button className="btn btn-primary flex-1 min-h-[44px] sm:flex-none" onClick={handleCreate} disabled={!createForm.subject.trim()}>
                      <Plus size={16} /> Tạo Phiên
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Smart Exam Import Modal — scope theo ô import đang mở (TN / TL) */}
      {showImportModal && (
        <React.Suspense fallback={null}>
        <ExamImportModal
          isOpen={showImportModal}
          scope={importScope}
          onClose={() => setShowImportModal(false)}
          onImport={(data) => {
            if (importScope === 'essay') handleEssayImport(data)
            else handleMcImport(data)
          }}
        />
        </React.Suspense>
      )}

      {/* Printable & Exportable Exam Paper Modal */}
      {showPaperModal && activeSession && (
        <React.Suspense fallback={null}>
        <ExamPaperModal
          isOpen={showPaperModal}
          onClose={() => setShowPaperModal(false)}
          subject={activeSession.subject}
          classLabel={activeSessionClassId ? findClassById(activeSessionClassId)?.name ?? 'Lớp' : 'Lớp'}
          academicYear={activeSession.academicYear}
          questions={activeSessionQuestions}
          students={classStudents}
          sessionId={activeSession.id}
          answerKey={activeSession.answerKey}
          answerVariants={activeSession.answerVariants}
          variantManifests={activeSession.variantManifests}
          examType={activeSession.examType}
          maxScore={activeSession.maxScore}
          questionCount={activeSession.questionCount}
          scoreTypeLabel={SCORE_TYPE_LABELS[activeSession.scoreType]}
        />
        </React.Suspense>
      )}

      {confirmDialog}
    </div>
  )
}

export default ExamSessionView
