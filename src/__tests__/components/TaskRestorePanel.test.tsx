import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskRestorePanel } from '../../components/operations/TaskRestorePanel'
import { api } from '../../lib/api'
import { setTenantScope } from '../../lib/tenantScope'
import type { OperationTaskDetail } from '../../lib/api/operations'
import { useOperationsStore } from '../../stores/operationsStore'

const detail: OperationTaskDetail = {
  task: { id: 'task-1', parishId: 'parish-a', title: 'Chuẩn bị âm thanh', status: 'CANCELLED', priority: 'NORMAL', phase: 'PREPARATION', isRequired: true, cancellationReason: 'Thiếu người', version: 4 },
  assignees: [], checklist: [], comments: [], dependencies: [], permissions: { 'operations.task.manage': true },
}

describe('TaskRestorePanel (W1.2: routes through the store)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setTenantScope({ parishId: 'parish-a', userId: 'user-a' })
    // W1.2: the store owns the re-read, so the panel no longer takes `refresh`.
    useOperationsStore.setState({ refreshTaskViews: vi.fn().mockResolvedValue(undefined) })
    vi.spyOn(api, 'restoreTask').mockResolvedValue({ ...detail.task, status: 'TODO', version: 5 } as never)
  })
  afterEach(() => {
    setTenantScope(null)
    useOperationsStore.setState({ refreshTaskViews: vi.fn().mockResolvedValue(undefined) })
  })

  it('requires a reason, sends a stable idempotency key and re-reads after the acknowledged restore', async () => {
    render(<TaskRestorePanel detail={detail} enabled />)
    expect(screen.getByRole('button', { name: 'Khôi phục task' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Lý do khôi phục nhiệm vụ'), { target: { value: 'Công việc vẫn bắt buộc để đóng sự kiện' } })
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục task' }))
    // P1-5: restore now carries a stable idempotency key like every other command.
    await waitFor(() => expect(api.restoreTask).toHaveBeenCalledWith('task-1', { version: 4, reason: 'Công việc vẫn bắt buộc để đóng sự kiện' }, expect.any(String)))
    await waitFor(() => expect(useOperationsStore.getState().refreshTaskViews).toHaveBeenCalledWith('task-1'))
  })

  it('rejects a cross-parish restore response instead of reporting success', async () => {
    vi.spyOn(api, 'restoreTask').mockResolvedValue({ ...detail.task, parishId: 'parish-b', status: 'TODO', version: 5 } as never)
    render(<TaskRestorePanel detail={detail} enabled />)
    fireEvent.change(screen.getByLabelText('Lý do khôi phục nhiệm vụ'), { target: { value: 'Vẫn cần làm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục task' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('sai phạm vi'))
    expect(useOperationsStore.getState().refreshTaskViews).not.toHaveBeenCalled()
  })

  it('reuses the idempotency key when retrying the same payload after a failure', async () => {
    vi.spyOn(api, 'restoreTask')
      .mockRejectedValueOnce(new Error('Network offline'))
      .mockResolvedValue({ ...detail.task, status: 'TODO', version: 5 } as never)
    render(<TaskRestorePanel detail={detail} enabled />)
    fireEvent.change(screen.getByLabelText('Lý do khôi phục nhiệm vụ'), { target: { value: 'Vẫn cần làm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục task' }))
    await screen.findByText('Network offline')
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục task' }))
    await waitFor(() => expect(api.restoreTask).toHaveBeenCalledTimes(2))
    // Same payload retry → same key, so the server dedups instead of double-acting.
    const calls = (api.restoreTask as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(calls[0][2]).toBe(calls[1][2])
    expect(calls[0][2]).toEqual(expect.any(String))
  })

  it('stays hidden without manager capability', () => {
    const { container } = render(<TaskRestorePanel detail={{ ...detail, permissions: {} }} enabled />)
    expect(container).toBeEmptyDOMElement()
  })
})
