import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import type { DailyGradeEntry, ScoreType, GradeRecord } from '../types'
import { useGradeStore, CURRENT_ACADEMIC_YEAR } from './gradeStore'

const now = new Date()
const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1

interface DailyGradeState {
  entries: DailyGradeEntry[]
  setEntries: (entries: DailyGradeEntry[]) => void
  addEntry: (studentId: string, scoreType: ScoreType, value: number, semester: 1 | 2, date?: string) => void
  removeEntry: (id: string) => void
  getEntriesForStudent: (studentId: string, semester: 1 | 2, scoreType?: ScoreType) => DailyGradeEntry[]
  getAverageForStudent: (studentId: string, semester: 1 | 2, scoreType: ScoreType) => number | null
  syncAllToGradeStore: (studentIds?: string[], semester?: 1 | 2) => void
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const SCORE_FIELD_MAP: Record<ScoreType, keyof GradeRecord> = {
  oral: 'scoreOral',
  '15m': 'score15m',
  '1period': 'score1Period',
  midterm: 'scoreMidterm',
  final: 'scoreFinal',
}

export const useDailyGradeStore = create<DailyGradeState>()(
  persist(
    (set, get) => ({
      entries: [],
      setEntries: (entries) => set({ entries }),

      addEntry: (studentId, scoreType, value, semester, date) => {
        const entry: DailyGradeEntry = {
          id: `DG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          studentId,
          academicYear: CURRENT_ACADEMIC_YEAR,
          semester,
          scoreType,
          value: Math.min(10, Math.max(0, value)),
          date: date || toDateString(new Date()),
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ entries: [...state.entries, entry] }))
      },

      removeEntry: (id) => set((state) => ({
        entries: state.entries.filter(e => e.id !== id),
      })),

      getEntriesForStudent: (studentId, semester, scoreType) => {
        const { entries } = get()
        return entries.filter(e =>
          e.studentId === studentId &&
          e.semester === semester &&
          e.academicYear === CURRENT_ACADEMIC_YEAR &&
          (!scoreType || e.scoreType === scoreType)
        )
      },

      getAverageForStudent: (studentId, semester, scoreType) => {
        const entries = get().getEntriesForStudent(studentId, semester, scoreType)
        if (entries.length === 0) return null
        const sum = entries.reduce((acc, e) => acc + e.value, 0)
        return Math.round((sum / entries.length) * 10) / 10
      },

      syncAllToGradeStore: (studentIds, semester) => {
        const allEntries = get().entries.filter(e => e.academicYear === CURRENT_ACADEMIC_YEAR)
        const uniqueKeys = new Set<string>()

        allEntries.forEach(e => {
          if (studentIds && !studentIds.includes(e.studentId)) return
          if (semester && e.semester !== semester) return
          uniqueKeys.add(`${e.studentId}_${e.semester}`)
        })

        uniqueKeys.forEach(key => {
          const [sid, sem] = key.split('_')
          const s = Number(sem) as 1 | 2
          const avgOral = get().getAverageForStudent(sid, s, 'oral')
          const avg15m = get().getAverageForStudent(sid, s, '15m')
          const avg1Period = get().getAverageForStudent(sid, s, '1period')
          const avgMidterm = get().getAverageForStudent(sid, s, 'midterm')
          const avgFinal = get().getAverageForStudent(sid, s, 'final')

          const update: Partial<GradeRecord> & { studentId: string; semester: 1 | 2 } = {
            studentId: sid,
            semester: s,
            scoreOral: avgOral,
            score15m: avg15m,
            score1Period: avg1Period,
            scoreMidterm: avgMidterm,
            scoreFinal: avgFinal,
          }
          useGradeStore.getState().upsertGrade(update)
        })
      },
    }),
    {
      name: 'parish_store_daily_grades',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)
