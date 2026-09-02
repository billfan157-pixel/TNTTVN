import { useEffect, useRef } from 'react'
import { useSyncStore, migrateLegacyQueueUserIds } from '../stores/syncStore'
import { api, isAuthenticated } from '../lib/api'
import { getDB } from '../lib/db'
import { resetClientData, getLocalPurgeVersion, PURGE_VERSION_KEY } from '../lib/resetClientData'
import { useAuthStore } from '../stores/authStore'
import { processOperation, getBackoffMs, isNetworkError } from '../lib/syncProcessor'
import { useStudentStore } from '../stores/studentStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useNoticeStore } from '../stores/noticeStore'
import { useClassStore } from '../stores/classStore'
import { useExamStore } from '../stores/examStore'
import { decryptQueueValue } from '../lib/offlineCipher'
import { runWithSyncLease } from '../lib/syncLease'
import type { SyncQueueItem } from '../lib/db'
import { getTenantScope } from '../lib/tenantScope'
import { readSyncCursor, writeSyncCursor } from '../lib/syncCursor'
import { tripContinuousScanCircuit } from '../lib/examContinuousRollout'
import * as Sentry from '@sentry/react'
import {
  pruneStaleQueueItems,
  promoteTransientFailedOps,
  parseQueuePayload,
} from '../lib/syncQueueMaintenance'
import {
  applyServerResultAsync,
  resolveConflictWithMerge,
  flushGradeBatchWithIsolation,
  flushAttendanceBatchWithIsolation,
} from '../lib/syncApply'

/**
 * REFACTOR-SYNC-1 (2026-08-24): god-file 1029 dòng tách thành 3 module theo vai trò:
 * - `lib/syncQueueMaintenance.ts` — bảo trì queue thuần (prune/promote/remap temp-ID)
 * - `lib/syncApply.ts` — tầng APPLY (F9 merge, áp kết quả server, batch isolation)
 * - file này — orchestrator: hook lifecycle + runSyncFlow + pull (fetchAllData)
 * Public API giữ nguyên qua re-export — không caller/test nào phải đổi import.
 */
export { pruneStaleQueueItems, promoteTransientFailedOps } from '../lib/syncQueueMaintenance'
export { extractZodBadIndexes, flushGradeBatchWithIsolation, flushAttendanceBatchWithIsolation } from '../lib/syncApply'

const SYNC_INTERVAL_MS = 30000

