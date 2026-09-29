import { useOnlineStatus } from './useOnlineStatus'
import { useOperationsStore } from '../stores/operationsStore'

type OperationsDataSource = 'server' | 'cache' | 'none'

/**
 * W1.4 — the single definition of "this surface may issue a write".
 *
 * This is a TRANSPORT predicate, never an authority map: it says the client has
 * a fresh server snapshot and a live connection. Authority arrives separately,
 * as a capability from `GET /permissions` or from a resource's own
 * `detail.permissions`, and a command needs BOTH (ADR-110: stale/cache state can
 * never authorize a mutation).
 *
 * It lived inline in seven components, which is how a panel ended up reporting
 * "no templates in your scope" purely because the device was offline.
 *
 * It deliberately lives here rather than in `operationsStore`: a pure predicate
 * has no business inside the module that tests mock wholesale, and keeping it
 * out means the rule can be imported without dragging the store along.
 */
export function canMutateOperations(source: OperationsDataSource, isOnline: boolean): boolean {
  return isOnline && source === 'server'
}

/** `canMutateOperations` bound to the live store slice and connectivity. */
export function useCanMutateOperations(): boolean {
  const source = useOperationsStore(s => s.source)
  const isOnline = useOnlineStatus()
  return canMutateOperations(source, isOnline)
}
