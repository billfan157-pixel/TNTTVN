import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSyncStore, migrateLegacyQueueUserIds } from '../stores/syncStore'
import { processOperation } from '../lib/syncProcessor'
import { api } from '../lib/api'
import { setTenantScope } from '../lib/tenantScope'

const mockTable: Record<string, any> = {
  put: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  where: vi.fn(),
  toArray: vi.fn(),
  count: vi.fn(),
  filter: vi.fn(),
}

const mockDb = {
  syncQueue: mockTable,
  transaction: vi.fn().mockImplementation((_mode: any, _table: any, cb: () => any) => cb()),
  cryptoKeys: {
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  },
}

const OWNER = { userId: 'USER-A', parishId: 'PARISH-A' }

vi.mock('../lib/db', () => ({
  getDB: () => mockDb,
  dexieStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  api: {
    createClass: vi.fn(),
    deleteClass: vi.fn(),
    createNotice: vi.fn(),
    deleteNotice: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
  isAuthenticated: () => true,
}))

describe('Offline Sync Remediation Verification (OS-01 to OS-04)', () => {
  beforeEach(() => {
    useSyncStore.setState({ status: 'idle', pendingCount: 0, lastSyncAt: null, lastError: null })
    vi.clearAllMocks()
    localStorage.setItem('parish_current_user', JSON.stringify({ id: OWNER.userId, parishId: OWNER.parishId }))
    setTenantScope(OWNER)

    mockTable.where.mockReturnThis()
    mockTable.anyOf = vi.fn().mockReturnThis()
    mockTable.equals = vi.fn().mockReturnThis()
    mockTable.filter.mockReturnThis()
  })

  it('OS-01 Keep-BOTH: compactQueue giữ nguyên cả CREATE(retrying) và DELETE(pending)', async () => {
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-CREATE', entity: 'class', entityId: 'TEMP-CLS-01', operation: 'CREATE', payload: '{}', status: 'retrying', retryCount: 1, createdAt: '2026-08-12T10:00:00Z', ...OWNER },
      { id: 'OP-DELETE', entity: 'class', entityId: 'TEMP-CLS-01', operation: 'DELETE', payload: '{}', status: 'pending', retryCount: 0, createdAt: '2026-08-12T10:05:00Z', ...OWNER },
    ])
    await useSyncStore.getState().compactQueue()
    expect(mockTable.delete).not.toHaveBeenCalled()
  })

  it('OS-01 Idempotency Key Injection: processOperation createClass & createNotice inject idempotencyKey', async () => {
    vi.mocked(api.createClass).mockResolvedValue({ id: 'CLS-REAL-01', name: 'Lớp 1' } as any)
    vi.mocked(api.createNotice).mockResolvedValue({ id: 'NC-REAL-01', title: 'TB 1' } as any)

    await processOperation({
      entity: 'class',
      entityId: 'TEMP-CLS-99',
      operation: 'CREATE',
      payload: JSON.stringify({ name: 'Lớp 1' }),
    })

    expect(api.createClass).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Lớp 1',
      idempotencyKey: 'TEMP-CLS-99',
    }))

    await processOperation({
      entity: 'notice',
      entityId: 'TEMP-NC-88',
      operation: 'CREATE',
      payload: JSON.stringify({ title: 'TB 1' }),
    })

    expect(api.createNotice).toHaveBeenCalledWith(expect.objectContaining({
      title: 'TB 1',
      idempotencyKey: 'TEMP-NC-88',
    }))
  })

  it('OFF-TENANT-1: isOwnOp từ chối cả user khác và cùng user ở parish khác', async () => {
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'USER-A', parishId: 'PARISH-A' }))
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-1', userId: 'USER-A', parishId: 'PARISH-A' },
      { id: 'OP-2', userId: 'USER-B', parishId: 'PARISH-A' },
      { id: 'OP-4', userId: 'USER-A', parishId: 'PARISH-B' },
      { id: 'OP-3' }, // un-migrated legacy op
    ])

    const count = await useSyncStore.getState().refreshCount()
    expect(count).toBe(1)
    localStorage.removeItem('parish_current_user')
  })

  it('OFF-TENANT-1: legacy queue migration quarantines rows without guessing parish ownership', async () => {
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'USER-MIGRATED', parishId: 'PARISH-A' }))
    setTenantScope({ userId: 'USER-MIGRATED', parishId: 'PARISH-A' })
    mockTable.filter.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { id: 'OP-LEGACY-1', payload: '{}' },
      ]),
    })

    await migrateLegacyQueueUserIds()

    expect(mockTable.update).toHaveBeenCalledWith('OP-LEGACY-1', expect.objectContaining({
      status: 'failed',
      lastError: expect.stringMatching(/^enc:v1:/),
      updatedAt: expect.any(String),
    }))
    localStorage.removeItem('parish_current_user')
  })

  it('OS-04 Atomic Dexie Transaction: addOp bọc ghi trong transaction', async () => {
    mockTable.put.mockResolvedValue(undefined)
    mockTable.toArray.mockResolvedValue([])

    await useSyncStore.getState().addOp({
      entity: 'student',
      entityId: 'ST-100',
      operation: 'UPDATE',
      payload: JSON.stringify({ fullName: 'Test' }),
    })

    expect(mockDb.transaction).toHaveBeenCalledWith('rw', mockTable, expect.any(Function))
  })
})
