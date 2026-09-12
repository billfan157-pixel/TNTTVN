import { useState } from 'react'
import { Button, Select, Surface, TextInput } from '../common/ui'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationsErrorText } from '../../lib/operationsErrors'
import { useOperationsStore } from '../../stores/operationsStore'
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

  const [draft, setDraft] = useState({ title: '', scopeUnitId: initialScopeUnitId, dueAt: '' })
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { stableKey, releaseKey } = useStableCommandKey()

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (creating) return
    if (!draft.title.trim() || !draft.scopeUnitId) return
    setCreating(true)
    setFormError(null)
    try {
      const payload = {
        title: draft.title.trim(),
        scopeUnitId: draft.scopeUnitId,
        dueAt: draft.dueAt ? toIso(draft.dueAt) : null,
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
        <div className="sm:col-span-2 flex justify-end items-center gap-2 pt-2 border-t border-surface-border">
          {formError && <p role="alert" className="m-0 mr-auto text-xs text-parish-danger">{formError}</p>}
          <Button variant="secondary" size="sm" onClick={onClose}>Hủy</Button>
          <Button type="submit" size="sm" loading={creating} disabled={!canMutate || !draft.title.trim() || !draft.scopeUnitId}>Tạo Task</Button>
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
