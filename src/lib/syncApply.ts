import { useSyncStore, isOwnOp } from '../stores/syncStore'
import { useStudentStore } from '../stores/studentStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useNoticeStore } from '../stores/noticeStore'
import { useClassStore } from '../stores/classStore'
import { useExamStore } from '../stores/examStore'
import { api, ApiError } from './api'
import type { SyncQueueItem } from './db'
import { getDB } from './db'
import * as Sentry from '@sentry/react'
import {
  parseQueuePayload,
  remapStudentIdInPendingOps,
  remapClassIdInPendingOps,
  remapExamSessionIdInPendingOps,
  remapNoticeIdInPendingOps,
} from './syncQueueMaintenance'

/**
 * REFACTOR-SYNC-1 (2026-08-24): tách từ `hooks/useSyncEngine.ts` (god-file) —
 * tầng APPLY của sync engine: F9 field-level merge, áp kết quả server vào local
 * stores + remap temp-ID, và batch flush với cách ly record zod-invalid.
 * Bảo toàn hành vi 1:1 (behavior-preserving extraction).
 */

/**
 * F9 (audit): Field-level merge trên version conflict (grade/attendance). Trước đây
 * server-wins: removeOp + applyServerResultAsync(record server) → chỉnh sửa offline
 * của user biến mất vĩnh viễn. Chiến lược mới:
 *   1. Base = record server MỚI NHẤT (id + version thật, các field không đổi giữ server)
 *   2. Áp lại field mà user ĐÃ đổi (có trong payload local; null = user đã xóa điểm)
 *   3. Ghi merged xuống local store (UI phản ánh ngay), rồi re-queue UPDATE với
 *      version server → cycle kế tiếp server chấp nhận, chỉnh sửa local thắng đúng field đó.
 * An toàn lặp: server version là version hiện hành nên op kế tiếp không conflict nữa.
 */
const GRADE_SCORE_FIELDS = ['scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc'] as const
const ATTENDANCE_FIELDS = ['status', 'note'] as const

function mergeRecordWithLocalEdits(
  localPayload: Record<string, unknown>,
  serverRecord: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...serverRecord }
  for (const f of fields) {
    if (localPayload[f] !== undefined) merged[f] = localPayload[f]
  }
  return merged
}

/** F9: Xử lý conflict batch grade/attendance — merge rồi re-queue thay vì server-wins. */
export async function resolveConflictWithMerge(op: SyncQueueItem, serverRecord: any): Promise<void> {
  const store = useSyncStore.getState()
  const entity = (op.entity || '').toLowerCase()
  let localPayload: Record<string, unknown> = {}
  try {
    localPayload = await parseQueuePayload(op.payload)
  } catch {
    // payload hỏng — rơi về server record
  }

  const fields = entity === 'grade' ? GRADE_SCORE_FIELDS : entity === 'attendance' ? ATTENDANCE_FIELDS : []
  const merged = mergeRecordWithLocalEdits(localPayload, serverRecord, fields)

  // Keep an encrypted, user-scoped diagnostic record. The engine has already
  // merged local edited fields over the latest server base and retries with the
  // server version; the inbox never grants an unconditional overwrite action.
  try {
    await store.addConflict({
      entity,
      entityId: String(serverRecord?.id || op.entityId),
      operation: 'UPDATE',
      localValue: op.payload,
      serverValue: JSON.stringify(serverRecord),
    })
  } catch (error) {
    Sentry.captureException(error)
  }

  await store.removeOp(op.id)
  await applyServerResultAsync(op, merged)
  await store.addOp({
    entity: entity as SyncQueueItem['entity'],
    entityId: String(merged.id || op.entityId),
    operation: 'UPDATE',
    payload: JSON.stringify(merged),
  })
}

/**
 * ADR-016 (S4): Async version of applyServerResult that AWAITS the ID remap
 * before returning. Used in Phase 1.5 so that Phase 2's batch reads the
 * remapped payloads instead of stale temp IDs.
 */
