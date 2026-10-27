import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type SyncQueueItem } from '../lib/db'
import { captureTenantScope, setTenantScope } from '../lib/tenantScope'
import { persistSyncResultForOwner, readPersistedSyncResult } from '../lib/syncSessionBoundary'
import { applyServerResultAsync, resolveConflictWithMerge } from '../lib/syncApply'
import { useGradeStore } from '../stores/gradeStore'
import { useDailyGradeStore } from '../stores/dailyGradeStore'

const now = '2026-09-17T00:00:00.000Z'

function row(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: 'OP-A', entity: 'grade', entityId: 'GRADE-A', operation: 'UPDATE',
    payload: JSON.stringify({ id: 'GRADE-A', scoreFinal: 9 }), retryCount: 0,
    lastError: null, createdAt: now, updatedAt: now, status: 'processing',
    deviceId: 'DEV-A', userId: 'USER-A', parishId: 'PARISH-A', ...overrides,
  }
}

describe('TENANT-P1-004 response and conflict owner continuity', () => {
  beforeEach(async () => {
    await db.syncQueue.clear()
    await db.syncConflicts.clear()
    useGradeStore.setState({ grades: [] })
    setTenantScope({ parishId: 'PARISH-A', userId: 'USER-A' })
  })

  afterEach(() => setTenantScope(null))

  it('journals a late A response to A but never applies it into B live state', async () => {
    const op = row()
    await db.syncQueue.put(op)
    const ownerA = captureTenantScope()!

    setTenantScope({ parishId: 'PARISH-B', userId: 'USER-B' })
    await persistSyncResultForOwner(op, { ok: true, data: { id: 'GRADE-A', scoreFinal: 9 } })
    const retained = await db.syncQueue.get(op.id)
    expect(retained).toMatchObject({ userId: 'USER-A', parishId: 'PARISH-A', status: 'retrying' })
    expect(await readPersistedSyncResult(retained!)).toMatchObject({ ok: true, data: { id: 'GRADE-A' } })

    await expect(applyServerResultAsync(op, { id: 'GRADE-A', scoreFinal: 9 }, ownerA))
      .rejects.toThrow(/owner changed/i)
    expect(useGradeStore.getState().grades).toEqual([])
    expect(await db.syncQueue.get(op.id)).toBeDefined()
  })

  it('safely aborts conflict reconciliation after A to B without creating B ownership', async () => {
    const op = row({ id: 'OP-CONFLICT-A' })
    await db.syncQueue.put(op)
    const ownerA = captureTenantScope()!
    await persistSyncResultForOwner(op, { ok: true, isConflict: true, data: { id: 'GRADE-A', version: 2, scoreFinal: 7 } })

    setTenantScope({ parishId: 'PARISH-B', userId: 'USER-B' })
    await expect(resolveConflictWithMerge(op, { id: 'GRADE-A', version: 2, scoreFinal: 7 }, ownerA))
      .rejects.toThrow(/owner changed/i)
    expect(await db.syncConflicts.toArray()).toEqual([])
    expect(await db.syncQueue.get(op.id)).toMatchObject({ userId: 'USER-A', parishId: 'PARISH-A' })
  })

  it('pulls current attempts for a bonus receipt instead of overwriting them with an old replayed score', async () => {
    const refresh = vi.spyOn(useDailyGradeStore.getState(), 'fetchDailyEntries').mockResolvedValue(undefined)
    const op = row({ entity: 'daily_entry', operation: 'CREATE', entityId: 'DB-A' })
    try {
      await applyServerResultAsync(op, { id: 'DB-A', items: [{ id: 'DB-A', operation: 'bonus', status: 'duplicate', studentId: 'ST-A', targetEntryId: 'DG-A', serverScore: 9, academicYear: '2026-2027', semester: 1 }] }, captureTenantScope()!)
      expect(refresh).toHaveBeenCalledExactlyOnceWith({ studentId: 'ST-A', academicYear: '2026-2027', semester: 1 })
    } finally { refresh.mockRestore() }
  })
})
