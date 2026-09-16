import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { WorkstreamPanel } from '../../components/operations/WorkstreamPanel'
import { operationsApi, type OperationEventDetail } from '../../lib/api/operations'
vi.mock('../../lib/api/operations', () => ({ operationsApi: { getWorkstream: vi.fn(), createWorkstream: vi.fn(), updateWorkstream: vi.fn(), setWorkstreamReady: vi.fn(), updateWorkstreamMemberValidity: vi.fn(), addWorkstreamMember: vi.fn(), removeWorkstreamMember: vi.fn(), replaceWorkstreamLead: vi.fn() } }))
vi.mock('../../hooks/useOperationCandidates', () => ({
  useOperationCandidates: () => ({ candidates: [{ parishId: 'p', personId: 'person-1', userId: 'user-1', displayName: 'Thành viên Một', eligibility: 'ACTIONABLE', inResourceScope: true }], loading: false, error: '' }),
  operationCandidateValue: (candidate: any) => `person:${candidate.personId}`,
  parseOperationCandidateValue: (value: string) => value.startsWith('person:') ? { personId: value.slice(7) } : null,
}))
let scope = 'p:u'
vi.mock('../../lib/tenantScope', () => ({ getTenantScopeKey: () => scope }))
const group = { id: 'g', parishId: 'p', operationEventId: 'e', name: 'Phụng vụ', status: 'PLANNING', version: 4, isRequired: true }
const event = { event: { id: 'e', parishId: 'p', status: 'PLANNING' }, workstreams: [group], permissions: { 'operations.workstream.create': true } } as unknown as OperationEventDetail
beforeEach(() => { scope = 'p:u'; vi.resetAllMocks(); vi.mocked(operationsApi.getWorkstream).mockResolvedValue({ workstream: group, members: [], permissions: { 'operations.workstream.mark_ready': true } } as any) })
it('loads resource permissions and sends the current aggregate version', async () => {
  const refresh = vi.fn()
  render(<WorkstreamPanel event={event} enabled refresh={refresh} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  fireEvent.click(await screen.findByText('Nhóm đã sẵn sàng'))
  await waitFor(() => expect(operationsApi.setWorkstreamReady).toHaveBeenCalledWith('g', { version: 4, status: 'READY' }, expect.any(String)))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})
it('blocks offline reads and hides mutation forms', () => {
  render(<WorkstreamPanel event={event} enabled={false} refresh={vi.fn()} />)
  expect(screen.getByText('Phụng vụ · Bắt buộc')).toBeDisabled()
  expect(screen.queryByText('Tạo nhóm')).not.toBeInTheDocument()
})
it('discards a late detail response after an account switch', async () => {
  let resolve!: (value: any) => void
  vi.mocked(operationsApi.getWorkstream).mockReturnValue(new Promise(done => { resolve = done }))
  render(<WorkstreamPanel event={event} enabled refresh={vi.fn()} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  scope = 'p:other'
  resolve({ workstream: group, members: [], permissions: { 'operations.workstream.mark_ready': true } })
  await waitFor(() => expect(operationsApi.getWorkstream).toHaveBeenCalled())
  expect(screen.queryByText('Nhóm đã sẵn sàng')).not.toBeInTheDocument()
})
it('discards stale command controls on conflict without refreshing or replaying', async () => {
  vi.mocked(operationsApi.setWorkstreamReady).mockRejectedValue(new Error('VERSION_CONFLICT'))
  const refresh = vi.fn()
  render(<WorkstreamPanel event={event} enabled refresh={refresh} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  fireEvent.click(await screen.findByText('Nhóm đã sẵn sàng'))
  expect(await screen.findByRole('alert')).toHaveTextContent('VERSION_CONFLICT')
  expect(screen.queryByText('Nhóm đã sẵn sàng')).not.toBeInTheDocument()
  expect(refresh).not.toHaveBeenCalled()
  expect(operationsApi.setWorkstreamReady).toHaveBeenCalledTimes(1)
})
it('does not offer readiness controls without resource permission', async () => {
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({ workstream: group, members: [], permissions: {} } as any)
  render(<WorkstreamPanel event={event} enabled refresh={vi.fn()} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  await screen.findByText('Tải lại nhóm')
  expect(screen.queryByText('Nhóm đã sẵn sàng')).not.toBeInTheDocument()
})

it('updates membership validity with both current versions and a reason', async () => {
  const member = { id: 'member-1', parishId: 'p', workstreamId: 'g', personId: 'person-1', userId: null, operationRole: 'OBSERVER', startsAt: null, endsAt: null, version: 2 }
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({ workstream: group, members: [member], permissions: { 'operations.workstream.manage': true } } as any)
  vi.mocked(operationsApi.updateWorkstreamMemberValidity).mockResolvedValue({ member: { ...member, version: 3 }, workstreamVersion: 5 } as any)
  const refresh = vi.fn()
  render(<WorkstreamPanel event={event} enabled refresh={refresh} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  await screen.findByText(/Thành viên Một · Theo dõi/)
  // W3.5 (U-16): labels are member display names, not raw ids.
  fireEvent.change(screen.getByLabelText('Bắt đầu vai trò của Thành viên Một'), { target: { value: '2026-12-01T08:00' } })
  fireEvent.change(screen.getByLabelText('Kết thúc vai trò của Thành viên Một'), { target: { value: '2026-12-31T17:00' } })
  fireEvent.change(screen.getByLabelText('Lý do đổi thời hạn vai trò của Thành viên Một'), { target: { value: 'Phân công tháng 12' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thời hạn' }))
  await waitFor(() => expect(operationsApi.updateWorkstreamMemberValidity).toHaveBeenCalledWith('g', 'member-1', {
    version: 4,
    memberVersion: 2,
    startsAt: new Date('2026-12-01T08:00').toISOString(),
    endsAt: new Date('2026-12-31T17:00').toISOString(),
    reason: 'Phân công tháng 12',
  }, expect.any(String)))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})

it('offers only the atomic lead handover while the event is LIVE', async () => {
  const liveGroup = { ...group, version: 7 }
  const currentLead = { id: 'lead-1', parishId: 'p', workstreamId: 'g', personId: null, userId: 'user-current', operationRole: 'WORKSTREAM_LEAD', startsAt: null, endsAt: null, version: 3 }
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({ workstream: liveGroup, members: [currentLead], permissions: { 'operations.workstream.assign_lead': true, 'operations.workstream.manage': true } } as any)
  vi.mocked(operationsApi.replaceWorkstreamLead).mockResolvedValue({ previousLead: { ...currentLead, version: 4 }, newLead: { ...currentLead, id: 'lead-2', userId: null, personId: 'person-1', version: 1 }, workstreamVersion: 8 } as any)
  const liveEvent = { ...event, event: { ...event.event, status: 'LIVE' }, workstreams: [liveGroup] } as OperationEventDetail
  const refresh = vi.fn()
  render(<WorkstreamPanel event={liveEvent} enabled refresh={refresh} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  await screen.findByText('Bàn giao Trưởng nhóm đang trực')
  expect(screen.queryByText('Phân công vào nhóm')).not.toBeInTheDocument()
  expect(screen.queryByText('Thu hồi vai trò')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Trưởng nhóm mới'), { target: { value: 'person:person-1' } })
  fireEvent.change(screen.getByLabelText('Lý do bàn giao Trưởng nhóm'), { target: { value: 'Đổi ca trực' } })
  fireEvent.click(screen.getByRole('button', { name: 'Bàn giao ngay' }))
  await waitFor(() => expect(operationsApi.replaceWorkstreamLead).toHaveBeenCalledWith('g', {
    version: 7,
    currentLeadMemberId: 'lead-1',
    currentLeadMemberVersion: 3,
    personId: 'person-1',
    reason: 'Đổi ca trực',
  }, expect.any(String)))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})

it('W2.5: saves group rename/description through PUT with OCC version and a stable key', async () => {
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({ workstream: group, members: [], permissions: { 'operations.workstream.manage': true } } as any)
  vi.mocked(operationsApi.updateWorkstream).mockResolvedValue({ ...group, name: 'Phụng Vụ Thánh', description: 'Lưu ý áo lễ', isRequired: false, version: 5 } as any)
  const refresh = vi.fn()
  render(<WorkstreamPanel event={event} enabled refresh={refresh} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  fireEvent.click(await screen.findByRole('button', { name: 'Sửa nhóm' }))
  fireEvent.change(screen.getByLabelText('Tên mảng mới'), { target: { value: 'Phụng Vụ Thánh' } })
  fireEvent.change(screen.getByLabelText('Mô tả nhóm'), { target: { value: 'Lưu ý áo lễ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
  await waitFor(() => expect(operationsApi.updateWorkstream).toHaveBeenCalledWith('g', expect.objectContaining({
    // isRequired prefills from the stored group (true here).
    version: 4, name: 'Phụng Vụ Thánh', description: 'Lưu ý áo lễ', isRequired: true,
  }), expect.any(String)))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})

it('P1-9: keeps destructive reason drafts scoped to their own command', async () => {
  const member = { id: 'member-1', parishId: 'p', workstreamId: 'g', personId: 'person-1', userId: null, operationRole: 'OBSERVER', startsAt: null, endsAt: null, version: 2 }
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({ workstream: group, members: [member], permissions: { 'operations.workstream.manage': true, 'operations.workstream.mark_ready': true } } as any)
  render(<WorkstreamPanel event={event} enabled refresh={vi.fn()} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  const removeButton = await screen.findByRole('button', { name: 'Thu hồi vai trò' })
  const blockedButton = await screen.findByRole('button', { name: 'Báo nhóm bị chặn' })
  expect(removeButton).toBeDisabled()
  expect(blockedButton).toBeDisabled()
  // A reason typed for member removal must not satisfy the blocked-report gate.
  fireEvent.change(screen.getByLabelText('Lý do thu hồi vai trò của Thành viên Một'), { target: { value: 'Hết phân công' } })
  expect(removeButton).toBeEnabled()
  expect(blockedButton).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Lý do báo nhóm bị chặn'), { target: { value: 'Thiếu người' } })
  expect(blockedButton).toBeEnabled()
})
