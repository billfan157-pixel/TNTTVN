import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button, Select, TextInput } from '../common/ui'
import type { OperationEventDetail, OperationTask } from '../../lib/api/operations'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationsErrorText } from '../../lib/operationsErrors'
import { useOperationsStore } from '../../stores/operationsStore'
import { canCreateEventTask, isTaskScheduleInvalid, toIso } from './operationsViewHelpers'

/** In-event task creation form with local draft state. */
export function EventTaskForm({ detail }: { detail: OperationEventDetail }) {
  const isOnline = useOnlineStatus()
  const source = useOperationsStore(s => s.source)
  const createTask = useOperationsStore(s => s.createTask)
  const selectEvent = useOperationsStore(s => s.selectEvent)
  const canMutate = isOnline && source === 'server'
  const isXuDoanEvent = (detail.event.eventScopeType ?? (detail.event.scopeUnitId ? 'UNIT' : 'XU_DOAN')) === 'XU_DOAN'

  const [draft, setDraft] = useState({ title: '', dueAt: '', scheduledStartAt: '', scheduledEndAt: '', phase: 'PREPARATION' as OperationTask['phase'], isRequired: false, workstreamId: '' })
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { stableKey, releaseKey } = useStableCommandKey()

  const scheduleInvalid = isTaskScheduleInvalid(draft.scheduledStartAt, draft.scheduledEndAt)

  if (!detail.permissions['operations.task.create'] || !canCreateEventTask(detail.event.status)) return null
  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (creating) return
    if (!draft.title || scheduleInvalid) return
    setCreating(true)
    setFormError(null)
    try {
      const workstreamId = detail.workstreams.some(group => group.id === draft.workstreamId) ? draft.workstreamId : null
      const workstream = detail.workstreams.find(group => group.id === workstreamId) ?? null
      const payload = {
        title: draft.title,
        eventId: detail.event.id,
        workstreamId,
        scopeUnitId: workstream?.sourceUnitId ?? detail.event.scopeUnitId ?? null,
        dueAt: draft.dueAt ? toIso(draft.dueAt) : null,
        scheduledStartAt: draft.scheduledStartAt ? toIso(draft.scheduledStartAt) : null,
        scheduledEndAt: draft.scheduledEndAt ? toIso(draft.scheduledEndAt) : null,
        phase: draft.phase,
        isRequired: draft.isRequired,
      }
      await createTask(payload, stableKey('create-task', payload))
      releaseKey('create-task')
      setDraft({ title: '', dueAt: '', scheduledStartAt: '', scheduledEndAt: '', phase: 'PREPARATION', isRequired: false, workstreamId: '' })
      await selectEvent(detail.event.id)
    } catch (error: any) {
      setFormError(operationsErrorText(error?.code, error?.message || 'Không thể tạo nhiệm vụ'))
    } finally { setCreating(false) }
  }

  return (
    <form className="space-y-3 rounded-xl border border-surface-border bg-surface-card p-4 shadow-xs" onSubmit={handleCreate}>
      <div className="flex items-center gap-2 border-b border-surface-border pb-2.5">
        <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
          <CalendarPlus className="h-4 w-4" />
        </div>
        <div>
          <h3 className="m-0 text-sm font-extrabold text-text-main">Thêm Task</h3>
          <p className="m-0 text-xs text-text-muted">Tạo việc mới cho sự kiện này</p>
        </div>
      </div>
      <TextInput aria-label="Tên task" className="w-full" placeholder="Tên công việc" value={draft.title} required maxLength={300} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Select aria-label="Nhóm của công việc" className="w-full" value={detail.workstreams.some(group => group.id === draft.workstreamId) ? draft.workstreamId : ''} onChange={event => setDraft(value => ({ ...value, workstreamId: event.target.value }))}>
          <option value="">{isXuDoanEvent ? 'Không thuộc mảng' : 'Không thuộc nhóm'}</option>
          {detail.workstreams.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </Select>
        <Select aria-label="Giai đoạn nhiệm vụ" className="w-full" value={draft.phase} onChange={event => setDraft(value => ({ ...value, phase: event.target.value as OperationTask['phase'] }))}>
          <option value="PREPARATION">Trước sự kiện</option>
          <option value="EXECUTION">Trong sự kiện</option>
          <option value="FOLLOW_UP">Sau sự kiện</option>
        </Select>
      </div>
      <TextInput aria-label="Hạn task" className="w-full" type="datetime-local" value={draft.dueAt} onChange={event => setDraft(value => ({ ...value, dueAt: event.target.value }))} />
      <div className="grid gap-2 sm:grid-cols-2">
        <TextInput aria-label="Bắt đầu ca task" className="w-full" type="datetime-local" value={draft.scheduledStartAt} onChange={event => setDraft(value => ({ ...value, scheduledStartAt: event.target.value }))} />
        <TextInput aria-label="Kết thúc ca task" className="w-full" type="datetime-local" value={draft.scheduledEndAt} onChange={event => setDraft(value => ({ ...value, scheduledEndAt: event.target.value }))} />
      </div>
      {scheduleInvalid && <p role="alert" className="m-0 text-xs text-parish-danger">Ca công việc cần đủ giờ bắt đầu/kết thúc và giờ kết thúc phải muộn hơn.</p>}
      <label className="flex min-h-11 items-center gap-2 text-sm text-text-main cursor-pointer select-none">
        <input type="checkbox" checked={draft.isRequired} onChange={event => setDraft(value => ({ ...value, isRequired: event.target.checked }))} /> Nhiệm vụ bắt buộc
      </label>
      {formError && <p role="alert" className="m-0 text-xs text-parish-danger">{formError}</p>}
      <Button type="submit" size="sm" loading={creating} disabled={!canMutate || scheduleInvalid} fullWidth>Tạo task</Button>
    </form>
  )
}
