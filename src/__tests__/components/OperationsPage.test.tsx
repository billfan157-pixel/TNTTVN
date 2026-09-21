import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OperationsPage from '../../pages/OperationsPage'
import type { OperationCandidate, OperationEvent, OperationEventDetail, OperationReminder, OperationTask, OperationTaskDetail } from '../../lib/api/operations'

const { rescheduleReminder, getTaskDispatches } = vi.hoisted(() => ({
  // W2.12: the page now calls operationsApi.rescheduleReminder directly for the
  // inbox editor (the store has no reschedule command).
  rescheduleReminder: vi.fn(),
  // W2.3: the task dialog mounts TaskDispatchPanel, which probes dispatch rounds.
  getTaskDispatches: vi.fn(),
}))
vi.mock('../../lib/api/operations', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/api/operations')>()
  return { ...actual, operationsApi: { ...actual.operationsApi, rescheduleReminder, getTaskDispatches } }
})
const acknowledgeTask = vi.fn()
const transitionTask = vi.fn()
const transitionEvent = vi.fn()
const resumeEventAutomation = vi.fn()
const restoreEvent = vi.fn()
const markReminderRead = vi.fn()
const addChecklistItem = vi.fn()
const toggleChecklistItem = vi.fn()
const createEvent = vi.fn()
const updateEvent = vi.fn()
const createTask = vi.fn()
const createStandaloneTask = vi.fn()
const updateTask = vi.fn()
const fetchCreationOptions = vi.fn().mockResolvedValue(undefined)
const dispatchTask = vi.fn()
const acceptTaskDispatch = vi.fn()
const selectEvent = vi.fn()
// W1.7: page now derives the task-detail dialog from selectedTask and calls
// selectTask(...).catch(...) — the mock must resolve a Promise.
const selectTask = vi.fn().mockResolvedValue(1)
const fetchOperations = vi.fn().mockResolvedValue(undefined)
// W2.13: server-side search goes through this store action.
const searchEvents = vi.fn().mockResolvedValue(undefined)
let online = true
let source: 'server' | 'cache' | 'none' = 'server'
let events: OperationEvent[] = []
let selectedEvent: OperationEventDetail | null = null
let selectedTask: OperationTaskDetail | null = null
let reminders: OperationReminder[] = []
let permissions: Record<string, boolean> = {}
let assignmentWarnings: { taskId: string; items: Array<{ id: string; startsAt: string; endsAt: string }> } | null = null
let dispatchInvitations: import('../../lib/api/operations').OperationTaskDispatchInvitation[] = []
let operationCandidates: OperationCandidate[] = []
let creationOptions: import('../../lib/api/operations').OperationsCreationOptions | null = null

const assignedTask: OperationTask = {
  id: 'TSK-1', parishId: 'parish-a', title: 'Chuẩn bị nghi thức', status: 'TODO', priority: 'HIGH', phase: 'PREPARATION', isRequired: true,
  version: 3,
  myAssignments: [{ id: 'OPA-1', parishId: 'parish-a', taskId: 'TSK-1', userId: 'user-a', assignmentRole: 'OWNER', acknowledgementStatus: 'PENDING', version: 1 }],
}

let effectiveMode: 'desktop' | 'mobile' = 'desktop'
vi.mock('../../hooks/useEffectiveMode', () => ({ useEffectiveMode: () => effectiveMode }))
// W2.2: the page now syncs the event modal with `?event=&tab=`.
const mockNavigate = vi.fn()
let operationsSearch: { event?: string; tab?: string } = {}
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => operationsSearch,
}))
vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => online }))
vi.mock('../../stores/operationsStore', () => {
  const selectState = (selector?: any) => {
    const state = {
      events, tasks: [assignedTask], reminders, dispatchInvitations, assignmentWarnings, permissions, creationOptions, selectedEvent, selectedTask, detailLoading: false, taskDetailLoading: false, loading: false, error: null,
      source, cacheSavedAt: null, eventTotal: 0, taskTotal: 1, eventHasMore: false, taskHasMore: false,
      reminderHasMore: false, loadMoreEvents: vi.fn(), loadMoreTasks: vi.fn(), loadMoreReminders: vi.fn(),
      // W2.3/W2.11/W2.13: new store surface the page subscribes to.
      eventQuery: '', searchEvents, setEventSearch: vi.fn(), dispatchTotal: 0, dispatchHasMore: false, loadMoreDispatches: vi.fn(), parishTimezone: null,
      fetch: fetchOperations, fetchCreationOptions, createEvent, updateEvent, selectEvent, selectTask, createTask, createStandaloneTask, updateTask, assignTask: vi.fn(), dispatchTask, acceptTaskDispatch, transitionEvent, resumeEventAutomation, restoreEvent, transitionTask, acknowledgeTask, addChecklistItem, toggleChecklistItem, markReminderRead, cancelReminder: vi.fn(),
    }
    return typeof selector === 'function' ? selector(state) : state
  }
  const useOperationsStore = Object.assign(
    (selector?: any) => selectState(selector),
    { setState: vi.fn(), getState: () => selectState() },
  )
  return { useOperationsStore }
})
vi.mock('../../stores/parishProfileStore', () => ({ useParishProfileStore: (selector: any) => selector({ snapshot: null, fetchSnapshot: vi.fn() }) }))
vi.mock('../../hooks/useOperationCandidates', () => ({
  useOperationCandidates: () => ({ candidates: operationCandidates, loading: false, error: '' }),
  operationCandidateValue: (candidate: OperationCandidate) => candidate.userId ? `user:${candidate.userId}` : `person:${candidate.personId}`,
  parseOperationCandidateValue: (value: string) => value.startsWith('user:') ? { userId: value.slice(5) } : value.startsWith('person:') ? { personId: value.slice(7) } : null,
}))
vi.mock('../../components/operations/AvailabilityPanel', () => ({ AvailabilityPanel: () => <div aria-label="Lịch bận của tôi" /> }))
vi.mock('../../components/operations/StandaloneWorkstreamsPanel', () => ({ StandaloneWorkstreamsPanel: () => <div aria-label="Nhóm công việc độc lập" /> }))
vi.mock('../../components/operations/EventTemplatesPanel', () => ({ EventTemplatesPanel: () => <div aria-label="Mẫu sự kiện" /> }))

