import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskCommentsPanel } from '../../components/operations/TaskCommentsPanel'
import { api } from '../../lib/api'
import { setTenantScope } from '../../lib/tenantScope'
import type { OperationTaskDetail } from '../../lib/api/operations'
import { useOperationsStore } from '../../stores/operationsStore'

const detail: OperationTaskDetail = {
  task: { id: 'T1', parishId: 'P1', title: 'Review', status: 'TODO', priority: 'NORMAL', phase: 'PREPARATION', isRequired: true, version: 7 },
  comments: [], checklist: [], assignees: [], dependencies: [], permissions: { 'operations.task.comment': true },
}
const comment = { id: 'C1', parishId: 'P1', taskId: 'T1', authorUserId: 'U1', content: 'Lessons', createdAt: '2026-09-08T00:00:00Z' }

describe('TaskCommentsPanel (W1.2: routes through the store)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setTenantScope({ parishId: 'P1', userId: 'U1' })
    useOperationsStore.setState({ refreshTaskViews: vi.fn().mockResolvedValue(undefined) })
  })
  afterEach(() => {
    setTenantScope(null)
    useOperationsStore.setState({ refreshTaskViews: vi.fn().mockResolvedValue(undefined) })
  })

  it('keeps retrospective comments available for terminal tasks', async () => {
    const post = vi.spyOn(api, 'commentTask').mockResolvedValue(comment as never)
    render(<TaskCommentsPanel detail={{ ...detail, task: { ...detail.task, status: 'DONE' } }} enabled refresh={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Bình luận nhiệm vụ'), { target: { value: ' Lessons ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bình luận' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('T1', { content: 'Lessons' }, expect.any(String)))
    expect(useOperationsStore.getState().refreshTaskViews).toHaveBeenCalledWith('T1')
  })

  it('W1.2: refuses to render a comment that came back for another parish', async () => {
    vi.spyOn(api, 'commentTask').mockResolvedValue({ ...comment, parishId: 'P-OTHER' } as never)
    render(<TaskCommentsPanel detail={detail} enabled refresh={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Bình luận nhiệm vụ'), { target: { value: 'Lessons' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bình luận' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('sai phạm vi'))
    expect(useOperationsStore.getState().refreshTaskViews).not.toHaveBeenCalled()
  })

  it('disables writes offline and does not manufacture authority', () => {
    const view = render(<TaskCommentsPanel detail={detail} enabled={false} refresh={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Gửi bình luận' })).toBeDisabled()
    view.rerender(<TaskCommentsPanel detail={{ ...detail, permissions: {} }} enabled refresh={vi.fn()} />)
    expect(screen.queryByLabelText('Bình luận nhiệm vụ')).not.toBeInTheDocument()
  })

  it('rejects unsafe evidence and submits a valid HTTPS link with the comment', async () => {
    const post = vi.spyOn(api, 'commentTask').mockResolvedValue({ ...comment, content: 'Evidence' } as never)
    render(<TaskCommentsPanel detail={detail} enabled refresh={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Bình luận nhiệm vụ'), { target: { value: 'Evidence' } })
    fireEvent.change(screen.getByLabelText('Liên kết minh chứng'), { target: { value: 'http://example.com/proof' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Gửi bình luận' }).closest('form')!)
    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('HTTPS')
    fireEvent.change(screen.getByLabelText('Liên kết minh chứng'), { target: { value: 'https://example.com/proof' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bình luận' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('T1', { content: 'Evidence', evidenceUrl: 'https://example.com/proof' }, expect.any(String)))
  })
})
