import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TaskApprovalQueue } from '../../components/operations/TaskApprovalQueue'
import { operationsApi } from '../../lib/api/operations'
import { setTenantScope } from '../../lib/tenantScope'

beforeEach(() => { vi.restoreAllMocks(); setTenantScope({ parishId: 'P', userId: 'U' }) })
afterEach(() => setTenantScope(null))
it('loads the server queue and opens the exact task', async () => {
  vi.spyOn(operationsApi, 'getApprovalQueue').mockResolvedValue({ success: true, error: null, data: [{ id: 'T', parishId: 'P', title: 'Review task', status: 'TODO', priority: 'NORMAL', isRequired: true, approvalStatus: 'PENDING', version: 1 }], meta: { page: 1, limit: 50, total: 1, totalPages: 1 } })
  const open = vi.fn().mockResolvedValue(undefined)
  render(<TaskApprovalQueue enabled openTask={open} />)
  fireEvent.click(screen.getByRole('button', { name: 'Tải việc chờ duyệt' }))
  await screen.findByText('Review task')
  fireEvent.click(screen.getByRole('button', { name: 'Mở để duyệt' }))
  expect(open).toHaveBeenCalledWith('T')
})
it('clears queue data and disables loading when offline', async () => {
  vi.spyOn(operationsApi, 'getApprovalQueue').mockResolvedValue({ success: true, error: null, data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0 } })
  const view = render(<TaskApprovalQueue enabled openTask={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Tải việc chờ duyệt' }))
  await screen.findByText('Không có nhiệm vụ đang chờ bạn duyệt.')
  view.rerender(<TaskApprovalQueue enabled={false} openTask={vi.fn()} />)
  await waitFor(() => expect(screen.queryByText('Không có nhiệm vụ đang chờ bạn duyệt.')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Tải việc chờ duyệt' })).toBeDisabled()
})

it('discards stale review rows when refreshing fails', async () => {
  vi.spyOn(operationsApi, 'getApprovalQueue')
    .mockResolvedValueOnce({ success: true, error: null, data: [{ id: 'T', parishId: 'P', title: 'Old review', status: 'TODO', priority: 'NORMAL', isRequired: true, approvalStatus: 'PENDING', version: 1 }], meta: { page: 1, limit: 50, total: 1, totalPages: 1 } })
    .mockRejectedValueOnce(new Error('Access changed'))
  render(<TaskApprovalQueue enabled openTask={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Tải việc chờ duyệt' }))
  await screen.findByText('Old review')
  fireEvent.click(screen.getByRole('button', { name: 'Tải việc chờ duyệt' }))
  await screen.findByText('Access changed')
  expect(screen.queryByText('Old review')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Mở để duyệt' })).not.toBeInTheDocument()
})
