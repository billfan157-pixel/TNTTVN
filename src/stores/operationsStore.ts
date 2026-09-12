import { operationsErrorText } from '../lib/operationsErrors'
import { create } from 'zustand'
import { api, ApiError } from '../lib/api'
import type { OperationAssignment, OperationAssignmentTarget, OperationChecklistItem, OperationEvent, OperationEventDetail, OperationReminder, OperationTask, OperationTaskDetail, OperationTaskDispatchInvitation, OperationsCreationOptions, OperationsListPage } from '../lib/api/operations'
import { dexieStorage } from '../lib/db'
import { getTenantScope } from '../lib/tenantScope'

const OPERATIONS_CACHE_KEY = 'parish_operations_overview_v1'
let sessionGeneration = 0
let eventRequest = 0
let taskRequest = 0
let overviewRequest = 0
// P1-4: caller-side abort for superseded detail loads. The generation
// counters above stay as the correctness backstop (a late response is still
// discarded even if its fetch already completed); aborting only frees the
// in-flight request early instead of letting it run to the transport timeout.
let eventDetailAbort: AbortController | null = null
let taskDetailAbort: AbortController | null = null

function abortDetailLoads() {
  eventDetailAbort?.abort()
  taskDetailAbort?.abort()
  eventDetailAbort = null
  taskDetailAbort = null
}

type OperationsDataSource = 'server' | 'cache' | 'none'

type OperationsCache = {
  parishId: string
  userId: string
  events: OperationEvent[]
  tasks: OperationTask[]
  eventTotal: number
  taskTotal: number
  savedAt: string
}

interface OperationsState {
  events: OperationEvent[]
  tasks: OperationTask[]
  reminders: OperationReminder[]
  dispatchInvitations: OperationTaskDispatchInvitation[]
  assignmentWarnings: { taskId: string; items: Array<{ id: string; startsAt: string; endsAt: string }> } | null
  permissions: Record<string, boolean>
  selectedEvent: OperationEventDetail | null
  selectedTask: OperationTaskDetail | null
  detailLoading: boolean
  taskDetailLoading: boolean
  loading: boolean
  error: string | null
  source: OperationsDataSource
  cacheSavedAt: string | null
  eventTotal: number
  taskTotal: number
  reminderTotal: number
  eventPage: number
  taskPage: number
  reminderPage: number
  eventHasMore: boolean
  taskHasMore: boolean
  reminderHasMore: boolean
  fetch: () => Promise<void>
  loadMoreEvents: () => Promise<void>
  loadMoreTasks: () => Promise<void>
  loadMoreReminders: () => Promise<void>
  createEvent: (input: { title: string; eventType: string; startsAt: string; endsAt: string; timezone: string; location?: string | null; visibility?: OperationEvent['visibility']; eventScopeType?: 'XU_DOAN' | 'UNIT'; scopeUnitId?: string | null; organizerUserId?: string | null; organizerPersonId?: string | null }, idempotencyKey?: string) => Promise<OperationEvent>
  updateEvent: (id: string, input: { version: number; title?: string; eventType?: string; startsAt?: string; endsAt?: string; timezone?: string; location?: string | null; visibility?: OperationEvent['visibility'] }, idempotencyKey?: string) => Promise<OperationEvent>
  selectEvent: (id: string | null) => Promise<number>
  selectTask: (id: string | null) => Promise<number>
  refreshTaskViews: (id: string) => Promise<void>
  createTask: (input: { title: string; eventId: string; workstreamId?: string | null; scopeUnitId?: string | null; dueAt?: string | null; scheduledStartAt?: string | null; scheduledEndAt?: string | null; phase?: OperationTask['phase']; isRequired?: boolean }, idempotencyKey?: string) => Promise<OperationTask>
  createStandaloneTask: (input: { title: string; scopeUnitId: string; dueAt?: string | null }, idempotencyKey?: string) => Promise<OperationTask>
  updateTask: (task: OperationTask, input: { title?: string; description?: string | null; priority?: OperationTask['priority']; dueAt?: string | null; scheduledStartAt?: string | null; scheduledEndAt?: string | null; isRequired?: boolean }, idempotencyKey?: string) => Promise<{ task: OperationTask; acknowledgementReset: boolean }>
  assignTask: (task: OperationTask, target: OperationAssignmentTarget, role: 'OWNER' | 'CONTRIBUTOR', idempotencyKey?: string) => Promise<void>
  dispatchTask: (task: OperationTask, primary: OperationAssignmentTarget, reserve: OperationAssignmentTarget | null, acknowledgeBy: string, idempotencyKey?: string) => Promise<void>
  acceptTaskDispatch: (invitation: OperationTaskDispatchInvitation, idempotencyKey?: string) => Promise<void>
  transitionEvent: (id: string, status: OperationEvent['status'], version: number, options?: { reason?: string; outcomeSummary?: string; override?: boolean }, idempotencyKey?: string) => Promise<OperationEvent>
  resumeEventAutomation: (id: string, version: number, reason: string, idempotencyKey?: string) => Promise<OperationEvent>
  transitionTask: (task: OperationTask, status: OperationTask['status'], options?: string | { completionNote?: string; blockedReason?: string; cancellationReason?: string; idempotencyKey?: string }) => Promise<OperationTask>
  acknowledgeTask: (task: OperationTask, status: 'ACCEPTED' | 'DECLINED', note?: string, idempotencyKey?: string) => Promise<void>
  addChecklistItem: (task: OperationTask, label: string, isRequired: boolean, idempotencyKey?: string) => Promise<void>
  toggleChecklistItem: (task: OperationTask, item: OperationChecklistItem, idempotencyKey?: string) => Promise<void>
  markReminderRead: (reminder: OperationReminder, idempotencyKey?: string) => Promise<void>
  cancelReminder: (reminder: OperationReminder, idempotencyKey?: string) => Promise<void>
  creationOptions: OperationsCreationOptions | null
  fetchCreationOptions: () => Promise<void>
  clear: () => void
}

