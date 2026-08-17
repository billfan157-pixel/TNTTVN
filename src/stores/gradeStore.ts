import React from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage, getDB } from '../lib/db'
import type { GradeRecord } from '../types'
import { calculateGradeAverage, calculateAttendanceRate, matchAcademicYear } from '../utils/grades'
import { getCurrentAcademicYear, normalizeAcademicYear } from '../utils/academicYear'
import { useDailyGradeStore } from './dailyGradeStore'
import * as syncService from '../lib/syncService'
import { api, isAuthenticated } from '../lib/api'
import * as Sentry from '@sentry/react'
import { useAcademicYearStore } from './academicYearStore'
import { useSettingsStore } from './settingsStore'
import { decryptQueueValue } from '../lib/offlineCipher'

const SCORE_FIELDS = ['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc'] as const

// Lazy import như attendanceStore.ts:46-54 — import runSyncFlow ở module top-level
// sẽ kéo router.tsx vào mọi unit test. GRADE-SYNC-1 (2026-08-14): mọi thao tác sửa
// điểm phải trigger sync tức thì để audit log máy chủ được ghi ngay.
async function triggerSyncFlow() {
  try {
    const { runSyncFlow } = await import('../hooks/useSyncEngine')
    await runSyncFlow()
  } catch (err) {
    console.warn('[gradeStore] runSyncFlow failed:', err)
  }
}

/** Natural key của grade: studentId:semester:academicYear (chuẩn hóa 'YYYY-YYYY'). */
function gradeNaturalKey(g: { studentId?: string; semester?: number | string; academicYear?: string }): string {
  return `${g.studentId}:${g.semester}:${normalizeAcademicYear(g.academicYear || getCurrentAcademicYear())}`
}

/**
 * ADR-016 (offline-sync audit #6): tập natural key của các grade đang có op
 * pending/retrying — dùng để KHÔNG đè row local (đang chứa thay đổi chưa sync)
 * bằng dữ liệu server cũ hơn khi pull incremental.
 */
async function getPendingGradeNaturalKeys(): Promise<Set<string>> {
  try {
    const db = getDB()
    const pending = await db.syncQueue.where('status').anyOf(['pending', 'retrying']).toArray()
    const keys = new Set<string>()
    for (const item of pending) {
      if (item.entity !== 'grade') continue
      try {
        const raw = await decryptQueueValue(item.payload)
        const p = raw !== null ? JSON.parse(raw) : null
        if (p && typeof p.studentId === 'string') keys.add(gradeNaturalKey(p))
      } catch { /* payload không parse được — bỏ qua */ }
    }
    return keys
  } catch {
    return new Set<string>()
  }
}

function stripGradeMeta(g: Record<string, unknown>): Record<string, unknown> {
  const meta = new Set<string>()
  for (const f of SCORE_FIELDS) {
    meta.add(`${f}_updated_at`)
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(g)) {
    if (!meta.has(k)) out[k] = v
  }
  return out
}

/**
 * Năm học tự động tính theo ngày hiện tại (năm học bắt đầu từ tháng 8), luôn ở
 * định dạng chuẩn 'YYYY-YYYY' (ADR-017). Trước đây trả 'YYYY - YYYY' khiến
 * exact-match (reportViewModelFactory, pdfGenerator, PrintReportModal,
 * DesktopDashboard) so với row server 'YYYY-YYYY' ra rỗng.
 */
export { getCurrentAcademicYear } from '../utils/academicYear'

/** @deprecated Dùng getCurrentAcademicYear() thay vì const để tránh frozen year */
export const CURRENT_ACADEMIC_YEAR = getCurrentAcademicYear()

import { gradeAggregateAdapter } from '../domain/GradeAggregateAdapter'
import type { GradeOverride, OverrideReasonCode } from '../types'

interface GradeState {
  grades: GradeRecord[]
  error: string | null
  setGrades: (grades: GradeRecord[]) => void
  fetchGrades: (updatedAfter?: string) => Promise<void>
  upsertGrade: (gradeData: Partial<GradeRecord> & { studentId: string; semester: 1 | 2 }, skipSync?: boolean) => void
  batchSaveGrades: (gradesList: (Partial<GradeRecord> & { studentId: string; semester: 1 | 2 })[], skipSync?: boolean) => void
  overrideScore: (
    studentId: string,
    semester: 1 | 2,
    scoreField: keyof Pick<GradeRecord, 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal' | 'scoreDaoDuc'>,
    manualValue: number,
    reasonCode?: OverrideReasonCode,
    reasonNote?: string,
    overrides?: GradeOverride[],
    userId?: string
  ) => GradeOverride
  restoreScore: (
    studentId: string,
    semester: 1 | 2,
    scoreField: keyof Pick<GradeRecord, 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal' | 'scoreDaoDuc'>,
    overrides?: GradeOverride[],
    userId?: string
  ) => { restoredOverride: GradeOverride | null; updatedGrade: GradeRecord } | null
  getStudentGrade: (studentId: string, semester: 1 | 2, academicYear?: string) => GradeRecord | undefined
  calculateStudentAvg: (studentId: string, semester: 1 | 2, academicYear?: string) => { score: number | null; label: string }
}

