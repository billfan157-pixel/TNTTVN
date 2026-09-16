import { useState } from 'react'
import { Button, Select, Surface, TextArea, TextInput } from '../common/ui'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationsErrorText } from '../../lib/operationsErrors'
import { useOperationsStore } from '../../stores/operationsStore'
import type { OperationTask } from '../../lib/api/operations'
import { toIso } from './operationsViewHelpers'

/** Standalone task form with local draft state (typing never re-renders the page). */
export function StandaloneTaskForm({ initialScopeUnitId, onClose, variant = 'card' }: { initialScopeUnitId: string; onClose: () => void; variant?: 'card' | 'sheet' }) {
  const isOnline = useOnlineStatus()
  const source = useOperationsStore(s => s.source)
  const creationOptions = useOperationsStore(s => s.creationOptions)
  const createStandaloneTask = useOperationsStore(s => s.createStandaloneTask)
  const fetch = useOperationsStore(s => s.fetch)
  const canMutate = isOnline && source === 'server'
  const unitCreationOptions = creationOptions?.units ?? []

  // W2.11: the server create schema always supported these; the form only
  // exposed title/unit/due, forcing a second edit pass after creation.
  const [draft, setDraft] = useState({ title: '', description: '', scopeUnitId: initialScopeUnitId, dueAt: '', scheduledStartAt: '', scheduledEndAt: '', phase: 'PREPARATION' as OperationTask['phase'], priority: 'NORMAL' as OperationTask['priority'], isRequired: false })
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { stableKey, releaseKey } = useStableCommandKey()

  const scheduleInvalid = Boolean(draft.scheduledStartAt && draft.scheduledEndAt && draft.scheduledEndAt <= draft.scheduledStartAt)
  const missingFields: string[] = []
  if (!draft.title.trim()) missingFields.push('Nhập tên công việc.')
  if (!draft.scopeUnitId) missingFields.push('Chọn Ban/Ngành phụ trách.')
  if (scheduleInvalid) missingFields.push('Khung giờ dự kiến phải kết thúc sau khi bắt đầu.')
  const formDirty = Boolean(draft.title.trim() || draft.dueAt || draft.scheduledStartAt || draft.description.trim())

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (creating || missingFields.length > 0) return
    setCreating(true)
    setFormError(null)
    try {
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        scopeUnitId: draft.scopeUnitId,
        dueAt: draft.dueAt ? toIso(draft.dueAt) : null,
        scheduledStartAt: draft.scheduledStartAt ? toIso(draft.scheduledStartAt) : null,
        scheduledEndAt: draft.scheduledEndAt ? toIso(draft.scheduledEndAt) : null,
        phase: draft.phase,
        priority: draft.priority,
        isRequired: draft.isRequired,
      }
      await createStandaloneTask(payload, stableKey('create-standalone-task', payload))
      releaseKey('create-standalone-task')
      onClose()
      await fetch().catch(() => undefined)
    } catch (error: any) {
      setFormError(operationsErrorText(error?.code, error?.message || 'Không thể tạo công việc độc lập'))
    } finally { setCreating(false) }
  }

  const formBody = (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreate}>
        <label className="text-sm font-semibold text-text-main">
          Ban / Ngành phụ trách
          <Select className="mt-1 w-full" value={draft.scopeUnitId} required onChange={event => setDraft(value => ({ ...value, scopeUnitId: event.target.value }))}>
            <option value="">Chọn Ban / Ngành</option>
            {unitCreationOptions.filter(unit => unit.canCreateTask).map(unit => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </Select>
        </label>
        <label className="text-sm font-semibold text-text-main">
          Hạn hoàn thành
          <TextInput className="mt-1 w-full" type="datetime-local" value={draft.dueAt} onChange={event => setDraft(value => ({ ...value, dueAt: event.target.value }))} />
        </label>
        <label className="sm:col-span-2 text-sm font-semibold text-text-main">
          Tên công việc
          <TextInput className="mt-1 w-full" value={draft.title} maxLength={300} required onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} />
        </label>
        <label className="sm:col-span-2 text-sm font-semibold text-text-main">
          Mô tả
          <TextArea className="mt-1 w-full" value={draft.description} maxLength={5000} placeholder="Chi tiết cần làm (không bắt buộc)" onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} />
        </label>
        <label className="text-sm font-semibold text-text-main">Giai đoạn
          <Select className="mt-1 w-full" value={draft.phase} onChange={event => setDraft(value => ({ ...value, phase: event.target.value as OperationTask['phase'] }))}>
            <option value="PREPARATION">Chuẩn bị</option>
            <option value="EXECUTION">Diễn ra</option>
            <option value="FOLLOW_UP">Sau sự kiện</option>
          </Select>
        </label>
        <label className="text-sm font-semibold text-text-main">Độ ưu tiên
          <Select className="mt-1 w-full" value={draft.priority} onChange={event => setDraft(value => ({ ...value, priority: event.target.value as OperationTask['priority'] }))}>
            <option value="LOW">Thấp</option>
            <option value="NORMAL">Bình thường</option>
            <option value="HIGH">Cao</option>
            <option value="URGENT">Khẩn cấp</option>
          </Select>
        </label>
        <label className="text-sm font-semibold text-text-main">Bắt đầu dự kiến
          <TextInput className="mt-1 w-full" type="datetime-local" value={draft.scheduledStartAt} onChange={event => setDraft(value => ({ ...value, scheduledStartAt: event.target.value }))} />
        </label>
        <label className="text-sm font-semibold text-text-main">Kết thúc dự kiến
          <TextInput className="mt-1 w-full" type="datetime-local" value={draft.scheduledEndAt} onChange={event => setDraft(value => ({ ...value, scheduledEndAt: event.target.value }))} />
        </label>
        <label className="sm:col-span-2 flex min-h-11 items-center gap-2 text-sm text-text-main cursor-pointer select-none">
          <input type="checkbox" checked={draft.isRequired} onChange={event => setDraft(value => ({ ...value, isRequired: event.target.checked }))} /> Việc bắt buộc
        </label>
        {formDirty && missingFields.length > 0 && (
          <ul role="status" className="sm:col-span-2 m-0 space-y-0.5 rounded-lg border border-parish-warning/30 bg-parish-warning-bg/30 p-2 text-xs text-parish-warning">
            {missingFields.map(field => <li key={field}>{field}</li>)}
          </ul>
        )}
        <div className="sm:col-span-2 flex justify-end items-center gap-2 pt-2 border-t border-surface-border">
          {formError && <p role="alert" className="m-0 mr-auto text-xs text-parish-danger">{formError}</p>}
          <Button variant="secondary" size="sm" onClick={onClose}>Hủy</Button>
          <Button type="submit" size="sm" loading={creating} disabled={!canMutate || missingFields.length > 0}>Tạo Task</Button>
        </div>
      </form>
  )

  if (variant === 'sheet') {
    return (
      <div className="space-y-4" aria-label="Tạo task độc lập">
        <p className="m-0 text-xs text-text-muted">Việc của một Ban/Ngành, không cần sự kiện.</p>
        {formBody}
      </div>
    )
  }

  return (
    <Surface as="section" variant="card" className="p-4 sm:p-5 rounded-2xl border-2 border-parish-primary/20 shadow-sm space-y-4" aria-label="Tạo task độc lập">
      <div className="flex items-center justify-between border-b border-surface-border pb-3">
        <div>
          <h3 className="m-0 text-base font-extrabold text-text-main">Tạo Task độc lập</h3>
          <p className="m-0 text-xs text-text-muted">Việc của một Ban/Ngành, không cần sự kiện. Phạm vi lấy từ đơn vị của người tạo.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button>
      </div>
      {formBody}
    </Surface>
  )
}
