import { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarPlus, CheckCircle2, CircleAlert, ClipboardList, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { PageHeader } from '../components/common/PageHeader'
import { ErrorState, SkeletonCardGrid } from '../components/common/StateFeedback'
import { Badge, Button, Select, Surface, TextArea, TextInput } from '../components/common/ui'
import type { OperationEvent } from '../lib/api/operations'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useOperationsStore } from '../stores/operationsStore'
import { useParishProfileStore } from '../stores/parishProfileStore'
import { WorkstreamPanel } from '../components/operations/WorkstreamPanel'
import { EventReminderForm } from '../components/operations/EventReminderForm'
import { TaskReviewPanel } from '../components/operations/TaskReviewPanel'
import { TaskHandoverForm } from '../components/operations/TaskHandoverForm'
import { TaskApprovalQueue } from '../components/operations/TaskApprovalQueue'

const statusLabel: Record<string, string> = {
  DRAFT: 'Bản nháp', PLANNING: 'Đang chuẩn bị', READY: 'Sẵn sàng', LIVE: 'Đang diễn ra', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
  BACKLOG: 'Chờ xếp việc', TODO: 'Chưa làm', IN_PROGRESS: 'Đang làm', BLOCKED: 'Bị chặn', DONE: 'Hoàn tất',
}
const EMPTY_PEOPLE: never[] = []
const isTerminalTask = (status: string) => status === 'DONE' || status === 'CANCELLED'
const isClosedEvent = (status: string) => status === 'COMPLETED' || status === 'CANCELLED'
const nextEventStatus: Partial<Record<OperationEvent['status'], OperationEvent['status']>> = {
  DRAFT: 'PLANNING', PLANNING: 'READY', READY: 'LIVE', LIVE: 'COMPLETED',
}
const transitionLabel: Partial<Record<OperationEvent['status'], string>> = {
  PLANNING: 'Bắt đầu lập kế hoạch', READY: 'Đánh dấu sẵn sàng', LIVE: 'Bắt đầu sự kiện', COMPLETED: 'Hoàn tất sự kiện',
}
const reminderKindLabel = { TASK_DUE: 'Nhắc hạn công việc', EVENT_START: 'Nhắc giờ bắt đầu sự kiện', OVERDUE: 'Công việc quá hạn' } as const
const reminderStatusLabel = { PENDING: 'Đang chờ', ENQUEUED: 'Đang gửi', SENT: 'Đã gửi', FAILED: 'Không gửi được', CANCELLED: 'Đã hủy' } as const

const statusTone = (status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' => {
  if (status === 'DONE' || status === 'COMPLETED' || status === 'READY') return 'success'
  if (status === 'BLOCKED' || status === 'CANCELLED') return 'danger'
  if (status === 'IN_PROGRESS' || status === 'LIVE') return 'primary'
  if (status === 'PLANNING' || status === 'TODO') return 'warning'
  return 'neutral'
}

function toIso(value: string) {
  return new Date(value).toISOString()
}