export async function applyServerResultAsync(op: SyncQueueItem, serverData: any) {
  const entity = (op.entity || '').toLowerCase()

  try {
    if (entity === 'student' && serverData?.id && serverData.id !== op.entityId) {
      const studentStore = useStudentStore.getState()
      const oldId = op.entityId!
      const newId = serverData.id
      studentStore.replaceStudentId(oldId, serverData)
      // ADR-016 (S4): AWAIT remap so Phase 2 sees the real studentId.
      await remapStudentIdInPendingOps(oldId, newId)
    }

    if (entity === 'class' && serverData?.id && serverData.id !== op.entityId) {
      const classStore = useClassStore.getState()
      const oldClassId = op.entityId!
      const newClassId = serverData.id
      classStore.replaceClassId(oldClassId, serverData)
      // ADR-016 (S4): AWAIT remap so Phase 2 sees the real classId.
      await remapClassIdInPendingOps(oldClassId, newClassId)
    }

    if ((entity === 'exam' || entity === 'exams') && serverData?.id && serverData.id !== op.entityId) {
      const examStore = useExamStore.getState()
      const oldId = op.entityId!
      const newId = serverData.id
      examStore.replaceSessionId?.(oldId, serverData)
      await remapExamSessionIdInPendingOps(oldId, newId)
    }

    // Scan Engine v2: sau khi hàng đợi offline được server chấm lại, kéo bản
    // authoritative về ngay để UI không giữ điểm client nếu thuật toán/version lệch.
    if ((entity === 'exam' || entity === 'exams') && Array.isArray(serverData?.adjustments)) {
      const examStore = useExamStore.getState()
      if (examStore.selectedSessionId) await examStore.refreshResults()
    }

    if (entity === 'exam_result') {
      const payload = await parseQueuePayload(op.payload)
      const score = payload.score && typeof payload.score === 'object'
        ? payload.score as Record<string, unknown>
        : null
      const clientMutationId = score?.clientMutationId ? String(score.clientMutationId) : ''
      if (clientMutationId) {
        const acknowledgement = Array.isArray(serverData?.items)
          ? serverData.items.find((item: any) => item?.clientMutationId === clientMutationId)
          : null
        const serverScore = typeof acknowledgement?.serverScore === 'number'
          ? acknowledgement.serverScore
          : undefined
        const resultVersion = typeof acknowledgement?.resultVersion === 'number'
          ? acknowledgement.resultVersion
          : undefined
        useExamStore.getState().markResultMutation(clientMutationId, 'synced', { serverScore, resultVersion })
      }
    }

    if (entity === 'grade' && serverData?.id) {
      const gradeStore = useGradeStore.getState()
      void gradeStore.upsertGrade(serverData, true)
    }

    if (entity === 'notice' || entity === 'notices') {
      if (serverData?.id) {
        const noticeStore = useNoticeStore.getState()
        const oldId = op.entityId!
        const newId = serverData.id
        noticeStore.replaceNoticeId(oldId, serverData)
        if (newId !== oldId) {
          await remapNoticeIdInPendingOps(oldId, newId)
        }
      }
    }

    if (entity === 'attendance' && serverData?.id) {
      const attStore = useAttendanceStore.getState()
      void attStore.saveAttendance(
        serverData.studentId,
        serverData.date,
        serverData.type,
        serverData.status,
        serverData.note,
        true,
        serverData,
      )
    }

    // Tier 2: daily_entry dùng id client-stable (DG-...) nên không remap.
    // Local entry đã là truth cho lần nhập tay; server chỉ echo receipt
    // (created/duplicate) — không merge gì thêm. DELETE cũng đã xóa local trước.
    if (entity === 'daily_entry') {
      /* no-op: id ổn định, không remap, không merge */
    }
  } catch (err) {
    Sentry.captureException(err)
    if (op.operation === 'CREATE') throw err
  }
}

