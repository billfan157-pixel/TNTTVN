import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { MOCK_STUDENTS } from '../data/mockParishData'
import type { Student } from '../types'
import { dexieStorage } from '../lib/db'
import { api } from '../lib/api'
import * as syncService from '../lib/syncService'
import * as Sentry from '@sentry/react'

interface StudentState {
  students: Student[]
  setStudents: (students: Student[]) => void
  fetchStudents: () => Promise<void>
  addStudent: (student: Omit<Student, 'id' | 'code'>) => void
  updateStudent: (id: string, data: Partial<Student>) => void
  deleteStudent: (id: string) => void
}

export const useStudentStore = create<StudentState>()(
  persist(
    (set) => ({
      students: MOCK_STUDENTS,
      setStudents: (students) => set({ students }),

      fetchStudents: async () => {
        try {
          const fetched = await api.getStudents()
          if (Array.isArray(fetched) && fetched.length > 0) {
            set({ students: fetched })
          }
        } catch (err) {
          Sentry.captureException(err)
        }
      },

      addStudent: (studentData) => set((state) => {
        const newId = `ST-${crypto.randomUUID().slice(0, 8)}`
        const newCode = `TN2025${Math.floor(100 + Math.random() * 900)}`
        const student = { ...studentData, id: newId, code: newCode }
        syncService.syncCreateStudent(student as Record<string, unknown>)
        return {
          students: [student, ...state.students],
        }
      }),

      updateStudent: (id, studentData) => set((state) => {
        syncService.syncUpdateStudent(id, studentData as Record<string, unknown>)
        return {
          students: state.students.map(s => s.id === id ? { ...s, ...studentData } : s),
        }
      }),

      deleteStudent: (id) => set((state) => {
        syncService.syncDeleteStudent(id)
        return {
          students: state.students.filter(s => s.id !== id),
        }
      }),
    }),
    {
      name: 'parish_store_students',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)
