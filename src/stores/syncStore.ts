import { create } from 'zustand'
import { getDB, type SyncQueueItem } from '../lib/db'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'retrying' | 'error'

interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSyncAt: string | null
  lastError: string | null
  deviceId: string

  initDevice: () => Promise<void>
  setStatus: (s: SyncStatus) => void
  refreshCount: () => Promise<void>
  setLastSync: (t: string) => void
  setLastError: (e: string | null) => void

  getPendingOps: () => Promise<SyncQueueItem[]>
  getFailedOps: () => Promise<SyncQueueItem[]>
  addOp: (op: Omit<SyncQueueItem, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'deviceId' | 'retryCount' | 'lastError'>) => Promise<string>
  updateOp: (id: string, changes: Partial<SyncQueueItem>) => Promise<void>
  removeOp: (id: string) => Promise<void>
  compactQueue: () => Promise<void>
  clearCompleted: () => Promise<void>
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
  deviceId: '',

  initDevice: async () => {
    const db = getDB()
    let meta = await db.syncMeta.get('deviceId')
    if (!meta) {
      const id = crypto.randomUUID()
      await db.syncMeta.put({ key: 'deviceId', value: id })
      meta = { key: 'deviceId', value: id }
    }
    set({ deviceId: meta.value })

    const lastSync = await db.syncMeta.get('lastSyncAt')
    if (lastSync) set({ lastSyncAt: lastSync.value })
  },

  setStatus: (status) => set({ status }),
  setLastSync: (lastSyncAt) => {
    getDB().syncMeta.put({ key: 'lastSyncAt', value: lastSyncAt })
    set({ lastSyncAt })
  },
  setLastError: (lastError) => set({ lastError }),

  refreshCount: async () => {
    const count = await getDB().syncQueue
      .where('status')
      .anyOf(['pending', 'retrying', 'processing'])
      .count()
    set({ pendingCount: count })
  },

  getPendingOps: async () => {
    return getDB().syncQueue
      .where('status')
      .anyOf(['pending', 'retrying', 'processing'])
      .sortBy('createdAt')
  },

  getFailedOps: async () => {
    return getDB().syncQueue
      .where('status')
      .equals('failed')
      .sortBy('createdAt')
  },

  addOp: async (op) => {
    const id = `SYNC-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
    const now = new Date().toISOString()
    const item: SyncQueueItem = {
      id,
      ...op,
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      deviceId: get().deviceId,
    }
    await getDB().syncQueue.put(item)
    await get().refreshCount()
    return id
  },

  updateOp: async (id, changes) => {
    await getDB().syncQueue.update(id, { ...changes, updatedAt: new Date().toISOString() })
  },

  removeOp: async (id) => {
    await getDB().syncQueue.delete(id)
    await get().refreshCount()
  },

  compactQueue: async () => {
    const db = getDB()
    const pending = await db.syncQueue
      .where('status')
      .anyOf(['pending', 'retrying'])
      .sortBy('createdAt')

    // Group by (entity, entityId)
    const groups = new Map<string, SyncQueueItem[]>()
    for (const op of pending) {
      const key = `${op.entity}:${op.entityId}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(op)
    }

    const toRemove: string[] = []
    const toUpdate: Array<{ id: string; op: SyncQueueItem }> = []

    for (const [, ops] of groups) {
      if (ops.length <= 1) continue

      // CREATE + UPDATE(s) → keep latest CREATE payload | single UPDATE
      // CREATE + DELETE → remove all
      // UPDATE(s)+ DELETE → keep DELETE
      // UPDATE(s) → keep latest UPDATE
      const hasCreate = ops.some(o => o.operation === 'CREATE')
      const hasDelete = ops.some(o => o.operation === 'DELETE')
      const lastOp = ops[ops.length - 1]

      if (hasCreate && hasDelete) {
        toRemove.push(...ops.map(o => o.id))
        continue
      }

      if (hasDelete) {
        toRemove.push(...ops.filter(o => o.operation !== 'DELETE').map(o => o.id))
        continue
      }

      if (hasCreate) {
        const createOp = ops.find(o => o.operation === 'CREATE')!
        toRemove.push(...ops.filter(o => o.id !== createOp.id).map(o => o.id))
        toUpdate.push({ id: createOp.id, op: { ...lastOp, operation: 'CREATE' as const } })
        continue
      }

      // Only UPDATE(s) — keep last
      toRemove.push(...ops.filter(o => o.id !== lastOp.id).map(o => o.id))
    }

    for (const id of toRemove) {
      await db.syncQueue.delete(id)
    }
    for (const { id, op } of toUpdate) {
      await db.syncQueue.update(id, { payload: op.payload, updatedAt: new Date().toISOString() })
    }

    await get().refreshCount()
  },

  clearCompleted: async () => {
    await getDB().syncQueue.where('status').equals('completed').delete()
  },
}))
