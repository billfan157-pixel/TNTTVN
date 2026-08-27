import { useDeferredValue } from 'react'
import { useFilterStore } from '../stores/filterStore'

/**
 * Phase 0 — Calm 2026: deferred search for data-dense tables.
 * Input remains urgent (60fps), list filtering is deferred (transition).
 * Use `deferredSearchQuery` for `students.filter(...)` and keep
 * raw `searchQuery` for the `<input value>` to stay responsive.
 */
export function useDeferredSearch(): { searchQuery: string; deferredSearchQuery: string } {
  const searchQuery = useFilterStore((s) => s.searchQuery)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  return { searchQuery, deferredSearchQuery }
}
