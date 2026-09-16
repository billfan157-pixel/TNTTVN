import { useEffect, useRef } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useOperationsStore } from '../stores/operationsStore'

export type OperationsEventModalTab = 'tasks' | 'workstreams' | 'participants' | 'reminders' | 'templates' | 'retrospective'

interface OperationsSearch {
  event?: string
  tab?: OperationsEventModalTab
}

/**
 * W2.2: two-way sync between `/operations?event=&tab=` and the event detail
 * modal, so deep links, F5 and browser history behave.
 *
 * URL → UI reacts only to CHANGES of the `event` parameter (typed URL,
 * deep link, back/forward) — never to a query that merely lags behind a
 * selection this component just made, so a row click can never be clobbered
 * by the previous URL id re-opening mid-navigation.
 *
 * UI → URL mirrors the current selection (replace, never push — the modal is
 * view state, not a history entry) and strips the parameters when it closes.
 */
export function useOperationsEventUrlSync(
  activeTab: OperationsEventModalTab,
  applyUrlTab: (tab: OperationsEventModalTab) => void,
) {
  const navigate = useNavigate()
  const search = useSearch({ from: '/operations' }) as OperationsSearch
  const selectedEvent = useOperationsStore(s => s.selectedEvent)
  const detailLoading = useOperationsStore(s => s.detailLoading)
  const selectEvent = useOperationsStore(s => s.selectEvent)

  const selectedId = selectedEvent?.event.id ?? null
  const urlEventId = search.event ?? null
  const urlTab = search.tab ?? null
  const seenUrlEventRef = useRef<string | null>(null)
  const openingRef = useRef<string | null>(null)

  // URL → UI: an id the query JUST gained (not one already selected) opens it.
  useEffect(() => {
    const previous = seenUrlEventRef.current
    seenUrlEventRef.current = urlEventId
    if (!urlEventId || urlEventId === previous || urlEventId === selectedId) return
    if (openingRef.current === urlEventId) return
    openingRef.current = urlEventId
    void selectEvent(urlEventId).catch(() => undefined).finally(() => {
      if (openingRef.current === urlEventId) openingRef.current = null
    })
  }, [urlEventId, selectedId, selectEvent])

  // URL → UI: honor ?tab= once the linked event is shown. Applies only while
  // the parameter exists, so later manual tab switches are not reverted.
  useEffect(() => {
    if (!urlTab || !selectedId || urlEventId !== selectedId) return
    if (activeTab === urlTab) return
    applyUrlTab(urlTab)
  }, [urlTab, urlEventId, selectedId, activeTab, applyUrlTab])

  // UI → URL: mirror the settled selection, or strip parameters when closed.
  useEffect(() => {
    if (detailLoading) return
    if (!selectedId) {
      // Never strip while a URL-driven deep open is still resolving.
      if (openingRef.current && openingRef.current === urlEventId) return
      if (urlEventId || urlTab) navigate({ to: '/operations', search: {}, replace: true })
      return
    }
    const wantTab = activeTab !== 'tasks' ? activeTab : undefined
    // urlEventId/urlTab are the derived search.event/search.tab values already
    // listed in deps below, so the comparison honors exhaustive-deps exactly.
    if ((urlEventId ?? null) === selectedId && (urlTab ?? undefined) === wantTab) return
    navigate({
      to: '/operations',
      search: wantTab ? { event: selectedId, tab: wantTab } : { event: selectedId },
      replace: true,
    })
  }, [selectedId, detailLoading, activeTab, urlEventId, urlTab, navigate])
}
