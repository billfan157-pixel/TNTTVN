import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import type { Student, BranchType } from '../types'

import { syncCreateStudent, syncUpdateStudent, syncDeleteStudent } from '../lib/syncService'
import { requestSync as runSyncFlow } from '../lib/syncTrigger'
import { api, isAuthenticated } from '../lib/api'
import { getTenantScope } from '../lib/tenantScope'

export interface PromotionAction {
  studentId: string
  newBranch: string
  newClassId: string
}

export type StudentUpdateChanges = Partial<Omit<Student, 'id' | 'code'>> & {
  /** Required by the server when class/branch membership actually changes. */
  membershipChangeReason?: string
}

export interface ServerStudentChange {
  action: 'created' | 'updated'
  student: Student
}

interface StudentState {
  students: Student[]
  isLoading: boolean
  error: string | null
  pagination: { total: number; page: number; limit: number }

  fetchStudents: (params?: { updatedAfter?: string; updatedBefore?: string; limit?: number; page?: number; throwOnError?: boolean }) => Promise<void>
  setStudents: (students: Student[]) => void
  discardOptimisticStudent: (id: string) => void
  reconcileImportedStudents: (changes: ServerStudentChange[]) => void
  addStudent: (student: Omit<Student, 'id' | 'code'>) => Promise<void>
  replaceStudentId: (oldId: string, serverStudent: Student) => void
  updateStudent: (id: string, changes: StudentUpdateChanges) => Promise<void>
  deleteStudent: (id: string) => Promise<void>
  deleteStudents: (ids: string[]) => Promise<void>
  applyLocalPromotions: (promotions: PromotionAction[]) => void
  setPagination: (pagination: Partial<StudentState['pagination']>) => void
}

const activeSubmissions = new Set<string>()

export const useStudentStore = create<StudentState>()(
  persist(
    (set, get) => ({
      students: [],
      isLoading: false,
      error: null,
      pagination: { total: 0, page: 1, limit: 50 },

      fetchStudents: async (params) => {
        const { updatedAfter, updatedBefore, page, limit, throwOnError } = params || {}
        const safeLimit = limit || (updatedAfter ? 1000 : 10000)
        const safePage = page || 1
        if (!isAuthenticated()) return
        set({ isLoading: true, error: null })
        try {
          let remote = await api.getStudents({ updatedAfter, updatedBefore, page: safePage, limit: safeLimit })
          let data = Array.isArray(remote?.data) ? remote.data : []
          const total = typeof remote?.total === 'number' ? remote.total : data.length
          // A delta window is bounded by the server watermark, so offset pages
          // remain stable for the duration of this pull. Read every page before
          // returning success; otherwise advancing the cursor could skip rows.
          if (updatedAfter && page === undefined) {
            const pageCount = Math.ceil(total / safeLimit)
            for (let nextPage = 2; nextPage <= pageCount; nextPage++) {
              remote = await api.getStudents({ updatedAfter, updatedBefore, page: nextPage, limit: safeLimit })
              data = data.concat(Array.isArray(remote?.data) ? remote.data : [])
            }
          }
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
          if (throwOnError) throw err
        }
      },

      setStudents: (students) => set({ students }),

      discardOptimisticStudent: (id) => set((state) => {
        if (!state.students.some(student => student.id === id)) return state
        const students = state.students.filter(student => student.id !== id)
        return {
          students,
          pagination: {
            ...state.pagination,
            total: Math.max(students.length, state.pagination.total - 1),
          },
        }
      }),

      reconcileImportedStudents: (changes) => {
        const scope = getTenantScope()
        if (!scope || changes.length === 0) return

        set((state) => {
          const merged = new Map(state.students.map(student => [student.id, student]))
          let createdCount = 0
          let didChange = false

          for (const change of changes) {
            const student = change.student
            // The response is server-authoritative, but the client still fails
            // closed if a stale request resolves after the active tenant changes.
            if (student.parishId !== scope.parishId || student.deletedAt) continue
            if (change.action === 'created' && !merged.has(student.id)) createdCount++
            if (merged.get(student.id) !== student) didChange = true
            merged.set(student.id, student)
          }

          if (!didChange) return state

          return {
            students: Array.from(merged.values()),
            pagination: {
              ...state.pagination,
              total: Math.max(state.pagination.total + createdCount, merged.size),
            },
          }
        })
      },

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
          try {
            await syncCreateStudent(newStudent)
          } catch (error) {
            set((state) => ({ students: state.students.filter(student => student.id !== id) }))
            throw error
          }
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
        const previous = get().students.find(student => student.id === id)
        const { membershipChangeReason: _membershipChangeReason, ...studentChanges } = changes
        set((state) => ({
          students: state.students.map((s) => (s.id === id ? { ...s, ...studentChanges } : s)),
        }))
        try {
          await syncUpdateStudent(id, changes)
        } catch (error) {
          if (previous) {
            set((state) => ({
              students: state.students.map(student => student.id === id ? previous : student),
            }))
          }
          throw error
        }
        runSyncFlow()
      },

      deleteStudent: async (id) => {
        const previousStudents = get().students
        set((state) => ({
          students: state.students.filter((s) => s.id !== id),
        }))
        try {
          await syncDeleteStudent(id)
        } catch (error) {
          set({ students: previousStudents })
          throw error
        }
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
