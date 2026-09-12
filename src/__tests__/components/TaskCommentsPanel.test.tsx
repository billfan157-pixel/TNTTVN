import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskCommentsPanel } from '../../components/operations/TaskCommentsPanel'
import { operationsApi, type OperationTaskDetail } from '../../lib/api/operations'
import { setTenantScope } from '../../lib/tenantScope'

const detail: OperationTaskDetail = {
  task: { id: 'T1', parishId: 'P1', title: 'Review', status: 'TODO', priority: 'NORMAL', phase: 'PREPARATION', isRequired: true, version: 7 },
  comments: [], checklist: [], assignees: [], dependencies: [], permissions: { 'operations.task.comment': true },
}
describe('TaskCommentsPanel', () => {
  beforeEach(() => { vi.restoreAllMocks(); setTenantScope({ parishId: 'P1', userId: 'U1' }) })
  afterEach(() => setTenantScope(null))
  it('keeps retrospective comments available for terminal tasks', async () => {
    const comment = vi.spyOn(operationsApi, 'commentTask').mockResolvedValue({ id: 'C1', parishId: 'P1', taskId: 'T1', authorUserId: 'U1', content: 'Lessons', createdAt: '2026-09-08T00:00:00Z' })
    render(<TaskCommentsPanel detail={{ ...detail, task: { ...detail.task, status: 'DONE' } }} enabled refresh={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Bình luận nhiệm vụ'), { target: { value: ' Lessons ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bình luận' }))
    await waitFor(() => expect(comment).toHaveBeenCalledWith('T1', { content: 'Lessons' }, expect.any(String)))
  })
  it('disables writes offline and does not manufacture authority', () => {
    const view = render(<TaskCommentsPanel detail={detail} enabled={false} refresh={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Gửi bình luận' })).toBeDisabled()
    view.rerender(<TaskCommentsPanel detail={{ ...detail, permissions: {} }} enabled refresh={vi.fn()} />)
    expect(screen.queryByLabelText('Bình luận nhiệm vụ')).not.toBeInTheDocument()
  })
  it('rejects unsafe evidence and submits a valid HTTPS link with the comment', async () => {
    const comment = vi.spyOn(operationsApi, 'commentTask').mockResolvedValue({ id: 'C1', parishId: 'P1', taskId: 'T1', authorUserId: 'U1', content: 'Evidence', createdAt: '2026-09-08T00:00:00Z' })
    render(<TaskCommentsPanel detail={detail} enabled refresh={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Bình luận nhiệm vụ'), { target: { value: 'Evidence' } })
    fireEvent.change(screen.getByLabelText('Liên kết minh chứng'), { target: { value: 'http://example.com/proof' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Gửi bình luận' }).closest('form')!)
    expect(comment).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('HTTPS')
    fireEvent.change(screen.getByLabelText('Liên kết minh chứng'), { target: { value: 'https://example.com/proof' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bình luận' }))
    await waitFor(() => expect(comment).toHaveBeenCalledWith('T1', { content: 'Evidence', evidenceUrl: 'https://example.com/proof' }, expect.any(String)))
  })
})
