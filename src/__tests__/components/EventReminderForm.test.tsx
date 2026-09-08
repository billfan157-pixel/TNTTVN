import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { EventReminderForm } from '../../components/operations/EventReminderForm'
import { operationsApi, type OperationEventDetail, type OperationTaskDetail } from '../../lib/api/operations'
vi.mock('../../lib/api/operations', () => ({ operationsApi: { createReminder: vi.fn() } }))
vi.mock('../../lib/tenantScope', () => ({ getTenantScopeKey: () => 'p:u' }))
const event = { event: { id: 'e', parishId: 'p', status: 'PLANNING' }, permissions: { 'operations.event.manage': true } } as unknown as OperationEventDetail
const people = [{ id: 'person', parishId: 'p', fullName: 'Người nhận', linkedUserId: 'u', serviceStatus: 'ACTIVE' }]
beforeEach(() => vi.resetAllMocks())
const task = { task: { id: 't', parishId: 'p', operationEventId: 'e', status: 'TODO' }, permissions: { 'operations.task.assign': true } } as unknown as OperationTaskDetail
it('uses task-specific authority and sends exactly one resource target', async () => {
  vi.mocked(operationsApi.createReminder).mockResolvedValue({ parishId: 'p' } as any)
  render(<EventReminderForm event={{ ...event, permissions: {} }} task={task} enabled people={people} />)
  fireEvent.change(screen.getByLabelText('Người nhận nhắc công việc'), { target: { value: 'u' } })
  fireEvent.change(screen.getByLabelText('Thời điểm nhắc công việc'), { target: { value: '2099-10-01T08:00' } })
  fireEvent.click(screen.getByText('Lưu lịch nhắc'))
  await screen.findByRole('status')
  expect(operationsApi.createReminder).toHaveBeenCalledWith({ taskId: 't', recipientUserId: 'u', triggerAt: new Date('2099-10-01T08:00').toISOString(), kind: 'TASK_DUE' })
})
it.each(['DONE', 'CANCELLED'])('hides task reminder authoring for terminal state %s', status => {
  render(<EventReminderForm event={event} task={{ ...task, task: { ...task.task, status: status as 'DONE' | 'CANCELLED' } }} enabled people={people} />)
  expect(screen.queryByText('Lưu lịch nhắc')).not.toBeInTheDocument()
})
it('does not use event management to bypass task assignment authority', () => {
  render(<EventReminderForm event={event} task={{ ...task, permissions: {} }} enabled people={people} />)
  expect(screen.queryByText('Lưu lịch nhắc')).not.toBeInTheDocument()
})
it('schedules an exact recipient and reports scheduling, not delivery', async () => {
  vi.mocked(operationsApi.createReminder).mockResolvedValue({ parishId: 'p' } as any)
  render(<EventReminderForm event={event} enabled people={people} />)
  fireEvent.change(screen.getByLabelText('Người nhận nhắc sự kiện'), { target: { value: 'u' } })
  fireEvent.change(screen.getByLabelText('Thời điểm nhắc sự kiện'), { target: { value: '2099-10-01T08:00' } })
  fireEvent.click(screen.getByText('Lưu lịch nhắc'))
  expect(await screen.findByRole('status')).toHaveTextContent('Đã lưu lịch nhắc')
  expect(operationsApi.createReminder).toHaveBeenCalledWith({ eventId: 'e', recipientUserId: 'u', triggerAt: new Date('2099-10-01T08:00').toISOString(), kind: 'EVENT_START' })
})
it.each([false, true])('hides authoring offline or without manage authority (%s)', enabled => {
  render(<EventReminderForm event={{ ...event, permissions: {} }} enabled={enabled} people={people} />)
  expect(screen.queryByText('Lưu lịch nhắc')).not.toBeInTheDocument()
})
it('rejects past times without sending a command', () => {
  render(<EventReminderForm event={event} enabled people={people} />)
  fireEvent.change(screen.getByLabelText('Người nhận nhắc sự kiện'), { target: { value: 'u' } })
  fireEvent.change(screen.getByLabelText('Thời điểm nhắc sự kiện'), { target: { value: '2000-01-01T08:00' } })
  fireEvent.click(screen.getByText('Lưu lịch nhắc'))
  expect(screen.getByRole('status')).toHaveTextContent('tương lai')
  expect(operationsApi.createReminder).not.toHaveBeenCalled()
})
