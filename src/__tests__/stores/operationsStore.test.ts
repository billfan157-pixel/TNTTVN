import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { api, ApiError } from '../../lib/api'
import { dexieStorage } from '../../lib/db'
import { setTenantScope } from '../../lib/tenantScope'
import type { OperationChecklistItem, OperationEvent, OperationEventDetail, OperationReminder, OperationTask, OperationTaskDetail } from '../../lib/api/operations'
import { useOperationsStore } from '../../stores/operationsStore'

const parishA = 'operations-store-a'
const parishB = 'operations-store-b'

function event(id: string, parishId = parishA): OperationEvent {
  return { id, parishId, title: `Event ${id}`, eventType: 'MEETING', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'DRAFT', visibility: 'INTERNAL', version: 1 }
}

function task(id: string, parishId = parishA): OperationTask {
  return {
    id, parishId, title: `Task ${id}`, status: 'TODO', priority: 'NORMAL', phase: 'PREPARATION', isRequired: false,
    version: 1,
    myAssignments: [{ id: `assignment-${id}`, parishId, taskId: id, userId: 'user-a', assignmentRole: 'OWNER', acknowledgementStatus: 'PENDING', version: 1 }],
  }
}

function reminder(id: string, parishId = parishA): OperationReminder {
  return {
    id, parishId, triggerAt: '2026-10-01T00:30:00Z',
    kind: 'TASK_DUE', status: 'SENT', version: 2, readAt: null, sentAt: '2026-10-01T00:30:01Z', createdAt: '2026-09-30T01:00:00Z',
  }
}

function page<T>(data: T[], current = 1, total = data.length, totalPages = Math.ceil(total / 50), limit = 50) {
  return { success: true as const, data, meta: { page: current, limit, total, totalPages }, error: null }
}