function scope() {
  const current = getTenantScope()
  if (!current?.parishId || !current.userId) throw new Error('Phiên giáo xứ chưa sẵn sàng. Vui lòng đăng nhập lại.')
  return { ...current, generation: sessionGeneration }
}

function assertTenant<T extends { parishId: string }>(rows: T[], parishId: string): T[] {
  if (rows.some(row => row.parishId !== parishId)) throw new Error('Máy chủ trả dữ liệu Operations sai phạm vi giáo xứ')
  return rows
}

function sameScope(expected: { parishId: string; userId: string; generation?: number }) {
  const active = getTenantScope()
  return active?.parishId === expected.parishId && active.userId === expected.userId
    && (expected.generation === undefined || expected.generation === sessionGeneration)
}

async function saveCache(cache: OperationsCache): Promise<void> {
  try { await dexieStorage.setItem(OPERATIONS_CACHE_KEY, JSON.stringify(cache)) } catch { /* online data remains authoritative */ }
}

async function loadCache(expected: { parishId: string; userId: string }): Promise<OperationsCache | null> {
  try {
    const raw = await dexieStorage.getItem(OPERATIONS_CACHE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as OperationsCache
    if (value.parishId !== expected.parishId || value.userId !== expected.userId) return null
    assertTenant(value.events, expected.parishId)
    assertTenant(value.tasks, expected.parishId)
    if (!Array.isArray(value.events) || !Array.isArray(value.tasks) || !value.savedAt) return null
    return value
  } catch {
    return null
  }
}

function pageMeta<T>(page: OperationsListPage<T>) {
  const expectedTotalPages = page?.meta?.total === 0 ? 0 : Math.ceil((page?.meta?.total ?? 0) / (page?.meta?.limit ?? 1))
  if (
    !page || !Array.isArray(page.data) || !page.meta
    || !Number.isInteger(page.meta.page) || page.meta.page < 1
    || !Number.isInteger(page.meta.limit) || page.meta.limit < 1 || page.meta.limit > 500
    || !Number.isInteger(page.meta.total) || page.meta.total < 0 || page.meta.total < page.data.length
    || !Number.isInteger(page.meta.totalPages) || page.meta.totalPages < 0
    || page.meta.totalPages !== expectedTotalPages
    || (page.meta.totalPages > 0 && page.meta.page > page.meta.totalPages)
    || page.data.length > page.meta.limit
  ) {
    throw new Error('Máy chủ trả phân trang Operations không hợp lệ')
  }
  return page.meta
}

function isOfflineFailure(error: unknown) {
  // Never use cache to mask 401/403/validation/server failures. The transport
  // normalizes genuine reachability failures to ApiError(0). A superseded
  // (caller-aborted) request also surfaces as status 0 but must never trigger
  // the cache fallback.
  return error instanceof ApiError && error.status === 0 && error.code !== 'REQUEST_ABORTED'
}

async function persistCurrentServerSnapshot(): Promise<void> {
  const currentScope = getTenantScope()
  const state = useOperationsStore.getState()
  if (!currentScope?.parishId || !currentScope.userId || state.source !== 'server') return
  const savedAt = new Date().toISOString()
  await saveCache({
    parishId: currentScope.parishId,
    userId: currentScope.userId,
    events: state.events,
    tasks: state.tasks,
    eventTotal: state.eventTotal,
    taskTotal: state.taskTotal,
    savedAt,
  })
  if (sameScope(currentScope)) useOperationsStore.setState({ cacheSavedAt: savedAt })
}

function formatStoreError(error: unknown, defaultMessage: string): string {
  const err = error as any
  if (isOccConflict(error)) {
    return operationsErrorText('VERSION_CONFLICT', defaultMessage)
  }
  const code = err?.code
  if (code) return operationsErrorText(code, err?.message || defaultMessage)
  if (error instanceof Error) {
    if (error.message.includes('VERSION_CONFLICT') || error.message.includes('thay đổi bởi người khác') || error.message.includes('OCC conflict')) {
      return operationsErrorText('VERSION_CONFLICT', error.message)
    }
    return operationsErrorText(undefined, error.message)
  }
  return defaultMessage
}

function isOccConflict(error: unknown): boolean {
  const err = error as any
  if (err?.code === 'VERSION_CONFLICT' || err?.code === 'VERSION_MISMATCH') return true
  // Other 409 codes (dispatch resolved, duplicate owner, idempotency replayed,
  // template archived, self-approval...) describe different situations and must
  // keep their own message instead of borrowing the OCC one.
  if (err?.code) return false
  const message = String(err?.message || '')
  return message.includes('thay đổi bởi người khác') || message.includes('VERSION_CONFLICT') || message.includes('OCC conflict')
}

function handleConflictSync(get: () => any, error: unknown) {
  const err = error as any
  // Dedicated dialogs own these flows (acceptance/override); a global banner + refetch would fight them.
  if (err?.code === 'TASK_ACCEPTANCE_PENDING' || err?.code === 'READINESS_BLOCKED' || err?.code === 'COMPLETION_BLOCKED') return
  const isConflict = isOccConflict(error)
  if (isConflict) {
    const state = get()
    const conflictMessage = formatStoreError(error, 'Dữ liệu đã được cập nhật bởi người khác. Hệ thống đã tải lại thông tin mới nhất.')
    if (state.selectedEvent?.event?.id) {
      void state.selectEvent(state.selectedEvent.event.id).catch(() => undefined)
    }
    void (async () => {
      try {
        await state.fetch()
      } catch {
        // ignore fetch failures during conflict sync
      }
      useOperationsStore.setState({ error: conflictMessage })
    })()
  }
}

export const useOperationsStore = create<OperationsState>((set, get) => ({
  events: [],
  tasks: [],
  reminders: [],
  dispatchInvitations: [],
  assignmentWarnings: null,
  permissions: {},
  selectedEvent: null,
  selectedTask: null,
  detailLoading: false,
  taskDetailLoading: false,
  loading: false,
  error: null,
  source: 'none',
  cacheSavedAt: null,
  eventTotal: 0,
  taskTotal: 0,
  reminderTotal: 0,
  eventPage: 1,
  taskPage: 1,
  reminderPage: 1,
  eventHasMore: false,
  taskHasMore: false,
  reminderHasMore: false,
  creationOptions: null,

  fetchCreationOptions: async () => {
    const requestScope = scope()
    try {
      const options = await api.getCreationOptions()
      if (!sameScope(requestScope)) return
      set({ creationOptions: options })
    } catch {
      if (sameScope(requestScope)) set({ creationOptions: null })
    }
  },

  fetch: async () => {
    const requestScope = scope()
    const request = ++overviewRequest
    const parishId = requestScope.parishId
    set({ loading: true, error: null })
    try {
      const [eventPage, taskPage, reminderPage, dispatchPage, access] = await Promise.all([api.getEvents(1), api.getTasks(true, 1), api.getReminders(1), api.getDispatchInbox(1), api.getPermissions()])
      const eventMeta = pageMeta(eventPage)
      const taskMeta = pageMeta(taskPage)
      const reminderMeta = pageMeta(reminderPage)
      pageMeta(dispatchPage)
      if (access.parishId !== parishId) throw new Error('Máy chủ trả quyền Operations sai phạm vi giáo xứ')
      if (!sameScope(requestScope) || request !== overviewRequest) return
      const events = assertTenant(eventPage.data, parishId)
      const tasks = assertTenant(taskPage.data, parishId)
      const reminders = assertTenant(reminderPage.data, parishId)
      const dispatchInvitations = assertTenant(dispatchPage.data, parishId)
      const savedAt = new Date().toISOString()
      set({
        events, tasks, reminders, dispatchInvitations, permissions: access.permissions, loading: false, error: null, source: 'server', cacheSavedAt: savedAt,
        eventTotal: eventMeta.total, taskTotal: taskMeta.total, eventPage: eventMeta.page, taskPage: taskMeta.page,
        eventHasMore: eventMeta.page < eventMeta.totalPages, taskHasMore: taskMeta.page < taskMeta.totalPages,
        reminderTotal: reminderMeta.total, reminderPage: reminderMeta.page, reminderHasMore: reminderMeta.page < reminderMeta.totalPages,
      })
      await saveCache({ parishId, userId: requestScope.userId, events, tasks, eventTotal: eventMeta.total, taskTotal: taskMeta.total, savedAt })
    } catch (error) {
      if (!sameScope(requestScope) || request !== overviewRequest) return
      if (isOfflineFailure(error) && sameScope(requestScope)) {
          const cached = await loadCache(requestScope)
          if (cached && sameScope(requestScope) && request === overviewRequest) {
            eventRequest++; taskRequest++
            // The offline fallback discards any selection, so its in-flight
            // detail loads are superseded as well.
            abortDetailLoads()
          set({
            selectedEvent: null, selectedTask: null, assignmentWarnings: null, detailLoading: false, taskDetailLoading: false,
            events: cached.events, tasks: cached.tasks, reminders: [], dispatchInvitations: [], permissions: {}, loading: false, error: null, source: 'cache', cacheSavedAt: cached.savedAt,
            eventTotal: cached.eventTotal, taskTotal: cached.taskTotal, eventPage: 1, taskPage: 1,
            eventHasMore: cached.events.length < cached.eventTotal, taskHasMore: cached.tasks.length < cached.taskTotal,
            reminderTotal: 0, reminderPage: 1, reminderHasMore: false,
          })
          return
        }
      }
      const message = error instanceof Error ? error.message : 'Không tải được danh sách công việc'
      set({ loading: false, error: message })
      throw error
    }
  },

  loadMoreEvents: async () => {
    const requestScope = scope()
    const state = useOperationsStore.getState()
    if (state.loading || !state.eventHasMore || state.source !== 'server') return
    set({ loading: true, error: null })
    try {
      const response = await api.getEvents(state.eventPage + 1)
      const meta = pageMeta(response)
      if (!sameScope(requestScope)) return
      const incoming = assertTenant(response.data, requestScope.parishId)
      const existingIds = new Set(useOperationsStore.getState().events.map(item => item.id))
      const events = [...useOperationsStore.getState().events, ...incoming.filter(item => !existingIds.has(item.id))]
      const savedAt = new Date().toISOString()
      set({ events, eventTotal: meta.total, eventPage: meta.page, eventHasMore: meta.page < meta.totalPages, loading: false, cacheSavedAt: savedAt })
      const current = useOperationsStore.getState()
      await saveCache({ parishId: requestScope.parishId, userId: requestScope.userId, events, tasks: current.tasks, eventTotal: meta.total, taskTotal: current.taskTotal, savedAt })
    } catch (error) {
      if (sameScope(requestScope)) set({ loading: false, error: formatStoreError(error, 'Không tải thêm được danh sách sự kiện') })
      throw error
    }
  },

  loadMoreTasks: async () => {
    const requestScope = scope()
    const state = useOperationsStore.getState()
    if (state.loading || !state.taskHasMore || state.source !== 'server') return
    set({ loading: true, error: null })
    try {
      const response = await api.getTasks(true, state.taskPage + 1)
      const meta = pageMeta(response)
      if (!sameScope(requestScope)) return
      const incoming = assertTenant(response.data, requestScope.parishId)
      const existingIds = new Set(useOperationsStore.getState().tasks.map(item => item.id))
      const tasks = [...useOperationsStore.getState().tasks, ...incoming.filter(item => !existingIds.has(item.id))]
      const savedAt = new Date().toISOString()
      set({ tasks, taskTotal: meta.total, taskPage: meta.page, taskHasMore: meta.page < meta.totalPages, loading: false, cacheSavedAt: savedAt })
      const current = useOperationsStore.getState()
      await saveCache({ parishId: requestScope.parishId, userId: requestScope.userId, events: current.events, tasks, eventTotal: current.eventTotal, taskTotal: meta.total, savedAt })
    } catch (error) {
      if (sameScope(requestScope)) set({ loading: false, error: formatStoreError(error, 'Không tải thêm được công việc') })
      throw error
    }
  },

  loadMoreReminders: async () => {
    const requestScope = scope()
    const state = useOperationsStore.getState()
    if (state.loading || !state.reminderHasMore || state.source !== 'server') return
    set({ loading: true, error: null })
    try {
      const response = await api.getReminders(state.reminderPage + 1)
      const meta = pageMeta(response)
      if (!sameScope(requestScope)) return
      const incoming = assertTenant(response.data, requestScope.parishId)
      const existingIds = new Set(useOperationsStore.getState().reminders.map(item => item.id))
      const reminders = [...useOperationsStore.getState().reminders, ...incoming.filter(item => !existingIds.has(item.id))]
      set({ reminders, reminderTotal: meta.total, reminderPage: meta.page, reminderHasMore: meta.page < meta.totalPages, loading: false })
    } catch (error) {
      if (sameScope(requestScope)) set({ loading: false, error: formatStoreError(error, 'Không tải thêm được nhắc việc') })
      throw error
    }
  },

  createEvent: async (input, idempotencyKey) => {
    const requestScope = scope()
    try {
      const created = await api.createEvent(input, idempotencyKey)
      if (created.parishId !== scope().parishId) throw new Error('Không thể xác nhận event trong giáo xứ hiện tại')
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc tạo event.')
      set(state => ({ events: [created, ...state.events], error: null, eventTotal: state.eventTotal + 1 }))
      await persistCurrentServerSnapshot()
      return created
    } catch (error) {
      if (sameScope(requestScope)) set({ error: formatStoreError(error, 'Không thể tạo operation event') })
      throw error
    }
  },

  updateEvent: async (id, input, idempotencyKey) => {
    const requestScope = scope()
    try {
      const changed = await api.updateEvent(id, input, idempotencyKey)
      if (!sameScope(requestScope) || changed.parishId !== requestScope.parishId || changed.id !== id) throw new Error('Không thể xác nhận event trong giáo xứ hiện tại')
      set(state => ({
        events: state.events.map(event => event.id === id ? changed : event),
        selectedEvent: state.selectedEvent?.event.id === id ? { ...state.selectedEvent, event: changed } : state.selectedEvent,
      }))
      await persistCurrentServerSnapshot()
      return changed
    } catch (error) {
      if (sameScope(requestScope)) { set({ error: formatStoreError(error, 'Không thể cập nhật operation event') }); handleConflictSync(get, error) }
      throw error
    }
  },

  selectEvent: async id => {
    const request = ++eventRequest
    taskRequest++
    // A superseded detail load is aborted early; the generation counter
    // below stays as the backstop for already-completed responses.
    eventDetailAbort?.abort()
    eventDetailAbort = null
    if (!id) { set({ selectedEvent: null, selectedTask: null, detailLoading: false, taskDetailLoading: false }); return request }
    const requestScope = scope()
    const controller = new AbortController()
    eventDetailAbort = controller
    set({ detailLoading: true, selectedTask: null, taskDetailLoading: false, error: null })
    try {
      const detail = await api.getEvent(id, controller.signal)
      if (eventDetailAbort === controller) eventDetailAbort = null
      const activeScope = getTenantScope()
      if (!activeScope || !sameScope(requestScope) || request !== eventRequest) return request
      if (detail.event.id !== id || detail.event.parishId !== activeScope.parishId || detail.tasks.some((task: OperationTask) => task.parishId !== activeScope.parishId)) throw new Error('Máy chủ trả chi tiết event sai phạm vi giáo xứ')
      set({ selectedEvent: detail, selectedTask: null, detailLoading: false })
    } catch (error) {
      // Superseded selections die silently: the newer selection owns the UI,
      // and the abort must never surface as an error banner or offline cache.
      if (controller.signal.aborted) {
        if (eventDetailAbort === controller) eventDetailAbort = null
        return request
      }
      if (!sameScope(requestScope) || request !== eventRequest) return request
      set({ detailLoading: false, error: error instanceof Error ? error.message : 'Không thể tải chi tiết event' })
      throw error
    }
    return request
  },

  selectTask: async id => {
    const request = ++taskRequest
    taskDetailAbort?.abort()
    taskDetailAbort = null
    if (!id) { set({ selectedTask: null, taskDetailLoading: false }); return request }
    const requestScope = scope()
    const controller = new AbortController()
    taskDetailAbort = controller
    set({ selectedTask: null, taskDetailLoading: true, error: null })
    try {
      const detail = await api.getTask(id, controller.signal)
      if (taskDetailAbort === controller) taskDetailAbort = null
      const activeScope = getTenantScope()
      if (!activeScope || !sameScope(requestScope) || request !== taskRequest) return request
      if (detail.task.id !== id || detail.task.parishId !== activeScope.parishId || [...detail.checklist, ...detail.assignees, ...detail.comments].some(item => item.parishId !== activeScope.parishId || item.taskId !== id)) throw new Error('Máy chủ trả chi tiết task sai phạm vi giáo xứ')
      set(state => ({ selectedTask: detail, taskDetailLoading: false,
        selectedEvent: state.selectedEvent?.tasks.some(task => task.id === id) ? { ...state.selectedEvent,
          tasks: state.selectedEvent.tasks.map(task => task.id === id ? detail.task : task),
          assignees: [...state.selectedEvent.assignees.filter(assignment => assignment.taskId !== id), ...detail.assignees],
        } : state.selectedEvent,
      }))
    } catch (error) {
      if (controller.signal.aborted) {
        if (taskDetailAbort === controller) taskDetailAbort = null
        return request
      }
      if (!sameScope(requestScope) || request !== taskRequest) return request
      set({ taskDetailLoading: false, error: error instanceof Error ? error.message : 'Không thể tải chi tiết task' })
      throw error
    }
    return request
  },

  refreshTaskViews: async id => {
    const requestScope = scope()
    const selection = taskRequest
    await useOperationsStore.getState().fetch()
    if (!sameScope(requestScope) || selection !== taskRequest || useOperationsStore.getState().selectedTask?.task.id !== id) return
    const event = useOperationsStore.getState().selectedEvent
    if (event?.tasks.some(task => task.id === id)) {
      // P1-7: compare the token returned by the awaited selection instead of
      // inferring it with `selection + 1` arithmetic that breaks whenever a
      // concurrent selection interleaves.
      const appliedEventRequest = await useOperationsStore.getState().selectEvent(event.event.id)
      if (!sameScope(requestScope) || appliedEventRequest !== eventRequest) return
    }
    await useOperationsStore.getState().selectTask(id)
  },

  createTask: async (input, idempotencyKey) => {
    const requestScope = scope()
    try {
      const created = await api.createTask(input, idempotencyKey)
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc tạo task.')
      if (created.parishId !== requestScope.parishId || created.operationEventId !== input.eventId) throw new Error('Không thể xác nhận task trong giáo xứ hiện tại')
      set(state => ({ selectedEvent: state.selectedEvent?.event.id === input.eventId ? { ...state.selectedEvent, tasks: [...state.selectedEvent.tasks, created] } : state.selectedEvent }))
      return created
    } catch (error) {
      // Surface failures in the shared error banner instead of a silent
      // unhandled rejection (P1-6), mirroring createStandaloneTask.
      if (sameScope(requestScope)) set({ error: formatStoreError(error, 'Không thể tạo task') })
      throw error
    }
  },

  createStandaloneTask: async (input, idempotencyKey) => {
    const requestScope = scope()
    try {
      const created = await api.createTask({ title: input.title, eventId: null, workstreamId: null, scopeUnitId: input.scopeUnitId, dueAt: input.dueAt ?? null }, idempotencyKey)
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc tạo task.')
      if (created.parishId !== requestScope.parishId || created.scopeUnitId !== input.scopeUnitId) throw new Error('Không thể xác nhận task trong giáo xứ hiện tại')
      return created
    } catch (error) {
      if (sameScope(requestScope)) set({ error: error instanceof Error ? error.message : 'Không thể tạo task độc lập' })
      throw error
    }
  },

  updateTask: async (task, input, idempotencyKey) => {
    const requestScope = scope()
    try {
      const result = await api.updateTask(task.id, { version: task.version, ...input }, idempotencyKey)
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc sửa task.')
      if (result.task.parishId !== requestScope.parishId || result.task.id !== task.id) throw new Error('Không thể xác nhận task trong giáo xứ hiện tại')
      // The server decides whether acknowledgements reopen; the store mirrors
      // that verdict instead of reclassifying the change in the client.
      const reopen = (assignment: OperationAssignment): OperationAssignment => result.acknowledgementReset && assignment.taskId === task.id
        ? { ...assignment, acknowledgementStatus: 'PENDING', version: assignment.version + 1 }
        : assignment
      set(state => ({
        error: null,
        selectedEvent: state.selectedEvent?.tasks.some(item => item.id === task.id)
          ? {
              ...state.selectedEvent,
              tasks: state.selectedEvent.tasks.map(item => item.id === task.id ? { ...item, ...result.task } : item),
              assignees: state.selectedEvent.assignees.map(reopen),
            }
          : state.selectedEvent,
        selectedTask: state.selectedTask?.task.id === task.id
          ? {
              ...state.selectedTask,
              task: { ...state.selectedTask.task, ...result.task },
              assignees: state.selectedTask.assignees.map(reopen),
            }
          : state.selectedTask,
        tasks: state.tasks.map(item => item.id === task.id ? { ...item, ...result.task, myAssignments: item.myAssignments?.map(reopen) } : item),
      }))
      return result
    } catch (error) {
      if (sameScope(requestScope)) { set({ error: formatStoreError(error, 'Không thể cập nhật task') }); handleConflictSync(get, error) }
      throw error
    }
  },

  assignTask: async (task, target, role, idempotencyKey) => {
    const requestScope = scope()
    set({ assignmentWarnings: null })
    try {
      const result = await api.assignTask(task.id, { version: task.version, ...target, assignmentRole: role }, idempotencyKey)
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc phân công.')
      if (result.assignment.parishId !== requestScope.parishId || result.assignment.taskId !== task.id) throw new Error('Không thể xác nhận assignment trong giáo xứ hiện tại')
      set({ assignmentWarnings: { taskId: task.id, items: result.conflictWarnings.map(({ id, startsAt, endsAt }) => ({ id, startsAt, endsAt })) } })
      set(state => state.selectedEvent?.tasks.some(item => item.id === task.id) ? ({ selectedEvent: { ...state.selectedEvent, tasks: state.selectedEvent.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion } : item), assignees: [...state.selectedEvent.assignees.filter(item => item.id !== result.assignment.id), result.assignment] } }) : {})
      set(state => state.selectedTask?.task.id === task.id ? ({
        selectedTask: {
          ...state.selectedTask,
          task: { ...state.selectedTask.task, version: result.taskVersion },
          assignees: [...state.selectedTask.assignees.filter(item => item.id !== result.assignment.id), result.assignment],
        },
      }) : {})
    } catch (error) {
      if (sameScope(requestScope)) { set({ error: formatStoreError(error, 'Không thể phân công task') }); handleConflictSync(get, error) }
      throw error
    }
  },

  dispatchTask: async (task, primary, reserve, acknowledgeBy, idempotencyKey) => {
    const requestScope = scope()
    try {
      const result = await api.createTaskDispatch(task.id, {
        version: task.version,
        acknowledgeBy,
        ...('userId' in primary ? { primaryUserId: primary.userId } : { primaryPersonId: primary.personId }),
        ...(reserve ? ('userId' in reserve ? { reserveUserId: reserve.userId } : { reservePersonId: reserve.personId }) : {}),
      }, idempotencyKey)
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc phân công.')
      if (result.dispatch.parishId !== requestScope.parishId || result.dispatch.taskId !== task.id) throw new Error('Không thể xác nhận lượt phân công trong giáo xứ hiện tại')
      set(state => ({
        selectedEvent: state.selectedEvent?.tasks.some(item => item.id === task.id)
          ? { ...state.selectedEvent, tasks: state.selectedEvent.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion } : item) }
          : state.selectedEvent,
        selectedTask: state.selectedTask?.task.id === task.id
          ? { ...state.selectedTask, task: { ...state.selectedTask.task, version: result.taskVersion } }
          : state.selectedTask,
      }))
    } catch (error) {
      if (sameScope(requestScope)) set({ error: formatStoreError(error, 'Không thể tạo lượt phân công chính/dự bị') })
      throw error
    }
  },

  acceptTaskDispatch: async (invitation, idempotencyKey) => {
    const requestScope = scope()
    try {
      const result = await api.acceptTaskDispatch(invitation.taskId, invitation.id, { version: invitation.version, target: invitation.target }, idempotencyKey)
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc nhận nhiệm vụ.')
      if (result.dispatch.parishId !== requestScope.parishId || result.assignment.taskId !== invitation.taskId) throw new Error('Không thể xác nhận nhận nhiệm vụ trong giáo xứ hiện tại')
      set(state => ({
        dispatchInvitations: state.dispatchInvitations.filter(item => item.id !== invitation.id),
        tasks: state.tasks.map(item => item.id === invitation.taskId ? { ...item, version: result.taskVersion, myAssignments: [...(item.myAssignments ?? []).filter(assignment => assignment.id !== result.assignment.id), result.assignment] } : item),
        selectedEvent: state.selectedEvent?.tasks.some(item => item.id === invitation.taskId) ? {
          ...state.selectedEvent,
          tasks: state.selectedEvent.tasks.map(item => item.id === invitation.taskId ? { ...item, version: result.taskVersion } : item),
          assignees: [...state.selectedEvent.assignees.filter(assignment => assignment.id !== result.assignment.id), result.assignment],
        } : state.selectedEvent,
      }))
      await useOperationsStore.getState().fetch().catch(() => undefined)
    } catch (error) {
      if (sameScope(requestScope)) set({ error: formatStoreError(error, 'Không thể nhận nhiệm vụ') })
      throw error
    }
  },

  transitionEvent: async (id, status, version, options, idempotencyKey) => {
    const requestScope = scope()
    try {
      const updated = await api.transitionEvent(id, { status, version, ...options }, idempotencyKey)
      if (updated.parishId !== scope().parishId) throw new Error('Không thể xác nhận event trong giáo xứ hiện tại')
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc cập nhật event.')
      set(state => ({
        events: state.events.map(event => event.id === id ? updated : event), error: null,
        selectedEvent: state.selectedEvent?.event.id === id ? { ...state.selectedEvent, event: updated } : state.selectedEvent,
      }))
      await persistCurrentServerSnapshot()
      return updated
    } catch (error) {
      if (sameScope(requestScope)) { set({ error: formatStoreError(error, 'Không thể chuyển trạng thái sự kiện') }); handleConflictSync(get, error) }
      throw error
    }
  },

  transitionTask: async (task, status, options) => {
    const completionNote = typeof options === 'string' ? options : options?.completionNote
    const blockedReason = typeof options === 'object' ? options?.blockedReason : undefined
    const cancellationReason = typeof options === 'object' ? options?.cancellationReason : undefined
    const idempotencyKey = typeof options === 'object' ? options?.idempotencyKey : undefined
    const requestScope = scope()
    try {
      const updated = await api.transitionTask(task.id, { status, version: task.version, completionNote, blockedReason, cancellationReason }, idempotencyKey)
      if (updated.parishId !== scope().parishId) throw new Error('Không thể xác nhận task trong giáo xứ hiện tại')
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc cập nhật task.')
      set(state => ({
        error: null,
        tasks: state.tasks.map(item => item.id === task.id ? updated : item),
        selectedEvent: state.selectedEvent ? { ...state.selectedEvent, tasks: state.selectedEvent.tasks.map(item => item.id === task.id ? updated : item) } : state.selectedEvent,
        selectedTask: state.selectedTask?.task.id === task.id ? { ...state.selectedTask, task: updated } : state.selectedTask,
      }))
      await persistCurrentServerSnapshot()
      return updated
    } catch (error) {
      if (sameScope(requestScope)) {
        set({ error: formatStoreError(error, 'Không thể cập nhật task') })
        handleConflictSync(get, error)
      }
      throw error
    }
  },

  acknowledgeTask: async (task, status, note, idempotencyKey) => {
    const requestScope = scope()
    try {
      const assignment = task.myAssignments?.find(item => item.acknowledgementStatus === 'PENDING')
      if (!assignment) throw new Error('Không tìm thấy phân công đang chờ phản hồi.')
      const updated = await api.acknowledgeTask(task.id, assignment.id, assignment.version, status, note, idempotencyKey)
      if (updated.parishId !== scope().parishId) throw new Error('Không thể xác nhận phân công trong giáo xứ hiện tại')
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc phản hồi phân công.')
      set(state => ({
        tasks: state.tasks.map(item => item.id === task.id ? { ...item, myAssignments: item.myAssignments?.map(value => value.id === updated.id ? updated : value) } : item),
        selectedEvent: state.selectedEvent ? {
          ...state.selectedEvent,
          assignees: state.selectedEvent.assignees.map(value => value.id === updated.id ? { ...value, acknowledgementStatus: updated.acknowledgementStatus, version: updated.version } : value),
        } : state.selectedEvent,
        selectedTask: state.selectedTask ? {
          ...state.selectedTask,
          assignees: state.selectedTask.assignees.map(value => value.id === updated.id ? { ...value, acknowledgementStatus: updated.acknowledgementStatus, version: updated.version } : value),
        } : state.selectedTask,
      }))
      await persistCurrentServerSnapshot()
    } catch (error) {
      if (sameScope(requestScope)) { set({ error: formatStoreError(error, 'Không thể cập nhật trạng thái nhận việc') }); handleConflictSync(get, error) }
      throw error
    }
  },

  resumeEventAutomation: async (id, version, reason, idempotencyKey) => {
    const requestScope = scope()
    try {
      const updated = await api.resumeEventAutomation(id, { version, reason }, idempotencyKey)
      if (updated.parishId !== scope().parishId) throw new Error('Không thể tiếp tục tự động hóa trong giáo xứ hiện tại')
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc cập nhật event.')
      set(state => ({
        events: state.events.map(event => event.id === id ? updated : event),
        selectedEvent: state.selectedEvent?.event.id === id ? { ...state.selectedEvent, event: updated } : state.selectedEvent,
      }))
      await persistCurrentServerSnapshot()
      return updated
    } catch (error) {
      if (sameScope(requestScope)) { set({ error: formatStoreError(error, 'Không thể tiếp tục tự động chuyển giai đoạn') }); handleConflictSync(get, error) }
      throw error
    }
  },

  addChecklistItem: async (task, label, isRequired, idempotencyKey) => {
    const requestScope = scope()
    try {
      const result = await api.createChecklistItem(task.id, { version: task.version, label, isRequired }, idempotencyKey)
      if (result.item.parishId !== requestScope.parishId || result.item.taskId !== task.id) throw new Error('Không thể xác nhận checklist trong task hiện tại')
      if (!sameScope(requestScope)) return
      set(state => ({
        selectedTask: state.selectedTask?.task.id === task.id ? {
          ...state.selectedTask,
          task: { ...state.selectedTask.task, version: result.taskVersion },
          checklist: [...state.selectedTask.checklist, result.item],
        } : state.selectedTask,
        selectedEvent: state.selectedEvent ? { ...state.selectedEvent, tasks: state.selectedEvent.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion } : item) } : state.selectedEvent,
        tasks: state.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion } : item),
      }))
    } catch (error) {
      if (sameScope(requestScope)) {
        set({ error: formatStoreError(error, 'Không thể thêm mục checklist') })
        handleConflictSync(get, error)
      }
      throw error
    }
  },

  toggleChecklistItem: async (task, checklistItem, idempotencyKey) => {
    const requestScope = scope()
    try {
      const result = await api.updateChecklistItem(task.id, checklistItem.id, { version: task.version, isDone: !checklistItem.isDone }, idempotencyKey)
      if (result.item.parishId !== requestScope.parishId || result.item.taskId !== task.id) throw new Error('Không thể xác nhận checklist trong task hiện tại')
      if (!sameScope(requestScope)) return
      set(state => ({
        selectedTask: state.selectedTask?.task.id === task.id ? {
          ...state.selectedTask,
          task: { ...state.selectedTask.task, version: result.taskVersion },
          checklist: state.selectedTask.checklist.map(item => item.id === checklistItem.id ? result.item : item),
        } : state.selectedTask,
        selectedEvent: state.selectedEvent ? { ...state.selectedEvent, tasks: state.selectedEvent.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion } : item) } : state.selectedEvent,
        tasks: state.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion } : item),
      }))
    } catch (error) {
      if (sameScope(requestScope)) {
        set({ error: formatStoreError(error, 'Không thể cập nhật checklist') })
        handleConflictSync(get, error)
      }
      throw error
    }
  },

  cancelReminder: async (reminder, idempotencyKey) => {
    const requestScope = scope()
    try {
      const result = await api.cancelReminder(reminder.id, reminder.version, 'Người nhận không còn cần lịch nhắc này.', idempotencyKey)
      if (!sameScope(requestScope)) return
      if (result.id !== reminder.id || result.parishId !== requestScope.parishId || result.status !== 'CANCELLED') throw new Error('Không thể xác nhận hủy lịch nhắc.')
      set(state => ({ reminders: state.reminders.map(item => item.id === reminder.id ? { ...item, status: 'CANCELLED', version: result.version } : item) }))
    } catch (error) {
      if (sameScope(requestScope)) { set({ error: formatStoreError(error, 'Không hủy được lịch nhắc') }); handleConflictSync(get, error) }
      throw error
    }
  },

  markReminderRead: async (reminder, idempotencyKey) => {
    const requestScope = scope()
    try {
      const result = await api.markReminderRead(reminder.id, reminder.version, idempotencyKey)
      if (!sameScope(requestScope)) return
      if (result.id !== reminder.id) throw new Error('Máy chủ trả xác nhận nhắc việc không khớp yêu cầu')
      set(state => ({
        error: null,
        reminders: state.reminders.map(item => item.id === reminder.id ? { ...item, readAt: result.readAt, version: result.version ?? (item.version + 1) } : item),
      }))
    } catch (error) {
      if (sameScope(requestScope)) {
        set({ error: formatStoreError(error, 'Không thể đánh dấu nhắc việc đã đọc') })
        handleConflictSync(get, error)
      }
      throw error
    }
  },

  clear: () => {
    sessionGeneration++; eventRequest++; taskRequest++; overviewRequest++
    abortDetailLoads()
    set({
    events: [], tasks: [], reminders: [], dispatchInvitations: [], assignmentWarnings: null, permissions: {}, creationOptions: null, selectedEvent: null, selectedTask: null, detailLoading: false, taskDetailLoading: false, loading: false, error: null,
    source: 'none', cacheSavedAt: null, eventTotal: 0, taskTotal: 0, eventPage: 1, taskPage: 1,
    reminderTotal: 0, reminderPage: 1, eventHasMore: false, taskHasMore: false, reminderHasMore: false,
    })
  },
}))
