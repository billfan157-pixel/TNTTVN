import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))
vi.mock('../router', () => ({ router: {} }))

import { initDB, getDB } from '../lib/db'
import { promoteTransientFailedOps, pruneStaleQueueItems } from '../lib/syncCoordinator'
import { setTenantScope } from '../lib/tenantScope'

const OWNER = { userId: 'U-TEST', parishId: 'PARISH-TEST' }

async function resetDB() {
  const db = getDB()
  await db.syncQueue.clear()
  await db.syncMeta.clear()
  await db.stores.clear()
}

describe('Sync Engine — Auto-recover transient failed ops (audit finding #10)', () => {
  beforeEach(async () => {
    await initDB()
    await resetDB()
    localStorage.setItem('parish_current_user', JSON.stringify({ id: OWNER.userId, parishId: OWNER.parishId }))
    setTenantScope(OWNER)
  })

  it('promotes failed ops do lỗi tạm thời (network/5xx) về pending, reset retryCount', async () => {
    const db = getDB()
    const now = new Date().toISOString()
    await db.syncQueue.bulkAdd([
      {
        id: 'OP-X1', entity: 'grade', entityId: 'ST-1', operation: 'UPDATE',
        status: 'failed', retryCount: 5, lastError: 'Network request failed',
        payload: '{}', createdAt: now, updatedAt: now, deviceId: 'DEV-T', ...OWNER,
      },
      {
        id: 'OP-Y1', entity: 'attendance', entityId: 'ST-2', operation: 'UPDATE',
        status: 'failed', retryCount: 5, lastError: 'Server error 500 processing request',
        payload: '{}', createdAt: now, updatedAt: now, deviceId: 'DEV-T', ...OWNER,
      },
    ])

    await promoteTransientFailedOps()

    const x = await db.syncQueue.get('OP-X1')
    const y = await db.syncQueue.get('OP-Y1')
    expect(x?.status).toBe('pending')
    expect(x?.retryCount).toBe(0)
    expect(x?.lastError).toBeNull()
    expect(y?.status).toBe('pending')
  })

  it('prunes completed rows and only stale failed rows owned by the active context', async () => {
    const db = getDB()
    const now = Date.now()
    const old = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString()
    const recent = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
    await db.syncQueue.bulkAdd([
      { id: 'OP-C1', entity: 'grade', entityId: 'ST-1', operation: 'UPDATE', status: 'completed', retryCount: 0, lastError: null, payload: '{}', createdAt: recent, updatedAt: recent, deviceId: 'DEV-T', ...OWNER },
      { id: 'OP-F1', entity: 'grade', entityId: 'ST-2', operation: 'UPDATE', status: 'failed', retryCount: 5, lastError: 'Permanent error', payload: '{}', createdAt: old, updatedAt: old, deviceId: 'DEV-T', ...OWNER },
      { id: 'OP-F2', entity: 'grade', entityId: 'ST-3', operation: 'UPDATE', status: 'failed', retryCount: 5, lastError: 'Recent error', payload: '{}', createdAt: recent, updatedAt: recent, deviceId: 'DEV-T', ...OWNER },
      { id: 'OP-F3', entity: 'grade', entityId: 'ST-4', operation: 'UPDATE', status: 'failed', retryCount: 5, lastError: 'Other user', payload: '{}', createdAt: old, updatedAt: old, deviceId: 'DEV-T', userId: 'OTHER-USER', parishId: OWNER.parishId },
    ])

    const removed = await pruneStaleQueueItems(now)

    expect(removed).toBe(2)
    expect(await db.syncQueue.get('OP-C1')).toBeUndefined()
    expect(await db.syncQueue.get('OP-F1')).toBeUndefined()
    expect(await db.syncQueue.get('OP-F2')).toBeDefined()
    expect(await db.syncQueue.get('OP-F3')).toBeDefined()
  })

  it('KHÔNG promote op fail do lỗi vĩnh viễn (4xx / unknown entityType)', async () => {
    const db = getDB()
    const now = new Date().toISOString()
    await db.syncQueue.bulkAdd([
      {
        id: 'OP-P1', entity: 'student', entityId: 'ST-1', operation: 'CREATE',
        status: 'failed', retryCount: 5, lastError: 'Client error 400: Bad Request',
        payload: '{}', createdAt: now, updatedAt: now, deviceId: 'DEV-T', ...OWNER,
      },
      {
        id: 'OP-P2', entity: 'class', entityId: 'C-1', operation: 'CREATE',
        status: 'failed', retryCount: 5, lastError: 'Unknown entityType: nonsense',
        payload: '{}', createdAt: now, updatedAt: now, deviceId: 'DEV-T', ...OWNER,
      },
    ])

    await promoteTransientFailedOps()

    const p1 = await db.syncQueue.get('OP-P1')
    const p2 = await db.syncQueue.get('OP-P2')
    expect(p1?.status).toBe('failed')
    expect(p2?.status).toBe('failed')
  })
})
