import React from 'react'
import { create } from 'zustand'
import { getDB } from '../lib/db'
import { encryptQueueValue, decryptQueueValue } from '../lib/offlineCipher'
import type { SyncQueueItem, SyncConflict } from '../lib/db'

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

  // Option 1: Conflict Management
  getConflicts: () => Promise<SyncConflict[]>
  addConflict: (conflict: Omit<SyncConflict, 'id' | 'createdAt' | 'resolved' | 'userId'>) => Promise<void>
  resolveConflict: (id: string) => Promise<void>
  clearResolvedConflicts: () => Promise<void>
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

/** ADR-016 (S19): User id hiện tại từ session đã lưu — dùng để scope sync queue. */
function getCurrentUserId(): string {
  try {
    const raw = localStorage.getItem('parish_current_user')
    if (raw) {
      const user = JSON.parse(raw)
      if (user && typeof user.id === 'string' && user.id) return user.id
    }
  } catch {
    // ignore
  }
  return ''
}

/** ADR-016 (S19/OS-02): Fail-closed check khi có logged-in user. */
export function isOwnOp(item: SyncQueueItem): boolean {
  const currentUserId = getCurrentUserId()
  if (!currentUserId) {
    return !item.userId || item.userId === ''
  }
  return item.userId === currentUserId
}

async function getPendingQueueItems(): Promise<SyncQueueItem[]> {
  const db = getDB()
  const currentUserId = getCurrentUserId()
  if (currentUserId) {
    try {
      return await db.syncQueue
        .where('userId')
        .equals(currentUserId)
        .filter((item) => item.status === 'pending' || item.status === 'retrying')
        .toArray()
    } catch {
      // Older test doubles or partially migrated databases may not expose the index yet.
    }
  }
  return db.syncQueue
    .where('status')
    .anyOf(['pending', 'retrying'])
    .toArray()
}

