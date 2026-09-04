import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import type { DailyGradeEntry, DailyScoreType, DailyLedgerEntry, GradeRecord } from '../types'
import { useGradeStore, getCurrentAcademicYear } from './gradeStore'
import { normalizeAcademicYear } from '../utils/grades'
import { useAcademicYearStore } from './academicYearStore'
import { api } from '../lib/api'
import { syncUpsertDailyEntry, syncDeleteDailyEntry } from '../lib/syncService'

function getActiveAcademicYear(): string {
  const storeYear = useAcademicYearStore.getState().currentYear
  if (storeYear && storeYear.trim() !== '') {
    return storeYear
  }
  return getCurrentAcademicYear()
}

// startYear calculated dynamically in getActiveAcademicYear or hooks if needed

interface DailyGradeState {
  entries: DailyGradeEntry[]
  setEntries: (entries: DailyGradeEntry[]) => void
  addEntry: (studentId: string, scoreType: DailyScoreType, value: number, semester: 1 | 2, date?: string) => void
  removeEntry: (id: string) => void
  getEntriesForStudent: (studentId: string, semester: 1 | 2, scoreType?: DailyScoreType) => DailyGradeEntry[]
  getAverageForStudent: (studentId: string, semester: 1 | 2, scoreType: DailyScoreType) => number | null
  syncAllToGradeStore: (studentIds?: string[], semester?: 1 | 2, opts?: SyncProjectionOpts) => void
  /** Tier 2: attempts server (tay đã sync + máy) cho UI read-only — pull theo lớp. */
  serverEntries: DailyLedgerEntry[]
  fetchDailyEntries: (params: { classId?: string; studentId?: string; semester?: number; academicYear?: string; scoreType?: string }) => Promise<void>
  getMachineEntries: (studentId: string, semester: 1 | 2, scoreType?: DailyScoreType) => DailyLedgerEntry[]
}

/**
 * Tier 1 containment (daily là điểm chính thức — quyết định sản phẩm 2026-09):
 * projection local → GradeRecord KHÔNG được đè giá trị authoritative của server
 * bằng tập partial của 1 device rồi push ngược lên.
 * - `scoreTypes`: chỉ project (cột điểm user vừa tác động (add/remove gọi với
 *   đúng 1 type). Không scope (fetch/display) → mọi cột.
 * - `skipSync`: đường pull/display (fetchGrades) chỉ tính lại hiển thị, KHÔNG
 *   null-out giá trị server và KHÔNG enqueue. Đường user-intent (add/remove)
 *   giữ nguyên push để điểm daily chính thức lên server.
 */
interface SyncProjectionOpts {
  scoreTypes?: DailyScoreType[]
  skipSync?: boolean
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}



