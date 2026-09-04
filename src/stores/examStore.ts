import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import { api } from '../lib/api'
import {
  syncCreateExam,
  syncSaveExamResults,
  syncRemoveExamResult,
  syncCompleteExam,
  syncReopenExam,
  syncDeleteExam,
} from '../lib/syncService'
import type { ExamSession, ExamResult, ExamFinalizeResult, ExamVersionCode, MultipleChoiceOption, ExamVariantManifestSet } from '../types'
import { normalizeAnswerKey, normalizeAnswerVariants } from '../lib/examVariants'
import { useGradeStore } from './gradeStore'
import { useStudentStore } from './studentStore'
import { useAcademicYearStore } from './academicYearStore'
import { requestSync as runSyncFlow } from '../lib/syncTrigger'
import { evaluateExamFinalizeConflictsAndRoute, mapServerFinalizationToResult } from '../services/examFinalizeService'
import { getTenantScope } from '../lib/tenantScope'
import { tripContinuousScanCircuit } from '../lib/examContinuousRollout'
import { recordContinuousDuration } from '../lib/continuousScanDiagnostics'
import { recordOmrSequenceAcknowledgement } from '../lib/omrSequenceEvidence'

// Re-export constants đã chuyển sang examFinalizeService để giữ API cũ cho component/test.
export { SCORE_FIELD_MAP, DAILY_TYPES } from '../services/examFinalizeService'

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

function parseJsonObject<T>(value: T | string | null | undefined): T | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') return value
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : undefined
  } catch {
    return undefined
  }
}

function normalizeExamResults(rows: ExamResult[]): ExamResult[] {
  return rows.map(row => ({
    ...row,
    answers: parseJsonObject(row.answers),
    scanMetadata: parseJsonObject(row.scanMetadata),
  }))
}

function normalizeExamSessions(rows: ExamSession[]): ExamSession[] {
  return rows.map(row => {
    const answerKey = normalizeAnswerKey(row.answerKey, row.questionCount)
    return {
      ...row,
      answerKey,
      answerVariants: normalizeAnswerVariants(row.answerVariants, answerKey, row.questionCount),
      variantManifests: parseJsonObject<ExamVariantManifestSet>(row.variantManifests),
    }
  })
}

export const SCORE_TYPE_LABELS: Record<string, string> = {
  oral: 'Điểm Miệng',
  '15m': '15 Phút',
  '1period': '1 Tiết',
  midterm: 'Giữa Kỳ',
  final: 'Cuối Kỳ',
}

/** Một dòng điểm khi lưu — hỗ trợ cả written (score) lẫn multiple_choice (answers JSON) */
export interface ExamScoreItem {
  studentId: string
  score: number
  /** EXAM-MIXED: điểm phần tự luận; server tự cộng phần TN đã quét. */
  essayScore?: number
  source?: string
  answers?: string
  /** JSON chẩn đoán tổng hợp; tuyệt đối không chứa ảnh/base64. */
  scanMetadata?: string
  examVersion?: ExamVersionCode
  clientMutationId?: string
  attemptFingerprint?: string
  capturedAt?: string
}

export type ExamResultMutationStatus = 'pending' | 'synced' | 'error' | 'conflict'

export interface QueuedExamResultMutationState {
  clientMutationId: string
  queueOpId: string
  sessionId: string
  studentId: string
  proposedScore: number
  serverScore?: number
  status: ExamResultMutationStatus
  error?: string
  createdAt: string
  updatedAt: string
}

