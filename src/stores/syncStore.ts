import { create } from 'zustand'
import { getDB } from '../lib/db'
import type { SyncQueueItem } from '../lib/db'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'retrying' | 'failed'

interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSyncAt: string | null
  lastError: string | null
  deviceId: string

  initDevice: () => void
  setStatus: (status: SyncStatus) => void
  setLastSync: (iso: string) => void
  setLastError: (err: string | null) => void
  refreshCount: () => Promise<number>

  getPendingOps: () => Promise<SyncQueueItem[]>
  addOp: (op: Omit<SyncQueueItem, 'id' | 'retryCount' | 'lastError' | 'createdAt' | 'updatedAt' | 'status' | 'deviceId'>) => Promise<string>
  updateOp: (id: string, changes: Partial<SyncQueueItem>) => Promise<void>
  removeOp: (id: string) => Promise<void>
  compactQueue: () => Promise<void>
  clearCompleted: () => Promise<void>
}

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem('parish_device_id')
    if (!id) {
      id = `DEV-${crypto.randomUUID().slice(0, 8)}`
      localStorage.setItem('parish_device_id', id)
    }
    return id
  } catch {
    return 'DEV-fallback'
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
  deviceId: getOrCreateDeviceId(),

  initDevice: () => {
    set({ deviceId: getOrCreateDeviceId() })
  },
  setStatus: (status) => set({ status }),
  setLastSync: (iso) => set({ lastSyncAt: iso }),
  setLastError: (err) => set({ lastError: err }),

  refreshCount: async () => {
    try {
      const db = getDB()
      const count = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'retrying'])
        .count()
      set({ pendingCount: count })
      return count
    } catch {
      return 0
    }
  },

  getPendingOps: async () => {
    const db = getDB()
    return db.syncQueue
      .where('status')
      .anyOf(['pending', 'retrying'])
      .sortBy('createdAt')
  },

  addOp: async (op) => {
    const id = `OP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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

      const hasCreate = ops.some((o) => o.operation === 'CREATE')
      const hasDelete = ops.some((o) => o.operation === 'DELETE')
      const lastOp = ops[ops.length - 1]

      if (hasCreate && hasDelete) {
        toRemove.push(...ops.map((o) => o.id))
        continue
      }

      if (hasDelete) {
        toRemove.push(...ops.filter((o) => o.operation !== 'DELETE').map((o) => o.id))
        continue
      }

      if (hasCreate) {
        const createOp = ops.find((o) => o.operation === 'CREATE')!
        const merged = ops.reduce((acc, o) => {
          try {
            const parsed = typeof o.payload === 'string' ? JSON.parse(o.payload) : o.payload
            return { ...acc, ...parsed }
          } catch {
            return acc
          }
        }, {})
        toRemove.push(...ops.filter((o) => o.id !== createOp.id).map((o) => o.id))
        toUpdate.push({
          id: createOp.id,
          op: { ...createOp, operation: 'CREATE', payload: JSON.stringify(merged) },
        })
        continue
      }

      // Only UPDATE(s) — keep last
      toRemove.push(...ops.filter((o) => o.id !== lastOp.id).map((o) => o.id))
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