/** XD-07: durable encrypted acknowledgement is the retry journal. Only retire
 * a committed parent after every local remap has succeeded. A failure aborts
 * this sync cycle so dependent batches cannot send unresolved temp IDs. */
export async function acknowledgeCreatedParent(op: SyncQueueItem, serverData: any): Promise<void> {
  const store = useSyncStore.getState()
  try {
    if (!isOwnOp(op)) throw new Error('CREATE acknowledgement owner changed')
    if (!serverData || typeof serverData.id !== 'string' || !serverData.id) throw new Error('Missing canonical identity in CREATE acknowledgement')
    await store.updateOp(op.id, { serverAcknowledgement: JSON.stringify(serverData) })
    const persisted = await getDB().syncQueue.get(op.id)
    if (!persisted?.serverAcknowledgement || !isOwnOp(persisted)) throw new Error('CREATE acknowledgement was not retained for the current owner')
    await applyServerResultAsync(op, serverData)
    await store.removeOp(op.id)
  } catch (error) {
    await store.updateOp(op.id, { status: 'retrying', lastError: 'Local acknowledgement reconciliation interrupted; retry required' })
    throw error
  }
}

/**
 * A permanent student mutation rejection means the optimistic row is no longer
 * a valid local projection. Keep the failed queue payload for Diagnostics, but
 * restore the server object when possible and otherwise remove the untrusted
 * optimistic row until the next authoritative roster pull.
 */
export async function reconcilePermanentlyRejectedStudentOp(op: SyncQueueItem): Promise<void> {
  if ((op.entity || '').toLowerCase() !== 'student' || !op.entityId) return
  const studentStore = useStudentStore.getState()
  if (op.operation === 'CREATE') {
    studentStore.discardOptimisticStudent(op.entityId)
    return
  }

  try {
    const serverStudent = await api.getStudent(op.entityId)
    if (serverStudent?.id && !serverStudent.deletedAt) {
      studentStore.reconcileImportedStudents([{ action: 'updated', student: serverStudent }])
    } else {
      studentStore.discardOptimisticStudent(op.entityId)
    }
  } catch (error) {
    studentStore.discardOptimisticStudent(op.entityId)
    Sentry.captureException(error)
  }
}

/**
 * ADR-016 (sync-fix): Trích index + message của các record lỗi từ zod issues
 * (response 400 của @hono/zod-validator: path dạng ["grades", 21, "academicYear"]).
 * Trả null nếu không parse được → caller fallback cách ly từng record.
 */
export function extractZodBadIndexes(
  err: unknown,
  root: string,
  opCount: number
): { badIndexes: Set<number>; messages: Map<number, string> } | null {
  const issues: any[] = (err as any)?.issues
  if (!Array.isArray(issues) || issues.length === 0) return null
  const badIndexes = new Set<number>()
  const messages = new Map<number, string>()
  for (const issue of issues) {
    const path = Array.isArray(issue?.path) ? issue.path : []
    if (path[0] !== root) continue
    const idx = typeof path[1] === 'number' ? path[1] : -1
    if (idx < 0 || idx >= opCount) continue
    badIndexes.add(idx)
    const field = path[2] !== undefined ? String(path[2]) : 'payload'
    const msg = typeof issue?.message === 'string' && issue.message ? issue.message : 'dữ liệu không hợp lệ'
    if (!messages.has(idx)) messages.set(idx, `Client error 400: ${field} — ${msg}`)
  }
  return { badIndexes, messages }
}

interface BatchGradeResult {
  studentId: string
  status: 'saved' | 'conflict' | 'error'
  error?: string
  currentGrade?: any
  record?: any
}

/**
 * ADR-016 (sync-fix): Áp kết quả batch upsert lên từng op — dùng chung cho
 * nhánh thành công và nhánh cách ly (sau khi loại bỏ record zod-invalid).
 */
