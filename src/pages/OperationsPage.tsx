import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  CalendarClock,
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
  Plus,
  Search,
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
import type { OperationEvent, OperationReminder, OperationTask, OperationTaskDispatchInvitation } from '../lib/api/operations'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { operationsErrorText } from '../lib/operationsErrors'
import { newIdempotencyKey } from '../lib/api/core'
import { useOperationsStore } from '../stores/operationsStore'
import { useToastStore } from '../stores/toastStore'
import { WorkstreamPanel } from '../components/operations/WorkstreamPanel'
import { EventReminderForm } from '../components/operations/EventReminderForm'
import { TaskChecklistSection } from '../components/operations/TaskChecklistSection'
const AvailabilityPanel = lazy(() => import('../components/operations/AvailabilityPanel').then(m => ({ default: m.AvailabilityPanel })))
const StandaloneWorkstreamsPanel = lazy(() => import('../components/operations/StandaloneWorkstreamsPanel').then(m => ({ default: m.StandaloneWorkstreamsPanel })))
import { EventRetrospectivePanel } from '../components/operations/EventRetrospectivePanel'
const EventTemplatesPanel = lazy(() => import('../components/operations/EventTemplatesPanel').then(m => ({ default: m.EventTemplatesPanel })))
import { CreateEventForm } from '../components/operations/CreateEventForm'
import { StandaloneTaskForm } from '../components/operations/StandaloneTaskForm'
import { EventTaskForm } from '../components/operations/EventTaskForm'
import { TaskAssignForm } from '../components/operations/TaskAssignForm'
import { EventEditForm } from '../components/operations/EventEditForm'
import { isTaskScheduleInvalid, operationsOfflineBannerText } from '../components/operations/operationsViewHelpers'

