import { create } from 'zustand'
import { getDB } from '../lib/db'
import { encryptQueueValue, decryptQueueValue, isEncryptedValue } from '../lib/offlineCipher'
import type { SyncQueueItem, SyncConflict } from '../lib/db'
import { captureTenantScope, getTenantScope, isTenantScopeCurrent, type TenantScope } from '../lib/tenantScope'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'retrying' | 'failed'

type ExamResultQueuePayload = {
  action: 'save_result'
  sessionId: string
  score: Record<string, unknown>
}

/** A pending result has never been issued, so complementary mixed components
 * may be folded into one complete command. An issued/retrying command must
 * keep its original bytes for receipt replay. */
function mergePendingExamResult(
  previous: ExamResultQueuePayload,
  incoming: ExamResultQueuePayload,
): ExamResultQueuePayload | null {
  if (previous.action !== 'save_result' || incoming.action !== 'save_result'
    || previous.sessionId !== incoming.sessionId
    || previous.score.studentId !== incoming.score.studentId) return null
  const oldVersion = previous.score.expectedResultVersion ?? 0
  const newVersion = incoming.score.expectedResultVersion ?? 0
  if (oldVersion !== newVersion) return null
  const oldScore = previous.score
  const newScore = incoming.score
  const combined = { ...newScore }
  if (newScore.answers !== undefined && newScore.essayScore === undefined && oldScore.essayScore !== undefined) {
    combined.essayScore = oldScore.essayScore
  }
  if (newScore.essayScore !== undefined && newScore.answers === undefined && oldScore.answers !== undefined) {
    // An essay edit omits the scan component; omission is not a clear command.
    for (const field of ['answers', 'source', 'examVersion', 'scanMetadata', 'attemptFingerprint', 'capturedAt']) {
      if (oldScore[field] !== undefined) combined[field] = oldScore[field]
    }
  }
  combined.expectedResultVersion = oldScore.expectedResultVersion ?? newScore.expectedResultVersion
  if (oldScore.afterMutationId && !newScore.afterMutationId) combined.afterMutationId = oldScore.afterMutationId
  return { ...incoming, score: combined }
}

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
  claimOp: (id: string) => Promise<SyncQueueItem | null>
  recoverStaleProcessingOps: (maxAgeMs?: number) => Promise<number>
  addOp: (op: Omit<SyncQueueItem, 'id' | 'retryCount' | 'lastError' | 'createdAt' | 'updatedAt' | 'status' | 'deviceId'>, options?: { preservePendingGradeIntent?: boolean }) => Promise<string>
  updateOp: (id: string, changes: Partial<SyncQueueItem>) => Promise<void>
  removeOp: (id: string) => Promise<void>
  compactQueue: () => Promise<void>
  clearCompleted: () => Promise<void>

  // Option 1: Conflict Management
  unresolvedConflictsCount: number
  refreshConflictsCount: () => Promise<number>
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

function getCurrentUserId(): string {
  return getTenantScope()?.userId || ''
}

function getCurrentParishId(): string {
  return getTenantScope()?.parishId || ''
}

export function isOpOwnedBy(item: Pick<SyncQueueItem, 'userId' | 'parishId'>, owner: TenantScope | null): boolean {
  return Boolean(owner && item.userId === owner.userId && item.parishId === owner.parishId)
}

