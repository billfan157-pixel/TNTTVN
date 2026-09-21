import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { WorkstreamPanel } from '../../components/operations/WorkstreamPanel'
import { operationsApi, type OperationEventDetail } from '../../lib/api/operations'
vi.mock('../../lib/api/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api/operations')>()
  return {
    ...actual,
    operationsApi: {
      getWorkstream: vi.fn(),
      createWorkstream: vi.fn(),
      updateWorkstream: vi.fn(),
      setWorkstreamReady: vi.fn(),
      updateWorkstreamMemberValidity: vi.fn(),
      addWorkstreamMember: vi.fn(),
      removeWorkstreamMember: vi.fn(),
      replaceWorkstreamLead: vi.fn(),
      deleteWorkstream: vi.fn(),
    },
  }
})
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
  fireEvent.click(await screen.findByText('Mảng đã sẵn sàng'))
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
  expect(screen.queryByText('Mảng đã sẵn sàng')).not.toBeInTheDocument()
})
it('discards stale command controls on conflict without refreshing or replaying', async () => {
  vi.mocked(operationsApi.setWorkstreamReady).mockRejectedValue(new Error('VERSION_CONFLICT'))
  const refresh = vi.fn()
  render(<WorkstreamPanel event={event} enabled refresh={refresh} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  fireEvent.click(await screen.findByText('Mảng đã sẵn sàng'))
  expect(await screen.findByRole('alert')).toHaveTextContent('VERSION_CONFLICT')
  expect(screen.queryByText('Mảng đã sẵn sàng')).not.toBeInTheDocument()
  expect(refresh).not.toHaveBeenCalled()
  expect(operationsApi.setWorkstreamReady).toHaveBeenCalledTimes(1)
})
it('does not offer readiness controls without resource permission', async () => {
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({ workstream: group, members: [], permissions: {} } as any)
  render(<WorkstreamPanel event={event} enabled refresh={vi.fn()} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  await screen.findByText('Tải lại Mảng')
  expect(screen.queryByText('Mảng đã sẵn sàng')).not.toBeInTheDocument()
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
  await screen.findByText('Bàn giao Trưởng Mảng đang trực')
  expect(screen.queryByText('Phân công vào Mảng')).not.toBeInTheDocument()
  expect(screen.queryByText('Thu hồi vai trò')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Trưởng Mảng mới'), { target: { value: 'person:person-1' } })
  fireEvent.change(screen.getByLabelText('Lý do bàn giao Trưởng Mảng'), { target: { value: 'Đổi ca trực' } })
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
  fireEvent.click(await screen.findByRole('button', { name: 'Sửa Mảng' }))
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
  const blockedButton = await screen.findByRole('button', { name: 'Báo Mảng bị chặn' })
  expect(removeButton).toBeDisabled()
  expect(blockedButton).toBeDisabled()
  // A reason typed for member removal must not satisfy the blocked-report gate.
  fireEvent.change(screen.getByLabelText('Lý do thu hồi vai trò của Thành viên Một'), { target: { value: 'Hết phân công' } })
  expect(removeButton).toBeEnabled()
  expect(blockedButton).toBeDisabled()
  // A reason typed for member removal must not satisfy the blocked-report gate.
  fireEvent.change(screen.getByLabelText('Lý do báo Mảng bị chặn'), { target: { value: 'Thiếu người' } })
  expect(blockedButton).toBeEnabled()
})

it('U-21: Trưởng Xứ đoàn bổ nhiệm Trưởng Mảng ngoài LIVE bằng OCC + lý do, currentLead null', async () => {
  const planningGroup = { ...group, version: 5 }
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({ workstream: planningGroup, members: [], permissions: { 'operations.workstream.assign_lead': true } } as any)
  vi.mocked(operationsApi.replaceWorkstreamLead).mockResolvedValue({
    previousLead: null,
    newLead: { id: 'lead-new', parishId: 'p', workstreamId: 'g', userId: null, personId: 'person-1', operationRole: 'WORKSTREAM_LEAD', startsAt: null, endsAt: null, version: 1 },
    workstreamVersion: 6,
  } as any)
  const refresh = vi.fn()
  render(<WorkstreamPanel event={{ ...event, workstreams: [planningGroup] } as OperationEventDetail} enabled refresh={refresh} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  await screen.findByText('Bổ nhiệm Trưởng Mảng')
  fireEvent.change(screen.getByLabelText('Trưởng Mảng mới'), { target: { value: 'person:person-1' } })
  fireEvent.change(screen.getByLabelText('Lý do bổ nhiệm Trưởng Mảng'), { target: { value: 'Nhận Mảng phụng vụ' } })
  // Guard against silent no-op clicks: the submit gate must be satisfied.
  const appointButton = screen.getByRole('button', { name: 'Bổ nhiệm ngay' })
  await waitFor(() => expect(appointButton).toBeEnabled())
  fireEvent.click(appointButton)
  await waitFor(() => expect(operationsApi.replaceWorkstreamLead).toHaveBeenCalledWith('g', {
    version: 5,
    currentLeadMemberId: null,
    currentLeadMemberVersion: null,
    personId: 'person-1',
    reason: 'Nhận Mảng phụng vụ',
  }, expect.any(String)))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})

it('defaults Field Lead to active Unit Leader and hides manual appointment form by default', async () => {
  const unitGroup = { ...group, sourceUnitId: 'unit-1', version: 3 }
  const fieldUnits = [{
    id: 'unit-1',
    name: 'Ban Phụng Vụ',
    unitType: 'COMMITTEE' as const,
    organizers: [{ userId: 'leader-u', displayName: 'Trưởng Ban Phụng Vụ', positionCode: 'COMMITTEE_LEADER' }],
  }]
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({
    workstream: unitGroup,
    members: [],
    permissions: { 'operations.workstream.assign_lead': true },
  } as any)
  const refresh = vi.fn()
  render(<WorkstreamPanel event={{ ...event, workstreams: [unitGroup] } as OperationEventDetail} enabled refresh={refresh} fieldUnits={fieldUnits} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  // Leader card is displayed with default badge
  await screen.findByText('Trưởng Ban Phụng Vụ')
  expect(screen.getByText('Mặc định theo Ban/Ngành')).toBeInTheDocument()
  // Manual appointment form is NOT shown by default
  expect(screen.queryByLabelText('Lý do bổ nhiệm Trưởng Mảng')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Bổ nhiệm ngay' })).not.toBeInTheDocument()

  // Clicking "Bàn giao / Đổi Trưởng Mảng" reveals the form
  fireEvent.click(screen.getByRole('button', { name: 'Bàn giao / Đổi Trưởng Mảng' }))
  expect(await screen.findByLabelText('Lý do bổ nhiệm Trưởng Mảng')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Bổ nhiệm ngay' })).toBeInTheDocument()

  // Clicking "Hủy đổi" collapses the form back down
  fireEvent.click(screen.getByRole('button', { name: 'Hủy đổi' }))
  expect(screen.queryByLabelText('Lý do bổ nhiệm Trưởng Mảng')).not.toBeInTheDocument()
})

it('sends autoAssignLeader: true when creating a new workstream', async () => {
  const fieldUnits = [{
    id: 'unit-1',
    name: 'Ban Phụng Vụ',
    unitType: 'COMMITTEE' as const,
    organizers: [{ userId: 'leader-u', displayName: 'Trưởng Ban Phụng Vụ', positionCode: 'COMMITTEE_LEADER' }],
  }]
  vi.mocked(operationsApi.createWorkstream).mockResolvedValue({ id: 'new-ws', name: 'Mảng Kỹ thuật' } as any)
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({
    workstream: { id: 'new-ws', parishId: 'p', operationEventId: 'e', name: 'Mảng Kỹ thuật', status: 'PLANNING', version: 1, isRequired: false },
    members: [],
    permissions: {},
  } as any)
  const refresh = vi.fn()
  render(<WorkstreamPanel event={event} enabled refresh={refresh} fieldUnits={fieldUnits} />)
  fireEvent.click(screen.getByRole('button', { name: '+ Thêm Mảng & Giao Ban/Ngành' }))
  fireEvent.change(screen.getByLabelText('Tên mảng phụ trách'), { target: { value: 'Mảng Kỹ thuật' } })
  fireEvent.change(screen.getByLabelText('Ban/Ngành phụ trách mảng'), { target: { value: 'unit-1' } })
  // Preview banner for default leader is visible
  expect(screen.getByText(/Trưởng Mảng mặc định:/)).toBeInTheDocument()
  expect(screen.getByText(/Trưởng Ban Phụng Vụ/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Tạo & Giao Mảng' }))
  await waitFor(() => expect(operationsApi.createWorkstream).toHaveBeenCalledWith({
    eventId: 'e',
    sourceUnitId: 'unit-1',
    name: 'Mảng Kỹ thuật',
    isRequired: false,
    autoAssignLeader: true,
  }, expect.any(String)))
})

it('deletes workstream cleanly when empty after user confirmation', async () => {
  const ws = { id: 'ws-del', parishId: 'p', operationEventId: 'e', name: 'Mảng Âm Thanh', status: 'PLANNING', version: 2, isRequired: false }
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({
    workstream: ws,
    members: [],
    permissions: { 'operations.workstream.manage': true },
  } as any)
  vi.mocked(operationsApi.deleteWorkstream).mockResolvedValue({ id: 'ws-del', parishId: 'p', deletedAt: new Date().toISOString() } as any)
  const refresh = vi.fn()
  render(<WorkstreamPanel event={{ ...event, workstreams: [ws], tasks: [] } as any} enabled refresh={refresh} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mảng Âm Thanh' }))

  // Click "Xóa Mảng"
  const deleteBtn = await screen.findByRole('button', { name: 'Xóa Mảng' })
  fireEvent.click(deleteBtn)

  // Confirmation box appears
  expect(screen.getByText(/Xác nhận xóa Mảng "Mảng Âm Thanh"\?/)).toBeInTheDocument()

  // Confirm delete
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa Mảng' }))

  await waitFor(() => expect(operationsApi.deleteWorkstream).toHaveBeenCalledWith(
    'ws-del',
    { version: 2, reason: 'Xóa Mảng Mảng Âm Thanh' },
    expect.any(String)
  ))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})

it('blocks deleting workstream when it contains active tasks', async () => {
  const ws = { id: 'ws-del', parishId: 'p', operationEventId: 'e', name: 'Mảng Âm Thanh', status: 'PLANNING', version: 2, isRequired: false }
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({
    workstream: ws,
    members: [],
    permissions: { 'operations.workstream.manage': true },
  } as any)
  const refresh = vi.fn()
  render(<WorkstreamPanel event={{
    ...event,
    workstreams: [ws],
    tasks: [{ id: 'task-1', workstreamId: 'ws-del', title: 'Lắp loa', status: 'TODO' }],
  } as any} enabled refresh={refresh} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mảng Âm Thanh' }))

  // Click "Xóa Mảng"
  const deleteBtn = await screen.findByRole('button', { name: 'Xóa Mảng' })
  fireEvent.click(deleteBtn)

  // Block alert appears
  expect(screen.getByText(/Không thể xóa Mảng "Mảng Âm Thanh"/)).toBeInTheDocument()
  expect(screen.getByText(/hiện đang có/)).toBeInTheDocument()
  expect(operationsApi.deleteWorkstream).not.toHaveBeenCalled()
})
