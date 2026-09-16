import { useState } from 'react'
import { ListChecks } from 'lucide-react'
import { Badge, Button, TextInput } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { useOperationsStore } from '../../stores/operationsStore'
import { TaskRestorePanel } from './TaskRestorePanel'
import { TaskAssigneesPanel } from './TaskAssigneesPanel'
import { TaskDispatchPanel } from './TaskDispatchPanel'
import { TaskDependenciesPanel } from './TaskDependenciesPanel'
import { TaskCommentsPanel } from './TaskCommentsPanel'
import { TaskHandoverForm } from './TaskHandoverForm'
import { isTerminalTask, taskPhaseLabel } from './operationsViewHelpers'

/**
 * Task checklist detail with local draft/busy state. Rendered both inside the
 * event modal and standalone; typing here never re-renders the page lists.
 */
export function TaskChecklistSection() {
  const isOnline = useOnlineStatus()
  const source = useOperationsStore(s => s.source)
  const selectedTask = useOperationsStore(s => s.selectedTask)
  const assignmentWarnings = useOperationsStore(s => s.assignmentWarnings)
  const selectTask = useOperationsStore(s => s.selectTask)
  const refreshTaskViews = useOperationsStore(s => s.refreshTaskViews)
  const addChecklistItem = useOperationsStore(s => s.addChecklistItem)
  const toggleChecklistItem = useOperationsStore(s => s.toggleChecklistItem)
  const canMutate = isOnline && source === 'server'

  const [draft, setDraft] = useState({ label: '', isRequired: false })
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const { stableKey, releaseKey } = useStableCommandKey()

  const refresh = (id: string) => refreshTaskViews(id)

  if (!selectedTask) return null

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.label.trim() || isTerminalTask(selectedTask.task.status)) return
    setBusyTaskId(selectedTask.task.id)
    try {
      const key = stableKey('checklist-add', { taskId: selectedTask.task.id, version: selectedTask.task.version, label: draft.label.trim(), isRequired: draft.isRequired })
      await addChecklistItem(selectedTask.task, draft.label.trim(), draft.isRequired, key)
      releaseKey('checklist-add')
      setDraft({ label: '', isRequired: false })
    } catch {
      // Store owns the visible OCC/API error.
    } finally { setBusyTaskId(null) }
  }

  const handleToggle = async (item: (typeof selectedTask)['checklist'][number]) => {
    if (isTerminalTask(selectedTask.task.status)) return
    setBusyTaskId(selectedTask.task.id)
    try {
      const key = stableKey('checklist-toggle', { taskId: selectedTask.task.id, itemId: item.id, version: selectedTask.task.version, isDone: !item.isDone })
      await toggleChecklistItem(selectedTask.task, item, key)
      releaseKey('checklist-toggle')
    } catch {
      // Store owns the visible OCC/API error; unchecked state remains authoritative.
    } finally { setBusyTaskId(null) }
  }

  return (
    <div className="mt-5 rounded-xl border border-surface-border p-3" aria-label="Chi tiết checklist">
      <TaskRestorePanel key={`restore-${selectedTask.task.id}-${selectedTask.task.version}`} detail={selectedTask} enabled={canMutate} refresh={() => refresh(selectedTask.task.id)} />
      <TaskAssigneesPanel key={`assignees-${selectedTask.task.id}-${selectedTask.task.version}`} detail={selectedTask} enabled={canMutate} refresh={() => refresh(selectedTask.task.id)} />
      <TaskCommentsPanel key={selectedTask.task.id} detail={selectedTask} enabled={canMutate} refresh={() => refresh(selectedTask.task.id)} />
      {/* W2.3: read-only dispatch round history in the task dialog. */}
      <TaskDispatchPanel key={`dispatches-${selectedTask.task.id}`} detail={selectedTask} enabled />
      <TaskHandoverForm key={`handover-${selectedTask.task.id}`} detail={selectedTask} enabled={canMutate} onWarnings={(taskId, items) => useOperationsStore.setState({ assignmentWarnings: { taskId, items } })} refresh={() => refresh(selectedTask.task.id)} />
      {assignmentWarnings?.taskId === selectedTask.task.id && assignmentWarnings.items.length > 0 && (
        <p role="status" className="text-sm text-text-main">
          Đã lưu phân công, nhưng người được giao có lịch bận tại hạn nhiệm vụ. Cần xác nhận lại khả năng nhận việc.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-sm font-extrabold text-text-main">Checklist · {selectedTask.task.title}</h3>
          <p className="mb-0 mt-1 text-xs text-text-muted">{taskPhaseLabel[selectedTask.task.phase]} · {selectedTask.checklist.filter(item => item.isDone).length}/{selectedTask.checklist.length} mục đã xong</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void selectTask(null)}>Đóng checklist</Button>
      </div>
      {selectedTask.task.description && <p className="whitespace-pre-wrap text-sm text-text-main">{selectedTask.task.description}</p>}
      {/* W4.2b: read-only "waiting on" list — no add/remove UI by design. */}
      <TaskDependenciesPanel detail={selectedTask} />
      <div className="mt-3 divide-y divide-surface-border rounded-lg border border-surface-border">
        {selectedTask.checklist.length === 0 && <EmptyState icon={ListChecks} title="Chưa có mục checklist." description="Thêm mục cần kiểm tra ở biểu mẫu bên dưới." className="py-5" />}
        {selectedTask.checklist.map(item => {
          const canToggle = selectedTask.permissions['operations.task.execute'] || selectedTask.permissions['operations.task.manage']
          return (
            <label key={item.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm text-text-main">
              <input
                type="checkbox"
                checked={item.isDone}
                disabled={!canMutate || isTerminalTask(selectedTask.task.status) || !canToggle || busyTaskId === selectedTask.task.id}
                onChange={() => void handleToggle(item)}
              />
              <span className={item.isDone ? 'text-text-muted line-through' : ''}>{item.label}</span>
              {item.isRequired && <Badge tone="warning">Bắt buộc</Badge>}
            </label>
          )
        })}
      </div>
      {selectedTask.permissions['operations.task.manage'] && !isTerminalTask(selectedTask.task.status) && (
        <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center" onSubmit={handleAdd}>
          <TextInput aria-label="Mục checklist mới" className="w-full" value={draft.label} maxLength={300} required placeholder="Thêm mục cần kiểm tra" onChange={event => setDraft(value => ({ ...value, label: event.target.value }))} />
          <label className="flex min-h-11 items-center gap-2 text-sm text-text-main"><input type="checkbox" checked={draft.isRequired} onChange={event => setDraft(value => ({ ...value, isRequired: event.target.checked }))} /> Bắt buộc</label>
          <Button type="submit" size="sm" loading={busyTaskId === selectedTask.task.id} disabled={!canMutate || !draft.label.trim()}>Thêm mục</Button>
        </form>
      )}
    </div>
  )
}
