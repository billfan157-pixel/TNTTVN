import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskChecklistSection } from '../../components/operations/TaskChecklistSection'
import type { OperationTaskDetail } from '../../lib/api/operations'

const { restoreTask } = vi.hoisted(() => ({ restoreTask: vi.fn() }))

vi.mock('../../lib/api/operations', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/api/operations')>()
  return {
    ...actual,
    operationsApi: {
      ...actual.operationsApi,
      restoreTask,
      addTaskDependency: vi.fn().mockResolvedValue({}),
      removeTaskDependency: vi.fn().mockResolvedValue({}),
      getTaskDispatches: vi.fn().mockResolvedValue({ data: [] }),
    },
  }
})
vi.mock('../../lib/tenantScope', () => ({
  getTenantScopeKey: () => 'parish-a:user-a',
  getTenantScope: () => ({ parishId: 'parish-a', userId: 'user-a' }),
}))
vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))
vi.mock('../../hooks/useOperationCandidates', () => ({
  useOperationCandidates: () => ({ candidates: [], loading: false, error: '' }),
  operationCandidateValue: () => '',
  parseOperationCandidateValue: () => null,
}))

let selectedTask: OperationTaskDetail
const toggleChecklistItem = vi.fn()
// W1.2: the dialog panels write through the store, so the store is the seam.
const removeTaskAssignment = vi.fn()
const storeState = {
  source: 'server' as const,
  assignmentWarnings: null,
  tasks: [] as unknown[],
  selectedEvent: null,
  selectTask: vi.fn(),
  selectEvent: vi.fn(),
  refreshTaskViews: vi.fn().mockResolvedValue(undefined),
  addChecklistItem: vi.fn(),
  toggleChecklistItem,
  removeTaskAssignment,
}

vi.mock('../../stores/operationsStore', () => ({
  useOperationsStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector(storeState),
    { getState: () => storeState, setState: () => undefined },
  ),
}))

const buildDetail = (version: number, checklistDone = false): OperationTaskDetail => ({
  task: { id: 'task-1', parishId: 'parish-a', title: 'Trang trí sân khấu', status: 'IN_PROGRESS', priority: 'NORMAL', phase: 'PREPARATION', isRequired: true, version },
  assignees: [
    { id: 'as-1', parishId: 'parish-a', taskId: 'task-1', userId: 'user-1', assignmentRole: 'CONTRIBUTOR', acknowledgementStatus: 'ACCEPTED', version: 1 },
  ],
  checklist: [
    { id: 'item-1', parishId: 'parish-a', taskId: 'task-1', label: 'Chuẩn bị băng keo', isRequired: true, isDone: checklistDone, sortOrder: 0 },
  ],
  comments: [],
  dependencies: [],
  permissions: { 'operations.task.manage': true, 'operations.task.reassign': true, 'operations.task.execute': true },
})

describe('TaskChecklistSection (W0.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreTask.mockResolvedValue({})
    removeTaskAssignment.mockResolvedValue({})
    selectedTask = buildDetail(4)
    // Mirrors operationsStore.toggleChecklistItem exactly: bump the task version
    // and emit a fresh selectedTask object. That version bump is what used to
    // remount the version-keyed child panels.
    toggleChecklistItem.mockImplementation(async () => {
      selectedTask = buildDetail(selectedTask.task.version + 1, true)
    })
    storeState.refreshTaskViews = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(storeState, 'selectedTask', { get: () => selectedTask, configurable: true })
  })

  it('keeps a half-typed mandatory reason when an unrelated checklist toggle bumps the task version', async () => {
    render(<TaskChecklistSection />)

    // The revoke reason is server-mandatory; a version bump used to wipe it.
    const reason = screen.getByLabelText('Lý do thu hồi phân công của Thành viên được phân công')
    fireEvent.change(reason, { target: { value: 'Bàn giao cho người thay thế' } })

    fireEvent.click(screen.getByRole('checkbox', { name: /Chuẩn bị băng keo/ }))

    await waitFor(() => expect(toggleChecklistItem).toHaveBeenCalledTimes(1))
    // The version moved 4 -> 5, which used to be the remount trigger.
    expect(selectedTask.task.version).toBe(5)
    expect(screen.getByLabelText('Lý do thu hồi phân công của Thành viên được phân công')).toHaveValue('Bàn giao cho người thay thế')
  })

  it('W1.2: routes the revoke through the store with the task reason', async () => {
    render(<TaskChecklistSection />)
    fireEvent.change(screen.getByLabelText('Lý do thu hồi phân công của Thành viên được phân công'), { target: { value: 'Bàn giao cho người thay thế' } })
    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }))
    await waitFor(() => expect(removeTaskAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', version: 4 }),
      expect.objectContaining({ id: 'as-1', version: 1 }),
      'Bàn giao cho người thay thế',
      expect.any(String),
    ))
  })
})
