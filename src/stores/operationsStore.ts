import { create } from 'zustand'
import { api, ApiError } from '../lib/api'
import type { OperationChecklistItem, OperationEvent, OperationEventDetail, OperationReminder, OperationTask, OperationTaskDetail, OperationsListPage } from '../lib/api/operations'
import { dexieStorage } from '../lib/db'
import { getTenantScope } from '../lib/tenantScope'

const OPERATIONS_CACHE_KEY = 'parish_operations_overview_v1'
let sessionGeneration = 0
let eventRequest = 0
let taskRequest = 0
let overviewRequest = 0

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
  createEvent: (input: { title: string; eventType: string; startsAt: string; endsAt: string; timezone: string }) => Promise<OperationEvent>
  selectEvent: (id: string | null) => Promise<void>
  selectTask: (id: string | null) => Promise<void>
  refreshTaskViews: (id: string) => Promise<void>
  createTask: (input: { title: string; eventId: string; workstreamId?: string | null; dueAt?: string | null; isRequired?: boolean }) => Promise<OperationTask>
  assignTask: (task: OperationTask, personId: string, role: 'OWNER' | 'CONTRIBUTOR' | 'APPROVER' | 'OBSERVER') => Promise<void>
  transitionEvent: (id: string, status: OperationEvent['status'], version: number, options?: { reason?: string; outcomeSummary?: string }) => Promise<OperationEvent>
  transitionTask: (task: OperationTask, status: OperationTask['status'], completionNote?: string) => Promise<OperationTask>
  acknowledgeTask: (task: OperationTask, status: 'ACCEPTED' | 'DECLINED', note?: string) => Promise<void>
  addChecklistItem: (task: OperationTask, label: string, isRequired: boolean) => Promise<void>
  toggleChecklistItem: (task: OperationTask, item: OperationChecklistItem) => Promise<void>
  markReminderRead: (reminder: OperationReminder) => Promise<void>
  cancelReminder: (reminder: OperationReminder) => Promise<void>
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
  // normalizes genuine reachability failures to ApiError(0).
  return error instanceof ApiError && error.status === 0
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

