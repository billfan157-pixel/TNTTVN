import { useEffect, useMemo, useState } from 'react'
import { Archive, Calendar, CalendarClock, Church, Clock, GraduationCap, Hourglass, Layers, MapPin, Mountain, Search, ShieldCheck, Sparkles, Tent, UserRound, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge, Button, Surface, TextInput } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import type { OperationEvent } from '../../lib/api/operations'
import { useOperationsStore } from '../../stores/operationsStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { eventCountdownLabel, formatEventSchedule, groupEventsByType, sortEventsByUpcoming, statusLabel, statusTone } from './operationsViewHelpers'

/**
 * One window per event type (U-19, 2026-09-21). The pane is titled "Sự Kiện &
 * Công Việc Đang Diễn Ra", so the type must be readable at a glance instead of
 * only inside the detail modal; icons mirror the create/edit type picker labels.
 */
const EVENT_TYPE_ICONS: Record<string, LucideIcon> = {
  FEAST_DAY: Church,
  CAMP: Tent,
  TRAINING: GraduationCap,
  SACRAMENT: Sparkles,
  RETREAT: Mountain,
  MEETING: Users,
  OTHER: Layers,
}

/**
 * A single event row. Creator ≠ organizer (O1), so both names are shown: the
 * account that created the event and the person responsible for running it —
 * resolved server-side and already present on the loaded list rows.
 */