export const useDailyGradeStore = create<DailyGradeState>()(
  persist(
    (set, get) => ({
      entries: [],
      serverEntries: [],
      setEntries: (entries) => set({ entries }),

      addEntry: (studentId, scoreType, value, semester, date) => {
        const entry: DailyGradeEntry = {
          id: `DG-${Date.now()}-${Math.random().toString(36).substr(2, 10)}`,
          studentId,
          academicYear: getActiveAcademicYear(),
          semester,
          scoreType,
          value: Math.min(10, Math.max(0, value)),
          date: date || toDateString(new Date()),
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ entries: [...state.entries, entry] }))
        // Tier 2: enqueue ledger-row TRƯỚC grade-projection (Dexie giữ thứ tự
        // gọi → server áp entry trước grade cùng chu kỳ; finalize sau đó thấy
        // sổ đầy đủ, không dựng baseline trùng).
        void syncUpsertDailyEntry({
          id: entry.id,
          studentId,
          academicYear: entry.academicYear,
          semester,
          scoreType,
          value: entry.value,
          date: entry.date,
        }).catch(err => console.warn('[dailyGradeStore] enqueue entry failed:', err))
        get().syncAllToGradeStore([studentId], semester, { scoreTypes: [scoreType] })
      },

      removeEntry: (id) => {
        const entry = get().entries.find(e => e.id === id)
        if (entry) {
          set((state) => ({
            entries: state.entries.filter(e => e.id !== id),
          }))
          // Tier 2: xóa ledger-row server (chỉ dòng tay) + projection local.
          // Add-then-remove khi offline được compact hủy cả cặp (không trace server).
          void syncDeleteDailyEntry(entry.id).catch(err => console.warn('[dailyGradeStore] enqueue entry delete failed:', err))
          get().syncAllToGradeStore([entry.studentId], entry.semester, { scoreTypes: [entry.scoreType] })
        }
      },

      getEntriesForStudent: (studentId, semester, scoreType) => {
        const { entries } = get()
        const currentAYNorm = normalizeAcademicYear(getActiveAcademicYear())
        const fallbackAYNorm = normalizeAcademicYear(getCurrentAcademicYear())
        return entries.filter(e => {
          const entryAYNorm = normalizeAcademicYear(e.academicYear)
          const matchesAY = !entryAYNorm || entryAYNorm === currentAYNorm || entryAYNorm === fallbackAYNorm
          return (
            e.studentId === studentId &&
            e.semester === semester &&
            matchesAY &&
            (!scoreType || e.scoreType === scoreType)
          )
        })
      },

      getAverageForStudent: (studentId, semester, scoreType) => {
        const entries = get().getEntriesForStudent(studentId, semester, scoreType)
        if (entries.length === 0) return null
        const sum = entries.reduce((acc, e) => acc + e.value, 0)
        return Math.round((sum / entries.length) * 10) / 10
      },

      fetchDailyEntries: async (params) => {
        try {
          const rows = await api.getDailyEntries(params)
          if (!Array.isArray(rows)) return
          const validTypes = new Set(['oral', '15m', '1period'])
          set({
            serverEntries: rows
              .filter(r => r && typeof r.id === 'string' && validTypes.has(String(r.scoreType)))
              .map(r => ({
                id: r.id,
                studentId: r.studentId,
                academicYear: r.academicYear,
                semester: (r.semester === 2 ? 2 : 1) as 1 | 2,
                scoreType: r.scoreType as DailyScoreType,
                value: Number(r.value),
                date: r.date,
                origin: (r.origin === 'machine' ? 'machine' : 'manual') as DailyLedgerEntry['origin'],
                examSessionId: r.examSessionId,
              })),
          })
        } catch {
          // Offline/không quyền: giữ entries local, UI vẫn đầy đủ phần tay.
        }
      },

      getMachineEntries: (studentId, semester, scoreType) => {
        return get().serverEntries.filter(e =>
          e.origin === 'machine' &&
          e.studentId === studentId &&
          e.semester === semester &&
          (!scoreType || e.scoreType === scoreType),
        )
      },

      syncAllToGradeStore: (studentIds, semester, opts) => {
        const currentAY = getActiveAcademicYear()
        const currentAYNorm = normalizeAcademicYear(currentAY)
        const fallbackAYNorm = normalizeAcademicYear(getCurrentAcademicYear())
        const skipSync = opts?.skipSync ?? false
        const scopedTypes = opts?.scoreTypes
        const allEntries = get().entries.filter(e => {
          const entryAYNorm = normalizeAcademicYear(e.academicYear)
          return !entryAYNorm || entryAYNorm === currentAYNorm || entryAYNorm === fallbackAYNorm
        })
        const uniqueKeys = new Set<string>()

        allEntries.forEach(e => {
          if (studentIds && !studentIds.includes(e.studentId)) return
          if (semester && e.semester !== semester) return
          uniqueKeys.add(`${e.studentId}_${e.semester}`)
        })

        if (studentIds && studentIds.length > 0) {
          studentIds.forEach(sid => {
            if (semester) {
              uniqueKeys.add(`${sid}_${semester}`)
            } else {
              uniqueKeys.add(`${sid}_1`)
              uniqueKeys.add(`${sid}_2`)
            }
          })
        }

        uniqueKeys.forEach(key => {
          const [sid, sem] = key.split('_')
          const s = Number(sem) as 1 | 2
          // now and scoreFields handled by typeMap and upsertGrade logic

          const update: Record<string, any> = {
            studentId: sid,
            semester: s,
            academicYear: currentAY,
          }

          const now = new Date().toISOString()
          const typeMap: Record<DailyScoreType, string> = {
            oral: 'scoreOral',
            '15m': 'score15m',
            '1period': 'score1Period',
          }

          const existingGrade = useGradeStore.getState().grades.find(
            g => g.studentId === sid && g.semester === s && (
              !g.academicYear ||
              normalizeAcademicYear(g.academicYear) === currentAYNorm ||
              normalizeAcademicYear(g.academicYear) === fallbackAYNorm
            )
          )

          for (const [scoreType, fieldName] of Object.entries(typeMap)) {
            // Field scoping: đường user-intent chỉ chạm đúng cột vừa tác động,
            // tránh đè collateral các cột khác bằng tập partial local.
            if (scopedTypes && !scopedTypes.includes(scoreType as DailyScoreType)) continue
            const avg = get().getAverageForStudent(sid, s, scoreType as DailyScoreType)
            const sourceField = `${fieldName}_source`
            const currentSource = (existingGrade as any)?.[sourceField]

            if (currentSource === 'manual' || currentSource === 'override') {
              continue
            }

            if (avg !== null) {
              update[fieldName] = avg
              update[sourceField] = 'daily_avg'
              update[`${fieldName}_updated_at`] = now
            } else if (!skipSync && currentSource === 'daily_avg') {
              // Null-out chỉ ở đường user-intent (xóa hết attempts của cột):
              // đường pull/display (skipSync) KHÔNG được xóa giá trị
              // authoritative của server khi device này không có entry.
              update[fieldName] = null
              update[sourceField] = null
              update[`${fieldName}_updated_at`] = null
            }
          }

          // update luôn mang sẵn 3 keys identity (studentId/semester/academicYear):
          // chỉ upsert khi có ít nhất 1 field điểm thật sự (> 3), tránh tạo
          // grade row rỗng + enqueue sync rác (vd field bị guard manual/override).
          if (Object.keys(update).length > 3) {
            useGradeStore.getState().upsertGrade(update as Partial<GradeRecord> & { studentId: string; semester: 1 | 2 }, skipSync)
          }
        })
      },
    }),
    {
      name: 'parish_store_daily_grades',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)
