import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Clock,
  Layers,
  LayoutTemplate,
  ListTodo,
  MapPin,
  RefreshCw,
  Play,
  ShieldCheck,
  Users,
  WifiOff,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { PageHeader } from '../components/common/PageHeader'
import { EmptyState, ErrorState, SkeletonCardGrid } from '../components/common/StateFeedback'
import { ModalShell } from '../components/common/ModalShell'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import {
  Badge,
  Button,
  Select,
  Surface,
  TabPanel,
  Tabs,
  TextArea,
  TextInput,
  type SelectionItem,
} from '../components/common/ui'
import type { OperationEvent, OperationTask } from '../lib/api/operations'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useOperationsStore } from '../stores/operationsStore'
import { WorkstreamPanel } from '../components/operations/WorkstreamPanel'
import { EventReminderForm } from '../components/operations/EventReminderForm'
import { TaskReviewPanel } from '../components/operations/TaskReviewPanel'
import { TaskHandoverForm } from '../components/operations/TaskHandoverForm'
import { TaskApprovalQueue } from '../components/operations/TaskApprovalQueue'
import { AvailabilityPanel } from '../components/operations/AvailabilityPanel'
import { StandaloneWorkstreamsPanel } from '../components/operations/StandaloneWorkstreamsPanel'
import { EventRetrospectivePanel } from '../components/operations/EventRetrospectivePanel'
import { TaskRestorePanel } from '../components/operations/TaskRestorePanel'
import { EventTemplatesPanel } from '../components/operations/EventTemplatesPanel'
import { SmartEventTimePicker } from '../components/operations/SmartEventTimePicker'
import { operationCandidateValue, parseOperationCandidateValue, useOperationCandidates } from '../hooks/useOperationCandidates'

const statusLabel: Record<string, string> = {
  DRAFT: 'Bản nháp', PLANNING: 'Kế hoạch', PREPARING: 'Chuẩn bị', READY: 'Sẵn sàng', LIVE: 'Đang diễn ra', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
  BACKLOG: 'Chờ xếp việc', TODO: 'Chưa làm', IN_PROGRESS: 'Đang làm', BLOCKED: 'Bị chặn', DONE: 'Hoàn tất',
}
const isTerminalTask = (status: string) => status === 'DONE' || status === 'CANCELLED'
const isClosedEvent = (status: string) => status === 'COMPLETED' || status === 'CANCELLED'
const canCreateEventTask = (status: OperationEvent['status']) => ['DRAFT', 'PLANNING', 'PREPARING', 'READY'].includes(status)
const nextEventStatus: Partial<Record<OperationEvent['status'], OperationEvent['status']>> = {
  DRAFT: 'PLANNING', PLANNING: 'PREPARING', PREPARING: 'READY', READY: 'LIVE', LIVE: 'COMPLETED',
}
const previousEventStatus: Partial<Record<OperationEvent['status'], OperationEvent['status']>> = {
  PLANNING: 'DRAFT', PREPARING: 'PLANNING', READY: 'PREPARING', LIVE: 'READY', COMPLETED: 'LIVE',
}
const transitionLabel: Partial<Record<OperationEvent['status'], string>> = {
  PLANNING: 'Bắt đầu lập kế hoạch', PREPARING: 'Chuyển sang chuẩn bị', READY: 'Đánh dấu sẵn sàng', LIVE: 'Bắt đầu sự kiện', COMPLETED: 'Hoàn tất sự kiện',
}
const reminderKindLabel = { TASK_DUE: 'Nhắc hạn công việc', EVENT_START: 'Nhắc giờ bắt đầu sự kiện', OVERDUE: 'Công việc quá hạn' } as const
const reminderStatusLabel = { PENDING: 'Đang chờ', ENQUEUED: 'Đang gửi', SENT: 'Đã gửi', FAILED: 'Không gửi được', CANCELLED: 'Đã hủy' } as const
const taskPhaseLabel: Record<OperationTask['phase'], string> = {
  PREPARATION: 'Trước sự kiện', EXECUTION: 'Trong sự kiện', FOLLOW_UP: 'Sau sự kiện',
}

const statusTone = (status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' => {
  if (status === 'DONE' || status === 'COMPLETED' || status === 'READY') return 'success'
  if (status === 'BLOCKED' || status === 'CANCELLED') return 'danger'
  if (status === 'IN_PROGRESS' || status === 'LIVE') return 'primary'
  if (status === 'PLANNING' || status === 'PREPARING' || status === 'TODO') return 'warning'
  return 'neutral'
}

const EVENT_STEPS: Array<{ status: OperationEvent['status']; label: string }> = [
  { status: 'DRAFT', label: 'Bản nháp' },
  { status: 'PLANNING', label: 'Kế hoạch' },
  { status: 'PREPARING', label: 'Chuẩn bị' },
  { status: 'READY', label: 'Sẵn sàng' },
  { status: 'LIVE', label: 'Diễn ra' },
  { status: 'COMPLETED', label: 'Hoàn tất' },
]

type EventModalTab = 'tasks' | 'workstreams' | 'reminders' | 'templates' | 'retrospective'
type TaskStatusFilter = 'ALL' | 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'

