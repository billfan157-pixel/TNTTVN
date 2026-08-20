import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDB, type SyncConflict, type SyncQueueItem } from '../lib/db'
import { decryptQueueValue } from '../lib/offlineCipher'
import { promoteTransientFailedOps, remapNoticeIdInPendingOps } from '../hooks/useSyncEngine'
import { useSyncStore } from '../stores/syncStore'

const NOW = '2026-08-21T00:00:00.000Z'

function setCurrentUser(id: string) {
  localStorage.setItem('parish_current_user', JSON.stringify({ id, role: 'admin', parishId: 'gia-ton' }))
}

function queueItem(overrides: Partial<SyncQueueItem>): SyncQueueItem {
  return {
    id: 'OP-default',
    entity: 'notice',
    entityId: 'TEMP-1',
    operation: 'UPDATE',
    payload: JSON.stringify({ id: 'TEMP-1' }),
    retryCount: 5,
    lastError: 'Network error',
    createdAt: NOW,
    updatedAt: NOW,
    status: 'failed',
    deviceId: 'DEV-test',
    userId: 'USER-A',
    ...overrides,
  }
}

function conflict(overrides: Partial<SyncConflict>): SyncConflict {
  return {
    id: 'CONF-default',
    entity: 'grade',
    entityId: 'GRADE-1',
    operation: 'UPDATE',
    localValue: '{}',
    serverValue: '{}',
    resolved: false,
    createdAt: NOW,
    userId: 'USER-A',
    ...overrides,
  }
}

describe('offline sync per-user isolation', () => {
  beforeEach(async () => {
    localStorage.clear()
    setCurrentUser('USER-A')
    const db = getDB()
    await db.syncQueue.clear()
    await db.syncConflicts.clear()
  })

  it('promotes transient failed operations only for the current user', async () => {
    const db = getDB()
    await db.syncQueue.bulkPut([
      queueItem({ id: 'OP-A', userId: 'USER-A' }),
      queueItem({ id: 'OP-B', userId: 'USER-B' }),
    ])

    await promoteTransientFailedOps()

    const mine = await db.syncQueue.get('OP-A')
    const foreign = await db.syncQueue.get('OP-B')
    expect(mine?.status).toBe('pending')
    expect(mine?.retryCount).toBe(0)
    expect(foreign?.status).toBe('failed')
    expect(foreign?.retryCount).toBe(5)
  })

  it('remaps notice temp IDs only inside the current user queue', async () => {
    const db = getDB()
    await db.syncQueue.bulkPut([
      queueItem({ id: 'OP-A', userId: 'USER-A', status: 'pending', retryCount: 0, lastError: null }),
      queueItem({ id: 'OP-B', userId: 'USER-B', status: 'pending', retryCount: 0, lastError: null }),
    ])

    await remapNoticeIdInPendingOps('TEMP-1', 'NOTICE-REAL')

    const mine = await db.syncQueue.get('OP-A')
    const foreign = await db.syncQueue.get('OP-B')
    expect(mine?.entityId).toBe('NOTICE-REAL')
    expect(foreign?.entityId).toBe('TEMP-1')

    const minePayload = JSON.parse((await decryptQueueValue(mine?.payload || '')) || '{}')
    const foreignPayload = JSON.parse((await decryptQueueValue(foreign?.payload || '')) || '{}')
    expect(minePayload.id).toBe('NOTICE-REAL')
    expect(foreignPayload.id).toBe('TEMP-1')
  })

  it('cannot resolve another user conflict by id', async () => {
    const db = getDB()
    await db.syncConflicts.bulkPut([
      conflict({ id: 'CONF-A', userId: 'USER-A' }),
      conflict({ id: 'CONF-B', userId: 'USER-B' }),
    ])

    await useSyncStore.getState().resolveConflict('CONF-B')
    expect((await db.syncConflicts.get('CONF-B'))?.resolved).toBe(false)

    await useSyncStore.getState().resolveConflict('CONF-A')
    expect((await db.syncConflicts.get('CONF-A'))?.resolved).toBe(true)
  })

  it('clears only resolved conflicts owned by the current user', async () => {
    const db = getDB()
    await db.syncConflicts.bulkPut([
      conflict({ id: 'CONF-A', userId: 'USER-A', resolved: true }),
      conflict({ id: 'CONF-B', userId: 'USER-B', resolved: true }),
      conflict({ id: 'CONF-A-OPEN', userId: 'USER-A', resolved: false }),
    ])

    await useSyncStore.getState().clearResolvedConflicts()

    expect(await db.syncConflicts.get('CONF-A')).toBeUndefined()
    expect(await db.syncConflicts.get('CONF-B')).toBeDefined()
    expect(await db.syncConflicts.get('CONF-A-OPEN')).toBeDefined()
  })
})
