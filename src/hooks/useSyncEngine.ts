import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useSyncStore } from '../stores/syncStore'
import { registerSyncRunner } from '../lib/syncTrigger'
import { runInitialSync, runSyncFlow } from '../lib/syncCoordinator'

const SYNC_INTERVAL_MS = 30000

/** React owns browser lifecycle only; sync orchestration lives in syncCoordinator. */
export function useSyncEngine() {
  const isAuthed = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => registerSyncRunner(runSyncFlow), [])

  useEffect(() => {
    if (!isAuthed) return

    const sync = useSyncStore.getState()
    let active = true
    let starting = true
    let onlineDuringStart = false
    let interval: ReturnType<typeof setInterval> | undefined
    const handleOnline = () => {
      sync.setStatus('idle')
      if (starting) onlineDuringStart = true
      else void runSyncFlow()
    }
    const handleOffline = () => sync.setStatus('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    queueMicrotask(() => {
      // StrictMode tears down the first effect before its microtask executes.
      // Do not launch an orphan initial pull from that discarded mount.
      if (!active) return
      void runInitialSync()
        .catch((error) => {
          if (active) sync.setLastError(error instanceof Error ? error.message : 'Không thể khởi động đồng bộ')
        })
        .finally(() => {
          if (!active) return
          starting = false
          if (onlineDuringStart && navigator.onLine) void runSyncFlow()
          interval = setInterval(() => {
            if (navigator.onLine) void runSyncFlow()
          }, SYNC_INTERVAL_MS)
        })
    })

    return () => {
      active = false
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (interval) clearInterval(interval)
    }
  }, [isAuthed])
}
