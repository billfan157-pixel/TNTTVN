import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('../router', () => ({ router: {} }))
vi.mock('../lib/syncProcessor', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/syncProcessor')>()
  return { ...mod, getBackoffMs: () => 0 }
})

import { initDB, getDB } from '../lib/db'
import { useSyncStore } from '../stores/syncStore'
import {
  flushGradeBatchWithIsolation,
  flushAttendanceBatchWithIsolation,
  extractZodBadIndexes,
} from '../lib/syncCoordinator'
import { api, ApiError } from '../lib/api'
import { decryptQueueValue } from '../lib/offlineCipher'

const OWNER = { userId: 'U-TEST', parishId: 'PARISH-TEST' }

// A-NEW-32: updateOp mã hóa lastError — assert phải giải mã (dual-format giữ nguyên
// plaintext legacy nên các test seed trực tiếp vẫn pass).
async function readLastError(item: { lastError: string | null }): Promise<string> {
  return (await decryptQueueValue(item.lastError || '')) || ''
}

beforeEach(async () => {
  localStorage.setItem('parish_current_user', JSON.stringify({ id: OWNER.userId, parishId: OWNER.parishId }))
  await initDB()
  const db = getDB()
  await db.syncQueue.clear()
  await db.syncMeta.clear()
  await db.stores.clear()
  await useSyncStore.getState().refreshCount()
  useSyncStore.getState().setStatus('idle')
  useSyncStore.getState().setLastError(null)
  vi.restoreAllMocks()
  vi.spyOn(api, 'batchUpsertGrades')
  vi.spyOn(api, 'upsertGrade')
  vi.spyOn(api, 'batchUpsertAttendance')
  vi.spyOn(api, 'upsertAttendance')
})

function mkOp(overrides: Record<string, unknown> = {}) {
  return {
    id: 'op-' + Math.random().toString(36).slice(2, 8),
    entityType: 'grade',
    entityId: 'ST-001',
    localId: 'L-1',
    payload: JSON.stringify({ studentId: 'ST-001', semester: 1, academicYear: '2026 - 2027' }),
    version: 0,
    retryCount: 0,
    errorCount: 0,
    status: 'pending',
    lastError: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...OWNER,
    ...overrides,
  } as any
}

const state = { mergedConflictCount: 0, serverWinsConflictCount: 0 }

function zodErr(root: string, indexes: number[], field = 'academicYear') {
  const err: any = new Error('Bad Request')
  err.status = 400
  err.issues = indexes.map(i => ({
    code: 'too_small',
    minimum: 1,
    type: 'string',
    message: 'String must contain at least 1 character(s)',
    path: [root, i, field],
  }))
  return err
}

describe('extractZodBadIndexes', () => {
  it('parses zod issues into bad indexes + messages', () => {
    const res = extractZodBadIndexes({ issues: [{ path: ['grades', 21, 'academicYear'], message: 'String must contain at least 1 character(s)' }] }, 'grades', 50)
    expect(res).not.toBeNull()
    expect(res!.badIndexes).toEqual(new Set([21]))
    expect(res!.messages.get(21)).toMatch(/Client error 400: academicYear — /)
  })

  it('ignores paths outside root and out-of-range indexes', () => {
    const res = extractZodBadIndexes({ issues: [{ path: ['records', 0, 'studentId'], message: 'x' }, { path: ['grades', 99, 'academicYear'], message: 'y' }] }, 'grades', 5)
    expect(res).not.toBeNull()
    expect(res!.badIndexes.size).toBe(0)
  })

  it('returns null when no issues array', () => {
    expect(extractZodBadIndexes(new Error('boom'), 'grades', 5)).toBeNull()
    expect(extractZodBadIndexes({ issues: [] }, 'grades', 5)).toBeNull()
  })
})

