import { useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button, Select, TextInput } from '../common/ui'
import type { OperationEventDetail, OperationsCreationOptions, OperationTask } from '../../lib/api/operations'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationsErrorText } from '../../lib/operationsErrors'
import { useOperationsStore } from '../../stores/operationsStore'
import { canCreateEventTask, canUseFieldTasks, fieldLayerUnitIds, isTaskScheduleInvalid, toIso } from './operationsViewHelpers'

/** In-event task creation form with local draft state. */
export function EventTaskForm({ detail, creationOptions }: { detail: OperationEventDetail; creationOptions?: OperationsCreationOptions | null }) {
  const isOnline = useOnlineStatus()
  const source = useOperationsStore(s => s.source)
  const createTask = useOperationsStore(s => s.createTask)
  const selectEvent = useOperationsStore(s => s.selectEvent)
  const canMutate = isOnline && source === 'server'
  const isXuDoanEvent = (detail.event.eventScopeType ?? (detail.event.scopeUnitId ? 'UNIT' : 'XU_DOAN')) === 'XU_DOAN'

  const [draft, setDraft] = useState({ title: '', dueAt: '', scheduledStartAt: '', scheduledEndAt: '', phase: 'PREPARATION' as OperationTask['phase'], isRequired: false, workstreamId: '' })
  const [dueHasTime, setDueHasTime] = useState(true)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { stableKey, releaseKey } = useStableCommandKey()

  // U-21: task trong event Xứ đoàn thuộc tầng Mảng của đúng Ban/Ngành sở hữu Mảng,
  // nên picker chỉ mời những Mảng mà caller có quyền tầng Mảng (Trưởng/Phó đơn vị
  // đó). Nếu không xác định được (admin override) thì giữ đủ danh sách để không
  // chặn nhầm người vận hành — server vẫn là nơi quyết định cuối cùng.
  const fieldUnitIds = useMemo(() => fieldLayerUnitIds(creationOptions), [creationOptions])
  const blanketFieldAccess = fieldUnitIds.size === 0
  const usableFields = useMemo(() => {
    if (!isXuDoanEvent) return detail.workstreams
    const allowed = detail.workstreams.filter(group => canUseFieldTasks({ unitId: group.sourceUnitId, fieldUnitIds, blanket: blanketFieldAccess }))
    return allowed.length > 0 ? allowed : detail.workstreams
  }, [detail.workstreams, isXuDoanEvent, fieldUnitIds, blanketFieldAccess])
  const hiddenFieldCount = detail.workstreams.length - usableFields.length

  const scheduleInvalid = isTaskScheduleInvalid(draft.scheduledStartAt, draft.scheduledEndAt)

  const handleToggleDueTime = () => {
    setDueHasTime(prev => {
      const next = !prev
      if (!next && draft.dueAt) {
        setDraft(d => ({ ...d, dueAt: d.dueAt.slice(0, 10) }))
      } else if (next && draft.dueAt && draft.dueAt.length === 10) {
        setDraft(d => ({ ...d, dueAt: `${d.dueAt}T17:00` }))
      }
      return next
    })
  }

  if (!detail.permissions['operations.task.create'] || !canCreateEventTask(detail.event.status)) return null
  const workstreamRequired = isXuDoanEvent
  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (creating) return
    if (!draft.title || scheduleInvalid) return
    if (workstreamRequired && !draft.workstreamId) {
      setFormError('Task trong sự kiện Xứ đoàn phải thuộc một Mảng phụ trách.')
      return
    }
    setCreating(true)
    setFormError(null)
    try {
      const workstreamId = detail.workstreams.some(group => group.id === draft.workstreamId) ? draft.workstreamId : null
      const workstream = detail.workstreams.find(group => group.id === workstreamId) ?? null
      const dueAtIso = draft.dueAt
        ? dueHasTime
          ? toIso(draft.dueAt)
          : new Date(`${draft.dueAt.slice(0, 10)}T23:59:59`).toISOString()
        : null
      const payload = {
        title: draft.title,
        eventId: detail.event.id,
        workstreamId,
        scopeUnitId: workstream?.sourceUnitId ?? detail.event.scopeUnitId ?? null,
        dueAt: dueAtIso,
        scheduledStartAt: draft.scheduledStartAt ? toIso(draft.scheduledStartAt) : null,
        scheduledEndAt: draft.scheduledEndAt ? toIso(draft.scheduledEndAt) : null,
        phase: draft.phase,
        isRequired: draft.isRequired,
      }
      await createTask(payload, stableKey('create-task', payload))
      releaseKey('create-task')
      setDraft({ title: '', dueAt: '', scheduledStartAt: '', scheduledEndAt: '', phase: 'PREPARATION', isRequired: false, workstreamId: '' })
      setDueHasTime(true)
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
      <div>
        <label htmlFor="event-task-title" className="mb-1 block text-xs font-semibold text-text-main">
          Tên công việc <span className="text-parish-danger">*</span>
        </label>
        <TextInput
          id="event-task-title"
          aria-label="Tên task"
          className="w-full"
          placeholder="VD: Chuẩn bị âm thanh, đón tiếp..."
          value={draft.title}
          required
          maxLength={300}
          onChange={event => setDraft(value => ({ ...value, title: event.target.value }))}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor="event-task-workstream" className="mb-1 block text-xs font-semibold text-text-main">
            {isXuDoanEvent ? 'Mảng phụ trách *' : 'Nhóm phụ trách'}
          </label>
          <Select
            id="event-task-workstream"
            aria-label={isXuDoanEvent ? 'Mảng của công việc' : 'Nhóm của công việc'}
            className="w-full"
            value={usableFields.some(group => group.id === draft.workstreamId) ? draft.workstreamId : ''}
            required={workstreamRequired}
            onChange={event => setDraft(value => ({ ...value, workstreamId: event.target.value }))}
          >
            <option value="">{isXuDoanEvent ? 'Chọn Mảng (bắt buộc)' : 'Không thuộc nhóm'}</option>
            {usableFields.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </Select>
          {workstreamRequired && detail.workstreams.length === 0 && (
            <p className="m-0 mt-1 text-xs text-text-muted">Sự kiện Xứ đoàn cần tạo Mảng (Field) gắn Ban/Ngành trước khi thêm task.</p>
          )}
          {hiddenFieldCount > 0 && (
            <p className="m-0 mt-1 text-xs text-text-muted">Chỉ hiện Mảng thuộc Ban/Ngành bạn phụ trách — việc trong Mảng của đơn vị khác do Trưởng Mảng bên đó tạo.</p>
          )}
        </div>
        <div>
          <label htmlFor="event-task-phase" className="mb-1 block text-xs font-semibold text-text-main">
            Giai đoạn
          </label>
          <Select
            id="event-task-phase"
            aria-label="Giai đoạn nhiệm vụ"
            className="w-full"
            value={draft.phase}
            onChange={event => setDraft(value => ({ ...value, phase: event.target.value as OperationTask['phase'] }))}
          >
            <option value="PREPARATION">Trước sự kiện</option>
            <option value="EXECUTION">Trong sự kiện</option>
            <option value="FOLLOW_UP">Sau sự kiện</option>
          </Select>
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="event-task-due-at" className="text-xs font-semibold text-text-main">
            Hạn hoàn thành
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={dueHasTime}
            aria-label="Bật tắt giờ hạn hoàn thành"
            onClick={handleToggleDueTime}
            className="inline-flex items-center gap-1.5 cursor-pointer text-xs select-none group min-h-[32px] sm:min-h-0 py-0.5"
            title={dueHasTime ? 'Chuyển sang hạn cả ngày (không kèm giờ)' : 'Chuyển sang chọn giờ cụ thể'}
          >
            <span className="text-xs text-text-muted group-hover:text-text-main transition-colors">
              {dueHasTime ? 'Có giờ cụ thể' : 'Cả ngày'}
            </span>
            <span
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                dueHasTime ? 'bg-parish-primary' : 'bg-surface-border'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-surface-card shadow-xs transition-transform ${
                  dueHasTime ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </div>
        <TextInput
          id="event-task-due-at"
          aria-label="Hạn task"
          className="w-full"
          type={dueHasTime ? 'datetime-local' : 'date'}
          value={dueHasTime ? draft.dueAt : draft.dueAt.slice(0, 10)}
          onChange={event => setDraft(value => ({ ...value, dueAt: event.target.value }))}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-main">Ca làm việc</span>
          <span className="text-xs text-text-muted">Tùy chọn</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="event-task-start-at" className="mb-1 block text-xs text-text-muted">
              Bắt đầu ca
            </label>
            <TextInput
              id="event-task-start-at"
              aria-label="Bắt đầu ca task"
              className="w-full"
              type="datetime-local"
              value={draft.scheduledStartAt}
              onChange={event => setDraft(value => ({ ...value, scheduledStartAt: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="event-task-end-at" className="mb-1 block text-xs text-text-muted">
              Kết thúc ca
            </label>
            <TextInput
              id="event-task-end-at"
              aria-label="Kết thúc ca task"
              className="w-full"
              type="datetime-local"
              value={draft.scheduledEndAt}
              onChange={event => setDraft(value => ({ ...value, scheduledEndAt: event.target.value }))}
            />
          </div>
        </div>
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
