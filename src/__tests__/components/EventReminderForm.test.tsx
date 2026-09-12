import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { EventReminderForm } from '../../components/operations/EventReminderForm'
import { operationsApi, type OperationEventDetail, type OperationTaskDetail } from '../../lib/api/operations'
vi.mock('../../lib/api/operations', () => ({ operationsApi: { createReminder: vi.fn(), getResourceReminders: vi.fn(), rescheduleReminder: vi.fn(), cancelReminder: vi.fn() } }))
vi.mock('../../lib/tenantScope', () => ({ getTenantScopeKey: () => 'p:u' }))
vi.mock('../../hooks/useOperationCandidates', () => ({ useOperationCandidates: () => ({ candidates: [{ parishId: 'p', personId: 'person', userId: 'u', displayName: 'Người nhận', eligibility: 'ACTIONABLE', inResourceScope: true }], loading: false, error: '' }) }))
const event = { event: { id: 'e', parishId: 'p', status: 'PLANNING' }, permissions: { 'operations.event.manage': true } } as unknown as OperationEventDetail
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(operationsApi.getResourceReminders).mockResolvedValue({ success: true, error: null, data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0 } })
})
const task = { task: { id: 't', parishId: 'p', operationEventId: 'e', status: 'TODO' }, permissions: { 'operations.task.assign': true } } as unknown as OperationTaskDetail
it('uses task-specific authority and sends exactly one resource target', async () => {
  vi.mocked(operationsApi.createReminder).mockResolvedValue({ parishId: 'p' } as any)
  render(<EventReminderForm event={{ ...event, permissions: {} }} task={task} enabled />)
  fireEvent.change(screen.getByLabelText('Người nhận nhắc công việc'), { target: { value: 'u' } })
  fireEvent.change(screen.getByLabelText('Thời điểm nhắc công việc'), { target: { value: '2099-10-01T08:00' } })
  fireEvent.click(screen.getByText('Lưu lịch nhắc'))
  await screen.findByText(/Đã lưu lịch nhắc/)
  expect(operationsApi.createReminder).toHaveBeenCalledWith({ taskId: 't', recipientUserId: 'u', triggerAt: new Date('2099-10-01T08:00').toISOString(), kind: 'TASK_DUE' }, expect.any(String))
})
it.each(['DONE', 'CANCELLED'])('hides task reminder authoring for terminal state %s', status => {
  render(<EventReminderForm event={event} task={{ ...task, task: { ...task.task, status: status as 'DONE' | 'CANCELLED' } }} enabled />)
  expect(screen.queryByText('Lưu lịch nhắc')).not.toBeInTheDocument()
})
it('does not use event management to bypass task assignment authority', () => {
  render(<EventReminderForm event={event} task={{ ...task, permissions: {} }} enabled />)
  expect(screen.queryByText('Lưu lịch nhắc')).not.toBeInTheDocument()
})
it('schedules an exact recipient and reports scheduling, not delivery', async () => {
  vi.mocked(operationsApi.createReminder).mockResolvedValue({ parishId: 'p' } as any)
  render(<EventReminderForm event={event} enabled />)
  fireEvent.change(screen.getByLabelText('Người nhận nhắc sự kiện'), { target: { value: 'u' } })
  fireEvent.change(screen.getByLabelText('Thời điểm nhắc sự kiện'), { target: { value: '2099-10-01T08:00' } })
  fireEvent.click(screen.getByText('Lưu lịch nhắc'))
  expect(await screen.findByText(/Đã lưu lịch nhắc/)).toBeInTheDocument()
  expect(operationsApi.createReminder).toHaveBeenCalledWith({ eventId: 'e', recipientUserId: 'u', triggerAt: new Date('2099-10-01T08:00').toISOString(), kind: 'EVENT_START' }, expect.any(String))
})
it.each([false, true])('hides authoring offline or without manage authority (%s)', enabled => {
  render(<EventReminderForm event={{ ...event, permissions: {} }} enabled={enabled} />)
  expect(screen.queryByText('Lưu lịch nhắc')).not.toBeInTheDocument()
})
it('D3: warns when the draft lands near another pending reminder for the same recipient', async () => {
  // 40 minutes before the draft below, computed in local time like the datetime-local input.
  const nearAt = new Date(new Date('2099-10-01T09:00').getTime() - 40 * 60_000).toISOString()
  const reminder = { id: 'r1', parishId: 'p', eventId: 'e', recipientUserId: 'u', triggerAt: nearAt, kind: 'EVENT_START' as const, status: 'PENDING' as const, version: 1, createdAt: '2026-01-01T00:00:00.000Z' }
  vi.mocked(operationsApi.getResourceReminders).mockResolvedValue({ success: true, error: null, data: [reminder], meta: { page: 1, limit: 50, total: 1, totalPages: 1 } })
  render(<EventReminderForm event={event} enabled />)
  await screen.findByText('Lịch nhắc đã đặt')
  fireEvent.change(screen.getByLabelText('Người nhận nhắc sự kiện'), { target: { value: 'u' } })
  // 40 minutes after the pending row → warning; saving stays allowed.
  fireEvent.change(screen.getByLabelText('Thời điểm nhắc sự kiện'), { target: { value: '2099-10-01T09:00' } })
  expect(await screen.findByText(/kiểm tra trùng trước khi lưu/)).toBeInTheDocument()
  // 3 hours away → no warning.
  fireEvent.change(screen.getByLabelText('Thời điểm nhắc sự kiện'), { target: { value: '2099-10-01T12:00' } })
  await waitFor(() => expect(screen.queryByText(/kiểm tra trùng trước khi lưu/)).not.toBeInTheDocument())
})