describe('flushGradeBatchWithIsolation', () => {
  it('marks only zod-invalid record failed and resends the rest', async () => {
    const op0 = mkOp({ entityId: 'ST-BAD', payload: JSON.stringify({ studentId: 'ST-BAD', semester: 1, academicYear: '' }) })
    const op1 = mkOp({ entityId: 'ST-OK', payload: JSON.stringify({ studentId: 'ST-OK', semester: 1, academicYear: '2026 - 2027' }) })
    const db = getDB()
    const store = useSyncStore.getState()
    await db.syncQueue.bulkAdd([op0, op1])

    const sp = vi.mocked(api.batchUpsertGrades)
    sp.mockRejectedValueOnce(zodErr('grades', [0]))
      .mockResolvedValueOnce({ results: [{ studentId: 'ST-OK', status: 'saved' }] } as any)

    await flushGradeBatchWithIsolation([JSON.parse(op0.payload), JSON.parse(op1.payload)], [op0, op1], store, state)

    expect(sp).toHaveBeenCalledTimes(2)
    const after0 = (await db.syncQueue.get(op0.id))!
    expect(after0.status).toBe('failed')
    expect(await readLastError(after0)).toMatch(/Client error 400/)
    expect(await db.syncQueue.get(op1.id)).toBeUndefined()
    expect(useSyncStore.getState().lastError).toMatch(/Đã cách ly 1 bản ghi điểm/)
    expect(state.mergedConflictCount).toBe(0)
  })

  it('saves all records on a clean batch', async () => {
    const op0 = mkOp()
    const op1 = mkOp({ id: 'op-x2', localId: 'L-2', payload: JSON.stringify({ studentId: 'ST-002', semester: 1, academicYear: '2026 - 2027' }) })
    const db = getDB()
    const store = useSyncStore.getState()
    await db.syncQueue.bulkAdd([op0, op1])

    vi.mocked(api.batchUpsertGrades).mockResolvedValue({
      results: [{ studentId: 'ST-001', status: 'saved' }, { studentId: 'ST-002', status: 'saved' }],
    } as any)

    await flushGradeBatchWithIsolation([JSON.parse(op0.payload), JSON.parse(op1.payload)], [op0, op1], store, state)

    expect(await db.syncQueue.get(op0.id)).toBeUndefined()
    expect(await db.syncQueue.get(op1.id)).toBeUndefined()
  })

  it('falls back to per-record send when 4xx has no usable issues', async () => {
    const op0 = mkOp({ entityId: 'ST-BAD' })
    const db = getDB()
    const store = useSyncStore.getState()
    await db.syncQueue.bulkAdd([op0])
    const bad = new ApiError(400, 'zod', '')
    const sp = vi.mocked(api.batchUpsertGrades)
    sp.mockRejectedValueOnce(bad)
    vi.mocked(api.upsertGrade).mockResolvedValueOnce({ id: 'GR-1' } as any)

    await flushGradeBatchWithIsolation([JSON.parse(op0.payload)], [op0], store, state)

    expect(sp).toHaveBeenCalledTimes(1)
    expect(await db.syncQueue.get(op0.id)).toBeUndefined()
  })
})

describe('flushAttendanceBatchWithIsolation', () => {
  it('marks only zod-invalid record failed and resends the rest', async () => {
    const op0 = mkOp({ entityType: 'attendance', entityId: 'ST-BAD', payload: JSON.stringify({ studentId: 'ST-BAD', status: 'Present' }) })
    const op1 = mkOp({ entityType: 'attendance', entityId: 'ST-OK', localId: 'L-2', payload: JSON.stringify({ studentId: 'ST-OK', status: 'Present' }) })
    const db = getDB()
    const store = useSyncStore.getState()
    await db.syncQueue.bulkAdd([op0, op1])

    const sp = vi.mocked(api.batchUpsertAttendance)
    sp.mockRejectedValueOnce(zodErr('records', [0], 'studentId'))
      .mockResolvedValueOnce({ results: [{ studentId: 'ST-OK', status: 'saved' }] } as any)

    await flushAttendanceBatchWithIsolation([op0, op1], { date: '2026-08-02', type: 'SundayMass' }, store, state)

    expect(sp).toHaveBeenCalledTimes(2)
    const after0 = (await db.syncQueue.get(op0.id))!
    expect(after0.status).toBe('failed')
    expect(await readLastError(after0)).toMatch(/Client error 400/)
    expect(await db.syncQueue.get(op1.id)).toBeUndefined()
  })

  it('treats skipped (idempotent) results as saved', async () => {
    const op0 = mkOp({ entityType: 'attendance', payload: JSON.stringify({ studentId: 'ST-001', status: 'Present' }) })
    const db = getDB()
    const store = useSyncStore.getState()
    await db.syncQueue.bulkAdd([op0])

    vi.mocked(api.batchUpsertAttendance).mockResolvedValue({
      results: [{ studentId: 'ST-001', status: 'skipped' }],
    } as any)

    await flushAttendanceBatchWithIsolation([op0], { date: '2026-08-02', type: 'SundayMass' }, store, state)

    expect(await db.syncQueue.get(op0.id)).toBeUndefined()
  })
})
