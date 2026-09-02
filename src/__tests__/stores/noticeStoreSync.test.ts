import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNoticeStore } from '../../stores/noticeStore'
import { api, ApiError } from '../../lib/api'
import { processOperation } from '../../lib/syncProcessor'
import type { ParishNotice } from '../../types'

vi.mock('../../lib/api', () => ({
  api: {
    getNotices: vi.fn(),
    createNotice: vi.fn(),
    updateNotice: vi.fn(),
    deleteNotice: vi.fn(),
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
  useNoticeStore.setState({ notices: [], loading: false })
  vi.clearAllMocks()
  localStorage.setItem('parish_current_user', '{"id":"U-TEST"}')
})

describe('Task 2 — noticeStore Sync Pipeline Verification', () => {
  it('Task 2b: fetchNotices preserves offline pending notice when server returns list without it', async () => {
    const offlineNotice: ParishNotice = {
      id: 'NC-TEMP-88',
      title: 'Thông báo Offline',
      content: 'Nội dung',
      date: '2025-10-01',
      author: 'Admin',
      priority: 'normal',
      createdAt: '',
      updatedAt: '',
    }
    useNoticeStore.setState({ notices: [offlineNotice] })

    // Mock syncQueue contains NC-TEMP-88
    mockSyncQueue.where.mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ id: 'op-notice-1', entity: 'notice', entityId: 'NC-TEMP-88', operation: 'CREATE', payload: JSON.stringify(offlineNotice) }]),
      }),
    })

    const serverNotice: ParishNotice = {
      id: 'NC-SERVER-100',
      title: 'Thông báo Server',
      content: 'Nội dung server',
      date: '2025-10-01',
      author: 'Admin',
      priority: 'urgent',
      createdAt: '',
      updatedAt: '',
    }
    vi.mocked(api.getNotices).mockResolvedValue([serverNotice])

    await useNoticeStore.getState().fetchNotices()

    const currentNotices = useNoticeStore.getState().notices
    expect(currentNotices).toHaveLength(2)
    expect(currentNotices.some(n => n.id === 'NC-TEMP-88')).toBe(true)
    expect(currentNotices.some(n => n.id === 'NC-SERVER-100')).toBe(true)
  })

  it('keeps the current projection when an incremental pull has no changes', async () => {
    const existing = {
      id: 'NC-EXISTING-1',
      title: 'Thông báo hiện có',
      content: 'Nội dung',
      date: '2026-09-01',
      author: 'Admin',
      priority: 'normal',
      createdAt: '',
      updatedAt: '',
    } as ParishNotice
    useNoticeStore.setState({ notices: [existing] })
    vi.mocked(api.getNotices).mockResolvedValue([])

    await useNoticeStore.getState().fetchNotices('2026-09-01T00:00:00.000Z', true)

    expect(useNoticeStore.getState().notices).toEqual([existing])
  })

  it('Task 2c: deleteNotice rethrows 403 ApiError without deleting local notice or enqueueing sync op', async () => {
    const notice: ParishNotice = {
      id: 'NC-LOCKED-01',
      title: 'Thông báo Khóa',
      content: 'Không được xóa',
      date: '2025-10-01',
      author: 'SuperAdmin',
      priority: 'urgent',
      createdAt: '',
      updatedAt: '',
    }
    useNoticeStore.setState({ notices: [notice] })

    vi.mocked(api.deleteNotice).mockRejectedValue(new ApiError(403, 'Bạn không có quyền xóa thông báo này', '/notices/NC-LOCKED-01'))

    await expect(useNoticeStore.getState().deleteNotice('NC-LOCKED-01')).rejects.toThrow('Bạn không có quyền xóa thông báo này')

    expect(useNoticeStore.getState().notices).toHaveLength(1)
    expect(useNoticeStore.getState().notices[0].id).toBe('NC-LOCKED-01')
  })

  it('Task 2e: processOperation handles notice UPDATE correctly via api.updateNotice', async () => {
    const noticePayload = { id: 'NC-101', title: 'Thông báo Đã Cập Nhật' }
    vi.mocked(api.updateNotice).mockResolvedValue(noticePayload as any)

    const res = await processOperation({
      entity: 'notice',
      operation: 'UPDATE',
      entityId: 'NC-101',
      payload: JSON.stringify(noticePayload),
    })

    expect(res.ok).toBe(true)
    expect(vi.mocked(api.updateNotice)).toHaveBeenCalledWith('NC-101', noticePayload)
  })
})
