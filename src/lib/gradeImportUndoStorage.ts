import { dexieStorage } from './db'
import { getTenantScopeKey } from './tenantScope'

export const GRADE_IMPORT_UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const GRADE_IMPORT_UNDO_STORAGE_KEY = 'parish_grade_import_undo_v2'
const LEGACY_UNSCOPED_KEY = 'gradeImportSnapshot'

export interface GradeImportUndoSnapshot {
  studentIds: string[]
  semester: 1 | 2
  academicYear: string
  at: number
  count: number
}

function removeLegacySnapshot(): void {
  try {
    // The legacy value cannot be attributed to a parish/user safely. Never
    // migrate it into an authenticated tenant scope.
    localStorage.removeItem(LEGACY_UNSCOPED_KEY)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function isValidSnapshot(value: unknown, now: number): value is GradeImportUndoSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<GradeImportUndoSnapshot>
  if (snapshot.semester !== 1 && snapshot.semester !== 2) return false
  if (typeof snapshot.academicYear !== 'string' || !snapshot.academicYear.trim() || snapshot.academicYear.length > 50) return false
  if (!Number.isFinite(snapshot.at) || (snapshot.at as number) <= 0 || (snapshot.at as number) > now + 60_000) return false
  if (now - (snapshot.at as number) > GRADE_IMPORT_UNDO_WINDOW_MS) return false
  if (!Number.isInteger(snapshot.count) || (snapshot.count as number) <= 0 || (snapshot.count as number) > 500) return false
  if (!Array.isArray(snapshot.studentIds) || snapshot.studentIds.length === 0 || snapshot.studentIds.length > 500) return false
  if (snapshot.studentIds.length !== snapshot.count) return false
  if (new Set(snapshot.studentIds).size !== snapshot.studentIds.length) return false
  return snapshot.studentIds.every(id => typeof id === 'string' && id.trim().length > 0 && id.length <= 100)
}

export async function loadGradeImportUndoSnapshot(now = Date.now()): Promise<GradeImportUndoSnapshot | null> {
  removeLegacySnapshot()
  const scopeKey = getTenantScopeKey()
  if (!scopeKey) return null

  try {
    const raw = await dexieStorage.getItem(GRADE_IMPORT_UNDO_STORAGE_KEY)
    if (getTenantScopeKey() !== scopeKey || !raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (isValidSnapshot(parsed, now)) return parsed
    await dexieStorage.removeItem(GRADE_IMPORT_UNDO_STORAGE_KEY)
  } catch {
    // A corrupt/unreadable snapshot must fail closed and never enable undo.
  }
  return null
}

export async function saveGradeImportUndoSnapshot(snapshot: GradeImportUndoSnapshot): Promise<boolean> {
  removeLegacySnapshot()
  const scopeKey = getTenantScopeKey()
  if (!scopeKey || !isValidSnapshot(snapshot, Date.now())) return false

  try {
    await dexieStorage.setItem(GRADE_IMPORT_UNDO_STORAGE_KEY, JSON.stringify(snapshot))
    return getTenantScopeKey() === scopeKey
  } catch {
    // Undo availability is best-effort and must never fail the completed import.
    return false
  }
}

export async function clearGradeImportUndoSnapshot(): Promise<void> {
  removeLegacySnapshot()
  if (!getTenantScopeKey()) return
  try {
    await dexieStorage.removeItem(GRADE_IMPORT_UNDO_STORAGE_KEY)
  } catch {
    // Best-effort cleanup. A completed undo cannot be repeated server-side.
  }
}