export const useOperationsStore = create<OperationsState>((set) => ({
  events: [],
  tasks: [],
  reminders: [],
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

  fetch: async () => {
    const requestScope = scope()
    const request = ++overviewRequest
    const parishId = requestScope.parishId
    set({ loading: true, error: null })
    try {
      const [eventPage, taskPage, reminderPage, access] = await Promise.all([api.getEvents(1), api.getTasks(true, 1), api.getReminders(1), api.getPermissions()])
      const eventMeta = pageMeta(eventPage)
      const taskMeta = pageMeta(taskPage)
      const reminderMeta = pageMeta(reminderPage)
      if (access.parishId !== parishId) throw new Error('Máy chủ trả quyền Operations sai phạm vi giáo xứ')
      if (!sameScope(requestScope) || request !== overviewRequest) return
      const events = assertTenant(eventPage.data, parishId)
      const tasks = assertTenant(taskPage.data, parishId)
      const reminders = assertTenant(reminderPage.data, parishId)
      const savedAt = new Date().toISOString()
      set({
        events, tasks, reminders, permissions: access.permissions, loading: false, error: null, source: 'server', cacheSavedAt: savedAt,
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
          set({
            selectedEvent: null, selectedTask: null, assignmentWarnings: null, detailLoading: false, taskDetailLoading: false,
            events: cached.events, tasks: cached.tasks, reminders: [], permissions: {}, loading: false, error: null, source: 'cache', cacheSavedAt: cached.savedAt,
            eventTotal: cached.eventTotal, taskTotal: cached.taskTotal, eventPage: 1, taskPage: 1,
            eventHasMore: cached.events.length < cached.eventTotal, taskHasMore: cached.tasks.length < cached.taskTotal,
            reminderTotal: 0, reminderPage: 1, reminderHasMore: false,
          })
          return
        }
      }
      const message = error instanceof Error ? error.message : 'Không tải được công việc vận hành'
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
      set({ loading: false, error: error instanceof Error ? error.message : 'Không tải thêm được sự kiện vận hành' })
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
      set({ loading: false, error: error instanceof Error ? error.message : 'Không tải thêm được công việc' })
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
      set({ loading: false, error: error instanceof Error ? error.message : 'Không tải thêm được nhắc việc' })
      throw error
    }
  },

  createEvent: async input => {
    const requestScope = scope()
    try {
      const created = await api.createEvent(input)
      if (created.parishId !== scope().parishId) throw new Error('Không thể xác nhận event trong giáo xứ hiện tại')
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc tạo event.')
      set(state => ({ events: [created, ...state.events], eventTotal: state.eventTotal + 1 }))
      await persistCurrentServerSnapshot()
      return created
    } catch (error) {
      if (sameScope(requestScope)) set({ error: error instanceof Error ? error.message : 'Không thể tạo operation event' })
      throw error
    }
  },

  selectEvent: async id => {
    const request = ++eventRequest
    taskRequest++
    if (!id) { set({ selectedEvent: null, selectedTask: null, detailLoading: false, taskDetailLoading: false }); return }
    const requestScope = scope()
    set({ detailLoading: true, selectedTask: null, taskDetailLoading: false, error: null })
    try {
      const detail = await api.getEvent(id)
      const activeScope = getTenantScope()
      if (!activeScope || !sameScope(requestScope) || request !== eventRequest) return
      if (detail.event.id !== id || detail.event.parishId !== activeScope.parishId || detail.tasks.some((task: OperationTask) => task.parishId !== activeScope.parishId)) throw new Error('Máy chủ trả chi tiết event sai phạm vi giáo xứ')
      set({ selectedEvent: detail, selectedTask: null, detailLoading: false })
    } catch (error) {
      if (!sameScope(requestScope) || request !== eventRequest) return
      set({ detailLoading: false, error: error instanceof Error ? error.message : 'Không thể tải chi tiết event' })
      throw error
    }
  },

  selectTask: async id => {
    const request = ++taskRequest
    if (!id) { set({ selectedTask: null, taskDetailLoading: false }); return }
    const requestScope = scope()
    set({ selectedTask: null, taskDetailLoading: true, error: null })
    try {
      const detail = await api.getTask(id)
      const activeScope = getTenantScope()
      if (!activeScope || !sameScope(requestScope) || request !== taskRequest) return
      if (detail.task.id !== id || detail.task.parishId !== activeScope.parishId || [...detail.checklist, ...detail.assignees, ...detail.comments].some(item => item.parishId !== activeScope.parishId || item.taskId !== id)) throw new Error('Máy chủ trả chi tiết task sai phạm vi giáo xứ')
      set(state => ({ selectedTask: detail, taskDetailLoading: false,
        selectedEvent: state.selectedEvent?.tasks.some(task => task.id === id) ? { ...state.selectedEvent,
          tasks: state.selectedEvent.tasks.map(task => task.id === id ? detail.task : task),
          assignees: [...state.selectedEvent.assignees.filter(assignment => assignment.taskId !== id), ...detail.assignees],
        } : state.selectedEvent,
      }))
    } catch (error) {
      if (!sameScope(requestScope) || request !== taskRequest) return
      set({ taskDetailLoading: false, error: error instanceof Error ? error.message : 'Không thể tải chi tiết task' })
      throw error
    }
  },

  refreshTaskViews: async id => {
    const requestScope = scope()
    const selection = taskRequest
    await useOperationsStore.getState().fetch()
    if (!sameScope(requestScope) || selection !== taskRequest || useOperationsStore.getState().selectedTask?.task.id !== id) return
    const event = useOperationsStore.getState().selectedEvent
    if (event?.tasks.some(task => task.id === id)) {
      const expectedEventRequest = eventRequest + 1
      await useOperationsStore.getState().selectEvent(event.event.id)
      if (!sameScope(requestScope) || taskRequest !== selection + 1 || eventRequest !== expectedEventRequest) return
    }
    await useOperationsStore.getState().selectTask(id)
  },

  createTask: async input => {
    const requestScope = scope()
    const created = await api.createTask(input)
    if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc tạo task.')
    if (created.parishId !== requestScope.parishId || created.operationEventId !== input.eventId) throw new Error('Không thể xác nhận task trong giáo xứ hiện tại')
    set(state => ({ selectedEvent: state.selectedEvent?.event.id === input.eventId ? { ...state.selectedEvent, tasks: [...state.selectedEvent.tasks, created] } : state.selectedEvent }))
    return created
  },

  assignTask: async (task, personId, role) => {
    const requestScope = scope()
    set({ assignmentWarnings: null })
    try {
      const result = await api.assignTask(task.id, { version: task.version, personId, assignmentRole: role })
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc phân công.')
      if (result.assignment.parishId !== requestScope.parishId || result.assignment.taskId !== task.id) throw new Error('Không thể xác nhận assignment trong giáo xứ hiện tại')
      set({ assignmentWarnings: { taskId: task.id, items: result.conflictWarnings.map(({ id, startsAt, endsAt }) => ({ id, startsAt, endsAt })) } })
      set(state => state.selectedEvent?.tasks.some(item => item.id === task.id) ? ({ selectedEvent: { ...state.selectedEvent, tasks: state.selectedEvent.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion } : item), assignees: [...state.selectedEvent.assignees.filter(item => item.id !== result.assignment.id), result.assignment] } }) : {})
    } catch (error) {
      if (sameScope(requestScope)) set({ error: error instanceof Error ? error.message : 'Không thể phân công task' })
      throw error
    }
  },

  transitionEvent: async (id, status, version, options) => {
    const requestScope = scope()
    try {
      const updated = await api.transitionEvent(id, { status, version, ...options })
      if (updated.parishId !== scope().parishId) throw new Error('Không thể xác nhận event trong giáo xứ hiện tại')
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc cập nhật event.')
      set(state => ({
        events: state.events.map(event => event.id === id ? updated : event),
        selectedEvent: state.selectedEvent?.event.id === id ? { ...state.selectedEvent, event: updated } : state.selectedEvent,
      }))
      await persistCurrentServerSnapshot()
      return updated
    } catch (error) {
      if (sameScope(requestScope)) set({ error: error instanceof Error ? error.message : 'Không thể chuyển trạng thái sự kiện' })
      throw error
    }
  },

  transitionTask: async (task, status, completionNote) => {
    const requestScope = scope()
    try {
      const updated = await api.transitionTask(task.id, { status, version: task.version, completionNote })
      if (updated.parishId !== scope().parishId) throw new Error('Không thể xác nhận task trong giáo xứ hiện tại')
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc cập nhật task.')
      set(state => ({
        tasks: state.tasks.map(item => item.id === task.id ? updated : item),
        selectedEvent: state.selectedEvent ? { ...state.selectedEvent, tasks: state.selectedEvent.tasks.map(item => item.id === task.id ? updated : item) } : state.selectedEvent,
      }))
      await persistCurrentServerSnapshot()
      return updated
    } catch (error) {
      if (sameScope(requestScope)) set({ error: error instanceof Error ? error.message : 'Không thể cập nhật task' })
      throw error
    }
  },

  acknowledgeTask: async (task, status, note) => {
    const requestScope = scope()
    try {
      const assignment = task.myAssignments?.find(item => item.acknowledgementStatus === 'PENDING')
      if (!assignment) throw new Error('Không tìm thấy phân công đang chờ phản hồi.')
      const updated = await api.acknowledgeTask(task.id, assignment.id, assignment.version, status, note)
      if (updated.parishId !== scope().parishId) throw new Error('Không thể xác nhận phân công trong giáo xứ hiện tại')
      if (!sameScope(requestScope)) throw new Error('Phiên người dùng đã thay đổi trong lúc phản hồi phân công.')
      set(state => ({ tasks: state.tasks.map(item => item.id === task.id ? { ...item, myAssignments: item.myAssignments?.map(value => value.id === updated.id ? updated : value) } : item) }))
      await persistCurrentServerSnapshot()
    } catch (error) {
      if (sameScope(requestScope)) set({ error: error instanceof Error ? error.message : 'Không thể cập nhật trạng thái nhận việc' })
      throw error
    }
  },

  addChecklistItem: async (task, label, isRequired) => {
    const requestScope = scope()
    try {
      const result = await api.createChecklistItem(task.id, { version: task.version, label, isRequired })
      if (result.item.parishId !== requestScope.parishId || result.item.taskId !== task.id) throw new Error('Không thể xác nhận checklist trong task hiện tại')
      if (!sameScope(requestScope)) return
      set(state => ({
        selectedTask: state.selectedTask?.task.id === task.id ? {
          ...state.selectedTask,
          task: { ...state.selectedTask.task, version: result.taskVersion, approvalStatus: result.approvalStatus },
          checklist: [...state.selectedTask.checklist, result.item],
        } : state.selectedTask,
        selectedEvent: state.selectedEvent ? { ...state.selectedEvent, tasks: state.selectedEvent.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion, approvalStatus: result.approvalStatus } : item) } : state.selectedEvent,
        tasks: state.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion, approvalStatus: result.approvalStatus } : item),
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể thêm mục checklist' })
      throw error
    }
  },

  toggleChecklistItem: async (task, checklistItem) => {
    const requestScope = scope()
    try {
      const result = await api.updateChecklistItem(task.id, checklistItem.id, { version: task.version, isDone: !checklistItem.isDone })
      if (result.item.parishId !== requestScope.parishId || result.item.taskId !== task.id) throw new Error('Không thể xác nhận checklist trong task hiện tại')
      if (!sameScope(requestScope)) return
      set(state => ({
        selectedTask: state.selectedTask?.task.id === task.id ? {
          ...state.selectedTask,
          task: { ...state.selectedTask.task, version: result.taskVersion, approvalStatus: result.approvalStatus },
          checklist: state.selectedTask.checklist.map(item => item.id === checklistItem.id ? result.item : item),
        } : state.selectedTask,
        selectedEvent: state.selectedEvent ? { ...state.selectedEvent, tasks: state.selectedEvent.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion, approvalStatus: result.approvalStatus } : item) } : state.selectedEvent,
        tasks: state.tasks.map(item => item.id === task.id ? { ...item, version: result.taskVersion, approvalStatus: result.approvalStatus } : item),
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể cập nhật checklist' })
      throw error
    }
  },

  cancelReminder: async reminder => {
    const requestScope = scope()
    try {
      const result = await api.cancelReminder(reminder.id, 'Người nhận không còn cần lịch nhắc này.')
      if (!sameScope(requestScope)) return
      if (result.id !== reminder.id || result.parishId !== requestScope.parishId || result.status !== 'CANCELLED') throw new Error('Không thể xác nhận hủy lịch nhắc.')
      set(state => ({ reminders: state.reminders.map(item => item.id === reminder.id ? { ...item, status: 'CANCELLED' } : item) }))
    } catch (error) {
      if (sameScope(requestScope)) set({ error: error instanceof Error ? error.message : 'Không hủy được lịch nhắc' })
      throw error
    }
  },

  markReminderRead: async reminder => {
    const requestScope = scope()
    try {
      const result = await api.markReminderRead(reminder.id)
      if (!sameScope(requestScope)) return
      if (result.id !== reminder.id) throw new Error('Máy chủ trả xác nhận nhắc việc không khớp yêu cầu')
      set(state => ({ reminders: state.reminders.map(item => item.id === reminder.id ? { ...item, readAt: result.readAt } : item) }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Không thể đánh dấu nhắc việc đã đọc' })
      throw error
    }
  },

  clear: () => {
    sessionGeneration++; eventRequest++; taskRequest++; overviewRequest++
    set({
    events: [], tasks: [], reminders: [], assignmentWarnings: null, permissions: {}, selectedEvent: null, selectedTask: null, detailLoading: false, taskDetailLoading: false, loading: false, error: null,
    source: 'none', cacheSavedAt: null, eventTotal: 0, taskTotal: 0, eventPage: 1, taskPage: 1,
    reminderTotal: 0, reminderPage: 1, eventHasMore: false, taskHasMore: false, reminderHasMore: false,
    })
  },
}))
