import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OperationsPage from '../../pages/OperationsPage'
import type { OperationEventDetail, OperationReminder, OperationTask, OperationTaskDetail } from '../../lib/api/operations'

const acknowledgeTask = vi.fn()
const transitionTask = vi.fn()
const transitionEvent = vi.fn()
const markReminderRead = vi.fn()
const addChecklistItem = vi.fn()
const toggleChecklistItem = vi.fn()
const fetchOperations = vi.fn().mockResolvedValue(undefined)
let online = true
let selectedEvent: OperationEventDetail | null = null
let selectedTask: OperationTaskDetail | null = null
let reminders: OperationReminder[] = []
let assignmentWarnings: { taskId: string; items: Array<{ id: string; startsAt: string; endsAt: string }> } | null = null

const assignedTask: OperationTask = {
  id: 'TSK-1', parishId: 'parish-a', title: 'Chuẩn bị nghi thức', status: 'TODO', priority: 'HIGH', isRequired: true,
  approvalStatus: 'NOT_REQUIRED', version: 3,
  myAssignments: [{ id: 'OPA-1', parishId: 'parish-a', taskId: 'TSK-1', userId: 'user-a', assignmentRole: 'OWNER', acknowledgementStatus: 'PENDING', version: 1 }],
}

vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => online }))
vi.mock('../../stores/operationsStore', () => ({
  useOperationsStore: () => ({
    events: [], tasks: [assignedTask], reminders, assignmentWarnings, permissions: {}, selectedEvent, selectedTask, detailLoading: false, taskDetailLoading: false, loading: false, error: null,
    source: 'server', cacheSavedAt: null, eventTotal: 0, taskTotal: 1, eventHasMore: false, taskHasMore: false,
    reminderHasMore: false, loadMoreEvents: vi.fn(), loadMoreTasks: vi.fn(), loadMoreReminders: vi.fn(),
    fetch: fetchOperations, createEvent: vi.fn(), selectEvent: vi.fn(), selectTask: vi.fn(), createTask: vi.fn(), assignTask: vi.fn(), transitionEvent, transitionTask, acknowledgeTask, addChecklistItem, toggleChecklistItem, markReminderRead,
  }),
}))
vi.mock('../../stores/parishProfileStore', () => ({ useParishProfileStore: (selector: any) => selector({ snapshot: null, fetchSnapshot: vi.fn() }) }))

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
    markReminderRead.mockReset().mockResolvedValue(undefined)
    addChecklistItem.mockReset().mockResolvedValue(undefined)
    toggleChecklistItem.mockReset().mockResolvedValue(undefined)
    fetchOperations.mockClear()
    selectedEvent = null
    selectedTask = null
    reminders = []
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

  it('does not complete a live event until an outcome summary is provided', () => {
    selectedEvent = {
      event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'LIVE', visibility: 'INTERNAL', version: 5 },
      workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
      permissions: { 'operations.event.transition': true },
    }
    render(<OperationsPage />)

    const complete = screen.getByRole('button', { name: 'Hoàn tất sự kiện' })
    expect(complete).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Tổng kết kết quả' }), { target: { value: 'Đã hoàn thành an toàn.' } })
    expect(complete).toBeEnabled()
  })

  it('marks an unread reminder through the acknowledged store command', () => {
    reminders = [{ id: 'R1', parishId: 'parish-a', triggerAt: '2026-10-01T00:30:00Z', kind: 'TASK_DUE', status: 'SENT', readAt: null, createdAt: '2026-09-30T01:00:00Z' }]
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
})
