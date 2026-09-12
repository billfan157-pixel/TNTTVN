import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { EventRetrospectivePanel } from '../../components/operations/EventRetrospectivePanel'
import { operationsApi, type OperationEventDetail } from '../../lib/api/operations'

vi.mock('../../lib/api/operations', () => ({
  operationsApi: {
    saveEventRetrospective: vi.fn(),
    createEventFollowUp: vi.fn(),
  },
}))
vi.mock('../../hooks/useOperationCandidates', () => ({
  useOperationCandidates: () => ({
    candidates: [
      { parishId: 'p', personId: 'person-1', userId: 'user-1', displayName: 'Thành viên Một', eligibility: 'ACTIONABLE', inResourceScope: true },
      { parishId: 'p', personId: 'person-2', userId: null, displayName: 'Chưa có tài khoản', eligibility: 'PLANNING_ONLY', inResourceScope: true },
    ],
    loading: false,
    error: '',
  }),
  operationCandidateValue: (candidate: any) => `person:${candidate.personId}`,
  parseOperationCandidateValue: (value: string) => value.startsWith('person:') ? { personId: value.slice(7) } : null,
}))
let scope = 'p:manager'
vi.mock('../../lib/tenantScope', () => ({ getTenantScopeKey: () => scope }))

const detail: OperationEventDetail = {
  event: { id: 'event-1', parishId: 'p', title: 'Trại hè', eventType: 'CAMP', startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T03:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'COMPLETED', visibility: 'INTERNAL', outcomeSummary: 'Đã hoàn tất an toàn.', version: 5 },
  retrospective: null,
  workstreams: [], tasks: [], assignees: [], readiness: { percent: 100, blockers: [] },
  permissions: { 'operations.event.manage': true, 'operations.task.create': true, 'operations.task.assign': true },
}

beforeEach(() => {
  scope = 'p:manager'
  vi.resetAllMocks()
  vi.mocked(operationsApi.saveEventRetrospective).mockResolvedValue({ parishId: 'p', eventId: 'event-1', lessonsLearned: 'Phân công sớm.', improvementNotes: null, version: 1, createdBy: 'manager', updatedBy: 'manager', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' })
  vi.mocked(operationsApi.createEventFollowUp).mockResolvedValue({ task: {} as any, assignment: {} as any, eventVersion: 6, conflictWarnings: [{ id: 'busy-1', startsAt: '2026-10-05T01:00:00Z', endsAt: '2026-10-05T02:00:00Z' }] })
})

it('does not permit writing an evaluation before completion even with manager capability', () => {
  render(<EventRetrospectivePanel detail={{ ...detail, event: { ...detail.event, status: 'LIVE' } }} enabled refresh={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Lưu hậu kiểm' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Tạo và giao follow-up' })).not.toBeInTheDocument()
  expect(operationsApi.saveEventRetrospective).not.toHaveBeenCalled()
})

it('saves structured lessons and creates one atomic follow-up with an actionable owner', async () => {
  const refresh = vi.fn().mockResolvedValue(undefined)
  render(<StrictMode><EventRetrospectivePanel detail={detail} enabled refresh={refresh} /></StrictMode>)
  expect(screen.getByText('Đã hoàn tất an toàn.')).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Chưa có tài khoản' })).not.toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Bài học rút ra'), { target: { value: 'Phân công sớm.' } })
  fireEvent.change(screen.getByLabelText('Điểm cần cải thiện'), { target: { value: 'Chốt vật dụng trước ba ngày.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu hậu kiểm' }))
  await waitFor(() => expect(operationsApi.saveEventRetrospective).toHaveBeenCalledWith('event-1', { expectedVersion: null, lessonsLearned: 'Phân công sớm.', improvementNotes: 'Chốt vật dụng trước ba ngày.' }, expect.any(String)))

  fireEvent.change(screen.getByLabelText('Tên follow-up'), { target: { value: 'Chuẩn hóa checklist' } })
  fireEvent.change(screen.getByLabelText('Hạn follow-up'), { target: { value: '2026-10-05T08:00' } })
  fireEvent.change(screen.getByLabelText('Người phụ trách follow-up'), { target: { value: 'person:person-1' } })
  fireEvent.change(screen.getByLabelText('Mức ưu tiên follow-up'), { target: { value: 'HIGH' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tạo và giao follow-up' }))
  await waitFor(() => expect(operationsApi.createEventFollowUp).toHaveBeenCalledWith('event-1', expect.objectContaining({ eventVersion: 5, title: 'Chuẩn hóa checklist', personId: 'person-1', priority: 'HIGH' }), expect.any(String)))
  const warning = await screen.findByText(/Lý do bận được giữ riêng tư/)
  expect(warning.closest('[role="status"]')).not.toHaveTextContent('Lịch khám riêng')
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('discards a late retrospective response after the account scope changes', async () => {
  let resolve!: (value: any) => void
  vi.mocked(operationsApi.saveEventRetrospective).mockReturnValue(new Promise(done => { resolve = done }))
  const refresh = vi.fn()
  render(<EventRetrospectivePanel detail={detail} enabled refresh={refresh} />)
  fireEvent.change(screen.getByLabelText('Bài học rút ra'), { target: { value: 'Không được ghi sang phiên mới.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu hậu kiểm' }))
  scope = 'p:other'
  resolve({})
  await waitFor(() => expect(operationsApi.saveEventRetrospective).toHaveBeenCalled())
  expect(refresh).not.toHaveBeenCalled()
  expect(screen.queryByText('Đã lưu hậu kiểm.')).not.toBeInTheDocument()
})

it('coalesces rapid double submit before React can render the disabled state', async () => {
  let resolve!: (value: any) => void
  vi.mocked(operationsApi.saveEventRetrospective).mockReturnValue(new Promise(done => { resolve = done }))
  render(<EventRetrospectivePanel detail={detail} enabled refresh={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Bài học rút ra'), { target: { value: 'Một lần ghi.' } })
  const submit = screen.getByRole('button', { name: 'Lưu hậu kiểm' })
  fireEvent.click(submit)
  fireEvent.click(submit)
  expect(operationsApi.saveEventRetrospective).toHaveBeenCalledTimes(1)
  resolve({})
  await waitFor(() => expect(submit).toBeEnabled())
})
