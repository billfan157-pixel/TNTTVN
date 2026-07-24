import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import type { Student, BranchType } from '../types'
import { MOCK_STUDENTS } from '../data/mockParishData'
import { syncCreateStudent, syncUpdateStudent, syncDeleteStudent } from '../lib/syncService'
import { api } from '../lib/api'

export interface PromotionAction {
  studentId: string
  newBranch: string
  newClassId: string
}

interface StudentState {
  students: Student[]
  isLoading: boolean
  error: string | null

  fetchStudents: () => Promise<void>
  setStudents: (students: Student[]) => void
  addStudent: (student: Omit<Student, 'id' | 'code'>) => Promise<void>
  updateStudent: (id: string, changes: Partial<Omit<Student, 'id' | 'code'>>) => Promise<void>
  deleteStudent: (id: string) => Promise<void>
  batchPromote: (promotions: PromotionAction[]) => void
}

export const useStudentStore = create<StudentState>()(
  persist(
    (set) => ({
      students: MOCK_STUDENTS,
      isLoading: false,
      error: null,

      fetchStudents: async () => {
        set({ isLoading: true, error: null })
        try {
          const remote = await api.getStudents()
          if (remote && Array.isArray(remote)) {
            set({ students: remote as Student[], isLoading: false })
            return
          }
        } catch {
          // Fallback to local Dexie or initial mock
        }
        set({ isLoading: false })
      },

      setStudents: (students) => set({ students }),

      addStudent: async (data) => {
        const id = `ST-${Date.now()}`
        const code = `TN2025${Math.floor(100 + Math.random() * 900)}`
        const newStudent: Student = { ...data, id, code }

        set((state) => ({ students: [newStudent, ...state.students] }))
        await syncCreateStudent(newStudent)
      },

      updateStudent: async (id, changes) => {
        set((state) => ({
          students: state.students.map((s) => (s.id === id ? { ...s, ...changes } : s)),
        }))
        await syncUpdateStudent(id, changes)
      },

      deleteStudent: async (id) => {
        set((state) => ({
          students: state.students.filter((s) => s.id !== id),
        }))
        await syncDeleteStudent(id)
      },

      batchPromote: (promotions) =>
        set((state) => {
          const next: Student[] = state.students.map((s) => {
            const p = promotions.find((pr) => pr.studentId === s.id)
            if (!p) return s
            return {
              ...s,
              branch: p.newBranch as BranchType,
              classId: p.newClassId,
              status: 'Đang học' as const,
            }
          })
          return { students: next }
        }),
    }),
    {
      name: 'parish_store_students',
      storage: createJSONStorage(() => dexieStorage),
      partialize: (state) => ({ students: state.students }),
    }
  )
)
