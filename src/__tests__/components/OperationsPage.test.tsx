import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OperationsPage from '../../pages/OperationsPage'
import type { OperationCandidate, OperationEvent, OperationEventDetail, OperationReminder, OperationTask, OperationTaskDetail } from '../../lib/api/operations'

const acknowledgeTask = vi.fn()
const transitionTask = vi.fn()
const transitionEvent = vi.fn()
const resumeEventAutomation = vi.fn()
const markReminderRead = vi.fn()
const addChecklistItem = vi.fn()
const toggleChecklistItem = vi.fn()
const createEvent = vi.fn()
const updateEvent = vi.fn()
const createTask = vi.fn()
const dispatchTask = vi.fn()
const acceptTaskDispatch = vi.fn()
const selectEvent = vi.fn()
const fetchOperations = vi.fn().mockResolvedValue(undefined)
let online = true
let events: OperationEvent[] = []
let selectedEvent: OperationEventDetail | null = null
let selectedTask: OperationTaskDetail | null = null
let reminders: OperationReminder[] = []
let permissions: Record<string, boolean> = {}
let assignmentWarnings: { taskId: string; items: Array<{ id: string; startsAt: string; endsAt: string }> } | null = null
let dispatchInvitations: import('../../lib/api/operations').OperationTaskDispatchInvitation[] = []
let operationCandidates: OperationCandidate[] = []

const assignedTask: OperationTask = {
  id: 'TSK-1', parishId: 'parish-a', title: 'Chuẩn bị nghi thức', status: 'TODO', priority: 'HIGH', phase: 'PREPARATION', isRequired: true,
  approvalStatus: 'NOT_REQUIRED', version: 3,
  myAssignments: [{ id: 'OPA-1', parishId: 'parish-a', taskId: 'TSK-1', userId: 'user-a', assignmentRole: 'OWNER', acknowledgementStatus: 'PENDING', version: 1 }],
}

vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => online }))
vi.mock('../../stores/operationsStore', () => ({
  useOperationsStore: () => ({
    events, tasks: [assignedTask], reminders, dispatchInvitations, assignmentWarnings, permissions, selectedEvent, selectedTask, detailLoading: false, taskDetailLoading: false, loading: false, error: null,
    source: 'server', cacheSavedAt: null, eventTotal: 0, taskTotal: 1, eventHasMore: false, taskHasMore: false,
    reminderHasMore: false, loadMoreEvents: vi.fn(), loadMoreTasks: vi.fn(), loadMoreReminders: vi.fn(),
    fetch: fetchOperations, createEvent, updateEvent, selectEvent, selectTask: vi.fn(), createTask, assignTask: vi.fn(), dispatchTask, acceptTaskDispatch, transitionEvent, resumeEventAutomation, transitionTask, acknowledgeTask, addChecklistItem, toggleChecklistItem, markReminderRead,
  }),
}))
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
  it('renders task detail and checklist without selecting an event', () => {
    selectedTask = { task: { ...assignedTask, description: 'Independent task evidence', approvalStatus: 'PENDING' }, checklist: [], assignees: [], comments: [], dependencies: [], permissions: {} }
    render(<OperationsPage />)
    expect(screen.getByRole('button', { name: 'Chi tiết nhiệm vụ' })).toBeEnabled()
    expect(screen.getByText('Independent task evidence')).toBeInTheDocument()
    expect(screen.getByText('Đang chờ duyệt')).toBeInTheDocument()
    expect(screen.getByLabelText('Chi tiết checklist')).toBeInTheDocument()
  })

  beforeEach(() => {
    assignmentWarnings = null
    online = true
    assignedTask.status = 'TODO'
    assignedTask.myAssignments![0].acknowledgementStatus = 'PENDING'
    acknowledgeTask.mockReset().mockResolvedValue(undefined)
    transitionTask.mockReset().mockResolvedValue(undefined)
    transitionEvent.mockReset().mockResolvedValue(undefined)
    resumeEventAutomation.mockReset().mockResolvedValue(undefined)
    markReminderRead.mockReset().mockResolvedValue(undefined)
    addChecklistItem.mockReset().mockResolvedValue(undefined)
    toggleChecklistItem.mockReset().mockResolvedValue(undefined)
    createEvent.mockReset().mockResolvedValue(undefined)
    updateEvent.mockReset().mockResolvedValue(undefined)
    createTask.mockReset().mockResolvedValue({ ...assignedTask })
    dispatchTask.mockReset().mockResolvedValue(undefined)
    acceptTaskDispatch.mockReset().mockResolvedValue(undefined)
    selectEvent.mockReset().mockResolvedValue(undefined)
    fetchOperations.mockClear()
    events = []
    selectedEvent = null
    selectedTask = null
    reminders = []
    dispatchInvitations = []
    operationCandidates = []
    permissions = {}
  })

  it('creates a public Operations event without accepting a client-owned calendar link', async () => {
    permissions = { 'operations.event.create': true, 'operations.event.publish_public': true }
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Tạo sự kiện mới' }))
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
    })))
    expect(createEvent.mock.calls[0][0]).not.toHaveProperty('sourceParishEventId')
  })

  it('keeps public visibility unavailable when the server capability is absent', () => {
    permissions = { 'operations.event.create': true }
    render(<OperationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Tạo sự kiện mới' }))
    expect(screen.getByRole('button', { name: 'Công khai' })).toBeDisabled()
    expect(screen.getByText(/Trưởng Xứ đoàn duyệt việc công khai/)).toBeInTheDocument()
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
    })))
    expect(updateEvent.mock.calls[0][1]).not.toHaveProperty('sourceParishEventId')
  })

  it('shows only role-appropriate assignment actions and passes the exact task to the store', async () => {
    const view = render(<OperationsPage />)
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nhận việc' }))
    expect(acknowledgeTask).toHaveBeenCalledWith(assignedTask, 'ACCEPTED')
    assignedTask.myAssignments![0].acknowledgementStatus = 'ACCEPTED'
    view.rerender(<OperationsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hoàn tất' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tất' }))
    expect(transitionTask).toHaveBeenCalledWith(assignedTask, 'DONE')
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

    await waitFor(() => expect(transitionEvent).toHaveBeenCalledWith('E1', 'PLANNING', 4, { reason: undefined, outcomeSummary: undefined }))
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
    }))
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
    }))
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
    await waitFor(() => expect(resumeEventAutomation).toHaveBeenCalledWith('E1', 9, 'Người quản lý chủ động tiếp tục tự động chuyển giai đoạn.'))
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
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 4 },
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
      title: 'Phục vụ nghi thức', eventId: 'E1', workstreamId: null, dueAt: null, scheduledStartAt: null, scheduledEndAt: null, phase: 'EXECUTION', isRequired: true,
    }))
  })

  it('creates a task shift only with a valid start and end window', async () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 4 },
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
    })))
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
    await waitFor(() => expect(acceptTaskDispatch).toHaveBeenCalledWith(dispatchInvitations[0]))
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
    expect(markReminderRead).toHaveBeenCalledWith(reminders[0])
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
    expect(toggleChecklistItem).toHaveBeenCalledWith(checklistTask, checklistItem)
    expect(screen.queryByRole('button', { name: 'Thêm mục' })).not.toBeInTheDocument()
  })

  it('opens event detail modal when clicking an event card or pressing Enter', () => {
    events = [{
      id: 'EVT-100', parishId: 'parish-a', title: 'Hội Trại Sa Mạc 2026', eventType: 'CAMP',
      startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh',
      status: 'PLANNING', visibility: 'INTERNAL', version: 1,
    }]
    render(<OperationsPage />)

    // Click on the event card title / article
    const eventHeading = screen.getByText('Hội Trại Sa Mạc 2026')
    expect(eventHeading).toBeInTheDocument()
    fireEvent.click(eventHeading)
    expect(selectEvent).toHaveBeenCalledWith('EVT-100')

    // Keyboard interaction (Enter)
    const article = eventHeading.closest('article')!
    fireEvent.keyDown(article, { key: 'Enter' })
    expect(selectEvent).toHaveBeenCalledWith('EVT-100')
  })

  it('renders selected event inside ModalShell dialog and closes on close button click', () => {
    selectedEvent = {
      event: { id: 'EVT-100', parishId: 'parish-a', title: 'Hội Trại Sa Mạc 2026', eventType: 'CAMP', startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', version: 1 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 80, blockers: [] },
      permissions: {},
    }
    render(<OperationsPage />)

    // Verify ModalShell dialog layer is present
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hội Trại Sa Mạc 2026' })).toBeInTheDocument()

    // Clicking "Đóng chi tiết" closes the modal
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }))
    expect(selectEvent).toHaveBeenCalledWith(null)
  })
})