export const useGradeStore = create<GradeState>()(
  persist(
    (set, get) => ({
      grades: [],
      error: null,
      setGrades: (grades) => set({ grades }),

      fetchGrades: async (updatedAfter?: string) => {
        if (!isAuthenticated()) return
        try {
          const params = updatedAfter ? { updatedAfter } : undefined
          const fetched = await api.getGrades(params)
          if (Array.isArray(fetched)) {
            if (updatedAfter) {
              // ADR-016 (offline-sync audit #6): merge theo natural key thay vì id.
              // Trước đây Map keyed by id → bản ghi local còn temp GR- id và row
              // server (cùng natural key) thành 2 dòng trùng lặp. Row server là
              // canonical (id + version thật). Không đè row đang có op pending.
              const pendingKeys = await getPendingGradeNaturalKeys()
              set((state) => {
                const merged = new Map<string, GradeRecord>()
                for (const g of state.grades) merged.set(gradeNaturalKey(g), g)
                for (const g of fetched) {
                  const key = gradeNaturalKey(g)
                  const local = merged.get(key)
                  if (local && pendingKeys.has(key)) continue
                  merged.set(key, g)
                }
                return { grades: Array.from(merged.values()) }
              })
            } else {
              set({ grades: fetched })
            }
            useDailyGradeStore.getState().syncAllToGradeStore()
          }
        } catch (err) {
          Sentry.captureException(err)
          set({ error: (err as Error)?.message || 'Lỗi tải điểm số' })
        }
      },

      upsertGrade: (gradeData, skipSync) => set((state) => {
        const academicYear = gradeData.academicYear || getCurrentAcademicYear()
        const existingIndex = state.grades.findIndex(
          g => g.studentId === gradeData.studentId && g.semester === gradeData.semester && matchAcademicYear(g.academicYear, academicYear)
        )
        let grade: GradeRecord
        if (existingIndex >= 0) {
          const updated = [...state.grades]
          grade = { ...updated[existingIndex], ...gradeData }
          updated[existingIndex] = grade
        } else {
          grade = {
            id: `GR-${Date.now()}-${Math.random().toString(36).substr(2, 10)}`,
            studentId: gradeData.studentId,
            academicYear,
            semester: gradeData.semester,
            scoreOral: gradeData.scoreOral ?? null,
            scoreOral_source: gradeData.scoreOral_source ?? null,
            scoreOral_updated_at: gradeData.scoreOral_updated_at ?? null,
            score15m: gradeData.score15m ?? null,
            score15m_source: gradeData.score15m_source ?? null,
            score15m_updated_at: gradeData.score15m_updated_at ?? null,
            score1Period: gradeData.score1Period ?? null,
            score1Period_source: gradeData.score1Period_source ?? null,
            score1Period_updated_at: gradeData.score1Period_updated_at ?? null,
            scoreMidterm: gradeData.scoreMidterm ?? null,
            scoreMidterm_source: gradeData.scoreMidterm_source ?? null,
            scoreMidterm_updated_at: gradeData.scoreMidterm_updated_at ?? null,
            scoreFinal: gradeData.scoreFinal ?? null,
            scoreFinal_source: gradeData.scoreFinal_source ?? null,
            scoreFinal_updated_at: gradeData.scoreFinal_updated_at ?? null,
            scoreDaoDuc: gradeData.scoreDaoDuc ?? null,
            comments: gradeData.comments || '',
          }
        }
        if (!skipSync) {
          syncService.syncUpsertGrade(stripGradeMeta(grade as unknown as Record<string, unknown>))
          void triggerSyncFlow()
        }
        return existingIndex >= 0
          ? { grades: [...state.grades].map((g, i) => i === existingIndex ? grade : g) }
          : { grades: [...state.grades, grade] }
      }),

      batchSaveGrades: (gradesList, skipSync) => set((state) => {
        const gradeMap = new Map<string, { grade: GradeRecord; index: number }>()
        const updated = [...state.grades]
        for (let i = 0; i < updated.length; i++) {
          gradeMap.set(gradeNaturalKey(updated[i]), { grade: updated[i], index: i })
        }

        const batch: Record<string, unknown>[] = []
        for (const gradeData of gradesList) {
          const academicYear = gradeData.academicYear || getCurrentAcademicYear()
          const key = gradeNaturalKey({ studentId: gradeData.studentId, semester: gradeData.semester, academicYear })
          const match = gradeMap.get(key)

          let grade: GradeRecord
          if (match) {
            const existing = match.grade
            grade = { ...existing, ...gradeData }
            // ADR-018 (import/export audit #7): Re-import KHÔNG được ghi đè source
            // 'manual' của field đã được chỉnh tay. Trước đây spread gradeData (chứa
            // _source: 'excel_import') đè lên _source: 'manual' → server
            // persistManualOverrides chỉ ghi grade_overrides khi _source === 'manual'
            // nên audit trail override bị mất sau re-import.
            for (const f of SCORE_FIELDS) {
              const sourceKey = `${f}_source` as keyof GradeRecord
              if ((existing as any)[sourceKey] === 'manual' && (gradeData as any)[sourceKey] === 'excel_import') {
                ;(grade as any)[sourceKey] = 'manual'
              }
            }
            updated[match.index] = grade
            gradeMap.set(key, { grade, index: match.index })
          } else {
            grade = {
              id: `GR-${Date.now()}-${Math.random().toString(36).substr(2, 10)}`,
              studentId: gradeData.studentId,
              academicYear,
              semester: gradeData.semester,
              scoreOral: gradeData.scoreOral ?? null,
              scoreOral_source: gradeData.scoreOral_source ?? null,
              scoreOral_updated_at: gradeData.scoreOral_updated_at ?? null,
              score15m: gradeData.score15m ?? null,
              score15m_source: gradeData.score15m_source ?? null,
              score15m_updated_at: gradeData.score15m_updated_at ?? null,
              score1Period: gradeData.score1Period ?? null,
              score1Period_source: gradeData.score1Period_source ?? null,
              score1Period_updated_at: gradeData.score1Period_updated_at ?? null,
              scoreMidterm: gradeData.scoreMidterm ?? null,
              scoreMidterm_source: gradeData.scoreMidterm_source ?? null,
              scoreMidterm_updated_at: gradeData.scoreMidterm_updated_at ?? null,
              scoreFinal: gradeData.scoreFinal ?? null,
              scoreFinal_source: gradeData.scoreFinal_source ?? null,
              scoreFinal_updated_at: gradeData.scoreFinal_updated_at ?? null,
              scoreDaoDuc: gradeData.scoreDaoDuc ?? null,
              comments: gradeData.comments || '',
            }
            const newIdx = updated.length
            updated.push(grade)
            gradeMap.set(key, { grade, index: newIdx })
          }
          batch.push(stripGradeMeta(grade as unknown as Record<string, unknown>))
        }
        if (!skipSync) {
          syncService.syncBatchUpsertGrades(batch)
          void triggerSyncFlow()
        }
        return { grades: updated }
      }),

      overrideScore: (studentId, semester, scoreField, manualValue, reasonCode, reasonNote, overrides = [], userId = 'system') => {
        const existingGrade = get().getStudentGrade(studentId, semester) || {
          id: `GR-${Date.now()}-${Math.random().toString(36).substr(2, 10)}`,
          studentId,
          academicYear: getCurrentAcademicYear(),
          semester,
          scoreOral: null,
          scoreOral_source: null,
          scoreOral_updated_at: null,
          score15m: null,
          score15m_source: null,
          score15m_updated_at: null,
          score1Period: null,
          score1Period_source: null,
          score1Period_updated_at: null,
          scoreMidterm: null,
          scoreMidterm_source: null,
          scoreMidterm_updated_at: null,
          scoreFinal: null,
          scoreFinal_source: null,
          scoreFinal_updated_at: null,
          scoreDaoDuc: null,
          version: 1,
          updatedAt: new Date().toISOString(),
        }

        const { override, updatedGrade } = gradeAggregateAdapter.overrideScore(
          existingGrade,
          overrides,
          scoreField,
          manualValue,
          reasonCode,
          reasonNote,
          userId
        )

        get().upsertGrade(updatedGrade)
        return override
      },

      restoreScore: (studentId, semester, scoreField, overrides = [], userId = 'system') => {
        const existingGrade = get().getStudentGrade(studentId, semester)
        if (!existingGrade) return null

        const { restoredOverride, updatedGrade } = gradeAggregateAdapter.restoreScore(
          existingGrade,
          overrides,
          scoreField,
          userId
        )

        if (restoredOverride) {
          get().upsertGrade(updatedGrade)
        }
        return { restoredOverride, updatedGrade }
      },

      getStudentGrade: (studentId, semester, academicYear?) => {
        const activeAY = useAcademicYearStore.getState().currentYear
        const year = academicYear || activeAY || getCurrentAcademicYear()
        const normYear = normalizeAcademicYear(year)
        return get().grades.find(
          g => g.studentId === studentId && g.semester === semester && (
            g.academicYear === year ||
            normalizeAcademicYear(g.academicYear) === normYear
          )
        )
      },

      calculateStudentAvg: (studentId, semester, academicYear?) => {
        const activeAY = useAcademicYearStore.getState().currentYear
        const year = academicYear || activeAY || getCurrentAcademicYear()
        const grade = get().getStudentGrade(studentId, semester, year)
        // ADR-017 (F3): Dùng trọng số giáo xứ (settings) — trước đây hardcode
        // DEFAULT_GRADE_WEIGHTS khiến GPA lệch với DesktopGradeMatrix.
        const weights = useSettingsStore.getState().settings.gradeWeights
        return calculateGradeAverage(grade ?? null, weights)
      },
    }),
    {
      name: 'parish_store_grades',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)

export { calculateGradeAverage, calculateAttendanceRate }
