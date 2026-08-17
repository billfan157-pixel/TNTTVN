import React from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import type { DailyGradeEntry, DailyScoreType, GradeRecord } from '../types'
import { useGradeStore, getCurrentAcademicYear } from './gradeStore'
import { normalizeAcademicYear } from '../utils/grades'
import { useAcademicYearStore } from './academicYearStore'

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
  syncAllToGradeStore: (studentIds?: string[], semester?: 1 | 2) => void
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}



export const useDailyGradeStore = create<DailyGradeState>()(
  persist(
    (set, get) => ({
      entries: [],
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
        get().syncAllToGradeStore([studentId], semester)
      },

      removeEntry: (id) => {
        const entry = get().entries.find(e => e.id === id)
        if (entry) {
          set((state) => ({
            entries: state.entries.filter(e => e.id !== id),
          }))
          get().syncAllToGradeStore([entry.studentId], entry.semester)
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

      syncAllToGradeStore: (studentIds, semester) => {
        const currentAY = getActiveAcademicYear()
        const currentAYNorm = normalizeAcademicYear(currentAY)
        const fallbackAYNorm = normalizeAcademicYear(getCurrentAcademicYear())
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
            const avg = get().getAverageForStudent(sid, s, scoreType as DailyScoreType)
            const sourceField = `${fieldName}_source`
            const currentSource = (existingGrade as any)?.[sourceField]

            if (currentSource === 'manual' || currentSource === 'override') {
              continue
            }

            if (avg !== null || currentSource === 'daily_avg') {
              update[fieldName] = avg
              update[sourceField] = avg !== null ? 'daily_avg' : null
              update[`${fieldName}_updated_at`] = avg !== null ? now : null
            }
          }

          if (Object.keys(update).length > 2) {
            useGradeStore.getState().upsertGrade(update as Partial<GradeRecord> & { studentId: string; semester: 1 | 2 })
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
