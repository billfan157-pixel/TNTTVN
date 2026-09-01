import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage, getDB } from '../lib/db'
import { api, isAuthenticated } from '../lib/api'
import { syncCreateClass, syncUpdateClass, syncDeleteClass } from '../lib/syncService'
import { runSyncFlow } from '../hooks/useSyncEngine'
import { generateId } from '../lib/id'
import { useAuthStore } from './authStore'
import * as Sentry from '@sentry/react'
import { decryptQueueValue } from '../lib/offlineCipher'

async function getPendingClassIds(): Promise<Set<string>> {
  try {
    const db = getDB()
    const pending = await db.syncQueue.where('status').anyOf(['pending', 'retrying']).toArray()
    const ids = new Set<string>()
    for (const item of pending) {
      if (item.entity !== 'class') continue
      if (item.entityId) ids.add(item.entityId)
      try {
        const raw = await decryptQueueValue(item.payload)
        const p = raw !== null ? JSON.parse(raw) : null
        if (p && typeof p.id === 'string') ids.add(p.id)
      } catch {}
    }
    return ids
  } catch {
    return new Set<string>()
  }
}

const BRANCH_ORDER: Record<string, number> = {
  ChienCon: 1,
  AuNhi: 2,
  ThieuNhi: 3,
  NghiaSi: 4,
  HiepSi: 5,
}

function parseClassName(name: string): { grade: number; section: string } {
  const match = name.match(/^(\d+)([A-Za-z]*)/)
  return {
    grade: match ? parseInt(match[1], 10) : 999,
    section: match ? match[2].toUpperCase() : 'ZZZ',
  }
}

interface TeacherRef {
  id: string
  fullName: string
  username: string
}

interface ClassItem {
  id: string
  code: string
  name: string
  branchId: string
  branchName: string | null
  academicYearId: string
  academicYear: string | null
  room: string | null
  homeroomTeacher: TeacherRef | null
  assistants: TeacherRef[]
  studentCount: number
  parishId: string
  createdAt: string
  updatedAt: string
  updatedBy: string | null
  /** Only reports the signed-in staff member's own class assignment. */
  assignedToCurrentUser?: boolean
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
  assignedToCurrentUser?: boolean
}

function toClassListItem(c: ClassItem): ClassListItem {
  return {
    id: c.id, code: c.code, name: c.name, branch: c.branchId, branchName: c.branchName,
    room: c.room,
    catechistLeader: c.homeroomTeacher?.fullName || '',
    catechistAssistants: c.assistants?.map(a => a.fullName) || [],
    academicYear: c.academicYear || '',
    assignedToCurrentUser: c.assignedToCurrentUser,
  }
}

/** Fail-closed write scope once the server's assignment marker contract exists. */
export function scopeClassesForAssignedWrites(
  classList: ClassListItem[],
  role: string | undefined,
): ClassListItem[] {
  if (role === 'admin') return classList
  const markerContractPresent = classList.some(item => typeof item.assignedToCurrentUser === 'boolean')
  return markerContractPresent
    ? classList.filter(item => item.assignedToCurrentUser === true)
    : classList
}

export function getFilteredClassList(classes: ClassItem[]): ClassListItem[] {
  return classes
    .map(toClassListItem)
    .sort((a, b) => {
      const branchDiff = (BRANCH_ORDER[a.branch] ?? 99) - (BRANCH_ORDER[b.branch] ?? 99)
      if (branchDiff !== 0) return branchDiff
      const aParsed = parseClassName(a.name)
      const bParsed = parseClassName(b.name)
      if (aParsed.grade !== bParsed.grade) return aParsed.grade - bParsed.grade
      return aParsed.section.localeCompare(bParsed.section)
    })
}

export function classListToSelectOptions(classList: ClassListItem[], branchFilter?: string) {
  return branchFilter ? classList.filter(c => c.branch === branchFilter) : classList
}

interface ClassState {
  classes: ClassItem[]
  branches: BranchItem[]
  academicYears: AcademicYearItem[]
  loading: boolean
  error: string | null
  setClasses: (classes: ClassItem[]) => void
  fetchClasses: (updatedAfter?: string) => Promise<void>
  fetchBranches: () => Promise<void>
  fetchAcademicYears: () => Promise<void>
  fetchAll: () => Promise<void>
  findClassById: (id: string) => ClassListItem | undefined
  getClassList: () => ClassListItem[]
  createClass: (data: Record<string, unknown>) => Promise<ClassItem>
  updateClass: (id: string, data: Record<string, unknown>) => Promise<ClassItem>
  deleteClass: (id: string) => Promise<void>
  replaceClassId: (oldId: string, serverClass: ClassItem) => void
}

const activeClassSubmissions = new Set<string>()

