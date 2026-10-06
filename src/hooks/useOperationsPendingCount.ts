import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'

/**
 * W2.10: count of operations responses this user still owes
 * (unacknowledged assignments + open dispatch invitations), for the mobile
 * bottom-nav "Công Việc" badge.
 *
 * Design constraints:
 * - operationsStore must NOT be statically imported here — RootLayout mounts
 *   it on every authenticated screen, and the store belongs to the lazy
 *   Operations chunk. The dynamic import reuses that chunk instead.
 * - Only counts server-sourced snapshots (offline/cache must never badge).
 * - When the user has not opened /operations this session, one read-only
 *   fetch is triggered so the badge reflects reality (GETs only — no
 *   mutation, ADR-110 online-first unchanged).
 */
export function useOperationsPendingCount(enabled: boolean): number {
  const [count, setCount] = useState(0)
  const authReady = useAuthStore(state => state.authReady)
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const canFetch = enabled && authReady && isAuthenticated
  useEffect(() => {
    // RootLayout runs hooks even while displaying its bootstrap loading screen.
    // Do not write a server snapshot before the session evidence is established.
    if (!canFetch) { setCount(0); return }
    let active = true
    let unsubscribe: (() => void) | undefined
    void import('../stores/operationsStore').then(({ useOperationsStore }) => {
      if (!active) return
      const compute = () => {
        const state = useOperationsStore.getState()
        if (state.source !== 'server') return 0
        const pendingAcknowledgements = state.tasks.filter(task =>
          task.status !== 'DONE' && task.status !== 'CANCELLED' && task.myAssignments?.some(assignment => assignment.acknowledgementStatus === 'PENDING'),
        ).length
        return pendingAcknowledgements + state.dispatchInvitations.length
      }
      setCount(compute())
      unsubscribe = useOperationsStore.subscribe(() => { if (active) setCount(compute()) })
      const snapshot = useOperationsStore.getState()
      if (snapshot.source === 'none' && !snapshot.loading) void snapshot.fetch().catch(() => undefined)
    }).catch(() => undefined)
    return () => { active = false; unsubscribe?.() }
  }, [canFetch])
  return count
}