it('rejects past times without sending a command', () => {
  render(<EventReminderForm event={event} enabled />)
  fireEvent.change(screen.getByLabelText('Người nhận nhắc sự kiện'), { target: { value: 'u' } })
  fireEvent.change(screen.getByLabelText('Thời điểm nhắc sự kiện'), { target: { value: '2000-01-01T08:00' } })
  fireEvent.click(screen.getByText('Lưu lịch nhắc'))
  expect(screen.getByText(/tương lai/)).toBeInTheDocument()
  expect(operationsApi.createReminder).not.toHaveBeenCalled()
})

it('loads resource reminders and reschedules a pending row with its exact version', async () => {
  const reminder = { id: 'r1', parishId: 'p', eventId: 'e', recipientUserId: 'u', triggerAt: '2099-10-01T01:00:00.000Z', kind: 'EVENT_START' as const, status: 'PENDING' as const, version: 4, createdAt: '2026-01-01T00:00:00.000Z' }
  vi.mocked(operationsApi.getResourceReminders).mockResolvedValue({ success: true, error: null, data: [reminder], meta: { page: 1, limit: 50, total: 1, totalPages: 1 } })
  vi.mocked(operationsApi.rescheduleReminder).mockResolvedValue({ ...reminder, version: 5, triggerAt: '2099-10-02T01:00:00.000Z' })
  render(<EventReminderForm event={event} enabled />)

  fireEvent.click(await screen.findByRole('button', { name: 'Đổi hoặc hủy lịch' }))
  fireEvent.change(screen.getByLabelText('Giờ nhắc mới sự kiện'), { target: { value: '2099-10-02T08:00' } })
  fireEvent.change(screen.getByLabelText('Lý do đổi hoặc hủy nhắc sự kiện'), { target: { value: 'Thay đổi giờ tập trung' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu giờ mới' }))

  expect(await screen.findByText('Đã đổi thời điểm nhắc.')).toBeInTheDocument()
  expect(operationsApi.rescheduleReminder).toHaveBeenCalledWith('r1', {
    expectedVersion: 4,
    triggerAt: new Date('2099-10-02T08:00').toISOString(),
    reason: 'Thay đổi giờ tập trung',
  }, expect.any(String))
})