function EventRow({
  event,
  scopeBadge,
  isOnline,
  source,
  detailLoading,
  pending,
  onOpen,
}: {
  event: OperationEvent
  scopeBadge: string
  isOnline: boolean
  source: 'server' | 'cache' | 'none'
  detailLoading: boolean
  pending: boolean
  onOpen: (event: OperationEvent) => void
}) {
  return (
    <article
      className="group p-4 cursor-pointer transition-colors hover:bg-surface-hover/50"
      onClick={() => {
        if (!isOnline || source === 'cache') return
        onOpen(event)
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 truncate text-sm font-bold text-text-main group-hover:text-parish-primary transition-colors">
              {event.title}
            </h3>
            <Badge tone="neutral">{scopeBadge}</Badge>
            <Badge tone={statusTone(event.status)}>
              {event.status === 'CANCELLED' ? 'Đã hủy / Lưu trữ' : (statusLabel[event.status] || event.status)}
            </Badge>
          </div>

          {/* U-19b: the row must say when the event happens, so the pane can be
              read in time order without opening the detail modal. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              <span className="font-semibold text-text-main">{formatEventSchedule(event.startsAt, event.endsAt, event.timezone)}</span>
            </span>
            <span className="flex items-center gap-1">
              <Hourglass className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              {eventCountdownLabel(event.startsAt, event.endsAt)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              {event.location || 'Chưa có địa điểm'}
            </span>
          </div>

          {(event.createdByName || event.organizerName) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
              {event.createdByName && (
                <span className="flex items-center gap-1">
                  <UserRound className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  Người tạo: <span className="font-semibold text-text-main">{event.createdByName}</span>
                </span>
              )}
              {event.organizerName && (
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  Phụ trách: <span className="font-semibold text-text-main">{event.organizerName}</span>
                </span>
              )}
            </div>
          )}

          {event.sourceParishEventId && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-parish-primary-light/50 px-2 py-0.5 text-xs font-semibold text-parish-primary">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              Liên kết Lịch Xứ Đoàn
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 group-hover:bg-parish-primary group-hover:text-text-inverse transition-colors"
          disabled={!isOnline || source === 'cache'}
          loading={detailLoading && pending}
          onClick={e => {
            e.stopPropagation()
            onOpen(event)
          }}
        >
          {event.status === 'CANCELLED' ? 'Xem & Khôi phục' : 'Xem chi tiết'}
        </Button>
      </div>
    </article>
  )
}

/**
 * W3.2 extraction: the events list section, previously inlined in
 * OperationsPage. Owns its search query (W2.13 debounce → server-side search
 * when a server snapshot is loaded; client filter otherwise), the per-row
 * pending selection marker and its own load-more busy flag (W2.9/W3.1: typing
 * in the box or loading page 2 no longer re-renders the whole page).
 */
export function OperationsEventList() {
  const events = useOperationsStore(s => s.events)
  const source = useOperationsStore(s => s.source)
  const loading = useOperationsStore(s => s.loading)
  const detailLoading = useOperationsStore(s => s.detailLoading)
  const eventTotal = useOperationsStore(s => s.eventTotal)
  const eventHasMore = useOperationsStore(s => s.eventHasMore)
  const creationOptions = useOperationsStore(s => s.creationOptions)
  const selectEvent = useOperationsStore(s => s.selectEvent)
  const loadMoreEvents = useOperationsStore(s => s.loadMoreEvents)
  const searchEvents = useOperationsStore(s => s.searchEvents)
  const isOnline = useOnlineStatus()

  const [eventTab, setEventTab] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE')
  const [eventSearchQuery, setEventSearchQuery] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  // Which row triggered the in-flight detail load (the store keeps the previous
  // selection during a swap, so its id alone can't identify the spinner row).
  const [pendingEventId, setPendingEventId] = useState<string | null>(null)

  const activeEvents = useMemo(() => events.filter(e => e.status !== 'CANCELLED'), [events])
  const archivedEvents = useMemo(() => events.filter(e => e.status === 'CANCELLED'), [events])
  const baseEvents = eventTab === 'ACTIVE' ? activeEvents : archivedEvents

  // W2.13: on a server snapshot, the query runs server-side (debounced below)
  // so search spans every page instead of only the loaded 50; cached/offline
  // keeps the honest client-side filter over cached rows (double filtering in
  // server mode is a no-op because both paths match title/location).
  const eventSearchServerSide = isOnline && source === 'server'
  useEffect(() => {
    if (!eventSearchServerSide) return
    const q = eventSearchQuery.trim()
    if (useOperationsStore.getState().eventQuery.trim() === q) return
    const timer = setTimeout(() => { void searchEvents(q) }, 300)
    return () => clearTimeout(timer)
  }, [eventSearchQuery, eventSearchServerSide, searchEvents])

  // U-19b: "sự kiện sắp diễn ra xếp trước" — the loaded rows are ordered by the
  // schedule (ongoing/upcoming ascending, ended events last, newest first) before
  // grouping, so both the windows and the rows inside them read in time order.
  const scheduledEvents = useMemo(() => sortEventsByUpcoming(baseEvents), [baseEvents])

  const filteredEvents = useMemo(() => {
    const q = eventSearchQuery.trim().toLowerCase()
    if (!q) return scheduledEvents
    return scheduledEvents.filter(e =>
      e.title.toLowerCase().includes(q)
      || (e.location && e.location.toLowerCase().includes(q))
    )
  }, [scheduledEvents, eventSearchQuery])

  // U-19: one window per event type ("Khác" for unknown codes); U-19b: the window
  // holding the soonest event leads, so the pane follows the calendar.
  const eventTypeWindows = useMemo(() => groupEventsByType(filteredEvents, { orderWindowsBySoonest: true }), [filteredEvents])

  const unitNameOf = (scopeUnitId: string | null | undefined) => scopeUnitId
    ? (creationOptions?.units.find(unit => unit.id === scopeUnitId)?.name ?? 'Chuyên môn')
    : null
  const scopeBadgeOf = (event: OperationEvent) => {
    const scopeType = event.eventScopeType ?? (event.scopeUnitId ? 'UNIT' : 'XU_DOAN')
    return scopeType === 'XU_DOAN' ? 'Sự kiện Xứ đoàn (Đa mảng)' : `Mảng chuyên môn · ${unitNameOf(event.scopeUnitId) ?? 'Đơn vị phụ trách'}`
  }

  const openEvent = (event: OperationEvent) => {
    setPendingEventId(event.id)
    void selectEvent(event.id).catch(() => undefined).finally(() => {
      setPendingEventId(current => (current === event.id ? null : current))
    })
  }
  const handleLoadMore = () => {
    if (loadingMore) return
    setLoadingMore(true)
    void loadMoreEvents().catch(() => undefined).finally(() => setLoadingMore(false))
  }

  return (
    <Surface as="section" variant="card" className="overflow-hidden rounded-2xl border border-surface-border shadow-xs flex flex-col" aria-label="Sự kiện đang diễn ra">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3.5 bg-surface-ground/30">
        <div className="flex items-center gap-2">
          <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
            {eventTab === 'ACTIVE' ? <Calendar className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </div>
          <div>
            <h2 className="m-0 text-base font-bold text-text-main">
              {eventTab === 'ACTIVE' ? 'Sự Kiện & Công Việc Đang Diễn Ra' : 'Sự Kiện Đã Lưu Trữ'}
            </h2>
            <p className="m-0 text-xs text-text-muted">
              {eventTab === 'ACTIVE' ? `${activeEvents.length} sự kiện đang hoạt động` : `${archivedEvents.length} sự kiện đã lưu trữ`}
              {archivedEvents.length > 0 && eventTab === 'ACTIVE' ? ` · ${archivedEvents.length} đã lưu trữ` : ''}
              {eventTotal > events.length ? ` · ${eventTotal} tất cả` : ''}
            </p>
          </div>
        </div>
        <Badge tone={eventTab === 'ACTIVE' ? 'primary' : 'neutral'}>
          {eventTab === 'ACTIVE' && eventTotal > events.length ? `${activeEvents.length}/${eventTotal}` : baseEvents.length}
        </Badge>
      </div>

      {/* View Switcher Chips (Đang hoạt động / Lưu trữ) */}
      <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-surface-ground/40 border-b border-surface-border" role="group" aria-label="Chế độ xem sự kiện">
        <button
          type="button"
          aria-pressed={eventTab === 'ACTIVE'}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] sm:min-h-0 inline-flex items-center justify-center mobile-touch-target ${
            eventTab === 'ACTIVE'
              ? 'bg-parish-primary text-text-inverse shadow-xs'
              : 'bg-surface-card text-text-muted hover:text-text-main border border-surface-border hover:bg-surface-hover'
          }`}
          onClick={() => setEventTab('ACTIVE')}
        >
          Đang hoạt động ({activeEvents.length})
        </button>
        <button
          type="button"
          aria-pressed={eventTab === 'ARCHIVED'}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] sm:min-h-0 inline-flex items-center justify-center mobile-touch-target ${
            eventTab === 'ARCHIVED'
              ? 'bg-parish-primary text-text-inverse shadow-xs'
              : 'bg-surface-card text-text-muted hover:text-text-main border border-surface-border hover:bg-surface-hover'
          }`}
          onClick={() => setEventTab('ARCHIVED')}
        >
          <Archive className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Lưu trữ ({archivedEvents.length})
        </button>
      </div>

      {/* W2.13: keep the box while a server search is active — otherwise a
          query that narrows to <=2 results would hide the input mid-search. */}
      {(events.length > 2 || eventSearchQuery) && (
        <div className="px-3 py-2 border-b border-surface-border bg-surface-ground/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" aria-hidden="true" />
            {/* W3.4: DS-standard TextInput (40px control) replaces the
                hand-rolled ~28px input that bypassed `.form-input`. */}
            <TextInput
              type="search"
              aria-label="Tìm kiếm sự kiện"
              placeholder="Tìm theo tên hoặc địa điểm..."
              value={eventSearchQuery}
              onChange={e => setEventSearchQuery(e.target.value)}
              className="w-full pl-8 pr-9"
            />
            {eventSearchQuery && (
              <button
                type="button"
                aria-label="Xóa tìm kiếm sự kiện"
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parish-primary"
                onClick={() => setEventSearchQuery('')}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-2.5 p-2 sm:space-y-3 sm:p-3 bg-surface-ground/20">
        {baseEvents.length === 0 && !eventSearchQuery ? (
          <div className="p-5">
            <EmptyState
              icon={eventTab === 'ACTIVE' ? Calendar : Archive}
              title={eventTab === 'ACTIVE' ? 'Chưa có sự kiện nào' : 'Lưu trữ trống'}
              description={
                eventTab === 'ACTIVE'
                  ? 'Hiện không có sự kiện hoạt động nào trong phạm vi quản lý của bạn.'
                  : 'Chưa có sự kiện nào bị hủy hoặc đưa vào lưu trữ.'
              }
            />
          </div>
        ) : (baseEvents.length === 0 || filteredEvents.length === 0) ? (
          <div className="p-3">
            <EmptyState
              icon={Search}
              title="Không tìm thấy sự kiện"
              description={`Không có sự kiện nào khớp với từ khóa "${eventSearchQuery}".`}
            />
          </div>
        ) : (
          /* U-19: one window per event type in canonical order — an unknown code
             falls into the trailing "Khác" window so nothing is hidden. */
          eventTypeWindows.map(typeWindow => {
            const TypeIcon = EVENT_TYPE_ICONS[typeWindow.key] ?? Layers
            return (
              <section
                key={typeWindow.key}
                aria-label={`Nhóm sự kiện: ${typeWindow.label}`}
                className="overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-xs"
              >
                <header className="flex items-center justify-between gap-2 border-b border-surface-border bg-surface-ground/40 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0" aria-hidden="true">
                      <TypeIcon className="h-3.5 w-3.5" />
                    </div>
                    <h3 className="m-0 truncate text-sm font-bold text-text-main">{typeWindow.label}</h3>
                  </div>
                  <Badge tone="neutral">{typeWindow.events.length}</Badge>
                </header>

                <div className="divide-y divide-surface-border">
                  {typeWindow.events.map(event => (
                    <EventRow
                      key={event.id}
                      event={event}
                      scopeBadge={scopeBadgeOf(event)}
                      isOnline={isOnline}
                      source={source}
                      detailLoading={detailLoading}
                      pending={pendingEventId === event.id}
                      onOpen={openEvent}
                    />
                  ))}
                </div>
              </section>
            )
          })
        )}
        {eventHasMore && (
          <div className="rounded-xl border border-surface-border bg-surface-card p-3 text-center">
            <Button variant="secondary" size="sm" loading={loadingMore} disabled={!isOnline || source !== 'server' || loading} onClick={handleLoadMore}>
              Tải thêm sự kiện
            </Button>
          </div>
        )}
      </div>
    </Surface>
  )
}
