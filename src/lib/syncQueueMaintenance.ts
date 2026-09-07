import { getDB } from './db'
import { decryptQueueValue, encryptQueueValue } from './offlineCipher'
import { isOwnOp } from '../stores/syncStore'

/**
 * REFACTOR-SYNC-1 (2026-08-24): tách từ `hooks/useSyncEngine.ts` (god-file 1029 dòng)
 * thành module thuần ở tầng lib — bảo toàn hành vi 1:1 (behavior-preserving extraction).
 * Module này KHÔNG phụ thuộc store nào ngoài syncStore.isOwnOp (queue-scope guard).
 */

const FAILED_OP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export async function pruneStaleQueueItems(now = Date.now()): Promise<number> {
  const db = getDB()
  const terminal = await db.syncQueue
    .where('status')
    .anyOf(['failed', 'completed'])
    .toArray()
  const cutoff = now - FAILED_OP_RETENTION_MS
  const stale = terminal.filter((item) => {
    if (!isOwnOp(item)) return false
    if (item.serverAcknowledgement) return false
    if (item.status === 'completed') return true
    const updatedAt = Date.parse(item.updatedAt || item.createdAt)
    return Number.isFinite(updatedAt) && updatedAt < cutoff
  })
  for (const item of stale) {
    await db.syncQueue.delete(item.id)
  }
  return stale.length
}

/**
 * A-NEW-32 (2026-08-11): parse payload từ syncQueue. Queue lưu ciphertext
 * AES-GCM (AAD 'syncQueue'); legacy plaintext (queue cũ / test mocks) trả nguyên
 * — dual-format. Ciphertext hỏng → {} (caller tự fallback như payload hỏng cũ).
 */
export async function parseQueuePayload(raw: unknown, strict = false): Promise<Record<string, unknown>> {
  if (typeof raw !== 'string') {
    if (strict) throw new Error('Cannot reconcile invalid queue payload')
    return {}
  }
  const plain = await decryptQueueValue(raw)
  if (plain === null) {
    if (strict) throw new Error('Cannot decrypt queue payload for identity reconciliation')
    return {}
  }
  try {
    const value = JSON.parse(plain)
    if (strict && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('Invalid queue payload')
    return value as Record<string, unknown>
  } catch (error) {
    if (strict) throw error
    return {}
  }
}

/**
 * ADR-016 (S24): Auto-recover ops đang 'failed' do lỗi TẠM THỜI (network/5xx/
 * rate-limit). Op fail do lỗi vĩnh viễn (4xx validation, unknown entityType)
 * KHÔNG được promote — chúng cần sửa dữ liệu thủ công (System Diagnostics).
 * retryCount reset 0: mỗi vòng promote = một round attempt mới (có backoff),
 * và tránh kích hoạt nhầm failsafe stall (ops.every(rc >= 5)).
 */
export async function promoteTransientFailedOps(): Promise<void> {
  const db = getDB()
  const failed = await db.syncQueue.where('status').equals('failed').toArray()
  for (const item of failed) {
    if (!isOwnOp(item)) continue
    // A-NEW-32: lastError được mã hóa khi ghi — giải mã trước khi regex (mã
    // ciphertext base64 không bao giờ khớp pattern nên op lỗi vĩnh viễn sẽ bị
    // promote nhầm nếu bỏ qua bước này).
    const err = (await decryptQueueValue(item.lastError || '')) || ''
    if (/client error 4\d\d|unknown entitytype/i.test(err)) continue
    await db.syncQueue.update(item.id, {
      status: 'pending',
      retryCount: 0,
      lastError: null,
      updatedAt: new Date().toISOString(),
    })
  }
}

/** Sau khi notice create trả về server ID, remap trong tất cả pending ops đang dùng temp ID */
export async function remapNoticeIdInPendingOps(oldId: string, newId: string) {
  const db = getDB()
  const pending = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'retrying', 'failed'])
    .toArray()
  for (const item of pending.filter(isOwnOp)) {
    if (item.serverAcknowledgement) continue
    const payload = await parseQueuePayload(item.payload, true)
    if (!payload) continue
    const updates: { payload?: string; entityId?: string; updatedAt?: string } = {}
    if (item.entityId === oldId) {
      updates.entityId = newId
    }
    if (payload.id === oldId) {
      payload.id = newId
      updates.payload = await encryptQueueValue(JSON.stringify(payload))
    }
    if (updates.entityId || updates.payload) {
      updates.updatedAt = new Date().toISOString()
      await db.syncQueue.update(item.id, updates)
    }
  }
}

