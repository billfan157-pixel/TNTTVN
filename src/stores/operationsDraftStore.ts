import { useCallback, useMemo } from 'react'
import { create } from 'zustand'

/**
 * W0.2 — surviving-draft registry for Operations.
 *
 * `TabPanel` unmounts its inactive children (`SelectionControls.tsx` returns
 * `null`), so every `useState` inside an Operations tab was destroyed by a tab
 * switch. That silently discarded work the user had already typed: mandatory
 * revoke / restore / block reasons, the post-event retrospective body, and the
 * template version/archive/restore reasons. The reason fields are *required* by
 * the server, so losing one turns a completed form back into a dead button
 * with no explanation.
 *
 * This store holds only in-progress text that has no server representation yet.
 * It is deliberately NOT a persistence layer: nothing is written to Dexie or
 * localStorage, so a draft never outlives the tab, the event, or the session.
 * `clear()` is wired into `resetAllStoresToDefault` so a draft can never cross
 * a parish or account boundary.
 */
interface OperationsDraftState {
  /** resourceId -> field -> in-progress text. */
  drafts: Record<string, Record<string, string>>
  set: (resourceId: string, field: string, value: string) => void
  clearField: (resourceId: string, field: string) => void
  clearResource: (resourceId: string) => void
  clear: () => void
}

export const useOperationsDraftStore = create<OperationsDraftState>(set => ({
  drafts: {},
  set: (resourceId, field, value) => set(state => {
    const current = state.drafts[resourceId] ?? {}
    if (current[field] === value) return state
    return { drafts: { ...state.drafts, [resourceId]: { ...current, [field]: value } } }
  }),
  clearField: (resourceId, field) => set(state => {
    const current = state.drafts[resourceId]
    if (!current || current[field] === undefined) return state
    const next = { ...current }
    delete next[field]
    const drafts = { ...state.drafts }
    if (Object.keys(next).length === 0) delete drafts[resourceId]
    else drafts[resourceId] = next
    return { drafts }
  }),
  clearResource: resourceId => set(state => {
    if (!state.drafts[resourceId]) return state
    const drafts = { ...state.drafts }
    delete drafts[resourceId]
    return { drafts }
  }),
  clear: () => set({ drafts: {} }),
}))

/**
 * Bind one surviving draft field. Returns a stable tuple so the value can drive
 * a controlled input while the setter stays safe to pass straight to onChange.
 *
 * An empty string clears the field, so a form that resets itself to blank after
 * a successful submit does not leave a stale draft behind for the next visit.
 */
export function useOperationsDraft(resourceId: string | null, field: string) {
  const value = useOperationsDraftStore(state => (resourceId ? state.drafts[resourceId]?.[field] ?? '' : ''))
  const set = useOperationsDraftStore(state => state.set)
  const clearField = useOperationsDraftStore(state => state.clearField)
  const onChange = useCallback((next: string) => {
    if (!resourceId) return
    if (next) set(resourceId, field, next)
    else clearField(resourceId, field)
  }, [resourceId, field, set, clearField])
  const reset = useCallback(() => {
    if (resourceId) clearField(resourceId, field)
  }, [resourceId, field, clearField])
  return [value, onChange, reset] as const
}

/**
 * Read a whole family of drafts at once (e.g. one revoke reason per workstream
 * member) without calling the hook inside a `.map()`. The selector returns the
 * resource's bucket object, whose identity only changes when that resource is
 * actually edited, so the derived map is stable across unrelated renders.
 */
export function useOperationsDraftMap(resourceId: string | null, prefix: string) {
  const bucket = useOperationsDraftStore(state => (resourceId ? state.drafts[resourceId] : undefined))
  return useMemo(() => {
    const out: Record<string, string> = {}
    if (!bucket) return out
    for (const [field, value] of Object.entries(bucket)) {
      if (field.startsWith(prefix)) out[field.slice(prefix.length)] = value
    }
    return out
  }, [bucket, prefix])
}
