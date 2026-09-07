import { academicPullFixture } from './helpers/academicPull'
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
import { useSyncStore, getOwnUnsettledSyncOperations } from '../stores/syncStore'
import { runSyncFlow } from '../lib/syncCoordinator'
import { api } from '../lib/api'
import { PURGE_VERSION_KEY, resetClientData } from '../lib/resetClientData'
import { setTenantScope } from '../lib/tenantScope'

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
  localStorage.setItem('parish_current_user', JSON.stringify({ id: 'U-TEST', role: 'admin', parishId: 'PARISH-TEST' }))
  setTenantScope({ parishId: 'PARISH-TEST', userId: 'U-TEST' })
}

function mockApiMethods(purgeVersion: number) {
  vi.spyOn(api, 'probePurgeVersion').mockResolvedValue(purgeVersion)
  vi.spyOn(api, 'getSyncWatermark').mockResolvedValue({ serverTime: '2026-09-01T00:00:00.000Z', cursorVersion: 1 })
  vi.spyOn(api, 'getStudents').mockResolvedValue({ data: [], total: 0 })
  vi.spyOn(api, 'pullGrades').mockResolvedValue(academicPullFixture([]))
  vi.spyOn(api, 'pullAttendance').mockResolvedValue(academicPullFixture([]))
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
    setTenantScope(null)
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

  it('device thiếu generation key nhưng có queue cũ phải reset trước khi sync', async () => {
    await getDB().syncQueue.put({
      id: 'legacy-pending', entity: 'grade', entityId: 'grade-1', operation: 'UPDATE', payload: '{}',
      retryCount: 0, lastError: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      status: 'pending', deviceId: 'device', userId: 'U-TEST', parishId: 'PARISH-TEST',
    })
    mockApiMethods(4)

    await runSyncFlow()

    expect(resetClientDataMock).toHaveBeenCalledWith(4)
    expect(api.getSyncWatermark).not.toHaveBeenCalled()
  })

  it('recovery barrier includes failed/processing own ops but excludes completed and other-owner rows', async () => {
    const base = {
      entity: 'grade' as const, entityId: 'grade-1', operation: 'UPDATE' as const, payload: '{}',
      retryCount: 0, lastError: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      deviceId: 'device', parishId: 'PARISH-TEST',
    }
    await getDB().syncQueue.bulkPut([
      { ...base, id: 'own-failed', status: 'failed', userId: 'U-TEST' },
      { ...base, id: 'own-processing', status: 'processing', userId: 'U-TEST' },
      { ...base, id: 'own-completed', status: 'completed', userId: 'U-TEST' },
      { ...base, id: 'other-pending', status: 'pending', userId: 'OTHER' },
    ])

    expect((await getOwnUnsettledSyncOperations()).map(op => op.id)).toEqual(['own-failed', 'own-processing'])
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
