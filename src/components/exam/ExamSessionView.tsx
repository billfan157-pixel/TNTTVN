import React, { useMemo, useState, useEffect } from 'react'
import { useStudentStore } from '../../stores/studentStore'
import { normalizeExamSessionClassFilter } from '../../lib/examSessionScope'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useAuth } from '../../hooks/useAuth'
import { useExamStore, SCORE_TYPE_LABELS, DAILY_TYPES } from '../../stores/examStore'
import { api } from '../../lib/api'
import { generateExamQrCodes } from '../../lib/qr'
import { printQrSheet } from '../../utils/examSheets'
import { QuickScoreEntry } from './QuickScoreEntry'
import { ExamResultsTable } from './ExamResultsTable'
import { AnswerSheetModal } from './AnswerSheetModal'
import { ExamScanModal } from './ExamScanModal'
import { GuidedGradeModal, type GuidedGradeStudent } from './GuidedGradeModal'
import { ExamImportModal } from './ExamImportModal'
import { useToastStore } from '../../stores/toastStore'
import { ExamPaperModal } from './ExamPaperModal'
import {
  ClipboardList, Plus, Printer, CheckCircle2, AlertTriangle,
  RotateCcw, Loader2, Save, QrCode, ScanLine, Trash2,
  ListChecks, X, Sparkles, FileText, RefreshCw,
} from 'lucide-react'
import type { ExamScoreType, ExamQuestion } from '../../types'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'

const SCORE_TYPES: { id: ExamScoreType; label: string; daily: boolean }[] = [
  { id: 'oral', label: 'Điểm Miệng', daily: true },
  { id: '15m', label: '15 Phút', daily: true },
  { id: '1period', label: '1 Tiết', daily: true },
  { id: 'midterm', label: 'Giữa Kỳ', daily: false },
  { id: 'final', label: 'Cuối Kỳ', daily: false },
]

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Đang chấm', cls: 'badge-primary' },
  completed: { label: 'Đã hoàn tất', cls: 'badge-neutral' },
}

/** Hiển thị năm học an toàn — tránh năm rỗng trong UI. */
function normalizeActiveAY(ay: string): string {
  return ay?.trim() || new Date().getFullYear().toString()
}

