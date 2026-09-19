import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { getDB } from '../lib/db'
import { academicCacheStorage, beginAcademicPull, flushAcademicCache, mergeAcademicPull } from '../lib/academicPull'
import type { GradeRecord } from '../types'
import { calculateGradeAverage, calculateAttendanceRate, matchAcademicYear } from '../utils/grades'
import { getCurrentAcademicYear, normalizeAcademicYear } from '../utils/academicYear'
import * as syncService from '../lib/syncService'
import { api, isAuthenticated } from '../lib/api'
import * as Sentry from '@sentry/react'
import { useAcademicYearStore } from './academicYearStore'
import { useSettingsStore } from './settingsStore'
import { decryptQueueValue } from '../lib/offlineCipher'
import { isOwnOp } from './syncStore'
import { requestSync } from '../lib/syncTrigger'

const SCORE_FIELDS = ['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc'] as const

// Store only signals a framework-neutral trigger registered by the root hook.
async function triggerSyncFlow() {
  try {
    await requestSync()
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
 * bằng dữ liệu server cũ hơn khi pull incremental. OFF-TENANT-1: chỉ tính ops
 * đúng scope phiên hiện tại, op xứ khác không được che merge xứ này.
 */
async function getPendingGradeNaturalKeys(): Promise<Set<string>> {
  try {
    const db = getDB()
    const pending = await db.syncQueue.where('status').anyOf(['pending', 'retrying']).toArray()
    const keys = new Set<string>()
    for (const item of pending) {
      if (!isOwnOp(item)) continue
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

/** Callers supply edited fields, never a cached row. Do not diff against the
 * optimistic cache: a failed durable enqueue leaves that same draft visible. */
function gradeMutation(input: Partial<GradeRecord>, result: GradeRecord, previous?: GradeRecord): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    id: result.id, studentId: result.studentId, semester: result.semester,
    academicYear: result.academicYear, version: previous?.version,
    _syncGradePatch: true,
  }
  const fields = [...SCORE_FIELDS, 'comments'] as const
  for (const field of fields) {
    if (input[field] === undefined) continue
    const source = `${field}_source` as keyof GradeRecord
    patch[field] = result[field]
    const sourceValue = result[source] !== undefined ? result[source] : input[source]
    if (field !== 'comments' && sourceValue !== undefined) patch[source] = sourceValue
  }
  return stripGradeMeta(patch)
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

interface GradeState {
  syncScopeRevision: string | null
  grades: GradeRecord[]
  error: string | null
  setGrades: (grades: GradeRecord[]) => void
  fetchGrades: (updatedAfter?: string, throwOnError?: boolean) => Promise<void>
  upsertGrade: (gradeData: Partial<GradeRecord> & { studentId: string; semester: 1 | 2 }, skipSync?: boolean) => Promise<void>
  batchSaveGrades: (gradesList: (Partial<GradeRecord> & { studentId: string; semester: 1 | 2 })[], skipSync?: boolean) => Promise<void>
  getStudentGrade: (studentId: string, semester: 1 | 2, academicYear?: string) => GradeRecord | undefined
  calculateStudentAvg: (studentId: string, semester: 1 | 2, academicYear?: string) => { score: number | null; label: string }
}

export const useGradeStore = create<GradeState>()(
  persist(
    (set, get) => ({
      grades: [],
      syncScopeRevision: null,
      error: null,
      setGrades: (grades) => set({ grades }),

      fetchGrades: async (updatedAfter?: string, throwOnError?: boolean) => {
        if (!isAuthenticated()) return
        const pull = beginAcademicPull('grade')
        try {
          const revision = get().syncScopeRevision
          const fetched = await api.pullGrades(updatedAfter, revision)
          const pendingKeys = await getPendingGradeNaturalKeys()
          pull.assertCurrent()
          const merged = mergeAcademicPull(fetched, get().grades, pendingKeys, gradeNaturalKey, revision)
          set({ grades: merged.rows, syncScopeRevision: merged.revision, error: null })
          await flushAcademicCache('parish_store_grades')
          pull.assertCurrent()
        } catch (err) {
          Sentry.captureException(err)
          if (pull.current()) set({ error: (err as Error)?.message || 'Lỗi tải điểm số' })
          if (throwOnError) throw err
        }
      },

      upsertGrade: async (gradeData, skipSync) => {
        let grade!: GradeRecord
        let previous: GradeRecord | undefined
        set((state) => {
          const academicYear = gradeData.academicYear || getCurrentAcademicYear()
          const existingIndex = state.grades.findIndex(
            g => g.studentId === gradeData.studentId && g.semester === gradeData.semester && matchAcademicYear(g.academicYear, academicYear)
          )
          if (existingIndex >= 0) {
            previous = state.grades[existingIndex]
            grade = { ...state.grades[existingIndex], ...gradeData }
            return { grades: state.grades.map((g, i) => i === existingIndex ? grade : g), error: null }
          }
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
          return { grades: [...state.grades, grade], error: null }
        })

        if (skipSync) return
        try {
          await syncService.syncUpsertGrade(gradeMutation(gradeData, grade, previous))
          void triggerSyncFlow()
        } catch (err) {
          Sentry.captureException(err)
          // ADR-109: reject the acknowledgement but keep the local draft — the UI draft
          // stays the owner until an encrypted Dexie queue transaction commits.
          set({ error: 'Không thể lưu điểm trên thiết bị. Thay đổi vẫn cần được thử lại.' })
          throw err
        }
      },

      batchSaveGrades: async (gradesList, skipSync) => {
        const batch: Record<string, unknown>[] = []
        set((state) => {
          const gradeMap = new Map<string, { grade: GradeRecord; index: number }>()
          const updated = [...state.grades]
          for (let i = 0; i < updated.length; i++) {
            gradeMap.set(gradeNaturalKey(updated[i]), { grade: updated[i], index: i })
          }

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
          batch.push(gradeMutation(gradeData, grade, match?.grade))
          }
          return { grades: updated, error: null }
        })

        if (skipSync) return
        try {
          await syncService.syncBatchUpsertGrades(batch)
          void triggerSyncFlow()
        } catch (err) {
          Sentry.captureException(err)
          // ADR-109: same contract as upsertGrade — reject, but keep every local draft row.
          set({ error: 'Không thể lưu bảng điểm trên thiết bị. Các dòng thay đổi vẫn cần được thử lại.' })
          throw err
        }
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
      // Retire pre-D9 read snapshots; durable mutation ownership lives in syncQueue.
      version: 2,
      migrate: () => ({ grades: [], syncScopeRevision: null }),
      storage: createJSONStorage(() => academicCacheStorage),
    }
  )
)

export { calculateGradeAverage, calculateAttendanceRate }
