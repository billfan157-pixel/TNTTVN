import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskRestorePanel } from '../../components/operations/TaskRestorePanel'
import type { OperationTaskDetail } from '../../lib/api/operations'

const { restoreTask } = vi.hoisted(() => ({ restoreTask: vi.fn() }))
vi.mock('../../lib/api/operations', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/api/operations')>()
  return { ...actual, operationsApi: { ...actual.operationsApi, restoreTask } }
})
vi.mock('../../lib/tenantScope', () => ({ getTenantScopeKey: () => 'parish-a:user-a' }))

const detail: OperationTaskDetail = {
  task: { id: 'task-1', parishId: 'parish-a', title: 'Chuẩn bị âm thanh', status: 'CANCELLED', priority: 'NORMAL', phase: 'PREPARATION', isRequired: true, cancellationReason: 'Thiếu người', version: 4 },
  assignees: [], checklist: [], comments: [], dependencies: [], permissions: { 'operations.task.manage': true },
}

describe('TaskRestorePanel', () => {
  beforeEach(() => restoreTask.mockReset().mockResolvedValue({ ...detail.task, status: 'TODO', version: 5 }))

  it('requires a reason, sends a stable idempotency key and refreshes after the acknowledged restore', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<TaskRestorePanel detail={detail} enabled refresh={refresh} />)
    expect(screen.getByRole('button', { name: 'Khôi phục task' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Lý do khôi phục nhiệm vụ'), { target: { value: 'Công việc vẫn bắt buộc để đóng sự kiện' } })
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục task' }))
    // P1-5: restore now carries a stable idempotency key like every other command.
    await waitFor(() => expect(restoreTask).toHaveBeenCalledWith('task-1', { version: 4, reason: 'Công việc vẫn bắt buộc để đóng sự kiện' }, expect.any(String)))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('reuses the idempotency key when retrying the same payload after a failure', async () => {
    restoreTask
      .mockRejectedValueOnce(new Error('Network offline'))
      .mockResolvedValue({ ...detail.task, status: 'TODO', version: 5 })
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<TaskRestorePanel detail={detail} enabled refresh={refresh} />)
    fireEvent.change(screen.getByLabelText('Lý do khôi phục nhiệm vụ'), { target: { value: 'Vẫn cần làm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục task' }))
    await screen.findByText('Network offline')
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục task' }))
    await waitFor(() => expect(restoreTask).toHaveBeenCalledTimes(2))
    // Same payload retry → same key, so the server dedups instead of double-acting.
    expect(restoreTask.mock.calls[0][2]).toBe(restoreTask.mock.calls[1][2])
    expect(restoreTask.mock.calls[0][2]).toEqual(expect.any(String))
  })

  it('stays hidden without manager capability', () => {
    const { container } = render(<TaskRestorePanel detail={{ ...detail, permissions: {} }} enabled refresh={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