const VALID_MC_OPTIONS = new Set(['A', 'B', 'C', 'D'])

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
  const { can } = useAuth()
  // A-NEW (2026-08-12): phuta (trợ tá) cũng tạo + xóa phiên chấm cho lớp mình phụ trách.
  const canManage = can('admin', 'chunhiem', 'phuta')
  const canScan = can('admin', 'chunhiem', 'phuta')
  // A-NEW (2026-08-13): chunhiem/phuta mặc định chỉ được chọn lớp mình được phân công —
  // bộ lọc toàn cục ẩn với non-admin (RootLayout force 'all'), nên dùng danh sách lớp
  // đã được server scope theo phân công (GET /classes) làm nguồn chọn lớp nội bộ.
  const isAdmin = can('admin')
  const assignedClasses = useClassStore(s => s.classes)

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
  const [showPrintSheets, setShowPrintSheets] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showGuidedGrade, setShowGuidedGrade] = useState(false)
  const [fixedScanStudent, setFixedScanStudent] = useState<GuidedGradeStudent | null>(null)
  const [showAnswerKeyModal, setShowAnswerKeyModal] = useState(false)
  const [rescoreLoading, setRescoreLoading] = useState(false)
  const [rescoreResult, setRescoreResult] = useState<{ rescored: number; skipped: number } | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showPaperModal, setShowPaperModal] = useState(false)
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()
  const activeAY = useAcademicYearStore(s => s.currentYear)
  const [createForm, setCreateForm] = useState<{
    classId?: string
    subject: string
    scoreType: ExamScoreType
    maxScore: number
    examType: 'written' | 'multiple_choice'
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

  useEffect(() => {
    if (!showAnswerKeyModal && !showCreate) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showAnswerKeyModal) setShowAnswerKeyModal(false)
      if (showCreate) setShowCreate(false)
    }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [showAnswerKeyModal, showCreate])

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
  const selectedSessionId = useExamStore(s => s.selectedSessionId)
  const activeSessionClassId = activeSession?.classId || effectiveClassId

  const displayedSessions = useMemo(() => {
    return sessions.filter(s => {
      if (selectedSemester && s.semester !== selectedSemester) return false
      if (effectiveClassId && s.classId !== effectiveClassId) return false
      return true
    })
  }, [sessions, selectedSemester, effectiveClassId])

  const classStudents = useMemo(
    () => activeSessionClassId
      ? students
          .filter(s => s.classId === activeSessionClassId && s.status === 'Đang học')
          .sort((a, b) => a.code.localeCompare(b.code))
          .map(s => ({ id: s.id, name: `${s.fullName}`, code: s.code }))
      : [],
    [activeSessionClassId, students]
  )

  const savedScores = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of results) map[r.studentId] = r.score
    return map
  }, [results])

  const activeSessionQuestions = useMemo(
    () => (activeSession ? parseQuestionsSafe(activeSession.questions) : []),
    [activeSession]
  )

  const handleOpenCreate = () => {
    setCreateForm(f => ({
      ...f,
      classId: effectiveClassId || assignedClasses[0]?.id || '',
    }))
    setCreateError('')
    setShowCreate(true)
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
    // Trắc nghiệm bắt buộc có đủ đáp án cho từng câu — nếu không, OMR detector
    // không chấm được (câu thiếu key → isCorrect undefined → điểm lệch).
    if (createForm.examType === 'multiple_choice') {
      const missingCount = createForm.questionCount - Object.keys(createForm.answerKey).length
      if (missingCount > 0) {
        setCreateError(`Còn ${missingCount} câu chưa có đáp án — điền đủ đáp án A/B/C/D trước khi tạo phiên.`)
        return
      }
      const bad = Object.keys(createForm.answerKey).find(q => Number(q) > createForm.questionCount)
      if (bad) setCreateError(`Đáp án câu ${bad} vượt quá ${createForm.questionCount} câu.`)
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
      questionCount: createForm.examType === 'multiple_choice' ? createForm.questionCount : undefined,
      answerKey: createForm.examType === 'multiple_choice' ? (JSON.stringify(createForm.answerKey) as any) : undefined,
      questions: createForm.questions ? JSON.stringify(createForm.questions) : undefined,
    })
    if (session) {
      setShowCreate(false)
      setCreateError('')
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

  const handleSaveScore = async (studentId: string, score: number) => {
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

  const handlePrint = () => {
    if (!activeSession || classStudents.length === 0) return
    const svgs = generateExamQrCodes(activeSession.id, classStudents).map((q, i) => ({
      ...q,
      name: classStudents[i].name,
      code: classStudents[i].code,
    }))
    const cls = activeSessionClassId ? findClassById(activeSessionClassId) : undefined
    printQrSheet(`${cls?.name || 'Lớp'} — ${SCORE_TYPE_LABELS[activeSession.scoreType]} (${activeSession.subject})`, svgs)
  }

  const hasBlockedConflicts = !!lastFinalize && lastFinalize.conflicts.length > 0

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Header */}
      <div className="bg-surface-card rounded-2xl p-3 sm:p-4 border border-surface-border shadow-card flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-parish-primary/10 text-parish-primary flex items-center justify-center">
            <ClipboardList size={20} />
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-parish-primary m-0">Chấm Bài Kiểm Tra</h3>
            <p className="text-xs text-text-muted m-0">
              {effectiveClassId
                ? `Lớp: ${findClassById(effectiveClassId)?.name || 'Lớp'} — QR + nhập nhanh tự đồng bộ điểm`
                : 'Tất cả các lớp — QR + nhập nhanh tự đồng bộ điểm'}
            </p>
          </div>
        </div>
        {canManage && (
          <button className="btn btn-primary btn-sm min-h-11 w-full justify-center sm:w-auto" onClick={handleOpenCreate}>
            <Plus size={14} /> Tạo Phiên Chấm
          </button>
        )}
      </div>

      {/* Class chips for catechists */}
      {!isAdmin && assignedClasses.length > 0 && (
        <div className="mobile-scroll-row -mx-1 px-1 pb-1">
          <button
            type="button"
            onClick={() => setViewClassId(null)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              viewClassId === null ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-secondary'
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
                viewClassId === c.id ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-secondary'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          <span className="flex-1">{error}</span>
          <button className="text-xs underline" onClick={clearError}>Đóng</button>
        </div>
      )}

      {/* Session list */}
      <div className="bg-surface-card rounded-2xl p-3 sm:p-4 border border-surface-border shadow-card">
        <div className="flex flex-col gap-1.5 mb-3 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="font-bold text-sm text-text-secondary m-0">
            Danh sách phiên chấm {displayedSessions.length > 0 && `(${displayedSessions.length})`}
          </h4>
          {!effectiveClassId && (
            <span className="text-xs text-text-muted">Đang xem tất cả các lớp</span>
          )}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-4">
            <Loader2 size={16} className="animate-spin" /> Đang tải danh sách phiên chấm…
          </div>
        ) : displayedSessions.length === 0 ? (
          <div className="text-sm text-text-muted py-6 text-center">
            {effectiveClassId
              ? `Chưa có phiên chấm nào cho ${findClassById(effectiveClassId)?.name || 'lớp này'}`
              : 'Chưa có phiên chấm nào trong học kỳ này'}
            {canManage ? ' — bấm "Tạo Phiên Chấm" để bắt đầu' : ''}.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {displayedSessions.map(s => {
              const sessionClass = findClassById(s.classId)
              return (
                <button
                  key={s.id}
                  onClick={() => selectSession(s.id)}
                  className={`w-full min-h-[72px] text-left rounded-xl border px-3 py-3 flex items-center justify-between gap-3 transition-colors active:scale-[0.99] ${
                    selectedSessionId === s.id
                      ? 'border-parish-primary bg-parish-primary/5 shadow-2xs'
                      : 'border-surface-border hover:bg-surface-hover'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0 mb-1">
                      <span className="badge badge-primary text-xs shrink-0">{SCORE_TYPE_LABELS[s.scoreType]}</span>
                      {sessionClass && (
                        <span className="badge badge-neutral text-[11px] font-bold shrink-0 max-w-24 truncate">
                          {sessionClass.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1 min-w-0">
                      <span className="font-semibold text-sm truncate">{s.subject}</span>
                      {s.maxScore !== 10 && <span className="text-xs text-text-muted shrink-0">/{s.maxScore}</span>}
                    </div>
                  </div>
                  <span className={`badge text-xs shrink-0 ${STATUS_LABELS[s.status].cls}`}>
                    {STATUS_LABELS[s.status].label}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Active session panel */}
      {activeSession && (
        <div className="bg-surface-card rounded-2xl p-3 sm:p-4 border border-surface-border shadow-card">
          <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h4 className="font-bold text-sm flex items-center gap-2 flex-wrap">
                {findClassById(activeSession.classId) && (
                  <span className="badge badge-neutral text-xs">
                    {findClassById(activeSession.classId)?.name}
                  </span>
                )}
                <span>{SCORE_TYPE_LABELS[activeSession.scoreType]} — {activeSession.subject}</span>
                <span className={`badge text-xs ${STATUS_LABELS[activeSession.status].cls}`}>{STATUS_LABELS[activeSession.status].label}</span>
              </h4>
              <p className="text-xs text-text-muted mt-0.5">
                {DAILY_TYPES.includes(activeSession.scoreType as any)
                  ? 'Điểm vào cột hằng ngày (tính trung bình)'
                  : 'Điểm ghi thẳng vào cột Giữa Kỳ / Cuối Kỳ'}
                {' · '}Học kỳ {activeSession.semester === 2 ? 'II' : 'I'} · {' '}
                {activeSession.academicYear}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              {canScan && activeSession.status === 'draft' && (
                <>
                  <button className="btn btn-primary btn-sm min-h-11 col-span-2 justify-center sm:col-auto" onClick={() => setShowGuidedGrade(true)} disabled={classStudents.length === 0}>
                    <ListChecks size={14} /> Chấm Ổn Định
                  </button>
                  <button className="btn btn-secondary btn-sm min-h-11 col-span-2 justify-center sm:col-auto" onClick={() => { setFixedScanStudent(null); setShowScanner(true) }}>
                    <ScanLine size={14} /> Quét QR + OMR
                  </button>
                </>
              )}
              {activeSessionQuestions.length > 0 && (
                <button
                  className="btn btn-secondary btn-sm min-h-11 justify-center"
                  onClick={() => setShowPaperModal(true)}
                  title="In đề thi tích hợp phiếu trả lời và khung điểm gộp tiết kiệm giấy"
                >
                  <FileText size={14} /> In Đề & Phiếu Gộp
                </button>
              )}
              <button
                className="btn btn-secondary btn-sm min-h-11 justify-center"
                onClick={() => setShowPrintSheets(true)}
                disabled={classStudents.length === 0}
              >
                <Printer size={14} /> In Phiếu Trả Lời
              </button>
              <button className="btn btn-secondary btn-sm min-h-11 justify-center" onClick={handlePrint} disabled={classStudents.length === 0 || activeSession.status === 'completed'}>
                <QrCode size={14} /> In Mã QR
              </button>
              {canManage && activeSession.status === 'completed' && can('admin') && (
                <button
                  className="btn btn-secondary btn-sm min-h-11 justify-center"
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
                  <RotateCcw size={14} /> Mở Lại
                </button>
              )}
              {canManage && activeSession.status === 'draft' && (
                <button
                  className="btn btn-danger btn-sm min-h-11 justify-center"
                  onClick={handleDeleteSession}
                >
                  <Trash2 size={14} /> Xóa Phiên
                </button>
              )}
            </div>
          </div>

              {/* Conflicts from last finalize */}
              {hasBlockedConflicts && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-800 mb-1">
                    <AlertTriangle size={16} /> {lastFinalize!.conflicts.length} học sinh bị chặn ghi đè điểm tay
                  </div>
                  <ul className="text-sm text-amber-800 list-disc ml-5">
                    {lastFinalize!.conflicts.map(c => (
                      <li key={c.studentId}>
                        {c.studentName}: điểm hiện tại <b>{c.existingScore ?? '—'}</b> (nguồn {c.existingSource === 'excel_import' ? 'nhập Excel' : c.existingSource === 'override' ? 'ghi đè chính thức' : 'nhập tay'}) — điểm scan <b>{c.scannedScore}</b>. Không tự ghi đè — xử lý qua Ghi Đè Điểm ở Ma Trận.
                      </li>
                    ))}
                  </ul>
                  {conflictsConfirmed && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle2 size={16} /> Phiên đã đóng. Những em bị chặn nằm ngoài finalize — không bị ảnh hưởng điểm tay.
                    </div>
                  )}
                </div>
              )}

              {/* Finalize success */}
              {lastFinalize && lastFinalize.conflicts.length === 0 && conflictsConfirmed && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2 text-sm text-emerald-800">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <div>
                    Hoàn tất phiên chấm thành công:{' '}
                    <b>{lastFinalize.dailyCount}</b> học sinh vào điểm hằng ngày,
                    <b> {lastFinalize.directCount}</b> học sinh ghi trực tiếp (Giữa Kỳ/Cuối Kỳ).
                  </div>
                </div>
              )}

              {canScan && activeSession.status === 'draft' && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 font-bold text-sm text-text-secondary mb-2">
                    <Save size={14} /> Nhập Điểm Nhanh (Enter để lưu)
                  </div>
                  <QuickScoreEntry
                    students={classStudents}
                    savedScores={savedScores}
                    maxScore={activeSession.maxScore}
                    onSave={handleSaveScore}
                    disabled={saving}
                  />
                </div>
              )}

              <div className="mb-4">
                <div className="flex items-center gap-2 font-bold text-sm text-text-secondary mb-2">
                  <QrCode size={14} /> Kết quả đã lưu ({results.length})
                </div>
                <ExamResultsTable
                  results={results}
                  onRemove={canScan && activeSession.status === 'draft' ? handleRemoveResult : () => {}}
                />
              </div>

              {canManage && activeSession.status === 'draft' && (
                <div className="flex flex-col gap-2 border-t border-surface-border pt-3 sm:flex-row sm:items-center sm:justify-end">
                  <span className="text-xs text-text-muted sm:mr-auto">
                    {results.length} học sinh có điểm — hoàn tất sẽ đóng phiên và ghi vào bảng điểm (không thể sửa trực tiếp).
                  </span>
                  <button
                    className="btn btn-primary min-h-11 w-full justify-center sm:w-auto"
                    onClick={handleFinalize}
                    disabled={finalizing || results.length === 0}
                  >
                    {finalizing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {finalizing ? 'Đang hoàn tất…' : 'Hoàn Tất Phiên Chấm'}
                  </button>
                </div>
              )}
            </div>
          )}

      {showGuidedGrade && activeSession && (
        <GuidedGradeModal
          students={classStudents}
          savedScores={savedScores}
          maxScore={activeSession.maxScore}
          onSave={handleSaveScore}
          onScanOmr={student => {
            setFixedScanStudent(student)
            setShowGuidedGrade(false)
            setShowScanner(true)
          }}
          onClose={() => setShowGuidedGrade(false)}
        />
      )}

      {/* Scan modal — tự động QR+OMR hoặc OMR với học sinh đã chọn. */}
      {showScanner && activeSession && (
        <ExamScanModal
          sessionId={activeSession.id}
          maxScore={activeSession.maxScore}
          examType={activeSession.examType}
          questionCount={activeSession.questionCount}
          answerKey={parseAnswerKeySafe(activeSession.answerKey)}
          fixedStudent={fixedScanStudent ?? undefined}
          onClose={() => { setShowScanner(false); setFixedScanStudent(null) }}
        />
      )}

      {/* Answer sheet printer modal — Phase 2 & 4 */}
      {showPrintSheets && activeSession && (
        <AnswerSheetModal
          sessionId={activeSession.id}
          students={classStudents}
          subject={activeSession.subject}
          scoreTypeLabel={SCORE_TYPE_LABELS[activeSession.scoreType]}
          classLabel={activeSessionClassId ? findClassById(activeSessionClassId)?.name ?? 'Lớp' : 'Lớp'}
          maxScore={activeSession.maxScore}
          examType={activeSession.examType}
          questionCount={activeSession.questionCount}
          onClose={() => setShowPrintSheets(false)}
        />
      )}

      
      {/* Answer Key Viewer Modal for Active Session */}
      {showAnswerKeyModal && activeSession && (
        <div role="dialog" aria-modal="true" aria-labelledby="answer-key-title" className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAnswerKeyModal(false)}>
          <div className="bg-surface-card rounded-2xl p-5 w-full max-w-lg shadow-2xl flex flex-col gap-3 max-h-[90vh] border border-surface-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div>
                <h4 id="answer-key-title" className="font-extrabold text-parish-primary flex items-center gap-2 m-0">
                  <ListChecks className="text-parish-primary" size={18} />
                  Đáp Án Chuẩn — {activeSession.subject}
                </h4>
                <p className="text-xs text-text-muted mt-0.5 m-0 font-medium">
                  {activeSession.questionCount || 20} câu hỏi trắc nghiệm · Thang điểm {activeSession.maxScore}
                </p>
              </div>
              <button onClick={() => setShowAnswerKeyModal(false)} className="btn btn-secondary btn-sm rounded-xl">
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
            {activeSession.status === 'draft' && activeSession.examType === 'multiple_choice' && (
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
                  <span className="text-xs font-bold text-green-600">
                    Đã chấm lại {rescoreResult.rescored} kết quả · giữ nguyên {rescoreResult.skipped} kết quả nhập tay
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div role="dialog" aria-modal="true" aria-labelledby="create-session-title" className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-surface-card rounded-2xl p-5 w-full max-w-2xl shadow-xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h4 id="create-session-title" className="font-extrabold text-parish-primary mb-1">Tạo Phiên Chấm</h4>
            <p className="text-xs text-text-muted mb-3">
              Năm học {normalizeActiveAY(activeAY)} · Học kỳ {selectedSemester} — điểm sẽ ghi đúng cột theo loại điểm khi hoàn tất phiên.
            </p>

            {/* Class selection in Create Modal */}
            {!effectiveClassId ? (
              <div className="mb-3">
                <label className="block text-xs font-bold text-text-secondary mb-1">
                  Lớp học <span className="text-red-500">*</span>
                </label>
                <select
                  value={createForm.classId || ''}
                  onChange={e => {
                    setCreateForm(f => ({ ...f, classId: e.target.value }))
                    setCreateError('')
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border bg-surface-card text-text-main text-xs font-semibold focus:border-parish-primary focus:outline-none"
                >
                  <option value="">-- Chọn lớp học áp dụng --</option>
                  {assignedClasses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mb-3 p-2.5 bg-parish-primary/5 border border-parish-primary/20 rounded-xl text-xs font-semibold text-parish-primary flex items-center justify-between">
                <span>Lớp học: <strong>{findClassById(effectiveClassId)?.name || 'Lớp'}</strong></span>
                <span className="text-[11px] text-text-muted">Theo bộ lọc hiện tại</span>
              </div>
            )}


            {/* Smart Exam Importer Banner */}
            <div className="flex items-center justify-between mb-4 bg-surface-hover/70 p-3 rounded-xl border border-surface-border">
              <div>
                <span className="text-xs font-bold text-text-main flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-500" /> Tự Động Phân Tích Đề Thi:
                </span>
                <span className="text-[11px] text-text-muted">Import từ Word / Markdown / Excel để tự điền số câu và đáp án</span>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs font-bold shadow-xs"
              >
                <Sparkles size={13} className="text-amber-300" /> Import Đề Thi
              </button>
            </div>

            {createForm.questions && createForm.questions.length > 0 && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
                <span className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 size={16} /> Đã nạp đề thi gồm <strong>{createForm.questions.length} câu hỏi</strong> trắc nghiệm
                </span>
                <button
                  type="button"
                  onClick={() => setCreateForm(f => ({ ...f, questions: undefined }))}
                  className="text-[11px] underline text-text-muted hover:text-rose-600 font-semibold"
                >
                  Gỡ đề thi
                </button>
              </div>
            )}

            <label className="block text-xs font-bold text-text-secondary mb-1">Hình thức Bài Kiểm Tra</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => { setCreateForm(f => ({ ...f, examType: 'written' })); setCreateError('') }}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                  createForm.examType === 'written'
                    ? 'border-parish-primary bg-parish-primary text-white'
                    : 'border-surface-border text-text-secondary hover:bg-surface-hover'
                }`}
              >
                Tự luận (Tô điểm 0-10)
              </button>
              <button
                type="button"
                onClick={() => { setCreateForm(f => ({ ...f, examType: 'multiple_choice' })); setCreateError('') }}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                  createForm.examType === 'multiple_choice'
                    ? 'border-parish-primary bg-parish-primary text-white'
                    : 'border-surface-border text-text-secondary hover:bg-surface-hover'
                }`}
              >
                Trắc nghiệm (A/B/C/D)
              </button>
            </div>

            <label className="block text-xs font-bold text-text-secondary mb-1">Loại Điểm</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {SCORE_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setCreateForm(f => ({ ...f, scoreType: t.id }))}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                    createForm.scoreType === t.id
                      ? 'border-parish-primary bg-parish-primary text-white'
                      : 'border-surface-border text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {t.label}
                  <span className="block text-[10px] font-normal opacity-70">
                    {t.daily ? 'vào điểm hằng ngày' : 'ghi trực tiếp'}
                  </span>
                </button>
              ))}
            </div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Môn / Nội dung kiểm tra</label>
            <input
              value={createForm.subject}
              onChange={e => setCreateForm(f => ({ ...f, subject: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              placeholder="VD: Kiểm tra chương 3"
              className="w-full px-3 py-2 rounded-xl border border-surface-border focus:border-parish-primary focus:outline-none mb-3"
            />
            <label className="block text-xs font-bold text-text-secondary mb-1">Thang điểm tối đa</label>
            <input
              type="number"
                  inputMode="decimal"
                  pattern="[0-9]*"
              min={1}
              max={10}
              value={createForm.maxScore}
              onChange={e => setCreateForm(f => ({ ...f, maxScore: Math.min(10, Math.max(1, Number(e.target.value) || 10)) }))}
              className="w-24 px-3 py-2 rounded-xl border border-surface-border focus:border-parish-primary focus:outline-none mb-3"
            />

            {createForm.examType === 'multiple_choice' && (
              <div className="mb-3">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <label className="block text-xs font-bold text-text-secondary">Số câu hỏi</label>
                  <input
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
                    className="w-20 px-3 py-2 rounded-xl border border-surface-border focus:border-parish-primary focus:outline-none"
                  />
                  <span className="text-xs text-text-muted">(1–50, khớp mẫu phiếu trả lời)</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-xs font-bold text-text-secondary">Đáp án chuẩn:</span>
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
                      className={`px-3 py-1 rounded-lg text-[11px] font-black transition-colors ${
                        Object.values(createForm.answerKey).every(v => v === opt) && Object.keys(createForm.answerKey).length === createForm.questionCount
                          ? 'bg-parish-primary text-white'
                          : 'bg-surface-hover text-text-secondary hover:bg-parish-primary-light hover:text-parish-primary'
                      }`}
                    >
                      Toàn {opt}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 max-h-56 overflow-y-auto p-2 bg-surface-app rounded-xl border border-surface-border">
                  {Array.from({ length: createForm.questionCount }).map((_, i) => {
                    const q = i + 1
                    const current = createForm.answerKey[q]
                    return (
                      <div key={q} className="flex flex-col items-center gap-0.5 p-1 rounded-lg bg-surface-card border border-surface-border">
                        <span className="text-[9px] font-bold text-text-muted">câu {q}</span>
                        <div className="flex gap-0.5">
                          {(['A', 'B', 'C', 'D'] as const).map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setCreateForm(f => ({ ...f, answerKey: { ...f.answerKey, [q]: opt } }))
                                setCreateError('')
                              }}
                              className={`w-5 h-5 rounded text-[10px] font-black ${
                                current === opt
                                  ? 'bg-parish-primary text-white'
                                  : 'bg-surface-app text-text-muted hover:bg-surface-hover'
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
              </div>
            )}

            {createError && (
              <div className="mb-3 rounded-xl bg-parish-warning-bg/40 border border-parish-warning/30 px-3 py-2 text-xs font-semibold text-parish-warning">
                {createError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCreate(false)}>Hủy</button>
              <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!createForm.subject.trim()}>
                <Plus size={14} /> Tạo Phiên
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Exam Import Modal */}
      {showImportModal && (
        <ExamImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={(data) => {
            setCreateForm(f => ({
              ...f,
              subject: data.subject || f.subject,
              examType: 'multiple_choice',
              questionCount: data.questionCount,
              answerKey: data.answerKey,
              questions: data.questions,
            }))
            setCreateError('')
          }}
        />
      )}

      {/* Printable Exam Paper Modal */}
      {showPaperModal && activeSession && (
        <ExamPaperModal
          isOpen={showPaperModal}
          onClose={() => setShowPaperModal(false)}
          subject={activeSession.subject}
          classLabel={activeSessionClassId ? findClassById(activeSessionClassId)?.name ?? 'Lớp' : 'Lớp'}
          academicYear={activeSession.academicYear}
          questions={activeSessionQuestions}
          students={classStudents}
          sessionId={activeSession.id}
        />
      )}

      {confirmDialog}
    </div>
  )
}