function mergeLocalExamResults(current: ExamResult[], sessionId: string, scores: ExamScoreItem[]): ExamResult[] {
  const now = new Date().toISOString()
  const byStudent = new Map(current.map(result => [result.studentId, result]))
  for (const score of scores) {
    const existing = byStudent.get(score.studentId)
    byStudent.set(score.studentId, {
      id: existing?.id || `EXR-local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      examSessionId: sessionId,
      studentId: score.studentId,
      score: score.score,
      essayScore: score.essayScore ?? existing?.essayScore ?? null,
      source: (score.source as ExamResult['source']) || 'qr_scan',
      createdAt: existing?.createdAt || now,
      answers: score.answers ? parseJsonObject<Record<number, MultipleChoiceOption | null>>(score.answers) : existing?.answers,
      scanMetadata: score.scanMetadata ? parseJsonObject<ExamResult['scanMetadata']>(score.scanMetadata) : existing?.scanMetadata,
      examVersion: score.examVersion ?? existing?.examVersion ?? 'A',
    })
  }
  return Array.from(byStudent.values())
}

function pruneMutationLedger(
  ledger: Record<string, QueuedExamResultMutationState>,
  maxEntries = 200,
): Record<string, QueuedExamResultMutationState> {
  const entries = Object.entries(ledger)
  if (entries.length <= maxEntries) return ledger
  return Object.fromEntries(entries
    .sort(([, a], [, b]) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, maxEntries))
}

export interface CreateExamInput {
  classId: string
  subject: string
  scoreType: string
  maxScore?: number
  semester: 1 | 2
  academicYear?: string
  examType?: 'written' | 'multiple_choice' | 'mixed'
  questionCount?: number
  answerKey?: string
  answerVariants?: string
  questions?: string
}

interface ExamState {
  sessions: ExamSession[]
  selectedSessionId: string | null
  results: ExamResult[]
  loading: boolean
  saving: boolean
  finalizing: boolean
  error: string | null
  lastFinalize: ExamFinalizeResult | null
  queuedResultMutations: Record<string, QueuedExamResultMutationState>

  loadMySessions: () => Promise<void>
  loadClassSessions: (classId: string, filters?: { subject?: string; scoreType?: string; status?: string }) => Promise<void>
  createSession: (data: CreateExamInput) => Promise<ExamSession | null>
  selectSession: (id: string | null) => Promise<void>
  refreshResults: () => Promise<void>
  saveScores: (scores: ExamScoreItem[]) => Promise<{
    saved: number
    upserted: number
    adjustments?: Array<{ studentId: string; clientScore: number; serverScore: number }>
  } | null>
  queueScores: (scores: ExamScoreItem[]) => Promise<{
    saved: number
    upserted: number
    queuedMutations: QueuedExamResultMutationState[]
  } | null>
  markResultMutation: (clientMutationId: string, status: ExamResultMutationStatus, details?: { serverScore?: number; error?: string }) => void
  removeResult: (studentId: string) => Promise<boolean>
  completeAndFinalize: () => Promise<ExamFinalizeResult | null>
  reopenSession: () => Promise<void>
  deleteSession: (id: string) => Promise<boolean>
  updateAnswerVariants: (answerVariants: Partial<Record<ExamVersionCode, Record<number, MultipleChoiceOption>>>, questionCount: number) => Promise<{ rescored: number; skipped: number } | null>
  generateVariantManifests: (variantCount: number) => Promise<ExamSession | null>
  replaceSessionId: (oldId: string, serverData: ExamSession) => void
  /**
   * FE-F1 (audit 2026-08-21): hoàn tác optimistic "Hoàn tất phiên" offline —
   * khi op 'complete' bị server từ chối VĨNH VIỄN (vd 403 học kỳ đã khóa),
   * trạng thái local không được tiếp tục hiển thị 'completed' trong khi server
   * vẫn draft và điểm chưa ghi. Engine gọi action này ở nhánh permanent-fail.
   */
  revertLocalComplete: (sessionId: string) => void
  clearError: () => void
}

export const useExamStore = create<ExamState>()(
  persist(
    (set, get) => ({
      sessions: [],
  selectedSessionId: null,
  results: [],
  loading: false,
  saving: false,
  finalizing: false,
  error: null,
  lastFinalize: null,
  queuedResultMutations: {},

  loadMySessions: async () => {
    set({ loading: true, error: null })
    try {
      if (isOffline()) {
        // Phase 3: giữ local cache (temp sessions + đã pull trước đó).
        set({ loading: false })
        return
      }
      const sessions = await api.getMyExamSessions()
      set({ sessions: normalizeExamSessions(sessions) })
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi tải danh sách phiên chấm' })
    } finally {
      set({ loading: false })
    }
  },

  loadClassSessions: async (classId, filters) => {
    set({ loading: true, error: null })
    try {
      if (isOffline()) {
        set({ loading: false })
        return
      }
      const sessions = await api.getExamSessionsForClass(classId, filters)
      set({ sessions: normalizeExamSessions(sessions) })
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi tải danh sách phiên chấm' })
    } finally {
      set({ loading: false })
    }
  },

  createSession: async (data) => {
    set({ error: null })
    try {
      // Academic year mặc định = NĂM HỌC ĐANG HOẠT ĐỘNG của giáo xứ (academicYearStore —
      // same source as lưới điểm/gradeStore), KHÔNG lấy theo ngày hiện tại: nếu lấy theo
      // ngày (getCurrentAcademicYear đổi từ tháng 8), phiên tạo trong giai đoạn chuyển năm
      // học sẽ rơi vào năm MỚI trong khi giáo xứ vẫn đang làm việc với năm CŨ → điểm
      // finalize ghi vào năm sai, biến mất khỏi lưới điểm đang xem.
      const academicYear = data.academicYear || useAcademicYearStore.getState().resolveActiveYear()
      if (isOffline()) {
        // Phase 3 offline: tạo session tạm (temp ID) + enqueue CREATE → sync engine
        // tạo trên server khi online, remap ID (replaceSessionId + remapExamSessionIdInPendingOps).
        const tempId = `EXS-tmp-${Date.now()}-${Math.random().toString(36).substr(2, 10)}`
        const tempSession: ExamSession = {
          id: tempId,
          parishId: 'local',
          classId: data.classId,
          subject: data.subject,
          scoreType: data.scoreType as ExamSession['scoreType'],
          maxScore: data.maxScore ?? 10,
          semester: data.semester,
          academicYear,
          status: 'draft',
          createdBy: 'local',
          createdAt: new Date().toISOString(),
          examType: data.examType ?? 'written',
          questionCount: data.questionCount,
          answerKey: data.answerKey ? (JSON.parse(data.answerKey) as Record<number, MultipleChoiceOption>) : undefined,
          answerVariants: normalizeAnswerVariants(data.answerVariants, data.answerKey, data.questionCount),
          questions: data.questions,
        }
        set((state) => ({ sessions: [tempSession, ...state.sessions] }))
        await syncCreateExam({ ...data, academicYear, id: tempId })
        runSyncFlow()
        return tempSession
      }
      const session = await api.createExam({ ...data, academicYear })
      const normalized = normalizeExamSessions([session])[0]
      set((state) => ({ sessions: [normalized, ...state.sessions] }))
      return normalized
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi tạo phiên chấm' })
      return null
    }
  },

  selectSession: async (id) => {
    set({ selectedSessionId: id, results: [], lastFinalize: null, error: null })
    if (!id) return
    try {
      if (isOffline()) {
        // Phase 3: local cache đã có results (saveScores/removeResult offline cập nhật).
        return
      }
      const { results } = await api.getExamResults(id)
      set({ results: normalizeExamResults(results) })
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi tải kết quả phiên chấm' })
    }
  },

  refreshResults: async () => {
    const id = get().selectedSessionId
    if (!id) return
    if (isOffline()) return
    try {
      const { session, results } = await api.getExamResults(id)
      const normalizedSession = normalizeExamSessions([session])[0]
      set({ results: normalizeExamResults(results), sessions: get().sessions.map(s => s.id === id ? normalizedSession : s) })
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi tải kết quả phiên chấm' })
    }
  },

  saveScores: async (scores) => {
    const id = get().selectedSessionId
    if (!id || scores.length === 0) return null
    set({ saving: true, error: null })
    try {
      if (isOffline()) {
        // Phase 3 offline: enqueue UPDATE (save_results) — sync engine gửi khi online.
        // Nếu session là temp (chưa tạo server), remapExamSessionIdInPendingOps sẽ
        // sửa sessionId trong payload sau khi CREATE hoàn tất.
        await syncSaveExamResults(id, scores)
        // Cập nhật local ngay để UI phản ánh.
        set((state) => ({ results: mergeLocalExamResults(state.results, id, scores) }))
        runSyncFlow()
        return { saved: scores.length, upserted: 0 }
      }
      const result = await api.saveExamResults(id, scores)
      await get().refreshResults()
      return result
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi lưu kết quả' })
      return null
    } finally {
      set({ saving: false })
    }
  },

  queueScores: async (scores) => {
    const id = get().selectedSessionId
    if (!id || scores.length === 0) return null
    set({ saving: true, error: null })
    try {
      const queued = await syncSaveExamResults(id, scores)
      const now = new Date().toISOString()
      const mutations = queued.map((item, index): QueuedExamResultMutationState => ({
        clientMutationId: item.clientMutationId,
        queueOpId: item.queueOpId,
        sessionId: id,
        studentId: item.studentId,
        proposedScore: scores[index]?.score ?? 0,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }))
      set((state) => {
        const ledger = { ...state.queuedResultMutations }
        for (const mutation of mutations) ledger[mutation.clientMutationId] = mutation
        return {
          results: mergeLocalExamResults(state.results, id, scores),
          queuedResultMutations: pruneMutationLedger(ledger),
        }
      })
      runSyncFlow()
      return { saved: scores.length, upserted: 0, queuedMutations: mutations }
    } catch (err) {
      tripContinuousScanCircuit(getTenantScope(), 'durable_write_failure')
      set({ error: (err as Error)?.message || 'Không thể ghi kết quả vào hàng đợi an toàn' })
      return null
    } finally {
      set({ saving: false })
    }
  },

  markResultMutation: (clientMutationId, status, details) => set((state) => {
    const current = state.queuedResultMutations[clientMutationId]
    if (!current) return state
    if (status !== current.status && (status === 'synced' || status === 'error' || status === 'conflict')) {
      const durableAt = Date.parse(current.createdAt)
      if (Number.isFinite(durableAt)) {
        const acknowledgementDurationMs = Date.now() - durableAt
        if (status === 'synced') recordContinuousDuration('durable_to_ack', acknowledgementDurationMs)
        recordOmrSequenceAcknowledgement(
          clientMutationId,
          acknowledgementDurationMs,
          status === 'synced' ? 'synced' : status === 'conflict' ? 'corrupt' : 'lost',
        )
      }
    }
    const next = {
      ...current,
      status,
      serverScore: details?.serverScore ?? current.serverScore,
      error: details?.error,
      updatedAt: new Date().toISOString(),
    }
    const results = details?.serverScore === undefined
      ? state.results
      : state.results.map(result => result.studentId === current.studentId && result.examSessionId === current.sessionId
        ? { ...result, score: details.serverScore as number }
        : result)
    return {
      queuedResultMutations: { ...state.queuedResultMutations, [clientMutationId]: next },
      results,
    }
  }),

  removeResult: async (studentId) => {
    const id = get().selectedSessionId
    if (!id) return false
    set({ saving: true, error: null })
    try {
      if (isOffline()) {
        await syncRemoveExamResult(id, studentId)
        set((state) => ({ results: state.results.filter(r => !(r.examSessionId === id && r.studentId === studentId)) }))
        runSyncFlow()
        return true
      }
      await api.removeExamResult(id, studentId)
      await get().refreshResults()
      return true
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi xóa kết quả' })
      return false
    } finally {
      set({ saving: false })
    }
  },

  completeAndFinalize: async () => {
    const id = get().selectedSessionId
    if (!id) return null
    const session = get().sessions.find(s => s.id === id)
    if (!session) return null

    const sessionMutations = Object.values(get().queuedResultMutations)
      .filter(mutation => mutation.sessionId === id)
    if (sessionMutations.some(mutation => mutation.status === 'error' || mutation.status === 'conflict')) {
      set({ error: 'Không thể hoàn tất: còn bài quét lỗi hoặc xung đột cần xử lý.' })
      return null
    }
    const hasPendingResultMutations = sessionMutations.some(mutation => mutation.status === 'pending')

    set({ finalizing: true, error: null })
    try {
      // P0-01 (Phase 0 containment): server là SOLE WRITER của grades/ledger
      // sau complete. Client chỉ project receipt (online) hoặc dry-run preview
      // (offline/queued) — KHÔNG gọi addDailyEntry/upsertGrade, KHÔNG enqueue
      // grade mutation nào sau server acknowledgement. Ghi đè local trước đây
      // dùng ledger thiếu (partial daily entries) đè kết quả server vừa tính đúng.
      const readGrade = (studentId: string, semester: 1 | 2) =>
        useGradeStore.getState().getStudentGrade(studentId, semester) as Record<string, unknown> | null | undefined
      const studentNameResolver = (studentId: string) => {
        const st = useStudentStore.getState().students.find(s => s.id === studentId)
        return st ? { fullName: st.fullName, code: st.code } : null
      }
      let completed: ExamSession
      if (isOffline() || hasPendingResultMutations) {
        // Complete is a session barrier queued strictly after every durable
        // per-student result mutation. This path is used online too whenever
        // continuous-scan acknowledgements are still pending.
        await syncCompleteExam(id)
        completed = { ...session, status: 'completed' }
        set({ sessions: get().sessions.map(s => s.id === id ? completed : s) })
        runSyncFlow()
        // Queued path: server chưa finalize nên chỉ tính preview hiển thị
        // (no-op writers). Grades authoritative sẽ về qua pull delta sau sync.
        const preview = evaluateExamFinalizeConflictsAndRoute({
          results: get().results,
          session: completed,
          readGrade,
          addDailyEntry: () => {},
          upsertGrade: () => {},
          studentNameResolver,
        })
        set({ lastFinalize: preview })
        return preview
      }
      // 1. Đóng phiên trên server (validate lock + class access + ghi ledger,
      //    grades, receipt, audit EXAM_FINALIZE trong một transaction).
      const response = await api.completeExam(id) as unknown
      const receipt = (response && typeof response === 'object' && response !== null && 'session' in response)
        ? response as { session: ExamSession; items?: unknown[] }
        : null
      completed = receipt ? receipt.session : response as ExamSession
      set({ sessions: get().sessions.map(s => s.id === id ? completed : s) })

      // 2. Project server receipt — không ghi grade thứ hai.
      let finalize: ExamFinalizeResult
      if (receipt && Array.isArray(receipt.items)) {
        finalize = mapServerFinalizationToResult({
          receipt: receipt as unknown as Parameters<typeof mapServerFinalizationToResult>[0]['receipt'],
          scoreType: completed.scoreType,
          semester: completed.semester as 1 | 2,
          results: get().results,
          readGrade,
          studentNameResolver,
        })
      } else {
        // Legacy server shape (chỉ session): dry-run preview hiển thị, no writes.
        finalize = evaluateExamFinalizeConflictsAndRoute({
          results: get().results,
          session: completed,
          readGrade,
          addDailyEntry: () => {},
          upsertGrade: () => {},
          studentNameResolver,
        })
      }
      set({ lastFinalize: finalize })
      // 3. Kéo grades authoritative từ server (best-effort; thất bại thì
      //    sync cycle kế tiếp hội tụ qua pull delta).
      try {
        await useGradeStore.getState().fetchGrades()
      } catch {
        /* converge on next sync — never fail finalize on refresh */
      }
      return finalize
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi hoàn tất phiên chấm' })
      return null
    } finally {
      set({ finalizing: false })
    }
  },

  reopenSession: async () => {
    const id = get().selectedSessionId
    if (!id) return
    set({ error: null })
    try {
      let session: ExamSession
      if (isOffline()) {
        await syncReopenExam(id)
        const current = get().sessions.find(s => s.id === id)
        session = { ...(current as ExamSession), status: 'draft' }
        set({ sessions: get().sessions.map(s => s.id === id ? session : s), lastFinalize: null })
        runSyncFlow()
        return
      }
      session = await api.reopenExam(id)
      set({ sessions: get().sessions.map(s => s.id === id ? session : s), lastFinalize: null })
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi mở lại phiên chấm' })
    }
  },

  deleteSession: async (id) => {
    const current = get().sessions.find(s => s.id === id)
    if (!current) return false
    set({ error: null })
    try {
      if (isOffline()) {
        // Phase 3 offline: enqueue DELETE — sync engine gửi khi online.
        await syncDeleteExam(id)
        set((state) => ({
          sessions: state.sessions.filter(s => s.id !== id),
          results: state.results.filter(r => r.examSessionId !== id),
          queuedResultMutations: Object.fromEntries(Object.entries(state.queuedResultMutations).filter(([, mutation]) => mutation.sessionId !== id)),
          selectedSessionId: state.selectedSessionId === id ? null : state.selectedSessionId,
          lastFinalize: null,
        }))
        runSyncFlow()
        return true
      }
      await api.deleteExam(id)
      set((state) => ({
        sessions: state.sessions.filter(s => s.id !== id),
        results: state.results.filter(r => r.examSessionId !== id),
        queuedResultMutations: Object.fromEntries(Object.entries(state.queuedResultMutations).filter(([, mutation]) => mutation.sessionId !== id)),
        selectedSessionId: state.selectedSessionId === id ? null : state.selectedSessionId,
        lastFinalize: null,
      }))
      return true
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi xóa phiên chấm' })
      return false
    }
  },

  updateAnswerVariants: async (answerVariants, questionCount) => {
    const id = get().selectedSessionId
    if (!id || isOffline()) {
      set({ error: 'Cập nhật nhiều mã đề cần kết nối mạng để chấm lại an toàn.' })
      return null
    }
    set({ saving: true, error: null })
    try {
      const response = await api.updateAnswerVariants(id, JSON.stringify(answerVariants), questionCount)
      const session = normalizeExamSessions([response.session])[0]
      set({ sessions: get().sessions.map(item => item.id === id ? session : item) })
      await get().refreshResults()
      return { rescored: response.rescored, skipped: response.skipped }
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi cập nhật nhiều mã đề' })
      return null
    } finally {
      set({ saving: false })
    }
  },

  generateVariantManifests: async (variantCount) => {
    const id = get().selectedSessionId
    if (!id || isOffline()) {
      set({ error: 'Tạo mã đề tự động cần kết nối máy chủ để khóa manifest an toàn.' })
      return null
    }
    set({ saving: true, error: null })
    try {
      const response = await api.generateExamVariantManifests(id, variantCount)
      const session = normalizeExamSessions([response.session])[0]
      set({ sessions: get().sessions.map(item => item.id === id ? session : item) })
      return session
    } catch (err) {
      set({ error: (err as Error)?.message || 'Không thể tạo bộ mã đề tự động' })
      return null
    } finally {
      set({ saving: false })
    }
  },

  replaceSessionId: (oldId: string, serverData: ExamSession) => {
    set(state => ({
      sessions: state.sessions.map(s => s.id === oldId ? { ...s, ...serverData } : s),
      selectedSessionId: state.selectedSessionId === oldId ? serverData.id : state.selectedSessionId,
      results: state.results.map(r => r.examSessionId === oldId ? { ...r, examSessionId: serverData.id } : r),
      queuedResultMutations: Object.fromEntries(Object.entries(state.queuedResultMutations).map(([key, mutation]) => [
        key,
        mutation.sessionId === oldId ? { ...mutation, sessionId: serverData.id } : mutation,
      ])),
    }))
  },

  revertLocalComplete: (sessionId) => set(state => ({
    sessions: state.sessions.map(s => s.id === sessionId && s.status === 'completed'
      ? { ...s, status: 'draft' as const, completedBy: null, completedAt: null }
      : s),
  })),

  clearError: () => set({ error: null }),
}),
    {
      name: 'parish_store_exams',
      storage: createJSONStorage(() => dexieStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        selectedSessionId: state.selectedSessionId,
        results: state.results,
        queuedResultMutations: state.queuedResultMutations,
      }),
    }
  )
)
