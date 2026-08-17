import React from 'react'
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
import type { ExamSession, ExamResult, ExamFinalizeResult, MultipleChoiceOption } from '../types'
import { useGradeStore } from './gradeStore'
import { useDailyGradeStore } from './dailyGradeStore'
import { useStudentStore } from './studentStore'
import { useAcademicYearStore } from './academicYearStore'
import { runSyncFlow } from '../hooks/useSyncEngine'
import { evaluateExamFinalizeConflictsAndRoute } from '../services/examFinalizeService'

// Re-export constants đã chuyển sang examFinalizeService để giữ API cũ cho component/test.
export { SCORE_FIELD_MAP, DAILY_TYPES } from '../services/examFinalizeService'

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
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
  source?: string
  answers?: string
}

export interface CreateExamInput {
  classId: string
  subject: string
  scoreType: string
  maxScore?: number
  semester: 1 | 2
  academicYear?: string
  examType?: 'written' | 'multiple_choice'
  questionCount?: number
  answerKey?: string
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

  loadMySessions: () => Promise<void>
  loadClassSessions: (classId: string, filters?: { subject?: string; scoreType?: string; status?: string }) => Promise<void>
  createSession: (data: CreateExamInput) => Promise<ExamSession | null>
  selectSession: (id: string | null) => Promise<void>
  refreshResults: () => Promise<void>
  saveScores: (scores: ExamScoreItem[]) => Promise<{ saved: number; upserted: number } | null>
  removeResult: (studentId: string) => Promise<boolean>
  completeAndFinalize: () => Promise<ExamFinalizeResult | null>
  reopenSession: () => Promise<void>
  deleteSession: (id: string) => Promise<boolean>
  replaceSessionId: (oldId: string, serverData: ExamSession) => void
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

  loadMySessions: async () => {
    set({ loading: true, error: null })
    try {
      if (isOffline()) {
        // Phase 3: giữ local cache (temp sessions + đã pull trước đó).
        set({ loading: false })
        return
      }
      const sessions = await api.getMyExamSessions()
      set({ sessions })
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
      set({ sessions })
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
          questions: data.questions,
        }
        set((state) => ({ sessions: [tempSession, ...state.sessions] }))
        await syncCreateExam({ ...data, academicYear, id: tempId })
        runSyncFlow()
        return tempSession
      }
      const session = await api.createExam({ ...data, academicYear })
      set((state) => ({ sessions: [session, ...state.sessions] }))
      return session
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
      set({ results })
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
      set({ results, sessions: get().sessions.map(s => s.id === id ? session : s) })
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
        set((state) => {
          const now = new Date().toISOString()
          const byStudent = new Map(state.results.map(r => [r.studentId, r]))
          for (const s of scores) {
            const existing = byStudent.get(s.studentId)
            byStudent.set(s.studentId, {
              id: existing?.id || `EXR-local-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
              examSessionId: id,
              studentId: s.studentId,
              score: s.score,
              source: (s.source as ExamResult['source']) || 'qr_scan',
              createdAt: existing?.createdAt || now,
              answers: s.answers ? (JSON.parse(s.answers) as Record<number, MultipleChoiceOption | null>) : existing?.answers,
            })
          }
          return { results: Array.from(byStudent.values()) }
        })
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

    set({ finalizing: true, error: null })
    try {
      let completed: ExamSession
      if (isOffline()) {
        // Phase 3 offline: enqueue complete — server xác thực lock/class access khi online.
        await syncCompleteExam(id)
        completed = { ...session, status: 'completed' }
        set({ sessions: get().sessions.map(s => s.id === id ? completed : s) })
        runSyncFlow()
      } else {
        // 1. Đóng phiên trên server (validate lock + class access + audit EXAM_FINALIZE).
        completed = await api.completeExam(id)
        set({ sessions: get().sessions.map(s => s.id === id ? completed : s) })
      }

      const finalize = evaluateExamFinalizeConflictsAndRoute({
        results: get().results,
        session: completed,
        readGrade: (studentId, semester) => useGradeStore.getState().getStudentGrade(studentId, semester) as Record<string, unknown> | null | undefined,
        addDailyEntry: (studentId, scoreType, score, semester, date) =>
          useDailyGradeStore.getState().addEntry(studentId, scoreType, score, semester, date),
        upsertGrade: (payload) => useGradeStore.getState().upsertGrade(payload as any),
        studentNameResolver: (studentId) => {
          const st = useStudentStore.getState().students.find(s => s.id === studentId)
          return st ? { fullName: st.fullName, code: st.code } : null
        },
      })
      set({ lastFinalize: finalize })
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
        selectedSessionId: state.selectedSessionId === id ? null : state.selectedSessionId,
        lastFinalize: null,
      }))
      return true
    } catch (err) {
      set({ error: (err as Error)?.message || 'Lỗi xóa phiên chấm' })
      return false
    }
  },

  replaceSessionId: (oldId: string, serverData: ExamSession) => {
    set(state => ({
      sessions: state.sessions.map(s => s.id === oldId ? { ...s, ...serverData } : s),
      selectedSessionId: state.selectedSessionId === oldId ? serverData.id : state.selectedSessionId,
      results: state.results.map(r => r.examSessionId === oldId ? { ...r, examSessionId: serverData.id } : r),
    }))
  },

  clearError: () => set({ error: null }),
}),
    {
      name: 'parish_store_exams',
      storage: createJSONStorage(() => dexieStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        selectedSessionId: state.selectedSessionId,
        results: state.results,
      }),
    }
  )
)
