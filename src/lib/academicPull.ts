import { z } from 'zod'
import { dexieStorage } from './db'
import { getTenantScope, scopedStorageKey } from './tenantScope'

export interface AcademicPullResponse<T = any> {
  records: T[]
  mode: 'full' | 'delta'
  scope: { revision: string; studentIds: string[]; semester: number | null }
}

const envelope = z.object({
  records: z.array(z.object({ studentId: z.string().min(1), semester: z.number().optional() }).passthrough()),
  mode: z.enum(['full', 'delta']),
  scope: z.object({ revision: z.string().min(1), studentIds: z.array(z.string().min(1)), semester: z.union([z.literal(1), z.literal(2)]).nullable() }),
})
const generations = { grade: 0, attendance: 0 }

export function beginAcademicPull(entity: 'grade' | 'attendance') {
  const owner = getTenantScope()
  const generation = ++generations[entity]
  const current = () => owner !== null && getTenantScope() === owner && generations[entity] === generation
  return { current, assertCurrent: () => { if (!current()) throw new Error('Stale academic pull') } }
}

export function mergeAcademicPull<T extends { studentId: string; semester?: number }>(
  raw: unknown, local: T[], pendingKeys: Set<string>, naturalKey: (row: T) => string, priorRevision: string | null,
): { rows: T[]; revision: string } {
  const parsed = envelope.safeParse(raw)
  if (!parsed.success) throw new Error('Invalid academic scope response')
  const { scope, mode } = parsed.data
  if (mode === 'delta' && scope.revision !== priorRevision) throw new Error('Academic scope changed without full snapshot')
  const allowed = new Set(scope.studentIds)
  const inScope = (row: { studentId: string; semester?: number }) => allowed.has(row.studentId) && (scope.semester === null || row.semester === scope.semester)
  if (parsed.data.records.some(row => !inScope(row))) throw new Error('Academic response exceeds its scope')
  const merged = new Map<string, T>()
  for (const row of local) {
    if (inScope(row) && (mode === 'delta' || pendingKeys.has(naturalKey(row)))) merged.set(naturalKey(row), row)
  }
  for (const row of parsed.data.records as T[]) {
    const key = naturalKey(row)
    if (merged.has(key) && pendingKeys.has(key)) continue
    merged.set(key, row)
  }
  return { rows: [...merged.values()], revision: scope.revision }
}

// Serialize only these replaceable read caches. Queue durability is independent.
// Capture ownership before async encryption; never let a queued old-user write
// execute against the new user's key. Pull success awaits the latest write.
const writes = new Map<string, Promise<void>>()
export const academicCacheStorage = {
  ...dexieStorage,
  async getItem(name: string): Promise<string | null> {
    const key = scopedStorageKey(name)
    if (!key) return null
    for (;;) {
      const pending = writes.get(key)
      await pending
      if (scopedStorageKey(name) !== key) return null
      const value = await dexieStorage.getItem(name)
      if (scopedStorageKey(name) !== key) return null
      if (writes.get(key) === pending) return value
    }
  },
  setItem(name: string, value: string): Promise<void> {
    const key = scopedStorageKey(name)
    if (!key) return Promise.resolve()
    const next = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (scopedStorageKey(name) !== key) return
      await dexieStorage.setItem(name, value)
    })
    writes.set(key, next)
    void next.catch(() => {}) // Zustand setters do not await persistence; pull does.
    return next
  },
}

export async function flushAcademicCache(name: string): Promise<void> {
  const key = scopedStorageKey(name)
  if (key) await writes.get(key)
}
