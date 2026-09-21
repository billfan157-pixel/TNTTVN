import { useSyncStore, migrateLegacyQueueOwnership, isOwnOp, getOwnUnsettledSyncOperations } from '../stores/syncStore'
import { api, isAuthenticated } from '../lib/api'
import { getDB } from '../lib/db'
import { resetClientData, getLocalPurgeVersion, PURGE_VERSION_KEY } from '../lib/resetClientData'
import { processOperation, getBackoffMs, isNetworkError } from '../lib/syncProcessor'
import { useStudentStore } from '../stores/studentStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useNoticeStore } from '../stores/noticeStore'
import { useClassStore } from '../stores/classStore'
import { useExamStore } from '../stores/examStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { decryptQueueValue } from '../lib/offlineCipher'
import { runWithSyncLease } from '../lib/syncLease'
import type { SyncQueueItem } from '../lib/db'
import { captureTenantScope, getTenantScope, type TenantScopeSnapshot } from '../lib/tenantScope'
import {
  isSyncOwnerCurrent,
  persistSyncResultForOwner,
  quarantineMarkedSyncScopes,
  readPersistedSyncResult,
} from '../lib/syncSessionBoundary'
import {
  captureSyncCursorScope,
  readSyncCursor,
  writeSyncCursorIfScopeMatches,
} from '../lib/syncCursor'
import { tripContinuousScanCircuit } from '../lib/examContinuousRollout'
import * as Sentry from '@sentry/react'
import {
  pruneStaleQueueItems,
  promoteTransientFailedOps,
  parseQueuePayload,
} from '../lib/syncQueueMaintenance'
import {
  applyServerResultAsync,
  acknowledgeCreatedParent,
  reconcilePermanentlyRejectedStudentOp,
  resolveConflictWithMerge,
  flushGradeBatchWithIsolation,
  flushAttendanceBatchWithIsolation,
} from '../lib/syncApply'

/**
 * REFACTOR-SYNC-1 (2026-08-24): god-file 1029 dòng tách thành 3 module theo vai trò:
 * - `lib/syncQueueMaintenance.ts` — bảo trì queue thuần (prune/promote/remap temp-ID)
 * - `lib/syncApply.ts` — tầng APPLY (F9 merge, áp kết quả server, batch isolation)
 * - file này — framework-neutral orchestration: initial sync, queue flow and pull
 * - `hooks/useSyncEngine.ts` — browser lifecycle only
 */
export { pruneStaleQueueItems, promoteTransientFailedOps } from '../lib/syncQueueMaintenance'
export { extractZodBadIndexes, flushGradeBatchWithIsolation, flushAttendanceBatchWithIsolation } from '../lib/syncApply'

export async function commitPullCursor(serverTime: string, expectedScopeKey: string | null): Promise<boolean> {
  const committed = await writeSyncCursorIfScopeMatches(serverTime, expectedScopeKey)
  if (committed) useSyncStore.getState().setLastSync(serverTime)
  return committed
}

/**
 * FE-F1 (audit 2026-08-21): hoàn tác optimistic "Hoàn tất phiên" offline.
 * examStore.completeAndFinalize offline set local status='completed' TRƯỚC khi
 * server xác nhận (op 'complete' vào queue). Nếu op bị server từ chối VĨNH VIỄN
 * (điển hình 403 học kỳ đã khóa — negative ADR-024), trạng thái local phải revert
 * về draft; trước đây không có đường nào nên teacher tiếp tục thấy phiên "đã
 * hoàn tất" trong khi server vẫn draft và điểm chưa ghi.
 */
export async function revertFailedExamCompleteOp(op: SyncQueueItem): Promise<void> {
  const entity = String(op.entity || '').toLowerCase()
  if (entity !== 'exam' && entity !== 'exams') return
  if (String(op.operation || '').toLowerCase() !== 'update') return

  let raw: unknown = op.payload
  if (typeof raw === 'string') {
    raw = await decryptQueueValue(raw)
    if (raw === null) return
  }
  let data: unknown = raw
  try {
    if (typeof data === 'string') data = JSON.parse(data)
  } catch {
    return
  }
  if (!data || typeof data !== 'object' || (data as Record<string, unknown>).action !== 'complete') return

  const sessionId = (data as Record<string, unknown>).sessionId || op.entityId
  if (sessionId) useExamStore.getState().revertLocalComplete(String(sessionId))
}