async function applyUpsertBatchResults(
  results: BatchGradeResult[],
  ops: SyncQueueItem[],
  store: ReturnType<typeof useSyncStore.getState>,
  state: { mergedConflictCount: number }
): Promise<void> {
  for (let i = 0; i < results.length; i++) {
    const item = results[i]
    const op = ops[i]
    if (!op) continue
    if (item.status === 'saved') {
      await store.removeOp(op.id)
      // ADR-016 (offline-sync audit #2): rehydrate bản ghi tạm thành row server
      // (id + version thật) TRƯỚC khi xóa op — tránh 409 ở lần sửa kế tiếp.
      if (item.record) await applyServerResultAsync(op, item.record)
    } else if (item.status === 'conflict') {
      state.mergedConflictCount++
      // F9: merge field-level + re-queue thay vì server-wins.
      if (item.currentGrade && typeof item.currentGrade === 'object') {
        await resolveConflictWithMerge(op, item.currentGrade)
      } else {
        await store.removeOp(op.id)
        if (item.currentGrade) await applyServerResultAsync(op, item.currentGrade)
      }
    } else {
      const rc = (op.retryCount || 0) + 1
      await store.updateOp(op.id, { status: rc >= 5 ? 'failed' : 'retrying', retryCount: rc, lastError: item.error })
    }
  }
}

/**
 * ADR-016 (sync-fix): Gửi batch điểm với cách ly record zod-invalid.
 * Trước đây 1 record hỏng → HTTP 400 cho CẢ batch → toàn bộ op retry cùng lúc,
 * retry vô hạn, 1 ô điểm sai chặn cả lớp đồng bộ. Giờ:
 *  - 400 có issues → đánh failed CHỈ record hỏng (message "Client error 400" để
 *    promoteTransientFailedOps không hoàn-sinh lỗi vĩnh viễn), gửi lại phần còn lại.
 *  - 400 không parse được → fallback từng record (mỗi op 1 request /grades).
 *  - 5xx / network → retry nguyên batch như cũ.
 */
export async function flushGradeBatchWithIsolation(
  payloads: Record<string, unknown>[],
  validOps: SyncQueueItem[],
  store: ReturnType<typeof useSyncStore.getState>,
  state: { mergedConflictCount: number }
): Promise<void> {
  let pending = payloads.slice()
  let pendingOps = validOps.slice()

  while (pending.length > 0) {
    try {
      const batchRes = await api.batchUpsertGrades(pending)
      await applyUpsertBatchResults(batchRes.results || [], pendingOps, store, state)
      return
    } catch (err) {
      const bad = extractZodBadIndexes(err, 'grades', pendingOps.length)
      if (bad && bad.badIndexes.size > 0) {
        for (const i of bad.badIndexes) {
          const op = pendingOps[i]
          if (!op) continue
          await store.updateOp(op.id, {
            status: 'failed',
            lastError: bad.messages.get(i) || 'Client error 400: dữ liệu điểm không hợp lệ',
          })
        }
        store.setLastError(`Đã cách ly ${bad.badIndexes.size} bản ghi điểm không hợp lệ khỏi đồng bộ — kiểm tra trong System Diagnostics.`)
        pending = pending.filter((_, i) => !bad.badIndexes.has(i))
        pendingOps = pendingOps.filter((_, i) => !bad.badIndexes.has(i))
        continue
      }
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        // 4xx nhưng không lấy được issues → thử từng record một
        for (let i = 0; i < pendingOps.length; i++) {
          const op = pendingOps[i]
          try {
            const r = await api.upsertGrade(pending[i])
            await applyUpsertBatchResults([{ studentId: op.entityId, status: 'saved', record: r }], [op], store, state)
          } catch (e2) {
            const rc = (op.retryCount || 0) + 1
            const msg = e2 instanceof ApiError ? `Client error ${e2.status}: ${e2.message}` : String(e2)
            await store.updateOp(op.id, { status: rc >= 5 ? 'failed' : 'retrying', retryCount: rc, lastError: msg })
          }
        }
        return
      }
      // network / 5xx → giữ hành vi retry cũ
      for (const op of pendingOps) {
        const rc = (op.retryCount || 0) + 1
        await store.updateOp(op.id, { status: rc >= 5 ? 'failed' : 'retrying', retryCount: rc, lastError: 'Batch grade call failed' })
      }
      return
    }
  }
}