describe('OperationsPage mobile-safe action boundary', () => {
  it('W2.13: debounces the event search into the server-side store action', async () => {
    const base: OperationEvent = { id: 'E1', parishId: 'parish-a', title: 'Hội Trại', eventType: 'CAMP', startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 1 }
    events = [{ ...base, id: 'E1' }, { ...base, id: 'E2', title: 'Trại hè' }, { ...base, id: 'E3', title: 'Họp' }]
    render(<OperationsPage />)
    const input = screen.getByLabelText('Tìm kiếm sự kiện')
    fireEvent.change(input, { target: { value: ' trại ' } })
    // Debounced 300ms, then fired once with the trimmed query.
    expect(searchEvents).not.toHaveBeenCalled()
    await waitFor(() => expect(searchEvents).toHaveBeenCalledWith('trại'), { timeout: 1500 })
    events = []
  })

  it('W3.3: the desktop dropdown renders the shared CreateMenuItems rows with menuitem roles', async () => {
    creationOptions = {
      canCreateXuDoanEvent: true,
      xuDoanOrganizers: [],
      units: [{ id: 'UNIT-1', name: 'Ban Truyền thông', unitType: 'COMMITTEE', canCreateEvent: true, canCreateTask: true, organizers: [], myRole: 'COMMITTEE_LEADER' }],
    }
    permissions = { 'operations.event.create': true, 'operations.task.create': true }
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: /Tạo mới/ }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map(item => item.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Tạo sự kiện Xứ đoàn'),
      expect.stringContaining('Tạo sự kiện Ban Truyền thông'),
      expect.stringContaining('Tạo Task · Ban Truyền thông'),
    ]))
    // W3.3: opening moves focus into the first item for the arrow-key path.
    await waitFor(() => expect(document.activeElement).toBe(items[0]))
  })

  it('W2.2: opens the event named by ?event= and mirrors a selection back to the URL', async () => {
    operationsSearch = { event: 'EVT-DEEP' }
    render(<OperationsPage />)
    await waitFor(() => expect(selectEvent).toHaveBeenCalledWith('EVT-DEEP'))
  })

  it('W2.2: writes the selected event id into the URL (replace) and applies ?tab=', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Hội Trại', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 1 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] }, permissions: {},
    }
    operationsSearch = { event: 'E1', tab: 'templates' }
    render(<OperationsPage />)
    // The lazy templates TabPanel (mocked to a labeled div) renders only when
    // the URL tab is honored over the default 'tasks'.
    expect(await screen.findByLabelText('Mẫu sự kiện')).toBeInTheDocument()
  })

  it('W2.2: closing the modal clears ?event= from the URL', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Hội Trại', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 1 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] }, permissions: {},
    }
    operationsSearch = { event: 'E1' }
    const { rerender } = render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }))
    expect(selectEvent).toHaveBeenCalledWith(null)
    // The mocked store mirrors the committed selection: re-render without it
    // and the sync hook must strip the deep-link parameters from the URL.
    selectedEvent = null
    rerender(<OperationsPage />)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({
      to: '/operations',
      search: {},
      replace: true,
    })))
  })

  it('W2.12: offers "Dời giờ" only with the manager capability the server command requires', async () => {
    reminders = [{ id: 'R1', parishId: 'parish-a', eventId: 'E1', triggerAt: '2026-10-01T00:30:00Z', kind: 'EVENT_START', status: 'PENDING', version: 2, readAt: null, createdAt: '2026-09-30T01:00:00Z' }]
    const { rerender } = render(<OperationsPage />)
    // Plain recipient: cancel (self-exempted) yes, reschedule (manager-only) no.
    expect(screen.queryByRole('button', { name: 'Dời giờ' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hủy lịch nhắc' })).toBeInTheDocument()

    permissions = { 'operations.event.manage': true }
    rerender(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Dời giờ' }))
    fireEvent.change(screen.getByLabelText('Giờ nhắc mới của lịch nhắc'), { target: { value: '2027-01-02T08:00' } })
    fireEvent.change(screen.getByLabelText('Lý do dời giờ nhắc'), { target: { value: 'Đổi giờ tập trung' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giờ mới' }))
    await waitFor(() => expect(rescheduleReminder).toHaveBeenCalledWith('R1', expect.objectContaining({
      expectedVersion: 2, reason: 'Đổi giờ tập trung',
    }), expect.any(String)))
    // Success refreshes the overview so the new triggerAt lands in the inbox.
    await waitFor(() => expect(fetchOperations).toHaveBeenCalled())
  })

  it('W3.8: secondary actions collapse into the overflow menu and still reach the store', async () => {
    render(<OperationsPage />)
    // Row keeps primary actions inline; the secondary set lives behind "···".
    expect(screen.getByRole('button', { name: 'Nhận việc' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Báo bị chặn' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hủy việc' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Thêm thao tác cho Chuẩn bị nghi thức' }))
    const menu = await screen.findByRole('menu', { name: 'Thêm thao tác' })
    expect(within(menu).getByRole('menuitem', { name: 'Từ chối' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Báo bị chặn' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Hủy việc' })).toBeInTheDocument()

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Từ chối' }))
    // W4.3: declining opens the note dialog first; confirm sends it.
    const declineDialog = await screen.findByRole('dialog', { name: 'Từ chối nhiệm vụ' })
    fireEvent.click(within(declineDialog).getByRole('button', { name: 'Xác nhận từ chối' }))
    await waitFor(() => expect(acknowledgeTask).toHaveBeenCalledWith(assignedTask, 'DECLINED', undefined, expect.any(String)))
    // Picking an item dismisses the popup.
    expect(screen.queryByRole('menu', { name: 'Thêm thao tác' })).not.toBeInTheDocument()
  })

  it('W1.7: renders task detail and checklist inside a dialog without selecting an event', () => {
    selectedTask = { task: { ...assignedTask, description: 'Independent task evidence' }, checklist: [], assignees: [], comments: [], dependencies: [], permissions: {} }
    render(<OperationsPage />)
    expect(screen.getByRole('button', { name: 'Chi tiết nhiệm vụ' })).toBeEnabled()
    // The detail must live in a modal (open state derived from selectedTask),
    // not at the bottom of the page where users never noticed it.
    const dialog = screen.getByRole('dialog', { name: 'Chi tiết nhiệm vụ' })
    expect(within(dialog).getByText('Independent task evidence')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Chi tiết checklist')).toBeInTheDocument()
  })

  it('W1.2: reminder rows show the target title and open its detail', () => {
    reminders = [{ id: 'R1', parishId: 'parish-a', taskId: 'TSK-1', triggerAt: '2026-10-01T00:30:00Z', kind: 'TASK_DUE', status: 'SENT', version: 2, readAt: null, createdAt: '2026-09-30T01:00:00Z' }]
    render(<OperationsPage />)
    const inbox = screen.getByRole('region', { name: 'Hộp nhắc việc' })
    // Title resolved from the recipient's own scoped task list (mine=true).
    expect(within(inbox).getByText(/Chuẩn bị nghi thức/)).toBeInTheDocument()
    fireEvent.click(within(inbox).getByRole('button', { name: 'Mở' }))
    expect(selectTask).toHaveBeenCalledWith('TSK-1')
  })

  it('W1.3: KPI filter cards are keyboard-accessible buttons with aria-pressed', () => {
    render(<OperationsPage />)
    const kpi = screen.getByRole('region', { name: 'Tổng quan công việc' })
    const pending = within(kpi).getByRole('button', { name: /Chờ phản hồi/ })
    expect(pending).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(pending)
    expect(pending).toHaveAttribute('aria-pressed', 'true')
    // The non-filterable summary card stays static (no button affordance).
    expect(within(kpi).queryByRole('button', { name: /^Sự kiện/ })).not.toBeInTheDocument()
  })

  it('W1.6: starts an accepted TODO task through the execute path', () => {
    assignedTask.myAssignments![0].acknowledgementStatus = 'ACCEPTED'
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu làm' }))
    expect(transitionTask).toHaveBeenCalledWith(assignedTask, 'IN_PROGRESS', expect.objectContaining({ idempotencyKey: expect.any(String) }))
  })

  beforeEach(() => {
    effectiveMode = 'desktop'
    assignmentWarnings = null
    online = true
    source = 'server'
    assignedTask.status = 'TODO'
    assignedTask.myAssignments![0].acknowledgementStatus = 'PENDING'
    acknowledgeTask.mockReset().mockResolvedValue(undefined)
    rescheduleReminder.mockReset().mockResolvedValue({ id: 'R1', version: 3 })
    getTaskDispatches.mockReset().mockResolvedValue([])
    transitionTask.mockReset().mockResolvedValue(undefined)
    transitionEvent.mockReset().mockResolvedValue(undefined)
    resumeEventAutomation.mockReset().mockResolvedValue(undefined)
    markReminderRead.mockReset().mockResolvedValue(undefined)
    addChecklistItem.mockReset().mockResolvedValue(undefined)
    toggleChecklistItem.mockReset().mockResolvedValue(undefined)
    createEvent.mockReset().mockResolvedValue(undefined)
    updateEvent.mockReset().mockResolvedValue(undefined)
    createTask.mockReset().mockResolvedValue({ ...assignedTask })
    createStandaloneTask.mockReset().mockResolvedValue({ ...assignedTask })
    updateTask.mockReset().mockResolvedValue({ task: { ...assignedTask }, acknowledgementReset: false })
    fetchCreationOptions.mockClear()
    dispatchTask.mockReset().mockResolvedValue(undefined)
    acceptTaskDispatch.mockReset().mockResolvedValue(undefined)
    selectEvent.mockReset().mockResolvedValue(undefined)
    selectTask.mockReset().mockResolvedValue(1)
    searchEvents.mockReset().mockResolvedValue(undefined)
    mockNavigate.mockReset()
    operationsSearch = {}
    fetchOperations.mockClear()
    events = []
    selectedEvent = null
    selectedTask = null
    reminders = []
    dispatchInvitations = []
    operationCandidates = []
    permissions = {}
    creationOptions = null
  })

  it('creates a public Operations event without accepting a client-owned calendar link', async () => {
    permissions = { 'operations.event.create': true, 'operations.event.publish_public': true }
    creationOptions = {
      canCreateXuDoanEvent: true,
      xuDoanOrganizers: [{ userId: 'user-xdt', displayName: 'Trưởng Xứ đoàn', positionCode: 'PARISH_LEADER' }],
      units: [],
    }
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Tạo sự kiện Xứ đoàn/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Công khai' }))
    fireEvent.change(screen.getByLabelText('Tên sự kiện'), { target: { value: 'Trại Hè 2027' } })
    fireEvent.change(screen.getByLabelText('Loại sự kiện'), { target: { value: 'CAMP' } })
    fireEvent.change(screen.getByLabelText('Địa điểm'), { target: { value: 'Sân giáo xứ' } })
    fireEvent.change(screen.getByLabelText('Bắt đầu'), { target: { value: '2027-06-01T08:00' } })
    fireEvent.change(screen.getByLabelText('Kết thúc'), { target: { value: '2027-06-01T17:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))

    await waitFor(() => expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Trại Hè 2027', eventType: 'CAMP', location: 'Sân giáo xứ', visibility: 'PUBLIC_SUMMARY',
      startsAt: new Date('2027-06-01T08:00').toISOString(), endsAt: new Date('2027-06-01T17:00').toISOString(),
    }), expect.any(String)))
    expect(createEvent.mock.calls[0][0]).not.toHaveProperty('sourceParishEventId')
  })

  it('keeps public visibility unavailable when the server capability is absent', () => {
    permissions = { 'operations.event.create': true }
    creationOptions = {
      canCreateXuDoanEvent: true,
      xuDoanOrganizers: [{ userId: 'user-xdt', displayName: 'Trưởng Xứ đoàn', positionCode: 'PARISH_LEADER' }],
      units: [],
    }
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Tạo sự kiện Xứ đoàn/ }))
    expect(screen.getByRole('button', { name: 'Công khai' })).toBeDisabled()
    expect(screen.getByText(/việc công khai cần quyền riêng/)).toBeInTheDocument()
  })

  it('shows only permitted creation actions in the new-item menu', () => {
    permissions = {}
    creationOptions = {
      canCreateXuDoanEvent: false,
      xuDoanOrganizers: [],
      units: [{ id: 'UNIT-1', name: 'Ban Truyền thông', unitType: 'COMMITTEE', canCreateEvent: true, canCreateTask: true, organizers: [{ userId: 'user-tb', displayName: 'Trưởng Ban', positionCode: 'COMMITTEE_LEADER' }], myRole: 'COMMITTEE_LEADER' }],
    }
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))
    expect(screen.queryByRole('menuitem', { name: /Tạo sự kiện Xứ đoàn/ })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Tạo sự kiện Ban Truyền thông/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Tạo Task · Ban Truyền thông/ })).toBeInTheDocument()
  })

  it('hides the new-item menu when nothing is permitted', () => {
    permissions = {}
    creationOptions = { canCreateXuDoanEvent: false, xuDoanOrganizers: [], units: [] }
    render(<OperationsPage />)
    expect(screen.queryByRole('button', { name: 'Tạo mới' })).not.toBeInTheDocument()
  })

  it('creates a standalone task scoped to the chosen unit', async () => {
    permissions = {}
    creationOptions = {
      canCreateXuDoanEvent: false,
      xuDoanOrganizers: [],
      units: [{ id: 'UNIT-1', name: 'Ban Truyền thông', unitType: 'COMMITTEE', canCreateEvent: false, canCreateTask: true, organizers: [], myRole: 'COMMITTEE_LEADER' }],
    }
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Tạo Task · Ban Truyền thông/ }))
    fireEvent.change(screen.getByLabelText('Tên công việc'), { target: { value: 'Cập nhật ảnh đại diện' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Task' }))

    await waitFor(() => expect(createStandaloneTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Cập nhật ảnh đại diện', scopeUnitId: 'UNIT-1',
    }), expect.any(String)))
  })

  it('edits visibility and public calendar fields only through the Operations command', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Họp nội bộ', eventType: 'MEETING', startsAt: '2027-06-01T01:00:00Z', endsAt: '2027-06-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'DRAFT', visibility: 'INTERNAL', version: 7 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.event.manage': true, 'operations.event.create': true, 'operations.event.publish_public': true },
    }
    render(<OperationsPage />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Sửa hiển thị sự kiện' })).getByRole('button', { name: 'Công khai' }))
    fireEvent.change(screen.getByLabelText('Tên sự kiện'), { target: { value: 'Họp phụ huynh' } })
    fireEvent.change(screen.getByLabelText('Địa điểm'), { target: { value: 'Hội trường' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    await waitFor(() => expect(updateEvent).toHaveBeenCalledWith('E1', expect.objectContaining({
      version: 7, title: 'Họp phụ huynh', eventType: 'MEETING', location: 'Hội trường', visibility: 'PUBLIC_SUMMARY',
    }), expect.any(String)))
    expect(updateEvent.mock.calls[0][1]).not.toHaveProperty('sourceParishEventId')
  })

  it('shows only role-appropriate assignment actions and passes the exact task to the store', async () => {
    const view = render(<OperationsPage />)
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument()
    // W4.3: accepting opens the dialog; a note is optional but sent when typed.
    fireEvent.click(screen.getByRole('button', { name: 'Nhận việc' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nhận nhiệm vụ' })
    fireEvent.change(within(dialog).getByLabelText('Ghi chú khi phản hồi nhiệm vụ'), { target: { value: 'Nhận việc, sẽ liên hệ ban hậu cần' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận nhận việc' }))
    expect(acknowledgeTask).toHaveBeenCalledWith(assignedTask, 'ACCEPTED', 'Nhận việc, sẽ liên hệ ban hậu cần', expect.any(String))
    assignedTask.myAssignments![0].acknowledgementStatus = 'ACCEPTED'
    view.rerender(<OperationsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hoàn tất' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tất' }))
    expect(transitionTask).toHaveBeenCalledWith(assignedTask, 'DONE', expect.objectContaining({ idempotencyKey: expect.any(String) }))
  })

  it('makes online-first behavior explicit and disables mutations while offline', () => {
    online = false
    assignedTask.myAssignments![0].acknowledgementStatus = 'ACCEPTED'
    render(<OperationsPage />)
    expect(screen.getByText(/cần kết nối máy chủ để tạo hoặc cập nhật/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hoàn tất' })).toBeDisabled()
  })

  it('does not offer acknowledgement or execution actions for a terminal task', () => {
    assignedTask.status = 'CANCELLED'
    assignedTask.myAssignments![0].acknowledgementStatus = 'PENDING'
    render(<OperationsPage />)
    expect(screen.queryByRole('button', { name: 'Nhận việc' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument()
  })

  it('exposes the authorized event lifecycle with the current OCC version', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'DRAFT', visibility: 'INTERNAL', version: 4 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.event.transition': true, 'operations.event.cancel': true },
    }
    render(<OperationsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu lập kế hoạch' }))

    await waitFor(() => expect(transitionEvent).toHaveBeenCalledWith('E1', 'PLANNING', 4, { reason: undefined, outcomeSummary: undefined }, expect.any(String)))
  })

  it('requires an explicit warning confirmation before overriding pending task acceptance', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 5 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.event.transition': true },
    }
    transitionEvent.mockRejectedValueOnce(Object.assign(new Error('pending'), {
      code: 'TASK_ACCEPTANCE_PENDING', details: [{ id: 'TSK-1', label: 'Chuẩn bị nghi thức' }],
    }))
    render(<OperationsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang chuẩn bị' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Chuẩn bị nghi thức')
    fireEvent.click(screen.getByRole('button', { name: 'Vẫn chuyển sang Chuẩn bị' }))

    await waitFor(() => expect(transitionEvent).toHaveBeenNthCalledWith(2, 'E1', 'PREPARING', 5, {
      reason: undefined, outcomeSummary: undefined, override: true,
    }, expect.any(String)))
  })

  it('rewinds one phase only with a reason and preserves the OCC version', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'READY', visibility: 'INTERNAL', version: 8 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.event.transition': true },
    }
    render(<OperationsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Lùi một giai đoạn' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Lý do lùi về Chuẩn bị' }), { target: { value: 'Cần kiểm tra lại vật dụng' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lùi giai đoạn' }))

    await waitFor(() => expect(transitionEvent).toHaveBeenCalledWith('E1', 'PREPARING', 8, {
      reason: 'Cần kiểm tra lại vật dụng', outcomeSummary: undefined,
    }, expect.any(String)))
  })

  it('hides the rewind button on completed events (COMPLETED is terminal)', () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'COMPLETED', visibility: 'INTERNAL', version: 10 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.event.transition': true },
    }
    render(<OperationsPage />)
    expect(screen.queryByRole('button', { name: 'Lùi một giai đoạn' })).not.toBeInTheDocument()
  })

  it('shows durable automation pause state and explicitly resumes it', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'READY', visibility: 'INTERNAL', version: 9, automationPaused: true, automationPauseReason: 'Lùi lại để kiểm tra an toàn' },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.event.transition': true },
    }
    render(<OperationsPage />)

    expect(screen.getByText('Lùi lại để kiểm tra an toàn')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục tự động chuyển' }))
    await waitFor(() => expect(resumeEventAutomation).toHaveBeenCalledWith('E1', 9, 'Người quản lý chủ động tiếp tục tự động chuyển giai đoạn.', expect.any(String)))
  })

  it('does not offer public-event cancellation without publish authority', () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè công khai', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'DRAFT', visibility: 'PUBLIC_SUMMARY', version: 4 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.event.transition': true, 'operations.event.cancel': true, 'operations.event.publish_public': false },
    }
    render(<OperationsPage />)
    expect(screen.queryByRole('button', { name: 'Hủy sự kiện' })).not.toBeInTheDocument()
  })

  it('creates and labels an event task with its selected lifecycle phase', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 4, scopeUnitId: 'UNIT-1', eventScopeType: 'UNIT' },
      workstreams: [], tasks: [{ ...assignedTask, phase: 'FOLLOW_UP', title: 'Đúc kết sau trại' }], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.task.create': true },
    }
    render(<OperationsPage />)

    expect(screen.getByText('Sau sự kiện · 0 người được phân công')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tên task'), { target: { value: 'Phục vụ nghi thức' } })
    fireEvent.change(screen.getByLabelText('Giai đoạn nhiệm vụ'), { target: { value: 'EXECUTION' } })
    fireEvent.click(screen.getByText('Nhiệm vụ bắt buộc'))
    fireEvent.click(screen.getByRole('button', { name: 'Tạo task' }))

    await waitFor(() => expect(createTask).toHaveBeenCalledWith({
      title: 'Phục vụ nghi thức', eventId: 'E1', workstreamId: null, scopeUnitId: 'UNIT-1', dueAt: null, scheduledStartAt: null, scheduledEndAt: null, phase: 'EXECUTION', isRequired: true,
    }, expect.any(String)))
  })

  it('edits a task through the command modal and announces only the server acknowledgement verdict', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 4 },
      workstreams: [], tasks: [{ ...assignedTask, myAssignments: undefined }], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.task.manage': true },
    }
    updateTask.mockResolvedValue({ task: { ...assignedTask, myAssignments: undefined, title: 'Chuẩn bị nghi thức mới', version: 4 }, acknowledgementReset: true })
    render(<OperationsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }))
    const dialog = screen.getByRole('dialog', { name: 'Sửa nhiệm vụ' })
    fireEvent.change(within(dialog).getByLabelText('Tên nhiệm vụ'), { target: { value: 'Chuẩn bị nghi thức mới' } })
    fireEvent.change(within(dialog).getByLabelText('Hạn nhiệm vụ'), { target: { value: '2026-09-30T20:00' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'TSK-1', version: 3 }),
      expect.objectContaining({ title: 'Chuẩn bị nghi thức mới', dueAt: new Date('2026-09-30T20:00').toISOString() }),
      expect.any(String),
    ))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sửa nhiệm vụ' })).not.toBeInTheDocument())
  })

  it('hides task editing without the server manage capability', () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 4 },
      workstreams: [], tasks: [{ ...assignedTask, myAssignments: undefined }], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.task.create': true },
    }
    render(<OperationsPage />)
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
  })

  it('creates a task shift only with a valid start and end window', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 4, scopeUnitId: 'UNIT-1', eventScopeType: 'UNIT' },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.task.create': true },
    }
    render(<OperationsPage />)
    fireEvent.change(screen.getByLabelText('Tên task'), { target: { value: 'Trực cổng' } })
    fireEvent.change(screen.getByLabelText('Bắt đầu ca task'), { target: { value: '2026-10-01T08:00' } })
    expect(screen.getByRole('button', { name: 'Tạo task' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Kết thúc ca task'), { target: { value: '2026-10-01T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo task' }))
    await waitFor(() => expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Trực cổng', scheduledStartAt: new Date('2026-10-01T08:00').toISOString(), scheduledEndAt: new Date('2026-10-01T10:00').toISOString(),
    }), expect.any(String)))
  })

  it('reuses the idempotency key when retrying an unchanged task creation', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 4, scopeUnitId: 'UNIT-1', eventScopeType: 'UNIT' },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.task.create': true },
    }
    render(<OperationsPage />)
    fireEvent.change(screen.getByLabelText('Tên task'), { target: { value: 'Trực đêm' } })
    createTask.mockRejectedValueOnce(new Error('Network failure'))
    fireEvent.click(screen.getByRole('button', { name: 'Tạo task' }))
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1))
    const firstKey = createTask.mock.calls[0][1]
    expect(typeof firstKey).toBe('string')
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tạo task' }))
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(2))
    expect(createTask.mock.calls[1][1]).toBe(firstKey)

    fireEvent.change(screen.getByLabelText('Tên task'), { target: { value: 'Trực ngày' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo task' }))
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(3))
    expect(createTask.mock.calls[2][1]).not.toBe(firstKey)
  })

  it('creates an OWNER dispatch with an optional reserve and explicit acknowledgement deadline', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'DRAFT', visibility: 'INTERNAL', version: 4 },
      workstreams: [], tasks: [{ ...assignedTask, myAssignments: [] }], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.task.assign': true },
    }
    operationCandidates = [
      { parishId: 'parish-a', personId: 'P1', userId: 'U1', displayName: 'Người chính', eligibility: 'ACTIONABLE', inResourceScope: true },
      { parishId: 'parish-a', personId: 'P2', userId: 'U2', displayName: 'Người dự bị', eligibility: 'ACTIONABLE', inResourceScope: true },
    ]
    render(<OperationsPage />)

    fireEvent.change(screen.getByLabelText('Task cần phân công'), { target: { value: assignedTask.id } })
    fireEvent.change(screen.getByLabelText('Vai trò phân công'), { target: { value: 'OWNER' } })
    fireEvent.change(screen.getByLabelText('Người thực hiện chính'), { target: { value: 'user:U1' } })
    fireEvent.change(screen.getByLabelText('Người dự bị'), { target: { value: 'user:U2' } })
    fireEvent.change(screen.getByLabelText('Hạn nhận nhiệm vụ'), { target: { value: '2027-01-01T12:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lời mời phụ trách' }))

    await waitFor(() => expect(dispatchTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: assignedTask.id, version: assignedTask.version }),
      { userId: 'U1' },
      { userId: 'U2' },
      new Date('2027-01-01T12:00').toISOString(),
      expect.any(String),
    ))
  })

  it('shows a dispatch invitation and accepts it through its server version', async () => {
    dispatchInvitations = [{
      id: 'OPD-1', parishId: 'parish-a', taskId: 'TSK-DISPATCH', version: 3, target: 'RESERVE',
      acknowledgeBy: '2027-01-01T05:00:00Z', invitedAt: '2027-01-01T04:00:00Z', taskTitle: 'Trực cổng', eventId: 'E1', eventTitle: 'Trại hè',
    }]
    render(<OperationsPage />)

    const invitationPanel = screen.getByLabelText('Lời mời nhận nhiệm vụ')
    expect(within(invitationPanel).getByText(/Người dự bị/)).toBeInTheDocument()
    fireEvent.click(within(invitationPanel).getByRole('button', { name: 'Nhận nhiệm vụ' }))
    await waitFor(() => expect(acceptTaskDispatch).toHaveBeenCalledWith(dispatchInvitations[0], expect.any(String)))
  })

  it('does not complete a live event until an outcome summary is provided', () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'LIVE', visibility: 'INTERNAL', version: 5 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] }, closure: { blockers: [] },
      permissions: { 'operations.event.transition': true },
    }
    render(<OperationsPage />)

    const complete = screen.getByRole('button', { name: 'Hoàn tất sự kiện' })
    expect(complete).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Tổng kết kết quả' }), { target: { value: 'Đã hoàn thành an toàn.' } })
    expect(complete).toBeEnabled()
  })

  it('keeps required-task closure blockers and does not offer evaluation while LIVE', () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'LIVE', visibility: 'INTERNAL', version: 5 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      closure: { blockers: [{ type: 'TASK_INCOMPLETE', id: 'TSK-1', label: 'Công việc bắt buộc chưa xong' }] },
      permissions: { 'operations.event.transition': true, 'operations.event.manage': true },
    }
    render(<OperationsPage />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Tổng kết kết quả' }), { target: { value: 'Đã hoàn thành an toàn.' } })
    expect(screen.getByRole('button', { name: 'Hoàn tất sự kiện' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Công việc bắt buộc chưa xong/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hậu kiểm & Follow-up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tạo task' })).not.toBeInTheDocument()
  })

  it('marks an unread reminder through the acknowledged store command', () => {
    reminders = [{ id: 'R1', parishId: 'parish-a', triggerAt: '2026-10-01T00:30:00Z', kind: 'TASK_DUE', status: 'SENT', version: 2, readAt: null, createdAt: '2026-09-30T01:00:00Z' }]
    render(<OperationsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc' }))
    expect(markReminderRead).toHaveBeenCalledWith(reminders[0], expect.any(String))
  })

  it('blocks closure for cancelled required work even when readiness is 100 percent', () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'LIVE', visibility: 'INTERNAL', version: 5 },
      workstreams: [], tasks: [{ ...assignedTask, status: 'CANCELLED', isRequired: true }], assignees: [], readiness: { percent: 100, blockers: [] }, permissions: { 'operations.event.transition': true },
    }
    render(<OperationsPage />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Tổng kết kết quả' }), { target: { value: 'Summary' } })
    expect(screen.getByRole('button', { name: 'Hoàn tất sự kiện' })).toBeDisabled()
    expect(screen.getByText('Chưa thể đóng sự kiện: còn nhiệm vụ bắt buộc chưa hoàn tất.')).toBeInTheDocument()
    expect(transitionEvent).not.toHaveBeenCalled()
  })

  it('shows acknowledged assignment warnings without implying acceptance', () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 2 },
      workstreams: [], tasks: [assignedTask], assignees: [], readiness: { percent: 50, blockers: [] }, permissions: {},
    }
    assignmentWarnings = { taskId: assignedTask.id, items: [{ id: 'B1', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T02:00:00Z' }] }
    render(<OperationsPage />)
    expect(screen.getByText(/Đã lưu phân công, nhưng người nhận có lịch bận/)).toHaveTextContent('chưa phải xác nhận nhận việc')
  })

  it('renders and updates a task checklist only with task-scoped capability', () => {
    const checklistTask = { ...assignedTask, version: 7 }
    const checklistItem = { id: 'C1', parishId: 'parish-a', taskId: checklistTask.id, label: 'Kiểm tra dụng cụ', isRequired: true, isDone: false, sortOrder: 0 }
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 2 },
      workstreams: [], tasks: [checklistTask], assignees: [], readiness: { percent: 50, blockers: [] }, permissions: {},
    }
    selectedTask = { task: checklistTask, assignees: [], checklist: [checklistItem], comments: [], dependencies: [], permissions: { 'operations.task.execute': true } }
    render(<OperationsPage />)

    fireEvent.click(screen.getByRole('checkbox', { name: /kiểm tra dụng cụ/i }))
    expect(toggleChecklistItem).toHaveBeenCalledWith(checklistTask, checklistItem, expect.any(String))
    expect(screen.queryByRole('button', { name: 'Thêm mục' })).not.toBeInTheDocument()
  })

  it('opens event detail modal from the explicit detail button, not from row keyboard', () => {
    events = [{
      id: 'EVT-100', parishId: 'parish-a', title: 'Hội Trại Sa Mạc 2026', eventType: 'CAMP',
      startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh',
      status: 'PLANNING', visibility: 'INTERNAL', version: 1,
    }]
    render(<OperationsPage />)

    // Click on the event card title / article (pointer shortcut)
    const eventHeading = screen.getByText('Hội Trại Sa Mạc 2026')
    expect(eventHeading).toBeInTheDocument()
    fireEvent.click(eventHeading)
    expect(selectEvent).toHaveBeenCalledWith('EVT-100')

    // A6': the row is not keyboard-focusable — keyboard users go through the
    // explicit button (no nested-interactive article), so row Enter does nothing.
    const article = eventHeading.closest('article')!
    expect(article).not.toHaveAttribute('tabindex')
    selectEvent.mockClear()
    fireEvent.keyDown(article, { key: 'Enter' })
    expect(selectEvent).not.toHaveBeenCalled()

    // The explicit detail button remains the keyboard path.
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }))
    expect(selectEvent).toHaveBeenCalledWith('EVT-100')
  })

  it('renders selected event inside ModalShell dialog and closes on close button click', () => {
    selectedEvent = {
      event: { id: 'EVT-100', parishId: 'parish-a', title: 'Hội Trại Sa Mạc 2026', eventType: 'CAMP', startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 1 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 80, blockers: [] },
      permissions: {},
      // U-19: creator ≠ organizer (O1) — the header names both.
      organizer: { userId: 'user-leader', personId: null, displayName: 'Trưởng Xứ đoàn' },
      creator: { userId: 'user-secretary', displayName: 'Thư ký Xứ đoàn' },
    }
    render(<OperationsPage />)

    // Verify ModalShell dialog layer is present
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hội Trại Sa Mạc 2026' })).toBeInTheDocument()
    expect(screen.getByText('Phụ trách: Trưởng Xứ đoàn')).toBeInTheDocument()
    expect(screen.getByText('Người tạo: Thư ký Xứ đoàn')).toBeInTheDocument()

    // Clicking "Đóng chi tiết" closes the modal
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }))
    expect(selectEvent).toHaveBeenCalledWith(null)
  })

  it('renders SubpageHeader synchronized with mobile views when effectiveMode is mobile', () => {
    effectiveMode = 'mobile'
    creationOptions = {
      canCreateXuDoanEvent: true,
      xuDoanOrganizers: [],
      units: [],
    }
    permissions = { 'operations.event.create': true }
    render(<OperationsPage />)

    const mobileHeader = screen.getByRole('region', { name: 'Sự Kiện & Công Việc' })
    expect(mobileHeader).toHaveClass('subpage-header')
    expect(within(mobileHeader).getByRole('heading', { level: 2, name: 'Sự Kiện & Công Việc' })).toHaveClass('subpage-header__title')
    expect(within(mobileHeader).getByRole('button', { name: 'Tạo mới' })).toHaveClass('subpage-header__btn--primary')
    expect(within(mobileHeader).getByRole('button', { name: 'Làm mới danh sách' })).toHaveClass('subpage-header__btn--icon-only')
  })

  it('preserves mobile visual and DOM reading order (WCAG focus order) without CSS order hacks', () => {
    effectiveMode = 'mobile'
    events = [{
      id: 'EVT-100', parishId: 'parish-a', title: 'Hội Trại Sa Mạc 2026', eventType: 'CAMP',
      startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh',
      status: 'PLANNING', visibility: 'INTERNAL', version: 1,
    }]
    render(<OperationsPage />)

    const inbox = screen.getByRole('region', { name: 'Hộp nhắc việc' })
    const myTasks = screen.getByRole('region', { name: 'Việc của tôi' })
    const eventsSection = screen.getByRole('region', { name: 'Sự kiện đang diễn ra' })
    const kpiStrip = screen.getByRole('region', { name: 'Tổng quan công việc' })
    const utilities = screen.getByRole('region', { name: 'Tiện ích điều hành' })

    // DOM order in mobile follows native glance & segmented hierarchy:
    // KPI -> My Tasks -> Events -> Inbox -> Utilities
    expect(kpiStrip.compareDocumentPosition(myTasks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(myTasks.compareDocumentPosition(eventsSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(eventsSection.compareDocumentPosition(inbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(inbox.compareDocumentPosition(utilities) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Primary mobile segmented navigation tabs
    const navTabs = screen.getByRole('tablist', { name: 'Phân hệ điều hành' })
    expect(navTabs).toBeInTheDocument()
    const myTasksTab = within(navTabs).getByRole('tab', { name: /Việc của tôi/ })
    const eventsTab = within(navTabs).getByRole('tab', { name: /Sự kiện/ })
    expect(myTasksTab).toHaveAttribute('aria-selected', 'true')
    expect(eventsTab).toHaveAttribute('aria-selected', 'false')

    // Switching tabs changes active tab
    fireEvent.click(eventsTab)
    expect(eventsTab).toHaveAttribute('aria-selected', 'true')
    expect(myTasksTab).toHaveAttribute('aria-selected', 'false')

    // Mobile utility accordion toggle
    const toggleBtn = screen.getByRole('button', { name: 'Mở tiện ích' })
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('tablist', { name: 'Phân khu tiện ích điều hành' })).not.toBeInTheDocument()

    fireEvent.click(toggleBtn)
    expect(screen.getByRole('button', { name: 'Thu gọn' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('tablist', { name: 'Phân khu tiện ích điều hành' })).toBeInTheDocument()
  })

  it('exposes accessible quick filter chips with role=group and aria-pressed', () => {
    render(<OperationsPage />)

    const filterGroup = screen.getByRole('group', { name: 'Lọc công việc theo trạng thái' })
    expect(filterGroup).toBeInTheDocument()

    const allChip = within(filterGroup).getByRole('button', { name: /Tất cả/ })
    const pendingChip = within(filterGroup).getByRole('button', { name: /Cần xác nhận/ })

    expect(allChip).toHaveAttribute('aria-pressed', 'true')
    expect(pendingChip).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(pendingChip)
    expect(allChip).toHaveAttribute('aria-pressed', 'false')
    expect(pendingChip).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders mobile floating action button (FAB) and opens bottom-sheet creation menu', () => {
    effectiveMode = 'mobile'
    creationOptions = {
      canCreateXuDoanEvent: true,
      xuDoanOrganizers: [{ userId: 'user-xdt', displayName: 'Trưởng Xứ đoàn', positionCode: 'PARISH_LEADER' }],
      units: [{ id: 'UNIT-1', name: 'Ban Phụng Vụ', unitType: 'COMMITTEE', canCreateEvent: true, canCreateTask: true, organizers: [], myRole: 'COMMITTEE_LEADER' }],
    }
    render(<OperationsPage />)

    const fab = screen.getByRole('button', { name: 'Tạo mới sự kiện hoặc nhiệm vụ' })
    expect(fab).toBeInTheDocument()
    // W2.8: the shared primitive owns bottom clearance/safe-area; no more
    // hand-rolled fixed positioning that overlapped the nav on notched phones.
    expect(fab).toHaveClass('mobile-floating-action')
    expect(fab).not.toHaveClass('fixed')
    expect(fab).not.toHaveClass('sm:hidden')

    fireEvent.click(fab)

    const sheet = screen.getByRole('dialog', { name: 'Tạo mới' })
    expect(sheet).toBeInTheDocument()
    expect(within(sheet).getByRole('menuitem', { name: /Tạo sự kiện Xứ đoàn/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('menuitem', { name: /Tạo sự kiện Ban Phụng Vụ/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('menuitem', { name: /Tạo Task · Ban Phụng Vụ/ })).toBeInTheDocument()
  })

  it('filters events by search query in the events section and supports clear', () => {
    events = [
      { id: 'E1', parishId: 'parish-a', title: 'Hội Trại Sa Mạc 2026', eventType: 'CAMP', startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', location: 'Rừng Nam Cát Tiên', version: 1 },
      { id: 'E2', parishId: 'parish-a', title: 'Lễ Khai Giảng Niên Khóa', eventType: 'FEAST', startsAt: '2026-09-15T07:00:00Z', endsAt: '2026-09-15T11:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', location: 'Hoa Viên Thánh Đường', version: 1 },
      { id: 'E3', parishId: 'parish-a', title: 'Tĩnh Tâm Ban Huynh Trưởng', eventType: 'OTHER', startsAt: '2026-11-20T08:00:00Z', endsAt: '2026-11-20T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', location: 'Đan Viện Châu Sơn', version: 1 },
    ]
    render(<OperationsPage />)

    const searchInput = screen.getByRole('searchbox', { name: 'Tìm kiếm sự kiện' })
    expect(searchInput).toBeInTheDocument()

    // Search by title
    fireEvent.change(searchInput, { target: { value: 'Khai Giảng' } })
    expect(screen.getByText('Lễ Khai Giảng Niên Khóa')).toBeInTheDocument()
    expect(screen.queryByText('Hội Trại Sa Mạc 2026')).not.toBeInTheDocument()
    expect(screen.queryByText('Tĩnh Tâm Ban Huynh Trưởng')).not.toBeInTheDocument()

    // Clear search using clear button
    const clearBtn = screen.getByRole('button', { name: 'Xóa tìm kiếm sự kiện' })
    fireEvent.click(clearBtn)
    expect(screen.getByText('Hội Trại Sa Mạc 2026')).toBeInTheDocument()
    expect(screen.getByText('Tĩnh Tâm Ban Huynh Trưởng')).toBeInTheDocument()

    // Search by location
    fireEvent.change(searchInput, { target: { value: 'Châu Sơn' } })
    expect(screen.getByText('Tĩnh Tâm Ban Huynh Trưởng')).toBeInTheDocument()
    expect(screen.queryByText('Hội Trại Sa Mạc 2026')).not.toBeInTheDocument()
  })

  it('renders primary transition button in selectedEvent sticky footer and validates task filter chips', () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 4 },
      workstreams: [],
      tasks: [{ ...assignedTask, status: 'TODO' }],
      assignees: [],
      readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.event.transition': true },
    }
    render(<OperationsPage />)

    // Sticky footer contains transition button
    const transitionBtn = screen.getByRole('button', { name: 'Chuyển sang chuẩn bị' })
    expect(transitionBtn).toBeInTheDocument()
    expect(transitionBtn.closest('.modal-content__footer')).toBeInTheDocument()

    // Modal task filter chips have role="group" and aria-pressed
    const taskFilterGroup = screen.getByRole('group', { name: 'Lọc task theo trạng thái' })
    expect(taskFilterGroup).toBeInTheDocument()

    const allChip = within(taskFilterGroup).getByRole('button', { name: /Tất cả/ })
    expect(allChip).toHaveAttribute('aria-pressed', 'true')
  })

  it('P1-4: refetches cached overview when connectivity returns', async () => {
    online = false
    source = 'cache'
    const { rerender } = render(<OperationsPage />)
    fetchOperations.mockClear()
    online = true
    rerender(<OperationsPage />)
    await waitFor(() => expect(fetchOperations).toHaveBeenCalledTimes(1))
  })

  it('P1-4: does not refetch on online toggle while already on server data', async () => {
    online = false
    source = 'server'
    const { rerender } = render(<OperationsPage />)
    fetchOperations.mockClear()
    online = true
    rerender(<OperationsPage />)
    await waitFor(() => expect(fetchOperations).not.toHaveBeenCalled())
  })

  it('P1-8: a reminder action in flight does not lock the dispatch accept button', async () => {
    acceptTaskDispatch.mockImplementation(() => new Promise(() => {}))
    markReminderRead.mockImplementation(() => new Promise(() => {}))
    const invitation = {
      id: 'OPD-1', parishId: 'parish-a', taskId: 'TSK-9', version: 1, target: 'PRIMARY' as const,
      acknowledgeBy: '2027-01-01T05:00:00Z', invitedAt: '2027-01-01T04:00:00Z', taskTitle: 'Trực cổng', eventId: 'EVT-9', eventTitle: 'Trại hè',
    }
    dispatchInvitations = [invitation]
    reminders = [{
      id: 'REM-1', parishId: 'parish-a', triggerAt: '2027-01-01T04:00:00Z',
      kind: 'TASK_DUE', status: 'SENT', version: 1, readAt: null, sentAt: null, createdAt: '2026-09-30T01:00:00Z',
    }]
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc' }))
    await waitFor(() => expect(markReminderRead).toHaveBeenCalledTimes(1))
    // The unrelated dispatch invitation stays actionable while the reminder resolves.
    expect(screen.getByRole('button', { name: 'Nhận nhiệm vụ' })).toBeEnabled()
  })

  it('P1-A5: create menu supports Escape, outside-click and arrow navigation', async () => {
    creationOptions = {
      canCreateXuDoanEvent: true,
      xuDoanOrganizers: [],
      units: [{ id: 'UNIT-1', name: 'Ban A', unitType: 'COMMITTEE', canCreateEvent: true, canCreateTask: true, organizers: [], myRole: null }],
    }
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))
    const menu = screen.getByRole('menu', { name: 'Tạo mới' })
    const items = within(menu).getAllByRole('menuitem')
    expect(items.length).toBeGreaterThan(1)
    ;(items[0] as HTMLElement).focus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Tạo mới' })).not.toBeInTheDocument())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tạo mới' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))
    expect(screen.getByRole('menu', { name: 'Tạo mới' })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Tạo mới' })).not.toBeInTheDocument())
  })

  it('renders categorized create menu with badges and opens dialogs', async () => {
    creationOptions = {
      canCreateXuDoanEvent: true,
      xuDoanOrganizers: [],
      units: [
        { id: 'UNIT-B', name: 'Ngành Nghĩa', unitType: 'BRANCH', canCreateEvent: true, canCreateTask: false, organizers: [], myRole: null },
        { id: 'UNIT-C', name: 'Ban Ẩm Thực', unitType: 'COMMITTEE', canCreateEvent: false, canCreateTask: true, organizers: [], myRole: null },
      ],
    }
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }))
    const menu = screen.getByRole('menu', { name: 'Tạo mới' })

    // Verify category headers
    expect(within(menu).getByText('Sự kiện')).toBeInTheDocument()
    expect(within(menu).getByText('Nhiệm vụ độc lập')).toBeInTheDocument()

    // Verify items and badges
    expect(within(menu).getByText('Tạo sự kiện Xứ đoàn')).toBeInTheDocument()
    expect(within(menu).getByText('Toàn xứ')).toBeInTheDocument()
    expect(within(menu).getByText('Tạo sự kiện Ngành Nghĩa')).toBeInTheDocument()
    expect(within(menu).getByText('Ngành')).toBeInTheDocument()
    expect(within(menu).getByText('Tạo Task · Ban Ẩm Thực')).toBeInTheDocument()
    expect(within(menu).getByText('Task')).toBeInTheDocument()

    // Clicking "Tạo sự kiện Xứ đoàn" opens CreateEventForm modal
    fireEvent.click(within(menu).getByText('Tạo sự kiện Xứ đoàn'))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Tạo sự kiện Xứ đoàn' })).toBeInTheDocument())
  })

  it('separates active and archived events in OperationsEventList and displays archive switcher', async () => {
    const activeEvt: OperationEvent = {
      id: 'EVT-ACTIVE', parishId: 'parish-a', title: 'Hội trại giới trẻ', eventType: 'CAMP', status: 'PLANNING',
      startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh',
      visibility: 'INTERNAL', automationPaused: false, version: 1, createdBy: 'user-a', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    }
    const cancelledEvt: OperationEvent = {
      id: 'EVT-CANCELLED', parishId: 'parish-a', title: 'Lễ bế giảng cũ', eventType: 'FEAST_DAY', status: 'CANCELLED',
      startsAt: '2026-09-10T08:00:00Z', endsAt: '2026-09-10T11:00:00Z', timezone: 'Asia/Ho_Chi_Minh',
      visibility: 'INTERNAL', automationPaused: true, version: 2, createdBy: 'user-a', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
    }
    events = [activeEvt, cancelledEvt]
    render(<OperationsPage />)

    // Active tab is default: shows active event, does not show cancelled event
    expect(screen.getByText('Đang hoạt động (1)')).toBeInTheDocument()
    expect(screen.getByText('Lưu trữ (1)')).toBeInTheDocument()
    expect(screen.getByText('Hội trại giới trẻ')).toBeInTheDocument()
    expect(screen.queryByText('Lễ bế giảng cũ')).not.toBeInTheDocument()

    // Switch to "Lưu trữ"
    fireEvent.click(screen.getByText('Lưu trữ (1)'))
    expect(screen.queryByText('Hội trại giới trẻ')).not.toBeInTheDocument()
    expect(screen.getByText('Lễ bế giảng cũ')).toBeInTheDocument()
    expect(screen.getByText('Đã hủy / Lưu trữ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xem & Khôi phục' })).toBeInTheDocument()
  })

  it('allows restoring a cancelled event with mandatory reason in EventLifecycleHub', async () => {
    const cancelledEvt: OperationEvent = {
      id: 'EVT-RESTORE', parishId: 'parish-a', title: 'Sự kiện cần khôi phục', eventType: 'CAMP', status: 'CANCELLED',
      startsAt: '2026-10-15T08:00:00Z', endsAt: '2026-10-15T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh',
      visibility: 'INTERNAL', automationPaused: true, version: 2, createdBy: 'user-a', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
    }
    selectedEvent = {
      event: cancelledEvt,
      tasks: [],
      workstreams: [],
      assignees: [],
      permissions: { 'operations.event.transition': true },
      readiness: { percent: 0, blockers: [] },
    }
    restoreEvent.mockResolvedValue({ ...cancelledEvt, status: 'PLANNING', version: 3 })
    render(<OperationsPage />)

    // Verify archive notice
    expect(screen.getByText('Sự kiện đã bị hủy & chuyển vào Lưu trữ')).toBeInTheDocument()

    // Click "Khôi phục sự kiện"
    const restoreButtons = screen.getAllByRole('button', { name: 'Khôi phục sự kiện' })
    expect(restoreButtons.length).toBeGreaterThan(0)
    fireEvent.click(restoreButtons[0]!)

    // Prompt for reason appears
    const textarea = screen.getByPlaceholderText('Nhập lý do khôi phục sự kiện về Kế hoạch...')
    expect(textarea).toBeInTheDocument()

    // Submit button is disabled without reason
    const confirmButton = screen.getByRole('button', { name: 'Xác nhận khôi phục' })
    expect(confirmButton).toBeDisabled()

    // Type reason and submit
    fireEvent.change(textarea, { target: { value: 'Kế hoạch đã được phê duyệt lại' } })
    expect(confirmButton).not.toBeDisabled()
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(restoreEvent).toHaveBeenCalledWith('EVT-RESTORE', 2, 'Kế hoạch đã được phê duyệt lại', expect.any(String))
    })
  })

  it('filters cancelled tasks into Lưu trữ and allows cancelling active tasks with reason', async () => {
    const activeTask: OperationTask = {
      id: 'TSK-ACTIVE', parishId: 'parish-a', title: 'Mua nguyên liệu nấu ăn', status: 'TODO', priority: 'NORMAL', phase: 'PREPARATION', isRequired: false,
      version: 1, myAssignments: [{ id: 'OPA-1', parishId: 'parish-a', taskId: 'TSK-ACTIVE', userId: 'user-a', assignmentRole: 'OWNER', acknowledgementStatus: 'ACCEPTED', version: 1 }],
    }
    const cancelledTask: OperationTask = {
      id: 'TSK-CANCELLED', parishId: 'parish-a', title: 'Chuẩn bị phông bạt cũ', status: 'CANCELLED', priority: 'NORMAL', phase: 'PREPARATION', isRequired: false,
      version: 2, cancellationReason: 'Không còn cần dùng', myAssignments: [],
    }

    selectedEvent = {
      event: {
        id: 'EVT-1', parishId: 'parish-a', title: 'Hội trại', eventType: 'CAMP', status: 'PLANNING',
        startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh',
        visibility: 'INTERNAL', automationPaused: false, version: 1, createdBy: 'user-a', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
      },
      tasks: [activeTask, cancelledTask],
      workstreams: [],
      assignees: [],
      permissions: { 'operations.task.manage': true },
      readiness: { percent: 50, blockers: [] },
    }
    transitionTask.mockResolvedValue({ ...activeTask, status: 'CANCELLED', version: 2 })

    render(<OperationsPage />)

    // In event tasks tab: "Tất cả (1)" shows only active task, not cancelled
    const eventFilterGroup = screen.getByRole('group', { name: 'Lọc task theo trạng thái' })
    expect(within(eventFilterGroup).getByText('Tất cả (1)')).toBeInTheDocument()
    expect(within(eventFilterGroup).getByText('Lưu trữ (1)')).toBeInTheDocument()
    expect(screen.getByText('Mua nguyên liệu nấu ăn')).toBeInTheDocument()
    expect(screen.queryByText('Chuẩn bị phông bạt cũ')).not.toBeInTheDocument()

    // Active task has "Hủy việc" button
    const cancelTaskBtn = screen.getByRole('button', { name: 'Hủy việc' })
    fireEvent.click(cancelTaskBtn)

    // Reason dialog appears
    expect(screen.getByRole('heading', { name: 'Hủy Nhiệm Vụ' })).toBeInTheDocument()
    const reasonInput = screen.getByPlaceholderText('Lý do hủy nhiệm vụ...')
    fireEvent.change(reasonInput, { target: { value: 'Thay đổi thực đơn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy việc' }))

    await waitFor(() => {
      expect(transitionTask).toHaveBeenCalledWith(activeTask, 'CANCELLED', expect.objectContaining({
        cancellationReason: 'Thay đổi thực đơn',
      }))
    })

    // Filter by "Lưu trữ" in the event
    fireEvent.click(within(eventFilterGroup).getByText('Lưu trữ (1)'))
    expect(screen.queryByText('Mua nguyên liệu nấu ăn')).not.toBeInTheDocument()
    expect(screen.getByText('Chuẩn bị phông bạt cũ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chi tiết & Khôi phục' })).toBeInTheDocument()
  })
})