/** Mark a durable continuous-scan item as terminally failed without discarding it. */
export async function markFailedExamResultOp(op: SyncQueueItem, error?: string): Promise<void> {
  if (String(op.entity || '').toLowerCase() !== 'exam_result') return
  let raw: unknown = op.payload
  if (typeof raw === 'string') {
    raw = await decryptQueueValue(raw)
    if (raw === null) return
  }
  try {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw
    const mutationId = payload?.score?.clientMutationId
    if (mutationId) {
      const status = /xung đột|idempotency/i.test(error || '') ? 'conflict' : 'error'
      useExamStore.getState().markResultMutation(String(mutationId), status, { error })
      tripContinuousScanCircuit(
        getTenantScope(),
        status === 'conflict' ? 'idempotency_conflict' : 'result_sync_terminal_failure',
      )
    }
  } catch {
    // Corrupt payload remains in diagnostics; no mutation id can be trusted.
  }
}

async function processClaimedOperation(op: SyncQueueItem, owner: TenantScopeSnapshot) {
  try {
    if (op.serverAcknowledgement) {
      const retained = await readPersistedSyncResult(op)
      if (retained) return retained as Awaited<ReturnType<typeof processOperation>>
    }
    return await processOperation(op, owner)
  } catch (error) {
    await useSyncStore.getState().updateOp(op.id, {
      status: 'retrying',
      lastError: (error as Error).message || 'Sync operation interrupted before acknowledgement',
    })
    throw error
  }
}

class SyncOwnerChangedError extends Error {
  constructor() {
    super('Sync owner changed while an operation was in flight')
  }
}

function requireFlowOwner(owner: TenantScopeSnapshot, op?: SyncQueueItem): void {
  if (!isSyncOwnerCurrent(owner, op)) throw new SyncOwnerChangedError()
}

async function journalSuccessfulResult(op: SyncQueueItem, result: Awaited<ReturnType<typeof processOperation>>): Promise<void> {
  if (!result.ok) return
  try {
    await persistSyncResultForOwner(op, result)
  } catch (error) {
    // The server may have committed. Re-arm the original row so its stable
    // idempotency key can recover; never strand it in processing.
    await useSyncStore.getState().updateOp(op.id, {
      status: 'retrying',
      lastError: 'Server response could not be retained locally; retry required',
    })
    throw error
  }
}

async function preserveLegacyCreateEdits(op: SyncQueueItem): Promise<void> {
  const store = useSyncStore.getState()
  try {
    let raw: unknown = op.payload
    if (typeof raw === 'string') raw = await decryptQueueValue(raw)
    if (raw === null) throw new Error('Legacy CREATE payload could not be recovered')
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Legacy CREATE payload is not a valid object')
    }

    const source = parsed as Record<string, unknown>
    let desired: Record<string, unknown>
    if (op.entity === 'exam') {
      const action = String(source.action || '')
      const allowedKeys = action === 'save_results'
        ? ['action', 'sessionId', 'scores']
        : action === 'remove_result'
          ? ['action', 'sessionId', 'studentId']
          : ['complete', 'reopen'].includes(action)
            ? ['action', 'sessionId']
            : []
      if (allowedKeys.length === 0) throw new Error('Legacy exam CREATE has no supported folded update')
      if (action === 'save_results' && !Array.isArray(source.scores)) {
        throw new Error('Legacy exam CREATE has an invalid folded save_results payload')
      }
      if (action === 'remove_result' && !source.studentId) {
        throw new Error('Legacy exam CREATE has an invalid folded remove_result payload')
      }
      desired = Object.fromEntries(allowedKeys.map(key => [key, source[key]]))
      desired.sessionId = desired.sessionId || op.entityId
    } else {
      desired = { ...source }
      for (const key of [
        'id', 'code', 'parishId', 'idempotencyKey', 'createdAt', 'createdBy',
        'updatedAt', 'updatedBy', 'deletedAt',
      ]) delete desired[key]
    }

    await store.addOp({
      entity: op.entity,
      entityId: op.entityId,
      operation: 'UPDATE',
      payload: JSON.stringify(desired),
    })
  } catch (error) {
    // The server-side winner is already known and journaled. Re-arm the
    // original owner-bound row so recovery can be retried without another
    // untracked CREATE or a stranded processing lease.
    await store.updateOp(op.id, {
      status: 'retrying',
      lastError: 'Legacy CREATE edits could not be retained before acknowledgement',
    })
    throw error
  }
}