/** Sau khi class create trả về server ID, remap classId trong tất cả pending ops đang dùng temp ID */
export async function remapClassIdInPendingOps(oldId: string, newId: string) {
  const db = getDB()
  const raw = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'retrying', 'failed'])
    .toArray()
  const pending = raw.filter(isOwnOp)
  for (const item of pending) {
    if (item.serverAcknowledgement) continue
    const payload = await parseQueuePayload(item.payload, true)
    if (!payload) continue
    const updates: { payload?: string; entityId?: string; updatedAt?: string } = {}
    // ADR-016 (S23): Cập nhật CẢ entityId của chính op (class UPDATE dùng
    // temp ID làm entityId → server trả 404 vĩnh viễn nếu không remap).
    if (item.entityId === oldId) {
      updates.entityId = newId
    }
    if (payload.classId === oldId) {
      payload.classId = newId
      updates.payload = await encryptQueueValue(JSON.stringify(payload))
    }
    if (payload.id === oldId) {
      payload.id = newId
      updates.payload = await encryptQueueValue(JSON.stringify(payload))
    }
    if (updates.entityId || updates.payload) {
      updates.updatedAt = new Date().toISOString()
      await db.syncQueue.update(item.id, updates)
    }
  }
}

/** Sau khi student create trả về server ID, remap trong tất cả pending ops đang dùng temp ID */
export async function remapStudentIdInPendingOps(oldId: string, newId: string) {
  const db = getDB()
  const raw = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'retrying', 'failed'])
    .toArray()
  const pending = raw.filter(isOwnOp)
  for (const item of pending) {
    if (item.serverAcknowledgement) continue
    const payload = await parseQueuePayload(item.payload, true)
    if (!payload) continue
    const updates: { payload?: string; entityId?: string; updatedAt?: string } = {}
    // ADR-016 (S23): Op UPDATE của chính student đó (entityId = temp ID)
    // phải được remap entityId, không chỉ studentId trong payload của các op khác.
    if (item.entityId === oldId) {
      updates.entityId = newId
    }
    if (item.entity === 'exam_result' && item.entityId.endsWith(`::result::${oldId}`)) {
      updates.entityId = `${item.entityId.slice(0, -oldId.length)}${newId}`
    }
    if (payload.studentId === oldId) {
      payload.studentId = newId
      updates.payload = await encryptQueueValue(JSON.stringify(payload))
    }
    // Student UPDATE payload chứa cả field `id` của chính nó.
    if (payload.id === oldId) {
      payload.id = newId
      updates.payload = await encryptQueueValue(JSON.stringify(payload))
    }
    if (Array.isArray(payload.scores)) {
      let modified = false
      for (const s of payload.scores) {
        if (s && s.studentId === oldId) {
          s.studentId = newId
          modified = true
        }
      }
      if (modified) {
        updates.payload = await encryptQueueValue(JSON.stringify(payload))
      }
    }
    if (payload.score && typeof payload.score === 'object' && (payload.score as Record<string, unknown>).studentId === oldId) {
      ;(payload.score as Record<string, unknown>).studentId = newId
      updates.payload = await encryptQueueValue(JSON.stringify(payload))
    }
    if (updates.entityId || updates.payload) {
      updates.updatedAt = new Date().toISOString()
      await db.syncQueue.update(item.id, updates)
    }
  }
}

/** Sau khi exam session create trả về server ID, remap sessionId trong tất cả pending ops đang dùng temp ID */
export async function remapExamSessionIdInPendingOps(oldId: string, newId: string) {
  const db = getDB()
  const raw = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'retrying', 'failed'])
    .toArray()
  const pending = raw.filter(isOwnOp)
  for (const item of pending) {
    if (item.serverAcknowledgement) continue
    const payload = await parseQueuePayload(item.payload, true)
    if (!payload) continue
    const updates: { payload?: string; entityId?: string; updatedAt?: string } = {}
    if (item.entityId === oldId) {
      updates.entityId = newId
    }
    if (item.entity === 'exam_result' && item.entityId.startsWith(`${oldId}::result::`)) {
      updates.entityId = `${newId}${item.entityId.slice(oldId.length)}`
    }
    if (payload.sessionId === oldId) {
      payload.sessionId = newId
      updates.payload = await encryptQueueValue(JSON.stringify(payload))
    }
    if (payload.examSessionId === oldId) {
      payload.examSessionId = newId
      updates.payload = await encryptQueueValue(JSON.stringify(payload))
    }
    if (payload.id === oldId) {
      payload.id = newId
      updates.payload = await encryptQueueValue(JSON.stringify(payload))
    }
    if (updates.entityId || updates.payload) {
      updates.updatedAt = new Date().toISOString()
      await db.syncQueue.update(item.id, updates)
    }
  }
}
