import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskHandoverForm } from '../../components/operations/TaskHandoverForm'
import { api } from '../../lib/api'
import type { OperationTaskDetail } from '../../lib/api/operations'
import { setTenantScope } from '../../lib/tenantScope'
import { useOperationsStore } from '../../stores/operationsStore'

const detail: OperationTaskDetail = {
  task: { id: 'T1', parishId: 'P1', title: 'Task', status: 'TODO', priority: 'NORMAL', phase: 'PREPARATION', isRequired: true, version: 9 },
  assignees: [{ id: 'A1', parishId: 'P1', taskId: 'T1', userId: 'U1', assignmentRole: 'OWNER', acknowledgementStatus: 'ACCEPTED', version: 2 }],
  comments: [], checklist: [], dependencies: [], permissions: { 'operations.task.reassign': true },
}
vi.mock('../../hooks/useOperationCandidates', () => ({
  useOperationCandidates: () => ({ candidates: [
    { parishId: 'P1', personId: 'P-old', userId: 'U1', displayName: 'Old owner', eligibility: 'ACTIONABLE', inResourceScope: true },
    { parishId: 'P1', personId: 'P-new', userId: null, displayName: 'New owner', eligibility: 'PLANNING_ONLY', inResourceScope: true },
  ], loading: false, error: '' }),
  operationCandidateValue: (candidate: any) => candidate.personId ? `person:${candidate.personId}` : `user:${candidate.userId}`,
  parseOperationCandidateValue: (value: string) => value.startsWith('person:') ? { personId: value.slice(7) } : null,
}))

describe('TaskHandoverForm (W1.2: routes through the store)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setTenantScope({ parishId: 'P1', userId: 'manager' })
    // The store owns the re-read now (fetch + selectEvent + selectTask), so the
    // panel no longer takes a `refresh` prop. Stub that one primitive and assert
    // on it instead of on a panel callback.
    useOperationsStore.setState({ assignmentWarnings: null })
  })
  afterEach(() => {
    setTenantScope(null)
    useOperationsStore.setState({ assignmentWarnings: null })
  })

  it('submits one atomic command with both versions and republishes the warning verdict', async () => {
    const warnings = [{ id: 'B1', startsAt: '2027-02-01T08:00:00Z', endsAt: '2027-02-01T10:00:00Z' }]
    const onWarnings = vi.fn()
    const handover = vi.spyOn(api, 'handoverTask').mockResolvedValue({ assignment: detail.assignees[0], taskVersion: 10, conflictWarnings: warnings })
    const refreshTaskViews = vi.fn().mockResolvedValue(undefined)
    useOperationsStore.setState({ refreshTaskViews })

    render(<TaskHandoverForm detail={detail} enabled onWarnings={onWarnings} />)
    expect(screen.queryByRole('option', { name: 'Old owner' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác nhận bàn giao' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Người phụ trách mới'), { target: { value: 'person:P-new' } })
    fireEvent.change(screen.getByLabelText('Lý do bàn giao'), { target: { value: ' Schedule change ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận bàn giao' }))

    await waitFor(() => expect(refreshTaskViews).toHaveBeenCalledWith('T1'))
    expect(handover).toHaveBeenCalledWith('T1', { version: 9, assignmentId: 'A1', assignmentVersion: 2, personId: 'P-new', reason: 'Schedule change' }, expect.any(String))
    // W1.2: the store publishes the warning verdict, so the form surfaces it
    // from store state rather than from the API response.
    expect(onWarnings).toHaveBeenCalledWith('T1', warnings)
    expect(screen.getByLabelText('Lý do bàn giao')).toHaveValue('')
  })

  it('rejects a cross-parish handover response instead of rendering it', async () => {
    vi.spyOn(api, 'handoverTask').mockResolvedValue({ assignment: { ...detail.assignees[0], parishId: 'P-OTHER' }, taskVersion: 10, conflictWarnings: [] })
    const refreshTaskViews = vi.fn().mockResolvedValue(undefined)
    useOperationsStore.setState({ refreshTaskViews })
    render(<TaskHandoverForm detail={detail} enabled />)
    fireEvent.change(screen.getByLabelText('Người phụ trách mới'), { target: { value: 'person:P-new' } })
    fireEvent.change(screen.getByLabelText('Lý do bàn giao'), { target: { value: 'Reason' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận bàn giao' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('sai phạm vi'))
    expect(refreshTaskViews).not.toHaveBeenCalled()
  })

  it('keeps the draft and does not repaint on a rejected command', async () => {
    vi.spyOn(api, 'handoverTask').mockRejectedValue(new Error('Version conflict'))
    const refreshTaskViews = vi.fn().mockResolvedValue(undefined)
    useOperationsStore.setState({ refreshTaskViews })
    render(<TaskHandoverForm detail={detail} enabled />)
    fireEvent.change(screen.getByLabelText('Người phụ trách mới'), { target: { value: 'person:P-new' } })
    fireEvent.change(screen.getByLabelText('Lý do bàn giao'), { target: { value: 'Reason' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận bàn giao' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Version conflict'))
    expect(refreshTaskViews).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Lý do bàn giao')).toHaveValue('Reason')
  })

  it('does not expose handover without scoped authority', () => {
    render(<TaskHandoverForm detail={{ ...detail, permissions: {} }} enabled />)
    expect(screen.queryByLabelText('Bàn giao người phụ trách')).not.toBeInTheDocument()
  })
})
