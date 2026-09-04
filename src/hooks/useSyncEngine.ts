import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useSyncStore } from '../stores/syncStore'
import { registerSyncRunner } from '../lib/syncTrigger'
import { runInitialSync, runSyncFlow } from '../lib/syncCoordinator'

const SYNC_INTERVAL_MS = 30000

/** React owns browser lifecycle only; sync orchestration lives in syncCoordinator. */
export function useSyncEngine() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isAuthed = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => registerSyncRunner(runSyncFlow), [])

  useEffect(() => {
    if (!isAuthed) return

    const sync = useSyncStore.getState()
    sync.refreshCount()
    const handleOnline = () => {
      sync.setStatus('idle')
      runSyncFlow()
    }
    const handleOffline = () => sync.setStatus('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    queueMicrotask(() => {
      runInitialSync().catch((error) => {
        sync.setLastError(error instanceof Error ? error.message : 'Không thể khởi động đồng bộ')
      })
    })

    const mountTimeout = setTimeout(runSyncFlow, 3000)
    intervalRef.current = setInterval(() => {
      if (navigator.onLine) runSyncFlow()
    }, SYNC_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearTimeout(mountTimeout)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isAuthed])
}
