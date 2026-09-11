import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskHandoverForm } from '../../components/operations/TaskHandoverForm'
import { operationsApi, type OperationTaskDetail } from '../../lib/api/operations'
import { setTenantScope } from '../../lib/tenantScope'

const detail: OperationTaskDetail = {
  task: { id: 'T1', parishId: 'P1', title: 'Task', status: 'TODO', priority: 'NORMAL', phase: 'PREPARATION', isRequired: true, approvalStatus: 'NOT_REQUIRED', version: 9 },
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
describe('TaskHandoverForm', () => {
  beforeEach(() => { vi.restoreAllMocks(); setTenantScope({ parishId: 'P1', userId: 'manager' }) })
  afterEach(() => setTenantScope(null))
  it('submits one atomic command with both versions and waits for acknowledgement', async () => {
    const warnings = [{ id: 'B1', startsAt: '2027-02-01T08:00:00Z', endsAt: '2027-02-01T10:00:00Z' }]
    const onWarnings = vi.fn()
    const handover = vi.spyOn(operationsApi, 'handoverTask').mockResolvedValue({ assignment: detail.assignees[0], taskVersion: 10, conflictWarnings: warnings })
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<TaskHandoverForm detail={detail} enabled refresh={refresh} onWarnings={onWarnings} />)
    expect(screen.queryByRole('option', { name: 'Old owner' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác nhận bàn giao' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Người phụ trách mới'), { target: { value: 'person:P-new' } })
    fireEvent.change(screen.getByLabelText('Lý do bàn giao'), { target: { value: ' Schedule change ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận bàn giao' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(onWarnings).toHaveBeenCalledWith('T1', warnings)
    expect(handover).toHaveBeenCalledWith('T1', { version: 9, assignmentId: 'A1', assignmentVersion: 2, personId: 'P-new', reason: 'Schedule change' })
  })
  it('keeps the draft and does not refresh on a rejected command', async () => {
    vi.spyOn(operationsApi, 'handoverTask').mockRejectedValue(new Error('Version conflict'))
    const refresh = vi.fn()
    render(<TaskHandoverForm detail={detail} enabled refresh={refresh} />)
    fireEvent.change(screen.getByLabelText('Người phụ trách mới'), { target: { value: 'person:P-new' } })
    fireEvent.change(screen.getByLabelText('Lý do bàn giao'), { target: { value: 'Reason' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận bàn giao' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Version conflict'))
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Lý do bàn giao')).toHaveValue('Reason')
  })
  it('does not expose handover without scoped authority', () => {
    render(<TaskHandoverForm detail={{ ...detail, permissions: {} }} enabled refresh={vi.fn()} />)
    expect(screen.queryByLabelText('Bàn giao người phụ trách')).not.toBeInTheDocument()
  })
})