const statusLabel: Record<string, string> = {
  DRAFT: 'Bản nháp', PLANNING: 'Kế hoạch', PREPARING: 'Chuẩn bị', READY: 'Sẵn sàng', LIVE: 'Đang diễn ra', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
  BACKLOG: 'Chờ xếp việc', TODO: 'Chưa làm', IN_PROGRESS: 'Đang làm', BLOCKED: 'Bị chặn', DONE: 'Hoàn tất',
}
const isTerminalTask = (status: string) => status === 'DONE' || status === 'CANCELLED'
const isClosedEvent = (status: string) => status === 'COMPLETED' || status === 'CANCELLED'
const nextEventStatus: Partial<Record<OperationEvent['status'], OperationEvent['status']>> = {
  DRAFT: 'PLANNING', PLANNING: 'PREPARING', PREPARING: 'READY', READY: 'LIVE', LIVE: 'COMPLETED',
}
const previousEventStatus: Partial<Record<OperationEvent['status'], OperationEvent['status']>> = {
  PLANNING: 'DRAFT', PREPARING: 'PLANNING', READY: 'PREPARING', LIVE: 'READY',
}
const transitionLabel: Partial<Record<OperationEvent['status'], string>> = {
  PLANNING: 'Bắt đầu lập kế hoạch', PREPARING: 'Chuyển sang chuẩn bị', READY: 'Đánh dấu sẵn sàng', LIVE: 'Bắt đầu sự kiện', COMPLETED: 'Hoàn tất sự kiện',
}
const reminderKindLabel = { TASK_DUE: 'Nhắc hạn công việc', EVENT_START: 'Nhắc giờ bắt đầu sự kiện', OVERDUE: 'Công việc quá hạn', MANAGER_PREP: 'Sự kiện đủ người nhận việc' } as const
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
  // One selector per slice: a store update (e.g. marking one reminder read)
  // re-renders only readers of that slice instead of the whole 2000-line tree.
  const events = useOperationsStore(s => s.events)
  const tasks = useOperationsStore(s => s.tasks)
  const reminders = useOperationsStore(s => s.reminders)
  const dispatchInvitations = useOperationsStore(s => s.dispatchInvitations)
  const permissions = useOperationsStore(s => s.permissions)
  const creationOptions = useOperationsStore(s => s.creationOptions)
  const selectedEvent = useOperationsStore(s => s.selectedEvent)
  const selectedTask = useOperationsStore(s => s.selectedTask)
  const detailLoading = useOperationsStore(s => s.detailLoading)
  const taskDetailLoading = useOperationsStore(s => s.taskDetailLoading)
  const loading = useOperationsStore(s => s.loading)
  const error = useOperationsStore(s => s.error)
  const source = useOperationsStore(s => s.source)
  const cacheSavedAt = useOperationsStore(s => s.cacheSavedAt)
  const mode = useEffectiveMode()
  const isMobileLayout = mode === 'mobile'
  const [eventSearchQuery, setEventSearchQuery] = useState('')
  const filteredEvents = useMemo(() => {
    const q = eventSearchQuery.trim().toLowerCase()
    if (!q) return events
    return events.filter(e =>
      e.title.toLowerCase().includes(q)
      || (e.location && e.location.toLowerCase().includes(q))
    )
  }, [events, eventSearchQuery])
  const [utilitiesExpanded, setUtilitiesExpanded] = useState(false)
  const eventTotal = useOperationsStore(s => s.eventTotal)
  const taskTotal = useOperationsStore(s => s.taskTotal)
  const eventHasMore = useOperationsStore(s => s.eventHasMore)
  const taskHasMore = useOperationsStore(s => s.taskHasMore)
  const reminderHasMore = useOperationsStore(s => s.reminderHasMore)
  const fetch = useOperationsStore(s => s.fetch)
  const fetchCreationOptions = useOperationsStore(s => s.fetchCreationOptions)
  const loadMoreEvents = useOperationsStore(s => s.loadMoreEvents)
  const loadMoreTasks = useOperationsStore(s => s.loadMoreTasks)
  const loadMoreReminders = useOperationsStore(s => s.loadMoreReminders)
  const selectEvent = useOperationsStore(s => s.selectEvent)
  const selectTask = useOperationsStore(s => s.selectTask)
  const updateTask = useOperationsStore(s => s.updateTask)
  const acceptTaskDispatch = useOperationsStore(s => s.acceptTaskDispatch)
  const transitionEvent = useOperationsStore(s => s.transitionEvent)
  const resumeEventAutomation = useOperationsStore(s => s.resumeEventAutomation)
  const transitionTask = useOperationsStore(s => s.transitionTask)
  const acknowledgeTask = useOperationsStore(s => s.acknowledgeTask)
  const markReminderRead = useOperationsStore(s => s.markReminderRead)
  const cancelReminder = useOperationsStore(s => s.cancelReminder)
  const assignmentWarnings = useOperationsStore(s => s.assignmentWarnings)
  const isOnline = useOnlineStatus()
  const [busyTask, setBusyTask] = useState<string | null>(null)
  // P1-8: inbox commands (dispatch accept, reminder read/cancel) track their
  // own busy rows so one in-flight reminder action never locks unrelated
  // dispatch accepts, task transitions, or other reminder rows.
  const [busyInbox, setBusyInbox] = useState<Set<string>>(new Set())
  const setInboxBusy = (id: string, busy: boolean) => setBusyInbox(previous => {
    const next = new Set(previous)
    if (busy) next.add(id); else next.delete(id)
    return next
  })
  // Which row triggered the in-flight detail load (store clears/keeps the
  // previous selection, so its id alone can't identify the spinner row).
  const [pendingEventId, setPendingEventId] = useState<string | null>(null)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  // A5': desktop dropdown keyboard/pointer dismissal targets.
  const createMenuRef = useRef<HTMLDivElement | null>(null)
  const createMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const focusCreateMenuItem = (direction: 1 | -1 | 'first' | 'last') => {
    const items = Array.from(createMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (items.length === 0) return
    const active = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = direction === 'first' ? 0 : direction === 'last' ? items.length - 1 : (active + direction + items.length) % items.length
    items[next]?.focus()
  }
  useEffect(() => {
    // Desktop dropdown only — the mobile sheet is a ModalShell dialog that
    // already owns Escape/outside-click/focus behavior.
    if (isMobileLayout || !showCreateMenu) return
    const onPointerDown = (event: PointerEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) setShowCreateMenu(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setShowCreateMenu(false)
        createMenuButtonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isMobileLayout, showCreateMenu])
  const [showStandaloneTask, setShowStandaloneTask] = useState(false)
  const [createScope, setCreateScope] = useState<{ kind: 'XU_DOAN' | 'UNIT'; unitId: string }>({ kind: 'XU_DOAN', unitId: '' })
  const [standaloneScopeUnitId, setStandaloneScopeUnitId] = useState('')
  const [editingTask, setEditingTask] = useState<OperationTask | null>(null)
  const [showEditTask, setShowEditTask] = useState(false)
  const [savingTask, setSavingTask] = useState(false)
  const [taskEditDraft, setTaskEditDraft] = useState({ title: '', description: '', dueAt: '', scheduledStartAt: '', scheduledEndAt: '', priority: 'NORMAL' as OperationTask['priority'], isRequired: false })
  const [eventReason, setEventReason] = useState('')
  const [showCancelPrompt, setShowCancelPrompt] = useState(false)
  const [showRewindPrompt, setShowRewindPrompt] = useState(false)
  const [acceptanceWarning, setAcceptanceWarning] = useState<Array<{ id: string; label: string }> | null>(null)
  const [outcomeSummary, setOutcomeSummary] = useState('')
  const [transitioningEvent, setTransitioningEvent] = useState(false)
  const [eventModalTab, setEventModalTab] = useState<EventModalTab>('tasks')
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>('ALL')
  const [templateCatalogRevision, setTemplateCatalogRevision] = useState(0)

  // 1. Stable idempotency keys per form: same payload retry reuses the key so
  // the server dedups; changed payload or success releases it for a fresh key.
  type StableCommandKey = { fingerprint: string; key: string }
  const commandKeys = useRef(new Map<string, StableCommandKey>())
  const stableCommandKey = (form: string, payload: unknown): string => {
    const fingerprint = JSON.stringify(payload)
    const current = commandKeys.current.get(form)
    if (current && current.fingerprint === fingerprint) return current.key
    const fresh = { fingerprint, key: newIdempotencyKey() }
    commandKeys.current.set(form, fresh)
    return fresh.key
  }
  const releaseCommandKey = (form: string) => { commandKeys.current.delete(form) }

  // 2. Form error states
  const [taskEditFormError, setTaskEditFormError] = useState<string | null>(null)

  // 3. Task transition reason modal state (BLOCKED / CANCELLED)
  const [taskReasonAction, setTaskReasonAction] = useState<{ task: OperationTask; status: OperationTask['status'] } | null>(null)
  const [taskReasonText, setTaskReasonText] = useState('')
  const [taskReasonSubmitting, setTaskReasonSubmitting] = useState(false)

  // 4. Override & Blockers modal state
  const [readinessBlockers, setReadinessBlockers] = useState<Array<{ id?: string; label?: string; code?: string }> | null>(null)
  const [completionBlockers, setCompletionBlockers] = useState<Array<{ type?: string; id?: string; label?: string }> | null>(null)
  const [pendingTargetStatus, setPendingTargetStatus] = useState<OperationEvent['status'] | null>(null)
  const [overrideReason, setOverrideReason] = useState('')

  // 5. Sub drafts reset (task edit draft lives here; checklist/event-edit
  // drafts live in their extracted sections with their own guards).
  const resetEventSubDrafts = () => {
    setEditingTask(null)
    setShowEditTask(false)
    setTaskEditDraft({ title: '', description: '', dueAt: '', scheduledStartAt: '', scheduledEndAt: '', priority: 'NORMAL', isRequired: false })
    setTaskReasonAction(null)
    setTaskReasonText('')
    setReadinessBlockers(null)
    setCompletionBlockers(null)
    setPendingTargetStatus(null)
    setOverrideReason('')
    setTaskEditFormError(null)
  }

  const handleCloseEventModal = () => {
    setShowCancelPrompt(false)
    setShowRewindPrompt(false)
    setAcceptanceWarning(null)
    setEventReason('')
    setOutcomeSummary('')
    setEventModalTab('tasks')
    setTaskStatusFilter('ALL')
    resetEventSubDrafts()
    void selectEvent(null)
  }

  const hasFreshServerState = source === 'server'
  const canMutate = isOnline && hasFreshServerState
  // "+ Tạo mới" information architecture follows business authority (XV):
  // only actions the caller can perform are shown — never a disabled list.
  const canCreateXuDoan = Boolean(creationOptions?.canCreateXuDoanEvent)
  const unitCreationOptions = creationOptions?.units ?? []
  const canCreateAnyUnitEvent = unitCreationOptions.some(unit => unit.canCreateEvent)
  const canCreateAnyStandaloneTask = unitCreationOptions.some(unit => unit.canCreateTask)
  const canCreateAnything = canCreateXuDoan || canCreateAnyUnitEvent || canCreateAnyStandaloneTask
  const unitNameOf = (scopeUnitId: string | null | undefined) => scopeUnitId
    ? (unitCreationOptions.find(unit => unit.id === scopeUnitId)?.name ?? 'Chuyên môn')
    : null
  const scopeBadgeOf = (event: OperationEvent) => {
    const scopeType = event.eventScopeType ?? (event.scopeUnitId ? 'UNIT' : 'XU_DOAN')
    return scopeType === 'XU_DOAN' ? 'Sự kiện Xứ đoàn' : `Chuyên môn · ${unitNameOf(event.scopeUnitId) ?? 'đơn vị phụ trách'}`;
  }
  const selectedEventClosed = selectedEvent ? isClosedEvent(selectedEvent.event.status) : false
  const closureTasks = useMemo(() => selectedEvent?.tasks.filter(task => task.isRequired && task.status !== 'DONE') ?? [], [selectedEvent])
  const closureBlockers = useMemo(() => selectedEvent?.closure?.blockers
    ?? selectedEvent?.tasks.filter(task => task.isRequired && task.status !== 'DONE').map(task => ({ type: 'TASK_INCOMPLETE', id: task.id, label: task.title }))
    ?? [], [selectedEvent])
  const completedTasksCount = useMemo(() => selectedEvent?.tasks.filter(t => t.status === 'DONE').length ?? 0, [selectedEvent])
  const totalTasksCount = selectedEvent?.tasks.length ?? 0
  const totalAssigneesCount = selectedEvent?.assignees.length ?? 0
  const totalWorkstreamsCount = selectedEvent?.workstreams.length ?? 0
  const currentStepIndex = selectedEvent ? (
    selectedEvent.event.status === 'CANCELLED'
      ? -1
      : EVENT_STEPS.findIndex(s => s.status === selectedEvent.event.status)
  ) : -1

  const filteredTasks = useMemo(() => selectedEvent?.tasks.filter(t => {
    if (taskStatusFilter === 'ALL') return true
    return t.status === taskStatusFilter
  }) ?? [], [selectedEvent, taskStatusFilter])
  // Event Xứ đoàn nhìn theo Field trước (XV): nhóm task theo mảng phụ trách.
  // Event chuyên môn giữ danh sách phẳng.
  const isXuDoanEvent = (selectedEvent?.event.eventScopeType ?? (selectedEvent?.event.scopeUnitId ? 'UNIT' : 'XU_DOAN')) === 'XU_DOAN'
  const showFieldTab = !selectedEvent || isXuDoanEvent || selectedEvent.workstreams.length > 0
  const taskGroups: Array<{ key: string; label: string | null; tasks: OperationTask[] }> = useMemo(() => !selectedEvent || !isXuDoanEvent || selectedEvent.workstreams.length === 0
    ? [{ key: 'all', label: null, tasks: filteredTasks }]
    : [
        ...selectedEvent.workstreams.map(group => ({
          key: group.id,
          label: `Mảng ${group.name}`,
          tasks: filteredTasks.filter(task => task.workstreamId === group.id),
        })),
        { key: 'ungrouped', label: 'Chưa xếp mảng', tasks: filteredTasks.filter(task => !task.workstreamId || !selectedEvent.workstreams.some(group => group.id === task.workstreamId)) },
      ], [selectedEvent, isXuDoanEvent, filteredTasks])
  const modalTabs: SelectionItem<EventModalTab>[] = useMemo(() => selectedEvent ? [
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
    ...(showFieldTab ? [{
      value: 'workstreams' as EventModalTab,
      label: (
        <span className="flex items-center gap-1.5">
          <span>{isXuDoanEvent ? 'Mảng phụ trách' : 'Nhóm công tác'}</span>
          <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-xs font-bold text-text-muted">
            {selectedEvent.workstreams.length}
          </span>
        </span>
      ),
      icon: <Layers className="h-4 w-4" />,
    }] : []),
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
  ] : [], [selectedEvent, showFieldTab, isXuDoanEvent])

  // Tabs are dynamic (retrospective only when COMPLETED, workstreams only
  // when showFieldTab): if the selected tab disappears (e.g. rewind out of
  // COMPLETED), fall back to 'tasks' so the modal never renders an empty body.
  const activeModalTab = modalTabs.some(tab => tab.value === eventModalTab) ? eventModalTab : 'tasks'

  const taskFilterOptions: Array<{ key: TaskStatusFilter; label: string; count: number }> = useMemo(() => selectedEvent ? [
    { key: 'ALL', label: 'Tất cả', count: selectedEvent.tasks.length },
    { key: 'TODO', label: 'Chưa làm', count: selectedEvent.tasks.filter(t => t.status === 'TODO').length },
    { key: 'IN_PROGRESS', label: 'Đang làm', count: selectedEvent.tasks.filter(t => t.status === 'IN_PROGRESS').length },
    { key: 'DONE', label: 'Hoàn tất', count: selectedEvent.tasks.filter(t => t.status === 'DONE').length },
    { key: 'BLOCKED', label: 'Bị chặn', count: selectedEvent.tasks.filter(t => t.status === 'BLOCKED').length },
  ] : [], [selectedEvent])

  useEffect(() => { void fetch().catch(() => undefined) }, [fetch])
  useEffect(() => { void fetchCreationOptions().catch(() => undefined) }, [fetchCreationOptions])
  // P1-4: when connectivity returns while the page is showing cache data,
  // refetch immediately instead of waiting for the next manual action. Keyed
  // on the cache state itself (not a one-shot flag) so a failed refetch still
  // retries on the next offline→online transition instead of getting stuck.
  // No loop risk: success flips source to 'server', failure leaves it
  // unchanged, and neither re-triggers this effect on its own.
  useEffect(() => {
    if (isOnline && source === 'cache') void fetch().catch(() => undefined)
  }, [isOnline, source, fetch])

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

  const handleTask = async (task: typeof tasks[number], action: 'DONE' | 'ACCEPTED' | 'DECLINED' | 'IN_PROGRESS' | 'BLOCKED' | 'CANCELLED') => {
    if (busyTask === task.id) return
    if (action === 'BLOCKED' || action === 'CANCELLED') {
      setTaskReasonAction({ task, status: action })
      setTaskReasonText('')
      return
    }
    setBusyTask(task.id)
    try {
      if (action === 'DONE' || action === 'IN_PROGRESS') {
        const key = stableCommandKey('task-transition', { id: task.id, version: task.version, status: action })
        await transitionTask(task, action, { idempotencyKey: key })
        releaseCommandKey('task-transition')
      } else {
        const assignment = task.myAssignments?.find(item => item.acknowledgementStatus === 'PENDING')
        const key = stableCommandKey('task-acknowledge', { id: task.id, assignmentId: assignment?.id, version: assignment?.version, status: action })
        await acknowledgeTask(task, action, undefined, key)
        releaseCommandKey('task-acknowledge')
      }
      if (selectedEvent) await selectEvent(selectedEvent.event.id)
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể cập nhật trạng thái nhiệm vụ'), 'error')
    } finally { setBusyTask(null) }
  }

  const handleConfirmTaskReason = async () => {
    if (!taskReasonAction || !taskReasonText.trim() || taskReasonSubmitting) return
    setTaskReasonSubmitting(true)
    try {
      const { task, status } = taskReasonAction
      const options = status === 'BLOCKED'
        ? { blockedReason: taskReasonText.trim() }
        : { cancellationReason: taskReasonText.trim() }
      const key = stableCommandKey('task-transition', { id: task.id, version: task.version, status, ...options })
      await transitionTask(task, status, { ...options, idempotencyKey: key })
      releaseCommandKey('task-transition')
      useToastStore.getState().addToast(status === 'BLOCKED' ? 'Đã ghi nhận điểm nghẽn của nhiệm vụ.' : 'Đã hủy nhiệm vụ.', 'success')
      setTaskReasonAction(null)
      setTaskReasonText('')
      if (selectedEvent) await selectEvent(selectedEvent.event.id)
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể chuyển trạng thái nhiệm vụ'), 'error')
    } finally { setTaskReasonSubmitting(false) }
  }

  const openCreateEvent = (scopeKind: 'XU_DOAN' | 'UNIT', scopeUnitId = '') => {
    setCreateScope({ kind: scopeKind, unitId: scopeUnitId })
    setShowStandaloneTask(false)
    setShowCreateMenu(false)
    setShowCreate(true)
  }

  const openCreateStandaloneTask = (scopeUnitId: string) => {
    setShowCreate(false)
    setStandaloneScopeUnitId(scopeUnitId)
    setShowCreateMenu(false)
    setShowStandaloneTask(true)
  }

  const taskEditScheduleInvalid = isTaskScheduleInvalid(taskEditDraft.scheduledStartAt, taskEditDraft.scheduledEndAt)

  const openEditTask = (task: OperationTask) => {
    setEditingTask(task)
    setTaskEditDraft({
      title: task.title,
      description: task.description ?? '',
      dueAt: task.dueAt ? toDateTimeInput(task.dueAt) : '',
      scheduledStartAt: task.scheduledStartAt ? toDateTimeInput(task.scheduledStartAt) : '',
      scheduledEndAt: task.scheduledEndAt ? toDateTimeInput(task.scheduledEndAt) : '',
      priority: task.priority,
      isRequired: task.isRequired,
    })
    setShowEditTask(true)
  }

  const handleUpdateTask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (savingTask) return
    if (!editingTask || !taskEditDraft.title.trim() || taskEditScheduleInvalid) return
    setSavingTask(true)
    setTaskEditFormError(null)
    try {
      const payload = {
        title: taskEditDraft.title.trim(),
        description: taskEditDraft.description.trim() || null,
        priority: taskEditDraft.priority,
        dueAt: taskEditDraft.dueAt ? toIso(taskEditDraft.dueAt) : null,
        scheduledStartAt: taskEditDraft.scheduledStartAt ? toIso(taskEditDraft.scheduledStartAt) : null,
        scheduledEndAt: taskEditDraft.scheduledEndAt ? toIso(taskEditDraft.scheduledEndAt) : null,
        isRequired: taskEditDraft.isRequired,
      }
      const result = await updateTask(editingTask, payload, stableCommandKey('update-task', { id: editingTask.id, version: editingTask.version, ...payload }))
      releaseCommandKey('update-task')
      setShowEditTask(false)
      setEditingTask(null)
      if (result.acknowledgementReset) {
        useToastStore.getState().addToast('Đã lưu thay đổi quan trọng. Người đã nhận việc sẽ phải xác nhận lại.', 'info')
      }
      if (selectedEvent) await selectEvent(selectedEvent.event.id)
    } catch (error: any) {
      setTaskEditFormError(operationsErrorText(error?.code, error?.message || 'Không thể cập nhật nhiệm vụ'))
    } finally { setSavingTask(false) }
  }

  const handleEventTransition = async (status: OperationEvent['status'], override = false, customReason?: string) => {
    if (!selectedEvent || selectedEvent.event.status === 'CANCELLED' || !canMutate || transitioningEvent) return
    const currentIndex = EVENT_STEPS.findIndex(step => step.status === selectedEvent.event.status)
    const targetIndex = EVENT_STEPS.findIndex(step => step.status === status)
    const backwards = currentIndex >= 0 && targetIndex >= 0 && targetIndex < currentIndex
    const requiresReason = status === 'CANCELLED' || backwards
    const requiresOutcome = status === 'COMPLETED'
    const finalReason = (customReason || eventReason).trim()
    if ((requiresReason && !finalReason) || (requiresOutcome && !outcomeSummary.trim())) return
    setTransitioningEvent(true)
    try {
      const payload = {
        reason: finalReason || undefined,
        outcomeSummary: outcomeSummary.trim() || undefined,
        ...(override ? { override: true } : {}),
      }
      const key = stableCommandKey('event-transition', { id: selectedEvent.event.id, version: selectedEvent.event.version, status, ...payload })
      await transitionEvent(selectedEvent.event.id, status, selectedEvent.event.version, {
        ...payload,
      }, key)
      releaseCommandKey('event-transition')
      setEventReason('')
      setShowCancelPrompt(false)
      setShowRewindPrompt(false)
      setAcceptanceWarning(null)
      setReadinessBlockers(null)
      setCompletionBlockers(null)
      setPendingTargetStatus(null)
      setOverrideReason('')
      setOutcomeSummary('')
      await selectEvent(selectedEvent.event.id)
    } catch (error: any) {
      const errCode = error?.code
      if (errCode === 'TASK_ACCEPTANCE_PENDING') {
        const details = error?.details
        setAcceptanceWarning(Array.isArray(details) ? details : [])
      } else if (errCode === 'READINESS_BLOCKED') {
        const details = error?.details
        setReadinessBlockers(Array.isArray(details) ? details : [])
        setPendingTargetStatus(status)
      } else if (errCode === 'COMPLETION_BLOCKED') {
        const details = error?.details
        setCompletionBlockers(Array.isArray(details) ? details : [])
      } else {
        useToastStore.getState().addToast(operationsErrorText(errCode, error?.message || 'Không thể chuyển giai đoạn sự kiện'), 'error')
      }
    } finally { setTransitioningEvent(false) }
  }

  const handleResumeAutomation = async () => {
    if (!selectedEvent?.event.automationPaused || !canMutate) return
    setTransitioningEvent(true)
    try {
      const reason = 'Người quản lý chủ động tiếp tục tự động chuyển giai đoạn.'
      const key = stableCommandKey('event-resume', { id: selectedEvent.event.id, version: selectedEvent.event.version, reason })
      await resumeEventAutomation(selectedEvent.event.id, selectedEvent.event.version, reason, key)
      releaseCommandKey('event-resume')
      await selectEvent(selectedEvent.event.id)
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể tiếp tục tự động chuyển giai đoạn'), 'error')
    } finally { setTransitioningEvent(false) }
  }

  const handleAcceptDispatch = async (invitation: OperationTaskDispatchInvitation) => {
    if (busyInbox.has(invitation.id)) return
    setInboxBusy(invitation.id, true)
    try {
      const key = stableCommandKey('accept-dispatch', { id: invitation.id, version: invitation.version, target: invitation.target })
      await acceptTaskDispatch(invitation, key)
      releaseCommandKey('accept-dispatch')
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể nhận nhiệm vụ'), 'error')
    } finally { setInboxBusy(invitation.id, false) }
  }

  const handleMarkReminderRead = async (reminder: OperationReminder) => {
    if (busyInbox.has(reminder.id)) return
    setInboxBusy(reminder.id, true)
    try {
      const key = stableCommandKey('reminder-read', { id: reminder.id, version: reminder.version })
      await markReminderRead(reminder, key)
      releaseCommandKey('reminder-read')
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể đánh dấu đã đọc'), 'error')
    } finally { setInboxBusy(reminder.id, false) }
  }

  const handleCancelReminder = async (reminder: OperationReminder) => {
    if (busyInbox.has(reminder.id)) return
    setInboxBusy(reminder.id, true)
    try {
      const key = stableCommandKey('reminder-cancel', { id: reminder.id, version: reminder.version })
      await cancelReminder(reminder, key)
      releaseCommandKey('reminder-cancel')
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể hủy lịch nhắc'), 'error')
    } finally { setInboxBusy(reminder.id, false) }
  }

  const renderKpiStrip = () => (
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
  )

  const renderEventsSection = () => (
    <Surface as="section" variant="card" className="overflow-hidden rounded-2xl border border-surface-border shadow-xs flex flex-col" aria-label="Sự kiện đang diễn ra">
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

      {events.length > 2 && (
        <div className="px-3 py-2 border-b border-surface-border bg-surface-ground/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
            <input
              type="search"
              aria-label="Tìm kiếm sự kiện"
              placeholder="Tìm theo tên hoặc địa điểm..."
              value={eventSearchQuery}
              onChange={e => setEventSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-surface-border bg-surface-card text-text-main placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-parish-primary"
            />
            {eventSearchQuery && (
              <button
                type="button"
                aria-label="Xóa tìm kiếm sự kiện"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text-main"
                onClick={() => setEventSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      <div className="divide-y divide-surface-border flex-1">
        {events.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Calendar}
              title="Chưa có sự kiện nào"
              description="Hiện không có sự kiện hoạt động nào trong phạm vi quản lý của bạn."
            />
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Calendar}
              title="Không tìm thấy sự kiện"
              description={`Không có sự kiện nào khớp với từ khóa "${eventSearchQuery}".`}
            />
          </div>
        ) : (
          filteredEvents.map(event => (
            <article
              key={event.id}
              className="group p-4 cursor-pointer transition-colors hover:bg-surface-hover/50"
              onClick={() => {
                if (!isOnline || source === 'cache') return
                setPendingEventId(event.id)
                void selectEvent(event.id).catch(() => undefined).finally(() => {
                  setPendingEventId(current => (current === event.id ? null : current))
                })
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="m-0 truncate text-sm font-bold text-text-main group-hover:text-parish-primary transition-colors">
                      {event.title}
                    </h3>
                    <Badge tone="neutral">{scopeBadgeOf(event)}</Badge>
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
                  loading={detailLoading && pendingEventId === event.id}
                  onClick={e => {
                    e.stopPropagation()
                    setPendingEventId(event.id)
                    void selectEvent(event.id).catch(() => undefined).finally(() => {
                      setPendingEventId(current => (current === event.id ? null : current))
                    })
                  }}
                >
                  Xem chi tiết
                </Button>
              </div>
            </article>
          ))
        )}
        {eventHasMore && (
          <div className="p-3 text-center bg-surface-ground/20">
            <Button variant="secondary" size="sm" disabled={!isOnline || source !== 'server' || loading} onClick={() => void loadMoreEvents().catch(() => undefined)}>
              Tải thêm sự kiện
            </Button>
          </div>
        )}
      </div>
    </Surface>
  )

  const renderMyTasksSection = () => (
    <Surface as="section" variant="card" className="overflow-hidden rounded-2xl border border-surface-border shadow-xs flex flex-col" aria-label="Việc của tôi">
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
                disabled={!canMutate || busyInbox.has(invitation.id)}
                loading={busyInbox.has(invitation.id)}
                onClick={() => void handleAcceptDispatch(invitation)}
              >
                Nhận nhiệm vụ
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Quick Filter Chips — intentionally hand-rolled, not DS FilterChips:
          DS pills are 32px/grouped 30px tall, below the 44px mobile touch
          invariant; these keep role=group + aria-pressed + min-h-44. (B5) */}
      <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-surface-ground/40 border-b border-surface-border" role="group" aria-label="Lọc công việc theo trạng thái">
        {myTaskFilterOptions.map(opt => (
          <button
            key={opt.key}
            type="button"
            aria-pressed={myTaskFilter === opt.key}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] sm:min-h-0 inline-flex items-center justify-center mobile-touch-target ${
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
              description={
                myTaskFilter === 'ALL'
                  ? 'Hiện không có công việc nào cần xử lý.'
                  : `Không có công việc nào ở trạng thái ${myTaskFilterOptions.find(o => o.key === myTaskFilter)?.label.toLowerCase()}.`
              }
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
                    {mutable && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!canMutate || busyTask === task.id}
                        onClick={() => void handleTask(task, 'BLOCKED')}
                      >
                        Báo bị chặn
                      </Button>
                    )}
                    {mutable && (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={!canMutate || busyTask === task.id}
                        onClick={() => void handleTask(task, 'CANCELLED')}
                      >
                        Hủy việc
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
  )

  const renderInboxSection = () => (
    <Surface as="section" variant="card" className="overflow-hidden rounded-2xl border border-surface-border shadow-xs" aria-label="Hộp nhắc việc">
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
                <Button variant="secondary" size="sm" disabled={!canMutate || busyInbox.has(reminder.id)} loading={busyInbox.has(reminder.id)} onClick={() => void handleMarkReminderRead(reminder)}>
                  Đánh dấu đã đọc
                </Button>
              )}
              {reminder.status === 'PENDING' && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canMutate || busyInbox.has(reminder.id)}
                  loading={busyInbox.has(reminder.id)}
                  onClick={() => void handleCancelReminder(reminder)}
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
  )

  const renderUtilitiesSection = () => (
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
        {isMobileLayout && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setUtilitiesExpanded(value => !value)} aria-expanded={utilitiesExpanded}>
            {utilitiesExpanded ? 'Thu gọn' : 'Mở tiện ích'}
          </Button>
        )}
      </div>

      {(!isMobileLayout || utilitiesExpanded) && (
        <Suspense fallback={<div className="p-6"><SkeletonCardGrid count={3} /></div>}>
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
              creationOptions={creationOptions}
              onEventCreated={async eventId => {
                await fetch()
                await selectEvent(eventId)
              }}
            />
          </TabPanel>
        </Suspense>
      )}
    </Surface>
  )

  if (loading && events.length === 0 && tasks.length === 0) {
    return <DesktopAppShell width="wide" embedded={mode === 'mobile'}><SkeletonCardGrid count={5} /></DesktopAppShell>
  }

  return (
    <DesktopAppShell width="wide" embedded={isMobileLayout} className="flex flex-col gap-5">
      <PageHeader
        title="Sự Kiện & Công Việc"
        description="Điều phối trách nhiệm, tiến độ và các điểm đang chặn trước ngày sự kiện."
        icon={<ClipboardList aria-hidden="true" className="h-6 w-6" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {canCreateAnything && (
              <div className="relative" ref={createMenuRef}>
                <Button ref={createMenuButtonRef} size="sm" leadingIcon={<Plus className="h-4 w-4" />} disabled={!canMutate} onClick={() => setShowCreateMenu(value => !value)} aria-haspopup="menu" aria-expanded={showCreateMenu}>
                  Tạo mới
                </Button>
                {!isMobileLayout && showCreateMenu && canMutate && (
                  <div
                    role="menu"
                    aria-label="Tạo mới"
                    className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-lg"
                    onKeyDown={event => {
                      if (event.key === 'ArrowDown') { event.preventDefault(); focusCreateMenuItem(1) }
                      else if (event.key === 'ArrowUp') { event.preventDefault(); focusCreateMenuItem(-1) }
                      else if (event.key === 'Home') { event.preventDefault(); focusCreateMenuItem('first') }
                      else if (event.key === 'End') { event.preventDefault(); focusCreateMenuItem('last') }
                    }}
                  >
                    {canCreateXuDoan && (
                      <button type="button" role="menuitem" className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-surface-hover" onClick={() => openCreateEvent('XU_DOAN')}>
                        <span className="text-sm font-bold text-text-main">Tạo sự kiện Xứ đoàn</span>
                        <span className="text-xs text-text-muted">Toàn Xứ đoàn · nhiều Ban/Ngành phối hợp</span>
                      </button>
                    )}
                    {unitCreationOptions.filter(unit => unit.canCreateEvent).map(unit => (
                      <button key={`event-${unit.id}`} type="button" role="menuitem" className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-surface-hover" onClick={() => openCreateEvent('UNIT', unit.id)}>
                        <span className="text-sm font-bold text-text-main">Tạo sự kiện {unit.name}</span>
                        <span className="text-xs text-text-muted">Sự kiện chuyên môn · {unit.unitType === 'BRANCH' ? 'Ngành' : 'Ban'}</span>
                      </button>
                    ))}
                    {unitCreationOptions.filter(unit => unit.canCreateTask).map(unit => (
                      <button key={`task-${unit.id}`} type="button" role="menuitem" className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-surface-hover" onClick={() => openCreateStandaloneTask(unit.id)}>
                        <span className="text-sm font-bold text-text-main">Tạo Task · {unit.name}</span>
                        <span className="text-xs text-text-muted">Việc độc lập, không cần sự kiện</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
          <span>{operationsOfflineBannerText({ source, cacheSavedAt })}</span>
        </Surface>
      )}

      {error && <ErrorState message={error} onRetry={isOnline ? () => void fetch().catch(() => undefined) : undefined} />}

      <ModalShell
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title={createScope.kind === 'XU_DOAN' ? 'Tạo sự kiện Xứ đoàn' : 'Tạo sự kiện chuyên môn'}
        subtitle="Tạo một lần tại Operations; sự kiện công khai sẽ tự xuất hiện trên Lịch."
        mobileDisplay="fullscreen"
        maxWidth="640px"
      >
        <CreateEventForm
          key={`create-event:${createScope.kind}:${createScope.unitId}`}
          initialScopeKind={createScope.kind}
          initialScopeUnitId={createScope.unitId}
          variant="sheet"
          onClose={() => setShowCreate(false)}
        />
      </ModalShell>

      <ModalShell
        isOpen={showStandaloneTask}
        onClose={() => setShowStandaloneTask(false)}
        title="Tạo Task độc lập"
        subtitle="Việc của một Ban/Ngành, không cần sự kiện."
        mobileDisplay="fullscreen"
        maxWidth="640px"
      >
        <StandaloneTaskForm
          key={`standalone-task:${standaloneScopeUnitId}`}
          initialScopeUnitId={standaloneScopeUnitId}
          variant="sheet"
          onClose={() => setShowStandaloneTask(false)}
        />
      </ModalShell>

      {isMobileLayout && canCreateAnything && (
        <ModalShell
          isOpen={showCreateMenu && canMutate}
          onClose={() => setShowCreateMenu(false)}
          mobileDisplay="bottom-sheet"
          title="Tạo mới"
          subtitle="Chọn loại sự kiện hoặc nhiệm vụ cần khởi tạo"
          maxWidth="480px"
        >
          <div role="menu" aria-label="Tạo mới" className="space-y-2 py-1">
            {canCreateXuDoan && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-xl border border-surface-border bg-surface-card p-3.5 text-left transition-colors hover:bg-surface-hover active:bg-surface-active min-h-[56px] mobile-touch-target"
                onClick={() => {
                  setShowCreateMenu(false)
                  openCreateEvent('XU_DOAN')
                }}
              >
                <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-bold text-text-main">Tạo sự kiện Xứ đoàn</p>
                  <p className="m-0 text-xs text-text-muted">Toàn Xứ đoàn · nhiều Ban/Ngành phối hợp</p>
                </div>
              </button>
            )}
            {unitCreationOptions.filter(unit => unit.canCreateEvent).map(unit => (
              <button
                key={`event-${unit.id}`}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-xl border border-surface-border bg-surface-card p-3.5 text-left transition-colors hover:bg-surface-hover active:bg-surface-active min-h-[56px] mobile-touch-target"
                onClick={() => {
                  setShowCreateMenu(false)
                  openCreateEvent('UNIT', unit.id)
                }}
              >
                <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-bold text-text-main">Tạo sự kiện {unit.name}</p>
                  <p className="m-0 text-xs text-text-muted">Sự kiện chuyên môn · {unit.unitType === 'BRANCH' ? 'Ngành' : 'Ban'}</p>
                </div>
              </button>
            ))}
            {unitCreationOptions.filter(unit => unit.canCreateTask).map(unit => (
              <button
                key={`task-${unit.id}`}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-xl border border-surface-border bg-surface-card p-3.5 text-left transition-colors hover:bg-surface-hover active:bg-surface-active min-h-[56px] mobile-touch-target"
                onClick={() => {
                  setShowCreateMenu(false)
                  openCreateStandaloneTask(unit.id)
                }}
              >
                <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
                  <ListTodo className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-bold text-text-main">Tạo Task · {unit.name}</p>
                  <p className="m-0 text-xs text-text-muted">Việc độc lập, không cần sự kiện</p>
                </div>
              </button>
            ))}
          </div>
        </ModalShell>
      )}

      {canCreateAnything && canMutate && isMobileLayout && (
        <button
          type="button"
          aria-label="Tạo mới sự kiện hoặc nhiệm vụ"
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-parish-primary text-white shadow-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parish-primary focus-visible:ring-offset-2 sm:hidden"
          onClick={() => setShowCreateMenu(true)}
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
      {isMobileLayout ? (
        <>
          {renderInboxSection()}
          {renderMyTasksSection()}
          {renderEventsSection()}
          {renderKpiStrip()}
          {renderUtilitiesSection()}
        </>
      ) : (
        <>
          {renderKpiStrip()}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
            {renderEventsSection()}
            {renderMyTasksSection()}
          </div>
          {renderInboxSection()}
          {renderUtilitiesSection()}
        </>
      )}

      {selectedEvent && (
        <ModalShell
          isOpen={Boolean(selectedEvent)}
          onClose={handleCloseEventModal}
          mobileDisplay="bottom-sheet"
          title={selectedEvent.event.title}
          subtitle={`${new Date(selectedEvent.event.startsAt).toLocaleString('vi-VN')} · ${selectedEvent.event.location || 'Chưa có địa điểm'} · Tiến độ chuẩn bị ${selectedEvent.readiness.percent}%`}
          icon={<CalendarClock aria-hidden="true" className="h-5 w-5 text-parish-primary" />}
          headerActions={
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral" className="font-bold text-xs">
                {scopeBadgeOf(selectedEvent.event)}
              </Badge>
              {selectedEvent.organizer?.displayName && (
                <Badge tone="neutral" className="font-bold text-xs" title="Người chịu trách nhiệm điều hành sự kiện">
                  Phụ trách: {selectedEvent.organizer.displayName}
                </Badge>
              )}
              <Badge tone={statusTone(selectedEvent.event.status)} className="font-bold text-xs uppercase">
                {statusLabel[selectedEvent.event.status] || selectedEvent.event.status}
              </Badge>
            </div>
          }
          maxWidth="1040px"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCloseEventModal}
              >
                Đóng chi tiết
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                {previousEventStatus[selectedEvent.event.status] && selectedEvent.permissions['operations.event.transition'] && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={transitioningEvent}
                    disabled={!canMutate || showRewindPrompt}
                    onClick={() => { setShowCancelPrompt(false); setEventReason(''); setShowRewindPrompt(true) }}
                    leadingIcon={<ArrowLeft className="h-4 w-4" />}
                  >
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
          }
        >
          <div className="space-y-5" aria-label="Chi tiết sự kiện">
            {selectedEvent.permissions['operations.event.manage'] && !selectedEventClosed && selectedEvent.event.status !== 'LIVE' && (selectedEvent.event.visibility !== 'PUBLIC_SUMMARY' || selectedEvent.permissions['operations.event.publish_public']) && (
              <EventEditForm detail={selectedEvent} />
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

              {/* Status & Readiness summary line */}
              {selectedEvent.event.status !== 'CANCELLED' && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-surface-border/80 text-xs text-text-muted">
                  <span>Trạng thái hiện tại: <span className="font-semibold text-text-main">{statusLabel[selectedEvent.event.status] || selectedEvent.event.status}</span></span>
                  <span>Tiến độ chuẩn bị: <span className="font-semibold text-parish-primary">{selectedEvent.readiness.percent}%</span></span>
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
                value={activeModalTab}
                onValueChange={setEventModalTab}
              />
            </div>

            {/* 4. NỘI DUNG THEO TABS */}
            {/* Tab 1: Nhiệm vụ & Phân công */}
            <TabPanel tabsId="event-modal-tabs" value="tasks" activeValue={activeModalTab} className="space-y-5">
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
                    {/* Filter Chips — same DS-deviation rationale as the task-board chips above (B5). */}
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc task theo trạng thái">
                      {taskFilterOptions.map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          aria-pressed={taskStatusFilter === opt.key}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] sm:min-h-0 inline-flex items-center justify-center mobile-touch-target ${
                            taskStatusFilter === opt.key
                              ? 'bg-parish-primary text-white shadow-xs'
                              : 'bg-surface-card text-text-muted hover:text-text-main border border-surface-border hover:bg-surface-hover'
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
                    <div className="space-y-4">
                      {taskGroups.filter(group => group.tasks.length > 0).map(group => (
                        <section key={group.key} aria-label={group.label ?? 'Task của sự kiện'}>
                          {group.label && (
                            <h4 className="m-0 mb-2 text-xs font-extrabold uppercase tracking-wider text-text-muted">{group.label} ({group.tasks.length})</h4>
                          )}
                          <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface-card overflow-hidden">
                            {group.tasks.map(task => (
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
                            {selectedEvent.permissions['operations.task.manage'] && task.status !== 'DONE' && task.status !== 'CANCELLED' && (
                              <Button variant="ghost" size="sm" disabled={!isOnline || source !== 'server'} onClick={() => openEditTask(task)}>
                                Sửa
                              </Button>
                            )}
                            <Button
                              variant={selectedTask?.task.id === task.id ? 'primary' : 'ghost'}
                              size="sm"
                              loading={taskDetailLoading && pendingTaskId === task.id}
                              disabled={!isOnline || source !== 'server'}
                              onClick={() => {
                                setPendingTaskId(task.id)
                                void selectTask(task.id).catch(() => undefined).finally(() => {
                                  setPendingTaskId(current => (current === task.id ? null : current))
                                })
                              }}
                            >
                              Checklist
                            </Button>
                          </div>
                        </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <EventTaskForm detail={selectedEvent} />
                  <TaskAssignForm detail={selectedEvent} />
                </div>
              </div>

              {/* Checklist của nhiệm vụ đã chọn */}
              {selectedEvent && <TaskChecklistSection />}
            </TabPanel>

            {/* Tab 2: Nhóm công tác */}
            <TabPanel tabsId="event-modal-tabs" value="workstreams" activeValue={activeModalTab}>
              <WorkstreamPanel key={selectedEvent.event.id} event={selectedEvent} enabled={canMutate} fieldUnits={unitCreationOptions} refresh={() => selectEvent(selectedEvent.event.id)} />
            </TabPanel>

            {/* Tab 3: Lập lịch nhắc việc */}
            <TabPanel tabsId="event-modal-tabs" value="reminders" activeValue={activeModalTab} className="space-y-4">
              {selectedEvent.permissions['operations.event.manage'] && ['DRAFT', 'PLANNING', 'PREPARING', 'READY'].includes(selectedEvent.event.status) ? (
                <>
                  <EventReminderForm key={`reminder-${selectedEvent.event.id}`} event={selectedEvent} enabled={canMutate} />
                  {selectedTask && <EventReminderForm key={`task-reminder-${selectedTask.task.id}`} event={selectedEvent} task={selectedTask} enabled={canMutate} />}
                </>
              ) : (
                <EmptyState
                  icon={Bell}
                  title="Không thể đặt lịch nhắc việc"
                  description={
                    !['DRAFT', 'PLANNING', 'PREPARING', 'READY'].includes(selectedEvent.event.status)
                      ? 'Sự kiện đang diễn ra (LIVE) hoặc đã kết thúc. Tính năng lập lịch nhắc tự động chỉ áp dụng trong giai đoạn chuẩn bị.'
                      : 'Bạn không có quyền quản lý lịch nhắc việc cho sự kiện này.'
                  }
                  className="py-8"
                />
              )}
            </TabPanel>

            {/* Tab 4: Mẫu sự kiện */}
            <TabPanel tabsId="event-modal-tabs" value="templates" activeValue={activeModalTab}>
              <Suspense fallback={<div className="p-4"><SkeletonCardGrid count={2} /></div>}>
                <EventTemplatesPanel
                  key={`templates-${selectedEvent.event.id}`}
                  mode="source"
                  enabled={canMutate}
                  sourceEvent={selectedEvent}
                  canPublishPublic={Boolean(selectedEvent.permissions['operations.event.publish_public'])}
                  creationOptions={creationOptions}
                  onTemplatesChanged={() => setTemplateCatalogRevision(value => value + 1)}
                  onEventCreated={async eventId => { await fetch(); await selectEvent(eventId) }}
                />
              </Suspense>
            </TabPanel>

            {/* Tab 5: Đúc kết sau sự kiện */}
            {selectedEvent.event.status === 'COMPLETED' && (
              <TabPanel tabsId="event-modal-tabs" value="retrospective" activeValue={activeModalTab}>
                <EventRetrospectivePanel key={`retrospective-${selectedEvent.event.id}`} detail={selectedEvent} enabled={canMutate} refresh={() => selectEvent(selectedEvent.event.id)} />
              </TabPanel>
            )}
          </div>
        </ModalShell>
      )}

      {!selectedEvent && <TaskChecklistSection />}

      <ModalShell
        isOpen={showEditTask && editingTask !== null}
        onClose={() => { if (!savingTask) { setShowEditTask(false); setEditingTask(null) } }}
        title="Sửa nhiệm vụ"
        subtitle={editingTask?.title}
      >
        <form className="space-y-3" onSubmit={handleUpdateTask}>
          <TextInput aria-label="Tên nhiệm vụ" className="w-full" value={taskEditDraft.title} required maxLength={300} disabled={savingTask} onChange={event => setTaskEditDraft(value => ({ ...value, title: event.target.value }))} />
          <TextArea aria-label="Mô tả nhiệm vụ" className="w-full" value={taskEditDraft.description} maxLength={5000} disabled={savingTask} onChange={event => setTaskEditDraft(value => ({ ...value, description: event.target.value }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select aria-label="Ưu tiên nhiệm vụ" className="w-full" value={taskEditDraft.priority} disabled={savingTask} onChange={event => setTaskEditDraft(value => ({ ...value, priority: event.target.value as OperationTask['priority'] }))}>
              <option value="LOW">Ưu tiên thấp</option>
              <option value="NORMAL">Ưu tiên bình thường</option>
              <option value="HIGH">Ưu tiên cao</option>
              <option value="URGENT">Khẩn</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-text-main">
              <input type="checkbox" checked={taskEditDraft.isRequired} disabled={savingTask} onChange={event => setTaskEditDraft(value => ({ ...value, isRequired: event.target.checked }))} /> Nhiệm vụ bắt buộc
            </label>
            <TextInput aria-label="Hạn nhiệm vụ" className="w-full" type="datetime-local" value={taskEditDraft.dueAt} disabled={savingTask} onChange={event => setTaskEditDraft(value => ({ ...value, dueAt: event.target.value }))} />
            <TextInput aria-label="Bắt đầu ca nhiệm vụ" className="w-full" type="datetime-local" value={taskEditDraft.scheduledStartAt} disabled={savingTask} onChange={event => setTaskEditDraft(value => ({ ...value, scheduledStartAt: event.target.value }))} />
            <TextInput aria-label="Kết thúc ca nhiệm vụ" className="w-full" type="datetime-local" value={taskEditDraft.scheduledEndAt} disabled={savingTask} onChange={event => setTaskEditDraft(value => ({ ...value, scheduledEndAt: event.target.value }))} />
          </div>
          <p className="m-0 text-xs text-text-muted">Máy chủ quyết định thay đổi nào là quan trọng: sửa tên, mô tả, mức bắt buộc, hạn hoặc ca nhiệm vụ sẽ yêu cầu người đã nhận việc xác nhận lại. Đổi ưu tiên không làm mất xác nhận cũ.</p>
          {taskEditScheduleInvalid && <p className="m-0 text-xs text-parish-danger">Ca nhiệm vụ phải có đủ giờ bắt đầu và kết thúc, giờ kết thúc phải sau giờ bắt đầu.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={savingTask} onClick={() => { setShowEditTask(false); setEditingTask(null) }}>Hủy</Button>
            {taskEditFormError && <p role="alert" className="m-0 text-xs text-parish-danger">{taskEditFormError}</p>}
            <Button type="submit" size="sm" loading={savingTask} disabled={!taskEditDraft.title.trim() || taskEditScheduleInvalid}>Lưu thay đổi</Button>
          </div>
        </form>
      </ModalShell>

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

      {/* Modal nhập lý do khi task chuyển BLOCKED hoặc CANCELLED */}
      <ModalShell
        isOpen={taskReasonAction !== null}
        onClose={() => { if (!taskReasonSubmitting) setTaskReasonAction(null) }}
        title={taskReasonAction?.status === 'BLOCKED' ? 'Báo Điểm Nghẽn (Bị Chặn)' : 'Hủy Nhiệm Vụ'}
        subtitle={taskReasonAction?.task.title}
      >
        <form onSubmit={e => { e.preventDefault(); void handleConfirmTaskReason() }} className="space-y-4">
          <p className="text-sm text-text-muted">
            {taskReasonAction?.status === 'BLOCKED'
              ? 'Vui lòng nêu rõ lý do khiến nhiệm vụ không thể tiếp tục thực hiện để Ban Điều hành hỗ trợ giải quyết.'
              : 'Vui lòng nêu rõ lý do hủy nhiệm vụ này. Thao tác hủy sẽ thông báo đến những người đã được phân công.'}
          </p>
          <TextArea
            aria-label="Lý do"
            required
            rows={3}
            maxLength={2000}
            placeholder={taskReasonAction?.status === 'BLOCKED' ? 'Mô tả trở ngại, thiếu vật tư, nhân sự...' : 'Lý do hủy nhiệm vụ...'}
            value={taskReasonText}
            onChange={e => setTaskReasonText(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={taskReasonSubmitting}
              onClick={() => setTaskReasonAction(null)}
            >
              Đóng
            </Button>
            <Button
              variant={taskReasonAction?.status === 'BLOCKED' ? 'primary' : 'danger'}
              type="submit"
              loading={taskReasonSubmitting}
              disabled={!taskReasonText.trim()}
            >
              {taskReasonAction?.status === 'BLOCKED' ? 'Xác nhận bị chặn' : 'Xác nhận hủy việc'}
            </Button>
          </div>
        </form>
      </ModalShell>

      {/* Modal Override cho READINESS_BLOCKED */}
      <ModalShell
        isOpen={readinessBlockers !== null}
        onClose={() => { setReadinessBlockers(null); setOverrideReason('') }}
        title="Điều kiện Sẵn sàng Chưa Hoàn tất"
        subtitle={selectedEvent?.event.title}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Chưa thể chuyển sự kiện sang giai đoạn tiếp theo do còn các điểm nghẽn sau:
          </p>
          <ul className="space-y-2 max-h-48 overflow-y-auto border border-surface-border rounded-xl p-3 bg-surface-ground/30">
            {readinessBlockers?.map((blocker, index) => (
              <li key={blocker.id || index} className="flex items-start gap-2 text-sm text-text-main">
                <AlertTriangle className="h-4 w-4 text-parish-warning shrink-0 mt-0.5" />
                <span>{blocker.label || 'Điều kiện chưa hoàn tất'}</span>
              </li>
            ))}
          </ul>
          {selectedEvent?.permissions['operations.event.override_readiness'] ? (
            <div className="space-y-3 pt-2 border-t border-surface-border">
              <p className="text-sm font-semibold text-text-main">
                Bạn có quyền Ghi đè (Override Readiness). Nhập lý do bắt buộc để tiếp tục:
              </p>
              <TextArea
                aria-label="Lý do ghi đè"
                required
                rows={3}
                maxLength={2000}
                placeholder="Nhập lý do ghi đè điều kiện sẵn sàng..."
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setReadinessBlockers(null); setOverrideReason('') }}>
                  Hủy
                </Button>
                <Button
                  variant="danger"
                  loading={transitioningEvent}
                  disabled={!overrideReason.trim()}
                  onClick={() => {
                    const status = pendingTargetStatus
                    if (status) {
                      void handleEventTransition(status, true, overrideReason)
                    }
                  }}
                >
                  Xác nhận Ghi đè & Chuyển
                </Button>
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-surface-border">
              <p className="text-sm text-parish-danger">
                Bạn không có quyền Ghi đè (cần quyền operations.event.override_readiness). Vui lòng hoàn thành các điều kiện trên hoặc báo Trưởng Ban Điều hành.
              </p>
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => { setReadinessBlockers(null); setOverrideReason('') }}>
                  Đã hiểu
                </Button>
              </div>
            </div>
          )}
        </div>
      </ModalShell>

      {/* Modal Cảnh báo cho COMPLETION_BLOCKED */}
      <ModalShell
        isOpen={completionBlockers !== null}
        onClose={() => setCompletionBlockers(null)}
        title="Chưa thể Đóng Sự kiện"
        subtitle={selectedEvent?.event.title}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Sự kiện còn các nhiệm vụ bắt buộc hoặc điều kiện chưa hoàn tất:
          </p>
          <ul className="space-y-2 max-h-48 overflow-y-auto border border-surface-border rounded-xl p-3 bg-surface-ground/30">
            {completionBlockers?.map((blocker, index) => (
              <li key={blocker.id || index} className="flex items-start gap-2 text-sm text-text-main">
                <CircleAlert className="h-4 w-4 text-parish-danger shrink-0 mt-0.5" />
                <span>{blocker.label || 'Nhiệm vụ bắt buộc chưa hoàn thành'}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-muted">
            Vui lòng kiểm tra và hoàn thành các nhiệm vụ bắt buộc trong tab Nhiệm vụ trước khi thực hiện Hoàn tất sự kiện.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setCompletionBlockers(null)}>
              Đã hiểu
            </Button>
          </div>
        </div>
      </ModalShell>
    </DesktopAppShell>
  )
}
