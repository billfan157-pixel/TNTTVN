import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import {
  GRADE_IMPORT_UNDO_STORAGE_KEY,
  GRADE_IMPORT_UNDO_WINDOW_MS,
  loadGradeImportUndoSnapshot,
  saveGradeImportUndoSnapshot,
} from '../lib/gradeImportUndoStorage'
import { setTenantScope } from '../lib/tenantScope'

const snapshot = {
  studentIds: ['student-1', 'student-2'],
  semester: 1 as const,
  academicYear: '2026 - 2027',
  at: Date.now(),
  count: 2,
}

describe('grade import undo snapshot tenant boundary', () => {
  beforeEach(async () => {
    localStorage.clear()
    setTenantScope({ parishId: 'parish-a', userId: 'user-a' })
    await db.stores.clear()
  })

  afterEach(() => setTenantScope(null))

  it('persists encrypted data only inside the active parish and user scope', async () => {
    expect(await saveGradeImportUndoSnapshot(snapshot)).toBe(true)
    const stored = await db.stores.get(`${GRADE_IMPORT_UNDO_STORAGE_KEY}:parish-a:user-a`)
    expect(stored?.value).toContain('enc:v1:')
    expect(stored?.value).not.toContain('student-1')
    expect(await loadGradeImportUndoSnapshot()).toEqual(snapshot)

    setTenantScope({ parishId: 'parish-a', userId: 'user-b' })
    expect(await loadGradeImportUndoSnapshot()).toBeNull()
  })

  it('removes the unscoped legacy value instead of attributing it to the current user', async () => {
    localStorage.setItem('gradeImportSnapshot', JSON.stringify(snapshot))
    expect(await loadGradeImportUndoSnapshot()).toBeNull()
    expect(localStorage.getItem('gradeImportSnapshot')).toBeNull()
  })

  it('fails closed and cleans an expired snapshot', async () => {
    const expired = { ...snapshot, at: Date.now() - GRADE_IMPORT_UNDO_WINDOW_MS - 1 }
    await db.stores.put({
      key: `${GRADE_IMPORT_UNDO_STORAGE_KEY}:parish-a:user-a`,
      value: JSON.stringify(expired),
    })
    expect(await loadGradeImportUndoSnapshot()).toBeNull()
    expect(await db.stores.get(`${GRADE_IMPORT_UNDO_STORAGE_KEY}:parish-a:user-a`)).toBeUndefined()
  })
})
