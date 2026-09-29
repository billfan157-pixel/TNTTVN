import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskDependenciesPanel } from '../../components/operations/TaskDependenciesPanel'
import type { OperationTaskDetail } from '../../lib/api/operations'
import { useOperationsStore } from '../../stores/operationsStore'

// W1.2: the panel routes its writes through the store, so the module under test
// is the store action, not the raw API client.
const addTaskDependency = vi.fn()
const removeTaskDependency = vi.fn()
const refreshTaskViews = vi.fn()
vi.mock('../../stores/operationsStore', () => ({
  useOperationsStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector({
      selectedEvent: null,
      tasks: [{ id: 't2', parishId: 'p', title: 'Mua vật tư', status: 'TODO' }],
      addTaskDependency,
      removeTaskDependency,
      refreshTaskViews,
    }),
    { getState: () => ({}), setState: () => undefined },
  ),
}))

let scope: string | null = 'parish-a:user-a'
vi.mock('../../lib/tenantScope', () => ({ getTenantScopeKey: () => scope }))

const detailWith = (dependencies: any[]) => ({
  task: { id: 't', parishId: 'p', title: 'Trang trí', status: 'TODO' },
  dependencies,
  permissions: {},
} as unknown as OperationTaskDetail)

const manageableDetail = {
  task: { id: 't', parishId: 'p', title: 'Trang trí', status: 'TODO', version: 3 },
  dependencies: [
    { taskId: 't', dependsOnTaskId: 'x', dependencyType: 'BLOCKED_BY', dependsOnTitle: 'Mua vật tư', dependsOnStatus: 'IN_PROGRESS' },
  ],
  permissions: { 'operations.task.manage': true },
} as unknown as OperationTaskDetail

describe('TaskDependenciesPanel (W4.2b / W0.4 / W1.2)', () => {
  beforeEach(() => {
    scope = 'parish-a:user-a'
    addTaskDependency.mockReset().mockResolvedValue(undefined)
    removeTaskDependency.mockReset().mockResolvedValue(undefined)
    refreshTaskViews.mockReset().mockResolvedValue(undefined)
    useOperationsStore.setState?.({} as never)
  })

  it('renders nothing when there are no dependencies', () => {
    const { container } = render(<TaskDependenciesPanel detail={detailWith([])} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('region', { name: 'Nhiệm vụ đang chờ' })).not.toBeInTheDocument()
  })

  it('lists blocking tasks with their server-resolved titles and status badges — read-only', () => {
    render(<TaskDependenciesPanel detail={detailWith([
      { taskId: 't', dependsOnTaskId: 'x', dependencyType: 'BLOCKED_BY', dependsOnTitle: 'Mua vật tư', dependsOnStatus: 'IN_PROGRESS' },
      { taskId: 't', dependsOnTaskId: 'y', dependencyType: 'BLOCKED_BY', dependsOnTitle: null, dependsOnStatus: null },
    ])} />)
    expect(screen.getByText('Mua vật tư')).toBeInTheDocument()
    expect(screen.getByText('Đang làm')).toBeInTheDocument()
    // A soft-deleted source degrades honestly instead of showing a raw id.
    expect(screen.getByText('Nhiệm vụ đã xóa')).toBeInTheDocument()
    expect(screen.getByText('ĐÃ XÓA')).toBeInTheDocument()
    expect(screen.getByText(/không thể hoàn tất hoặc mở chặn/)).toBeInTheDocument()
    // The decision: no add/remove affordances exist anywhere in the panel without manage permission.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('renders remove button when user has manage permission and enabled is true', () => {
    const detail = {
      task: { id: 't', parishId: 'p', title: 'Trang trí', status: 'TODO', version: 1 },
      dependencies: [
        { taskId: 't', dependsOnTaskId: 'x', dependencyType: 'BLOCKED_BY', dependsOnTitle: 'Mua vật tư', dependsOnStatus: 'IN_PROGRESS' },
      ],
      permissions: { 'operations.task.manage': true },
    } as unknown as OperationTaskDetail

    render(<TaskDependenciesPanel detail={detail} enabled />)
    expect(screen.getByRole('button', { name: /Gỡ phụ thuộc Mua vật tư/i })).toBeInTheDocument()
  })

  it('W1.2: adds an edge through the store with the task version and a stable key', async () => {
    render(<TaskDependenciesPanel detail={manageableDetail} enabled />)
    fireEvent.click(screen.getByRole('button', { name: 'Thêm phụ thuộc' }))
    fireEvent.change(screen.getByLabelText('Chọn nhiệm vụ phụ thuộc'), { target: { value: 't2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(addTaskDependency).toHaveBeenCalledWith(manageableDetail.task, 't2', expect.any(String)))
  })

  it('W0.4: drops a late add result and never repaints once the account scope changed', async () => {
    let resolve!: (value: unknown) => void
    addTaskDependency.mockReturnValue(new Promise(done => { resolve = done }))
    render(<TaskDependenciesPanel detail={manageableDetail} enabled />)

    fireEvent.click(screen.getByRole('button', { name: 'Thêm phụ thuộc' }))
    fireEvent.change(screen.getByLabelText('Chọn nhiệm vụ phụ thuộc'), { target: { value: 't2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(addTaskDependency).toHaveBeenCalledTimes(1))

    // The session changes owner while the write is in flight.
    scope = 'parish-b:user-b'
    resolve({})

    // A cross-scope result must not repaint this panel. It also stays frozen
    // (fail-closed), because its state now belongs to a session that is no
    // longer the owner; the task dialog is torn down by the store anyway.
    await waitFor(() => expect(addTaskDependency).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Chọn nhiệm vụ phụ thuộc')).toHaveValue('t2')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('W0.4: refuses to start a write at all without a tenant scope', () => {
    scope = null
    render(<TaskDependenciesPanel detail={manageableDetail} enabled />)
    fireEvent.click(screen.getByRole('button', { name: 'Thêm phụ thuộc' }))
    fireEvent.change(screen.getByLabelText('Chọn nhiệm vụ phụ thuộc'), { target: { value: 't2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(addTaskDependency).not.toHaveBeenCalled()
  })
})