async function commitPullCursor(serverTime: string): Promise<void> {
  await writeSyncCursor(serverTime)
  useSyncStore.getState().setLastSync(serverTime)
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

export function useSyncEngine() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isAuthed = useAuthStore(s => s.isAuthenticated)

  useEffect(() => {
    // A-NEW-47 (2026-08-13): sync engine chạy lại khi trạng thái đăng nhập thay
    // đổi. Trước đây deps [] — mount trên /login (chưa đăng nhập) → isAuthenticated
    // false → bỏ qua fetch; sau login SPA navigate không remount → engine KHÔNG
    // bao giờ chạy lại → dashboard trống "0 thiếu nhi" dù server có đủ dữ liệu
    // (evidence: Playwright iPhone 13 — chỉ 1 API call POST /login, không có
    // /api/students; reload lại mới fetch được). Giờ: chưa đăng nhập → early return;
    // login → effect chạy lại → khởi động sync flow đầy đủ.
    if (!isAuthed) return

    const sync = useSyncStore.getState()
    sync.refreshCount()

    // 1. Online / Offline listeners
    const handleOnline = () => {
      sync.setStatus('idle')
      runSyncFlow()
    }
    const handleOffline = () => {
      sync.setStatus('offline')
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // 2. On mount: push pending queue first, then pull fresh data
    queueMicrotask(async () => {
      const state = useSyncStore.getState()
      const count = await state.refreshCount()
      if (count > 0) {
        // Có pending ops — push lên server trước, rồi runSyncFlow sẽ fetch incremental
        await runSyncFlow()
      } else {
        // Không có pending ops — dùng delta bền nếu đã có cursor, nếu chưa thì bootstrap full.
        // Reuse the durable tenant/user cursor after reload. When no cursor exists,
        // fetchAllData automatically performs a full bootstrap pull.
        const pullResult = await fetchAllData(true)
        if (pullResult.ok && pullResult.queryTime) {
          await commitPullCursor(pullResult.queryTime)
        }
      }

      // FE-03 (2026-08-16): Self-heal chống "dashboard trống vô hạn". Nếu sau đợt
      // sync đầu tiên local vẫn KHÔNG có học sinh nào (vd queue kẹt op legacy từ
      // build cũ — op bị re-push mỗi cycle nhưng không bao giờ drain → runSyncFlow
      // không bao giờ chạy tới fetchAllData) thì force full pull. An toàn: store
      // RỖNG ⇒ không có chỉnh sửa local nào để bị ghi đè.
      const studentCount = useStudentStore.getState().students.length
      if (studentCount === 0 && navigator.onLine) {
        // An empty local roster with a durable cursor is not a valid delta base.
        // Force a full pull so a partially-cleared IndexedDB cannot stay empty.
        const healResult = await fetchAllData(false)
        if (healResult.ok && healResult.queryTime) {
          await commitPullCursor(healResult.queryTime)
        }
      }
    })

    // 3. Delayed sync on mount (fallback — sẽ bị guard 'syncing' nếu đang chạy)
    const mountTimeout = setTimeout(runSyncFlow, 3000)

    // 4. Periodic sync interval
    intervalRef.current = setInterval(() => {
      if (navigator.onLine) {
        runSyncFlow()
      }
    }, SYNC_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearTimeout(mountTimeout)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isAuthed])
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

  store.setStatus('syncing')
  store.setLastError(null)

  try {
    // OS-02: Migration 1 lần cho legacy queue items của user hiện tại
    await migrateLegacyQueueUserIds()
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
    for (const op of createOps) {
      if (!navigator.onLine) {
        store.setStatus('offline')
        return
      }
      const result = await processOperation(op)
      await new Promise(r => setTimeout(r, 200))

      if (result.ok) {
        await store.removeOp(op.id)
        if (result.data) {
          // ADR-016 (S4): Await applyServerResult so that ID remap
          // (remapStudentIdInPendingOps / remapClassIdInPendingOps) completes
          // BEFORE Phase 2 reads the queue. Previously this was fire-and-forget,
          // causing grade batches to send stale temp IDs → 404 → data loss.
          await applyServerResultAsync(op, result.data)
        }
        // SYNC-CONFLICT-1: CREATE student/class/exam không còn nhánh isConflict —
        // business 409 (vd CLASS_CODE_EXISTS) giờ là permanent-fail (xử lý ở
        // nhánh else bên dưới), op giữ payload để user xử lý tường minh.
      } else if (result.isAuthError || result.error?.includes('Auth expired') || result.error?.includes('Unauthorized')) {
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
        store.setLastError(result.error || null)
      }
    }

    // ADR-016 (S4): Re-fetch ops after Phase 1.5 so Phase 2 reads the remapped
    // payloads (real studentId/classId) from IndexedDB instead of the stale
    // in-memory array captured before CREATEs were processed.
    ops = await store.getPendingOps()

    // ─── Phase 2: Group batchable ops (grade/attendance UPDATEs) ───
    const gradeUpdateOps = ops.filter(o => o.entity === 'grade' && o.operation === 'UPDATE')
    const attendanceUpdateOps = ops.filter(o => o.entity === 'attendance' && o.operation === 'UPDATE')
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
      for (const op of gradeUpdateOps) {
        try {
          const payload = await parseQueuePayload(op.payload)
          if (payload && Object.keys(payload).length > 0) {
            payloads.push(payload)
            validOps.push(op)
          }
        } catch {}
      }
      if (validOps.length > 0 && payloads.length > 0) {
        await flushGradeBatchWithIsolation(payloads, validOps, store, syncState)
      }
    }

    // ─── Phase 2b: Batch attendance grouped by date|type ───
    if (attendanceUpdateOps.length > 0) {
      const groups = new Map<string, SyncQueueItem[]>()
      for (const op of attendanceUpdateOps) {
        let p: any = {}
        try { p = await parseQueuePayload(op.payload) } catch {}
        const key = `${p.date}|${p.type}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(op)
      }
      for (const [, batch] of groups) {
        let firstPayload: any = {}
        try { firstPayload = await parseQueuePayload(batch[0].payload) } catch {}
        // ADR-016 (sync-fix): 400 validation → cách ly record lỗi, không retry cả batch.
        await flushAttendanceBatchWithIsolation(batch, firstPayload, store, syncState)
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

      const op = ops[0]
      const result = await processOperation(op)
      await new Promise(r => setTimeout(r, 200))

      if (result.ok) {
        if (result.isConflict && result.data) {
          // SYNC-CONFLICT-1: 409 VERSION_CONFLICT (grade/attendance) có bản ghi server
          // → F9 merge field-level + re-queue thay vì server-wins thầm lặng.
          syncState.mergedConflictCount++
          await resolveConflictWithMerge(op, result.data)
        } else {
          await store.removeOp(op.id)
          if (result.data) {
            // ADR-016 (S24): AWAIT remap (audit finding #9) — trước đây fire-and-forget
            // nên student/class CREATE được remap trong cùng cycle này, các op sau
            // trong Phase 3 vẫn đọc queue cũ với temp ID.
            await applyServerResultAsync(op, result.data)
          }
        }
      } else if (result.isAuthError || result.error?.includes('Auth expired') || result.error?.includes('Unauthorized')) {
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
        store.setLastError(result.error || null)
        // FE-F1: permanent fail (4xx — vd 403 học kỳ đã khóa) → revert optimistic
        // complete để UI không tiếp tục hiển thị phiên "đã hoàn tất" sai.
        await revertFailedExamCompleteOp(op)
        await markFailedExamResultOp(op, result.error)
      }

      ops = (await store.getPendingOps()).filter(o => o.entity !== 'grade' && o.entity !== 'attendance')
    }

    const s = useSyncStore.getState()
    const finalCount = await s.refreshCount()
    const db = getDB()
    const failedCount = await db.syncQueue.where('status').equals('failed').count()
    const totalConflicts = syncState.mergedConflictCount
    if (finalCount === 0) {
      const pullResult = await fetchAllData(true)
      if (pullResult.ok && pullResult.queryTime) {
        await commitPullCursor(pullResult.queryTime)
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
    const s = useSyncStore.getState()
    if (isNetworkError(err)) {
      s.setStatus('offline')
    } else {
      s.setStatus('idle')
      s.setLastError((err as Error).message || 'Sync failed')
    }
  }
}

async function fetchAllData(incremental?: boolean): Promise<{ queryTime: string; ok: boolean }> {
  try {
    if (!isAuthenticated()) return { queryTime: '', ok: false }

    const syncStore = useSyncStore.getState()
    const persistedCursor = incremental ? await readSyncCursor() : null
    const lastSync = incremental ? (syncStore.lastSyncAt || persistedCursor || undefined) : undefined

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
      const hasLocalPurgeKey = localStorage.getItem(PURGE_VERSION_KEY) !== null
      if (purgeVersion === null) {
        // probe fail → giữ hành vi cũ: bỏ qua check, pull delta bình thường
      } else if (!hasLocalPurgeKey) {
        // Device chưa từng sync: ghi baseline, không wipe, không logout.
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
          return { queryTime: '', ok: false }
        }
        window.location.href = '/login'
        return { queryTime: '', ok: false }
      }
    } catch {
      // Mạng lỗi / server không phản hồi → bỏ qua check, pull delta vẫn chạy bình thường.
    }

    const { serverTime: queryTime } = await api.getSyncWatermark()
    const results = await Promise.allSettled([
      useStudentStore.getState().fetchStudents(lastSync ? { updatedAfter: lastSync, updatedBefore: queryTime, throwOnError: true } : { throwOnError: true }),
      useGradeStore.getState().fetchGrades(lastSync, true),
      useAttendanceStore.getState().fetchAttendance(lastSync, true),
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
