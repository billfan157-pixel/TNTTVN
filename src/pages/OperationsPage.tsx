import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Layers,
  LayoutTemplate,
  RefreshCw,
  Plus,
  ShieldCheck,
  Users,
  WifiOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { PageHeader } from '../components/common/PageHeader'
import { SubpageHeader } from '../components/common/SubpageHeader'
import { EmptyState, ErrorState, SkeletonCardGrid } from '../components/common/StateFeedback'
import { ModalShell } from '../components/common/ModalShell'
import {
  Badge,
  Button,
  Surface,
  TabPanel,
  Tabs,
  type SelectionItem,
} from '../components/common/ui'
import type { OperationEvent, OperationTask, OperationTaskDispatchInvitation } from '../lib/api/operations'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { useOperationsEventUrlSync } from '../hooks/useOperationsEventUrlSync'
import { useOperationsAutoRefresh } from '../hooks/useOperationsAutoRefresh'
import { useEventTransitionFlow } from '../hooks/useOperationsEventTransitionFlow'
import { operationsErrorText } from '../lib/operationsErrors'
import { newIdempotencyKey } from '../lib/api/core'
import { useOperationsStore } from '../stores/operationsStore'
import { useToastStore } from '../stores/toastStore'
import { WorkstreamPanel } from '../components/operations/WorkstreamPanel'
import { CreateMenuItems } from '../components/operations/CreateMenuItems'
import { OperationsEventList } from '../components/operations/OperationsEventList'
import { OperationsMyTaskBoard } from '../components/operations/OperationsMyTaskBoard'
import { OperationsInboxList } from '../components/operations/OperationsInboxList'
import { EventLifecycleHub } from '../components/operations/EventLifecycleHub'
import { EventTasksTab } from '../components/operations/EventTasksTab'
import { EventOverviewStats } from '../components/operations/EventOverviewStats'
import { TaskEditDialog } from '../components/operations/TaskEditDialog'
import { OperationsEventDialogs } from '../components/operations/OperationsEventDialogs'
import { TaskAcknowledgeDialog } from '../components/operations/TaskAcknowledgeDialog'
import { EventParticipantsPanel } from '../components/operations/EventParticipantsPanel'
import { EventReminderForm } from '../components/operations/EventReminderForm'
import { TaskChecklistSection } from '../components/operations/TaskChecklistSection'
const AvailabilityPanel = lazy(() => import('../components/operations/AvailabilityPanel').then(m => ({ default: m.AvailabilityPanel })))
const StandaloneWorkstreamsPanel = lazy(() => import('../components/operations/StandaloneWorkstreamsPanel').then(m => ({ default: m.StandaloneWorkstreamsPanel })))
import { EventRetrospectivePanel } from '../components/operations/EventRetrospectivePanel'
const EventTemplatesPanel = lazy(() => import('../components/operations/EventTemplatesPanel').then(m => ({ default: m.EventTemplatesPanel })))
import { CreateEventForm } from '../components/operations/CreateEventForm'
import { StandaloneTaskForm } from '../components/operations/StandaloneTaskForm'
import { EventEditForm } from '../components/operations/EventEditForm'
import { formatEventInstant, isTaskScheduleInvalid, operationsOfflineBannerText, isTerminalTask, isClosedEvent, statusLabel, statusTone, nextEventStatus, previousEventStatus, transitionLabel, toIso, toDateTimeInput } from '../components/operations/operationsViewHelpers'

// W3.2: the status vocabulary and lifecycle maps moved to operationsViewHelpers
// (single source shared with the extracted EventList / MyTaskBoard sections).
// EVENT_STEPS lives with the transition-flow hook.