function toIso(value: string) {
  return new Date(value).toISOString()
}
function toDateTimeInput(value: string) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default function OperationsPage() {
  const {
    events, tasks, reminders, dispatchInvitations, permissions, selectedEvent, selectedTask, detailLoading, taskDetailLoading, loading, error, source, cacheSavedAt,
    eventTotal, taskTotal, eventHasMore, taskHasMore, reminderHasMore, fetch, loadMoreEvents, loadMoreTasks, loadMoreReminders,
    createEvent, updateEvent, selectEvent, selectTask, refreshTaskViews, createTask, assignTask, dispatchTask, acceptTaskDispatch, transitionEvent, resumeEventAutomation, transitionTask, acknowledgeTask,
    addChecklistItem, toggleChecklistItem, markReminderRead, cancelReminder, assignmentWarnings,
  } = useOperationsStore()
  const isOnline = useOnlineStatus()
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [savingEvent, setSavingEvent] = useState(false)
  const [draft, setDraft] = useState({ title: '', startsAt: '', endsAt: '', eventType: 'OTHER', location: '', visibility: 'INTERNAL' as OperationEvent['visibility'] })
  const [taskDraft, setTaskDraft] = useState({ title: '', dueAt: '', scheduledStartAt: '', scheduledEndAt: '', phase: 'PREPARATION' as OperationTask['phase'], isRequired: false, workstreamId: '' })
  const [assignmentDraft, setAssignmentDraft] = useState({ taskId: '', target: '', reserveTarget: '', acknowledgeBy: '', role: 'CONTRIBUTOR' as 'OWNER' | 'CONTRIBUTOR' | 'APPROVER' | 'OBSERVER' })
  const [eventReason, setEventReason] = useState('')
  const [showCancelPrompt, setShowCancelPrompt] = useState(false)
  const [showRewindPrompt, setShowRewindPrompt] = useState(false)
  const [acceptanceWarning, setAcceptanceWarning] = useState<Array<{ id: string; label: string }> | null>(null)
  const [outcomeSummary, setOutcomeSummary] = useState('')
  const [transitioningEvent, setTransitioningEvent] = useState(false)
  const [checklistDraft, setChecklistDraft] = useState({ label: '', isRequired: false })
  const [eventModalTab, setEventModalTab] = useState<EventModalTab>('tasks')
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>('ALL')
  const [templateCatalogRevision, setTemplateCatalogRevision] = useState(0)
  const [eventEditDraft, setEventEditDraft] = useState({ title: '', eventType: 'OTHER', startsAt: '', endsAt: '', location: '', visibility: 'INTERNAL' as OperationEvent['visibility'] })

  useEffect(() => {
    if (!selectedEvent) return
    setEventEditDraft({
      title: selectedEvent.event.title,
      eventType: selectedEvent.event.eventType,
      startsAt: toDateTimeInput(selectedEvent.event.startsAt),
      endsAt: toDateTimeInput(selectedEvent.event.endsAt),
      location: selectedEvent.event.location ?? '',
      visibility: selectedEvent.event.visibility,
    })
  }, [selectedEvent])

  const handleCloseEventModal = () => {
    setShowCancelPrompt(false)
    setShowRewindPrompt(false)
    setAcceptanceWarning(null)
    setEventReason('')
    setOutcomeSummary('')
    setEventModalTab('tasks')
    setTaskStatusFilter('ALL')
    void selectEvent(null)
  }

  const hasFreshServerState = source === 'server'
  const canMutate = isOnline && hasFreshServerState
  const selectedEventClosed = selectedEvent ? isClosedEvent(selectedEvent.event.status) : false
  const closureTasks = selectedEvent?.tasks.filter(task => task.isRequired && task.status !== 'DONE') ?? []
  const closureBlockers = selectedEvent?.closure?.blockers
    ?? selectedEvent?.tasks.filter(task => task.isRequired && task.status !== 'DONE').map(task => ({ type: 'TASK_INCOMPLETE', id: task.id, label: task.title }))
    ?? []
  const assignableTasks = selectedEvent?.tasks.filter(task => !isTerminalTask(task.status)) ?? []
  const assignmentDirectory = useOperationCandidates(assignmentDraft.taskId ? { taskId: assignmentDraft.taskId } : null, Boolean(canMutate && selectedEvent?.permissions['operations.task.assign'] && assignmentDraft.taskId))
  const assignmentCandidates = assignmentDirectory.candidates.filter(candidate => candidate.eligibility !== 'INELIGIBLE')
  const actionableDispatchCandidates = assignmentDirectory.candidates.filter(candidate => candidate.eligibility === 'ACTIONABLE')

  const completedTasksCount = selectedEvent?.tasks.filter(t => t.status === 'DONE').length ?? 0
  const totalTasksCount = selectedEvent?.tasks.length ?? 0
  const totalAssigneesCount = selectedEvent?.assignees.length ?? 0
  const totalWorkstreamsCount = selectedEvent?.workstreams.length ?? 0
  const currentStepIndex = selectedEvent ? (
    selectedEvent.event.status === 'CANCELLED'
      ? -1
      : EVENT_STEPS.findIndex(s => s.status === selectedEvent.event.status)
  ) : -1

  const filteredTasks = selectedEvent?.tasks.filter(t => {
    if (taskStatusFilter === 'ALL') return true
    return t.status === taskStatusFilter
  }) ?? []
  const taskScheduleInvalid = Boolean(
    (taskDraft.scheduledStartAt && !taskDraft.scheduledEndAt)
    || (!taskDraft.scheduledStartAt && taskDraft.scheduledEndAt)
    || (taskDraft.scheduledStartAt && taskDraft.scheduledEndAt && taskDraft.scheduledEndAt <= taskDraft.scheduledStartAt),
  )

  const modalTabs: SelectionItem<EventModalTab>[] = selectedEvent ? [
    {
      value: 'tasks',
      label: (
        <span className="flex items-center gap-1.5">
          <span>Nhiệm vụ &amp; Phân công</span>
          <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-xs font-bold text-text-muted">
            {selectedEvent.tasks.length}
          </span>
        </span>
      ),
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      value: 'workstreams',
      label: (
        <span className="flex items-center gap-1.5">
          <span>Nhóm công tác</span>
          <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-xs font-bold text-text-muted">
            {selectedEvent.workstreams.length}
          </span>
        </span>
      ),
      icon: <Layers className="h-4 w-4" />,
    },
    {
      value: 'reminders',
      label: <span>Lập lịch nhắc việc</span>,
      icon: <Bell className="h-4 w-4" />,
    },
    {
      value: 'templates',
      label: <span>Mẫu</span>,
      icon: <LayoutTemplate className="h-4 w-4" />,
    },
    ...(selectedEvent.event.status === 'COMPLETED' ? [{
      value: 'retrospective' as EventModalTab,
      label: <span>Đúc kết sau sự kiện</span>,
      icon: <CheckCircle2 className="h-4 w-4" />,
    }] : []),
  ] : []

  const taskFilterOptions: Array<{ key: TaskStatusFilter; label: string; count: number }> = selectedEvent ? [
    { key: 'ALL', label: 'Tất cả', count: selectedEvent.tasks.length },
    { key: 'TODO', label: 'Chưa làm', count: selectedEvent.tasks.filter(t => t.status === 'TODO').length },
    { key: 'IN_PROGRESS', label: 'Đang làm', count: selectedEvent.tasks.filter(t => t.status === 'IN_PROGRESS').length },
    { key: 'DONE', label: 'Hoàn tất', count: selectedEvent.tasks.filter(t => t.status === 'DONE').length },
    { key: 'BLOCKED', label: 'Bị chặn', count: selectedEvent.tasks.filter(t => t.status === 'BLOCKED').length },
  ] : []

  useEffect(() => { void fetch().catch(() => undefined) }, [fetch])

  type MyTaskFilter = 'ALL' | 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'DONE'
  type UtilityTab = 'availability' | 'workstreams' | 'templates'

  const [myTaskFilter, setMyTaskFilter] = useState<MyTaskFilter>('ALL')
  const [utilityTab, setUtilityTab] = useState<UtilityTab>('availability')

  const pendingAcknowledgements = useMemo(() => tasks.filter(task => !isTerminalTask(task.status) && task.myAssignments?.some(assignment => assignment.acknowledgementStatus === 'PENDING')).length, [tasks])
  const pendingResponses = pendingAcknowledgements + dispatchInvitations.length
  const blockedTasksCount = useMemo(() => tasks.filter(task => task.status === 'BLOCKED').length, [tasks])
  const activeTasksCount = useMemo(() => tasks.filter(task => task.status === 'IN_PROGRESS' || task.status === 'TODO').length, [tasks])

  const myTaskFilterOptions: Array<{ key: MyTaskFilter; label: string; count: number }> = [
    { key: 'ALL', label: 'Tất cả', count: tasks.length },
    { key: 'PENDING', label: 'Cần xác nhận', count: pendingResponses },
    { key: 'ACTIVE', label: 'Đang làm', count: activeTasksCount },
    { key: 'BLOCKED', label: 'Bị chặn', count: blockedTasksCount },
    { key: 'DONE', label: 'Đã xong', count: tasks.filter(t => t.status === 'DONE').length },
  ]

  const filteredMyTasks = useMemo(() => {
    return tasks.filter(task => {
      if (myTaskFilter === 'PENDING') {
        return !isTerminalTask(task.status) && task.myAssignments?.some(a => a.acknowledgementStatus === 'PENDING')
      }
      if (myTaskFilter === 'ACTIVE') {
        return task.status === 'IN_PROGRESS' || task.status === 'TODO'
      }
      if (myTaskFilter === 'BLOCKED') {
        return task.status === 'BLOCKED'
      }
      if (myTaskFilter === 'DONE') {
        return task.status === 'DONE'
      }
      return true
    })
  }, [tasks, myTaskFilter])

  const utilityTabs: SelectionItem<UtilityTab>[] = [
    {
      value: 'availability',
      label: <span>Lịch bận nhân sự</span>,
      icon: <CalendarClock className="h-4 w-4" />,
    },
    {
      value: 'workstreams',
      label: <span>Nhóm công tác độc lập</span>,
      icon: <Users className="h-4 w-4" />,
    },
    {
      value: 'templates',
      label: <span>Thư viện mẫu sự kiện</span>,
      icon: <LayoutTemplate className="h-4 w-4" />,
    },
  ]

  const overviewCards: Array<{
    label: string
    sublabel: string
    value: number
    Icon: LucideIcon
    tone: 'primary' | 'teal' | 'warning' | 'danger'
    filterKey?: MyTaskFilter
  }> = [
    {
      label: 'Sự kiện',
      sublabel: `${events.filter(e => e.status !== 'COMPLETED' && e.status !== 'CANCELLED').length} đang hoạt động`,
      value: eventTotal,
      Icon: Calendar,
      tone: 'primary',
    },
    {
      label: 'Việc của tôi',
      sublabel: `${activeTasksCount} đang thực hiện`,
      value: taskTotal,
      Icon: ShieldCheck,
      tone: 'teal',
      filterKey: 'ALL',
    },
    {
      label: 'Chờ phản hồi',
      sublabel: pendingResponses > 0 ? 'Cần phản hồi ngay' : 'Đã phản hồi hết',
      value: pendingResponses,
      Icon: CircleAlert,
      tone: 'warning',
      filterKey: 'PENDING',
    },
    {
      label: 'Đang bị chặn',
      sublabel: blockedTasksCount > 0 ? 'Cần tháo gỡ điểm nghẽn' : 'Không có điểm nghẽn',
      value: blockedTasksCount,
      Icon: AlertTriangle,
      tone: 'danger',
      filterKey: 'BLOCKED',
    },
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
    if (!draft.title || !draft.startsAt || !draft.endsAt || draft.endsAt <= draft.startsAt) return
    setCreating(true)
    try {
      await createEvent({
        title: draft.title,
        eventType: draft.eventType,
        startsAt: toIso(draft.startsAt),
        endsAt: toIso(draft.endsAt),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
        location: draft.location.trim() || null,
        visibility: draft.visibility,
      })
      setDraft({ title: '', startsAt: '', endsAt: '', eventType: 'OTHER', location: '', visibility: 'INTERNAL' })
      setShowCreate(false)
    } catch {
      // Store provides the user-facing failure.
    } finally { setCreating(false) }
  }

  const handleUpdateEvent = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedEvent || selectedEventClosed || !eventEditDraft.title.trim() || !eventEditDraft.startsAt || !eventEditDraft.endsAt || eventEditDraft.endsAt <= eventEditDraft.startsAt) return
    setSavingEvent(true)
    try {
      await updateEvent(selectedEvent.event.id, {
        version: selectedEvent.event.version,
        title: eventEditDraft.title.trim(),
        eventType: eventEditDraft.eventType,
        startsAt: toIso(eventEditDraft.startsAt),
        endsAt: toIso(eventEditDraft.endsAt),
        timezone: selectedEvent.event.timezone,
        location: eventEditDraft.location.trim() || null,
        visibility: eventEditDraft.visibility,
      })
      await selectEvent(selectedEvent.event.id)
    } catch {
      // Store provides the visible failure.
    } finally { setSavingEvent(false) }
  }

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedEvent || !canCreateEventTask(selectedEvent.event.status) || !taskDraft.title || taskScheduleInvalid) return
    setCreating(true)
    try {
      const workstreamId = selectedEvent.workstreams.some(group => group.id === taskDraft.workstreamId) ? taskDraft.workstreamId : null
      await createTask({
        title: taskDraft.title,
        eventId: selectedEvent.event.id,
        workstreamId,
        dueAt: taskDraft.dueAt ? toIso(taskDraft.dueAt) : null,
        scheduledStartAt: taskDraft.scheduledStartAt ? toIso(taskDraft.scheduledStartAt) : null,
        scheduledEndAt: taskDraft.scheduledEndAt ? toIso(taskDraft.scheduledEndAt) : null,
        phase: taskDraft.phase,
        isRequired: taskDraft.isRequired,
      })
      setTaskDraft({ title: '', dueAt: '', scheduledStartAt: '', scheduledEndAt: '', phase: 'PREPARATION', isRequired: false, workstreamId: '' })
      await selectEvent(selectedEvent.event.id)
    } catch {
      // Store provides the visible failure.
    } finally { setCreating(false) }
  }

  const handleAssign = async (event: React.FormEvent) => {
    event.preventDefault()
    const task = selectedEvent?.tasks.find(item => item.id === assignmentDraft.taskId)
    const target = parseOperationCandidateValue(assignmentDraft.target)
    const reserve = assignmentDraft.reserveTarget ? parseOperationCandidateValue(assignmentDraft.reserveTarget) : null
    if (!task || selectedEventClosed || isTerminalTask(task.status) || !target) return
    if (assignmentDraft.role === 'OWNER' && (!assignmentDraft.acknowledgeBy || (assignmentDraft.reserveTarget && !reserve))) return
    setBusyTask(task.id)
    try {
      if (assignmentDraft.role === 'OWNER') await dispatchTask(task, target, reserve, toIso(assignmentDraft.acknowledgeBy))
      else await assignTask(task, target, assignmentDraft.role)
      setAssignmentDraft({ taskId: '', target: '', reserveTarget: '', acknowledgeBy: '', role: 'CONTRIBUTOR' })
      await selectEvent(selectedEvent!.event.id)
    } catch {
      // Store provides the visible failure, including conflict warnings/errors.
    } finally { setBusyTask(null) }
  }

  const handleEventTransition = async (status: OperationEvent['status'], override = false) => {
    if (!selectedEvent || selectedEvent.event.status === 'CANCELLED' || !canMutate) return
    const currentIndex = EVENT_STEPS.findIndex(step => step.status === selectedEvent.event.status)
    const targetIndex = EVENT_STEPS.findIndex(step => step.status === status)
    const backwards = currentIndex >= 0 && targetIndex >= 0 && targetIndex < currentIndex
    const requiresReason = status === 'CANCELLED' || backwards
    const requiresOutcome = status === 'COMPLETED'
    if ((requiresReason && !eventReason.trim()) || (requiresOutcome && !outcomeSummary.trim())) return
    setTransitioningEvent(true)
    try {
      await transitionEvent(selectedEvent.event.id, status, selectedEvent.event.version, {
        reason: eventReason.trim() || undefined,
        outcomeSummary: outcomeSummary.trim() || undefined,
        ...(override ? { override: true } : {}),
      })
      setEventReason('')
      setShowCancelPrompt(false)
      setShowRewindPrompt(false)
      setAcceptanceWarning(null)
      setOutcomeSummary('')
      await selectEvent(selectedEvent.event.id)
    } catch (error) {
      if ((error as { code?: string })?.code === 'TASK_ACCEPTANCE_PENDING') {
        const details = (error as { details?: Array<{ id: string; label: string }> }).details
        setAcceptanceWarning(Array.isArray(details) ? details : [])
      }
      // Store owns OCC/readiness/API errors and keeps the detail visible.
    } finally { setTransitioningEvent(false) }
  }

  const handleResumeAutomation = async () => {
    if (!selectedEvent?.event.automationPaused || !canMutate) return
    setTransitioningEvent(true)
    try {
      await resumeEventAutomation(selectedEvent.event.id, selectedEvent.event.version, 'Người quản lý chủ động tiếp tục tự động chuyển giai đoạn.')
      await selectEvent(selectedEvent.event.id)
    } catch {
      // Store owns OCC/API errors.
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

  const renderTaskChecklist = () => {
    if (!selectedTask) return null
    return (
      <div className="mt-5 rounded-xl border border-surface-border p-3" aria-label="Chi tiết checklist">
        <TaskRestorePanel key={`restore-${selectedTask.task.id}-${selectedTask.task.version}`} detail={selectedTask} enabled={canMutate} refresh={() => refreshTaskViews(selectedTask.task.id)} />
        <TaskReviewPanel key={selectedTask.task.id} detail={selectedTask} enabled={canMutate} refresh={() => refreshTaskViews(selectedTask.task.id)} />
        <TaskHandoverForm key={`handover-${selectedTask.task.id}`} detail={selectedTask} enabled={canMutate} onWarnings={(taskId, items) => useOperationsStore.setState({ assignmentWarnings: { taskId, items } })} refresh={() => refreshTaskViews(selectedTask.task.id)} />
        {assignmentWarnings?.taskId === selectedTask.task.id && assignmentWarnings.items.length > 0 && (
          <p role="status" className="text-sm text-text-main">
            Đã lưu phân công, nhưng người được giao có lịch bận tại hạn nhiệm vụ. Cần xác nhận lại khả năng nhận việc.
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-sm font-extrabold text-text-main">Checklist · {selectedTask.task.title}</h3>
            <p className="mb-0 mt-1 text-xs text-text-muted">{taskPhaseLabel[selectedTask.task.phase]} · {selectedTask.checklist.filter(item => item.isDone).length}/{selectedTask.checklist.length} mục đã xong</p>
          </div>
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
    )
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
                Tạo sự kiện mới
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
        <Surface as="section" variant="card" className="p-4 sm:p-5 rounded-2xl border-2 border-parish-primary/20 shadow-sm space-y-4" aria-label="Tạo sự kiện mới">
          <div className="flex items-center justify-between border-b border-surface-border pb-3">
            <div className="flex items-center gap-2.5">
              <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                <CalendarPlus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="m-0 text-base font-extrabold text-text-main">Khởi Tạo Sự Kiện Mới</h3>
                <p className="m-0 text-xs text-text-muted">Tạo một lần tại Operations; sự kiện công khai sẽ tự xuất hiện trên Lịch.</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Đóng</Button>
          </div>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreate}>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-semibold text-text-main">Hiển thị sự kiện</legend>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Hiển thị sự kiện">
                <Button type="button" variant={draft.visibility === 'INTERNAL' ? 'primary' : 'secondary'} size="sm" onClick={() => setDraft(value => ({ ...value, visibility: 'INTERNAL' }))}>Nội bộ</Button>
                <Button type="button" variant={draft.visibility === 'PUBLIC_SUMMARY' ? 'primary' : 'secondary'} size="sm" disabled={!permissions['operations.event.publish_public']} title={!permissions['operations.event.publish_public'] ? 'Chỉ Trưởng Xứ đoàn được công khai sự kiện.' : undefined} onClick={() => setDraft(value => ({ ...value, visibility: 'PUBLIC_SUMMARY' }))}>Công khai</Button>
              </div>
              <p className="mb-0 mt-1 text-xs text-text-muted">{permissions['operations.event.publish_public'] ? 'Công khai tự sinh mục Lịch và thông báo phụ huynh.' : 'Bạn chỉ được tạo sự kiện nội bộ trong phạm vi phụ trách; Trưởng Xứ đoàn duyệt việc công khai.'} Task, phân công, readiness và hậu kiểm không bao giờ xuất hiện trên Lịch.</p>
            </fieldset>
            <label className="sm:col-span-2 text-sm font-semibold text-text-main">
              Tên sự kiện
              <TextInput className="mt-1 w-full" value={draft.title} maxLength={draft.visibility === 'PUBLIC_SUMMARY' ? 200 : 300} required onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} />
            </label>
            <label className="text-sm font-semibold text-text-main">Loại sự kiện
              <Select className="mt-1 w-full" value={draft.eventType} onChange={event => setDraft(value => ({ ...value, eventType: event.target.value }))}>
                <option value="FEAST_DAY">Lễ / Bổn mạng</option><option value="CAMP">Trại / Sa mạc</option><option value="TRAINING">Huấn luyện</option><option value="SACRAMENT">Bí tích</option><option value="RETREAT">Tĩnh tâm</option><option value="MEETING">Họp</option><option value="OTHER">Khác</option>
              </Select>
            </label>
            <label className="text-sm font-semibold text-text-main">Địa điểm
              <TextInput className="mt-1 w-full" value={draft.location} maxLength={draft.visibility === 'PUBLIC_SUMMARY' ? 200 : 300} onChange={event => setDraft(value => ({ ...value, location: event.target.value }))} />
            </label>
            <SmartEventTimePicker
              className="sm:col-span-2"
              startsAt={draft.startsAt}
              endsAt={draft.endsAt}
              eventType={draft.eventType}
              required
              idPrefix="create-event"
              onChange={({ startsAt, endsAt }) => setDraft(value => ({ ...value, startsAt, endsAt }))}
            />
            <div className="sm:col-span-2 flex justify-end gap-2 pt-2 border-t border-surface-border">
              <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Hủy</Button>
              <Button type="submit" size="sm" loading={creating} disabled={!canMutate || !draft.title.trim() || !draft.startsAt || !draft.endsAt || draft.endsAt <= draft.startsAt}>Lưu bản nháp</Button>
            </div>
          </form>
        </Surface>
      )}

      {/* 1. EXECUTIVE KPI STRIP */}
      <section aria-label="Tổng quan công việc" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {overviewCards.map(({ label, sublabel, value, Icon, tone, filterKey }) => (
          <Surface
            key={label}
            variant="card"
            className={`p-4 rounded-2xl border transition-colors shadow-xs ${
              filterKey && myTaskFilter === filterKey
                ? 'border-parish-primary ring-2 ring-parish-primary/20 bg-parish-primary-light/10'
                : 'border-surface-border hover:border-surface-border/80'
            } ${filterKey ? 'cursor-pointer' : ''}`}
            onClick={() => {
              if (filterKey) setMyTaskFilter(filterKey)
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">{label}</span>
              <div className={`icon-container rounded-xl ${
                tone === 'primary' ? 'bg-parish-primary-light text-parish-primary' :
                tone === 'teal' ? 'bg-parish-success-bg text-parish-success' :
                tone === 'warning' ? 'bg-parish-warning-bg text-parish-warning' :
                'bg-parish-danger-bg text-parish-danger'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mb-0 mt-2 text-2xl font-black text-text-main">{value}</p>
            <p className="mb-0 mt-1 text-xs text-text-muted">{sublabel}</p>
          </Surface>
        ))}
      </section>

      {/* 2. KHÔNG GIAN ĐIỀU HÀNH 2 CỘT */}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        {/* CỘT 1: SỰ KIỆN & CÔNG VIỆC ĐANG DIỄN RA */}
        <Surface as="section" variant="card" className="overflow-hidden rounded-2xl border border-surface-border shadow-xs flex flex-col">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3.5 bg-surface-ground/30">
            <div className="flex items-center gap-2">
              <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <h2 className="m-0 text-sm font-extrabold text-text-main">Sự Kiện &amp; Công Việc Đang Diễn Ra</h2>
                <p className="m-0 text-xs text-text-muted">{events.length} sự kiện trong phạm vi điều phối</p>
              </div>
            </div>
            <Badge tone="primary">{events.length}</Badge>
          </div>

          <div className="divide-y divide-surface-border flex-1">
            {events.length === 0 && (
              <div className="p-8">
                <EmptyState
                  icon={Calendar}
                  title="Chưa có sự kiện nào"
                  description="Hiện không có sự kiện hoạt động nào trong phạm vi quản lý của bạn."
                />
              </div>
            )}
            {events.map(event => (
              <article
                key={event.id}
                tabIndex={0}
                className="group p-4 cursor-pointer transition-colors hover:bg-surface-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parish-primary"
                onClick={() => {
                  if (!isOnline || source === 'cache') return
                  void selectEvent(event.id).catch(() => undefined)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (!isOnline || source === 'cache') return
                    void selectEvent(event.id).catch(() => undefined)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0 truncate text-sm font-bold text-text-main group-hover:text-parish-primary transition-colors">
                        {event.title}
                      </h3>
                      <Badge tone={statusTone(event.status)}>{statusLabel[event.status] || event.status}</Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-text-muted" />
                        {new Date(event.startsAt).toLocaleString('vi-VN')}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-text-muted" />
                        {event.location || 'Chưa có địa điểm'}
                      </span>
                    </div>

                    {event.sourceParishEventId && (
                      <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-parish-primary-light/50 px-2 py-0.5 text-xs font-semibold text-parish-primary">
                        <CalendarClock className="h-3 w-3" />
                        Liên kết Lịch Xứ Đoàn
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 group-hover:bg-parish-primary group-hover:text-white transition-colors"
                    disabled={!isOnline || source === 'cache'}
                    loading={detailLoading && selectedEvent?.event.id === event.id}
                    onClick={e => {
                      e.stopPropagation()
                      void selectEvent(event.id).catch(() => undefined)
                    }}
                  >
                    Xem chi tiết
                  </Button>
                </div>
              </article>
            ))}
            {eventHasMore && (
              <div className="p-3 text-center bg-surface-ground/20">
                <Button variant="secondary" size="sm" disabled={!isOnline || source !== 'server' || loading} onClick={() => void loadMoreEvents().catch(() => undefined)}>
                  Tải thêm sự kiện
                </Button>
              </div>
            )}
          </div>
        </Surface>

        {/* CỘT 2: VIỆC CỦA TÔI */}
        <Surface as="section" variant="card" className="overflow-hidden rounded-2xl border border-surface-border shadow-xs flex flex-col">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3.5 bg-surface-ground/30">
            <div className="flex items-center gap-2">
              <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h2 className="m-0 text-sm font-extrabold text-text-main">Việc Của Tôi</h2>
                <p className="m-0 text-xs text-text-muted">{tasks.length} nhiệm vụ được giao cho bạn</p>
              </div>
            </div>
            <Badge tone="neutral">{filteredMyTasks.length}/{tasks.length}</Badge>
          </div>

          {dispatchInvitations.length > 0 && (
            <div className="space-y-2 border-b border-surface-border bg-parish-warning-bg p-3" aria-label="Lời mời nhận nhiệm vụ">
              <p className="m-0 text-xs font-extrabold text-text-main">Lời mời phụ trách đang chờ</p>
              {dispatchInvitations.map(invitation => (
                <div key={invitation.id} className="flex flex-col gap-2 rounded-xl border border-parish-warning/30 bg-surface-card p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-bold text-text-main">{invitation.taskTitle}</p>
                    <p className="m-0 text-xs text-text-muted">
                      {invitation.eventTitle} · {invitation.target === 'PRIMARY' ? 'Người chính' : 'Người dự bị'} · phản hồi trước {new Date(invitation.acknowledgeBy).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!canMutate || busyTask === invitation.id}
                    loading={busyTask === invitation.id}
                    onClick={() => {
                      setBusyTask(invitation.id)
                      void acceptTaskDispatch(invitation).catch(() => undefined).finally(() => setBusyTask(null))
                    }}
                  >
                    Nhận nhiệm vụ
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Quick Filter Chips */}
          <div className="flex flex-wrap gap-1 px-3 py-2 bg-surface-ground/40 border-b border-surface-border">
            {myTaskFilterOptions.map(opt => (
              <button
                key={opt.key}
                type="button"
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors mobile-touch-target ${
                  myTaskFilter === opt.key
                    ? 'bg-parish-primary text-white shadow-xs'
                    : 'bg-surface-card text-text-muted hover:text-text-main border border-surface-border hover:bg-surface-hover'
                }`}
                onClick={() => setMyTaskFilter(opt.key)}
              >
                {opt.label} ({opt.count})
              </button>
            ))}
          </div>

          <div className="divide-y divide-surface-border flex-1">
            {filteredMyTasks.length === 0 && (
              <div className="p-8">
                <EmptyState
                  icon={ShieldCheck}
                  title="Không có công việc nào"
                  description={myTaskFilter === 'ALL' ? 'Bạn chưa có nhiệm vụ nào được giao.' : 'Không có công việc nào trong trạng thái đã chọn.'}
                />
              </div>
            )}
            {filteredMyTasks.map(task => {
              const mutable = !isTerminalTask(task.status)
              const hasPending = mutable && task.myAssignments?.some(assignment => assignment.acknowledgementStatus === 'PENDING')
              const canExecute = task.myAssignments?.some(assignment =>
                assignment.acknowledgementStatus === 'ACCEPTED'
                && (assignment.assignmentRole === 'OWNER' || assignment.assignmentRole === 'CONTRIBUTOR'))
              return (
                <article key={task.id} className="p-4 transition-colors hover:bg-surface-hover/30">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {task.status === 'DONE' ? (
                        <div className="rounded-full bg-parish-success-bg p-1 text-parish-success">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                      ) : task.status === 'BLOCKED' ? (
                        <div className="rounded-full bg-parish-danger-bg p-1 text-parish-danger">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="rounded-full bg-parish-primary-light p-1 text-parish-primary">
                          <CircleAlert className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="m-0 text-sm font-bold text-text-main">{task.title}</h3>
                          {task.isRequired && <Badge tone="warning">Bắt buộc</Badge>}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Badge tone="neutral">{taskPhaseLabel[task.phase]}</Badge>
                          <Badge tone={statusTone(task.status)}>{statusLabel[task.status] || task.status}</Badge>
                        </div>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {task.scheduledStartAt && task.scheduledEndAt
                            ? `Ca: ${new Date(task.scheduledStartAt).toLocaleString('vi-VN')} – ${new Date(task.scheduledEndAt).toLocaleString('vi-VN')}`
                            : task.dueAt ? `Hạn: ${new Date(task.dueAt).toLocaleString('vi-VN')}` : 'Chưa có lịch'}
                        </span>
                        {task.scheduledStartAt && task.scheduledEndAt && task.dueAt && <span>Hạn: {new Date(task.dueAt).toLocaleString('vi-VN')}</span>}
                      </div>

                      {task.blockedReason && (
                        <div className="mt-2 rounded-lg border border-parish-danger/30 bg-parish-danger-bg p-2 text-xs text-parish-danger">
                          <span className="font-bold">Điểm nghẽn:</span> {task.blockedReason}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!isOnline || source !== 'server' || taskDetailLoading}
                          onClick={() => void selectTask(task.id).catch(() => undefined)}
                        >
                          Chi tiết nhiệm vụ
                        </Button>
                        {canExecute && mutable && (
                          <Button
                            size="sm"
                            disabled={!canMutate || busyTask === task.id}
                            onClick={() => void handleTask(task, 'DONE')}
                          >
                            Hoàn tất
                          </Button>
                        )}
                        {hasPending && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!canMutate || busyTask === task.id}
                            onClick={() => void handleTask(task, 'ACCEPTED')}
                          >
                            Nhận việc
                          </Button>
                        )}
                        {hasPending && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={!canMutate || busyTask === task.id}
                            onClick={() => void handleTask(task, 'DECLINED')}
                          >
                            Từ chối
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
            {taskHasMore && (
              <div className="p-3 text-center bg-surface-ground/20">
                <Button variant="secondary" size="sm" disabled={!isOnline || source !== 'server' || loading} onClick={() => void loadMoreTasks().catch(() => undefined)}>
                  Tải thêm công việc
                </Button>
              </div>
            )}
          </div>
        </Surface>
      </div>

      {/* 3. KHU VỰC PHÊ DUYỆT & HỘP NHẮC VIỆC */}
      <Surface as="section" variant="card" className="overflow-hidden rounded-2xl border border-surface-border shadow-xs" aria-label="Hộp nhắc việc">
        <TaskApprovalQueue enabled={canMutate} openTask={selectTask} />
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3.5 bg-surface-ground/30">
          <div className="flex items-center gap-2">
            <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h2 className="m-0 text-sm font-extrabold text-text-main">Hộp Nhắc Việc</h2>
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
          {reminders.map(reminder => (
            <article
              key={reminder.id}
              data-reminder-id={reminder.id}
              className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors ${
                reminder.readAt ? 'hover:bg-surface-hover/30' : 'bg-parish-primary-light/30 border-l-4 border-parish-primary'
              }`}
            >
              <div>
                <p className="m-0 text-sm font-bold text-text-main">{reminderKindLabel[reminder.kind]}</p>
                <p className="mb-0 mt-1 text-xs text-text-muted">
                  {new Date(reminder.triggerAt).toLocaleString('vi-VN')} · {reminderStatusLabel[reminder.status]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {reminder.readAt ? (
                  <Badge tone="neutral">Đã đọc</Badge>
                ) : (
                  <Button variant="secondary" size="sm" disabled={!canMutate} onClick={() => void markReminderRead(reminder).catch(() => undefined)}>
                    Đánh dấu đã đọc
                  </Button>
                )}
                {reminder.status === 'PENDING' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canMutate || busyTask === reminder.id}
                    onClick={() => {
                      setBusyTask(reminder.id)
                      void cancelReminder(reminder).catch(() => undefined).finally(() => setBusyTask(null))
                    }}
                  >
                    Hủy lịch nhắc
                  </Button>
                )}
              </div>
            </article>
          ))}
          {reminderHasMore && (
            <div className="p-3 text-center bg-surface-ground/20">
              <Button variant="secondary" size="sm" disabled={!isOnline || source !== 'server' || loading} onClick={() => void loadMoreReminders().catch(() => undefined)}>
                Tải thêm nhắc việc
              </Button>
            </div>
          )}
        </div>
      </Surface>

      {/* 4. TIỆN ÍCH ĐIỀU HÀNH CHUYÊN SÂU (TABS) */}
      <Surface as="section" variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border shadow-xs space-y-4" aria-label="Tiện ích điều hành">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="m-0 text-base font-extrabold text-text-main">Tiện Ích &amp; Công Cụ Điều Hành</h2>
              <p className="m-0 text-xs text-text-muted">Quản lý lịch bận cá nhân, cơ cấu ban/nhóm công tác và thư viện mẫu quy chuẩn</p>
            </div>
          </div>
        </div>

        <Tabs
          id="operational-utility-tabs"
          ariaLabel="Phân khu tiện ích điều hành"
          items={utilityTabs}
          value={utilityTab}
          onValueChange={setUtilityTab}
        />

        <TabPanel tabsId="operational-utility-tabs" value="availability" activeValue={utilityTab}>
          <AvailabilityPanel enabled={canMutate} />
        </TabPanel>

        <TabPanel tabsId="operational-utility-tabs" value="workstreams" activeValue={utilityTab}>
          <StandaloneWorkstreamsPanel enabled={canMutate} />
        </TabPanel>

        <TabPanel tabsId="operational-utility-tabs" value="templates" activeValue={utilityTab}>
          <EventTemplatesPanel
            mode="catalog"
            enabled={canMutate}
            sourceEvent={null}
            canPublishPublic={Boolean(permissions['operations.event.publish_public'])}
            refreshToken={templateCatalogRevision}
            onEventCreated={async eventId => {
              await fetch()
              await selectEvent(eventId)
            }}
          />
        </TabPanel>
      </Surface>

      {selectedEvent && (
        <ModalShell
          isOpen={Boolean(selectedEvent)}
          onClose={handleCloseEventModal}
          title={selectedEvent.event.title}
          subtitle={`${new Date(selectedEvent.event.startsAt).toLocaleString('vi-VN')} · ${selectedEvent.event.location || 'Chưa có địa điểm'} · Tiến độ chuẩn bị ${selectedEvent.readiness.percent}%`}
          icon={<CalendarClock aria-hidden="true" className="h-5 w-5 text-parish-primary" />}
          headerActions={
            <Badge tone={statusTone(selectedEvent.event.status)} className="font-bold text-xs uppercase">
              {statusLabel[selectedEvent.event.status] || selectedEvent.event.status}
            </Badge>
          }
          maxWidth="1040px"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCloseEventModal}
              >
                Đóng chi tiết
              </Button>
            </div>
          }
        >
          <div className="space-y-5" aria-label="Chi tiết sự kiện">
            {selectedEvent.permissions['operations.event.manage'] && !selectedEventClosed && selectedEvent.event.status !== 'LIVE' && (selectedEvent.event.visibility !== 'PUBLIC_SUMMARY' || selectedEvent.permissions['operations.event.publish_public']) && (
              <form className="rounded-2xl border border-surface-border bg-surface-card p-4 space-y-3 shadow-xs" aria-label="Sửa thông tin sự kiện" onSubmit={handleUpdateEvent}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="m-0 text-sm font-extrabold text-text-main">Thông tin sự kiện</h3>
                    <p className="mb-0 mt-1 text-xs text-text-muted">Operations là nơi duy nhất sửa dữ liệu; Lịch chỉ hiển thị bản chiếu công khai.</p>
                  </div>
                  <Badge tone={eventEditDraft.visibility === 'PUBLIC_SUMMARY' ? 'success' : 'neutral'}>{eventEditDraft.visibility === 'PUBLIC_SUMMARY' ? 'Công khai' : 'Nội bộ'}</Badge>
                </div>
                <fieldset>
                  <legend className="mb-1 text-sm font-semibold text-text-main">Hiển thị sự kiện</legend>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sửa hiển thị sự kiện">
                    <Button type="button" variant={eventEditDraft.visibility === 'INTERNAL' ? 'primary' : 'secondary'} size="sm" disabled={savingEvent || !selectedEvent.permissions['operations.event.create']} onClick={() => setEventEditDraft(value => ({ ...value, visibility: 'INTERNAL' }))}>Nội bộ</Button>
                    <Button type="button" variant={eventEditDraft.visibility === 'PUBLIC_SUMMARY' ? 'primary' : 'secondary'} size="sm" disabled={savingEvent || !selectedEvent.permissions['operations.event.publish_public']} title={!selectedEvent.permissions['operations.event.publish_public'] ? 'Chỉ Trưởng Xứ đoàn được công khai sự kiện.' : undefined} onClick={() => setEventEditDraft(value => ({ ...value, visibility: 'PUBLIC_SUMMARY' }))}>Công khai</Button>
                  </div>
                  <p className="mb-0 mt-1 text-xs text-text-muted">Bật Công khai sẽ tự tạo/cập nhật Lịch và xếp thông báo phụ huynh; dữ liệu vận hành vẫn nội bộ.</p>
                </fieldset>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-text-main sm:col-span-2">Tên sự kiện
                    <TextInput className="mt-1 w-full" value={eventEditDraft.title} required maxLength={eventEditDraft.visibility === 'PUBLIC_SUMMARY' ? 200 : 300} disabled={savingEvent} onChange={event => setEventEditDraft(value => ({ ...value, title: event.target.value }))} />
                  </label>
                  <label className="text-sm font-semibold text-text-main">Loại sự kiện
                    <Select className="mt-1 w-full" value={eventEditDraft.eventType} disabled={savingEvent} onChange={event => setEventEditDraft(value => ({ ...value, eventType: event.target.value }))}>
                      <option value="FEAST_DAY">Lễ / Bổn mạng</option><option value="CAMP">Trại / Sa mạc</option><option value="TRAINING">Huấn luyện</option><option value="SACRAMENT">Bí tích</option><option value="RETREAT">Tĩnh tâm</option><option value="MEETING">Họp</option><option value="OTHER">Khác</option>
                    </Select>
                  </label>
                  <label className="text-sm font-semibold text-text-main">Địa điểm
                    <TextInput className="mt-1 w-full" value={eventEditDraft.location} maxLength={eventEditDraft.visibility === 'PUBLIC_SUMMARY' ? 200 : 300} disabled={savingEvent} onChange={event => setEventEditDraft(value => ({ ...value, location: event.target.value }))} />
                  </label>
                  <SmartEventTimePicker
                    className="sm:col-span-2"
                    startsAt={eventEditDraft.startsAt}
                    endsAt={eventEditDraft.endsAt}
                    eventType={eventEditDraft.eventType}
                    disabled={savingEvent}
                    required
                    idPrefix="edit-event"
                    onChange={({ startsAt, endsAt }) => setEventEditDraft(value => ({ ...value, startsAt, endsAt }))}
                  />
                </div>
                <div className="flex justify-end"><Button type="submit" size="sm" loading={savingEvent} disabled={!canMutate || !eventEditDraft.title.trim() || !eventEditDraft.startsAt || !eventEditDraft.endsAt || eventEditDraft.endsAt <= eventEditDraft.startsAt}>Lưu thay đổi</Button></div>
              </form>
            )}
            {/* 1. KHỐI TIẾN TRÌNH VÒNG ĐỜI & SẴN SÀNG (LIFECYCLE HUB) */}
            <div className="rounded-2xl border border-surface-border bg-surface-ground/40 p-4 sm:p-5 space-y-4 shadow-xs" aria-label="Vòng đời sự kiện">
              {/* Trạng thái bị hủy (nếu có) */}
              {selectedEvent.event.status === 'CANCELLED' ? (
                <div className="flex items-start gap-3 rounded-xl border border-parish-danger/30 bg-parish-danger-bg/20 p-3.5 text-text-main">
                  <XCircle className="h-5 w-5 text-parish-danger shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-bold text-parish-danger">Sự kiện đã bị hủy</p>
                    <p className="mb-0 mt-1 text-xs text-text-muted">Lý do và người thực hiện được giữ trong nhật ký audit.</p>
                  </div>
                </div>
              ) : (
                /* Visual Lifecycle Stepper */
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Giai đoạn sự kiện</span>
                    <span className="text-xs font-semibold text-text-muted">
                      Trạng thái hiện tại: <span className="font-bold text-text-main">{statusLabel[selectedEvent.event.status] || selectedEvent.event.status}</span>
                    </span>
                  </div>

                  <div className="relative flex items-center justify-between px-2 sm:px-6 py-2">
                    {/* Background Connecting Track */}
                    <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-surface-border -z-0 rounded-full" />
                    {/* Active Progress Connecting Track */}
                    <div
                      className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-parish-primary transition-[width] duration-300 -z-0 rounded-full"
                      style={{
                        width: currentStepIndex > 0 ? `${(currentStepIndex / (EVENT_STEPS.length - 1)) * 100}%` : '0%',
                        maxWidth: 'calc(100% - 48px)',
                      }}
                    />

                    {EVENT_STEPS.map((step, index) => {
                      const isPast = currentStepIndex > index
                      const isCurrent = currentStepIndex === index

                      return (
                        <div key={step.status} className="relative z-10 flex flex-col items-center gap-1">
                          <div
                            className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-150 ${
                              isPast
                                ? 'bg-parish-success text-text-inverse shadow-xs'
                                : isCurrent
                                  ? 'bg-parish-primary text-text-inverse ring-4 ring-parish-primary/25 shadow-sm'
                                  : 'border-2 border-surface-border bg-surface-card text-text-muted'
                            }`}
                          >
                            {isPast ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : index + 1}
                          </div>
                          <span
                            className={`text-xs whitespace-nowrap ${
                              isCurrent
                                ? 'font-extrabold text-parish-primary'
                                : isPast
                                  ? 'font-semibold text-text-main'
                                  : 'text-text-muted'
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Thanh Tiến Độ Sẵn Sàng (Readiness Bar) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-main flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-parish-primary" />
                    Tiến độ chuẩn bị sự kiện
                  </span>
                  <span className={`font-bold ${selectedEvent.readiness.percent === 100 ? 'text-parish-success' : selectedEvent.readiness.percent >= 50 ? 'text-parish-primary' : 'text-parish-warning'}`}>
                    {selectedEvent.readiness.percent}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-border/70 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${selectedEvent.readiness.percent === 100 ? 'bg-parish-success' : selectedEvent.readiness.percent >= 50 ? 'bg-parish-primary' : 'bg-parish-warning'}`}
                    style={{ width: `${Math.min(100, Math.max(0, selectedEvent.readiness.percent))}%` }}
                  />
                </div>
              </div>

              {/* Điểm chặn Readiness Blockers */}
              {selectedEvent.readiness.blockers.length > 0 && (
                <div className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg/40 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-parish-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Điểm chặn cần giải quyết trước khi chuyển trạng thái ({selectedEvent.readiness.blockers.length}):</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedEvent.readiness.blockers.map(blocker => (
                      <div key={`${blocker.type}:${blocker.id}`} className="rounded-lg border border-surface-border/80 bg-surface-card px-3 py-2 text-xs text-text-main flex items-center justify-between gap-2 shadow-xs">
                        <span className="font-semibold">{blocker.label}</span>
                        <Badge tone="neutral" className="text-xs uppercase font-bold shrink-0">{blocker.type}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(nextEventStatus[selectedEvent.event.status] === 'READY' || nextEventStatus[selectedEvent.event.status] === 'LIVE') && selectedEvent.readiness.blockers.length > 0 && (
                <p className="mb-0 text-xs font-semibold text-parish-warning">Cần xử lý hết điểm chặn readiness trước khi chuyển trạng thái.</p>
              )}

              {nextEventStatus[selectedEvent.event.status] === 'COMPLETED' && (
                <div className={`rounded-xl border p-3 space-y-2 ${closureBlockers.length > 0 || !outcomeSummary.trim() ? 'border-parish-warning/30 bg-parish-warning-bg/40' : 'border-parish-success/30 bg-parish-success-bg/40'}`}>
                  <p className="m-0 text-xs font-bold text-text-main">Điều kiện đóng sự kiện</p>
                  {!outcomeSummary.trim() && <p className="m-0 text-xs text-parish-warning">Chưa nhập tổng kết kết quả.</p>}
                  {closureBlockers.map(blocker => (
                    <button
                      key={`${blocker.type}:${blocker.id}`}
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-left text-xs text-text-main"
                      onClick={() => setEventModalTab('tasks')}
                    >
                      <span className="font-semibold">{blocker.label}</span>
                      <Badge tone="neutral" className="shrink-0 text-xs uppercase font-bold">{blocker.type}</Badge>
                    </button>
                  ))}
                  {outcomeSummary.trim() && closureBlockers.length === 0 && <p className="m-0 text-xs font-semibold text-parish-success">Đã đủ điều kiện đóng sự kiện.</p>}
                </div>
              )}

              {selectedEvent.event.automationPaused && (
                <div role="status" className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg/40 p-3 text-sm text-text-main">
                  <p className="m-0 font-bold">Tự động chuyển giai đoạn đang tạm dừng</p>
                  <p className="mb-0 mt-1 text-xs">{selectedEvent.event.automationPauseReason || 'Sự kiện đã được lùi giai đoạn thủ công.'}</p>
                  {selectedEvent.permissions['operations.event.transition'] && (
                    <Button className="mt-2" size="sm" variant="secondary" loading={transitioningEvent} disabled={!canMutate} leadingIcon={<Play className="h-4 w-4" />} onClick={() => void handleResumeAutomation()}>
                      Tiếp tục tự động chuyển
                    </Button>
                  )}
                </div>
              )}

              {/* Action Bar: Next Step & Cancel Buttons */}
              {selectedEvent.event.status !== 'CANCELLED' && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-surface-border/80">
                  <div className="text-xs text-text-muted">
                    Trạng thái hiện tại: <span className="font-semibold text-text-main">{statusLabel[selectedEvent.event.status] || selectedEvent.event.status}</span> · Tiến độ chuẩn bị: <span className="font-semibold text-parish-primary">{selectedEvent.readiness.percent}%</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {previousEventStatus[selectedEvent.event.status] && selectedEvent.permissions['operations.event.transition'] && (
                      <Button size="sm" variant="secondary" loading={transitioningEvent} disabled={!canMutate || showRewindPrompt} onClick={() => { setShowCancelPrompt(false); setEventReason(''); setShowRewindPrompt(true) }} leadingIcon={<ArrowLeft className="h-4 w-4" />}>
                        Lùi một giai đoạn
                      </Button>
                    )}
                    {nextEventStatus[selectedEvent.event.status] && selectedEvent.permissions['operations.event.transition'] && (
                      <Button
                        size="sm"
                        variant="primary"
                        loading={transitioningEvent}
                        disabled={!canMutate
                          || ((nextEventStatus[selectedEvent.event.status] === 'READY' || nextEventStatus[selectedEvent.event.status] === 'LIVE') && selectedEvent.readiness.blockers.length > 0)
                          || (nextEventStatus[selectedEvent.event.status] === 'COMPLETED' && (!outcomeSummary.trim() || closureBlockers.length > 0))}
                        onClick={() => void handleEventTransition(nextEventStatus[selectedEvent.event.status]!)}
                        leadingIcon={<ArrowRight className="h-4 w-4" />}
                      >
                        {transitionLabel[nextEventStatus[selectedEvent.event.status]!]}
                      </Button>
                    )}
                    {(['DRAFT', 'PLANNING', 'PREPARING', 'READY'] as OperationEvent['status'][]).includes(selectedEvent.event.status)
                      && selectedEvent.permissions['operations.event.cancel']
                      && (selectedEvent.event.visibility !== 'PUBLIC_SUMMARY' || selectedEvent.permissions['operations.event.publish_public'])
                      && !showCancelPrompt && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={transitioningEvent}
                        disabled={!canMutate}
                        onClick={() => setShowCancelPrompt(true)}
                      >
                        Hủy sự kiện
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Hộp xác nhận hủy sự kiện */}
              {showCancelPrompt
                && (selectedEvent.event.status === 'DRAFT' || selectedEvent.event.status === 'PLANNING' || selectedEvent.event.status === 'PREPARING' || selectedEvent.event.status === 'READY')
                && selectedEvent.permissions['operations.event.cancel']
                && (selectedEvent.event.visibility !== 'PUBLIC_SUMMARY' || selectedEvent.permissions['operations.event.publish_public']) && (
                <div className="rounded-xl border border-parish-danger/30 bg-parish-danger-bg/20 p-3 sm:p-4 space-y-2.5">
                  <label className="block text-sm font-semibold text-text-main">
                    Lý do hủy sự kiện (bắt buộc)
                    <TextArea
                      className="mt-1 min-h-20 w-full"
                      value={eventReason}
                      maxLength={1000}
                      placeholder="Nhập lý do hủy sự kiện..."
                      onChange={event => setEventReason(event.target.value)}
                      autoFocus
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowCancelPrompt(false)
                        setEventReason('')
                      }}
                    >
                      Không hủy nữa
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={transitioningEvent}
                      disabled={!canMutate || !eventReason.trim()}
                      onClick={() => void handleEventTransition('CANCELLED')}
                    >
                      Xác nhận hủy sự kiện
                    </Button>
                  </div>
                </div>
              )}

              {showRewindPrompt && previousEventStatus[selectedEvent.event.status] && selectedEvent.permissions['operations.event.transition'] && (
                <div className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg/20 p-3 sm:p-4 space-y-2.5">
                  <label className="block text-sm font-semibold text-text-main">
                    Lý do lùi về {statusLabel[previousEventStatus[selectedEvent.event.status]!]}
                    <TextArea className="mt-1 min-h-20 w-full" value={eventReason} maxLength={2000} placeholder="Nêu lý do để lưu vào lịch sử sự kiện..." onChange={event => setEventReason(event.target.value)} autoFocus />
                  </label>
                  <p className="m-0 text-xs text-text-muted">Task và xác nhận nhận việc được giữ nguyên. Tự động chuyển theo giờ sẽ tạm dừng cho tới khi người quản lý bật lại.</p>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => { setShowRewindPrompt(false); setEventReason('') }}>Không lùi nữa</Button>
                    <Button variant="primary" size="sm" loading={transitioningEvent} disabled={!canMutate || !eventReason.trim()} onClick={() => void handleEventTransition(previousEventStatus[selectedEvent.event.status]!)}>Xác nhận lùi giai đoạn</Button>
                  </div>
                </div>
              )}

              {/* Form tổng kết khi LIVE */}
              {selectedEvent.event.status === 'LIVE' && selectedEvent.permissions['operations.event.transition'] && (
                <label className="mt-3 block text-sm font-semibold text-text-main">
                  Tổng kết kết quả
                  <TextArea
                    className="mt-1 min-h-24 w-full"
                    value={outcomeSummary}
                    maxLength={4000}
                    required
                    placeholder="Bắt buộc trước khi hoàn tất sự kiện"
                    onChange={event => setOutcomeSummary(event.target.value)}
                  />
                </label>
              )}

              {/* Cảnh báo closure tasks khi LIVE */}
              {selectedEvent.event.status === 'LIVE' && closureTasks.length > 0 && (
                <div role="status" className="rounded-lg border border-parish-warning/30 bg-parish-warning-bg p-3 text-sm text-text-main">
                  <p className="m-0 font-bold">Chưa thể đóng sự kiện: còn nhiệm vụ bắt buộc chưa hoàn tất.</p>
                  <ul className="mb-0 mt-2 list-disc pl-5">
                    {closureTasks.map(task => <li key={task.id}>{task.title} · {statusLabel[task.status] || task.status}</li>)}
                  </ul>
                  <p className="mb-0 mt-2 text-xs">Nhiệm vụ đã hủy không được tính là hoàn tất. Máy chủ kiểm tra lại khi đóng sự kiện.</p>
                </div>
              )}
            </div>

            {/* 2. CHỈ SỐ NHANH EXECUTIVE KPI STRIP */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-surface-border bg-surface-card p-3 flex items-center gap-2.5 shadow-xs">
                <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="m-0 text-xs font-medium text-text-muted truncate">Thời gian</p>
                  <p className="m-0 text-xs font-bold text-text-main truncate">
                    {new Date(selectedEvent.event.startsAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-surface-border bg-surface-card p-3 flex items-center gap-2.5 shadow-xs">
                <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="m-0 text-xs font-medium text-text-muted truncate">Địa điểm</p>
                  <p className="m-0 text-xs font-bold text-text-main truncate">
                    {selectedEvent.event.location || 'Chưa thiết lập'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-surface-border bg-surface-card p-3 flex items-center gap-2.5 shadow-xs">
                <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                  <ListTodo className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="m-0 text-xs font-medium text-text-muted truncate">Công việc</p>
                  <p className="m-0 text-xs font-bold text-text-main truncate">
                    {completedTasksCount}/{totalTasksCount} hoàn tất
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-surface-border bg-surface-card p-3 flex items-center gap-2.5 shadow-xs">
                <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="m-0 text-xs font-medium text-text-muted truncate">Đội ngũ</p>
                  <p className="m-0 text-xs font-bold text-text-main truncate">
                    {totalAssigneesCount} người · {totalWorkstreamsCount} nhóm
                  </p>
                </div>
              </div>
            </div>

            {/* 3. ĐIỀU HƯỚNG TABS */}
            <div className="border-b border-surface-border">
              <Tabs
                id="event-modal-tabs"
                ariaLabel="Phân hệ chi tiết sự kiện"
                items={modalTabs}
                value={eventModalTab}
                onValueChange={setEventModalTab}
              />
            </div>

            {/* 4. NỘI DUNG THEO TABS */}
            {/* Tab 1: Nhiệm vụ & Phân công */}
            <TabPanel tabsId="event-modal-tabs" value="tasks" activeValue={eventModalTab} className="space-y-5">
              {/* Cảnh báo phân công trùng lịch */}
              {assignmentWarnings && assignmentWarnings.items.length > 0 && selectedEvent.tasks.some(task => task.id === assignmentWarnings.taskId) && (
                <div role="status" className="rounded-lg border border-surface-border p-3 text-sm text-text-main">
                  <p className="m-0 font-medium">Đã lưu phân công, nhưng người nhận có lịch bận tại hạn công việc. Hãy trao đổi lại; đây chưa phải xác nhận nhận việc hoặc kiểm tra toàn bộ ca phục vụ.</p>
                  <div className="mt-2 space-y-1">
                    {assignmentWarnings.items.map(item => (
                      <p key={item.id} className="m-0 text-xs">{new Date(item.startsAt).toLocaleString('vi-VN')} – {new Date(item.endsAt).toLocaleString('vi-VN')}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Lưới Task List + Forms */}
              <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="m-0 text-sm font-extrabold text-text-main">Task của sự kiện</h3>
                    {/* Filter Chips */}
                    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Lọc task theo trạng thái">
                      {taskFilterOptions.map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`btn btn-sm text-xs rounded-full px-2.5 py-0.5 ${
                            taskStatusFilter === opt.key
                              ? 'btn-primary'
                              : 'btn-ghost border border-surface-border text-text-muted hover:text-text-main'
                          }`}
                          onClick={() => setTaskStatusFilter(opt.key)}
                        >
                          {opt.label} ({opt.count})
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredTasks.length === 0 ? (
                    <EmptyState
                      icon={ClipboardList}
                      title={taskStatusFilter === 'ALL' ? 'Chưa có task.' : 'Không có task nào trong bộ lọc này.'}
                      description={taskStatusFilter === 'ALL' ? 'Tạo công việc mới ở biểu mẫu bên cạnh để bắt đầu phân công.' : 'Hãy chọn một trạng thái khác để xem công việc.'}
                      className="rounded-xl border border-surface-border py-8"
                    />
                  ) : (
                    <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface-card overflow-hidden">
                      {filteredTasks.map(task => (
                        <div key={task.id} className="flex items-start justify-between gap-3 px-3.5 py-3 hover:bg-surface-hover/40 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="m-0 text-sm font-bold text-text-main">{task.title}</p>
                              {task.isRequired && (
                                <Badge tone="warning" className="uppercase font-bold py-0">Bắt buộc</Badge>
                              )}
                            </div>
                            <p className="mb-0 mt-1 text-xs text-text-muted">
                              {taskPhaseLabel[task.phase]} · {selectedEvent.assignees.filter(item => item.taskId === task.id).length} người được phân công
                            </p>
                            {task.scheduledStartAt && task.scheduledEndAt && (
                              <p className="mb-0 mt-1 text-xs text-text-muted flex items-center gap-1">
                                <Clock className="h-3 w-3 text-text-muted" />
                                Ca: {new Date(task.scheduledStartAt).toLocaleString('vi-VN')} – {new Date(task.scheduledEndAt).toLocaleString('vi-VN')}
                              </p>
                            )}
                            {task.dueAt && (
                              <p className="mb-0 mt-1 text-xs text-text-muted flex items-center gap-1">
                                <Clock className="h-3 w-3 text-text-muted" />
                                Hạn: {new Date(task.dueAt).toLocaleString('vi-VN')}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <Badge tone={statusTone(task.status)}>{statusLabel[task.status] || task.status}</Badge>
                            <Button
                              variant={selectedTask?.task.id === task.id ? 'primary' : 'ghost'}
                              size="sm"
                              loading={taskDetailLoading && selectedTask?.task.id === task.id}
                              disabled={!isOnline || source !== 'server'}
                              onClick={() => void selectTask(task.id).catch(() => undefined)}
                            >
                              Checklist
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {selectedEvent.permissions['operations.task.create'] && canCreateEventTask(selectedEvent.event.status) && (
                    <form className="space-y-3 rounded-xl border border-surface-border bg-surface-card p-4 shadow-xs" onSubmit={handleCreateTask}>
                      <div className="flex items-center gap-2 border-b border-surface-border pb-2.5">
                        <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                          <CalendarPlus className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="m-0 text-sm font-extrabold text-text-main">Thêm Task</h3>
                          <p className="m-0 text-xs text-text-muted">Tạo việc mới cho sự kiện này</p>
                        </div>
                      </div>
                      <TextInput aria-label="Tên task" className="w-full" placeholder="Tên công việc" value={taskDraft.title} required maxLength={300} onChange={event => setTaskDraft(value => ({ ...value, title: event.target.value }))} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select aria-label="Nhóm của công việc" className="w-full" value={selectedEvent.workstreams.some(group => group.id === taskDraft.workstreamId) ? taskDraft.workstreamId : ''} onChange={event => setTaskDraft(value => ({ ...value, workstreamId: event.target.value }))}>
                          <option value="">Không thuộc nhóm</option>
                          {selectedEvent.workstreams.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </Select>
                        <Select aria-label="Giai đoạn nhiệm vụ" className="w-full" value={taskDraft.phase} onChange={event => setTaskDraft(value => ({ ...value, phase: event.target.value as OperationTask['phase'] }))}>
                          <option value="PREPARATION">Trước sự kiện</option>
                          <option value="EXECUTION">Trong sự kiện</option>
                          <option value="FOLLOW_UP">Sau sự kiện</option>
                        </Select>
                      </div>
                      <TextInput aria-label="Hạn task" className="w-full" type="datetime-local" value={taskDraft.dueAt} onChange={event => setTaskDraft(value => ({ ...value, dueAt: event.target.value }))} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <TextInput aria-label="Bắt đầu ca task" className="w-full" type="datetime-local" value={taskDraft.scheduledStartAt} onChange={event => setTaskDraft(value => ({ ...value, scheduledStartAt: event.target.value }))} />
                        <TextInput aria-label="Kết thúc ca task" className="w-full" type="datetime-local" value={taskDraft.scheduledEndAt} onChange={event => setTaskDraft(value => ({ ...value, scheduledEndAt: event.target.value }))} />
                      </div>
                      {taskScheduleInvalid && <p role="alert" className="m-0 text-xs text-parish-danger">Ca công việc cần đủ giờ bắt đầu/kết thúc và giờ kết thúc phải muộn hơn.</p>}
                      <label className="flex min-h-11 items-center gap-2 text-sm text-text-main cursor-pointer select-none">
                        <input type="checkbox" checked={taskDraft.isRequired} onChange={event => setTaskDraft(value => ({ ...value, isRequired: event.target.checked }))} /> Nhiệm vụ bắt buộc
                      </label>
                      <Button type="submit" size="sm" loading={creating} disabled={!canMutate || taskScheduleInvalid} fullWidth>Tạo task</Button>
                    </form>
                  )}

                  {selectedEvent.permissions['operations.task.assign'] && !selectedEventClosed && assignableTasks.length > 0 && (
                    <form className="space-y-3 rounded-xl border border-surface-border bg-surface-card p-4 shadow-xs" onSubmit={handleAssign}>
                      <div className="flex items-center gap-2 border-b border-surface-border pb-2.5">
                        <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                          <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="m-0 text-sm font-extrabold text-text-main">Phân Công</h3>
                          <p className="m-0 text-xs text-text-muted">Giao việc cho nhân sự</p>
                        </div>
                      </div>
                      <Select aria-label="Task cần phân công" className="w-full" value={assignmentDraft.taskId} required onChange={event => setAssignmentDraft(value => ({ ...value, taskId: event.target.value, target: '', reserveTarget: '' }))}>
                        <option value="">Chọn task</option>
                        {assignableTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
                      </Select>
                      <Select aria-label={assignmentDraft.role === 'OWNER' ? 'Người thực hiện chính' : 'Người được phân công'} className="w-full" value={assignmentDraft.target} required disabled={!assignmentDraft.taskId || assignmentDirectory.loading} onChange={event => setAssignmentDraft(value => ({ ...value, target: event.target.value, reserveTarget: value.reserveTarget === event.target.value ? '' : value.reserveTarget }))}>
                        <option value="">{assignmentDirectory.loading ? 'Đang tải nhân sự…' : 'Chọn nhân sự'}</option>
                        {(assignmentDraft.role === 'OWNER' ? actionableDispatchCandidates : assignmentCandidates).map(candidate => (
                          <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>
                            {candidate.displayName}{candidate.eligibility === 'PLANNING_ONLY' ? ' · chưa có tài khoản' : ''}
                          </option>
                        ))}
                      </Select>
                      {assignmentDirectory.error && <p role="alert" className="text-sm text-text-main">{assignmentDirectory.error}</p>}
                      <Select aria-label="Vai trò phân công" className="w-full" value={assignmentDraft.role} onChange={event => setAssignmentDraft(value => ({ ...value, role: event.target.value as typeof value.role, reserveTarget: '', acknowledgeBy: '' }))}>
                        <option value="OWNER">Owner (Phụ trách chính)</option>
                        <option value="CONTRIBUTOR">Contributor (Thực hiện)</option>
                        <option value="APPROVER">Approver (Người duyệt)</option>
                        <option value="OBSERVER">Observer (Theo dõi)</option>
                      </Select>
                      {assignmentDraft.role === 'OWNER' && (
                        <div className="space-y-2 rounded-xl border border-surface-border bg-surface-ground/40 p-3">
                          <Select aria-label="Người dự bị" className="w-full" value={assignmentDraft.reserveTarget} disabled={!assignmentDraft.taskId || assignmentDirectory.loading} onChange={event => setAssignmentDraft(value => ({ ...value, reserveTarget: event.target.value }))}>
                            <option value="">Không chọn người dự bị</option>
                            {actionableDispatchCandidates.filter(candidate => operationCandidateValue(candidate) !== assignmentDraft.target).map(candidate => (
                              <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>{candidate.displayName}</option>
                            ))}
                          </Select>
                          <TextInput aria-label="Hạn nhận nhiệm vụ" className="w-full" type="datetime-local" value={assignmentDraft.acknowledgeBy} required onChange={event => setAssignmentDraft(value => ({ ...value, acknowledgeBy: event.target.value }))} />
                          <p className="m-0 text-xs text-text-muted">
                            Ở bản Nháp, lời mời chỉ được gửi khi sang Kế hoạch. Nếu có dự bị, hệ thống mời họ khi đã dùng 70% thời gian chờ; người nhận trước sẽ phụ trách chính.
                          </p>
                        </div>
                      )}
                      <Button type="submit" size="sm" loading={Boolean(busyTask)} disabled={!canMutate || (assignmentDraft.role === 'OWNER' && !assignmentDraft.acknowledgeBy)} fullWidth>
                        {assignmentDraft.role === 'OWNER' ? 'Gửi lời mời phụ trách' : 'Giao việc'}
                      </Button>
                    </form>
                  )}
                </div>
              </div>

              {/* Checklist của nhiệm vụ đã chọn */}
              {renderTaskChecklist()}
            </TabPanel>

            {/* Tab 2: Nhóm công tác */}
            <TabPanel tabsId="event-modal-tabs" value="workstreams" activeValue={eventModalTab}>
              <WorkstreamPanel key={selectedEvent.event.id} event={selectedEvent} enabled={canMutate} refresh={() => selectEvent(selectedEvent.event.id)} />
            </TabPanel>

            {/* Tab 3: Lập lịch nhắc việc */}
            <TabPanel tabsId="event-modal-tabs" value="reminders" activeValue={eventModalTab} className="space-y-4">
              <EventReminderForm key={`reminder-${selectedEvent.event.id}`} event={selectedEvent} enabled={canMutate} />
              {selectedTask && <EventReminderForm key={`task-reminder-${selectedTask.task.id}`} event={selectedEvent} task={selectedTask} enabled={canMutate} />}
            </TabPanel>

            {/* Tab 4: Mẫu sự kiện */}
            <TabPanel tabsId="event-modal-tabs" value="templates" activeValue={eventModalTab}>
              <EventTemplatesPanel
                key={`templates-${selectedEvent.event.id}`}
                mode="source"
                enabled={canMutate}
                sourceEvent={selectedEvent}
                canPublishPublic={Boolean(selectedEvent.permissions['operations.event.publish_public'])}
                onTemplatesChanged={() => setTemplateCatalogRevision(value => value + 1)}
                onEventCreated={async eventId => { await fetch(); await selectEvent(eventId) }}
              />
            </TabPanel>

            {/* Tab 5: Đúc kết sau sự kiện */}
            {selectedEvent.event.status === 'COMPLETED' && (
              <TabPanel tabsId="event-modal-tabs" value="retrospective" activeValue={eventModalTab}>
                <EventRetrospectivePanel key={`retrospective-${selectedEvent.event.id}`} detail={selectedEvent} enabled={canMutate} refresh={() => selectEvent(selectedEvent.event.id)} />
              </TabPanel>
            )}
          </div>
        </ModalShell>
      )}

      {!selectedEvent && renderTaskChecklist()}
      <ConfirmDialog
        isOpen={acceptanceWarning !== null}
        title="Còn người chưa nhận nhiệm vụ"
        message={acceptanceWarning?.length
          ? `Các task chưa đủ xác nhận: ${acceptanceWarning.map(item => item.label).join(', ')}. Bạn vẫn muốn chuyển sự kiện sang Chuẩn bị?`
          : 'Vẫn còn người thực hiện chưa nhận nhiệm vụ. Bạn vẫn muốn chuyển sự kiện sang Chuẩn bị?'}
        confirmText="Vẫn chuyển sang Chuẩn bị"
        cancelText="Ở lại Kế hoạch"
        variant="warning"
        isBusy={transitioningEvent}
        onCancel={() => setAcceptanceWarning(null)}
        onConfirm={() => void handleEventTransition('PREPARING', true)}
      />
    </DesktopAppShell>
  )
}
