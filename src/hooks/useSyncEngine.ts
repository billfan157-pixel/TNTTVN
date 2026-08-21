import { useEffect, useRef } from 'react'
import { useSyncStore, migrateLegacyQueueUserIds, isOwnOp } from '../stores/syncStore'
import { api, isAuthenticated, ApiError } from '../lib/api'
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
import { decryptQueueValue, encryptQueueValue } from '../lib/offlineCipher'
import { acquireSyncLease, releaseSyncLease } from '../lib/syncLease'
import type { SyncQueueItem } from '../lib/db'
import * as Sentry from '@sentry/react'

const SYNC_INTERVAL_MS = 30000
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
async function parseQueuePayload(raw: unknown): Promise<Record<string, unknown>> {
  if (typeof raw !== 'string') return {}
  const plain = await decryptQueueValue(raw)
  if (plain === null) return {}
  try {
    return JSON.parse(plain) as Record<string, unknown>
  } catch {
    return {}
  }
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
        // Không có pending ops — fetch full data ngay
        const pullResult = await fetchAllData()
        if (pullResult.ok && pullResult.queryTime) {
          useSyncStore.getState().setLastSync(pullResult.queryTime)
        }
      }

      // FE-03 (2026-08-16): Self-heal chống "dashboard trống vô hạn". Nếu sau đợt
      // sync đầu tiên local vẫn KHÔNG có học sinh nào (vd queue kẹt op legacy từ
      // build cũ — op bị re-push mỗi cycle nhưng không bao giờ drain → runSyncFlow
      // không bao giờ chạy tới fetchAllData) thì force full pull. An toàn: store
      // RỖNG ⇒ không có chỉnh sửa local nào để bị ghi đè.
      const studentCount = useStudentStore.getState().students.length
      if (studentCount === 0 && navigator.onLine) {
        const healResult = await fetchAllData(true)
        if (healResult.ok && healResult.queryTime) {
          useSyncStore.getState().setLastSync(healResult.queryTime)
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

export async function runSyncFlow() {
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

  if (!acquireSyncLease()) return

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

    const syncState = { mergedConflictCount: 0, serverWinsConflictCount: 0 }

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
          if (result.isConflict) {
            syncState.serverWinsConflictCount++
            await store.addConflict({
              entity: op.entity,
              entityId: op.entityId,
              operation: op.operation,
              localValue: op.payload,
              serverValue: await encryptQueueValue(JSON.stringify(result.data)),
            })
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

    // ─── Process grade batch (no per-item delay) ───
    if (gradeUpdateOps.length > 0) {
      const payloads: Record<string, unknown>[] = []
      const validOps: typeof gradeUpdateOps = []
      for (const op of gradeUpdateOps) {
        try {
          const parsed = await parseQueuePayload(op.payload)
          if (parsed && typeof parsed.studentId === 'string' && parsed.studentId.trim() !== '') {
            payloads.push(parsed)
            validOps.push(op)
          } else {
            await store.removeOp(op.id)
          }
        } catch {
          await store.removeOp(op.id)
        }
      }
      if (payloads.length > 0) {
        // ADR-016 (sync-fix): 400 validation → cách ly record lỗi, không retry cả batch.
        await flushGradeBatchWithIsolation(payloads, validOps, store, syncState)
      }
    }

    // ─── Process attendance batches (grouped by date|type, no per-item delay) ───
    if (gradeUpdateOps.length > 0 && attendanceUpdateOps.length > 0) {
      await new Promise(r => setTimeout(r, 500))
    }
    if (attendanceUpdateOps.length > 0) {
      const groups = new Map<string, typeof attendanceUpdateOps>()
      for (const op of attendanceUpdateOps) {
        try {
          const p = await parseQueuePayload(op.payload)
          const key = `${p.date}|${p.type}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(op)
        } catch {}
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
        await store.removeOp(op.id)
        if (result.data) {
          // ADR-016 (S24): AWAIT remap (audit finding #9) — trước đây fire-and-forget
          // nên student/class CREATE được remap trong cùng cycle này, các op sau
          // trong Phase 3 vẫn đọc queue cũ với temp ID.
          await applyServerResultAsync(op, result.data)
          if (result.isConflict) {
            syncState.serverWinsConflictCount++
            await store.addConflict({
              entity: op.entity,
              entityId: op.entityId,
              operation: op.operation,
              localValue: op.payload,
              serverValue: await encryptQueueValue(JSON.stringify(result.data)),
            })
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
      }

      ops = (await store.getPendingOps()).filter(o => o.entity !== 'grade' && o.entity !== 'attendance')
    }

    const s = useSyncStore.getState()
    const finalCount = await s.refreshCount()
    const db = getDB()
    const failedCount = await db.syncQueue.where('status').equals('failed').count()
    const totalConflicts = syncState.mergedConflictCount + syncState.serverWinsConflictCount
    if (finalCount === 0) {
      const pullResult = await fetchAllData(true)
      if (pullResult.ok && pullResult.queryTime) {
        s.setLastSync(pullResult.queryTime)
      }
      s.setStatus(navigator.onLine ? 'idle' : 'offline')

      if (totalConflicts > 0) {
        if (syncState.mergedConflictCount > 0 && syncState.serverWinsConflictCount > 0) {
          s.setLastError(`${syncState.mergedConflictCount} bản ghi điểm/điểm danh xung đột đã được hợp nhất, và ${syncState.serverWinsConflictCount} bản ghi khác được đồng bộ theo máy chủ.`)
        } else if (syncState.mergedConflictCount > 0) {
          s.setLastError(`${syncState.mergedConflictCount} bản ghi xung đột phiên bản đã được hợp nhất — chỉnh sửa của bạn được giữ lại.`)
        } else {
          s.setLastError(`${syncState.serverWinsConflictCount} bản ghi bị xung đột đã được đồng bộ theo dữ liệu mới nhất từ máy chủ.`)
        }
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
  } finally {
    releaseSyncLease()
  }
}

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
async function resolveConflictWithMerge(op: SyncQueueItem, serverRecord: any): Promise<void> {
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
async function applyServerResultAsync(op: SyncQueueItem, serverData: any) {
  const entity = (op.entity || '').toLowerCase()

  try {
    if (entity === 'student' && serverData?.id && serverData.id !== op.entityId) {
      const studentStore = useStudentStore.getState()
      const localStudent = studentStore.students.find(s => s.id === op.entityId)
      if (localStudent) {
        const oldId = op.entityId!
        const newId = serverData.id
        studentStore.replaceStudentId(oldId, serverData)
        // ADR-016 (S4): AWAIT remap so Phase 2 sees the real studentId.
        await remapStudentIdInPendingOps(oldId, newId)
      }
    }

    if (entity === 'class' && serverData?.id && serverData.id !== op.entityId) {
      const classStore = useClassStore.getState()
      if (classStore.classes.some(c => c.id === op.entityId)) {
        const oldClassId = op.entityId!
        const newClassId = serverData.id
        classStore.replaceClassId(oldClassId, serverData)
        // ADR-016 (S4): AWAIT remap so Phase 2 sees the real classId.
        await remapClassIdInPendingOps(oldClassId, newClassId)
      }
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

    if (entity === 'grade' && serverData?.id) {
      const gradeStore = useGradeStore.getState()
      gradeStore.upsertGrade(serverData, true)
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
      attStore.saveAttendance(
        serverData.studentId,
        serverData.date,
        serverData.type,
        serverData.status,
        serverData.note,
        true,
        serverData,
      )
    }
  } catch (err) {
    Sentry.captureException(err)
  }
}

/** Sau khi notice create trả về server ID, remap trong tất cả pending ops đang dùng temp ID */
async function remapNoticeIdInPendingOps(oldId: string, newId: string) {
  const db = getDB()
  const pending = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'retrying'])
    .toArray()
  for (const item of pending) {
    try {
      const payload = await parseQueuePayload(item.payload)
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
    } catch {
      // skip unparseable
    }
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
  state: { mergedConflictCount: number; serverWinsConflictCount: number }
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
  state: { mergedConflictCount: number; serverWinsConflictCount: number }
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
  state: { mergedConflictCount: number; serverWinsConflictCount: number }
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

/** Sau khi class create trả về server ID, remap classId trong tất cả pending ops đang dùng temp ID */
async function remapClassIdInPendingOps(oldId: string, newId: string) {
  const db = getDB()
  const raw = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'retrying'])
    .toArray()
  const pending = raw.filter(isOwnOp)
  for (const item of pending) {
    try {
      const payload = await parseQueuePayload(item.payload)
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
    } catch {
      // skip items with unparseable payload
    }
  }
}

/** Sau khi student create trả về server ID, remap trong tất cả pending ops đang dùng temp ID */
async function remapStudentIdInPendingOps(oldId: string, newId: string) {
  const db = getDB()
  const raw = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'retrying'])
    .toArray()
  const pending = raw.filter(isOwnOp)
  for (const item of pending) {
    try {
      const payload = await parseQueuePayload(item.payload)
      if (!payload) continue
      const updates: { payload?: string; entityId?: string; updatedAt?: string } = {}
      // ADR-016 (S23): Op UPDATE của chính student đó (entityId = temp ID)
      // phải được remap entityId, không chỉ studentId trong payload của các op khác.
      if (item.entityId === oldId) {
        updates.entityId = newId
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
      if (updates.entityId || updates.payload) {
        updates.updatedAt = new Date().toISOString()
        await db.syncQueue.update(item.id, updates)
      }
    } catch {
      // skip items with unparseable payload
    }
  }
}

/** Sau khi exam session create trả về server ID, remap sessionId trong tất cả pending ops đang dùng temp ID */
async function remapExamSessionIdInPendingOps(oldId: string, newId: string) {
  const db = getDB()
  const raw = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'retrying'])
    .toArray()
  const pending = raw.filter(isOwnOp)
  for (const item of pending) {
    try {
      const payload = await parseQueuePayload(item.payload)
      if (!payload) continue
      const updates: { payload?: string; entityId?: string; updatedAt?: string } = {}
      if (item.entityId === oldId) {
        updates.entityId = newId
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
    } catch {
      // skip items with unparseable payload
    }
  }
}

async function fetchAllData(incremental?: boolean): Promise<{ queryTime: string; ok: boolean }> {
  try {
    if (!isAuthenticated()) return { queryTime: '', ok: false }

    const syncStore = useSyncStore.getState()
    const queryTime = new Date().toISOString()
    const lastSync = incremental && syncStore.lastSyncAt ? syncStore.lastSyncAt : undefined

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

    const results = await Promise.allSettled([
      useStudentStore.getState().fetchStudents(lastSync ? { updatedAfter: lastSync } : undefined),
      useGradeStore.getState().fetchGrades(lastSync),
      useAttendanceStore.getState().fetchAttendance(lastSync),
      useClassStore.getState().fetchClasses(lastSync),
      useNoticeStore.getState().fetchNotices(),
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