type EventModalTab = 'tasks' | 'workstreams' | 'participants' | 'reminders' | 'templates' | 'retrospective'
type TaskStatusFilter = 'ALL' | 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'ARCHIVED'
type OperationsMobileTab = 'my-tasks' | 'events' | 'inbox' | 'utilities'

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
  const taskDetailLoading = useOperationsStore(s => s.taskDetailLoading)
  const loading = useOperationsStore(s => s.loading)
  const error = useOperationsStore(s => s.error)
  const source = useOperationsStore(s => s.source)
  const cacheSavedAt = useOperationsStore(s => s.cacheSavedAt)
  const mode = useEffectiveMode()
  const isMobileLayout = mode === 'mobile'
  const [mobileTab, setMobileTab] = useState<OperationsMobileTab>('my-tasks')
  // W2.9: "Tải thêm" needs its own spinner — the global `loading` also covers
  // initial fetch and background refetch, so users couldn't tell a page load
  // from a whole-list refresh. (W3.2: events moved into OperationsEventList,
  // which owns its own load-more busy state.)
  const [loadingMoreLists, setLoadingMoreLists] = useState<{ tasks: boolean; reminders: boolean; dispatches: boolean }>({ tasks: false, reminders: false, dispatches: false })
  const loadMoreList = (kind: 'tasks' | 'reminders' | 'dispatches') => {
    if (loadingMoreLists[kind]) return
    setLoadingMoreLists(current => ({ ...current, [kind]: true }))
    const run = kind === 'tasks' ? loadMoreTasks : kind === 'reminders' ? loadMoreReminders : loadMoreDispatches
    void run().catch(() => undefined).finally(() => {
      setLoadingMoreLists(current => ({ ...current, [kind]: false }))
    })
  }
  const [utilitiesExpanded, setUtilitiesExpanded] = useState(false)
  const eventTotal = useOperationsStore(s => s.eventTotal)
  const taskTotal = useOperationsStore(s => s.taskTotal)
  const taskHasMore = useOperationsStore(s => s.taskHasMore)
  const reminderHasMore = useOperationsStore(s => s.reminderHasMore)
  // W2.3: dispatch inbox pagination is now first-class (was silently capped).
  const dispatchTotal = useOperationsStore(s => s.dispatchTotal)
  const dispatchHasMore = useOperationsStore(s => s.dispatchHasMore)
  const fetch = useOperationsStore(s => s.fetch)
  const fetchCreationOptions = useOperationsStore(s => s.fetchCreationOptions)
  const loadMoreTasks = useOperationsStore(s => s.loadMoreTasks)
  const loadMoreReminders = useOperationsStore(s => s.loadMoreReminders)
  const loadMoreDispatches = useOperationsStore(s => s.loadMoreDispatches)
  const selectEvent = useOperationsStore(s => s.selectEvent)
  const selectTask = useOperationsStore(s => s.selectTask)
  const updateTask = useOperationsStore(s => s.updateTask)
  const acceptTaskDispatch = useOperationsStore(s => s.acceptTaskDispatch)
  const transitionTask = useOperationsStore(s => s.transitionTask)
  const acknowledgeTask = useOperationsStore(s => s.acknowledgeTask)
  const assignmentWarnings = useOperationsStore(s => s.assignmentWarnings)
  const isOnline = useOnlineStatus()
  // W3.2: the event search query, its W2.13 server-side debounce and the
  // per-row pending marker all moved into OperationsEventList with the list.
  const [busyTask, setBusyTask] = useState<string | null>(null)
  // W3.8: secondary row actions (decline / report-blocked / cancel) collapse
  // into an overflow menu so primary ones stay tappable on 320–390px screens.
  // The popup is fixed-position anchored to the trigger: the list Surface uses
  // overflow-hidden for rounded clipping, which would cut an absolute child.
  const [taskOverflow, setTaskOverflow] = useState<{ taskId: string; top: number; left: number; actions: Array<{ key: string; label: string; danger?: boolean; run: () => void }> } | null>(null)
  const taskOverflowRef = useRef<HTMLDivElement | null>(null)
  const taskOverflowTriggerRef = useRef<HTMLButtonElement | null>(null)
  const openTaskOverflow = (taskId: string, actions: Array<{ key: string; label: string; danger?: boolean; run: () => void }>, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    const menuHeight = Math.max(actions.length, 1) * 44 + 8
    const openUp = rect.bottom + menuHeight + 8 > window.innerHeight && rect.top > menuHeight + 8
    setTaskOverflow({
      taskId,
      actions,
      top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - 200, window.innerWidth - 208)),
    })
    requestAnimationFrame(() => {
      taskOverflowRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    })
  }
  const focusTaskOverflowItem = (direction: 1 | -1 | 'first' | 'last') => {
    const items = Array.from(taskOverflowRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (items.length === 0) return
    if (direction === 'first') { items[0]?.focus(); return }
    if (direction === 'last') { items[items.length - 1]?.focus(); return }
    const active = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(active + direction + items.length) % items.length]?.focus()
  }
  useEffect(() => {
    if (!taskOverflow) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (taskOverflowRef.current?.contains(target) || taskOverflowTriggerRef.current?.contains(target)) return
      setTaskOverflow(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setTaskOverflow(null)
        taskOverflowTriggerRef.current?.focus()
      } else if (event.key === 'Tab') {
        // W3.3 parity: leaving the menu by Tab dismisses it.
        setTaskOverflow(null)
      }
    }
    // A fixed popup detached from its row would float over unrelated content.
    const close = () => setTaskOverflow(null)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [taskOverflow])
  // P1-8: inbox commands (dispatch accept, reminder read/cancel) track their
  // own busy rows so one in-flight reminder action never locks unrelated
  // dispatch accepts, task transitions, or other reminder rows.
  const [busyInbox, setBusyInbox] = useState<Set<string>>(new Set())
  const setInboxBusy = (id: string, busy: boolean) => setBusyInbox(previous => {
    const next = new Set(previous)
    if (busy) next.add(id); else next.delete(id)
    return next
  })
  // Which row triggered the in-flight task detail load (store clears/keeps the
  // previous selection, so its id alone can't identify the spinner row).
  // W3.2: the event row's pending marker moved into OperationsEventList.
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  // A5': desktop dropdown keyboard/pointer dismissal targets.
  const createMenuRef = useRef<HTMLDivElement | null>(null)
  const createMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const focusCreateMenuItem = (direction: 1 | -1 | 'first' | 'last') => {
    const items = Array.from(createMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (items.length === 0) return
    // W3.3: 'first' now actually focuses (it used to compute an index but the
    // open-menu path never called it).
    if (direction === 'first') { items[0]?.focus(); return }
    if (direction === 'last') { items[items.length - 1]?.focus(); return }
    const active = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = (active + direction + items.length) % items.length
    items[next]?.focus()
  }
  useEffect(() => {
    // Desktop dropdown only — the mobile sheet is a ModalShell dialog that
    // already owns Escape/outside-click/focus behavior.
    if (isMobileLayout || !showCreateMenu) return
    // W3.3: move focus into the menu when it opens so arrow keys work right
    // away; the render is gated on canMutate so no items => no-op.
    const frame = requestAnimationFrame(() => focusCreateMenuItem('first'))
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
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isMobileLayout, showCreateMenu])
  const [showStandaloneTask, setShowStandaloneTask] = useState(false)
  const [createScope, setCreateScope] = useState<{ kind: 'XU_DOAN' | 'UNIT'; unitId: string }>({ kind: 'XU_DOAN', unitId: '' })
  const [standaloneScopeUnitId, setStandaloneScopeUnitId] = useState('')
  const [editingTask, setEditingTask] = useState<OperationTask | null>(null)
  const [showEditTask, setShowEditTask] = useState(false)
  // W1.7: task detail (checklist/comments/handover/restore) renders inside a
  // dialog derived from selectedTask — selecting a task IS the open state, so
  // every path that loads a detail (row button, Checklist button, reminder
  // "Mở") brings it in front of the user instead of at the page bottom.
  const [savingTask, setSavingTask] = useState(false)
  const [taskEditDraft, setTaskEditDraft] = useState({ title: '', description: '', dueAt: '', scheduledStartAt: '', scheduledEndAt: '', priority: 'NORMAL' as OperationTask['priority'], isRequired: false })
  const [eventModalTab, setEventModalTab] = useState<EventModalTab>('tasks')
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>('ALL')
  const [templateCatalogRevision, setTemplateCatalogRevision] = useState(0)

  // 1. Stable idempotency keys per form: same payload retry reuses the key so
  // the server dedups; changed payload or success releases it for a fresh key.
  // V9 hardening: slots are scoped per entity (`action:id`) so acting on task
  // B never evicts the pending key of task A — retrying A after a failure
  // replays instead of executing anew (and surfacing a confusing 409).
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

  // W4.3: accepting/declining now routes through a dialog with an optional
  // note (server `acknowledgementSchema.note` already supported it; the UI
  // was the missing half).
  const [ackNoteAction, setAckNoteAction] = useState<{ task: OperationTask; status: 'ACCEPTED' | 'DECLINED' } | null>(null)
  const [ackNoteText, setAckNoteText] = useState('')
  const [ackNoteSubmitting, setAckNoteSubmitting] = useState(false)

  // 4. (W3.2) Event transition flow — cancel/rewind prompts, structured-error
  // dialogs and automation resume — moved to useEventTransitionFlow unchanged.

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
    setShowRestorePrompt(false)
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
  // W3.2: event transition/cancel/rewind/override flow (extracted unchanged).
  // The flow object goes to EventLifecycleHub; the footer and the dialog
  // overlays still read a few fields directly.
  // W3.2: event transition/cancel/rewind/override flow (extracted unchanged).
  // The flow object goes to EventLifecycleHub + OperationsEventDialogs; only
  // the footer and reset helpers read individual fields directly here.
  const transitionFlow = useEventTransitionFlow({ selectedEvent, canMutate })
  const {
    setEventReason,
    setShowCancelPrompt, setShowRewindPrompt,
    setShowRestorePrompt, showRestorePrompt,
    setAcceptanceWarning, setOutcomeSummary,
    showCancelPrompt,
    showRewindPrompt,
    outcomeSummary,
    transitioningEvent,
    setReadinessBlockers,
    setCompletionBlockers,
    setPendingTargetStatus,
    setOverrideReason,
    handleEventTransition,
  } = transitionFlow
  // W1.3: KPI filter cards scroll the "Việc của tôi" section into view so the
  // filter change is visible on long mobile stacks (and harmless on desktop).
  // W3.1: useCallback keeps the memoized KPI strip's identity stable.
  const myTasksSectionRef = useRef<HTMLElement | null>(null)
  const activateKpiFilter = useCallback((filter: MyTaskFilter) => {
    setMyTaskFilter(filter)
    if (isMobileLayout) {
      setMobileTab('my-tasks')
    }
    const el = myTasksSectionRef.current
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [isMobileLayout])
  // W1.2: resolve reminder context (which event/task is being announced).
  // The tasks slice is mine=true and reminders only exist for resources the
  // recipient may view (server re-gated at create AND due-time), so titles are
  // resolved from the recipient's own scoped lists — never a server join.
  const taskTitleById = useMemo(() => new Map(tasks.map(task => [task.id, task.title])), [tasks])
  const eventTitleById = useMemo(() => new Map(events.map(event => [event.id, event.title])), [events])
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
  const closureBlockers = useMemo(() => selectedEvent?.closure?.blockers
    ?? selectedEvent?.tasks.filter(task => task.isRequired && task.status !== 'DONE').map(task => ({ type: 'TASK_INCOMPLETE', id: task.id, label: task.title }))
    ?? [], [selectedEvent])
  const completedTasksCount = useMemo(() => selectedEvent?.tasks.filter(t => t.status === 'DONE').length ?? 0, [selectedEvent])
  // W3.1: per-row `selectedEvent.assignees.filter(...)` inside the task map
  // was O(tasks × assignees) per render; precompute counts once per detail.
  const assigneeCountByTask = useMemo(() => {
    const counts = new Map<string, number>()
    if (selectedEvent) for (const item of selectedEvent.assignees) counts.set(item.taskId, (counts.get(item.taskId) ?? 0) + 1)
    return counts
  }, [selectedEvent])
  const totalTasksCount = selectedEvent?.tasks.length ?? 0
  const totalAssigneesCount = selectedEvent?.assignees.length ?? 0
  const totalWorkstreamsCount = selectedEvent?.workstreams.length ?? 0

  const filteredTasks = useMemo(() => selectedEvent?.tasks.filter(t => {
    if (taskStatusFilter === 'ALL') return t.status !== 'CANCELLED'
    if (taskStatusFilter === 'ARCHIVED') return t.status === 'CANCELLED'
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
          <span>{isMobileLayout ? 'Nhiệm vụ' : (isXuDoanEvent ? 'Nhiệm vụ chi tiết' : 'Nhiệm vụ')}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
            selectedEvent.tasks.some(t => t.status === 'BLOCKED')
              ? 'bg-parish-danger-bg text-parish-danger'
              : 'bg-surface-hover text-text-muted'
          }`}>
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
          <span>{isMobileLayout ? (isXuDoanEvent ? 'Mảng' : 'Nhóm') : (isXuDoanEvent ? 'Mảng & Ban/Ngành' : 'Nhóm công tác')}</span>
          <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-xs font-bold text-text-muted">
            {selectedEvent.workstreams.length}
          </span>
        </span>
      ),
      icon: <Layers className="h-4 w-4" />,
    }] : []),
    // W4.2a: participants tab (view open to all who can see the event; the
    // panel itself gates add/status behind operations.event.manage).
    {
      value: 'participants' as EventModalTab,
      label: (
        <span className="flex items-center gap-1.5">
          <span>{isMobileLayout ? 'Tham dự' : 'Người tham dự'}</span>
          <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-xs font-bold text-text-muted">
            {(selectedEvent.participants ?? []).length}
          </span>
        </span>
      ),
      icon: <Users className="h-4 w-4" />,
    },
    {
      value: 'reminders',
      label: <span>{isMobileLayout ? 'Nhắc việc' : 'Lập lịch nhắc việc'}</span>,
      icon: <Bell className="h-4 w-4" />,
    },
    {
      value: 'templates',
      label: <span>Mẫu</span>,
      icon: <LayoutTemplate className="h-4 w-4" />,
    },
    ...(selectedEvent.event.status === 'COMPLETED' ? [{
      value: 'retrospective' as EventModalTab,
      label: <span>{isMobileLayout ? 'Đúc kết' : 'Đúc kết sau sự kiện'}</span>,
      icon: <CheckCircle2 className="h-4 w-4" />,
    }] : []),
  ] : [], [selectedEvent, showFieldTab, isXuDoanEvent, isMobileLayout])

  // Tabs are dynamic (retrospective only when COMPLETED, workstreams only
  // when showFieldTab): if the selected tab disappears (e.g. rewind out of
  // COMPLETED), fall back to 'tasks' so the modal never renders an empty body.
  const activeModalTab = modalTabs.some(tab => tab.value === eventModalTab) ? eventModalTab : 'tasks'
  // W2.2: keep `?event=&tab=` and the detail modal in sync (deep link, F5, back).
  useOperationsEventUrlSync(activeModalTab, setEventModalTab)

  const taskFilterOptions: Array<{ key: TaskStatusFilter; label: string; count: number }> = useMemo(() => selectedEvent ? [
    { key: 'ALL', label: 'Tất cả', count: selectedEvent.tasks.filter(t => t.status !== 'CANCELLED').length },
    { key: 'TODO', label: 'Chưa làm', count: selectedEvent.tasks.filter(t => t.status === 'TODO').length },
    { key: 'IN_PROGRESS', label: 'Đang làm', count: selectedEvent.tasks.filter(t => t.status === 'IN_PROGRESS').length },
    { key: 'DONE', label: 'Hoàn tất', count: selectedEvent.tasks.filter(t => t.status === 'DONE').length },
    { key: 'BLOCKED', label: 'Bị chặn', count: selectedEvent.tasks.filter(t => t.status === 'BLOCKED').length },
    { key: 'ARCHIVED', label: 'Lưu trữ', count: selectedEvent.tasks.filter(t => t.status === 'CANCELLED').length },
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
  // W4.1: 90s read-only freshness poll while the tab is visible and the store
  // is on server data (ADR-110: never poll a cache snapshot, never offline).
  // Gating on `!loading` also serializes the interval across a slow tick: the
  // clock restarts after each response, so requests can never stack.
  useOperationsAutoRefresh(
    () => {
      if (useOperationsStore.getState().loading) return
      void fetch().catch(() => undefined)
    },
    { active: isOnline && source === 'server' && !loading },
  )

  type MyTaskFilter = 'ALL' | 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'DONE' | 'ARCHIVED'
  type UtilityTab = 'availability' | 'workstreams' | 'templates'

  const [myTaskFilter, setMyTaskFilter] = useState<MyTaskFilter>('ALL')
  const [utilityTab, setUtilityTab] = useState<UtilityTab>('availability')

  const pendingAcknowledgements = useMemo(() => tasks.filter(task => !isTerminalTask(task.status) && task.myAssignments?.some(assignment => assignment.acknowledgementStatus === 'PENDING')).length, [tasks])
  const pendingResponses = pendingAcknowledgements + dispatchInvitations.length
  const blockedTasksCount = useMemo(() => tasks.filter(task => task.status === 'BLOCKED').length, [tasks])
  const activeTasksCount = useMemo(() => tasks.filter(task => task.status === 'IN_PROGRESS' || task.status === 'TODO').length, [tasks])
  const archivedTasksCount = useMemo(() => tasks.filter(task => task.status === 'CANCELLED').length, [tasks])
  const activeTasksTotal = useMemo(() => tasks.filter(task => task.status !== 'CANCELLED').length, [tasks])
  // W3.1: the KPI sublabel used to run events.filter per render.
  const activeEventsCount = useMemo(() => events.filter(e => e.status !== 'COMPLETED' && e.status !== 'CANCELLED').length, [events])

  // W3.1: stable arrays — previously rebuilt every render, invalidating any
  // future memo of the consumers (chip lists stay small but identity churn
  // is what forced section re-renders).
  const myTaskFilterOptions = useMemo<Array<{ key: MyTaskFilter; label: string; count: number }>>(() => [
    { key: 'ALL', label: 'Tất cả', count: activeTasksTotal },
    { key: 'PENDING', label: 'Cần xác nhận', count: pendingResponses },
    { key: 'ACTIVE', label: 'Đang làm', count: activeTasksCount },
    { key: 'BLOCKED', label: 'Bị chặn', count: blockedTasksCount },
    { key: 'DONE', label: 'Đã xong', count: tasks.filter(t => t.status === 'DONE').length },
    { key: 'ARCHIVED', label: 'Lưu trữ', count: archivedTasksCount },
  ], [activeTasksTotal, pendingResponses, activeTasksCount, blockedTasksCount, tasks, archivedTasksCount])

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
      if (myTaskFilter === 'ARCHIVED') {
        return task.status === 'CANCELLED'
      }
      return task.status !== 'CANCELLED'
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

  const overviewCards = useMemo(() => {
    const cards: Array<{
      label: string
      sublabel: string
      value: number
      Icon: LucideIcon
      tone: 'primary' | 'teal' | 'warning' | 'danger'
      filterKey?: MyTaskFilter
    }> = [
      {
        label: 'Sự kiện',
        sublabel: `${activeEventsCount} đang hoạt động`,
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
    return cards
  }, [activeEventsCount, eventTotal, activeTasksCount, taskTotal, pendingResponses, blockedTasksCount])

  const handleTask = async (task: typeof tasks[number], action: 'DONE' | 'ACCEPTED' | 'DECLINED' | 'IN_PROGRESS' | 'BLOCKED' | 'CANCELLED') => {
    if (busyTask === task.id) return
    if (action === 'BLOCKED' || action === 'CANCELLED') {
      setTaskReasonAction({ task, status: action })
      setTaskReasonText('')
      return
    }
    // W4.3: Nhận/Từ chối asks for an optional note first, then sends.
    if (action === 'ACCEPTED' || action === 'DECLINED') {
      setAckNoteAction({ task, status: action })
      setAckNoteText('')
      return
    }
    setBusyTask(task.id)
    try {
      if (action === 'DONE' || action === 'IN_PROGRESS') {
        const key = stableCommandKey(`task-transition:${task.id}`, { id: task.id, version: task.version, status: action })
        await transitionTask(task, action, { idempotencyKey: key })
        releaseCommandKey(`task-transition:${task.id}`)
      }
      if (selectedEvent) await selectEvent(selectedEvent.event.id)
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể cập nhật trạng thái nhiệm vụ'), 'error')
    } finally { setBusyTask(null) }
  }

  const handleConfirmAckNote = async () => {
    if (!ackNoteAction || ackNoteSubmitting) return
    const { task, status } = ackNoteAction
    setAckNoteSubmitting(true)
    setBusyTask(task.id)
    try {
      const assignment = task.myAssignments?.find(item => item.acknowledgementStatus === 'PENDING')
      const note = ackNoteText.trim() || undefined
      const key = stableCommandKey(`task-acknowledge:${task.id}`, { id: task.id, assignmentId: assignment?.id, version: assignment?.version, status, note })
      await acknowledgeTask(task, status, note, key)
      releaseCommandKey(`task-acknowledge:${task.id}`)
      setAckNoteAction(null)
      setAckNoteText('')
      if (selectedEvent) await selectEvent(selectedEvent.event.id)
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể cập nhật trạng thái nhiệm vụ'), 'error')
    } finally { setAckNoteSubmitting(false); setBusyTask(null) }
  }

  const handleConfirmTaskReason = async () => {
    if (!taskReasonAction || !taskReasonText.trim() || taskReasonSubmitting) return
    setTaskReasonSubmitting(true)
    try {
      const { task, status } = taskReasonAction
      const options = status === 'BLOCKED'
        ? { blockedReason: taskReasonText.trim() }
        : { cancellationReason: taskReasonText.trim() }
      const key = stableCommandKey(`task-transition:${task.id}`, { id: task.id, version: task.version, status, ...options })
      await transitionTask(task, status, { ...options, idempotencyKey: key })
      releaseCommandKey(`task-transition:${task.id}`)
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
      const result = await updateTask(editingTask, payload, stableCommandKey(`update-task:${editingTask.id}`, { id: editingTask.id, version: editingTask.version, ...payload }))
      releaseCommandKey(`update-task:${editingTask.id}`)
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

  const handleAcceptDispatch = async (invitation: OperationTaskDispatchInvitation) => {
    if (busyInbox.has(invitation.id)) return
    setInboxBusy(invitation.id, true)
    try {
      const key = stableCommandKey(`accept-dispatch:${invitation.id}`, { id: invitation.id, version: invitation.version, target: invitation.target })
      await acceptTaskDispatch(invitation, key)
      releaseCommandKey(`accept-dispatch:${invitation.id}`)
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể nhận nhiệm vụ'), 'error')
    } finally { setInboxBusy(invitation.id, false) }
  }

  // W3.2: reminder read/cancel/reschedule handlers moved into
  // OperationsInboxList (which keeps the W2.12 manager-gated editor).

  // W3.1: memoized section element — with a stable overviewCards this re-renders
  // only when the cards data or the pressed-filter highlight actually change.
  const kpiStrip = useMemo(() => (
    <section aria-label="Tổng quan công việc" className={isMobileLayout ? "grid grid-cols-2 gap-2.5" : "grid grid-cols-2 gap-3.5 lg:grid-cols-4"}>
      {overviewCards.map(({ label, sublabel, value, Icon, tone, filterKey }) => {
        // W1.3: filterable cards are real buttons (aria-pressed + keyboard);
        // non-filterable cards stay static. Surface as="button" renders a
        // <button> through the same card primitive, keeping DS visuals.
        const isEventsCard = isMobileLayout && label === 'Sự kiện'
        const isSelected = filterKey
          ? myTaskFilter === filterKey && (!isMobileLayout || mobileTab === 'my-tasks')
          : isEventsCard && mobileTab === 'events'
        const isClickable = Boolean(filterKey || isEventsCard)
        const cardClass = `p-3.5 sm:p-4 rounded-2xl border shadow-xs text-left transition-colors ${
          isSelected
            ? 'border-parish-primary ring-2 ring-parish-primary/20 bg-parish-primary-light/10'
            : 'border-surface-border hover:border-surface-border/80 active:scale-[0.98]'
        }`
        const handleCardClick = () => {
          if (filterKey) {
            activateKpiFilter(filterKey)
          } else if (isEventsCard) {
            setMobileTab('events')
          }
        }
        return (
          <Surface
            key={label}
            variant="card"
            {...(isClickable
              ? {
                  as: 'button' as const,
                  type: 'button' as const,
                  'aria-pressed': isSelected,
                  onClick: handleCardClick,
                  className: cardClass,
                }
              : { className: `p-3.5 sm:p-4 rounded-2xl border shadow-xs border-surface-border` })}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted truncate mr-1">{label}</span>
              <div className={`icon-container rounded-xl shrink-0 ${
                tone === 'primary' ? 'bg-parish-primary-light text-parish-primary' :
                tone === 'teal' ? 'bg-parish-success-bg text-parish-success' :
                tone === 'warning' ? 'bg-parish-warning-bg text-parish-warning' :
                'bg-parish-danger-bg text-parish-danger'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <span className="block mb-0 mt-2 text-2xl font-black text-text-main">{value}</span>
            <span className="block mt-1 text-xs text-text-muted truncate">{sublabel}</span>
          </Surface>
        )
      })}
    </section>
  ), [overviewCards, myTaskFilter, activateKpiFilter, isMobileLayout, mobileTab])

  // W3.2: the events list moved to OperationsEventList (owns its search input,
  // W2.13 debounce, per-row pending marker and load-more busy).

  const mobileNavTabs = useMemo<Array<{
    id: OperationsMobileTab
    label: string
    icon: React.ReactNode
    badge?: number
    badgeTone?: 'danger' | 'neutral'
  }>>(() => [
    {
      id: 'my-tasks',
      label: 'Việc của tôi',
      icon: <ShieldCheck className="h-4 w-4 shrink-0" />,
      badge: activeTasksTotal,
      badgeTone: pendingResponses > 0 ? 'danger' : 'neutral',
    },
    {
      id: 'events',
      label: 'Sự kiện',
      icon: <Calendar className="h-4 w-4 shrink-0" />,
      badge: eventTotal,
    },
    {
      id: 'inbox',
      label: 'Hộp thư',
      icon: <Bell className="h-4 w-4 shrink-0" />,
      badge: reminders.length + dispatchInvitations.length > 0 ? reminders.length + dispatchInvitations.length : undefined,
      badgeTone: 'danger',
    },
    {
      id: 'utilities',
      label: 'Tiện ích',
      icon: <Layers className="h-4 w-4 shrink-0" />,
    },
  ], [activeTasksTotal, pendingResponses, eventTotal, reminders.length, dispatchInvitations.length])

  const renderMyTasksSection = () => (
    <OperationsMyTaskBoard
      sectionRef={myTasksSectionRef}
      tasks={tasks}
      filteredMyTasks={filteredMyTasks}
      taskTotal={taskTotal}
      taskHasMore={taskHasMore}
      loadingMoreTasks={loadingMoreLists.tasks}
      onLoadMoreTasks={() => loadMoreList('tasks')}
      myTaskFilter={myTaskFilter}
      onMyTaskFilterChange={setMyTaskFilter}
      myTaskFilterOptions={myTaskFilterOptions}
      dispatchInvitations={dispatchInvitations}
      dispatchTotal={dispatchTotal}
      dispatchHasMore={dispatchHasMore}
      loadingMoreDispatches={loadingMoreLists.dispatches}
      onLoadMoreDispatches={() => loadMoreList('dispatches')}
      busyInbox={busyInbox}
      onAcceptDispatch={invitation => void handleAcceptDispatch(invitation)}
      isOnline={isOnline}
      source={source}
      canMutate={canMutate}
      loading={loading}
      taskDetailLoading={taskDetailLoading}
      busyTask={busyTask}
      onSelectTask={taskId => void selectTask(taskId).catch(() => undefined)}
      onTaskAction={(task, action) => void handleTask(task, action)}
      onOverflowOpen={(task, actions, button) => {
        if (taskOverflow?.taskId === task.id) { setTaskOverflow(null); return }
        taskOverflowTriggerRef.current = button
        openTaskOverflow(task.id, actions, button)
      }}
      overflowTaskId={taskOverflow?.taskId ?? null}
    />
  )

  const renderInboxSection = () => (
    <OperationsInboxList
      reminders={reminders}
      reminderHasMore={reminderHasMore}
      loadingMoreReminders={loadingMoreLists.reminders}
      onLoadMoreReminders={() => loadMoreList('reminders')}
      busyInbox={busyInbox}
      setInboxBusy={setInboxBusy}
      canMutate={canMutate}
      isOnline={isOnline}
      source={source}
      loading={loading}
      permissions={permissions}
      taskTitleById={taskTitleById}
      eventTitleById={eventTitleById}
      onSelectTask={taskId => void selectTask(taskId).catch(() => undefined)}
      onSelectEvent={eventId => void selectEvent(eventId).catch(() => undefined)}
    />
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
    return isMobileLayout ? (
      <div className="mobile-screen mobile-screen--stack product-view"><SkeletonCardGrid count={3} /></div>
    ) : (
      <DesktopAppShell width="wide"><SkeletonCardGrid count={5} /></DesktopAppShell>
    )
  }

  const pageContainer = (content: React.ReactNode) => isMobileLayout ? (
    <div className="mobile-screen mobile-screen--stack product-view flex flex-col gap-3 pb-24">
      {content}
    </div>
  ) : (
    <DesktopAppShell width="wide" className="flex flex-col gap-3.5">
      {content}
    </DesktopAppShell>
  )

  return pageContainer(
    <>
      {isMobileLayout ? (
        <SubpageHeader
          icon={<ClipboardList size={16} aria-hidden="true" />}
          title="Sự Kiện & Công Việc"
          meta={
            <span className="truncate">
              {eventTotal > 0 || taskTotal > 0
                ? `${eventTotal} sự kiện · ${taskTotal} công việc`
                : 'Điều phối trách nhiệm, tiến độ và các điểm chặn'}
            </span>
          }
          actions={
            <div className="flex items-center gap-1.5">
              {canCreateAnything && (
                <button
                  type="button"
                  onClick={() => setShowCreateMenu(true)}
                  className="subpage-header__btn subpage-header__btn--primary"
                  disabled={!canMutate}
                  aria-label="Tạo mới"
                >
                  <Plus size={13} aria-hidden="true" />
                  <span>Tạo mới</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void fetch().catch(() => undefined)}
                className="subpage-header__btn subpage-header__btn--secondary subpage-header__btn--icon-only"
                disabled={loading || !isOnline}
                aria-label="Làm mới danh sách"
                title="Làm mới danh sách"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              </button>
            </div>
          }
        />
      ) : (
        <PageHeader
          title="Sự Kiện & Công Việc"
          description="Điều phối trách nhiệm, tiến độ và các điểm đang chặn trước ngày sự kiện."
          icon={<ClipboardList aria-hidden="true" className="h-6 w-6" />}
          actions={
            <div className="flex flex-wrap gap-2">
              {/* B2: on mobile layout, FAB (.mobile-floating-action) is the exclusive create entrypoint */}
              {!isMobileLayout && canCreateAnything && (
                <div className="relative" ref={createMenuRef}>
                  <Button ref={createMenuButtonRef} size="sm" leadingIcon={<Plus className="h-4 w-4" />} disabled={!canMutate} onClick={() => setShowCreateMenu(value => !value)} aria-haspopup="menu" aria-expanded={showCreateMenu}>
                    Tạo mới
                  </Button>
                  {showCreateMenu && canMutate && (
                    <div
                      role="menu"
                      aria-label="Tạo mới"
                      className="absolute right-0 z-30 mt-2 w-80 sm:w-96 max-h-[min(520px,calc(100vh-140px))] overflow-y-auto rounded-2xl border border-surface-border bg-surface-card/98 shadow-2xl p-2 backdrop-blur-md"
                      onKeyDown={event => {
                        if (event.key === 'ArrowDown') { event.preventDefault(); focusCreateMenuItem(1) }
                        else if (event.key === 'ArrowUp') { event.preventDefault(); focusCreateMenuItem(-1) }
                        else if (event.key === 'Home') { event.preventDefault(); focusCreateMenuItem('first') }
                        else if (event.key === 'End') { event.preventDefault(); focusCreateMenuItem('last') }
                        else if (event.key === 'Tab') {
                          // W3.3: leaving the menu by Tab closes it — APG behavior
                          // (the popover is dismissed, focus returns to the page).
                          setShowCreateMenu(false)
                        }
                      }}
                    >
                      <CreateMenuItems
                        layout="dropdown"
                        canCreateXuDoan={canCreateXuDoan}
                        units={unitCreationOptions}
                        onPickEvent={openCreateEvent}
                        onPickStandaloneTask={openCreateStandaloneTask}
                      />
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
      )}

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
          <CreateMenuItems
            layout="sheet"
            canCreateXuDoan={canCreateXuDoan}
            units={unitCreationOptions}
            onPickEvent={(kind, unitId) => { setShowCreateMenu(false); openCreateEvent(kind, unitId) }}
            onPickStandaloneTask={unitId => { setShowCreateMenu(false); openCreateStandaloneTask(unitId) }}
          />
        </ModalShell>
      )}

      {canCreateAnything && canMutate && isMobileLayout && (
        <button
          type="button"
          aria-label="Tạo mới sự kiện hoặc nhiệm vụ"
          // W2.8: shared .mobile-floating-action primitive owns bottom clearance
          // (nav height + safe-area) and right safe-area; the old hand-rolled
          // `bottom-20 right-4 sm:hidden` overlapped the nav under the home
          // indicator and vanished on 640–1023px tablets (still mobile shell).
          className="mobile-floating-action mobile-touch-target flex items-center justify-center shadow-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parish-primary focus-visible:ring-offset-2"
          onClick={() => setShowCreateMenu(true)}
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      )}
      {isMobileLayout ? (
        <>
          {kpiStrip}

          {/* Mobile Primary Segmented Navigation */}
          <div className="view-tabs sticky top-0 z-10 bg-surface-sunken/95 backdrop-blur-sm p-1 rounded-xl border border-surface-border shadow-xs" role="tablist" aria-label="Phân hệ điều hành">
            {mobileNavTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mobileTab === tab.id}
                onClick={() => setMobileTab(tab.id)}
                className={`view-tab flex-1 min-h-[44px] justify-center px-2 py-2 text-xs font-bold transition-colors ${
                  mobileTab === tab.id ? 'is-active' : ''
                }`}
              >
                {tab.icon}
                <span className="truncate">{tab.label}</span>
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-extrabold ${
                    tab.badgeTone === 'danger'
                      ? 'bg-parish-danger text-text-inverse'
                      : mobileTab === tab.id
                        ? 'bg-parish-primary-light text-parish-primary'
                        : 'bg-surface-hover text-text-muted'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className={mobileTab === 'my-tasks' ? 'block space-y-4' : 'hidden'}>
            {renderMyTasksSection()}
          </div>
          <div className={mobileTab === 'events' ? 'block space-y-4' : 'hidden'}>
            <OperationsEventList />
          </div>
          <div className={mobileTab === 'inbox' ? 'block space-y-4' : 'hidden'}>
            {renderInboxSection()}
          </div>
          <div className={mobileTab === 'utilities' ? 'block space-y-4' : 'hidden'}>
            {renderUtilitiesSection()}
          </div>
        </>
      ) : (
        <>
          {kpiStrip}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
            <OperationsEventList />
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
          mobileDisplay="fullscreen"
          title={selectedEvent.event.title}
          subtitle={`${formatEventInstant(selectedEvent.event.startsAt, selectedEvent.event.timezone)} · ${selectedEvent.event.location || 'Chưa có địa điểm'} · Tiến độ chuẩn bị ${selectedEvent.readiness.percent}%`}
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
              {/* Creator ≠ organizer (O1): the header names both, name-only. */}
              {selectedEvent.creator?.displayName && (
                <Badge tone="neutral" className="font-bold text-xs" title="Tài khoản đã tạo sự kiện">
                  Người tạo: {selectedEvent.creator.displayName}
                </Badge>
              )}
              <Badge tone={statusTone(selectedEvent.event.status)} className="font-bold text-xs uppercase">
                {statusLabel[selectedEvent.event.status] || selectedEvent.event.status}
              </Badge>
            </div>
          }
          maxWidth="1160px"
          footer={
            /* W3.6 (MB-05): on phones the primary transition leads as a
               full-width row and the remaining actions follow below; at sm+
               every order/width reverts to the original desktop layout. */
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="order-last w-full sm:order-none sm:w-auto"
                onClick={handleCloseEventModal}
              >
                Đóng chi tiết
              </Button>
              <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
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
                    // W3.6 (MB-05): the primary transition leads its own
                    // full-width row on phones; rewind/cancel drop to the next
                    // row. sm+ restores the original side-by-side order.
                    className="order-first w-full sm:order-none sm:w-auto"
                    // W1.1: readiness blockers must not disable the forward button
                    // for holders of override_readiness — the server re-validates and
                    // returns READINESS_BLOCKED, which opens the override-reason dialog
                    // (the designed path). Non-holders keep the pre-blocked behavior.
                    disabled={!canMutate
                      || ((nextEventStatus[selectedEvent.event.status] === 'READY' || nextEventStatus[selectedEvent.event.status] === 'LIVE')
                        && selectedEvent.readiness.blockers.length > 0
                        && !selectedEvent.permissions['operations.event.override_readiness'])
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
                {selectedEvent.event.status === 'CANCELLED'
                  && selectedEvent.permissions['operations.event.transition']
                  && !showRestorePrompt && (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={transitioningEvent}
                    disabled={!canMutate}
                    onClick={() => setShowRestorePrompt(true)}
                  >
                    Khôi phục sự kiện
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-3.5" aria-label="Chi tiết sự kiện">
            {/* 1. KHỐI TIẾN TRÌNH VÒNG ĐỜI & SẴN SÀNG — W3.2: EventLifecycleHub */}
            <EventLifecycleHub
              detail={selectedEvent}
              flow={transitionFlow}
              canMutate={canMutate}
              onShowTasksTab={() => setEventModalTab('tasks')}
            />

            {/* 2. CHỈ SỐ NHANH — W3.2: EventOverviewStats */}
            <EventOverviewStats
              startsAt={selectedEvent.event.startsAt}
              location={selectedEvent.event.location ?? null}
              completedTasksCount={completedTasksCount}
              totalTasksCount={totalTasksCount}
              totalAssigneesCount={totalAssigneesCount}
              totalWorkstreamsCount={totalWorkstreamsCount}
            />

            {/* 3. THÔNG TIN & SỬA ĐỔI NHANH — EventEditForm */}
            {selectedEvent.permissions['operations.event.manage'] && !selectedEventClosed && selectedEvent.event.status !== 'LIVE' && (selectedEvent.event.visibility !== 'PUBLIC_SUMMARY' || selectedEvent.permissions['operations.event.publish_public']) && (
              <EventEditForm detail={selectedEvent} />
            )}

            {/* 4. ĐIỀU HƯỚNG TABS */}
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
            <TabPanel tabsId="event-modal-tabs" value="tasks" activeValue={activeModalTab} className="space-y-3.5">
              <EventTasksTab
                detail={selectedEvent}
                assignmentWarnings={assignmentWarnings}
                taskGroups={taskGroups}
                taskFilterOptions={taskFilterOptions}
                taskStatusFilter={taskStatusFilter}
                onTaskStatusFilterChange={setTaskStatusFilter}
                assigneeCountByTask={assigneeCountByTask}
                selectedTaskId={selectedTask?.task.id ?? null}
                pendingTaskId={pendingTaskId}
                taskDetailLoading={taskDetailLoading}
                isOnline={isOnline}
                source={source}
                onOpenEditTask={openEditTask}
                onOpenChecklist={task => {
                  setPendingTaskId(task.id)
                  void selectTask(task.id).catch(() => undefined).finally(() => {
                    setPendingTaskId(current => (current === task.id ? null : current))
                  })
                }}
                onCancelTask={task => void handleTask(task, 'CANCELLED')}
                creationOptions={creationOptions}
                onSwitchToWorkstreamsTab={() => setEventModalTab('workstreams')}
              />
            </TabPanel>

            {/* Tab 2: Nhóm công tác */}
            <TabPanel tabsId="event-modal-tabs" value="workstreams" activeValue={activeModalTab}>
              <WorkstreamPanel key={selectedEvent.event.id} event={selectedEvent} enabled={canMutate} fieldUnits={unitCreationOptions} refresh={() => selectEvent(selectedEvent.event.id)} />
            </TabPanel>

            {/* Tab: Người tham dự (W4.2a) */}
            <TabPanel tabsId="event-modal-tabs" value="participants" activeValue={activeModalTab}>
              <EventParticipantsPanel
                key={`participants-${selectedEvent.event.id}`}
                detail={selectedEvent}
                enabled={canMutate}
                refresh={() => selectEvent(selectedEvent.event.id)}
              />
            </TabPanel>

            {/* Tab 3: Lập lịch nhắc việc */}
            <TabPanel tabsId="event-modal-tabs" value="reminders" activeValue={activeModalTab} className="space-y-3.5">
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

      {/* W1.7: TaskChecklistSection used to render at the very bottom of the
          page ("!selectedEvent && …") where users never noticed it after
          clicking "Chi tiết nhiệm vụ". The detail is now a dialog whose open
          state IS selectedTask, so every path that loads a task detail (my
          tasks row, event-tab Checklist button, reminder "Mở") brings it in
          front of the user; nested-modal arbitration lives in modalStack. */}
      <ModalShell
        isOpen={Boolean(selectedTask)}
        onClose={() => void selectTask(null)}
        title="Chi tiết nhiệm vụ"
        subtitle={selectedTask?.task.title}
        icon={<ClipboardList aria-hidden="true" className="h-5 w-5 text-parish-primary" />}
        mobileDisplay="bottom-sheet"
        maxWidth="720px"
      >
        <TaskChecklistSection />
      </ModalShell>

      <TaskEditDialog
        open={showEditTask}
        editingTask={editingTask}
        draft={taskEditDraft}
        scheduleInvalid={taskEditScheduleInvalid}
        saving={savingTask}
        formError={taskEditFormError}
        onDraftChange={patch => setTaskEditDraft(value => ({ ...value, ...patch }))}
        onClose={() => { setShowEditTask(false); setEditingTask(null) }}
        onSubmit={handleUpdateTask}
      />

      <OperationsEventDialogs
        detail={selectedEvent}
        flow={transitionFlow}
        taskReason={{
          action: taskReasonAction,
          text: taskReasonText,
          submitting: taskReasonSubmitting,
          onTextChange: setTaskReasonText,
          onClose: () => setTaskReasonAction(null),
          onConfirm: () => void handleConfirmTaskReason(),
        }}
      />

      <TaskAcknowledgeDialog
        action={ackNoteAction}
        note={ackNoteText}
        submitting={ackNoteSubmitting}
        onNoteChange={setAckNoteText}
        onClose={() => { setAckNoteAction(null); setAckNoteText('') }}
        onConfirm={handleConfirmAckNote}
      />

      {/* W3.8: fixed-position overflow popup (rendered at tree root so list
          overflow-hidden clipping cannot cut it). APG menu keys mirror the
          create-menu: Arrow/Home/End move focus, Escape closes and restores
          focus, Tab dismisses, item click runs and closes. */}
      {taskOverflow && (
        <div
          ref={taskOverflowRef}
          role="menu"
          aria-label="Thêm thao tác"
          className="fixed z-40 w-48 rounded-xl border border-surface-border bg-surface-card/98 p-1 shadow-2xl backdrop-blur-md"
          style={{ top: taskOverflow.top, left: taskOverflow.left }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); focusTaskOverflowItem(1) }
            else if (event.key === 'ArrowUp') { event.preventDefault(); focusTaskOverflowItem(-1) }
            else if (event.key === 'Home') { event.preventDefault(); focusTaskOverflowItem('first') }
            else if (event.key === 'End') { event.preventDefault(); focusTaskOverflowItem('last') }
          }}
        >
          {taskOverflow.actions.map(action => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              disabled={!canMutate || busyTask === taskOverflow.taskId}
              className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parish-primary ${
                action.danger ? 'text-parish-danger' : 'text-text-main'
              }`}
              onClick={() => {
                setTaskOverflow(null)
                taskOverflowTriggerRef.current = null
                action.run()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
