import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Badge, Button, Surface, TextInput } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import type { OperationReminder } from '../../lib/api/operations'
import { operationsApi } from '../../lib/api/operations'
import { operationsErrorText } from '../../lib/operationsErrors'
import { useOperationsStore } from '../../stores/operationsStore'
import { useToastStore } from '../../stores/toastStore'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { reminderKindLabel, reminderStatusLabel, toDateTimeInput } from './operationsViewHelpers'

/**
 * W3.2 extraction: the reminder inbox section. Mark-read / cancel go through
 * the store (which owns tenant checks and conflict handling); the W2.12
 * reschedule editor calls operationsApi directly because the store has no
 * reschedule command. Row busy state stays in the page so a reminder action
 * never blocks an unrelated dispatch accept (P1-8 semantics preserved).
 */
export function OperationsInboxList({
  reminders,
  reminderHasMore,
  loadingMoreReminders,
  onLoadMoreReminders,
  busyInbox,
  setInboxBusy,
  canMutate,
  isOnline,
  source,
  loading,
  permissions,
  taskTitleById,
  eventTitleById,
  onSelectTask,
  onSelectEvent,
}: {
  reminders: OperationReminder[]
  reminderHasMore: boolean
  loadingMoreReminders: boolean
  onLoadMoreReminders: () => void
  busyInbox: Set<string>
  setInboxBusy: (id: string, busy: boolean) => void
  canMutate: boolean
  isOnline: boolean
  source: 'server' | 'cache' | 'none'
  loading: boolean
  permissions: Record<string, boolean>
  // Page-memoized lookup maps: building them inside a zustand selector would
  // return a fresh reference every snapshot and loop re-renders.
  taskTitleById: Map<string, string>
  eventTitleById: Map<string, string>
  onSelectTask: (taskId: string) => void
  onSelectEvent: (eventId: string) => void
}) {
  const markReminderRead = useOperationsStore(s => s.markReminderRead)
  const cancelReminder = useOperationsStore(s => s.cancelReminder)
  const fetch = useOperationsStore(s => s.fetch)
  const { stableKey, releaseKey } = useStableCommandKey()

  // W2.12: inline reschedule editor (server command is manager-only — no
  // recipient self-exemption, unlike cancel — so the button is offered only
  // when the caller's permission map shows that authority).
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const [rescheduleAt, setRescheduleAt] = useState('')
  const [rescheduleReason, setRescheduleReason] = useState('')
  const canRescheduleReminder = (reminder: OperationReminder) =>
    Boolean(permissions[reminder.taskId ? 'operations.task.assign' : 'operations.event.manage'])

  const handleMarkRead = async (reminder: OperationReminder) => {
    if (busyInbox.has(reminder.id)) return
    setInboxBusy(reminder.id, true)
    try {
      const key = stableKey('reminder-read', { id: reminder.id, version: reminder.version })
      await markReminderRead(reminder, key)
      releaseKey('reminder-read')
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể đánh dấu đã đọc'), 'error')
    } finally { setInboxBusy(reminder.id, false) }
  }

  const handleCancel = async (reminder: OperationReminder) => {
    if (busyInbox.has(reminder.id)) return
    setInboxBusy(reminder.id, true)
    try {
      const key = stableKey('reminder-cancel', { id: reminder.id, version: reminder.version })
      await cancelReminder(reminder, key)
      releaseKey('reminder-cancel')
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể hủy lịch nhắc'), 'error')
    } finally { setInboxBusy(reminder.id, false) }
  }

  const handleReschedule = async (reminder: OperationReminder) => {
    if (busyInbox.has(reminder.id) || !rescheduleAt || !rescheduleReason.trim()) return
    setInboxBusy(reminder.id, true)
    try {
      const payload = { expectedVersion: reminder.version, triggerAt: new Date(rescheduleAt).toISOString(), reason: rescheduleReason.trim() }
      const key = stableKey('reminder-reschedule', { id: reminder.id, ...payload })
      await operationsApi.rescheduleReminder(reminder.id, payload, key)
      releaseKey('reminder-reschedule')
      setRescheduleId(null); setRescheduleAt(''); setRescheduleReason('')
      await fetch().catch(() => undefined)
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể đổi giờ nhắc'), 'error')
    } finally { setInboxBusy(reminder.id, false) }
  }

  return (
    <Surface as="section" variant="card" className="overflow-hidden rounded-2xl border border-surface-border shadow-xs" aria-label="Hộp nhắc việc">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3.5 bg-surface-ground/30">
        <div className="flex items-center gap-2">
          <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h2 className="m-0 text-base font-bold text-text-main">Hộp Nhắc Việc</h2>
            <p className="m-0 text-xs text-text-muted">Thông báo mốc thời gian và hạn hoàn thành nhiệm vụ</p>
          </div>
        </div>
        <Badge tone="neutral">{reminders.filter(r => !r.readAt).length} chưa đọc</Badge>
      </div>

      <div className="divide-y divide-surface-border">
        {reminders.length === 0 && (
          <div className="p-6">
            <EmptyState
              icon={Bell}
              title="Chưa có nhắc việc nào"
              description="Hộp thư nhắc việc tự động hiện trống."
            />
          </div>
        )}
        {reminders.map(reminder => {
          // W1.2: resolve what the reminder announces. Titles come from the
          // recipient's own scoped lists; a target outside the loaded page
          // degrades to "not in current list" instead of guessing.
          const taskTitle = reminder.taskId ? taskTitleById.get(reminder.taskId) : undefined
          const eventTitle = reminder.eventId ? eventTitleById.get(reminder.eventId) : undefined
          const resourceTitle = reminder.kind === 'MANAGER_PREP'
            ? (eventTitle ?? undefined)
            : (taskTitle ?? eventTitle ?? undefined)
          const openTaskId = reminder.taskId ?? null
          const openEventId = reminder.eventId ?? null
          return (
          <article
            key={reminder.id}
            data-reminder-id={reminder.id}
            className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors ${
              reminder.readAt ? 'hover:bg-surface-hover/30' : 'bg-parish-primary-light/30 border-l-4 border-parish-primary'
            }`}
          >
            <div className="min-w-0">
              <p className="m-0 text-sm font-bold text-text-main">{reminderKindLabel[reminder.kind]}</p>
              {(reminder.taskId || reminder.eventId) && (
                <p className="mb-0 mt-1 text-xs text-text-muted truncate">
                  {resourceTitle ? <>· {resourceTitle}</> : '· Tài nguyên không còn trong danh sách đã tải'}
                </p>
              )}
              <p className="mb-0 mt-1 text-xs text-text-muted">
                {new Date(reminder.triggerAt).toLocaleString('vi-VN')} · {reminderStatusLabel[reminder.status]}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canMutate && (openTaskId || openEventId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (openTaskId) onSelectTask(openTaskId)
                    else if (openEventId) onSelectEvent(openEventId)
                  }}
                >
                  Mở
                </Button>
              )}
              {reminder.readAt ? (
                <Badge tone="neutral">Đã đọc</Badge>
              ) : (
                <Button variant="secondary" size="sm" disabled={!canMutate || busyInbox.has(reminder.id)} loading={busyInbox.has(reminder.id)} onClick={() => void handleMarkRead(reminder)}>
                  Đánh dấu đã đọc
                </Button>
              )}
              {reminder.status === 'PENDING' && canMutate && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canMutate || busyInbox.has(reminder.id)}
                  loading={busyInbox.has(reminder.id)}
                  onClick={() => void handleCancel(reminder)}
                >
                  Hủy lịch nhắc
                </Button>
              )}
              {/* W2.12: server reschedule is manager-only (no recipient
                  self-exemption) — only offer it with that authority. */}
              {reminder.status === 'PENDING' && canMutate && canRescheduleReminder(reminder) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyInbox.has(reminder.id)}
                  onClick={() => {
                    setRescheduleId(reminder.id)
                    setRescheduleAt(toDateTimeInput(reminder.triggerAt))
                    setRescheduleReason('')
                  }}
                >
                  Dời giờ
                </Button>
              )}
            </div>
            {rescheduleId === reminder.id && (
              <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-surface-border bg-surface-ground/30 p-2">
                <label className="min-w-[150px] flex-1 text-xs text-text-muted">
                  Giờ nhắc mới
                  <TextInput aria-label="Giờ nhắc mới của lịch nhắc" type="datetime-local" className="mt-1 w-full" value={rescheduleAt} disabled={busyInbox.has(reminder.id)} onChange={event => setRescheduleAt(event.target.value)} />
                </label>
                <label className="min-w-[160px] flex-[2] text-xs text-text-muted">
                  Lý do (bắt buộc)
                  <TextInput aria-label="Lý do dời giờ nhắc" className="mt-1 w-full" value={rescheduleReason} maxLength={2000} disabled={busyInbox.has(reminder.id)} placeholder="Vì sao cần dời?" onChange={event => setRescheduleReason(event.target.value)} />
                </label>
                <Button
                  size="sm"
                  loading={busyInbox.has(reminder.id)}
                  disabled={!rescheduleAt || !rescheduleReason.trim() || new Date(rescheduleAt).getTime() <= Date.now()}
                  onClick={() => void handleReschedule(reminder)}
                >
                  Lưu giờ mới
                </Button>
                <Button variant="ghost" size="sm" disabled={busyInbox.has(reminder.id)} onClick={() => { setRescheduleId(null); setRescheduleAt(''); setRescheduleReason('') }}>
                  Bỏ qua
                </Button>
              </div>
            )}
          </article>
          )
        })}
        {reminderHasMore && (
          <div className="p-3 text-center bg-surface-ground/20">
            <Button variant="secondary" size="sm" loading={loadingMoreReminders} disabled={!isOnline || source !== 'server' || loading} onClick={onLoadMoreReminders}>
              Tải thêm nhắc việc
            </Button>
          </div>
        )}
      </div>
    </Surface>
  )
}
