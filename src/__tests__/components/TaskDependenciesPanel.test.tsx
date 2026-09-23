import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TaskDependenciesPanel } from '../../components/operations/TaskDependenciesPanel'
import type { OperationTaskDetail } from '../../lib/api/operations'

const detailWith = (dependencies: any[]) => ({
  task: { id: 't', parishId: 'p', title: 'Trang trí', status: 'TODO' },
  dependencies,
  permissions: {},
} as unknown as OperationTaskDetail)

describe('TaskDependenciesPanel (W4.2b)', () => {
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
})