function eventDetail(id: string): OperationEventDetail {
  return { event: event(id), tasks: [], workstreams: [], assignees: [], permissions: {}, readiness: { percent: 100, blockers: [] } }
}
function taskDetail(id: string): OperationTaskDetail {
  return { task: task(id), checklist: [], assignees: [], comments: [], dependencies: [], permissions: {} }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('operationsStore server acknowledgement and scope boundary', () => {
  it('discards task transition acknowledgement after resetting the same actor session', async () => {
    const current = task('old-session')
    const response = deferred<OperationTask>()
    vi.spyOn(api, 'transitionTask').mockReturnValue(response.promise)
    const pending = useOperationsStore.getState().transitionTask(current, 'DONE')
    useOperationsStore.getState().clear()
    useOperationsStore.setState({ tasks: [current] })
    response.resolve({ ...current, status: 'DONE', version: 2 })
    await expect(pending).rejects.toThrow('Phiên người dùng đã thay đổi')
    expect(useOperationsStore.getState()).toMatchObject({ tasks: [current], error: null })
    expect(dexieStorage.setItem).not.toHaveBeenCalled()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    setTenantScope({ parishId: parishA, userId: 'user-a' })
    useOperationsStore.getState().clear()
    vi.spyOn(dexieStorage, 'getItem').mockResolvedValue(null)
    vi.spyOn(dexieStorage, 'setItem').mockResolvedValue(undefined)
    vi.spyOn(api, 'getReminders').mockResolvedValue(page([]))
    vi.spyOn(api, 'getDispatchInbox').mockResolvedValue(page([]))
  })

  afterEach(() => setTenantScope(null))

  it('does not replace a newer event selection with a late response', async () => {
    const old = deferred<OperationEventDetail>()
    vi.spyOn(api, 'getEvent').mockReturnValueOnce(old.promise).mockResolvedValueOnce(eventDetail('B'))
    const pending = useOperationsStore.getState().selectEvent('A')
    await useOperationsStore.getState().selectEvent('B')
    old.resolve(eventDetail('A')); await pending
    expect(useOperationsStore.getState().selectedEvent?.event.id).toBe('B')
  })

  it('does not resurrect closed task detail or leak a stale error', async () => {
    const old = deferred<OperationTaskDetail>()
    vi.spyOn(api, 'getTask').mockReturnValue(old.promise)
    const pending = useOperationsStore.getState().selectTask('A')
    await useOperationsStore.getState().selectTask(null)
    old.reject(new Error('old failure')); await pending.catch(() => undefined)
    expect(useOperationsStore.getState()).toMatchObject({ selectedTask: null, error: null, taskDetailLoading: false })
  })

  it('does not resurrect a closed task when its response succeeds', async () => {
    const old = deferred<OperationTaskDetail>()
    vi.spyOn(api, 'getTask').mockReturnValue(old.promise)
    const pending = useOperationsStore.getState().selectTask('A')
    await useOperationsStore.getState().selectTask(null)
    old.resolve(taskDetail('A')); await pending
    expect(useOperationsStore.getState().selectedTask).toBeNull()
  })

  it('hides old task actions while a different task detail is loading', async () => {
    useOperationsStore.setState({ selectedTask: taskDetail('old') })
    const response = deferred<OperationTaskDetail>()
    vi.spyOn(api, 'getTask').mockReturnValue(response.promise)
    const pending = useOperationsStore.getState().selectTask('new')
    expect(useOperationsStore.getState()).toMatchObject({ selectedTask: null, taskDetailLoading: true })
    response.resolve(taskDetail('new'))
    await pending
    expect(useOperationsStore.getState().selectedTask?.task.id).toBe('new')
  })

  it('forwards a caller-provided idempotency key so form retries reuse it', async () => {
    const create = vi.spyOn(api, 'createEvent').mockResolvedValue(event('E-new'))
    const input = {
      title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z',
      timezone: 'Asia/Ho_Chi_Minh' as const,
    }
    await useOperationsStore.getState().createEvent(input, 'stable-key-1')
    expect(create).toHaveBeenCalledWith(input, 'stable-key-1')
  })

  it('refreshes overview and event task assignments after handover', async () => {
    const updated = { ...taskDetail('T'), task: { ...task('T'), version: 5 } }
    useOperationsStore.setState({ selectedTask: taskDetail('T'), selectedEvent: { ...eventDetail('E'), tasks: [task('T')], assignees: task('T').myAssignments! } })
    vi.spyOn(api, 'getEvents').mockResolvedValue(page([event('E')]))
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([]))
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, permissions: {} })
    vi.spyOn(api, 'getTask').mockResolvedValue(updated)
    vi.spyOn(api, 'getEvent').mockResolvedValue({ ...eventDetail('E'), tasks: [updated.task], readiness: { percent: 0, blockers: [{ type: 'OWNER_PENDING', id: 'T', label: 'Chờ nhận việc' }] } })
    await useOperationsStore.getState().refreshTaskViews('T')
    expect(useOperationsStore.getState().tasks).toEqual([])
    expect(useOperationsStore.getState().selectedEvent).toMatchObject({ tasks: [{ id: 'T', version: 5 }], assignees: [] })
    expect(useOperationsStore.getState().selectedEvent?.readiness.percent).toBe(0)
  })

  it('does not reopen a task closed during overview refresh', async () => {
    useOperationsStore.setState({ selectedTask: taskDetail('T') })
    const response = deferred<ReturnType<typeof page<OperationEvent>>>()
    vi.spyOn(api, 'getEvents').mockReturnValue(response.promise)
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([]))
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, permissions: {} })
    const getTask = vi.spyOn(api, 'getTask')
    const pending = useOperationsStore.getState().refreshTaskViews('T')
    await useOperationsStore.getState().selectTask(null)
    response.resolve(page([])); await pending
    expect(getTask).not.toHaveBeenCalled()
    expect(useOperationsStore.getState().selectedTask).toBeNull()
  })

  it('invalidates reads across reset even if the same account signs in again', async () => {
    const old = deferred<OperationEventDetail>()
    vi.spyOn(api, 'getEvent').mockReturnValue(old.promise)
    const pending = useOperationsStore.getState().selectEvent('A')
    useOperationsStore.getState().clear()
    setTenantScope({ parishId: parishA, userId: 'user-a' })
    old.resolve(eventDetail('A')); await pending
    expect(useOperationsStore.getState().selectedEvent).toBeNull()
  })

  it('does not append an assignment to another selected event', async () => {
    const old = deferred<Awaited<ReturnType<typeof api.assignTask>>>()
    vi.spyOn(api, 'assignTask').mockReturnValue(old.promise)
    const assignedTask = { ...task('A'), operationEventId: 'event-A' }
    useOperationsStore.setState({ selectedEvent: { ...eventDetail('event-A'), tasks: [assignedTask] } })
    const pending = useOperationsStore.getState().assignTask(assignedTask, { personId: 'person' }, 'OWNER')
    useOperationsStore.setState({ selectedEvent: eventDetail('event-B') })
    old.resolve({ assignment: assignedTask.myAssignments![0], taskVersion: 2, conflictWarnings: [] }); await pending
    expect(useOperationsStore.getState().selectedEvent?.assignees).toEqual([])
  })

  it('creates a server-acknowledged primary/reserve dispatch and advances the task version', async () => {
    const current = { ...task('A'), operationEventId: 'event-A' }
    useOperationsStore.setState({ selectedEvent: { ...eventDetail('event-A'), tasks: [current] } })
    const createDispatch = vi.spyOn(api, 'createTaskDispatch').mockResolvedValue({
      dispatch: { id: 'OPD-1', parishId: parishA, taskId: current.id, acknowledgeBy: '2027-01-01T05:00:00Z', status: 'SCHEDULED', version: 1 },
      taskVersion: 2,
    })

    await useOperationsStore.getState().dispatchTask(current, { userId: 'primary' }, { personId: 'reserve-person' }, '2027-01-01T05:00:00Z')

    expect(createDispatch).toHaveBeenCalledWith('A', {
      version: 1, acknowledgeBy: '2027-01-01T05:00:00Z', primaryUserId: 'primary', reservePersonId: 'reserve-person',
    }, undefined)
    expect(useOperationsStore.getState().selectedEvent?.tasks[0].version).toBe(2)
  })

  it('removes an accepted dispatch invitation only after server acknowledgement', async () => {
    const invitation = {
      id: 'OPD-1', parishId: parishA, taskId: 'A', version: 3, target: 'RESERVE' as const,
      acknowledgeBy: '2027-01-01T05:00:00Z', invitedAt: '2027-01-01T04:00:00Z', taskTitle: 'Task A', eventId: 'event-A', eventTitle: 'Event A',
    }
    useOperationsStore.setState({ dispatchInvitations: [invitation] })
    vi.spyOn(api, 'acceptTaskDispatch').mockResolvedValue({
      dispatch: { id: invitation.id, parishId: parishA, taskId: invitation.taskId, acknowledgeBy: invitation.acknowledgeBy, status: 'ACCEPTED', acceptedTarget: 'RESERVE', version: 4 },
      assignment: { id: 'OPA-new', parishId: parishA, taskId: invitation.taskId, userId: 'user-a', assignmentRole: 'OWNER', acknowledgementStatus: 'ACCEPTED', version: 1 },
      taskVersion: 2,
    })
    vi.spyOn(api, 'getEvents').mockResolvedValue(page([]))
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([]))
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, permissions: {} })

    await useOperationsStore.getState().acceptTaskDispatch(invitation)

    expect(api.acceptTaskDispatch).toHaveBeenCalledWith('A', 'OPD-1', { version: 3, target: 'RESERVE' }, undefined)
    expect(useOperationsStore.getState().dispatchInvitations).toEqual([])
  })

  it('does not apply a create response to another account in the same parish', async () => {
    const old = deferred<OperationTask>()
    vi.spyOn(api, 'createTask').mockReturnValue(old.promise)
    const pending = useOperationsStore.getState().createTask({ title: 'A', eventId: 'E' })
    setTenantScope({ parishId: parishA, userId: 'user-b' })
    useOperationsStore.setState({ selectedEvent: eventDetail('E') })
    old.resolve({ ...task('A'), operationEventId: 'E' }); await pending.catch(() => undefined)
    expect(useOperationsStore.getState().selectedEvent?.tasks).toEqual([])
  })

  it('rejects mixed-tenant reads and does not project foreign Operations rows', async () => {
    vi.spyOn(api, 'getEvents').mockResolvedValue(page([event('A'), event('B', parishB)]))
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([]))
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, permissions: {} })

    await expect(useOperationsStore.getState().fetch()).rejects.toThrow(/sai phạm vi giáo xứ/i)
    expect(useOperationsStore.getState().events).toEqual([])
    expect(useOperationsStore.getState().error).toMatch(/sai phạm vi giáo xứ/i)
  })

  it('ignores a fetch response after the active user scope changes', async () => {
    let resolveEvents!: (value: ReturnType<typeof page<OperationEvent>>) => void
    vi.spyOn(api, 'getEvents').mockReturnValue(new Promise(resolve => { resolveEvents = resolve }))
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([]))
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, permissions: {} })

    const pending = useOperationsStore.getState().fetch()
    setTenantScope({ parishId: parishA, userId: 'user-b' })
    resolveEvents(page([event('A')]))
    await pending
    expect(useOperationsStore.getState().events).toEqual([])
  })

  it('does not create optimistic event state without server acknowledgement', async () => {
    vi.spyOn(api, 'createEvent').mockRejectedValue(new Error('Network offline'))
    await expect(useOperationsStore.getState().createEvent({ title: 'Offline', eventType: 'OTHER', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T02:00:00Z', timezone: 'UTC' })).rejects.toThrow('Network offline')
    expect(useOperationsStore.getState().events).toEqual([])
  })

  it('sends assignment identity and OCC version when acknowledging work', async () => {
    const assignedTask = task('A')
    useOperationsStore.setState({ tasks: [assignedTask] })
    const acknowledge = vi.spyOn(api, 'acknowledgeTask').mockResolvedValue({ ...assignedTask.myAssignments![0], acknowledgementStatus: 'ACCEPTED', version: 2 })

    await useOperationsStore.getState().acknowledgeTask(assignedTask, 'ACCEPTED')

    expect(acknowledge).toHaveBeenCalledWith('A', 'assignment-A', 1, 'ACCEPTED', undefined, undefined)
    expect(useOperationsStore.getState().tasks[0].myAssignments?.[0]).toMatchObject({ acknowledgementStatus: 'ACCEPTED', version: 2 })
  })

  it('preserves acknowledged task state when an online-first mutation fails', async () => {
    const current = task('A')
    useOperationsStore.setState({ tasks: [current] })
    vi.spyOn(api, 'transitionTask').mockRejectedValue(new Error('VERSION_CONFLICT'))

    await expect(useOperationsStore.getState().transitionTask(current, 'DONE')).rejects.toThrow('VERSION_CONFLICT')
    expect(useOperationsStore.getState().tasks[0]).toEqual(current)
  })

  it('falls back only to an exact-scope encrypted cache on a network failure', async () => {
    vi.spyOn(api, 'getEvents').mockRejectedValue(new ApiError(0, 'Network offline', '/operations/events'))
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([]))
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, permissions: {} })
    vi.mocked(dexieStorage.getItem).mockResolvedValue(JSON.stringify({
      parishId: parishA, userId: 'user-a', events: [event('cached')], tasks: [task('cached')],
      eventTotal: 1, taskTotal: 1, savedAt: '2026-09-08T01:00:00.000Z',
    }))

    await expect(useOperationsStore.getState().fetch()).resolves.toBeUndefined()
    expect(useOperationsStore.getState()).toMatchObject({ source: 'cache', eventTotal: 1, taskTotal: 1 })
    expect(useOperationsStore.getState().permissions).toEqual({})
  })

  it('rejects a cross-tenant cached snapshot instead of projecting it offline', async () => {
    vi.spyOn(api, 'getEvents').mockRejectedValue(new ApiError(0, 'Network offline', '/operations/events'))
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([]))
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, permissions: {} })
    vi.mocked(dexieStorage.getItem).mockResolvedValue(JSON.stringify({
      parishId: parishB, userId: 'user-a', events: [event('foreign', parishB)], tasks: [],
      eventTotal: 1, taskTotal: 0, savedAt: '2026-09-08T01:00:00.000Z',
    }))

    await expect(useOperationsStore.getState().fetch()).rejects.toThrow('Network offline')
    expect(useOperationsStore.getState().events).toEqual([])
    expect(useOperationsStore.getState().source).toBe('none')
  })

  it('loads the next server page without duplicating rows and refreshes the scoped cache', async () => {
    useOperationsStore.setState({ events: [event('A')], eventPage: 1, eventTotal: 2, eventHasMore: true, source: 'server' })
    const getEvents = vi.spyOn(api, 'getEvents').mockResolvedValue(page([event('A'), event('B')], 2, 4, 2, 2))

    await useOperationsStore.getState().loadMoreEvents()

    // W2.13: page-2 request carries the (empty) filter explicitly.
    expect(getEvents).toHaveBeenCalledWith(2, 50, undefined)
    expect(useOperationsStore.getState().events.map(item => item.id)).toEqual(['A', 'B'])
    expect(useOperationsStore.getState().eventHasMore).toBe(false)
    expect(dexieStorage.setItem).toHaveBeenCalled()
  })

  it('W2.13: applies the server filter on fetch and never caches a filtered slice', async () => {
    const getEvents = vi.spyOn(api, 'getEvents').mockResolvedValue(page([event('A')], 1, 1, 1, 1))
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([task('T1')], 1, 1, 1, 1))
    vi.spyOn(api, 'getReminders').mockResolvedValue(page([], 1, 1, 1, 1))
    vi.spyOn(api, 'getDispatchInbox').mockResolvedValue(page([], 1, 1, 1, 1))
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, timezone: 'Asia/Ho_Chi_Minh', permissions: {} } as any)
    await useOperationsStore.getState().searchEvents('trại hè')
    expect(getEvents).toHaveBeenLastCalledWith(1, 50, { q: 'trại hè' })
    expect(dexieStorage.setItem).not.toHaveBeenCalled()
    // Clearing the filter restores the unfiltered fetch and cache write.
    ;(dexieStorage.setItem as ReturnType<typeof vi.fn>).mockClear()
    await useOperationsStore.getState().searchEvents('')
    expect(getEvents).toHaveBeenLastCalledWith(1, 50, undefined)
    expect(dexieStorage.setItem).toHaveBeenCalled()
    expect(useOperationsStore.getState().parishTimezone).toBe('Asia/Ho_Chi_Minh')
    useOperationsStore.getState().clear()
    expect(useOperationsStore.getState().eventQuery).toBe('')
  })

  it('keeps reminder inbox online-only and updates read state only after server acknowledgement', async () => {
    const current = reminder('R1')
    useOperationsStore.setState({ reminders: [current], source: 'server' })
    const markRead = vi.spyOn(api, 'markReminderRead').mockResolvedValue({ id: current.id, readAt: '2026-10-01T00:31:00Z', version: current.version + 1 })

    await useOperationsStore.getState().markReminderRead(current)

    expect(markRead).toHaveBeenCalledWith('R1', current.version, undefined)
    expect(useOperationsStore.getState().reminders[0].readAt).toBe('2026-10-01T00:31:00Z')
    expect(dexieStorage.setItem).not.toHaveBeenCalled()
  })

  it('rejects foreign-parish reminders in the overview response', async () => {
    vi.spyOn(api, 'getEvents').mockResolvedValue(page([]))
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([]))
    vi.mocked(api.getReminders).mockResolvedValue(page([reminder('foreign', parishB)]))
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, permissions: {} })

    await expect(useOperationsStore.getState().fetch()).rejects.toThrow(/sai phạm vi giáo xứ/i)
    expect(useOperationsStore.getState().reminders).toEqual([])
  })

  it('rejects inconsistent pagination metadata instead of silently truncating the inbox', async () => {
    vi.spyOn(api, 'getEvents').mockResolvedValue(page([]))
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([]))
    vi.mocked(api.getReminders).mockResolvedValue({ ...page([reminder('R1')]), meta: { page: 1, limit: 50, total: 51, totalPages: 1 } })
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, permissions: {} })

    await expect(useOperationsStore.getState().fetch()).rejects.toThrow(/phân trang Operations không hợp lệ/i)
    expect(useOperationsStore.getState().reminders).toEqual([])
  })

  it('does not mark a different reminder read when the acknowledgement ID is inconsistent', async () => {
    const current = reminder('R1')
    useOperationsStore.setState({ reminders: [current] })
    vi.spyOn(api, 'markReminderRead').mockResolvedValue({ id: 'R2', readAt: '2026-10-01T00:31:00Z', version: current.version + 1 })

    await expect(useOperationsStore.getState().markReminderRead(current)).rejects.toThrow(/không khớp yêu cầu/i)
    expect(useOperationsStore.getState().reminders[0].readAt).toBeNull()
  })

  it('uses the latest acknowledged task version for sequential checklist commands', async () => {
    const currentTask = { ...task('checklist') }
    const item: OperationChecklistItem = { id: 'C1', parishId: parishA, taskId: currentTask.id, label: 'Kiểm tra dụng cụ', isRequired: true, isDone: false, sortOrder: 0 }
    useOperationsStore.setState({
      tasks: [currentTask],
      selectedTask: { task: currentTask, assignees: [], checklist: [], comments: [], dependencies: [], permissions: { 'operations.task.manage': true } },
    })
    vi.spyOn(api, 'createChecklistItem').mockResolvedValue({ item, taskVersion: 2 })
    const update = vi.spyOn(api, 'updateChecklistItem').mockResolvedValue({ item: { ...item, isDone: true }, taskVersion: 3 })

    await useOperationsStore.getState().addChecklistItem(currentTask, item.label, true)
    const afterCreate = useOperationsStore.getState().selectedTask!
    expect(afterCreate.task.version).toBe(2)
    expect(useOperationsStore.getState().tasks[0].version).toBe(2)
    await useOperationsStore.getState().toggleChecklistItem(afterCreate.task, afterCreate.checklist[0])

    expect(update).toHaveBeenCalledWith('checklist', 'C1', { version: 2, isDone: true }, undefined)
    expect(useOperationsStore.getState().selectedTask).toMatchObject({ task: { version: 3 }, checklist: [{ id: 'C1', isDone: true }] })
  })

  it('supports options with blockedReason and cancellationReason in transitionTask', async () => {
    const currentTask = { ...task('T1'), status: 'IN_PROGRESS' as const, version: 1 }
    useOperationsStore.setState({ tasks: [currentTask], selectedTask: { task: currentTask, assignees: [], checklist: [], comments: [], dependencies: [], permissions: { 'operations.task.execute': true } } })
    const spy = vi.spyOn(api, 'transitionTask').mockResolvedValue({ ...currentTask, status: 'BLOCKED', version: 2 })

    await useOperationsStore.getState().transitionTask(currentTask, 'BLOCKED', { blockedReason: 'Thiếu vật tư', idempotencyKey: 'cmd-block' })
    expect(spy).toHaveBeenCalledWith('T1', expect.objectContaining({ status: 'BLOCKED', version: 1, blockedReason: 'Thiếu vật tư' }), 'cmd-block')

    await useOperationsStore.getState().transitionTask({ ...currentTask, version: 2 }, 'CANCELLED', { cancellationReason: 'Không cần nữa' })
    expect(spy).toHaveBeenCalledWith('T1', expect.objectContaining({ status: 'CANCELLED', version: 2, cancellationReason: 'Không cần nữa' }), undefined)
  })

  it('formats 409 conflict error into friendly Vietnamese and triggers entity refetch', async () => {
    const currentTask = { ...task('T1'), version: 1 }
    useOperationsStore.setState({ tasks: [currentTask], selectedTask: { task: currentTask, assignees: [], checklist: [], comments: [], dependencies: [], permissions: { 'operations.task.manage': true } } })
    const conflictError = Object.assign(new Error('OCC conflict'), { status: 409, code: 'VERSION_MISMATCH' })
    vi.spyOn(api, 'updateTask').mockRejectedValue(conflictError)
    const fetchSpy = vi.spyOn(api, 'getEvents').mockResolvedValue(page([]))
    vi.spyOn(api, 'getTasks').mockResolvedValue(page([]))
    vi.spyOn(api, 'getReminders').mockResolvedValue(page([]))
    vi.spyOn(api, 'getDispatchInbox').mockResolvedValue(page([]))
    vi.spyOn(api, 'getPermissions').mockResolvedValue({ parishId: parishA, permissions: {} })

    await expect(useOperationsStore.getState().updateTask(currentTask, { title: 'Tên mới' })).rejects.toThrow()
    await waitFor(() => {
      expect(useOperationsStore.getState().error).toMatch(/thay đổi bởi người khác/i)
      expect(fetchSpy).toHaveBeenCalled()
    })
  })

  it('does not set error state when request scope changed during catch in markReminderRead', async () => {
    const current = reminder('R1')
    useOperationsStore.setState({ reminders: [current], error: null })
    vi.spyOn(api, 'markReminderRead').mockImplementation(async () => {
      useOperationsStore.getState().clear()
      setTenantScope({ parishId: parishB, userId: 'user-b' })
      throw new Error('Network failure')
    })

    await expect(useOperationsStore.getState().markReminderRead(current)).rejects.toThrow('Network failure')
    expect(useOperationsStore.getState().error).toBeNull()
  })

  it('P1-6: surfaces createTask failures in the shared error banner like createStandaloneTask', async () => {
    vi.spyOn(api, 'createTask').mockRejectedValue(new Error('boom'))
    await expect(useOperationsStore.getState().createTask({ title: 'A', eventId: 'E' })).rejects.toThrow('boom')
    // formatStoreError maps the failure instead of leaving a silent rejection.
    expect(useOperationsStore.getState().error).toContain('boom')
  })

  it('P1-4: aborts a superseded task detail load and applies only the newest selection', async () => {
    const first = deferred<OperationTaskDetail>()
    const getTask = vi.spyOn(api, 'getTask').mockReturnValueOnce(first.promise).mockResolvedValue(taskDetail('B'))
    const pendingA = useOperationsStore.getState().selectTask('A')
    const signalA = getTask.mock.calls[0][1] as AbortSignal | undefined
    expect(signalA).toBeInstanceOf(AbortSignal)
    await useOperationsStore.getState().selectTask('B')
    expect(signalA?.aborted).toBe(true)
    first.resolve(taskDetail('A')); await pendingA
    expect(useOperationsStore.getState().selectedTask?.task.id).toBe('B')
  })

  it('P1-4: a superseded load failure dies silently without an error banner', async () => {
    const first = deferred<OperationTaskDetail>()
    vi.spyOn(api, 'getTask').mockReturnValueOnce(first.promise).mockResolvedValue(taskDetail('B'))
    const pendingA = useOperationsStore.getState().selectTask('A')
    await useOperationsStore.getState().selectTask('B')
    first.reject(new ApiError(0, 'Request superseded', '/operations/tasks/A', 'REQUEST_ABORTED'))
    await pendingA
    expect(useOperationsStore.getState().selectedTask?.task.id).toBe('B')
    expect(useOperationsStore.getState().error).toBeNull()
  })

  it('P1-4: passes an abort signal to event detail loads', async () => {
    const getEvent = vi.spyOn(api, 'getEvent').mockResolvedValue(eventDetail('E'))
    await useOperationsStore.getState().selectEvent('E')
    expect(getEvent.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
  })

  it('restores a cancelled event and updates store state and persistence', async () => {
    const current = { ...event('E1'), status: 'CANCELLED' as const, version: 2 }
    useOperationsStore.setState({ events: [current], selectedEvent: { ...eventDetail('E1'), event: current, permissions: { 'operations.event.transition': true } } })
    const restored = { ...current, status: 'PLANNING' as const, version: 3 }
    const spy = vi.spyOn(api, 'restoreEvent').mockResolvedValue(restored)

    const result = await useOperationsStore.getState().restoreEvent('E1', 2, 'Khôi phục để tiếp tục chuẩn bị', 'cmd-restore')
    expect(spy).toHaveBeenCalledWith('E1', { version: 2, reason: 'Khôi phục để tiếp tục chuẩn bị' }, 'cmd-restore')
    expect(result.status).toBe('PLANNING')
    expect(useOperationsStore.getState().events[0]?.status).toBe('PLANNING')
    expect(useOperationsStore.getState().selectedEvent?.event.status).toBe('PLANNING')
  })
})
