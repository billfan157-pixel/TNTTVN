import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button, Select, Surface, TextInput } from '../common/ui'
import type { OperationEvent } from '../../lib/api/operations'
import { OPERATIONS_POSITION_LABELS_VI } from '../../lib/api/operations'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationsErrorText } from '../../lib/operationsErrors'
import { useOperationsStore } from '../../stores/operationsStore'
import { SmartEventTimePicker } from './SmartEventTimePicker'
import { toIso, EVENT_TYPE_OPTIONS } from './operationsViewHelpers'

/**
 * Event creation form with its own draft state, so typing here never
 * re-renders the lists, KPI strip or detail modal behind it.
 */
export function CreateEventForm({
  initialScopeKind,
  initialScopeUnitId,
  onClose,
  variant = 'card',
}: {
  initialScopeKind: 'XU_DOAN' | 'UNIT'
  initialScopeUnitId: string
  onClose: () => void
  /** `sheet` = body only inside ModalShell (Wave 2 B3). */
  variant?: 'card' | 'sheet'
}) {
  const isOnline = useOnlineStatus()
  const source = useOperationsStore(s => s.source)
  const permissions = useOperationsStore(s => s.permissions)
  const creationOptions = useOperationsStore(s => s.creationOptions)
  const createEvent = useOperationsStore(s => s.createEvent)
  const selectEvent = useOperationsStore(s => s.selectEvent)
  const canMutate = isOnline && source === 'server'
  const canCreateXuDoan = Boolean(creationOptions?.canCreateXuDoanEvent)
  const unitCreationOptions = creationOptions?.units ?? []
  const canCreateAnyUnitEvent = unitCreationOptions.some(unit => unit.canCreateEvent)

  const [draft, setDraft] = useState({ title: '', startsAt: '', endsAt: '', eventType: 'OTHER', location: '', visibility: 'INTERNAL' as OperationEvent['visibility'], scopeKind: initialScopeKind, scopeUnitId: initialScopeUnitId, organizerUserId: '' })
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { stableKey, releaseKey } = useStableCommandKey()

  const draftScopeUnit = unitCreationOptions.find(unit => unit.id === draft.scopeUnitId) ?? null
  const draftOrganizers = draft.scopeKind === 'XU_DOAN'
    ? (creationOptions?.xuDoanOrganizers ?? [])
    : (draftScopeUnit?.organizers ?? [])
  const effectiveOrganizerId = draft.organizerUserId || (draftOrganizers.length === 1 ? draftOrganizers[0].userId : '')

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (creating) return
    if (!draft.title || !draft.startsAt || !draft.endsAt || draft.endsAt <= draft.startsAt) return
    if (draft.scopeKind === 'UNIT' && !draft.scopeUnitId) return
    setCreating(true)
    setFormError(null)
    try {
      const payload = {
        title: draft.title,
        eventType: draft.eventType,
        startsAt: toIso(draft.startsAt),
        endsAt: toIso(draft.endsAt),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
        location: draft.location.trim() || null,
        visibility: draft.visibility,
        eventScopeType: draft.scopeKind,
        scopeUnitId: draft.scopeKind === 'UNIT' ? draft.scopeUnitId : null,
        organizerUserId: effectiveOrganizerId || null,
      }
      const created = await createEvent(payload, stableKey('create-event', payload))
      releaseKey('create-event')
      onClose()
      if (created?.id) {
        await selectEvent(created.id)
      }
    } catch (error: any) {
      setFormError(operationsErrorText(error?.code, error?.message || 'Không thể tạo sự kiện'))
    } finally { setCreating(false) }
  }

  const formBody = (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreate}>
        {canCreateXuDoan && canCreateAnyUnitEvent && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-semibold text-text-main">Phạm vi sự kiện</legend>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Phạm vi sự kiện">
              <Button type="button" variant={draft.scopeKind === 'XU_DOAN' ? 'primary' : 'secondary'} size="sm" onClick={() => setDraft(value => ({ ...value, scopeKind: 'XU_DOAN', scopeUnitId: '', organizerUserId: '' }))}>Sự kiện Xứ đoàn</Button>
              <Button type="button" variant={draft.scopeKind === 'UNIT' ? 'primary' : 'secondary'} size="sm" onClick={() => setDraft(value => ({ ...value, scopeKind: 'UNIT', scopeUnitId: unitCreationOptions.find(unit => unit.canCreateEvent)?.id ?? '', organizerUserId: '' }))}>Sự kiện chuyên môn</Button>
            </div>
            <p className="mb-0 mt-1 text-xs text-text-muted">Sự kiện Xứ đoàn cần nhiều Ban/Ngành phối hợp theo từng mảng phụ trách. Sự kiện chuyên môn thuộc riêng một Ban/Ngành.</p>
          </fieldset>
        )}
        {draft.scopeKind === 'UNIT' && (
          <label className="sm:col-span-2 text-sm font-semibold text-text-main">
            Ban / Ngành phụ trách
            <Select className="mt-1 w-full" value={draft.scopeUnitId} required onChange={event => setDraft(value => ({ ...value, scopeUnitId: event.target.value, organizerUserId: '' }))}>
              <option value="">Chọn Ban / Ngành</option>
              {unitCreationOptions.filter(unit => unit.canCreateEvent).map(unit => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </Select>
          </label>
        )}
        <label className="sm:col-span-2 text-sm font-semibold text-text-main">
          Người chịu trách nhiệm (Organizer)
          <Select className="mt-1 w-full" value={draft.organizerUserId || (draftOrganizers.length === 1 ? draftOrganizers[0].userId : '')} required={draftOrganizers.length > 0} disabled={draftOrganizers.length <= 1} onChange={event => setDraft(value => ({ ...value, organizerUserId: event.target.value }))}>
            {draftOrganizers.length !== 1 && <option value="">Chọn người chịu trách nhiệm</option>}
            {draftOrganizers.map(person => (
              <option key={person.userId} value={person.userId}>{person.displayName}{OPERATIONS_POSITION_LABELS_VI[person.positionCode as keyof typeof OPERATIONS_POSITION_LABELS_VI] ? ` · ${OPERATIONS_POSITION_LABELS_VI[person.positionCode as keyof typeof OPERATIONS_POSITION_LABELS_VI]}` : ''}</option>
            ))}
          </Select>
          <span className="mt-1 block text-xs font-normal text-text-muted">Người tạo chỉ thực hiện thao tác; người chịu trách nhiệm đứng tên điều hành sự kiện. Máy chủ kiểm tra lại khi lưu.</span>
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-semibold text-text-main">Hiển thị sự kiện</legend>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Hiển thị sự kiện">
            <Button type="button" variant={draft.visibility === 'INTERNAL' ? 'primary' : 'secondary'} size="sm" onClick={() => setDraft(value => ({ ...value, visibility: 'INTERNAL' }))}>Nội bộ</Button>
            <Button type="button" variant={draft.visibility === 'PUBLIC_SUMMARY' ? 'primary' : 'secondary'} size="sm" disabled={!permissions['operations.event.publish_public']} title={!permissions['operations.event.publish_public'] ? 'Bạn chưa có quyền công khai sự kiện.' : undefined} onClick={() => setDraft(value => ({ ...value, visibility: 'PUBLIC_SUMMARY' }))}>Công khai</Button>
          </div>
          <p className="mb-0 mt-1 text-xs text-text-muted">{permissions['operations.event.publish_public'] ? 'Công khai tự sinh mục Lịch và thông báo phụ huynh.' : 'Bạn chỉ được tạo sự kiện nội bộ trong phạm vi phụ trách; việc công khai cần quyền riêng.'} Task, phân công, readiness và hậu kiểm không bao giờ xuất hiện trên Lịch.</p>
        </fieldset>
        <label className="sm:col-span-2 text-sm font-semibold text-text-main">
          Tên sự kiện
          <TextInput className="mt-1 w-full" value={draft.title} maxLength={draft.visibility === 'PUBLIC_SUMMARY' ? 200 : 300} required onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} />
        </label>
        <label className="text-sm font-semibold text-text-main">Loại sự kiện
          <Select className="mt-1 w-full" value={draft.eventType} onChange={event => setDraft(value => ({ ...value, eventType: event.target.value }))}>
            {EVENT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </label>
        <label className="text-sm font-semibold text-text-main">Địa điểm
          <TextInput className="mt-1 w-full" value={draft.location} maxLength={draft.visibility === 'PUBLIC_SUMMARY' ? 200 : 300} onChange={event => setDraft(value => ({ ...value, location: event.target.value }))} />
        </label>
        <SmartEventTimePicker
          className="sm:col-span-2"
          startsAt={draft.startsAt}
          endsAt={draft.endsAt}
          eventType={draft.eventType}
          required
          idPrefix="create-event"
          onChange={({ startsAt, endsAt }) => setDraft(value => ({ ...value, startsAt, endsAt }))}
        />
        <div className="sm:col-span-2 flex justify-end items-center gap-2 pt-2 border-t border-surface-border">
          {formError && <p role="alert" className="m-0 mr-auto text-xs text-parish-danger">{formError}</p>}
          <Button variant="secondary" size="sm" onClick={onClose}>Hủy</Button>
          <Button type="submit" size="sm" loading={creating} disabled={!canMutate || !draft.title.trim() || !draft.startsAt || !draft.endsAt || draft.endsAt <= draft.startsAt || (draft.scopeKind === 'UNIT' && !draft.scopeUnitId) || (draftOrganizers.length > 1 && !effectiveOrganizerId)}>Lưu bản nháp</Button>
        </div>
      </form>
  )

  if (variant === 'sheet') {
    return (
      <div className="space-y-4" aria-label="Tạo sự kiện mới">
        <p className="m-0 text-xs text-text-muted">Tạo một lần tại Operations; sự kiện công khai sẽ tự xuất hiện trên Lịch.</p>
        {formBody}
      </div>
    )
  }

  return (
    <Surface as="section" variant="card" className="p-4 sm:p-5 rounded-2xl border-2 border-parish-primary/20 shadow-sm space-y-4" aria-label="Tạo sự kiện mới">
      <div className="flex items-center justify-between border-b border-surface-border pb-3">
        <div className="flex items-center gap-2.5">
          <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
            <CalendarPlus className="h-5 w-5" />
          </div>
          <div>
            <h3 className="m-0 text-base font-extrabold text-text-main">{draft.scopeKind === 'XU_DOAN' ? 'Tạo sự kiện Xứ đoàn' : `Tạo sự kiện chuyên môn${draftScopeUnit ? ` · ${draftScopeUnit.name}` : ''}`}</h3>
            <p className="m-0 text-xs text-text-muted">Tạo một lần tại Operations; sự kiện công khai sẽ tự xuất hiện trên Lịch.</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button>
      </div>
      {formBody}
    </Surface>
  )
}
