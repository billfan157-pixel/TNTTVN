import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDB, initDB } from '../lib/db'
import { decryptQueueValue } from '../lib/offlineCipher'
import { migrateLegacyQueueOwnership, useSyncStore } from '../stores/syncStore'

const USER_ID = 'SHARED-USER-ID'
const PARISH_A = 'PARISH-A'
const PARISH_B = 'PARISH-B'

function activate(parishId: string) {
  localStorage.setItem('parish_current_user', JSON.stringify({ id: USER_ID, parishId }))
}

describe('OFF-TENANT-1 durable sync ownership', () => {
  beforeEach(async () => {
    await initDB()
    const db = getDB()
    await db.syncQueue.clear()
    await db.syncConflicts.clear()
    activate(PARISH_A)
  })

  it('keeps same user id in two parishes isolated for reads and deduplication', async () => {
    const store = useSyncStore.getState()
    const parishAId = await store.addOp({
      entity: 'student',
      entityId: 'SAME-STUDENT-ID',
      operation: 'UPDATE',
      payload: JSON.stringify({ fullName: 'Parish A' }),
    })

    activate(PARISH_B)
    expect(await store.getPendingOps()).toHaveLength(0)

    const parishBId = await store.addOp({
      entity: 'student',
      entityId: 'SAME-STUDENT-ID',
      operation: 'UPDATE',
      payload: JSON.stringify({ fullName: 'Parish B' }),
    })

    expect(parishBId).not.toBe(parishAId)
    expect((await store.getPendingOps()).map(item => item.parishId)).toEqual([PARISH_B])

    const all = await getDB().syncQueue.toArray()
    expect(all).toHaveLength(2)
    expect(new Set(all.map(item => `${item.parishId}:${item.userId}`))).toEqual(
      new Set([`${PARISH_A}:${USER_ID}`, `${PARISH_B}:${USER_ID}`]),
    )
  })

  it('does not update or remove an operation owned by another parish', async () => {
    const store = useSyncStore.getState()
    const id = await store.addOp({
      entity: 'notice',
      entityId: 'NOTICE-A',
      operation: 'DELETE',
      payload: JSON.stringify({ id: 'NOTICE-A' }),
    })

    activate(PARISH_B)
    await store.updateOp(id, { status: 'completed' })
    await store.removeOp(id)

    const untouched = await getDB().syncQueue.get(id)
    expect(untouched?.status).toBe('pending')
    expect(untouched?.parishId).toBe(PARISH_A)
  })

  it('keeps ownership immutable when an untyped caller injects owner fields', async () => {
    const store = useSyncStore.getState()
    const id = await store.addOp({
      entity: 'notice',
      entityId: 'NOTICE-IMMUTABLE',
      operation: 'UPDATE',
      payload: JSON.stringify({ title: 'A' }),
    })

    await store.updateOp(id, { userId: 'ATTACKER', parishId: PARISH_B, status: 'retrying' } as any)
    const row = await getDB().syncQueue.get(id)
    expect(row?.status).toBe('retrying')
    expect(row?.userId).toBe(USER_ID)
    expect(row?.parishId).toBe(PARISH_A)
  })

  it('scopes conflicts by parish as well as user', async () => {
    const store = useSyncStore.getState()
    await store.addConflict({
      entity: 'grade',
      entityId: 'GRADE-1',
      operation: 'UPDATE',
      localValue: JSON.stringify({ scoreFinal: 8 }),
      serverValue: JSON.stringify({ scoreFinal: 7 }),
    })

    activate(PARISH_B)
    expect(await store.getConflicts()).toHaveLength(0)
    activate(PARISH_A)
    expect(await store.getConflicts()).toHaveLength(1)
  })

  it('quarantines legacy operations instead of assigning them to the active parish', async () => {
    const now = new Date().toISOString()
    await getDB().syncQueue.add({
      id: 'LEGACY-UNSCOPED',
      entity: 'student',
      entityId: 'ST-LEGACY',
      operation: 'UPDATE',
      payload: JSON.stringify({ fullName: 'Legacy' }),
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      deviceId: 'DEV-LEGACY',
      userId: USER_ID,
    })

    await migrateLegacyQueueOwnership()

    const row = await getDB().syncQueue.get('LEGACY-UNSCOPED')
    expect(row?.status).toBe('failed')
    expect(row?.parishId).toBeUndefined()
    expect(await decryptQueueValue(row?.lastError ?? '')).toMatch(/parish ownership is unknown/)
    expect(await useSyncStore.getState().getPendingOps()).toHaveLength(0)
  })
})
