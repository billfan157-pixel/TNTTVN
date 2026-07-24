import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { MOCK_GRADES } from '../data/mockParishData'
import { dexieStorage } from '../lib/db'
import type { GradeRecord } from '../types'
import { calculateGradeAverage, calculateAttendanceRate } from '../utils/grades'
import * as syncService from '../lib/syncService'

/** Năm học tự động tính theo ngày hiện tại (năm học bắt đầu từ tháng 8) */
const now = new Date()
const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
export const CURRENT_ACADEMIC_YEAR = `${startYear} - ${startYear + 1}`

interface GradeState {
  grades: GradeRecord[]
  setGrades: (grades: GradeRecord[]) => void
  upsertGrade: (gradeData: Partial<GradeRecord> & { studentId: string; semester: 1 | 2 }) => void
  batchSaveGrades: (gradesList: (Partial<GradeRecord> & { studentId: string; semester: 1 | 2 })[]) => void
  getStudentGrade: (studentId: string, semester: 1 | 2, academicYear?: string) => GradeRecord | undefined
  calculateStudentAvg: (studentId: string, semester: 1 | 2, academicYear?: string) => { score: number | null; label: string }
}

export const useGradeStore = create<GradeState>()(
  persist(
    (set, get) => ({
      grades: MOCK_GRADES,
      setGrades: (grades) => set({ grades }),

      upsertGrade: (gradeData) => set((state) => {
        const academicYear = gradeData.academicYear || CURRENT_ACADEMIC_YEAR
        const existingIndex = state.grades.findIndex(
          g => g.studentId === gradeData.studentId && g.semester === gradeData.semester && g.academicYear === academicYear
        )
        let grade: GradeRecord
        if (existingIndex >= 0) {
          const updated = [...state.grades]
          grade = { ...updated[existingIndex], ...gradeData }
          updated[existingIndex] = grade
        } else {
          grade = {
            id: `GR-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            studentId: gradeData.studentId,
            academicYear,
            semester: gradeData.semester,
            scoreOral: gradeData.scoreOral ?? null,
            score15m: gradeData.score15m ?? null,
            score1Period: gradeData.score1Period ?? null,
            scoreMidterm: gradeData.scoreMidterm ?? null,
            scoreFinal: gradeData.scoreFinal ?? null,
            comments: gradeData.comments || '',
          }
        }
        syncService.syncUpsertGrade(grade as unknown as Record<string, unknown>)
        return existingIndex >= 0
          ? { grades: [...state.grades].map((g, i) => i === existingIndex ? grade : g) }
          : { grades: [...state.grades, grade] }
      }),

      batchSaveGrades: (gradesList) => set((state) => {
        const updated = [...state.grades]
        const batch: Record<string, unknown>[] = []
        for (const gradeData of gradesList) {
          const academicYear = gradeData.academicYear || CURRENT_ACADEMIC_YEAR
          const existingIndex = updated.findIndex(
            g => g.studentId === gradeData.studentId && g.semester === gradeData.semester && g.academicYear === academicYear
          )
          let grade: GradeRecord
          if (existingIndex >= 0) {
            grade = { ...updated[existingIndex], ...gradeData }
            updated[existingIndex] = grade
          } else {
            grade = {
              id: `GR-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              studentId: gradeData.studentId,
              academicYear,
              semester: gradeData.semester,
              scoreOral: gradeData.scoreOral ?? null,
              score15m: gradeData.score15m ?? null,
              score1Period: gradeData.score1Period ?? null,
              scoreMidterm: gradeData.scoreMidterm ?? null,
              scoreFinal: gradeData.scoreFinal ?? null,
              comments: gradeData.comments || '',
            }
            updated.push(grade)
          }
          batch.push(grade as unknown as Record<string, unknown>)
        }
        syncService.syncBatchUpsertGrades(batch)
        return { grades: updated }
      }),

      getStudentGrade: (studentId, semester, academicYear = CURRENT_ACADEMIC_YEAR) => {
        return get().grades.find(
          g => g.studentId === studentId && g.semester === semester && g.academicYear === academicYear
        )
      },

      calculateStudentAvg: (studentId, semester, academicYear = CURRENT_ACADEMIC_YEAR) => {
        const grade = get().getStudentGrade(studentId, semester, academicYear)
        return calculateGradeAverage(grade ?? null)
      },
    }),
    {
      name: 'parish_store_grades',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)

export { calculateGradeAverage, calculateAttendanceRate }
