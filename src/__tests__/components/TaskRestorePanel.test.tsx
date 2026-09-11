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
  task: { id: 'task-1', parishId: 'parish-a', title: 'Chuẩn bị âm thanh', status: 'CANCELLED', priority: 'NORMAL', phase: 'PREPARATION', isRequired: true, cancellationReason: 'Thiếu người', approvalStatus: 'NOT_REQUIRED', version: 4 },
  assignees: [], checklist: [], comments: [], dependencies: [], permissions: { 'operations.task.manage': true },
}

describe('TaskRestorePanel', () => {
  beforeEach(() => restoreTask.mockReset().mockResolvedValue({ ...detail.task, status: 'TODO', version: 5 }))

  it('requires a reason and refreshes after the acknowledged restore', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<TaskRestorePanel detail={detail} enabled refresh={refresh} />)
    expect(screen.getByRole('button', { name: 'Khôi phục task' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Lý do khôi phục nhiệm vụ'), { target: { value: 'Công việc vẫn bắt buộc để đóng sự kiện' } })
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục task' }))
    await waitFor(() => expect(restoreTask).toHaveBeenCalledWith('task-1', { version: 4, reason: 'Công việc vẫn bắt buộc để đóng sự kiện' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('stays hidden without manager capability', () => {
    const { container } = render(<TaskRestorePanel detail={{ ...detail, permissions: {} }} enabled refresh={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
