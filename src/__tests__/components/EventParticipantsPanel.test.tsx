import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { EventParticipantsPanel } from '../../components/operations/EventParticipantsPanel'
import { operationsApi, type OperationEventDetail } from '../../lib/api/operations'

vi.mock('../../lib/api/operations', () => ({
  operationsApi: { getEventHeadcount: vi.fn(), addEventParticipant: vi.fn(), setEventParticipantStatus: vi.fn() },
}))
vi.mock('../../hooks/useOperationCandidates', () => ({
  useOperationCandidates: () => ({
    candidates: [
      { parishId: 'p', personId: 'person-1', userId: 'user-1', displayName: 'Anh Phêrô', eligibility: 'ACTIONABLE', inResourceScope: true },
      { parishId: 'p', personId: 'person-2', userId: null, displayName: 'Ông Gioan', eligibility: 'PLANNING_ONLY', inResourceScope: true },
    ],
    loading: false, error: '',
  }),
  operationCandidateValue: (candidate: any) => candidate.personId ? `person:${candidate.personId}` : `user:${candidate.userId}`,
  parseOperationCandidateValue: (value: string) => value.startsWith('person:') ? { personId: value.slice(7) } : value.startsWith('user:') ? { userId: value.slice(5) } : null,
}))
let scope = 'p:u'
vi.mock('../../lib/tenantScope', () => ({ getTenantScopeKey: () => scope }))

const participants = [
  { id: 'OPP-1', parishId: 'p', eventId: 'e', userId: 'user-1', personId: null, participantRole: 'HẬU CẦN', attendanceStatus: 'PLANNED', version: 3, createdAt: '2026-09-01T00:00:00Z' },
  { id: 'OPP-2', parishId: 'p', eventId: 'e', userId: null, personId: 'person-2', participantRole: 'ATTENDEE', attendanceStatus: 'CONFIRMED', version: 1, createdAt: '2026-09-01T00:00:00Z' },
]
const detail = (permissions: Record<string, boolean>, status = 'PLANNING') => ({
  event: { id: 'e', parishId: 'p', status },
  participants,
  permissions,
} as unknown as OperationEventDetail)

beforeEach(() => {
  scope = 'p:u'
  vi.resetAllMocks()
  vi.mocked(operationsApi.getEventHeadcount).mockResolvedValue({ expected: 50, total: 2, confirmed: 1, attended: 0 })
  vi.mocked(operationsApi.addEventParticipant).mockResolvedValue(participants[0] as any)
  vi.mocked(operationsApi.setEventParticipantStatus).mockResolvedValue(participants[0] as any)
})

it('W4.2a: lists participants with resolved names, roles and the headcount rollup', async () => {
  render(<EventParticipantsPanel detail={detail({ 'operations.event.manage': true })} enabled refresh={vi.fn()} />)
  // Names appear both in the list rows and in the candidate picker options,
  // so assert presence (>=1) rather than uniqueness for the name itself.
  expect((await screen.findAllByText(/Anh Phêrô/)).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/Ông Gioan/).length).toBeGreaterThan(0)
  expect(screen.getByText(/HẬU CẦN/)).toBeInTheDocument()
  // Status badges are spans; <option>s carry the same vocabulary in the
  // status selects, so scope to span to prove the rendered badge.
  expect(screen.getAllByText('Dự kiến', { selector: 'span' }).length).toBeGreaterThan(0)
  await waitFor(() => expect(screen.getByText(/Dự kiến 50 · Tổng 2 · Xác nhận 1 · Tham dự 0/)).toBeInTheDocument())
})

it('W4.2a: adds a participant with role and OCC-free stable idempotency key, then refreshes', async () => {
  const refresh = vi.fn()
  render(<EventParticipantsPanel detail={detail({ 'operations.event.manage': true })} enabled refresh={refresh} />)
  fireEvent.change(await screen.findByLabelText('Chọn người tham dự'), { target: { value: 'person:person-2' } })
  fireEvent.change(screen.getByLabelText('Vai trò người tham dự'), { target: { value: 'TRANG TRÍ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm' }))
  await waitFor(() => expect(operationsApi.addEventParticipant).toHaveBeenCalledWith('e', { personId: 'person-2', participantRole: 'TRANG TRÍ' }, expect.any(String)))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})

it('W4.2a: changes attendance status with the participant own version', async () => {
  const refresh = vi.fn()
  render(<EventParticipantsPanel detail={detail({ 'operations.event.manage': true })} enabled refresh={refresh} />)
  const select = await screen.findByLabelText('Trạng thái tham dự của Anh Phêrô')
  fireEvent.change(select, { target: { value: 'CONFIRMED' } })
  await waitFor(() => expect(operationsApi.setEventParticipantStatus).toHaveBeenCalledWith('e', 'OPP-1', { version: 3, status: 'CONFIRMED' }, expect.any(String)))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})

it('W4.2a: hides add and status controls without event.manage (list stays visible)', async () => {
  render(<EventParticipantsPanel detail={detail({})} enabled refresh={vi.fn()} />)
  expect(await screen.findByText(/Anh Phêrô/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Chọn người tham dự')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Trạng thái tham dự của Anh Phêrô')).not.toBeInTheDocument()
})

it('W4.2a: keeps the list read-only once the event is closed', async () => {
  render(<EventParticipantsPanel detail={detail({ 'operations.event.manage': true }, 'COMPLETED')} enabled refresh={vi.fn()} />)
  expect(await screen.findByText(/Anh Phêrô/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Chọn người tham dự')).not.toBeInTheDocument()
})

it('W4.2a: offline never offers mutation controls (enabled=false gate)', async () => {
  render(<EventParticipantsPanel detail={detail({ 'operations.event.manage': true })} enabled={false} refresh={vi.fn()} />)
  expect(await screen.findByText(/Ông Gioan/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Thêm' })).not.toBeInTheDocument()
})
