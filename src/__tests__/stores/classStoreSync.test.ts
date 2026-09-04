import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClassStore } from '../../stores/classStore'
import { useAuthStore } from '../../stores/authStore'
import * as syncService from '../../lib/syncService'
import * as syncTrigger from '../../lib/syncTrigger'
import { api, ApiError } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  api: {
    getClasses: vi.fn(),
    createClass: vi.fn(),
    updateClass: vi.fn(),
    deleteClass: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number
    path: string
    constructor(status: number, message: string, path: string = '') {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.path = path
    }
  },
  isAuthenticated: () => {
    try {
      return !!localStorage.getItem('parish_current_user')
    } catch {
      return false
    }
  },
}))

vi.mock('../../lib/syncService', () => ({
  syncCreateClass: vi.fn().mockResolvedValue(undefined),
  syncUpdateClass: vi.fn().mockResolvedValue(undefined),
  syncDeleteClass: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/syncTrigger', () => ({
  requestSync: vi.fn().mockResolvedValue(undefined),
}))

const mockSyncQueue = {
  where: vi.fn().mockReturnValue({
    anyOf: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  }),
}

vi.mock('../../lib/db', () => ({
  dexieStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  getDB: () => ({
    syncQueue: mockSyncQueue,
  }),
}))

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

beforeEach(() => {
  useClassStore.setState({ classes: [], branches: [], academicYears: [], loading: false })
  vi.clearAllMocks()
  useAuthStore.setState({ user: { id: 'U-TEST', username: 'test', fullName: 'Test', role: 'admin', status: 'ACTIVE', parishId: 'p1' }, isAuthenticated: true, authReady: true })
  localStorage.setItem('parish_current_user', '{"id":"U-TEST","parishId":"p1"}')
})

describe('Task 1 — classStore Sync & Race Condition Verification', () => {
  it('Task 1a: createClass calls runSyncFlow exactly once on offline creation', async () => {
    vi.mocked(api.createClass).mockRejectedValue(new TypeError('Failed to fetch'))
    await useClassStore.getState().createClass({ name: 'Ấu Nhi 1', branchId: 'br-1', academicYearId: 'ay-1' })
    expect(vi.mocked(syncService.syncCreateClass)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(syncTrigger.requestSync)).toHaveBeenCalledTimes(1)
  })

  it('Task 1a: updateClass calls runSyncFlow exactly once on offline update', async () => {
    useClassStore.setState({ classes: [{ id: 'cls-1', code: 'C1', name: 'Lớp 1', branchId: 'b1', branchName: null, academicYearId: 'ay1', academicYear: null, room: null, homeroomTeacher: null, assistants: [], studentCount: 0, parishId: 'p1', createdAt: '', updatedAt: '', updatedBy: null }] })
    vi.mocked(api.updateClass).mockRejectedValue(new TypeError('Failed to fetch'))
    await useClassStore.getState().updateClass('cls-1', { name: 'Lớp 1 Đã Sửa' })
    expect(vi.mocked(syncService.syncUpdateClass)).toHaveBeenCalledWith('cls-1', { name: 'Lớp 1 Đã Sửa' })
    expect(vi.mocked(syncTrigger.requestSync)).toHaveBeenCalledTimes(1)
  })

  it('Task 1a & 2c: deleteClass calls runSyncFlow on offline delete, but rethrows non-network 403 error without local deletion or sync enqueue', async () => {
    useClassStore.setState({ classes: [{ id: 'cls-locked', code: 'C2', name: 'Lớp Bị Khóa', branchId: 'b1', branchName: null, academicYearId: 'ay1', academicYear: null, room: null, homeroomTeacher: null, assistants: [], studentCount: 5, parishId: 'p1', createdAt: '', updatedAt: '', updatedBy: null }] })
    
    // Non-network error (e.g. 403 Forbidden / 400 Bad Request)
    const err403 = new ApiError(403, 'Bạn không có quyền xóa lớp này', '/classes/cls-locked')
    vi.mocked(api.deleteClass).mockRejectedValue(err403)

    await expect(useClassStore.getState().deleteClass('cls-locked')).rejects.toThrow('Bạn không có quyền xóa lớp này')

    // Local state must NOT filter out the class
    expect(useClassStore.getState().classes).toHaveLength(1)
    expect(useClassStore.getState().classes[0].id).toBe('cls-locked')
    // Sync queue must NOT be called
    expect(vi.mocked(syncService.syncDeleteClass)).not.toHaveBeenCalled()
    expect(vi.mocked(syncTrigger.requestSync)).not.toHaveBeenCalled()
  })

  it('Task 1b: fetchClasses preserves offline pending class in state when server returns list without it', async () => {
    const offlineClass = { id: 'CLS-TEMP-99', code: 'CT', name: 'Lớp Offline', branchId: 'b1', branchName: null, academicYearId: 'ay1', academicYear: null, room: null, homeroomTeacher: null, assistants: [], studentCount: 0, parishId: 'p1', createdAt: '', updatedAt: '', updatedBy: null }
    useClassStore.setState({ classes: [offlineClass] })

    // Mock pending syncQueue contains CLS-TEMP-99 (op thật luôn mang ownership
    // vì addOp stamp exact parish+user — OFF-TENANT-1).
    mockSyncQueue.where.mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ id: 'op-1', entity: 'class', entityId: 'CLS-TEMP-99', operation: 'CREATE', payload: JSON.stringify(offlineClass), userId: 'U-TEST', parishId: 'p1' }]),
      }),
    })

    // Server returns empty list or list without CLS-TEMP-99
    const serverClass = { id: 'cls-server-01', code: 'CS1', name: 'Lớp Server 1', branchId: 'b1', branchName: null, academicYearId: 'ay1', academicYear: null, room: null, homeroomTeacher: null, assistants: [], studentCount: 10, parishId: 'p1', createdAt: '', updatedAt: '', updatedBy: null }
    vi.mocked(api.getClasses).mockResolvedValue([serverClass])

    await useClassStore.getState().fetchClasses()

    const currentClasses = useClassStore.getState().classes
    // Both server class AND pending offline class must be present
    expect(currentClasses).toHaveLength(2)
    expect(currentClasses.some(c => c.id === 'CLS-TEMP-99')).toBe(true)
    expect(currentClasses.some(c => c.id === 'cls-server-01')).toBe(true)
  })

  it('keeps the existing catalog when an incremental pull has no class changes', async () => {
    const existingClass = { id: 'cls-existing', code: 'CE', name: 'Ấu Nhi 1', branchId: 'AuNhi', branchName: 'Ấu Nhi', academicYearId: '2026-2027', academicYear: null, room: null, homeroomTeacher: null, assistants: [], studentCount: 12, parishId: 'p1', createdAt: '', updatedAt: '', updatedBy: null }
    useClassStore.setState({ classes: [existingClass] })
    vi.mocked(api.getClasses).mockResolvedValue([])

    await useClassStore.getState().fetchClasses('2026-09-02T00:00:00.000Z', '2026-09-02T00:01:00.000Z', true)

    expect(useClassStore.getState().classes).toEqual([existingClass])
    expect(api.getClasses).toHaveBeenCalledWith({
      updatedAfter: '2026-09-02T00:00:00.000Z',
      updatedBefore: '2026-09-02T00:01:00.000Z',
    })
  })
})