/** OS-02: Migration 1 lần cho legacy queue items rỗng/thiếu userId khi user đăng nhập. */
export async function migrateLegacyQueueUserIds(): Promise<void> {
  const currentUserId = getCurrentUserId()
  if (!currentUserId) return
  try {
    const db = getDB()
    const legacyItems = await db.syncQueue
      .filter((item) => !item.userId || item.userId === '')
      .toArray()
    if (legacyItems.length === 0) return
    const runUpdate = async () => {
      for (const item of legacyItems) {
        await db.syncQueue.update(item.id, { userId: currentUserId })
      }
    }
    if (typeof db.transaction === 'function') {
      await db.transaction('rw', db.syncQueue, runUpdate)
    } else {
      await runUpdate()
    }
  } catch {
    // ignore
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
      const items = await getPendingQueueItems()
      const count = items.filter(isOwnOp).length
      set({ pendingCount: count })
      return count
    } catch {
      return 0
    }
  },

  getPendingOps: async () => {
    const all = await getPendingQueueItems()
    return all
      .filter(isOwnOp)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  addOp: async (op) => {
    const userId = getCurrentUserId()
    const db = getDB()
    const now = new Date().toISOString()
    const id = `OP-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const encryptedPayload = await encryptQueueValue(op.payload)
    const item: SyncQueueItem = {
      id,
      ...op,
      payload: encryptedPayload,
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      deviceId: get().deviceId,
      userId,
    }

    let returnId = id
    const runAdd = async () => {
      await db.syncQueue.put(item)
      const siblings = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'retrying'])
        .toArray()
      const dup = siblings.find((i) =>
        i.id !== id &&
        isOwnOp(i) &&
        i.entity === op.entity &&
        i.entityId === op.entityId &&
        i.operation === op.operation
      )
      if (dup) {
        await db.syncQueue.update(dup.id, {
          payload: encryptedPayload,
          updatedAt: now,
        })
        await db.syncQueue.delete(id)
        returnId = dup.id
      }
    }

    if (typeof db.transaction === 'function') {
      await db.transaction('rw', db.syncQueue, runAdd)
    } else {
      await runAdd()
    }

    await get().refreshCount()
    return returnId
  },

  updateOp: async (id, changes) => {
    const next: Partial<SyncQueueItem> = { ...changes }
    if (typeof next.payload === 'string') {
      next.payload = await encryptQueueValue(next.payload)
    }
    if (typeof next.lastError === 'string') {
      next.lastError = await encryptQueueValue(next.lastError)
    }
    await getDB().syncQueue.update(id, { ...next, updatedAt: new Date().toISOString() })
  },

  removeOp: async (id) => {
    await getDB().syncQueue.delete(id)
    await get().refreshCount()
  },

  getConflicts: async () => {
    const db = getDB()
    const userId = getCurrentUserId()
    if (userId) {
      return await db.syncConflicts
        .where('userId')
        .equals(userId)
        .reverse()
        .sortBy('createdAt')
    }
    return await db.syncConflicts.reverse().sortBy('createdAt')
  },

  addConflict: async (conflict: Omit<SyncConflict, 'id' | 'createdAt' | 'resolved' | 'userId'>) => {
    const db = getDB()
    const userId = getCurrentUserId()
    const item: SyncConflict = {
      ...conflict,
      id: `CONF-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      createdAt: new Date().toISOString(),
      resolved: false,
      userId: userId || undefined,
    }
    await db.syncConflicts.add(item)
  },

  resolveConflict: async (id) => {
    const db = getDB()
    await db.syncConflicts.update(id, {
      resolved: true,
      resolvedAt: new Date().toISOString(),
    })
  },

  clearResolvedConflicts: async () => {
    const db = getDB()
    // Chỉ xóa các bản ghi đã xác nhận (resolved === true).
    await db.syncConflicts.where('resolved').equals(1).delete()
  },

  compactQueue: async () => {
    const db = getDB()
    const pendingRaw = await db.syncQueue
      .where('status')
      .anyOf(['pending', 'retrying'])
      .toArray()

    const pending = pendingRaw.filter(isOwnOp).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

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
        // OS-01 Fix (Keep-BOTH Rule):
        // Nếu CREATE chưa từng gửi server (status pending, retryCount 0) -> An toàn để hủy cả cặp.
        // Nếu CREATE đã/đang retrying -> Giữ CẢ CREATE VÀ DELETE để Phase 1.5 retry CREATE (dedupe),
        // remap Temp ID -> Real ID, rồi Phase 3 thực thi DELETE với ID thật server-side.
        const createOp = ops.find((o) => o.operation === 'CREATE')!
        const isUnsentLocalOnly = createOp.status === 'pending' && (createOp.retryCount || 0) === 0
        if (isUnsentLocalOnly) {
          toRemove.push(...ops.map((o) => o.id))
        } else {
          // Xóa các UPDATE trung gian ở giữa
          toRemove.push(...ops.filter((o) => o.operation === 'UPDATE').map((o) => o.id))
        }
        continue
      }

      if (hasDelete) {
        toRemove.push(...ops.filter((o) => o.operation !== 'DELETE').map((o) => o.id))
        continue
      }

      if (hasCreate) {
        const createOp = ops.find((o) => o.operation === 'CREATE')!
        const merged = await ops.reduce(async (accP, o) => {
          const acc = await accP
          try {
            const raw = await decryptQueueValue(o.payload)
            if (raw === null) return acc
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
            return { ...acc, ...parsed }
          } catch {
            return acc
          }
        }, Promise.resolve({} as Record<string, unknown>))
        toRemove.push(...ops.filter((o) => o.id !== createOp.id).map((o) => o.id))
        toUpdate.push({
          id: createOp.id,
          op: { ...createOp, operation: 'CREATE', payload: JSON.stringify(merged) },
        })
        continue
      }

      // Only UPDATE(s) — SYNC-CONFLICT-2 (2026-08-24): merge THEO FIELD qua tất cả
      // các UPDATE thay vì chỉ giữ payload của op cuối. Trước đây 2 field sửa ở
      // 2 phiên offline khác nhau (vd đổi fullName buổi sáng, đổi phone buổi chiều)
      // → payload cuối ghi đè NGUYÊN record → edit đầu tiên mất khỏi queue.
      // Hạn chế đã biết (chấp nhận): không biểu diễn được việc XÓA field giữa
      // các lần nhập (shallow merge) — cần tombstone semantics, ngoài scope.
      const merged = await ops.reduce(async (accP, o) => {
        const acc = await accP
        try {
          const raw = await decryptQueueValue(o.payload)
          if (raw === null) return acc
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          return { ...acc, ...parsed }
        } catch {
          return acc
        }
      }, Promise.resolve({} as Record<string, unknown>))
      toRemove.push(...ops.filter((o) => o.id !== lastOp.id).map((o) => o.id))
      toUpdate.push({
        id: lastOp.id,
        op: { ...lastOp, operation: 'UPDATE', payload: JSON.stringify(merged) },
      })
    }

    // Pre-encrypt payloads trước khi mở Dexie transaction (tránh PrematureCommitError do WebCrypto async)
    const updatesPrepared: Array<{ id: string; payload: string; updatedAt: string }> = []
    for (const { id, op } of toUpdate) {
      updatesPrepared.push({
        id,
        payload: await encryptQueueValue(op.payload),
        updatedAt: new Date().toISOString(),
      })
    }

    // OS-04: Atomic Dexie Transaction (chứa thuần túy các lệnh IndexedDB)
    const runCompact = async () => {
      for (const id of toRemove) {
        await db.syncQueue.delete(id)
      }
      for (const item of updatesPrepared) {
        await db.syncQueue.update(item.id, {
          payload: item.payload,
          updatedAt: item.updatedAt,
        })
      }
    }

    if (typeof db.transaction === 'function') {
      await db.transaction('rw', db.syncQueue, runCompact)
    } else {
      await runCompact()
    }

    await get().refreshCount()
  },

  clearCompleted: async () => {
    const items = await getDB().syncQueue
      .where('status')
      .equals('completed')
      .toArray()
    // ADR-016 (S24): Chỉ xóa completed ops của user hiện tại (filter no-op cũ).
    const mine = items.filter(isOwnOp)
    for (const item of mine) {
      await getDB().syncQueue.delete(item.id)
    }
  },
}))