/** Initial pull/push sequence formerly embedded in the React hook. */
export async function runInitialSync(): Promise<void> {
  // Authenticated bootstrap has one owner. These reference stores used to be
  // fetched once from main.tsx before a fresh login had established a session,
  // leaving server policy/year defaults stale until a reload.
  await Promise.all([
    useSettingsStore.getState().fetchSettings(),
    useAcademicYearStore.getState().fetchAcademicYears(),
  ])

  const state = useSyncStore.getState()
  const count = await state.refreshCount()
  if (count > 0) {
    await runSyncFlow()
  } else {
    const pullScopeKey = captureSyncCursorScope()
    const pullResult = await fetchAllData(true)
    if (pullResult.ok && pullResult.queryTime) {
      await commitPullCursor(pullResult.queryTime, pullScopeKey)
    }
  }

  // An empty local roster with a durable cursor is not a valid delta base.
  if (useStudentStore.getState().students.length === 0 && navigator.onLine) {
    const healScopeKey = captureSyncCursorScope()
    const healResult = await fetchAllData(false)
    if (healResult.ok && healResult.queryTime) {
      await commitPullCursor(healResult.queryTime, healScopeKey)
    }
  }
}

export async function runSyncFlow(leaseHeld = false) {
  const store = useSyncStore.getState()
  if (store.status === 'syncing') return

  if (!navigator.onLine) {
    store.setStatus('offline')
    return
  }

  // SECURITY (2026-08-11) — A-NEW-10 hardening: access token memory-only —
  // guard bằng isAuthenticated() (memory token HOẶC parish_current_user persist).
  if (!isAuthenticated()) {
    store.setStatus('idle')
    return
  }

  if (!leaseHeld) {
    await runWithSyncLease(() => runSyncFlow(true))
    return
  }


  const flowOwner = captureTenantScope()
  if (!flowOwner) {
    store.setStatus('idle')
    return
  }

  store.setStatus('syncing')
  store.setLastError(null)

  try {
    if (!await verifyClientDataGeneration(true)) {
      store.setStatus('failed')
      store.setLastError('Chưa xác minh được phiên dữ liệu máy chủ; giữ hàng đợi, chưa gửi thay đổi.')
      return
    }
    requireFlowOwner(flowOwner)
    // AUTH-P1-003: a queue created under a server-revoked session must never
    // cross a later login boundary. Finish any interrupted quarantine before
    // reading or claiming durable mutations.
    await quarantineMarkedSyncScopes()
    // OS-02: Migration 1 lần cho legacy queue items của user hiện tại
    await migrateLegacyQueueOwnership()
    // A browser/process can stop after a durable op was claimed but before its
    // response was handled. Re-arm only expired processing leases; live claims
    // stay invisible to queue compaction and to concurrent sync cycles.
    await store.recoverStaleProcessingOps()
    await pruneStaleQueueItems()

    // Phase 1: Compact queue (merge duplicate operations) then flush
    await store.compactQueue()
    // ADR-016 (S24): Auto-recover failed ops do lỗi TẠM THỜI (network/5xx/rate-limit)
    // trước khi lấy queue — audit finding #10: op failed không bao giờ tự retry.
    // Op fail do lỗi vĩnh viễn (4xx) KHÔNG được promote (cần sửa tay qua Diagnostics).
    await promoteTransientFailedOps()
    let ops = await store.getPendingOps()

    // Failsafe: nếu tất cả ops đều thất bại quá 5 lần, dừng sync
    const allTooManyRetries = ops.length > 0 && ops.every(o => (o.retryCount || 0) >= 5)
    if (allTooManyRetries) {
      store.setStatus('idle')
      store.setLastError('Sync stalled — tất cả thao tác đã thử lại quá nhiều lần')
      return
    }

    // SYNC-CONFLICT-1: chỉ còn merged conflicts (F9) — business/state conflict
    // giờ là permanent-fail hiển thị qua failedCount, không còn "server wins".
    const syncState = { mergedConflictCount: 0 }

    // ─── Phase 1.5: Parent entity CREATEs FIRST ───
    // ADR-016: If a user creates a student/class offline (temp ID) then immediately
    // enters grades/attendance for it, the CREATE operations MUST be pushed before
    // the batch UPDATEs — otherwise the server rejects the child records with 404
    // and syncProcessor drops them as unrecoverable client errors (data loss).
    const createOps = ops.filter(o => o.operation === 'CREATE' && (o.entity === 'student' || o.entity === 'class' || o.entity === 'exam'))
    for (const queuedOp of createOps) {
      if (!navigator.onLine) {
        store.setStatus('offline')
        return
      }
      const op = await store.claimOp(queuedOp.id)
      if (!op) continue
      requireFlowOwner(flowOwner, op)
      const result = await processClaimedOperation(op, flowOwner)
      await journalSuccessfulResult(op, result)
      await new Promise(r => setTimeout(r, 200))
      requireFlowOwner(flowOwner, op)

      if (result.ok) {
        if (result.preserveFoldedUpdate) {
          await preserveLegacyCreateEdits(op)
        }
        await acknowledgeCreatedParent(op, result.data, flowOwner)
        // SYNC-CONFLICT-1: CREATE student/class/exam không còn nhánh isConflict —
        // business 409 (vd CLASS_CODE_EXISTS) giờ là permanent-fail (xử lý ở
        // nhánh else bên dưới), op giữ payload để user xử lý tường minh.
      } else if (result.isAuthError || result.error?.includes('Auth expired') || result.error?.includes('Unauthorized')) {
        await store.updateOp(op.id, { status: 'retrying', lastError: result.error })
        localStorage.removeItem('parish_access_token')
        store.setStatus('idle')
        store.setLastError('Xác thực hết hạn — vui lòng đăng nhập lại')
        import('../router').then(m => m.router.navigate({ to: '/login' })).catch(() => { window.location.href = '/login' })
        return
      } else if (result.recoverable) {
        const retryCount = (op.retryCount || 0) + 1
        await store.updateOp(op.id, {
          status: retryCount >= 5 ? 'failed' : 'retrying',
          retryCount,
          lastError: result.error,
        })
        if (retryCount >= 5) {
          store.setLastError(`Thao tác ${op.entity}/${op.entityId} đã thất bại sau ${retryCount} lần thử`)
        } else {
          store.setStatus('retrying')
          store.setLastError(result.error || null)
          const backoff = getBackoffMs(retryCount)
          await new Promise(r => setTimeout(r, backoff))
        }
      } else {
        // ADR-016: Permanent parent failure. Do NOT drop dependent child ops — leave
        // them retrying so the user can fix the parent entity and re-sync, instead
        // of silently losing offline-entered grades/attendance.
        await store.updateOp(op.id, { status: 'failed', lastError: result.error })
        await reconcilePermanentlyRejectedStudentOp(op)
        store.setLastError(result.error || null)
      }
    }

    // ADR-016 (S4): Re-fetch ops after Phase 1.5 so Phase 2 reads the remapped
    // payloads (real studentId/classId) from IndexedDB instead of the stale
    // in-memory array captured before CREATEs were processed.
    ops = await store.getPendingOps()

    // ─── Phase 2: Group batchable ops (grade/attendance UPDATEs) ───
    const gradeUpdateOps = ops.filter(o => o.entity === 'grade' && o.operation === 'UPDATE' && !o.serverAcknowledgement)
    const attendanceUpdateOps = ops.filter(o => o.entity === 'attendance' && o.operation === 'UPDATE' && !o.serverAcknowledgement)
    // ADR-016 (offline-sync audit #3): filter theo set các CREATE parent đã xử lý ở
    // Phase 1.5 — trước đây `!createOps.includes(o)` so sánh object identity với
    // array cũ nên op re-fetch từ Dexie (luôn là object mới) lọt qua → CREATE bị
    // xử lý LẦN 2 trong cùng cycle (retryCount double-count + nguy cơ tạo trùng).
    // Ops CREATE fail ở Phase 1.5 giữ nguyên trạng thái retrying/failed của chúng
    // và được retry ở cycle kế tiếp.
    const gradeUpdateIds = new Set(gradeUpdateOps.map(o => o.id))
    const attendanceUpdateIds = new Set(attendanceUpdateOps.map(o => o.id))
    const createOpKeys = new Set(createOps.map(o => `${o.entity}:${o.entityId}:${o.operation}`))
    const individualOps = ops.filter(o =>
      !gradeUpdateIds.has(o.id) &&
      !attendanceUpdateIds.has(o.id) &&
      !createOpKeys.has(`${o.entity}:${o.entityId}:${o.operation}`)
    )

    // ─── Phase 2a: Batch flush grades ───
    if (gradeUpdateOps.length > 0) {
      const validOps: SyncQueueItem[] = []
      const payloads: Record<string, unknown>[] = []
      for (const queuedOp of gradeUpdateOps) {
        const op = await store.claimOp(queuedOp.id)
        if (!op) continue
        try {
          const payload = await parseQueuePayload(op.payload)
          if (payload && Object.keys(payload).length > 0) {
            payloads.push(payload)
            validOps.push(op)
          } else {
            await store.updateOp(op.id, { status: 'failed', lastError: 'Invalid or empty queued grade payload' })
          }
        } catch (error) {
          await store.updateOp(op.id, { status: 'failed', lastError: (error as Error).message || 'Invalid queued grade payload' })
        }
      }
      if (validOps.length > 0 && payloads.length > 0) {
        try {
          await flushGradeBatchWithIsolation(payloads, validOps, store, syncState, flowOwner)
        } catch (error) {
          for (const op of validOps) {
            await store.updateOp(op.id, { status: 'retrying', lastError: (error as Error).message || 'Grade batch sync interrupted' })
          }
          throw error
        }
      }
    }

    // ─── Phase 2b: Batch attendance grouped by date|type ───
    if (attendanceUpdateOps.length > 0) {
      const groups = new Map<string, SyncQueueItem[]>()
      for (const queuedOp of attendanceUpdateOps) {
        const op = await store.claimOp(queuedOp.id)
        if (!op) continue
        let p: any = {}
        try {
          p = await parseQueuePayload(op.payload)
        } catch (error) {
          await store.updateOp(op.id, { status: 'failed', lastError: (error as Error).message || 'Invalid queued attendance payload' })
          continue
        }
        const key = `${p.date}|${p.type}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(op)
      }
      for (const [, batch] of groups) {
        let firstPayload: any = {}
        try { firstPayload = await parseQueuePayload(batch[0].payload) } catch {}
        // ADR-016 (sync-fix): 400 validation → cách ly record lỗi, không retry cả batch.
        try {
          await flushAttendanceBatchWithIsolation(batch, firstPayload, store, syncState, flowOwner)
        } catch (error) {
          for (const op of batch) {
            await store.updateOp(op.id, { status: 'retrying', lastError: (error as Error).message || 'Attendance batch sync interrupted' })
          }
          throw error
        }
      }
    }

    // ─── Phase 3: Process individual ops (student, class, DELETE/non-UPDATE) ───
    if ((gradeUpdateOps.length > 0 || attendanceUpdateOps.length > 0) && individualOps.length > 0) {
      await new Promise(r => setTimeout(r, 500))
    }
    ops = individualOps
    while (ops.length > 0) {
      if (!navigator.onLine) {
        store.setStatus('offline')
        return
      }

      const candidate = ops[0]
      if (candidate.entity === 'notice' && !candidate.serverAcknowledgement) {
        const unsettled = await getOwnUnsettledSyncOperations()
        requireFlowOwner(flowOwner, candidate)
        if (unsettled.some(item => item.id !== candidate.id && item.entity === 'notice'
          && item.entityId === candidate.entityId && item.createdAt <= candidate.createdAt
          && (item.status === 'retrying' || item.status === 'processing' || item.status === 'failed'))) {
          store.setLastError('Thông báo đang chờ xử lý thay đổi trước đó trước khi gửi thay đổi mới.')
          ops = ops.slice(1)
          continue
        }
      }
      if (candidate.entity === 'exam' && candidate.operation === 'UPDATE' && !candidate.serverAcknowledgement) {
        const payload = await parseQueuePayload(candidate.payload, true)
        requireFlowOwner(flowOwner, candidate)
        if (payload.action === 'complete') {
          const sessionId = String(payload.sessionId || candidate.entityId)
          const unsettled = await getOwnUnsettledSyncOperations()
          requireFlowOwner(flowOwner, candidate)
          // Pending, in-flight, failed and unreconciled ACKs all block closure.
          // Ordering alone is insufficient after a predecessor's network error.
          if (unsettled.some(item => item.entity === 'exam_result'
            && item.entityId.startsWith(`${sessionId}::result::`))) {
            store.setLastError('Phiên chấm đang chờ đồng bộ đủ kết quả trước khi hoàn tất.')
            ops = ops.slice(1)
            continue
          }
        }
      }
      if (candidate.entity === 'exam_result' && candidate.operation === 'UPDATE' && !candidate.serverAcknowledgement) {
        const payload = await parseQueuePayload(candidate.payload, true)
        requireFlowOwner(flowOwner, candidate)
        const deletion = payload.deletion && typeof payload.deletion === 'object'
          ? payload.deletion as { afterMutationId?: string }
          : null
        const score = payload.score && typeof payload.score === 'object'
          ? payload.score as { afterMutationId?: string }
          : null
        const predecessorId = payload.action === 'remove_result' ? deletion?.afterMutationId
          : payload.action === 'save_result' ? score?.afterMutationId : undefined
        if (predecessorId) {
          const unsettled = await getOwnUnsettledSyncOperations()
          requireFlowOwner(flowOwner, candidate)
          let predecessorStillQueued = false
          for (const item of unsettled) {
            if (item.id === candidate.id || item.entity !== 'exam_result' || item.entityId !== candidate.entityId) continue
            const prior = await parseQueuePayload(item.payload, true)
            requireFlowOwner(flowOwner, candidate)
            const priorScore = prior.score && typeof prior.score === 'object'
              ? prior.score as { clientMutationId?: string }
              : null
            if (prior.action === 'save_result' && priorScore?.clientMutationId === predecessorId) {
              predecessorStillQueued = true
              break
            }
          }
          if (predecessorStillQueued) {
            store.setLastError('Lệnh kết quả đang chờ thao tác trước đó được máy chủ xác nhận.')
            ops = ops.slice(1)
            continue
          }
        }
      }
      const op = await store.claimOp(ops[0].id)
      if (!op) {
        ops = ops.slice(1)
        continue
      }
      requireFlowOwner(flowOwner, op)
      const result = await processClaimedOperation(op, flowOwner)
      await journalSuccessfulResult(op, result)
      await new Promise(r => setTimeout(r, 200))
      requireFlowOwner(flowOwner, op)

      if (result.ok) {
        if (result.isConflict && result.data) {
          // SYNC-CONFLICT-1: 409 VERSION_CONFLICT (grade/attendance) có bản ghi server
          // → F9 merge field-level + re-queue thay vì server-wins thầm lặng.
          if (await resolveConflictWithMerge(op, result.data, flowOwner)) syncState.mergedConflictCount++
        } else {
          if (op.operation === 'CREATE') {
            if (result.preserveFoldedUpdate) {
              await preserveLegacyCreateEdits(op)
            }
            await acknowledgeCreatedParent(op, result.data, flowOwner)
          } else {
            if (result.data) {
            // ADR-016 (S24): AWAIT remap (audit finding #9) — trước đây fire-and-forget
            // nên student/class CREATE được remap trong cùng cycle này, các op sau
            // trong Phase 3 vẫn đọc queue cũ với temp ID.
              await applyServerResultAsync(op, result.data, flowOwner)
            }
            requireFlowOwner(flowOwner, op)
            await store.removeOp(op.id)
          }
        }
      } else if (result.isAuthError || result.error?.includes('Auth expired') || result.error?.includes('Unauthorized')) {
        await store.updateOp(op.id, { status: 'retrying', lastError: result.error })
        localStorage.removeItem('parish_access_token')
        store.setStatus('idle')
        store.setLastError('Xác thực hết hạn — vui lòng đăng nhập lại')
        import('../router').then(m => m.router.navigate({ to: '/login' })).catch(() => { window.location.href = '/login' })
        return
      } else if (result.recoverable) {
        const retryCount = (op.retryCount || 0) + 1
        await store.updateOp(op.id, {
          status: retryCount >= 5 ? 'failed' : 'retrying',
          retryCount,
          lastError: result.error,
        })

        if (retryCount >= 5) {
          store.setLastError(`Thao tác ${op.entity}/${op.entityId} đã thất bại sau ${retryCount} lần thử`)
          // FE-F1: op chuyển failed vĩnh viễn → revert optimistic complete nếu có
          await revertFailedExamCompleteOp(op)
          await markFailedExamResultOp(op, result.error)
        } else {
          store.setStatus('retrying')
          store.setLastError(result.error || null)
          const backoff = getBackoffMs(retryCount)
          await new Promise(r => setTimeout(r, backoff))
        }
      } else {
        await store.updateOp(op.id, { status: 'failed', lastError: result.error })
        await reconcilePermanentlyRejectedStudentOp(op)
        store.setLastError(result.error || null)
        // FE-F1: permanent fail (4xx — vd 403 học kỳ đã khóa) → revert optimistic
        // complete để UI không tiếp tục hiển thị phiên "đã hoàn tất" sai.
        await revertFailedExamCompleteOp(op)
        await markFailedExamResultOp(op, result.error)
      }

      ops = ops.slice(1)
    }

    const s = useSyncStore.getState()
    const finalCount = await s.refreshCount()
    const db = getDB()
    // OFF-TENANT-1: thông báo lỗi chỉ đếm failed ops đúng scope phiên hiện tại.
    const failedCount = await db.syncQueue.where('status').equals('failed').filter((item) => isOwnOp(item)).count()
    const totalConflicts = syncState.mergedConflictCount
    if (finalCount === 0) {
      const pullScopeKey = captureSyncCursorScope()
      const pullResult = await fetchAllData(true)
      if (pullResult.ok && pullResult.queryTime) {
        await commitPullCursor(pullResult.queryTime, pullScopeKey)
      }
      s.setStatus(navigator.onLine ? 'idle' : 'offline')

      if (totalConflicts > 0) {
        s.setLastError(`${syncState.mergedConflictCount} bản ghi xung đột phiên bản đã được hợp nhất — chỉnh sửa của bạn được giữ lại.`)
      } else if (failedCount > 0) {
        s.setLastError(`Có ${failedCount} thao tác đồng bộ thất bại. Kiểm tra trong System Diagnostics.`)
      } else {
        s.setLastError(null)
      }
    } else {
      const remaining = s.pendingCount
      s.setStatus(remaining > 0 ? 'retrying' : 'idle')
      if (remaining === 0 && failedCount > 0 && totalConflicts === 0) {
        s.setLastError(`Có ${failedCount} thao tác đồng bộ thất bại. Kiểm tra trong System Diagnostics.`)
      }
    }
  } catch (err) {
    if (err instanceof SyncOwnerChangedError || /Sync owner changed|sync owner changed|Tenant owner changed/i.test((err as Error)?.message || '')) {
      return
    }
    const s = useSyncStore.getState()
    if (isNetworkError(err)) {
      s.setStatus('offline')
    } else {
      s.setStatus('idle')
      s.setLastError((err as Error).message || 'Sync failed')
    }
  }
}

export async function verifyClientDataGeneration(requireEvidence = false): Promise<boolean> {
  const owner = captureTenantScope()
    // PURGE v2.3 (ghost data): nếu server đã purge (purge_version > bản local) thì toàn bộ
    // dữ liệu offline của thiết bị này là GHOST DATA → reset sạch + đăng xuất ngay,
    // trước khi pull delta để tránh khôi phục lại dữ liệu đã xóa.
    // A-NEW-47 (2026-08-13): CHỈ wipe khi device ĐÃ TỪNG sync (có sẵn key purge local).
    // Device mới/clean (chưa có key) KHÔNG có dữ liệu offline nào để thành ghost data —
    // wipe + logout ở đây chỉ đá user ra khỏi phiên đăng nhập hợp lệ (evidence: production
    // purge_version=4 từ go-live → mọi device mới bị wipe+logout mỗi lần reload, phải login
    // 2 lần mới thấy dữ liệu). Device mới chỉ GHI version hiện tại làm baseline, không xóa gì.
    // A-NEW-35: resetClientData giờ FAIL-CLOSED (throw nếu Dexie không clear được) —
    // KHÔNG redirect login trong trường hợp đó (phiên mới sẽ pull lại ghost data);
    // báo lỗi qua sync store và chờ retry ở cycle sau.
    try {
      const purgeVersion = await api.probePurgeVersion()
      if (!owner || !isSyncOwnerCurrent(owner)) return false
      const hasLocalPurgeKey = localStorage.getItem(PURGE_VERSION_KEY) !== null
      if (purgeVersion === null) {
        if (requireEvidence) return false
      } else if (!hasLocalPurgeKey) {
        // A truly clean device can adopt the current generation as baseline.
        // A legacy/offline device with an owned queue is not clean: accepting a
        // new baseline would let pre-purge/restore intent replay into the new DB.
        const unsettled = await getOwnUnsettledSyncOperations()
        if (!isSyncOwnerCurrent(owner)) return false
        if (unsettled.length > 0) {
          try {
            await resetClientData(purgeVersion)
          } catch (resetErr) {
            console.error('Client generation reset failed — giữ nguyên phiên, không sync queue:', resetErr)
            useSyncStore.getState().setLastError(
              'Không thể cách ly thay đổi cũ sau khi dữ liệu giáo xứ được thay thế — hãy thử lại trước khi đồng bộ.'
            )
            useSyncStore.getState().setStatus('failed')
            return false
          }
          window.location.href = '/login'
          return false
        }
        try { localStorage.setItem(PURGE_VERSION_KEY, String(purgeVersion)) } catch {}
      } else if (purgeVersion > getLocalPurgeVersion()) {
        try {
          await resetClientData(purgeVersion)
        } catch (resetErr) {
          console.error('Purge reset failed — giữ nguyên phiên, không logout:', resetErr)
          useSyncStore.getState().setLastError(
            'Không thể xóa dữ liệu cục bộ sau purge của giáo xứ — thử lại. Nếu vẫn lỗi, hãy xóa dữ liệu trình duyệt.'
          )
          useSyncStore.getState().setStatus('failed')
          return false
        }
        window.location.href = '/login'
        return false
      }
    } catch {
      if (requireEvidence) return false
    }

  return !!owner && isSyncOwnerCurrent(owner)
}

export async function fetchAllData(incremental?: boolean): Promise<{ queryTime: string; ok: boolean }> {
  try {
    if (!isAuthenticated()) return { queryTime: '', ok: false }

    const persistedCursor = incremental ? await readSyncCursor() : null
    const lastSync = persistedCursor || undefined

    if (!await verifyClientDataGeneration()) return { queryTime: '', ok: false }

    const { serverTime: queryTime } = await api.getSyncWatermark()
    const { useAuthStore } = await import('../stores/authStore')
    const isParent = useAuthStore.getState().user?.role === 'phuhuynh'
    const results = await Promise.allSettled([
      ...(!isParent ? [
        useStudentStore.getState().fetchStudents(lastSync ? { updatedAfter: lastSync, updatedBefore: queryTime, throwOnError: true } : { throwOnError: true }),
        useGradeStore.getState().fetchGrades(lastSync, true),
        useAttendanceStore.getState().fetchAttendance(lastSync, true),
      ] : []),
      useClassStore.getState().fetchClasses(lastSync, queryTime, true),
      useNoticeStore.getState().fetchNotices(lastSync, true),
    ])
    const ok = results.every(r => r.status === 'fulfilled')
    if (!ok) {
      for (const r of results) {
        if (r.status === 'rejected') Sentry.captureException(r.reason)
      }
    }
    return { queryTime, ok }
  } catch (err) {
    Sentry.captureException(err)
    return { queryTime: '', ok: false }
  }
}
