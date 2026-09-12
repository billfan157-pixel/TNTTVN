import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateEventForm } from '../../components/operations/CreateEventForm'
import { StandaloneTaskForm } from '../../components/operations/StandaloneTaskForm'
import { EventTaskForm } from '../../components/operations/EventTaskForm'
import { TaskAssignForm } from '../../components/operations/TaskAssignForm'
import { EventEditForm } from '../../components/operations/EventEditForm'
import type { OperationEventDetail } from '../../lib/api/operations'

const createEvent = vi.fn()
const selectEvent = vi.fn()
const createStandaloneTask = vi.fn()
const createTask = vi.fn()
const assignTask = vi.fn()
const dispatchTask = vi.fn()
const updateEvent = vi.fn()
const fetchStore = vi.fn()
let online = true
let creationOptions: any = null
let permissions: Record<string, boolean> = {}

vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => online }))
vi.mock('../../stores/operationsStore', () => {
  const selectState = (selector?: any) => {
    const state = {
      source: 'server', permissions, creationOptions,
      createEvent, selectEvent, createStandaloneTask, createTask, assignTask, dispatchTask, updateEvent, fetch: fetchStore,
    }
    return typeof selector === 'function' ? selector(state) : state
  }
  return { useOperationsStore: Object.assign((selector?: any) => selectState(selector), { setState: vi.fn(), getState: () => selectState() }) }
})
vi.mock('../../hooks/useOperationCandidates', () => ({
  useOperationCandidates: () => ({ candidates: [], loading: false, error: '' }),
  operationCandidateValue: (candidate: any) => candidate.userId ? `user:${candidate.userId}` : `person:${candidate.personId}`,
  parseOperationCandidateValue: (value: string) => value.startsWith('user:') ? { userId: value.slice(5) } : value.startsWith('person:') ? { personId: value.slice(7) } : null,
}))

const detail = {
  event: { id: 'E1', parishId: 'parish-a', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING', visibility: 'INTERNAL', scopeUnitId: null, version: 4 },
  workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
  permissions: { 'operations.task.create': true, 'operations.task.assign': true, 'operations.event.manage': true },
} as unknown as OperationEventDetail

describe('extracted Operations forms', () => {
  beforeEach(() => {
    online = true
    creationOptions = null
    permissions = {}
    for (const mock of [createEvent, selectEvent, createStandaloneTask, createTask, assignTask, dispatchTask, updateEvent, fetchStore]) mock.mockReset().mockResolvedValue(undefined)
  })

  it('creates a Xu Doan event with scope and organizer without touching page state', async () => {
    creationOptions = {
      canCreateXuDoanEvent: true,
      xuDoanOrganizers: [{ userId: 'user-xdt', displayName: 'Trưởng Xứ đoàn', positionCode: 'PARISH_LEADER' }],
      units: [],
    }
    const onClose = vi.fn()
    render(<CreateEventForm initialScopeKind="XU_DOAN" initialScopeUnitId="" onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Tên sự kiện'), { target: { value: 'Sa mạc hè' } })
    fireEvent.change(screen.getByLabelText('Bắt đầu'), { target: { value: '2027-06-01T08:00' } })
    fireEvent.change(screen.getByLabelText('Kết thúc'), { target: { value: '2027-06-03T17:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))

    await waitFor(() => expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Sa mạc hè', eventScopeType: 'XU_DOAN', scopeUnitId: null, organizerUserId: 'user-xdt',
    }), expect.any(String)))
    expect(onClose).toHaveBeenCalled()
  })

  it('creates a standalone task scoped to the chosen unit', async () => {
    creationOptions = {
      canCreateXuDoanEvent: false, xuDoanOrganizers: [],
      units: [{ id: 'UNIT-1', name: 'Ban Truyền thông', unitType: 'COMMITTEE', canCreateEvent: false, canCreateTask: true, organizers: [], myRole: 'COMMITTEE_LEADER' }],
    }
    render(<StandaloneTaskForm initialScopeUnitId="UNIT-1" onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Tên công việc'), { target: { value: 'Cập nhật ảnh' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Task' }))

    await waitFor(() => expect(createStandaloneTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Cập nhật ảnh', scopeUnitId: 'UNIT-1',
    }), expect.any(String)))
  })

  it('creates an event task with the workstream scope attached', async () => {
    const eventDetail = {
      ...detail,
      workstreams: [{ id: 'W1', parishId: 'parish-a', operationEventId: 'E1', sourceUnitId: 'UNIT-9', name: 'Hậu cần', status: 'PLANNING', isRequired: false, version: 1 }],
    } as unknown as OperationEventDetail
    render(<EventTaskForm detail={eventDetail} />)
    fireEvent.change(screen.getByLabelText('Tên task'), { target: { value: 'Mua nước' } })
    fireEvent.change(screen.getByLabelText('Nhóm của công việc'), { target: { value: 'W1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo task' }))

    await waitFor(() => expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Mua nước', eventId: 'E1', workstreamId: 'W1', scopeUnitId: 'UNIT-9',
    }), expect.any(String)))
  })

  it('saves event edits with OCC version and a stable key', async () => {
    render(<EventEditForm detail={detail} />)
    fireEvent.change(screen.getByLabelText('Tên sự kiện'), { target: { value: 'Trại hè mới' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    await waitFor(() => expect(updateEvent).toHaveBeenCalledWith('E1', expect.objectContaining({
      version: 4, title: 'Trại hè mới',
    }), expect.any(String)))
  })

  it('assigns a contributor directly without a dispatch roundtrip', async () => {
    const taskDetail = {
      ...detail,
      tasks: [{ id: 'TSK-1', parishId: 'parish-a', operationEventId: 'E1', workstreamId: null, title: 'Chụp hình', status: 'TODO', priority: 'NORMAL', phase: 'PREPARATION', isRequired: false, version: 2 }],
    } as unknown as OperationEventDetail
    render(<TaskAssignForm detail={taskDetail} />)
    fireEvent.change(screen.getByLabelText('Task cần phân công'), { target: { value: 'TSK-1' } })
    expect(screen.getByLabelText('Người được phân công')).toBeInTheDocument()
  })
})
