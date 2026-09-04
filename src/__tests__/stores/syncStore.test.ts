import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockTable: Record<string, any> = {
  put: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  where: vi.fn(),
  toArray: vi.fn(),
  count: vi.fn(),
  get: vi.fn(),
}

const OWNER = { userId: 'USR-A', parishId: 'PARISH-A' }

let storedCryptoKey: CryptoKey | null = null

const mockDb = {
  syncQueue: mockTable,
  syncConflicts: mockTable,
  transaction: vi.fn().mockImplementation((_mode: any, _table: any, cb: () => any) => cb()),
  cryptoKeys: {
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockImplementation(async (row: { key: CryptoKey }) => { storedCryptoKey = row.key }),
    toArray: vi.fn().mockImplementation(async () =>
      storedCryptoKey ? [{ key: storedCryptoKey, createdAt: '2026-01-01T00:00:00Z' }] : []
    ),
  },
}

vi.mock('../../lib/db', () => ({
  getDB: () => mockDb,
  dexieStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

const { useSyncStore } = await import('../../stores/syncStore')

beforeEach(() => {
  useSyncStore.setState({ status: 'idle', pendingCount: 0, lastSyncAt: null, lastError: null })
  vi.clearAllMocks()
  localStorage.setItem('parish_current_user', JSON.stringify({ id: OWNER.userId, parishId: OWNER.parishId }))

  mockTable.where.mockReturnThis()
  mockTable.anyOf = vi.fn().mockReturnThis()
  mockTable.equals = vi.fn().mockReturnThis()
  mockTable.filter = vi.fn().mockReturnThis()
  // Default: empty queue reads (refreshCount/addOp dedupe query toArray).
  mockTable.toArray.mockResolvedValue([])
  mockTable.get.mockResolvedValue({ id: 'OWNED', ...OWNER })
})

describe('syncStore', () => {
  it('initDevice sets deviceId from localStorage', () => {
    localStorage.setItem('parish_device_id', 'DEV-test123')
    useSyncStore.getState().initDevice()
    expect(useSyncStore.getState().deviceId).toBe('DEV-test123')
    localStorage.removeItem('parish_device_id')
  })

  it('setStatus updates sync status', () => {
    useSyncStore.getState().setStatus('syncing')
    expect(useSyncStore.getState().status).toBe('syncing')
  })

  it('setLastSync stores timestamp', () => {
    const ts = new Date().toISOString()
    useSyncStore.getState().setLastSync(ts)
    expect(useSyncStore.getState().lastSyncAt).toBe(ts)
  })

  it('setLastError stores error message', () => {
    useSyncStore.getState().setLastError('Network error')
    expect(useSyncStore.getState().lastError).toBe('Network error')
  })

  it('refreshCount queries pending items', async () => {
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-1', ...OWNER }, { id: 'OP-2', ...OWNER }, { id: 'OP-3', ...OWNER }, { id: 'OP-4', ...OWNER }, { id: 'OP-5', ...OWNER },
    ])
    const count = await useSyncStore.getState().refreshCount()
    expect(count).toBe(5)
    expect(useSyncStore.getState().pendingCount).toBe(5)
  })

  it('getPendingOps returns sorted pending operations', async () => {
    const ops = [
      { id: 'OP-2', createdAt: '2025-01-02T00:00:00Z', ...OWNER },
      { id: 'OP-1', createdAt: '2025-01-01T00:00:00Z', ...OWNER },
    ]
    mockTable.toArray.mockResolvedValue(ops)
    const result = await useSyncStore.getState().getPendingOps()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('OP-1')
    expect(result[1].id).toBe('OP-2')
  })

  it('addOp inserts a new operation into Dexie', async () => {
    mockTable.put.mockResolvedValue(undefined)
    const id = await useSyncStore.getState().addOp({
      entity: 'student',
      entityId: 'ST-001',
      operation: 'CREATE',
      payload: JSON.stringify({ fullName: 'Test' }),
    })
    expect(id).toMatch(/^OP-/)
    expect(mockTable.put).toHaveBeenCalledTimes(1)
    const inserted = mockTable.put.mock.calls[0][0]
    expect(inserted.entity).toBe('student')
    expect(inserted.entityId).toBe('ST-001')
    expect(inserted.operation).toBe('CREATE')
    expect(inserted.status).toBe('pending')
    expect(inserted.retryCount).toBe(0)
    expect(inserted.deviceId).toBeTruthy()
    expect(inserted).toEqual(expect.objectContaining(OWNER))
  })

  it('addOp deduplicates identical pending op (merges payload, keeps original id)', async () => {
    mockTable.put.mockResolvedValue(undefined)
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-OLD', entity: 'student', entityId: 'ST-001', operation: 'UPDATE', payload: '{"fullName":"A"}', createdAt: '2025-01-01T00:00:00Z', ...OWNER },
    ])
    const id = await useSyncStore.getState().addOp({
      entity: 'student',
      entityId: 'ST-001',
      operation: 'UPDATE',
      payload: JSON.stringify({ fullName: 'B' }),
    })
    expect(id).toBe('OP-OLD')
    // A-NEW-32: payload dedupe được mã hóa (AAD 'syncQueue') trước khi ghi.
    expect(mockTable.update).toHaveBeenCalledWith('OP-OLD', expect.objectContaining({ payload: expect.stringMatching(/^enc:v1:/) }))
    expect(mockTable.delete).toHaveBeenCalledTimes(1)
  })

  it('removeOp deletes from Dexie and refreshes count', async () => {
    mockTable.delete.mockResolvedValue(undefined)
    await useSyncStore.getState().removeOp('OP-001')
    expect(mockTable.delete).toHaveBeenCalledWith('OP-001')
    expect(useSyncStore.getState().pendingCount).toBe(0)
  })

  it('updateOp updates fields and sets updatedAt', async () => {
    await useSyncStore.getState().updateOp('OP-001', { status: 'completed' })
    expect(mockTable.update).toHaveBeenCalledWith('OP-001', expect.objectContaining({
      status: 'completed',
      updatedAt: expect.any(String),
    }))
  })

  it('compactQueue cancels CREATE+DELETE pair when CREATE is pending and unsent', async () => {
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-1', entity: 'student', entityId: 'ST-001', operation: 'CREATE', payload: '{}', status: 'pending', retryCount: 0, createdAt: '2025-01-01T00:00:00Z', ...OWNER },
      { id: 'OP-2', entity: 'student', entityId: 'ST-001', operation: 'DELETE', payload: '{}', status: 'pending', retryCount: 0, createdAt: '2025-01-02T00:00:00Z', ...OWNER },
    ])
    mockTable.count.mockResolvedValue(0)
    await useSyncStore.getState().compactQueue()
    expect(mockTable.delete).toHaveBeenCalledTimes(2)
  })

  it('compactQueue keeps BOTH CREATE+DELETE when CREATE was retrying (OS-01 Keep-BOTH)', async () => {
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-1', entity: 'student', entityId: 'ST-001', operation: 'CREATE', payload: '{}', status: 'retrying', retryCount: 1, createdAt: '2025-01-01T00:00:00Z', ...OWNER },
      { id: 'OP-2', entity: 'student', entityId: 'ST-001', operation: 'DELETE', payload: '{}', status: 'pending', retryCount: 0, createdAt: '2025-01-02T00:00:00Z', ...OWNER },
    ])
    mockTable.count.mockResolvedValue(2)
    await useSyncStore.getState().compactQueue()
    expect(mockTable.delete).not.toHaveBeenCalled()
  })

  it('compactQueue merges multiple UPDATEs keeping the last', async () => {
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-1', entity: 'student', entityId: 'ST-001', operation: 'UPDATE', payload: JSON.stringify({ fullName: 'A' }), createdAt: '2025-01-01T00:00:00Z', ...OWNER },
      { id: 'OP-2', entity: 'student', entityId: 'ST-001', operation: 'UPDATE', payload: JSON.stringify({ fullName: 'B' }), createdAt: '2025-01-02T00:00:00Z', ...OWNER },
    ])
    mockTable.count.mockResolvedValue(1)
    await useSyncStore.getState().compactQueue()
    expect(mockTable.delete).toHaveBeenCalledTimes(1)
    expect(mockTable.delete).toHaveBeenCalledWith('OP-1')
  })

  it('compactQueue merges payloads after CREATE', async () => {
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-1', entity: 'student', entityId: 'ST-001', operation: 'CREATE', payload: JSON.stringify({ fullName: 'A' }), createdAt: '2025-01-01T00:00:00Z', ...OWNER },
      { id: 'OP-2', entity: 'student', entityId: 'ST-001', operation: 'UPDATE', payload: JSON.stringify({ fullName: 'A B' }), createdAt: '2025-01-02T00:00:00Z', ...OWNER },
    ])
    mockTable.count.mockResolvedValue(1)
    await useSyncStore.getState().compactQueue()
    expect(mockTable.delete).toHaveBeenCalledTimes(1)
    expect(mockTable.delete).toHaveBeenCalledWith('OP-2')
    expect(mockTable.update).toHaveBeenCalledTimes(1)
  })

  it('SYNC-CONFLICT-2: compactQueue merge UPDATE theo FIELD — edit 2 field ở 2 phiên đều giữ nguyên', async () => {
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-1', entity: 'student', entityId: 'ST-001', operation: 'UPDATE', payload: JSON.stringify({ fullName: 'A' }), createdAt: '2025-01-01T00:00:00Z', ...OWNER },
      { id: 'OP-2', entity: 'student', entityId: 'ST-001', operation: 'UPDATE', payload: JSON.stringify({ parentPhone: '0901234567' }), createdAt: '2025-01-02T00:00:00Z', ...OWNER },
    ])
    mockTable.count.mockResolvedValue(1)
    await useSyncStore.getState().compactQueue()
    expect(mockTable.delete).toHaveBeenCalledTimes(1)
    expect(mockTable.delete).toHaveBeenCalledWith('OP-1')

    // Payload của op cuối phải chứa CẢ hai field (merge), không chỉ parentPhone.
    const updateCall = (mockTable.update as any).mock.calls.find((c: any[]) => c[0] === 'OP-2')
    expect(updateCall).toBeTruthy()
    const { decryptQueueValue } = await import('../../lib/offlineCipher')
    const decrypted = await decryptQueueValue(updateCall[1].payload)
    expect(decrypted).not.toBeNull()
    expect(JSON.parse(decrypted!)).toEqual({ fullName: 'A', parentPhone: '0901234567' })
  })

  it('clearCompleted removes completed operations', async () => {
    mockTable.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    })
    await useSyncStore.getState().clearCompleted()
    expect(mockTable.where).toHaveBeenCalledWith('status')
  })

  it('refreshCount chỉ đếm op có đúng parishId + userId của context hiện tại', async () => {
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'USR-A', parishId: 'PARISH-A' }))
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-1', userId: 'USR-A', parishId: 'PARISH-A' },
      { id: 'OP-2', userId: 'USR-B', parishId: 'PARISH-A' },
      { id: 'OP-OTHER-PARISH', userId: 'USR-A', parishId: 'PARISH-B' },
      { id: 'OP-3' }, // op legacy (chưa có userId) -> fail-closed không tính nếu chưa migrate
    ])
    const count = await useSyncStore.getState().refreshCount()
    expect(count).toBe(1)
    localStorage.removeItem('parish_current_user')
  })

  it('addOp merge payload nhưng GIỮ NGUYÊN retryCount/lastError/status (finding #13)', async () => {
    mockTable.put.mockResolvedValue(undefined)
    mockTable.toArray.mockResolvedValue([
      {
        id: 'OP-OLD', entity: 'grade', entityId: 'ST-001', operation: 'UPDATE',
        payload: '{"scoreFinal":7}', createdAt: '2025-01-01T00:00:00Z', ...OWNER,
        status: 'retrying', retryCount: 4, lastError: 'Server error 500',
      },
    ])
    await useSyncStore.getState().addOp({
      entity: 'grade',
      entityId: 'ST-001',
      operation: 'UPDATE',
      payload: JSON.stringify({ scoreFinal: 8 }),
    })
    expect(mockTable.update).toHaveBeenCalledTimes(1)
    const updatePayload = mockTable.update.mock.calls[0][1]
    expect(updatePayload).toEqual(expect.objectContaining({
      // A-NEW-32: merge payload cũng được mã hóa (không còn plaintext trong queue).
      payload: expect.stringMatching(/^enc:v1:/),
      updatedAt: expect.any(String),
    }))
    expect(updatePayload).not.toHaveProperty('retryCount')
    expect(updatePayload).not.toHaveProperty('lastError')
    expect(updatePayload).not.toHaveProperty('status')
  })

  it('compactQueue KHÔNG merge op của user khác (finding #3)', async () => {
    mockTable.toArray.mockResolvedValue([
      { id: 'OP-1', entity: 'student', entityId: 'ST-001', operation: 'UPDATE', payload: '{"fullName":"A"}', createdAt: '2025-01-01T00:00:00Z', ...OWNER },
      { id: 'OP-2', entity: 'student', entityId: 'ST-001', operation: 'UPDATE', payload: '{"fullName":"B"}', createdAt: '2025-01-02T00:00:00Z', userId: 'USR-B', parishId: 'PARISH-A' },
    ])
    mockTable.count.mockResolvedValue(2)
    await useSyncStore.getState().compactQueue()
    expect(mockTable.delete).not.toHaveBeenCalled()
  })

  it('clearCompleted chỉ xóa op của đúng tenant + user hiện tại', async () => {
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'USR-A', parishId: 'PARISH-A' }))
    mockTable.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { id: 'OP-DONE-1', userId: 'USR-A', parishId: 'PARISH-A' },
          { id: 'OP-DONE-2', userId: 'USR-B', parishId: 'PARISH-A' },
        ]),
      }),
    })
    await useSyncStore.getState().clearCompleted()
    expect(mockTable.delete).toHaveBeenCalledTimes(1)
    expect(mockTable.delete).toHaveBeenCalledWith('OP-DONE-1')
    localStorage.removeItem('parish_current_user')
  })

  it('addConflict lưu localValue đã mã hóa; giải mã khôi phục dữ liệu gốc (A2 conflict inbox)', async () => {
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'USR-A', parishId: 'PARISH-A' }))
    mockTable.put.mockResolvedValue(undefined)
    mockTable.toArray.mockResolvedValue([])
    mockTable.add = vi.fn().mockResolvedValue(undefined)

    await useSyncStore.getState().addOp({
      entity: 'student',
      entityId: 'ST-001',
      operation: 'CREATE',
      payload: JSON.stringify({ fullName: 'Nguyễn Văn A', phone: '0901234567' }),
    })
    const storedOp = mockTable.put.mock.calls[0][0]
    expect(storedOp.payload).toMatch(/^enc:v1:/)

    await useSyncStore.getState().addConflict({
      entity: 'student',
      entityId: 'ST-001',
      operation: 'CREATE',
      localValue: storedOp.payload,
      serverValue: 'enc:v1:server-value',
    })
    expect(mockTable.add).toHaveBeenCalledTimes(1)
    const item = mockTable.add.mock.calls[0][0]
    expect(item.id).toMatch(/^CONF-/)
    expect(item.resolved).toBe(false)
    expect(item.userId).toBe('USR-A')
    expect(item.parishId).toBe('PARISH-A')
    expect(item.localValue).toMatch(/^enc:v1:/)

    // ConflictInboxModal (A2): giải mã ở UI — ciphertext phải khôi phục được dữ liệu thật.
    const { decryptQueueValue } = await import('../../lib/offlineCipher')
    const decrypted = await decryptQueueValue(item.localValue)
    expect(decrypted).not.toBeNull()
    expect(JSON.parse(decrypted!)).toEqual({ fullName: 'Nguyễn Văn A', phone: '0901234567' })
  })
})