export default function OperationsPage() {
  const {
    events, tasks, reminders, permissions, selectedEvent, selectedTask, detailLoading, taskDetailLoading, loading, error, source, cacheSavedAt,
    eventTotal, taskTotal, eventHasMore, taskHasMore, reminderHasMore, fetch, loadMoreEvents, loadMoreTasks, loadMoreReminders,
    createEvent, selectEvent, selectTask, refreshTaskViews, createTask, assignTask, transitionEvent, transitionTask, acknowledgeTask,
    addChecklistItem, toggleChecklistItem, markReminderRead, cancelReminder, assignmentWarnings,
  } = useOperationsStore()
  const profileSnapshot = useParishProfileStore(state => state.snapshot)
  const people = profileSnapshot?.people ?? EMPTY_PEOPLE
  const fetchProfile = useParishProfileStore(state => state.fetchSnapshot)
  const isOnline = useOnlineStatus()
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ title: '', startsAt: '', endsAt: '' })
  const [taskDraft, setTaskDraft] = useState({ title: '', dueAt: '', isRequired: false, workstreamId: '' })
  const [assignmentDraft, setAssignmentDraft] = useState({ taskId: '', personId: '', role: 'CONTRIBUTOR' as 'OWNER' | 'CONTRIBUTOR' | 'APPROVER' | 'OBSERVER' })
  const [eventReason, setEventReason] = useState('')
  const [outcomeSummary, setOutcomeSummary] = useState('')
  const [transitioningEvent, setTransitioningEvent] = useState(false)
  const [checklistDraft, setChecklistDraft] = useState({ label: '', isRequired: false })
  const hasFreshServerState = source === 'server'
  const canMutate = isOnline && hasFreshServerState
  const selectedEventClosed = selectedEvent ? isClosedEvent(selectedEvent.event.status) : false
  const closureTasks = selectedEvent?.tasks.filter(task => task.isRequired && task.status !== 'DONE') ?? []
  const assignableTasks = selectedEvent?.tasks.filter(task => !isTerminalTask(task.status)) ?? []

  useEffect(() => { void fetch().catch(() => undefined); void fetchProfile() }, [fetch, fetchProfile])

  const pendingAcknowledgements = useMemo(() => tasks.filter(task => !isTerminalTask(task.status) && task.myAssignments?.some(assignment => assignment.acknowledgementStatus === 'PENDING')).length, [tasks])
  const overviewCards: Array<{ label: string; value: number; Icon: LucideIcon }> = [
    { label: 'Sự kiện', value: eventTotal, Icon: CalendarPlus },
    { label: 'Việc của tôi', value: taskTotal, Icon: ShieldCheck },
    { label: 'Chờ phản hồi', value: pendingAcknowledgements, Icon: CircleAlert },
    { label: 'Đang bị chặn', value: tasks.filter(task => task.status === 'BLOCKED').length, Icon: ClipboardList },
  ]

  const handleTask = async (task: typeof tasks[number], action: 'DONE' | 'ACCEPTED' | 'DECLINED') => {
    setBusyTask(task.id)
    try {
      if (action === 'DONE') await transitionTask(task, 'DONE')
      else await acknowledgeTask(task, action)
    } catch {
      // Store owns the visible error state; keep the workspace mounted.
    } finally { setBusyTask(null) }
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.title || !draft.startsAt || !draft.endsAt) return
    setCreating(true)
    try {
      await createEvent({
        title: draft.title,
        eventType: 'OTHER',
        startsAt: toIso(draft.startsAt),
        endsAt: toIso(draft.endsAt),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
      })
      setDraft({ title: '', startsAt: '', endsAt: '' })
      setShowCreate(false)
    } catch {
      // Store provides the user-facing failure.
    } finally { setCreating(false) }
  }

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedEvent || selectedEventClosed || !taskDraft.title) return
    setCreating(true)
    try {
      const workstreamId = selectedEvent.workstreams.some(group => group.id === taskDraft.workstreamId) ? taskDraft.workstreamId : null
      await createTask({ title: taskDraft.title, eventId: selectedEvent.event.id, workstreamId, dueAt: taskDraft.dueAt ? toIso(taskDraft.dueAt) : null, isRequired: taskDraft.isRequired })
      setTaskDraft({ title: '', dueAt: '', isRequired: false, workstreamId: '' })
      await selectEvent(selectedEvent.event.id)
    } catch {
      // Store provides the visible failure.
    } finally { setCreating(false) }
  }

  const handleAssign = async (event: React.FormEvent) => {
    event.preventDefault()
    const task = selectedEvent?.tasks.find(item => item.id === assignmentDraft.taskId)
    if (!task || selectedEventClosed || isTerminalTask(task.status) || !assignmentDraft.personId) return
    setBusyTask(task.id)
    try {
      await assignTask(task, assignmentDraft.personId, assignmentDraft.role)
      setAssignmentDraft({ taskId: '', personId: '', role: 'CONTRIBUTOR' })
      await selectEvent(selectedEvent!.event.id)
    } catch {
      // Store provides the visible failure, including conflict warnings/errors.
    } finally { setBusyTask(null) }
  }

  const handleEventTransition = async (status: OperationEvent['status']) => {
    if (!selectedEvent || selectedEventClosed || !canMutate) return
    const requiresReason = status === 'CANCELLED'
    const requiresOutcome = status === 'COMPLETED'
    if ((requiresReason && !eventReason.trim()) || (requiresOutcome && !outcomeSummary.trim())) return
    setTransitioningEvent(true)
    try {
      await transitionEvent(selectedEvent.event.id, status, selectedEvent.event.version, {
        reason: eventReason.trim() || undefined,
        outcomeSummary: outcomeSummary.trim() || undefined,
      })
      setEventReason('')
      setOutcomeSummary('')
      await selectEvent(selectedEvent.event.id)
    } catch {
      // Store owns OCC/readiness/API errors and keeps the detail visible.
    } finally { setTransitioningEvent(false) }
  }

  const handleAddChecklistItem = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedTask || isTerminalTask(selectedTask.task.status) || !checklistDraft.label.trim()) return
    setBusyTask(selectedTask.task.id)
    try {
      await addChecklistItem(selectedTask.task, checklistDraft.label.trim(), checklistDraft.isRequired)
      setChecklistDraft({ label: '', isRequired: false })
    } catch {
      // Store owns the visible OCC/API error.
    } finally { setBusyTask(null) }
  }

  const handleToggleChecklistItem = async (item: NonNullable<typeof selectedTask>['checklist'][number]) => {
    if (!selectedTask || isTerminalTask(selectedTask.task.status)) return
    setBusyTask(selectedTask.task.id)
    try {
      await toggleChecklistItem(selectedTask.task, item)
    } catch {
      // Store owns the visible OCC/API error; unchecked state remains authoritative.
    } finally { setBusyTask(null) }
  }

  if (loading && events.length === 0 && tasks.length === 0) {
    return <DesktopAppShell width="wide"><SkeletonCardGrid count={5} /></DesktopAppShell>
  }

  return (
    <DesktopAppShell width="wide" className="space-y-5">
      <PageHeader
        title="Sự Kiện & Công Việc"
        description="Điều phối trách nhiệm, tiến độ và các điểm đang chặn trước ngày sự kiện."
        icon={<ClipboardList aria-hidden="true" className="h-6 w-6" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {permissions['operations.event.create'] && (
              <Button size="sm" leadingIcon={<CalendarPlus className="h-4 w-4" />} disabled={!canMutate} onClick={() => setShowCreate(value => !value)}>
                Tạo sự kiện vận hành
              </Button>
            )}
            <Button variant="secondary" size="sm" leadingIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />} disabled={loading || !isOnline} onClick={() => void fetch().catch(() => undefined)}>
              Làm mới
            </Button>
          </div>
        }
      />

      {(!isOnline || source === 'cache') && (
        <Surface variant="sunken" role="status" className="flex items-start gap-2 border border-parish-warning/30 p-3 text-sm text-parish-warning">
          <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{source === 'cache'
            ? `Đang xem bản sao máy chủ gần nhất${cacheSavedAt ? ` (${new Date(cacheSavedAt).toLocaleString('vi-VN')})` : ''}. Hãy làm mới sau khi có mạng trước khi tạo hoặc cập nhật.`
            : 'Operations đang ngoại tuyến. Cần kết nối máy chủ để tạo hoặc cập nhật; ứng dụng không báo thành công giả.'}</span>
        </Surface>
      )}

      {error && <ErrorState message={error} onRetry={isOnline ? () => void fetch().catch(() => undefined) : undefined} />}

      {showCreate && permissions['operations.event.create'] && (
        <Surface as="section" variant="card" className="p-4 sm:p-5" aria-label="Tạo sự kiện vận hành">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreate}>
            <label className="sm:col-span-2 text-sm font-semibold text-text-main">
              Tên sự kiện
              <TextInput className="mt-1 w-full" value={draft.title} maxLength={300} required onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} />
            </label>
            <label className="text-sm font-semibold text-text-main">
              Bắt đầu
              <TextInput className="mt-1 w-full" type="datetime-local" value={draft.startsAt} required onChange={event => setDraft(value => ({ ...value, startsAt: event.target.value }))} />
            </label>
            <label className="text-sm font-semibold text-text-main">
              Kết thúc
              <TextInput className="mt-1 w-full" type="datetime-local" value={draft.endsAt} required onChange={event => setDraft(value => ({ ...value, endsAt: event.target.value }))} />
            </label>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Hủy</Button>
              <Button type="submit" size="sm" loading={creating} disabled={!canMutate}>Lưu bản nháp</Button>
            </div>
          </form>
        </Surface>
      )}

      <section aria-label="Tổng quan vận hành" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {overviewCards.map(({ label, value, Icon }) => (
          <Surface key={label} variant="card" className="p-4">
            <div className="flex items-center justify-between text-text-muted"><span className="text-xs font-bold uppercase tracking-wider">{label}</span><Icon className="h-4 w-4 text-parish-primary" /></div>
            <p className="mb-0 mt-2 text-2xl font-black text-text-main">{value}</p>
          </Surface>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Surface as="section" variant="card" className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-surface-border px-4 py-3"><CalendarPlus className="h-4 w-4 text-parish-primary" /><h2 className="m-0 text-sm font-extrabold text-text-main">Sự Kiện Đang Vận Hành</h2></div>
          <div className="divide-y divide-surface-border">
            {events.length === 0 && <p className="m-0 px-4 py-8 text-center text-sm text-text-muted">Chưa có operation event trong phạm vi của bạn.</p>}
            {events.map(event => (
              <article key={event.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="m-0 truncate text-sm font-bold text-text-main">{event.title}</h3><p className="mb-0 mt-1 text-xs text-text-muted">{new Date(event.startsAt).toLocaleString('vi-VN')} · {event.location || 'Chưa có địa điểm'}</p></div>
                  <Badge tone={statusTone(event.status)}>{statusLabel[event.status] || event.status}</Badge>
                </div>
                <Button variant="ghost" size="sm" className="mt-2" disabled={!isOnline || source === 'cache'} loading={detailLoading && selectedEvent?.event.id === event.id} onClick={() => void selectEvent(event.id).catch(() => undefined)}>Xem chi tiết</Button>
              </article>
            ))}
            {eventHasMore && <div className="p-3 text-center"><Button variant="secondary" size="sm" disabled={!isOnline || source !== 'server' || loading} onClick={() => void loadMoreEvents().catch(() => undefined)}>Tải thêm sự kiện</Button></div>}
          </div>
        </Surface>

        <Surface as="section" variant="card" className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-surface-border px-4 py-3"><ShieldCheck className="h-4 w-4 text-parish-primary" /><h2 className="m-0 text-sm font-extrabold text-text-main">Việc Của Tôi</h2></div>
          <div className="divide-y divide-surface-border">
            {tasks.length === 0 && <p className="m-0 px-4 py-8 text-center text-sm text-text-muted">Chưa có task được giao.</p>}
            {tasks.map(task => {
              const mutable = !isTerminalTask(task.status)
              const hasPending = mutable && task.myAssignments?.some(assignment => assignment.acknowledgementStatus === 'PENDING')
              const canExecute = task.myAssignments?.some(assignment =>
                assignment.acknowledgementStatus === 'ACCEPTED'
                && (assignment.assignmentRole === 'OWNER' || assignment.assignmentRole === 'CONTRIBUTOR'))
              return (
                <article key={task.id} className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-parish-primary">{task.status === 'DONE' ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><h3 className="m-0 text-sm font-bold text-text-main">{task.title}</h3><Badge tone={statusTone(task.status)}>{statusLabel[task.status] || task.status}</Badge></div>
                      <p className="mb-0 mt-1 text-xs text-text-muted">{task.dueAt ? `Hạn ${new Date(task.dueAt).toLocaleString('vi-VN')}` : 'Chưa có hạn'}{task.blockedReason ? ` · ${task.blockedReason}` : ''}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" disabled={!isOnline || source !== 'server' || taskDetailLoading} onClick={() => void selectTask(task.id).catch(() => undefined)}>Chi tiết nhiệm vụ</Button>
                        {canExecute && mutable && <Button size="sm" disabled={!canMutate || busyTask === task.id} onClick={() => void handleTask(task, 'DONE')}>Hoàn tất</Button>}
                        {hasPending && <Button variant="secondary" size="sm" disabled={!canMutate || busyTask === task.id} onClick={() => void handleTask(task, 'ACCEPTED')}>Nhận việc</Button>}
                        {hasPending && <Button variant="danger" size="sm" disabled={!canMutate || busyTask === task.id} onClick={() => void handleTask(task, 'DECLINED')}>Từ chối</Button>}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
            {taskHasMore && <div className="p-3 text-center"><Button variant="secondary" size="sm" disabled={!isOnline || source !== 'server' || loading} onClick={() => void loadMoreTasks().catch(() => undefined)}>Tải thêm công việc</Button></div>}
          </div>
        </Surface>
      </div>

      <Surface as="section" variant="card" className="overflow-hidden" aria-label="Hộp nhắc việc">
        <TaskApprovalQueue enabled={canMutate} openTask={selectTask} />
        <div className="flex items-center gap-2 border-b border-surface-border px-4 py-3"><Bell className="h-4 w-4 text-parish-primary" /><h2 className="m-0 text-sm font-extrabold text-text-main">Hộp Nhắc Việc</h2></div>
        <div className="divide-y divide-surface-border">
          {reminders.length === 0 && <p className="m-0 px-4 py-6 text-center text-sm text-text-muted">Chưa có nhắc việc dành cho bạn.</p>}
          {reminders.map(reminder => (
            <article key={reminder.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${reminder.readAt ? '' : 'bg-parish-primary/5'}`}>
              <div>
                <p className="m-0 text-sm font-bold text-text-main">{reminderKindLabel[reminder.kind]}</p>
                <p className="mb-0 mt-1 text-xs text-text-muted">{new Date(reminder.triggerAt).toLocaleString('vi-VN')} · {reminderStatusLabel[reminder.status]}</p>
              </div>
              {reminder.readAt
                ? <Badge tone="neutral">Đã đọc</Badge>
                : <Button variant="secondary" size="sm" disabled={!canMutate} onClick={() => void markReminderRead(reminder).catch(() => undefined)}>Đánh dấu đã đọc</Button>}
              {reminder.status === 'PENDING' && <Button variant="ghost" size="sm" disabled={!canMutate || busyTask === reminder.id} onClick={() => {
                setBusyTask(reminder.id)
                void cancelReminder(reminder).catch(() => undefined).finally(() => setBusyTask(null))
              }}>Hủy lịch nhắc</Button>}
            </article>
          ))}
          {reminderHasMore && <div className="p-3 text-center"><Button variant="secondary" size="sm" disabled={!isOnline || source !== 'server' || loading} onClick={() => void loadMoreReminders().catch(() => undefined)}>Tải thêm nhắc việc</Button></div>}
        </div>
      </Surface>

      {selectedEvent && (
        <Surface as="section" variant="card" className="p-4 sm:p-5" aria-label="Chi tiết sự kiện vận hành">
          <WorkstreamPanel key={selectedEvent.event.id} event={selectedEvent} enabled={canMutate} people={people} refresh={() => selectEvent(selectedEvent.event.id)} />
          {assignmentWarnings && assignmentWarnings.items.length > 0 && selectedEvent.tasks.some(task => task.id === assignmentWarnings.taskId) && <div role="status" className="mt-3 rounded-lg border border-surface-border p-3 text-sm text-text-main">
            <p>Đã lưu phân công, nhưng người nhận có lịch bận tại hạn công việc. Hãy trao đổi lại; đây chưa phải xác nhận nhận việc hoặc kiểm tra toàn bộ ca phục vụ.</p>
            {assignmentWarnings.items.map(item => <p key={item.id}>{new Date(item.startsAt).toLocaleString('vi-VN')} – {new Date(item.endsAt).toLocaleString('vi-VN')}</p>)}
          </div>}
          <EventReminderForm key={`reminder-${selectedEvent.event.id}`} event={selectedEvent} enabled={canMutate} people={people} />
          {selectedTask && <EventReminderForm key={`task-reminder-${selectedTask.task.id}`} event={selectedEvent} task={selectedTask} enabled={canMutate} people={people} />}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border pb-4">
            <div><h2 className="m-0 text-lg font-extrabold text-text-main">{selectedEvent.event.title}</h2><p className="mb-0 mt-1 text-sm text-text-muted">Readiness {selectedEvent.readiness.percent}% · {selectedEvent.readiness.blockers.length} điểm cần xử lý</p></div>
            <Button variant="ghost" size="sm" onClick={() => void selectEvent(null)}>Đóng chi tiết</Button>
          </div>

          {selectedEvent.readiness.blockers.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {selectedEvent.readiness.blockers.map(blocker => <div key={`${blocker.type}:${blocker.id}`} className="rounded-lg border border-parish-warning/30 bg-parish-warning-bg/30 px-3 py-2 text-xs font-semibold text-text-main">{blocker.label} · {blocker.type}</div>)}
            </div>
          )}

          {!selectedEventClosed && (
            <div className="mt-4 rounded-xl border border-surface-border p-3" aria-label="Vòng đời sự kiện">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="m-0 text-sm font-extrabold text-text-main">Vòng Đời Sự Kiện</h3>
                  <p className="mb-0 mt-1 text-xs text-text-muted">Trạng thái hiện tại: {statusLabel[selectedEvent.event.status] || selectedEvent.event.status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {nextEventStatus[selectedEvent.event.status] && selectedEvent.permissions['operations.event.transition'] && (
                    <Button
                      size="sm"
                      loading={transitioningEvent}
                      disabled={!canMutate
                        || ((nextEventStatus[selectedEvent.event.status] === 'READY' || nextEventStatus[selectedEvent.event.status] === 'LIVE') && selectedEvent.readiness.blockers.length > 0)
                        || (nextEventStatus[selectedEvent.event.status] === 'COMPLETED' && (!outcomeSummary.trim() || closureTasks.length > 0))}
                      onClick={() => void handleEventTransition(nextEventStatus[selectedEvent.event.status]!)}
                    >
                      {transitionLabel[nextEventStatus[selectedEvent.event.status]!]}
                    </Button>
                  )}
                  {selectedEvent.event.status !== 'LIVE' && selectedEvent.permissions['operations.event.cancel'] && (
                    <Button variant="danger" size="sm" loading={transitioningEvent} disabled={!canMutate || !eventReason.trim()} onClick={() => void handleEventTransition('CANCELLED')}>Hủy sự kiện</Button>
                  )}
                </div>
              </div>
              {(selectedEvent.event.status === 'DRAFT' || selectedEvent.event.status === 'PLANNING' || selectedEvent.event.status === 'READY') && selectedEvent.permissions['operations.event.cancel'] && (
                <label className="mt-3 block text-sm font-semibold text-text-main">Lý do hủy
                  <TextArea className="mt-1 min-h-20 w-full" value={eventReason} maxLength={1000} placeholder="Bắt buộc khi hủy sự kiện" onChange={event => setEventReason(event.target.value)} />
                </label>
              )}
              {selectedEvent.event.status === 'LIVE' && selectedEvent.permissions['operations.event.transition'] && (
                <label className="mt-3 block text-sm font-semibold text-text-main">Tổng kết kết quả
                  <TextArea className="mt-1 min-h-24 w-full" value={outcomeSummary} maxLength={4000} required placeholder="Bắt buộc trước khi hoàn tất sự kiện" onChange={event => setOutcomeSummary(event.target.value)} />
                </label>
              )}
              {selectedEvent.event.status === 'LIVE' && closureTasks.length > 0 && <div role="status" className="mt-3 rounded-lg border border-parish-warning/30 bg-parish-warning-bg p-3 text-sm text-text-main">
                <p className="m-0 font-bold">Chưa thể đóng sự kiện: còn nhiệm vụ bắt buộc chưa hoàn tất.</p>
                <ul className="mb-0 mt-2 list-disc pl-5">{closureTasks.map(task => <li key={task.id}>{task.title} · {statusLabel[task.status] || task.status}</li>)}</ul>
                <p className="mb-0 mt-2 text-xs">Nhiệm vụ đã hủy không được tính là hoàn tất. Máy chủ kiểm tra lại khi đóng sự kiện.</p>
              </div>}
              {(nextEventStatus[selectedEvent.event.status] === 'READY' || nextEventStatus[selectedEvent.event.status] === 'LIVE') && selectedEvent.readiness.blockers.length > 0 && (
                <p className="mb-0 mt-3 text-xs font-semibold text-parish-warning">Cần xử lý hết điểm chặn readiness trước khi chuyển trạng thái.</p>
              )}
            </div>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <h3 className="m-0 text-sm font-extrabold text-text-main">Task Trong Sự Kiện</h3>
              <div className="mt-2 divide-y divide-surface-border rounded-xl border border-surface-border">
                {selectedEvent.tasks.length === 0 && <p className="m-0 px-3 py-5 text-sm text-text-muted">Chưa có task.</p>}
                {selectedEvent.tasks.map(task => (
                  <div key={task.id} className="flex items-start justify-between gap-3 px-3 py-3">
                    <div><p className="m-0 text-sm font-bold text-text-main">{task.title}</p><p className="mb-0 mt-1 text-xs text-text-muted">{selectedEvent.assignees.filter(item => item.taskId === task.id).length} người được phân công</p></div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={statusTone(task.status)}>{statusLabel[task.status] || task.status}</Badge>
                      <Button variant="ghost" size="sm" loading={taskDetailLoading && selectedTask?.task.id === task.id} disabled={!isOnline || source !== 'server'} onClick={() => void selectTask(task.id).catch(() => undefined)}>Checklist</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {selectedEvent.permissions['operations.task.create'] && !selectedEventClosed && (
                <form className="space-y-3 rounded-xl border border-surface-border p-3" onSubmit={handleCreateTask}>
                  <h3 className="m-0 text-sm font-extrabold text-text-main">Thêm Task</h3>
                  <TextInput aria-label="Tên task" className="w-full" placeholder="Tên công việc" value={taskDraft.title} required maxLength={300} onChange={event => setTaskDraft(value => ({ ...value, title: event.target.value }))} />
                  <Select aria-label="Nhóm của công việc" className="w-full" value={selectedEvent.workstreams.some(group => group.id === taskDraft.workstreamId) ? taskDraft.workstreamId : ''} onChange={event => setTaskDraft(value => ({ ...value, workstreamId: event.target.value }))}><option value="">Không thuộc nhóm</option>{selectedEvent.workstreams.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</Select>
                  <TextInput aria-label="Hạn task" className="w-full" type="datetime-local" value={taskDraft.dueAt} onChange={event => setTaskDraft(value => ({ ...value, dueAt: event.target.value }))} />
                  <label className="flex items-center gap-2 text-sm text-text-main"><input type="checkbox" checked={taskDraft.isRequired} onChange={event => setTaskDraft(value => ({ ...value, isRequired: event.target.checked }))} /> Bắt buộc cho readiness</label>
                  <Button type="submit" size="sm" loading={creating} disabled={!canMutate}>Tạo task</Button>
                </form>
              )}

              {selectedEvent.permissions['operations.task.assign'] && !selectedEventClosed && assignableTasks.length > 0 && people.some(person => person.serviceStatus === 'ACTIVE') && (
                <form className="space-y-3 rounded-xl border border-surface-border p-3" onSubmit={handleAssign}>
                  <h3 className="m-0 text-sm font-extrabold text-text-main">Phân Công</h3>
                  <Select aria-label="Task cần phân công" className="w-full" value={assignmentDraft.taskId} required onChange={event => setAssignmentDraft(value => ({ ...value, taskId: event.target.value }))}><option value="">Chọn task</option>{assignableTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</Select>
                  <Select aria-label="Người được phân công" className="w-full" value={assignmentDraft.personId} required onChange={event => setAssignmentDraft(value => ({ ...value, personId: event.target.value }))}><option value="">Chọn nhân sự</option>{people.filter(person => person.serviceStatus === 'ACTIVE').map(person => <option key={person.id} value={person.id}>{person.holyName ? `${person.holyName} ` : ''}{person.fullName}</option>)}</Select>
                  <Select aria-label="Vai trò phân công" className="w-full" value={assignmentDraft.role} onChange={event => setAssignmentDraft(value => ({ ...value, role: event.target.value as typeof value.role }))}><option value="OWNER">Owner</option><option value="CONTRIBUTOR">Contributor</option><option value="APPROVER">Approver</option><option value="OBSERVER">Observer</option></Select>
                  <Button type="submit" size="sm" loading={Boolean(busyTask)} disabled={!canMutate}>Giao việc</Button>
                </form>
              )}
            </div>
          </div>

        </Surface>
      )}

          {selectedTask && (
            <div className="mt-5 rounded-xl border border-surface-border p-3" aria-label="Chi tiết checklist">
              <TaskReviewPanel key={selectedTask.task.id} detail={selectedTask} enabled={canMutate} refresh={() => refreshTaskViews(selectedTask.task.id)} />
              <TaskHandoverForm key={`handover-${selectedTask.task.id}`} detail={selectedTask} people={people} enabled={canMutate} onWarnings={(taskId, items) => useOperationsStore.setState({ assignmentWarnings: { taskId, items } })} refresh={() => refreshTaskViews(selectedTask.task.id)} />
              {assignmentWarnings?.taskId === selectedTask.task.id && assignmentWarnings.items.length > 0 && <p role="status" className="text-sm text-text-main">Đã lưu phân công, nhưng người được giao có lịch bận tại hạn nhiệm vụ. Cần xác nhận lại khả năng nhận việc.</p>}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="m-0 text-sm font-extrabold text-text-main">Checklist · {selectedTask.task.title}</h3><p className="mb-0 mt-1 text-xs text-text-muted">{selectedTask.checklist.filter(item => item.isDone).length}/{selectedTask.checklist.length} mục đã xong</p></div>
                <Button variant="ghost" size="sm" onClick={() => void selectTask(null)}>Đóng checklist</Button>
              </div>
              {selectedTask.task.description && <p className="whitespace-pre-wrap text-sm text-text-main">{selectedTask.task.description}</p>}
              <p className="text-xs text-text-muted">{selectedTask.task.approvalStatus === 'PENDING' ? 'Đang chờ duyệt' : selectedTask.task.approvalStatus === 'APPROVED' ? 'Đã duyệt' : selectedTask.task.approvalStatus === 'REJECTED' ? 'Chưa được duyệt — cần chỉnh sửa' : 'Không yêu cầu duyệt'}</p>
              <div className="mt-3 divide-y divide-surface-border rounded-lg border border-surface-border">
                {selectedTask.checklist.length === 0 && <p className="m-0 px-3 py-4 text-sm text-text-muted">Chưa có mục checklist.</p>}
                {selectedTask.checklist.map(item => {
                  const canToggle = selectedTask.permissions['operations.task.execute'] || selectedTask.permissions['operations.task.manage']
                  return (
                    <label key={item.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm text-text-main">
                      <input
                        type="checkbox"
                        checked={item.isDone}
                        disabled={!canMutate || isTerminalTask(selectedTask.task.status) || !canToggle || busyTask === selectedTask.task.id}
                        onChange={() => void handleToggleChecklistItem(item)}
                      />
                      <span className={item.isDone ? 'text-text-muted line-through' : ''}>{item.label}</span>
                      {item.isRequired && <Badge tone="warning">Bắt buộc</Badge>}
                    </label>
                  )
                })}
              </div>
              {selectedTask.permissions['operations.task.manage'] && !isTerminalTask(selectedTask.task.status) && (
                <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center" onSubmit={handleAddChecklistItem}>
                  <TextInput aria-label="Mục checklist mới" className="w-full" value={checklistDraft.label} maxLength={300} required placeholder="Thêm mục cần kiểm tra" onChange={event => setChecklistDraft(value => ({ ...value, label: event.target.value }))} />
                  <label className="flex min-h-11 items-center gap-2 text-sm text-text-main"><input type="checkbox" checked={checklistDraft.isRequired} onChange={event => setChecklistDraft(value => ({ ...value, isRequired: event.target.checked }))} /> Bắt buộc</label>
                  <Button type="submit" size="sm" loading={busyTask === selectedTask.task.id} disabled={!canMutate || !checklistDraft.label.trim()}>Thêm mục</Button>
                </form>
              )}
            </div>
          )}
    </DesktopAppShell>
  )
}
