import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { StandaloneWorkstreamsPanel } from '../../components/operations/StandaloneWorkstreamsPanel'
import { operationsApi } from '../../lib/api/operations'

vi.mock('../../lib/api/operations', () => ({
  operationsApi: {
    getAssignableUnits: vi.fn(),
    getStandaloneWorkstreams: vi.fn(),
    createWorkstream: vi.fn(),
    getWorkstream: vi.fn(),
    getWorkstreamTasks: vi.fn(),
    addWorkstreamMember: vi.fn(),
    createTask: vi.fn(),
    assignTask: vi.fn(),
  },
}))
vi.mock('../../hooks/useOperationCandidates', () => ({
  useOperationCandidates: () => ({ candidates: [{ parishId: 'p', personId: 'person-1', userId: 'user-1', displayName: 'Thành viên Một', eligibility: 'ACTIONABLE', inResourceScope: true }], loading: false, error: '' }),
  operationCandidateValue: (candidate: any) => `person:${candidate.personId}`,
  parseOperationCandidateValue: (value: string) => value.startsWith('person:') ? { personId: value.slice(7) } : null,
}))
let scope = { parishId: 'p', userId: 'manager' }
vi.mock('../../lib/tenantScope', () => ({
  getTenantScope: () => scope,
  getTenantScopeKey: () => `${scope.parishId}:${scope.userId}`,
}))

const page = (data: any[]) => ({ success: true as const, data, error: null, meta: { page: 1, limit: 500, total: data.length, totalPages: data.length ? 1 : 0 } })
const group = { id: 'group-1', parishId: 'p', operationEventId: null, sourceUnitId: 'branch-1', name: 'Nhóm thường trực', status: 'PLANNING', isRequired: false, version: 1 }
const permissions = { 'operations.workstream.manage': true, 'operations.workstream.assign_lead': true, 'operations.task.create': true, 'operations.task.assign': true }

beforeEach(() => {
  scope = { parishId: 'p', userId: 'manager' }
  vi.resetAllMocks()
  let version = 1
  let members: any[] = []
  let tasks: any[] = []
  vi.mocked(operationsApi.getAssignableUnits).mockResolvedValue(page([{ id: 'branch-1', parishId: 'p', parentId: null, name: 'Ngành Thiếu', unitType: 'BRANCH' }]))
  vi.mocked(operationsApi.getStandaloneWorkstreams).mockResolvedValue(page([]))
  vi.mocked(operationsApi.createWorkstream).mockResolvedValue(group as any)
  vi.mocked(operationsApi.getWorkstream).mockImplementation(async () => ({ workstream: { ...group, version }, members, permissions } as any))
  vi.mocked(operationsApi.getWorkstreamTasks).mockImplementation(async () => page(tasks) as any)
  vi.mocked(operationsApi.addWorkstreamMember).mockImplementation(async () => {
    version = 2
    members = [{ id: 'member-1', parishId: 'p', workstreamId: 'group-1', personId: 'person-1', userId: null, operationRole: 'OBSERVER', startsAt: null, endsAt: null, version: 1 }]
    return { ...members[0], workstreamVersion: 2 } as any
  })
  vi.mocked(operationsApi.createTask).mockImplementation(async () => {
    const task = { id: 'task-1', parishId: 'p', operationEventId: null, workstreamId: 'group-1', title: 'Kiểm kê dụng cụ', phase: 'PREPARATION', status: 'BACKLOG', priority: 'NORMAL', isRequired: false, version: 1 }
    tasks = [task]
    return task as any
  })
  vi.mocked(operationsApi.assignTask).mockResolvedValue({ assignment: {}, taskVersion: 2, conflictWarnings: [{ id: 'busy-1', startsAt: '2027-01-01T08:00:00Z', endsAt: '2027-01-01T09:00:00Z' }] } as any)
})

it('creates a scoped standalone group, adds a member, creates a task and assigns it', async () => {
  render(<StandaloneWorkstreamsPanel enabled />)
  await screen.findByText('Chưa có nhóm độc lập trong phạm vi của bạn.')
  fireEvent.change(screen.getByLabelText('Tên nhóm độc lập'), { target: { value: 'Nhóm thường trực' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tạo nhóm' }))
  await waitFor(() => expect(operationsApi.createWorkstream).toHaveBeenCalledWith({ eventId: null, sourceUnitId: 'branch-1', name: 'Nhóm thường trực', isRequired: false }, expect.any(String)))
  await screen.findByRole('heading', { name: 'Nhóm thường trực' })

  fireEvent.change(screen.getByLabelText('Thành viên nhóm độc lập'), { target: { value: 'person:person-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm vào nhóm' }))
  await waitFor(() => expect(operationsApi.addWorkstreamMember).toHaveBeenCalledWith('group-1', { version: 1, personId: 'person-1', operationRole: 'OBSERVER' }, expect.any(String)))
  await screen.findByText('Thành viên Một · Theo dõi')

  fireEvent.change(screen.getByLabelText('Tên việc của nhóm độc lập'), { target: { value: 'Kiểm kê dụng cụ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tạo việc' }))
  await waitFor(() => expect(operationsApi.createTask).toHaveBeenCalledWith({ title: 'Kiểm kê dụng cụ', eventId: null, workstreamId: 'group-1', dueAt: null }, expect.any(String)))
  await screen.findByRole('option', { name: 'Kiểm kê dụng cụ' })

  fireEvent.change(screen.getByLabelText('Người nhận việc nhóm độc lập'), { target: { value: 'person:person-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Giao việc' }))
  await waitFor(() => expect(operationsApi.assignTask).toHaveBeenCalledWith('task-1', { version: 1, personId: 'person-1', assignmentRole: 'OWNER' }, expect.any(String)))
  const warning = (await screen.findByText(/Lý do bận được giữ riêng tư/)).closest('[role="status"]')
  expect(warning).toHaveTextContent('Lý do bận được giữ riêng tư')
  expect(warning).not.toHaveTextContent('Private appointment')
})

it('discards late overview data after an account switch', async () => {
  let resolve!: (value: any) => void
  vi.mocked(operationsApi.getStandaloneWorkstreams).mockReturnValue(new Promise(done => { resolve = done }))
  render(<StandaloneWorkstreamsPanel enabled />)
  scope = { parishId: 'p', userId: 'other' }
  resolve(page([group]))
  await waitFor(() => expect(operationsApi.getStandaloneWorkstreams).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: 'Nhóm thường trực' })).not.toBeInTheDocument()
})
