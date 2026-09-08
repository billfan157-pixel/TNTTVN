import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { WorkstreamPanel } from '../../components/operations/WorkstreamPanel'
import { operationsApi, type OperationEventDetail } from '../../lib/api/operations'
vi.mock('../../lib/api/operations', () => ({ operationsApi: { getWorkstream: vi.fn(), createWorkstream: vi.fn(), setWorkstreamReady: vi.fn() } }))
let scope = 'p:u'
vi.mock('../../lib/tenantScope', () => ({ getTenantScopeKey: () => scope }))
const group = { id: 'g', parishId: 'p', operationEventId: 'e', name: 'Phụng vụ', status: 'PLANNING', version: 4, isRequired: true }
const event = { event: { id: 'e', parishId: 'p', status: 'PLANNING' }, workstreams: [group], permissions: { 'operations.workstream.create': true } } as unknown as OperationEventDetail
beforeEach(() => { scope = 'p:u'; vi.resetAllMocks(); vi.mocked(operationsApi.getWorkstream).mockResolvedValue({ workstream: group, members: [], permissions: { 'operations.workstream.mark_ready': true } } as any) })
it('loads resource permissions and sends the current aggregate version', async () => {
  const refresh = vi.fn()
  render(<WorkstreamPanel event={event} enabled people={[]} refresh={refresh} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  fireEvent.click(await screen.findByText('Nhóm đã sẵn sàng'))
  await waitFor(() => expect(operationsApi.setWorkstreamReady).toHaveBeenCalledWith('g', { version: 4, status: 'READY' }))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})
it('blocks offline reads and hides mutation forms', () => {
  render(<WorkstreamPanel event={event} enabled={false} people={[]} refresh={vi.fn()} />)
  expect(screen.getByText('Phụng vụ · Bắt buộc')).toBeDisabled()
  expect(screen.queryByText('Tạo nhóm')).not.toBeInTheDocument()
})
it('discards a late detail response after an account switch', async () => {
  let resolve!: (value: any) => void
  vi.mocked(operationsApi.getWorkstream).mockReturnValue(new Promise(done => { resolve = done }))
  render(<WorkstreamPanel event={event} enabled people={[]} refresh={vi.fn()} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  scope = 'p:other'
  resolve({ workstream: group, members: [], permissions: { 'operations.workstream.mark_ready': true } })
  await waitFor(() => expect(operationsApi.getWorkstream).toHaveBeenCalled())
  expect(screen.queryByText('Nhóm đã sẵn sàng')).not.toBeInTheDocument()
})
it('discards stale command controls on conflict without refreshing or replaying', async () => {
  vi.mocked(operationsApi.setWorkstreamReady).mockRejectedValue(new Error('VERSION_CONFLICT'))
  const refresh = vi.fn()
  render(<WorkstreamPanel event={event} enabled people={[]} refresh={refresh} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  fireEvent.click(await screen.findByText('Nhóm đã sẵn sàng'))
  expect(await screen.findByRole('alert')).toHaveTextContent('VERSION_CONFLICT')
  expect(screen.queryByText('Nhóm đã sẵn sàng')).not.toBeInTheDocument()
  expect(refresh).not.toHaveBeenCalled()
  expect(operationsApi.setWorkstreamReady).toHaveBeenCalledTimes(1)
})
it('does not offer readiness controls without resource permission', async () => {
  vi.mocked(operationsApi.getWorkstream).mockResolvedValue({ workstream: group, members: [], permissions: {} } as any)
  render(<WorkstreamPanel event={event} enabled people={[]} refresh={vi.fn()} />)
  fireEvent.click(screen.getByText('Phụng vụ · Bắt buộc'))
  await screen.findByText('Tải lại nhóm')
  expect(screen.queryByText('Nhóm đã sẵn sàng')).not.toBeInTheDocument()
})
