import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskReviewPanel } from '../../components/operations/TaskReviewPanel'
import { operationsApi, type OperationTaskDetail } from '../../lib/api/operations'
import { setTenantScope } from '../../lib/tenantScope'

const detail: OperationTaskDetail = {
  task: { id: 'T1', parishId: 'P1', title: 'Review', status: 'TODO', priority: 'NORMAL', isRequired: true, approvalStatus: 'PENDING', version: 7 },
  comments: [], checklist: [], assignees: [], dependencies: [], permissions: { 'operations.task.approve': true, 'operations.task.comment': true },
}
describe('TaskReviewPanel', () => {
  beforeEach(() => { vi.restoreAllMocks(); setTenantScope({ parishId: 'P1', userId: 'U1' }) })
  afterEach(() => setTenantScope(null))
  it('submits approval with the exact version and requires rejection reason', async () => {
    const approve = vi.spyOn(operationsApi, 'approveTask').mockResolvedValue(detail.task)
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<TaskReviewPanel detail={detail} enabled refresh={refresh} />)
    expect(screen.getByRole('button', { name: 'Yêu cầu chỉnh sửa' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt nhiệm vụ' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(approve).toHaveBeenCalledWith('T1', { version: 7, decision: 'APPROVED', reason: undefined })
  })
  it('keeps retrospective comments available but hides terminal approval', async () => {
    const comment = vi.spyOn(operationsApi, 'commentTask').mockResolvedValue({ id: 'C1', parishId: 'P1', taskId: 'T1', authorUserId: 'U1', content: 'Lessons', createdAt: '2026-09-08T00:00:00Z' })
    render(<TaskReviewPanel detail={{ ...detail, task: { ...detail.task, status: 'DONE' } }} enabled refresh={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Duyệt nhiệm vụ' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Bình luận nhiệm vụ'), { target: { value: ' Lessons ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bình luận' }))
    await waitFor(() => expect(comment).toHaveBeenCalledWith('T1', { content: 'Lessons' }))
  })
  it('disables writes offline and does not manufacture authority', () => {
    const view = render(<TaskReviewPanel detail={detail} enabled={false} refresh={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Duyệt nhiệm vụ' })).toBeDisabled()
    view.rerender(<TaskReviewPanel detail={{ ...detail, permissions: {} }} enabled refresh={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Duyệt nhiệm vụ' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Bình luận nhiệm vụ')).not.toBeInTheDocument()
  })
  it('rejects unsafe evidence and submits a valid HTTPS link with the comment', async () => {
    const comment = vi.spyOn(operationsApi, 'commentTask').mockResolvedValue({ id: 'C1', parishId: 'P1', taskId: 'T1', authorUserId: 'U1', content: 'Evidence', createdAt: '2026-09-08T00:00:00Z' })
    render(<TaskReviewPanel detail={detail} enabled refresh={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Bình luận nhiệm vụ'), { target: { value: 'Evidence' } })
    fireEvent.change(screen.getByLabelText('Liên kết minh chứng'), { target: { value: 'http://example.com/proof' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Gửi bình luận' }).closest('form')!)
    expect(comment).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('HTTPS')
    fireEvent.change(screen.getByLabelText('Liên kết minh chứng'), { target: { value: 'https://example.com/proof' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bình luận' }))
    await waitFor(() => expect(comment).toHaveBeenCalledWith('T1', { content: 'Evidence', evidenceUrl: 'https://example.com/proof' }))
  })
})
