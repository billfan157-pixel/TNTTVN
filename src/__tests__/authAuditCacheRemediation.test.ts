import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dexieStorage, getDB, initDB } from '../lib/db'
import { setTenantScope, scopedStorageKey } from '../lib/tenantScope'
import { captureSyncCursorScope, readSyncCursor } from '../lib/syncCursor'
import { fetchAllData, runInitialSync } from '../lib/syncCoordinator'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useStudentStore } from '../stores/studentStore'
import { useClassStore } from '../stores/classStore'
import { useNoticeStore } from '../stores/noticeStore'
import { useSyncStore } from '../stores/syncStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAcademicYearStore } from '../stores/academicYearStore'

vi.mock('@sentry/react', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('../router', () => ({ router: {} }))

describe('D9 client cache retirement and parent sync', () => {
  beforeEach(async () => {
    await initDB()
    localStorage.clear()
    setTenantScope({ parishId: 'cache-audit-parish', userId: 'cache-audit-user' })
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'cache-audit-user', parishId: 'cache-audit-parish' }))
    await getDB().syncQueue.clear()
    await getDB().syncMeta.clear()
    useAuthStore.setState({ user: null })
  })
  afterEach(() => { vi.restoreAllMocks(); setTenantScope(null) })

  it('rehydrates legacy read snapshots as empty without deleting durable mutations', async () => {
    const queueId = await useSyncStore.getState().addOp({
      entity: 'grade', entityId: 'pending-grade', operation: 'UPDATE',
      payload: JSON.stringify({ studentId: 'owned-child', scoreFinal: 8 }),
    })
    const queueBefore = await getDB().syncQueue.get(queueId)
    await dexieStorage.setItem('parish_store_grades', JSON.stringify({ version: 0, state: { grades: [{ id: 'old-leaked-grade' }] } }))
    await dexieStorage.setItem('parish_store_attendance', JSON.stringify({ version: 0, state: { attendance: [{ id: 'old-leaked-attendance' }] } }))
    await useGradeStore.persist.rehydrate()
    await useAttendanceStore.persist.rehydrate()
    expect(useGradeStore.getState().grades).toEqual([])
    expect(useAttendanceStore.getState().attendance).toEqual([])
    expect(await getDB().syncQueue.get(queueId)).toEqual(queueBefore)
    expect(await useSyncStore.getState().getPendingOps()).toHaveLength(1)
    expect(JSON.parse((await dexieStorage.getItem('parish_store_grades'))!)).toMatchObject({ version: 2, state: { grades: [], syncScopeRevision: null } })
  })

  it('ignores pre-remediation cursors and forces a full pull even with a stale lastSyncAt', async () => {
    const oldTime = '2026-09-01T00:00:00.000Z'
    await getDB().syncMeta.put({ key: scopedStorageKey('sync_cursor_v1')!, value: oldTime })
    useSyncStore.getState().setLastSync(oldTime)
    expect(captureSyncCursorScope()).toContain('sync_cursor_v2:')
    expect(await readSyncCursor()).toBeNull()
    const { grades, attendance, students } = mockPull()
    expect((await fetchAllData(true)).ok).toBe(true)
    expect(grades).toHaveBeenCalledWith(undefined, true)
    expect(attendance).toHaveBeenCalledWith(undefined, true)
    expect(students).toHaveBeenCalledWith({ throwOnError: true })
  })

  it('parent background sync never calls staff student/grade/attendance endpoints', async () => {
    useAuthStore.setState({ user: {
      id: 'cache-audit-user', parishId: 'cache-audit-parish', username: 'parent',
      fullName: 'Synthetic Parent', role: 'phuhuynh', status: 'ACTIVE',
    } })
    const { grades, attendance, students, classes, notices } = mockPull()
    expect((await fetchAllData(true)).ok).toBe(true)
    expect(grades).not.toHaveBeenCalled()
    expect(attendance).not.toHaveBeenCalled()
    expect(students).not.toHaveBeenCalled()
    expect(classes).toHaveBeenCalledOnce()
    expect(notices).toHaveBeenCalledOnce()
  })

  it('bootstraps server settings and academic years after a fresh authenticated login', async () => {
    useAuthStore.setState({ user: {
      id: 'cache-audit-user', parishId: 'cache-audit-parish', username: 'admin',
      fullName: 'Synthetic Admin', role: 'admin', status: 'ACTIVE',
    } })
    mockPull()
    const settings = vi.spyOn(useSettingsStore.getState(), 'fetchSettings').mockResolvedValue(undefined)
    const years = vi.spyOn(useAcademicYearStore.getState(), 'fetchAcademicYears').mockResolvedValue(undefined)

    await runInitialSync()

    expect(settings).toHaveBeenCalledOnce()
    expect(years).toHaveBeenCalledOnce()
  })

  it('uses one full pull when a staff cursor survives but the local roster is empty', async () => {
    useAuthStore.setState({ user: {
      id: 'cache-audit-user', parishId: 'cache-audit-parish', username: 'admin',
      fullName: 'Synthetic Admin', role: 'admin', status: 'ACTIVE',
    } })
    useStudentStore.getState().setStudents([])
    await getDB().syncMeta.put({ key: captureSyncCursorScope()!, value: '2026-09-01T00:00:00.000Z' })
    const { students, grades, attendance, classes, notices } = mockPull()
    vi.spyOn(useSettingsStore.getState(), 'fetchSettings').mockResolvedValue(undefined)
    vi.spyOn(useAcademicYearStore.getState(), 'fetchAcademicYears').mockResolvedValue(undefined)

    await runInitialSync()

    expect(api.getSyncWatermark).toHaveBeenCalledOnce()
    expect(students).toHaveBeenCalledExactlyOnceWith({ throwOnError: true })
    expect(grades).toHaveBeenCalledExactlyOnceWith(undefined, true)
    expect(attendance).toHaveBeenCalledExactlyOnceWith(undefined, true)
    expect(classes).toHaveBeenCalledOnce()
    expect(notices).toHaveBeenCalledOnce()
    expect(await readSyncCursor()).toBe('2026-09-05T00:00:00.000Z')
  })
})

function mockPull() {
  localStorage.setItem('parish_purge_version', '1')
  vi.spyOn(api, 'probePurgeVersion').mockResolvedValue(1)
  vi.spyOn(api, 'getSyncWatermark').mockResolvedValue({ serverTime: '2026-09-05T00:00:00.000Z', cursorVersion: 1 })
  return {
    grades: vi.spyOn(useGradeStore.getState(), 'fetchGrades').mockResolvedValue(undefined),
    attendance: vi.spyOn(useAttendanceStore.getState(), 'fetchAttendance').mockResolvedValue(undefined),
    students: vi.spyOn(useStudentStore.getState(), 'fetchStudents').mockResolvedValue(undefined),
    classes: vi.spyOn(useClassStore.getState(), 'fetchClasses').mockResolvedValue(undefined),
    notices: vi.spyOn(useNoticeStore.getState(), 'fetchNotices').mockResolvedValue(undefined),
  }
}
