import { useEffect, useRef } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { operationsApi } from '../lib/api/operations'
import { useOperationsStore } from '../stores/operationsStore'

export type OperationsEventModalTab = 'tasks' | 'workstreams' | 'participants' | 'reminders' | 'templates' | 'retrospective'

interface OperationsSearch {
  event?: string
  calendarEvent?: string
  tab?: OperationsEventModalTab
}

/**
 * W2.2 + A1: two-way sync between `/operations?event=&tab=` and the event detail
 * modal, so deep links, F5, browser history and calendar links (?calendarEvent=)
 * behave cleanly.
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
  const urlCalendarEventId = search.calendarEvent ?? null
  const urlTab = search.tab ?? null
  const seenUrlEventRef = useRef<string | null>(null)
  const openingRef = useRef<string | null>(null)
  const resolvingCalendarRef = useRef<string | null>(null)
  // W2.2-fix (2026-09-16): the ?tab= parameter is honored ONCE per distinct
  // (event, tab) pair. Without this, the effect below re-applies a stale URL
  // tab on every render where it differs from the active tab — permanently
  // reverting manual tab switches made while the URL still holds the old tab
  // (the UI→URL mirror only catches up afterwards, and loses the race).
  const appliedUrlTabRef = useRef<{ event: string; tab: OperationsEventModalTab } | null>(null)

  // A1: Calendar → Operations: map ?calendarEvent= to operation event id
  useEffect(() => {
    if (!urlCalendarEventId || resolvingCalendarRef.current === urlCalendarEventId) return
    resolvingCalendarRef.current = urlCalendarEventId
    const events = useOperationsStore.getState().events
    const localMatch = events.find(e => e.sourceParishEventId === urlCalendarEventId)
    if (localMatch) {
      navigate({
        to: '/operations',
        search: search.tab ? { event: localMatch.id, tab: search.tab } : { event: localMatch.id },
        replace: true,
      })
      return
    }
    void operationsApi.getEventsPublicSummary().then(res => {
      const match = res.data.find(row => row.id === urlCalendarEventId)
      if (match) {
        navigate({
          to: '/operations',
          search: search.tab ? { event: match.operationEventId, tab: search.tab } : { event: match.operationEventId },
          replace: true,
        })
      }
    }).catch(() => undefined)
  }, [urlCalendarEventId, navigate, search.tab])

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

  // URL → UI: honor ?tab= once the linked event is shown, and only once per
  // distinct (event, tab) pair — later manual tab switches are never reverted
  // (a fresh deep-link with a different tab still applies, and a return to a
  // pair after the URL stopped carrying it applies again).
  useEffect(() => {
    if (!urlTab) {
      appliedUrlTabRef.current = null
      return
    }
    if (!selectedId || urlEventId !== selectedId) return
    const applied = appliedUrlTabRef.current
    if (applied && applied.event === urlEventId && applied.tab === urlTab) return
    appliedUrlTabRef.current = { event: urlEventId, tab: urlTab }
    if (activeTab === urlTab) return
    applyUrlTab(urlTab)
  }, [urlTab, urlEventId, selectedId, activeTab, applyUrlTab])

  // UI → URL: mirror the settled selection, or strip parameters when closed.
  useEffect(() => {
    if (detailLoading) return
    if (!selectedId) {
      // Never strip while a URL-driven deep open is still resolving.
      if (openingRef.current && openingRef.current === urlEventId) return
      if (urlCalendarEventId && resolvingCalendarRef.current === urlCalendarEventId) return
      if (urlEventId || urlTab || urlCalendarEventId) navigate({ to: '/operations', search: {}, replace: true })
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
  }, [selectedId, detailLoading, activeTab, urlEventId, urlCalendarEventId, urlTab, navigate])
}
