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

export interface ClassListItem {
  id: string
  code: string
  name: string
  branch: string
  branchName: string | null
  room: string | null
  catechistLeader: string
  catechistAssistants: string[]
  academicYear: string
}

export const DEFAULT_CLASS_LIST: ClassListItem[] = [
  { id: 'CC1', code: 'CC-01', name: 'Chiên Con 1', branch: 'ChienCon', branchName: 'Chiên Con', room: 'Phòng 101', catechistLeader: 'Trưởng Maria Nguyễn Thị Hồng', catechistAssistants: ['Huynh Trưởng Anrê Phạm Văn Nam'], academicYear: '2025 - 2026' },
  { id: 'AU1', code: 'AU-01', name: 'Ấu Nhi 1', branch: 'AuNhi', branchName: 'Ấu Nhi', room: 'Phòng 102', catechistLeader: 'Trưởng Giuse Tran Minh Quang', catechistAssistants: ['Huynh Trưởng Maria Lê Thu Hà'], academicYear: '2025 - 2026' },
  { id: 'AU2', code: 'AU-02', name: 'Ấu Nhi 2 (Rơmêô)', branch: 'AuNhi', branchName: 'Ấu Nhi', room: 'Phòng 103', catechistLeader: 'Trưởng Phêrô Vũ Hoàng Long', catechistAssistants: ['Huynh Trưởng Anna Đỗ Kim Yến'], academicYear: '2025 - 2026' },
  { id: 'TN1', code: 'TN-01', name: 'Thiếu Nhi 1', branch: 'ThieuNhi', branchName: 'Thiếu Nhi', room: 'Phòng 201', catechistLeader: 'Trưởng F.X Nguyễn Văn Hùng', catechistAssistants: ['Huynh Trưởng Catarina Trịnh Thảo'], academicYear: '2025 - 2026' },
  { id: 'TN2', code: 'TN-02', name: 'Thiếu Nhi 2 (Rơmêô)', branch: 'ThieuNhi', branchName: 'Thiếu Nhi', room: 'Phòng 202', catechistLeader: 'Trưởng Anna Nguyễn Mai Phương', catechistAssistants: ['Huynh Trưởng Giuse Đặng Quốc Huy'], academicYear: '2025 - 2026' },
  { id: 'NS1', code: 'NS-01', name: 'Nghĩa Sĩ 1', branch: 'NghiaSi', branchName: 'Nghĩa Sĩ', room: 'Phòng 301', catechistLeader: 'Trưởng Gioan B. Lê Hoàng Việt', catechistAssistants: ['Huynh Trưởng Têrêsa Ngô Bảo Ngọc'], academicYear: '2025 - 2026' },
  { id: 'HS1', code: 'HS-01', name: 'Hiệp Sĩ 1', branch: 'HiepSi', branchName: 'Hiệp Sĩ', room: 'Phòng 302', catechistLeader: 'Trưởng Phaolô Nguyễn Hoàng Anh', catechistAssistants: ['Huynh Trưởng Maria Trần Thu Thủy'], academicYear: '2025 - 2026' },
]

function toClassListItem(c: ClassItem): ClassListItem {
  return { id: c.id, code: c.code, name: c.name, branch: c.branchId, branchName: c.branchName, room: c.room, catechistLeader: '', catechistAssistants: [], academicYear: c.academicYear || '2025 - 2026' }
}

export function getFilteredClassList(classes: ClassItem[]): ClassListItem[] {
  return classes.length > 0 ? classes.map(toClassListItem) : DEFAULT_CLASS_LIST
}

export function classListToSelectOptions(classList: ClassListItem[], branchFilter?: string) {
  return branchFilter ? classList.filter(c => c.branch === branchFilter) : classList
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
  fetchAll: () => Promise<void>
  findClassById: (id: string) => ClassListItem | undefined
  getClassList: () => ClassListItem[]
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
          if (Array.isArray(fetched) && fetched.length > 0) set({ classes: fetched })
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

      fetchAll: async () => {
        await Promise.all([get().fetchClasses(), get().fetchBranches(), get().fetchAcademicYears()])
      },

      getClassList: () => getFilteredClassList(get().classes),

      findClassById: (id: string) => {
        const c = get().classes.find(c => c.id === id)
        return c ? toClassListItem(c) : DEFAULT_CLASS_LIST.find(c => c.id === id)
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
