import React from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import type { Student, BranchType } from '../types'

import { syncCreateStudent, syncUpdateStudent, syncDeleteStudent } from '../lib/syncService'
import { runSyncFlow } from '../hooks/useSyncEngine'
import { api, isAuthenticated } from '../lib/api'

export interface PromotionAction {
  studentId: string
  newBranch: string
  newClassId: string
}

interface StudentState {
  students: Student[]
  isLoading: boolean
  error: string | null
  pagination: { total: number; page: number; limit: number }

  fetchStudents: (params?: { updatedAfter?: string; limit?: number; page?: number }) => Promise<void>
  setStudents: (students: Student[]) => void
  addStudent: (student: Omit<Student, 'id' | 'code'>) => Promise<void>
  replaceStudentId: (oldId: string, serverStudent: Student) => void
  updateStudent: (id: string, changes: Partial<Omit<Student, 'id' | 'code'>>) => Promise<void>
  deleteStudent: (id: string) => Promise<void>
  deleteStudents: (ids: string[]) => Promise<void>
  batchPromote: (promotions: PromotionAction[]) => Promise<void>
  applyLocalPromotions: (promotions: PromotionAction[]) => void
  setPagination: (pagination: Partial<StudentState['pagination']>) => void
}

const activeSubmissions = new Set<string>()

export const useStudentStore = create<StudentState>()(
  persist(
    (set, _get) => ({
      students: [],
      isLoading: false,
      error: null,
      pagination: { total: 0, page: 1, limit: 50 },

      fetchStudents: async (params) => {
        const { updatedAfter, page, limit } = params || {}
        const safeLimit = limit || 10000
        const safePage = page || 1
        if (!isAuthenticated()) return
        set({ isLoading: true, error: null })
        try {
          const remote = await api.getStudents({ updatedAfter, page: safePage, limit: safeLimit })
          const data = Array.isArray(remote?.data) ? remote.data : []
          const total = typeof remote?.total === 'number' ? remote.total : data.length
          if (safePage > 1) {
            set((state) => {
              const base = state.students
              const merged = new Map(base.map(s => [s.id, s]))
              for (const s of data) {
                merged.set(s.id, s)
              }
              return { students: Array.from(merged.values()), isLoading: false, pagination: { total, page: safePage, limit: safeLimit } }
            })
          } else if (updatedAfter) {
            set((state) => {
              const merged = new Map(state.students.map(s => [s.id, s]))
              // ADR-016 (S13): Remove locally-cached students that have been
              // soft-deleted on the server during incremental fetch. The server
              // returns deleted students with `deletedAt` set — we must purge
              // them from local state to prevent ghost records and 404s on
              // subsequent sync ops targeting them.
              for (const s of data) {
                if (s.deletedAt) {
                  merged.delete(s.id)
                } else {
                  merged.set(s.id, s)
                }
              }
              return { students: Array.from(merged.values()), isLoading: false }
            })
          } else {
            // A successful full fetch is authoritative, including an empty result.
            // Cache fallback is handled only by the offline/error path; retaining a
            // previous snapshot here can expose another parish after a scope switch.
            set({ students: data, isLoading: false, pagination: { total, page: safePage, limit: safeLimit } })
          }
          return
        } catch (err) {
          set({ isLoading: false, error: (err as Error)?.message || 'Lỗi tải danh sách học sinh' })
        }
      },

      setStudents: (students) => set({ students }),

      addStudent: async (data) => {
        const submissionKey = `${data.fullName}_${data.dateOfBirth}_${data.classId}`
        if (activeSubmissions.has(submissionKey)) {
          console.warn('[studentStore] Blocked duplicate addStudent call in flight:', submissionKey)
          return
        }
        activeSubmissions.add(submissionKey)

        try {
          const id = `ST-${Date.now()}-${Math.random().toString(36).substr(2, 10)}`
          const code = `TN${new Date().getFullYear()}${String(Math.floor(100000 + Math.random() * 900000)).slice(0, 6)}`
          const newStudent: Student = { ...data, id, code }

          set((state) => ({ students: [newStudent, ...state.students] }))
          await syncCreateStudent(newStudent)
          runSyncFlow()
        } finally {
          setTimeout(() => activeSubmissions.delete(submissionKey), 1000)
        }
      },

      replaceStudentId: (oldId, serverStudent) =>
        set((state) => ({
          students: state.students.map((s) => (s.id === oldId ? { ...serverStudent } : s)),
        })),

      updateStudent: async (id, changes) => {
        set((state) => ({
          students: state.students.map((s) => (s.id === id ? { ...s, ...changes } : s)),
        }))
        await syncUpdateStudent(id, changes)
        runSyncFlow()
      },

      deleteStudent: async (id) => {
        set((state) => ({
          students: state.students.filter((s) => s.id !== id),
        }))
        await syncDeleteStudent(id)
        runSyncFlow()
      },

      deleteStudents: async (ids) => {
        if (!ids.length) return
        const idSet = new Set(ids)
        set((state) => ({
          students: state.students.filter((s) => !idSet.has(s.id)),
        }))
        for (const id of ids) {
          await syncDeleteStudent(id)
        }
        runSyncFlow()
      },

      batchPromote: async (promotions) => {
        for (const p of promotions) {
          await syncUpdateStudent(p.studentId, {
            branch: p.newBranch as BranchType,
            classId: p.newClassId,
            status: 'Đang học',
          })
        }
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
        })
        runSyncFlow()
      },

      /**
       * F1 (audit 2026-08-21): cập nhật state local sau khi server đã duyệt
       * promotion qua POST /promotion/batch-approve (snapshot + move trong 1 tx).
       * KHÔNG enqueue sync — server là nguồn sự thật, chỉ mirror kết quả.
       */
      applyLocalPromotions: (promotions) => {
        if (!promotions.length) return
        set((state) => ({
          students: state.students.map((s) => {
            const p = promotions.find((pr) => pr.studentId === s.id)
            if (!p) return s
            return {
              ...s,
              branch: p.newBranch as BranchType,
              classId: p.newClassId,
              status: 'Đang học' as const,
            }
          }),
        }))
      },

      setPagination: (patch) =>
        set((state) => {
          const next = { ...state.pagination, ...patch }
          if (state.pagination.page === next.page && state.pagination.limit === next.limit && state.pagination.total === next.total) {
            return state
          }
          return { pagination: next }
        }),
    }),
    {
      name: 'parish_store_students',
      storage: createJSONStorage(() => dexieStorage),
      partialize: (state) => ({ students: state.students, pagination: state.pagination }),
    }
  )
)