/**
 * ADR-016 (sync-fix): Gửi batch điểm danh (theo date|type) với cách ly record
 * zod-invalid — tương tự flushGradeBatchWithIsolation (root issues = 'records').
 */
export async function flushAttendanceBatchWithIsolation(
  batch: SyncQueueItem[],
  firstPayload: any,
  store: ReturnType<typeof useSyncStore.getState>,
  state: { mergedConflictCount: number }
): Promise<void> {
  let pending = batch.slice()
  let first = firstPayload
  while (pending.length > 0) {
    const records = pending.map(async op => {
      try {
        const p = await parseQueuePayload(op.payload)
        // ADR-016 (S21): Giữ version từng record để server phát hiện xung đột.
        return {
          studentId: String(p.studentId || ''),
          status: String(p.status || ''),
          note: p.note != null ? String(p.note) : undefined,
          version: typeof p.version === 'number' ? p.version : undefined,
        }
      } catch { return { studentId: '', status: 'Present' } }
    })
    try {
      const resolvedRecords = await Promise.all(records)
      const batchRes = await api.batchUpsertAttendance(first.date, first.type, resolvedRecords)
      const results = batchRes.results || []
      for (let i = 0; i < results.length; i++) {
        const item = results[i]
        const op = pending[i]
        if (!op) continue
        // 'skipped' = idempotent no-op (version không đổi) — vẫn coi là thành công.
        if (item.status === 'saved' || item.status === 'skipped') {
          await store.removeOp(op.id)
          // ADR-016 (S24): AWAIT remap trước khi op sau trong Phase 3 đọc queue.
          if (item.record) await applyServerResultAsync(op, item.record)
        } else if (item.status === 'conflict' && item.record) {
          state.mergedConflictCount++
          await resolveConflictWithMerge(op, item.record)
        } else {
          const rc = (op.retryCount || 0) + 1
          await store.updateOp(op.id, { status: rc >= 5 ? 'failed' : 'retrying', retryCount: rc, lastError: item.reason || item.status })
        }
      }
      return
    } catch (err) {
      const bad = extractZodBadIndexes(err, 'records', pending.length)
      if (bad && bad.badIndexes.size > 0) {
        for (const i of bad.badIndexes) {
          const op = pending[i]
          if (!op) continue
          await store.updateOp(op.id, {
            status: 'failed',
            lastError: bad.messages.get(i) || 'Client error 400: dữ liệu điểm danh không hợp lệ',
          })
        }
        store.setLastError(`Đã cách ly ${bad.badIndexes.size} bản ghi điểm danh không hợp lệ khỏi đồng bộ — kiểm tra trong System Diagnostics.`)
        pending = pending.filter((_, i) => !bad.badIndexes.has(i))
        continue
      }
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        for (let i = 0; i < pending.length; i++) {
          const op = pending[i]
          try {
            let p: any = {}
            try { p = await parseQueuePayload(op.payload) } catch {}
            const r = await api.upsertAttendance(p)
            await store.removeOp(op.id)
            if (r?.id) await applyServerResultAsync(op, r)
          } catch (e2) {
            const rc = (op.retryCount || 0) + 1
            const msg = e2 instanceof ApiError ? `Client error ${e2.status}: ${e2.message}` : String(e2)
            await store.updateOp(op.id, { status: rc >= 5 ? 'failed' : 'retrying', retryCount: rc, lastError: msg })
          }
        }
        return
      }
      for (const op of pending) {
        const rc = (op.retryCount || 0) + 1
        await store.updateOp(op.id, { status: rc >= 5 ? 'failed' : 'retrying', retryCount: rc, lastError: 'Batch attendance call failed' })
      }
      return
    }
  }
}
