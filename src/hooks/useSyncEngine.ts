import { useEffect, useRef } from 'react'
import { useSyncStore } from '../stores/syncStore'
import { api } from '../lib/api'
import { getDB } from '../lib/db'
import { processOperation, getBackoffMs, isNetworkError } from '../lib/syncProcessor'
import { useStudentStore } from '../stores/studentStore'
import { useGradeStore } from '../stores/gradeStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useNoticeStore } from '../stores/noticeStore'
import * as Sentry from '@sentry/react'

const SYNC_INTERVAL_MS = 30000

export function useSyncEngine() {
  const initialized = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

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

    // 2. Immediate sync on mount
    runSyncFlow()

    // 3. Periodic sync interval
    intervalRef.current = setInterval(() => {
      if (navigator.onLine) {
        runSyncFlow()
      }
    }, SYNC_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])
}

export async function runSyncFlow() {
  const store = useSyncStore.getState()
  if (store.status === 'syncing') return

  if (!navigator.onLine) {
    store.setStatus('offline')
    return
  }

  const token = localStorage.getItem('parish_access_token')
  if (!token) {
    store.setStatus('idle')
    return
  }

  store.setStatus('syncing')
  store.setLastError(null)

  try {
  // Phase 1: Flush pending queue operations
    let ops = await store.getPendingOps()

    // Failsafe: nếu tất cả ops đều thất bại quá 5 lần, dừng sync
    const allTooManyRetries = ops.length > 0 && ops.every(o => (o.retryCount || 0) >= 5)
    if (allTooManyRetries) {
      store.setStatus('idle')
      store.setLastError('Sync stalled — tất cả thao tác đã thử lại quá nhiều lần')
      return
    }

    while (ops.length > 0) {
      if (!navigator.onLine) {
        store.setStatus('offline')
        return
      }

      const op = ops[0]
      const result = await processOperation(op)

      if (result.ok) {
        await store.removeOp(op.id)
      } else if (result.isAuthError || result.error?.includes('Auth expired') || result.error?.includes('Unauthorized')) {
        store.setStatus('idle')
        store.setLastError('Xác thực hết hạn — vui lòng đăng nhập lại')
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
        await store.updateOp(op.id, { status: 'failed', lastError: result.error })
        store.setLastError(result.error || null)
      }

      ops = await store.getPendingOps()
    }

    const s = useSyncStore.getState()
    if (s.pendingCount === 0) {
      s.setLastSync(new Date().toISOString())
      s.setStatus(navigator.onLine ? 'idle' : 'offline')
      s.setLastError(null)

      // Fetch fresh data from server after queue flush
      await fetchAllData()
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

async function fetchAllData() {
  try {
    const token = localStorage.getItem('parish_access_token')
    if (!token) return

    await Promise.allSettled([
      useStudentStore.getState().fetchStudents(),
      useGradeStore.getState().fetchGrades(),
      useAttendanceStore.getState().fetchAttendance(),
      useNoticeStore.getState().fetchNotices(),
    ])
  } catch (err) {
    Sentry.captureException(err)
  }
}
