import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('../router', () => ({ router: {} }))
vi.mock('../lib/syncProcessor', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/syncProcessor')>()
  return { ...mod, getBackoffMs: () => 0 }
})

// A-NEW-46: mock resetClientData để kiểm tra PURGE v2.3 KHÔNG wipe device mới.
vi.mock('../lib/resetClientData', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/resetClientData')>()
  return {
    ...mod,
    resetClientData: vi.fn().mockResolvedValue(undefined),
  }
})

import { initDB, getDB } from '../lib/db'
import { useSyncStore } from '../stores/syncStore'
import { runSyncFlow } from '../hooks/useSyncEngine'
import { api } from '../lib/api'
import { PURGE_VERSION_KEY, resetClientData } from '../lib/resetClientData'

const resetClientDataMock = vi.mocked(resetClientData)

async function resetDB() {
  const db = getDB()
  await db.syncQueue.clear()
  await db.syncMeta.clear()
  await db.stores.clear()
  await useSyncStore.getState().refreshCount()
  useSyncStore.getState().setStatus('idle')
  useSyncStore.getState().setLastError(null)
  useSyncStore.getState().setLastSync('')
  localStorage.removeItem(PURGE_VERSION_KEY)
  localStorage.setItem('parish_current_user', JSON.stringify({ id: 'U-TEST', role: 'admin' }))
}

function mockApiMethods(purgeVersion: number) {
  vi.spyOn(api, 'probePurgeVersion').mockResolvedValue(purgeVersion)
  vi.spyOn(api, 'getStudents').mockResolvedValue({ data: [], total: 0 })
  vi.spyOn(api, 'getGrades').mockResolvedValue([])
  vi.spyOn(api, 'getAttendance').mockResolvedValue([])
  vi.spyOn(api, 'getNotices').mockResolvedValue([])
  vi.spyOn(api, 'getClasses').mockResolvedValue([])
  vi.spyOn(api, 'getClassBranches').mockResolvedValue([])
  vi.spyOn(api, 'getClassAcademicYears').mockResolvedValue([])
}

describe('Sync Engine — PURGE v2.3 trên device mới (A-NEW-46)', () => {
  beforeEach(async () => {
    await initDB()
    await resetDB()
    resetClientDataMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('device mới (chưa có purge key) + server purge_version cao → KHÔNG wipe, KHÔNG logout, chỉ ghi baseline', async () => {
    mockApiMethods(4)
    await runSyncFlow()

    expect(resetClientDataMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(PURGE_VERSION_KEY)).toBe('4')
    expect(localStorage.getItem('parish_current_user')).not.toBeNull()
    expect(useSyncStore.getState().status).toBe('idle')
  })

  it('device cũ (purge key = 1) + server 4 → resetClientData được gọi với version mới', async () => {
    localStorage.setItem(PURGE_VERSION_KEY, '1')
    mockApiMethods(4)
    await runSyncFlow()

    expect(resetClientDataMock).toHaveBeenCalledTimes(1)
    expect(resetClientDataMock).toHaveBeenCalledWith(4)
  })

  it('device có purge key bằng server → không wipe', async () => {
    localStorage.setItem(PURGE_VERSION_KEY, '4')
    mockApiMethods(4)
    await runSyncFlow()

    expect(resetClientDataMock).not.toHaveBeenCalled()
  })
})
