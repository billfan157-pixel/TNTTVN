import { useState } from 'react'
import { Users } from 'lucide-react'
import { Button, Select, TextInput } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import type { OperationEventDetail } from '../../lib/api/operations'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationsErrorText } from '../../lib/operationsErrors'
import { useOperationsStore } from '../../stores/operationsStore'
import { operationCandidateValue, parseOperationCandidateValue, useOperationCandidates } from '../../hooks/useOperationCandidates'
import { isClosedEvent, isTerminalTask, toIso } from './operationsViewHelpers'

/** In-event assignment form with local draft state. */
export function TaskAssignForm({ detail }: { detail: OperationEventDetail }) {
  const isOnline = useOnlineStatus()
  const source = useOperationsStore(s => s.source)
  const assignTask = useOperationsStore(s => s.assignTask)
  const dispatchTask = useOperationsStore(s => s.dispatchTask)
  const selectEvent = useOperationsStore(s => s.selectEvent)
  const canMutate = isOnline && source === 'server'
  const closed = isClosedEvent(detail.event.status)

  const [draft, setDraft] = useState({ taskId: '', target: '', reserveTarget: '', acknowledgeBy: '', role: 'CONTRIBUTOR' as 'OWNER' | 'CONTRIBUTOR' })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { stableKey, releaseKey } = useStableCommandKey()

  const assignableTasks = detail.tasks.filter(task => !isTerminalTask(task.status))
  const directory = useOperationCandidates(draft.taskId ? { taskId: draft.taskId } : null, Boolean(canMutate && detail.permissions['operations.task.assign'] && draft.taskId))
  const candidates = directory.candidates.filter(candidate => candidate.eligibility !== 'INELIGIBLE')
  const actionableCandidates = directory.candidates.filter(candidate => candidate.eligibility === 'ACTIONABLE')

  if (!detail.permissions['operations.task.assign'] || closed) return null
  if (assignableTasks.length === 0) {
    return (
      <div className="space-y-2 rounded-xl border border-surface-border bg-surface-card p-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-surface-border pb-2.5">
          <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h3 className="m-0 text-sm font-extrabold text-text-main">Phân Công</h3>
            <p className="m-0 text-xs text-text-muted">Giao việc cho nhân sự</p>
          </div>
        </div>
        {/* W3.4 (U-14a): standard empty state instead of a raw <p> note. */}
        <EmptyState
          icon={Users}
          title={detail.tasks.length === 0 ? 'Chưa có nhiệm vụ nào để phân công.' : 'Không còn nhiệm vụ nào mở.'}
          description={detail.tasks.length === 0
            ? 'Hãy tạo công việc cho sự kiện này trước khi giao cho nhân sự.'
            : 'Tất cả nhiệm vụ đã hoàn tất hoặc đã kết thúc.'}
          className="py-4"
        />
      </div>
    )
  }

  const handleAssign = async (event: React.FormEvent) => {
    event.preventDefault()
    const task = detail.tasks.find(item => item.id === draft.taskId)
    const target = parseOperationCandidateValue(draft.target)
    const reserve = draft.reserveTarget ? parseOperationCandidateValue(draft.reserveTarget) : null
    if (!task || closed || isTerminalTask(task.status) || !target) return
    if (draft.role === 'OWNER' && (!draft.acknowledgeBy || (draft.reserveTarget && !reserve))) return
    if (busy) return
    setBusy(true)
    setFormError(null)
    try {
      const key = stableKey('assign-task', { taskId: task.id, version: task.version, role: draft.role, target: draft.target, reserve: draft.reserveTarget, acknowledgeBy: draft.acknowledgeBy })
      if (draft.role === 'OWNER') await dispatchTask(task, target, reserve, toIso(draft.acknowledgeBy), key)
      else await assignTask(task, target, draft.role, key)
      releaseKey('assign-task')
      setDraft({ taskId: '', target: '', reserveTarget: '', acknowledgeBy: '', role: 'CONTRIBUTOR' })
      await selectEvent(detail.event.id)
    } catch (error: any) {
      setFormError(operationsErrorText(error?.code, error?.message || 'Không thể phân công nhiệm vụ'))
    } finally { setBusy(false) }
  }

  return (
    <form className="space-y-3 rounded-xl border border-surface-border bg-surface-card p-4 shadow-xs" onSubmit={handleAssign}>
      <div className="flex items-center gap-2 border-b border-surface-border pb-2.5">
        <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
          <Users className="h-4 w-4" />
        </div>
        <div>
          <h3 className="m-0 text-sm font-extrabold text-text-main">Phân Công</h3>
          <p className="m-0 text-xs text-text-muted">Giao việc cho nhân sự</p>
        </div>
      </div>
      <Select aria-label="Task cần phân công" className="w-full" value={draft.taskId} required onChange={event => setDraft(value => ({ ...value, taskId: event.target.value, target: '', reserveTarget: '' }))}>
        <option value="">Chọn task</option>
        {assignableTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
      </Select>
      <Select aria-label={draft.role === 'OWNER' ? 'Người thực hiện chính' : 'Người được phân công'} className="w-full" value={draft.target} required disabled={!draft.taskId || directory.loading} onChange={event => setDraft(value => ({ ...value, target: event.target.value, reserveTarget: value.reserveTarget === event.target.value ? '' : value.reserveTarget }))}>
        <option value="">{directory.loading ? 'Đang tải nhân sự…' : 'Chọn nhân sự'}</option>
        {(draft.role === 'OWNER' ? actionableCandidates : candidates).map(candidate => (
          <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>
            {candidate.displayName}{candidate.eligibility === 'PLANNING_ONLY' ? ' · chưa có tài khoản' : ''}
          </option>
        ))}
      </Select>
      {directory.error && <p role="alert" className="text-sm text-text-main">{directory.error}</p>}
      <Select aria-label="Vai trò phân công" className="w-full" value={draft.role} onChange={event => setDraft(value => ({ ...value, role: event.target.value as typeof value.role, reserveTarget: '', acknowledgeBy: '' }))}>
        <option value="OWNER">Owner (Phụ trách chính)</option>
        <option value="CONTRIBUTOR">Contributor (Thực hiện)</option>
      </Select>
      {draft.role === 'OWNER' && (
        <div className="space-y-2 rounded-xl border border-surface-border bg-surface-ground/40 p-3">
          <Select aria-label="Người dự bị" className="w-full" value={draft.reserveTarget} disabled={!draft.taskId || directory.loading} onChange={event => setDraft(value => ({ ...value, reserveTarget: event.target.value }))}>
            <option value="">Không chọn người dự bị</option>
            {actionableCandidates.filter(candidate => operationCandidateValue(candidate) !== draft.target).map(candidate => (
              <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>{candidate.displayName}</option>
            ))}
          </Select>
          <TextInput aria-label="Hạn nhận nhiệm vụ" className="w-full" type="datetime-local" value={draft.acknowledgeBy} required onChange={event => setDraft(value => ({ ...value, acknowledgeBy: event.target.value }))} />
          <p className="m-0 text-xs text-text-muted">
            Ở bản Nháp, lời mời chỉ được gửi khi sang Kế hoạch. Nếu có dự bị, hệ thống mời họ khi đã dùng 70% thời gian chờ; người nhận trước sẽ phụ trách chính.
          </p>
        </div>
      )}
      {formError && <p role="alert" className="m-0 text-xs text-parish-danger">{formError}</p>}
      <Button type="submit" size="sm" loading={busy} disabled={!canMutate || (draft.role === 'OWNER' && !draft.acknowledgeBy)} fullWidth>
        {draft.role === 'OWNER' ? 'Gửi lời mời phụ trách' : 'Giao việc'}
      </Button>
    </form>
  )
}