/** ADR-016 (S19/OS-02) + OFF-TENANT-1: Fail-closed exact-scope check. */
export function isOwnOp(item: SyncQueueItem): boolean {
  return isOpOwnedBy(item, getTenantScope())
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

/**
 * Operations that make a destructive server data replacement unsafe on this
 * device. Unlike the normal sync worklist, this includes failed and currently
 * processing rows because both still carry pre-replacement user intent.
 */
export async function getOwnUnsettledSyncOperations(): Promise<SyncQueueItem[]> {
  const rows = await getDB().syncQueue
    .where('status')
    .anyOf(['pending', 'processing', 'retrying', 'failed'])
    .toArray()
  return rows.filter(isOwnOp).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** OS-02: Migration 1 lần cho legacy queue items rỗng/thiếu userId khi user đăng nhập. */
export async function migrateLegacyQueueUserIds(): Promise<void> {
  await migrateLegacyQueueOwnership()
}

/**
 * OFF-TENANT-1: quarantine rows pending/retrying thiếu parishId thay vì đoán
 * ownership (gán cho parish hiện tại từng là leak cross-parish). Row bị đánh
 * `failed` + lastError mã hóa (hiển thị ở Diagnostics), parishId giữ nguyên
 * undefined, không bao giờ được flush. Chạy mỗi runSyncFlow trước compact.
 */
export async function migrateLegacyQueueOwnership(): Promise<void> {
  const db = getDB()
  const legacyItems = await db.syncQueue
    .filter((item) => !item.parishId || item.parishId === '')
    .toArray()
  if (legacyItems.length === 0) return
  const now = new Date().toISOString()
  const message = 'Legacy queue item parish ownership is unknown — quarantined, will never sync under another parish (OFF-TENANT-1).'
  for (const item of legacyItems) {
    // Bỏ qua terminal states (failed đã quarantine, completed là lịch sử).
    if (item.status === 'failed' || item.status === 'completed') continue
    await db.syncQueue.update(item.id, {
      status: 'failed',
      lastError: await encryptQueueValue(message),
      updatedAt: now,
    })
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  pendingCount: 0,
  unresolvedConflictsCount: 0,
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
      void get().refreshConflictsCount()
      return count
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể đọc hàng đợi đồng bộ'
      set({ status: 'failed', lastError: message })
      return -1
    }
  },

  refreshConflictsCount: async () => {
    try {
      const db = getDB()
      const userId = getCurrentUserId()
      if (!userId) {
        set({ unresolvedConflictsCount: 0 })
        return 0
      }
      const parishId = getCurrentParishId()
      const list = await db.syncConflicts
        .where('userId')
        .equals(userId)
        .toArray()
      // OFF-TENANT-1: chỉ đếm conflicts đúng parish hiện tại (đồng nhất với
      // getConflicts — legacy rows thiếu parish không hiện/không đếm).
      const count = list.filter((c) => !c.resolved && (!parishId || c.parishId === parishId)).length
      set({ unresolvedConflictsCount: count })
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

  claimOp: async (id) => {
    const db = getDB()
    const now = new Date().toISOString()
    let claimed: SyncQueueItem | null = null
    const runClaim = async () => {
      const current = await db.syncQueue.get(id)
      if (
        !current
        || !isOwnOp(current)
        || (current.status !== 'pending' && current.status !== 'retrying')
      ) return
      await db.syncQueue.update(id, { status: 'processing', updatedAt: now })
      claimed = { ...current, status: 'processing', updatedAt: now }
    }
    if (typeof db.transaction === 'function') {
      await db.transaction('rw', db.syncQueue, runClaim)
    } else {
      await runClaim()
    }
    return claimed
  },

  recoverStaleProcessingOps: async (maxAgeMs = 5 * 60 * 1000) => {
    const db = getDB()
    const nowMs = Date.now()
    const processing = await db.syncQueue
      .where('status')
      .equals('processing')
      .toArray()
    const stale = processing.filter((item) => {
      if (!isOwnOp(item)) return false
      const claimedAt = Date.parse(item.updatedAt)
      return !Number.isFinite(claimedAt) || nowMs - claimedAt >= maxAgeMs
    })
    if (stale.length === 0) return 0
    const recoveredAt = new Date(nowMs).toISOString()
    for (const item of stale) {
      await db.syncQueue.update(item.id, {
        status: 'retrying',
        lastError: await encryptQueueValue('Recovered an interrupted sync operation after its processing lease expired.'),
        updatedAt: recoveredAt,
      })
    }
    await get().refreshCount()
    return stale.length
  },

  addOp: async (op, options) => {
    const owner = captureTenantScope()
    if (!owner) throw new Error('Cannot queue sync operation without an active tenant owner')
    const { userId, parishId } = owner
    const db = getDB()
    const now = new Date().toISOString()
    const id = `OP-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const encryptedPayload = await encryptQueueValue(op.payload)
    if (!isTenantScopeCurrent(owner)) throw new Error('Tenant owner changed while queueing sync operation')
    const item: SyncQueueItem = {
      id,
      ...op,
      serverAcknowledgement: undefined, // only the ACK boundary may create a receipt
      payload: encryptedPayload,
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      deviceId: get().deviceId,
      // OFF-TENANT-1: ownership exact (parishId, userId) ghi đè mọi field
      // caller truyền vào — chống spoof và nhầm scope khi đổi parish.
      userId,
      parishId,
    }

    let returnId = id
    if (op.entity === 'exam_result' && op.operation === 'UPDATE') {
      // Only compact commands that have never been sent. A retrying command
      // may already have committed and its hash/receipt must remain stable.
      for (let attempt = 0; attempt < 8; attempt++) {
        const related = (await db.syncQueue.where('status').anyOf(['pending', 'processing', 'retrying', 'failed']).toArray())
          .filter(row => isOpOwnedBy(row, owner) && row.entity === op.entity && row.entityId === op.entityId)
        if (related.some(row => row.status === 'failed')) throw new Error('Exam result has a failed intent; resolve it before saving another edit')
        const dup = related.length === 1 && related[0].status === 'pending'
          && related[0].operation === 'UPDATE' && !related[0].serverAcknowledgement ? related[0] : undefined
        const latest = [...related].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).at(-1)
        const decoded = latest ? await decryptQueueValue(latest.payload) : null
        if (latest && !decoded) throw new Error('Cannot read preceding exam result intent')
        const previous = decoded ? JSON.parse(decoded) as ExamResultQueuePayload : null
        const incoming = JSON.parse(op.payload) as ExamResultQueuePayload
        const merged = previous ? mergePendingExamResult(previous, incoming) : null
        if (latest && !merged && incoming.action === 'save_result') throw new Error('Cannot safely combine the preceding exam result intent')
        if (latest && !dup && merged) {
          const predecessorId = previous?.score.clientMutationId
          if (typeof predecessorId !== 'string' || !predecessorId) throw new Error('Preceding exam result has no mutation receipt identity')
          merged.score.afterMutationId = predecessorId
        }
        const encoded = merged ? await encryptQueueValue(JSON.stringify(merged)) : null
        const committed = await db.transaction('rw', db.syncQueue, async () => {
          if (!isTenantScopeCurrent(owner)) throw new Error('Tenant owner changed while queueing exam result')
          const current = (await db.syncQueue.where('status').anyOf(['pending', 'processing', 'retrying', 'failed']).toArray())
            .filter(row => isOpOwnedBy(row, owner) && row.entity === op.entity && row.entityId === op.entityId)
          if (JSON.stringify(current) !== JSON.stringify(related)) return false
          if (dup && merged && encoded) {
            await db.syncQueue.update(dup.id, { payload: encoded, updatedAt: now })
            returnId = dup.id
          } else {
            const nextCreatedAt = latest && latest.createdAt >= now
              ? new Date(Date.parse(latest.createdAt) + 1).toISOString() : now
            await db.syncQueue.put({ ...item, payload: encoded ?? item.payload, createdAt: nextCreatedAt, updatedAt: nextCreatedAt })
          }
          return true
        })
        if (committed) { await get().refreshCount(); return returnId }
      }
      throw new Error('Exam result queue changed concurrently; retry saving the edit')
    }
    if ((op.entity === 'grade' || op.entity === 'notice') && op.operation === 'UPDATE') {
      // Grade/notice payloads are patches. Merge pending intent outside the IDB
      // transaction, then CAS the encrypted source row inside it. Concurrent
      // tabs/enqueues must never discard fields or overwrite processing rows.
      for (let attempt = 0; attempt < 8; attempt++) {
        const siblings = await db.syncQueue.where('status').anyOf(['pending', 'retrying']).toArray()
        const dup = siblings.find(row => isOpOwnedBy(row, owner) && row.entity === op.entity
          && row.entityId === op.entityId && row.operation === 'UPDATE' && !row.serverAcknowledgement)
        const decoded = dup ? await decryptQueueValue(dup.payload) : null
        if (dup && !decoded) throw new Error('Cannot merge unreadable queued intent')
        const previous = decoded ? JSON.parse(decoded) : null
        const incoming = JSON.parse(op.payload)
        const merged = previous ? { ...(options?.preservePendingGradeIntent
          ? { ...incoming, ...previous, version: incoming.version }
          : { ...previous, ...incoming }),
          ...(op.entity === 'grade' ? { _syncGradePatch: previous._syncGradePatch === true && incoming._syncGradePatch === true } : {}) } : incoming
        const encoded = await encryptQueueValue(JSON.stringify(merged))
        const committed = await db.transaction('rw', db.syncQueue, async () => {
          if (!isTenantScopeCurrent(owner)) throw new Error('Tenant owner changed while queueing patch')
          const current = (await db.syncQueue.where('status').anyOf(['pending', 'retrying']).toArray())
            .find(row => isOpOwnedBy(row, owner) && row.entity === op.entity && row.entityId === op.entityId
              && row.operation === 'UPDATE' && !row.serverAcknowledgement)
          if (JSON.stringify(current) !== JSON.stringify(dup)) return false
          if (current) {
            await db.syncQueue.update(current.id, { payload: encoded, updatedAt: now })
            returnId = current.id
          } else await db.syncQueue.put({ ...item, payload: encoded })
          return true
        })
        if (committed) { await get().refreshCount(); return returnId }
      }
      throw new Error('Patch queue changed concurrently; retry saving the edit')
    }
    const runAdd = async () => {
      await db.syncQueue.put(item)
      const siblings = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'retrying'])
        .toArray()
      const dup = siblings.find((i) =>
        i.id !== id &&
        !i.serverAcknowledgement &&
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
    // OFF-TENANT-1: ownership immutable + cross-parish no-op. Đọc row trước,
    // bỏ qua update nếu row không thuộc phiên hiện tại; strip mọi owner fields
    // caller nhét vào changes.
    const existing = await getDB().syncQueue.get(id)
    if (existing && !isOwnOp(existing)) return
    const { userId: _ignoredUserId, parishId: _ignoredParishId, ...safeChanges } = changes as Record<string, unknown>
    const next: Partial<SyncQueueItem> = { ...(safeChanges as Partial<SyncQueueItem>) }
    if (typeof next.payload === 'string') {
      next.payload = await encryptQueueValue(next.payload)
    }
    if (typeof next.lastError === 'string') {
      next.lastError = await encryptQueueValue(next.lastError)
    }
    if (typeof next.serverAcknowledgement === 'string') {
      next.serverAcknowledgement = await encryptQueueValue(next.serverAcknowledgement)
    }
    await getDB().syncQueue.update(id, { ...next, updatedAt: new Date().toISOString() })
  },

  removeOp: async (id) => {
    // OFF-TENANT-1: cross-parish no-op — không xóa op của parish khác.
    const existing = await getDB().syncQueue.get(id)
    if (existing && !isOwnOp(existing)) return
    await getDB().syncQueue.delete(id)
    await get().refreshCount()
  },

  getConflicts: async () => {
    const db = getDB()
    const userId = getCurrentUserId()
    const parishId = getCurrentParishId()
    if (!userId) return []
    const rows = await db.syncConflicts
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('createdAt')
    // OFF-TENANT-1: chỉ conflicts đúng parish hiện tại (legacy rows thiếu
    // parish không hiển thị ở scope có parish).
    return parishId ? rows.filter((c) => c.parishId === parishId) : rows
  },

  addConflict: async (conflict: Omit<SyncConflict, 'id' | 'createdAt' | 'resolved' | 'userId'>) => {
    const db = getDB()
    const owner = captureTenantScope()
    if (!owner) throw new Error('Cannot store sync conflict without an authenticated user scope')
    const localValue = isEncryptedValue(conflict.localValue)
      ? conflict.localValue
      : await encryptQueueValue(conflict.localValue)
    const serverValue = isEncryptedValue(conflict.serverValue)
      ? conflict.serverValue
      : await encryptQueueValue(conflict.serverValue)
    if (!isTenantScopeCurrent(owner)) throw new Error('Tenant owner changed while storing sync conflict')
    const item: SyncConflict = {
      ...conflict,
      localValue,
      serverValue,
      id: `CONF-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      createdAt: new Date().toISOString(),
      resolved: false,
      userId: owner.userId,
      // OFF-TENANT-1: stamp parish hiện tại (ghi đè caller) để conflicts
      // scope đúng tenant như queue ops.
      parishId: owner.parishId,
    }
    await db.syncConflicts.add(item)
    await get().refreshConflictsCount()
  },

  resolveConflict: async (id) => {
    const db = getDB()
    const userId = getCurrentUserId()
    const parishId = getCurrentParishId()
    if (!userId) return
    const conflict = await db.syncConflicts.get(id)
    if (!conflict || conflict.userId !== userId) return
    // OFF-TENANT-1: conflict có parish khác scope hiện tại thì không resolve.
    // Legacy rows thiếu parish vẫn resolve được (tránh strand dữ liệu cũ).
    if (parishId && conflict.parishId && conflict.parishId !== parishId) return
    await db.syncConflicts.update(id, {
      resolved: true,
      resolvedAt: new Date().toISOString(),
    })
    await get().refreshConflictsCount()
  },

  clearResolvedConflicts: async () => {
    const db = getDB()
    const userId = getCurrentUserId()
    const parishId = getCurrentParishId()
    if (!userId) return
    const resolved = await db.syncConflicts.where('resolved').equals(1).toArray()
    // OFF-TENANT-1: chỉ dọn conflicts đúng user + parish hiện tại.
    const ownIds = resolved
      .filter((item) => item.userId === userId && (!parishId || !item.parishId || item.parishId === parishId))
      .map((item) => item.id)
    if (ownIds.length > 0) await db.syncConflicts.bulkDelete(ownIds)
    await get().refreshConflictsCount()
  },

  compactQueue: async () => {
    const owner = captureTenantScope()
    if (!owner) return
    const db = getDB()
    const pendingRaw = await db.syncQueue
      .where('status')
      .anyOf(['pending', 'retrying'])
      .toArray()

    const pending = pendingRaw.filter(isOwnOp).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    // EXAM-CONTINUOUS-P0: result mutations now use their own per-student entity
    // key. If the parent session is queued for DELETE, every pending result
    // mutation is obsolete because deleting the session cascades its results.
    // Remove them explicitly so a CREATE+DELETE compaction cannot leave orphan
    // exam_result ops that later fail or recreate stale work.
    const deletedExamSessionIds = new Set(
      pending
        .filter(op => op.entity === 'exam' && op.operation === 'DELETE')
        .map(op => op.entityId),
    )
    const discardedExamResultIds = new Set<string>()
    if (deletedExamSessionIds.size > 0) {
      for (const op of pending) {
        if (op.entity !== 'exam_result') continue
        try {
          const raw = await decryptQueueValue(op.payload)
          const payload = raw ? JSON.parse(raw) as Record<string, unknown> : null
          if (payload && deletedExamSessionIds.has(String(payload.sessionId || ''))) {
            discardedExamResultIds.add(op.id)
          }
        } catch {
          // Corrupt payload remains visible for diagnostics; never guess a parent.
        }
      }
    }

    // Group by (entity, entityId)
    const groups = new Map<string, SyncQueueItem[]>()
    for (const op of pending) {
      if (op.serverAcknowledgement) continue // committed parent is a recovery journal, never compact it
      if (discardedExamResultIds.has(op.id)) continue
      if (op.entity === 'exam_result') continue // command semantics are handled at enqueue; never shallow-merge here
      const key = `${op.entity}:${op.entityId}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(op)
    }

    const toRemove: string[] = [...discardedExamResultIds]
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
        const isUnsentLocalOnly = createOp.status === 'pending'
          && (createOp.retryCount || 0) === 0
          && !createOp.lastError
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
        const isUnsentLocalOnly = createOp.status === 'pending'
          && (createOp.retryCount || 0) === 0
          && !createOp.lastError
        const updates = ops.filter((o) => o.operation === 'UPDATE')
        const mergeOps = isUnsentLocalOnly ? ops : updates
        const merged = await mergeOps.reduce(async (accP, o) => {
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
        if (isUnsentLocalOnly) {
          // No request could have committed yet, so folding local edits into
          // the create preserves intent without changing an issued request.
          toRemove.push(...ops.filter((o) => o.id !== createOp.id).map((o) => o.id))
          toUpdate.push({
            id: createOp.id,
            op: { ...createOp, operation: 'CREATE', payload: JSON.stringify(merged) },
          })
        } else if (updates.length > 0) {
          // Once CREATE may have reached the server its payload is immutable.
          // Keep it byte-for-byte replayable and compact later edits into a
          // separate UPDATE that will be remapped after create acknowledgement.
          const lastUpdate = updates[updates.length - 1]
          toRemove.push(...updates.filter((o) => o.id !== lastUpdate.id).map((o) => o.id))
          toUpdate.push({
            id: lastUpdate.id,
            op: { ...lastUpdate, operation: 'UPDATE', payload: JSON.stringify(merged) },
          })
        }
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
          return { ...acc, ...parsed, ...(o.entity === 'grade'
            ? { _syncGradePatch: acc._syncGradePatch === true && parsed._syncGradePatch === true } : {}) }
        } catch {
          return acc
        }
      }, Promise.resolve((lastOp.entity === 'grade' ? { _syncGradePatch: true } : {}) as Record<string, unknown>))
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
      // Crypto intentionally runs outside IndexedDB transactions. Validate its
      // input snapshot under the write lock before retiring any durable intent.
      if (!isTenantScopeCurrent(owner)) return
      const current = (await db.syncQueue.where('status').anyOf(['pending', 'retrying']).toArray())
        .filter(item => isOpOwnedBy(item, owner))
      const before = new Map(pending.map(item => [item.id, JSON.stringify(item)]))
      if (current.length !== before.size || current.some(item => before.get(item.id) !== JSON.stringify(item))) return
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

