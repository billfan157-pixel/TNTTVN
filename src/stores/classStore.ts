import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import { api } from '../lib/api'
import * as Sentry from '@sentry/react'

interface ClassItem {
  id: string
  code: string
  name: string
  branchId: string
  branchName: string | null
  academicYearId: string
  academicYear: string | null
  room: string | null
  parishId: string
  createdAt: string
  updatedAt: string
  updatedBy: string | null
}

interface BranchItem {
  id: string
  name: string
  scarfColor: string
  ageMin: number
  ageMax: number
}

interface AcademicYearItem {
  id: string
  startDate: string
  endDate: string
  isLocked: number
}

interface ClassState {
  classes: ClassItem[]
  branches: BranchItem[]
  academicYears: AcademicYearItem[]
  loading: boolean
  setClasses: (classes: ClassItem[]) => void
  fetchClasses: () => Promise<void>
  fetchBranches: () => Promise<void>
  fetchAcademicYears: () => Promise<void>
  createClass: (data: Record<string, unknown>) => Promise<ClassItem>
  updateClass: (id: string, data: Record<string, unknown>) => Promise<ClassItem>
  deleteClass: (id: string) => Promise<void>
}

export const useClassStore = create<ClassState>()(
  persist(
    (set, get) => ({
      classes: [],
      branches: [],
      academicYears: [],
      loading: false,

      setClasses: (classes) => set({ classes }),

      fetchClasses: async () => {
        set({ loading: true })
        try {
          const fetched = await api.getClasses()
          if (Array.isArray(fetched)) set({ classes: fetched })
        } catch (err) {
          Sentry.captureException(err)
        } finally {
          set({ loading: false })
        }
      },

      fetchBranches: async () => {
        try {
          const list = await api.getClassBranches()
          if (Array.isArray(list)) set({ branches: list })
        } catch { }
      },

      fetchAcademicYears: async () => {
        try {
          const list = await api.getClassAcademicYears()
          if (Array.isArray(list)) set({ academicYears: list })
        } catch { }
      },

      createClass: async (data) => {
        const created = await api.createClass(data)
        await get().fetchClasses()
        return created
      },

      updateClass: async (id, data) => {
        const updated = await api.updateClass(id, data)
        await get().fetchClasses()
        return updated
      },

      deleteClass: async (id) => {
        await api.deleteClass(id)
        await get().fetchClasses()
      },
    }),
    {
      name: 'parish_store_classes',
      storage: createJSONStorage(() => dexieStorage),
      partialize: (state) => ({ classes: state.classes, branches: state.branches, academicYears: state.academicYears }),
    }
  )
)
