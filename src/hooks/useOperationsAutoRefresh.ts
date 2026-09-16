import { useEffect } from 'react'

/**
 * W4.1 (SYNC-01, decision 2026-09-15): read-only freshness poll for the
 * Operations surface. Runs `tick` every `intervalMs` ONLY while (a) `active`
 * (the caller wires this to online + server-source state per ADR-110 — never
 * poll from a cache snapshot, never while offline) and (b) the document is
 * actually visible, so a backgrounded phone tab costs zero requests.
 * The tick itself is caller-supplied so the store's own overlap guard
 * (`loading`) and error handling stay in one place.
 */
export const OPERATIONS_POLL_INTERVAL_MS = 90_000

export function useOperationsAutoRefresh(tick: () => void, { active, intervalMs = OPERATIONS_POLL_INTERVAL_MS }: { active: boolean; intervalMs?: number }) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') tick()
    }, intervalMs)
    return () => clearInterval(id)
    // tick is intentionally not a dependency: callers pass a stable store
    // action (zustand actions never change identity) or a page callback that
    // re-creates per render; depending on it would reset the interval on every
    // keystroke and defeat the poll. `active`/`intervalMs` gate the lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, intervalMs])
}