export const useClassStore = create<ClassState>()(
  persist(
    (set, get) => ({
      classes: [],
      branches: [],
      academicYears: [],
      loading: false,
      error: null,

      setClasses: (classes) => set({ classes }),

      fetchClasses: async (updatedAfter?: string) => {
        if (!isAuthenticated()) return
        set({ loading: true, error: null })
        try {
          const params = updatedAfter ? { updatedAfter } : undefined
          const fetched = await api.getClasses(params)
          if (Array.isArray(fetched)) {
            const pendingIds = await getPendingClassIds()
            if (updatedAfter && fetched.length > 0) {
              set((state) => {
                const merged = new Map(state.classes.map(c => [c.id, c]))
                for (const c of fetched) {
                  if (merged.has(c.id) && pendingIds.has(c.id)) continue
                  merged.set(c.id, c)
                }
                return { classes: Array.from(merged.values()) }
              })
            } else {
              set((state) => {
                // A successful full fetch is authoritative. Only preserve local
                // records that are explicitly pending for this authenticated user;
                // stale classes from another tenant must never survive the snapshot.
                const next = new Map(fetched.map(c => [c.id, c]))
                for (const localClass of state.classes) {
                  if (pendingIds.has(localClass.id) && !next.has(localClass.id) && localClass.parishId === useAuthStore.getState().user?.parishId) {
                    next.set(localClass.id, localClass)
                  }
                }
                return { classes: Array.from(next.values()) }
              })
            }
          }
        } catch (err) {
          Sentry.captureException(err)
          set({ error: (err as Error)?.message || 'Lỗi tải danh sách lớp học' })
        } finally {
          set({ loading: false })
        }
      },

      fetchBranches: async () => {
        if (!isAuthenticated()) return
        try {
          const list = await api.getClassBranches()
          if (Array.isArray(list)) set({ branches: list })
        } catch (err) {
          Sentry.captureException(err)
          set({ error: (err as Error)?.message || 'Lỗi tải danh sách khối ngành' })
        }
      },

      fetchAcademicYears: async () => {
        if (!isAuthenticated()) return
        try {
          const list = await api.getClassAcademicYears()
          if (Array.isArray(list)) set({ academicYears: list })
        } catch (err) {
          Sentry.captureException(err)
          set({ error: (err as Error)?.message || 'Lỗi tải danh sách năm học' })
        }
      },

      fetchAll: async () => {
        if (!isAuthenticated()) return
        await Promise.all([get().fetchClasses(), get().fetchBranches(), get().fetchAcademicYears()])
      },

      getClassList: () => getFilteredClassList(get().classes),

      findClassById: (id: string) => {
        const c = get().classes.find(c => c.id === id)
        return c ? toClassListItem(c) : undefined
      },

      createClass: async (data) => {
        const localId = generateId('CLS')
        const idempotencyKey = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const dataWithKey = { ...data, idempotencyKey }

        const submissionKey = `${String(data.name ?? '')}_${String(data.branchId ?? '')}_${String(data.academicYearId ?? '')}`
        if (activeClassSubmissions.has(submissionKey)) {
          console.warn('[classStore] Blocked duplicate createClass call in flight:', submissionKey)
          return { id: localId, ...dataWithKey } as any
        }
        activeClassSubmissions.add(submissionKey)

        try {
          const created = await api.createClass(dataWithKey)
          await get().fetchClasses()
          return created
        } catch (err: any) {
          const isNetwork = err instanceof TypeError
            || (err?.message && (String(err.message).includes('Network error') || String(err.message).includes('failed to fetch')))
          if (!isNetwork) throw err
          const now = new Date().toISOString()
          const offlineClass: any = {
            id: localId,
            ...dataWithKey,
            parishId: useAuthStore.getState().user?.parishId || (() => { throw new Error('Cannot create an offline class without a verified parishId') })(),
            homeroomTeacher: null,
            assistants: [],
            studentCount: 0,
            createdAt: now,
            updatedAt: now,
            updatedBy: null,
            branchName: null,
            academicYear: null,
          }
          set((state) => ({ classes: [...state.classes, offlineClass] }))
          await syncCreateClass(offlineClass)
          runSyncFlow()
          return offlineClass
        } finally {
          setTimeout(() => activeClassSubmissions.delete(submissionKey), 1000)
        }
      },

      updateClass: async (id, data) => {
        try {
          const updated = await api.updateClass(id, data)
          await get().fetchClasses()
          return updated
        } catch (err: any) {
          const isNetwork = err instanceof TypeError
            || (err?.message && (String(err.message).includes('Network error') || String(err.message).includes('failed to fetch')))
          if (!isNetwork) throw err
          set((state) => ({
            classes: state.classes.map((c) => (c.id === id ? { ...c, ...data } : c)),
          }))
          await syncUpdateClass(id, data)
          runSyncFlow()
          return { id, ...data } as any
        }
      },

      replaceClassId: (oldId, serverClass) =>
        set((state) => ({
          classes: state.classes.map((c) => (c.id === oldId ? { ...serverClass } : c)),
        })),

      deleteClass: async (id) => {
        try {
          await api.deleteClass(id)
          await get().fetchClasses()
        } catch (err: any) {
          const isNetwork = err instanceof TypeError
            || (err?.message && (String(err.message).includes('Network error') || String(err.message).includes('failed to fetch')))
          if (!isNetwork) throw err
          set((state) => ({
            classes: state.classes.filter((c) => c.id !== id),
          }))
          await syncDeleteClass(id)
          runSyncFlow()
        }
      },
    }),
    {
      name: 'parish_store_classes',
      storage: createJSONStorage(() => dexieStorage),
      partialize: (state) => ({ classes: state.classes, branches: state.branches, academicYears: state.academicYears }),
      onRehydrateStorage: () => (state) => {
        if (state) state.fetchClasses()
      },
    }
  )
)
