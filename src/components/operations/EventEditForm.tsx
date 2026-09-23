import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { Badge, Button, Select, TextArea, TextInput } from '../common/ui'
import type { OperationEvent, OperationEventDetail } from '../../lib/api/operations'
import { OPERATIONS_POSITION_LABELS_VI } from '../../lib/api/operations'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationsErrorText } from '../../lib/operationsErrors'
import { useOperationsStore } from '../../stores/operationsStore'
import { useToastStore } from '../../stores/toastStore'
import { SmartEventTimePicker } from './SmartEventTimePicker'
import { toDateTimeInput, toIso, EVENT_TYPE_OPTIONS } from './operationsViewHelpers'

/** In-modal event edit form with local draft state. */
export function EventEditForm({ detail }: { detail: OperationEventDetail }) {
  const isOnline = useOnlineStatus()
  const source = useOperationsStore(s => s.source)
  const updateEvent = useOperationsStore(s => s.updateEvent)
  const selectEvent = useOperationsStore(s => s.selectEvent)
  const creationOptions = useOperationsStore(s => s.creationOptions)
  const canMutate = isOnline && source === 'server'

  const [draft, setDraft] = useState({ title: '', description: '', eventType: 'OTHER', startsAt: '', endsAt: '', location: '', expectedHeadcount: '', organizerUserId: '', visibility: 'INTERNAL' as OperationEvent['visibility'] })
  const [saving, setSaving] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const dirty = useRef(false)
  const lastEventId = useRef<string | null>(null)
  const { stableKey, releaseKey } = useStableCommandKey()

  useEffect(() => {
    if (detail.event.id !== lastEventId.current || !dirty.current) {
      lastEventId.current = detail.event.id
      dirty.current = false
      setDraft({
        title: detail.event.title,
        description: detail.event.description ?? '',
        eventType: detail.event.eventType,
        startsAt: toDateTimeInput(detail.event.startsAt),
        endsAt: toDateTimeInput(detail.event.endsAt),
        location: detail.event.location ?? '',
        expectedHeadcount: detail.event.expectedHeadcount != null ? String(detail.event.expectedHeadcount) : '',
        organizerUserId: '',
        visibility: detail.event.visibility,
      })
      setFormError(null)
    }
  }, [detail])

  const markDirty = () => { dirty.current = true }

  // W2.1: organizer swap. The server only accepts it with create authority on
  // this scope (leader rules re-checked there); the picker is offered only
  // when creation-options lists candidate leaders for the event's unit —
  // otherwise it stays display-only.
  const scopeType = detail.event.eventScopeType ?? (detail.event.scopeUnitId ? 'UNIT' : 'XU_DOAN')
  const organizerOptions = scopeType === 'XU_DOAN'
    ? (creationOptions?.xuDoanOrganizers ?? [])
    : (creationOptions?.units.find(unit => unit.id === detail.event.scopeUnitId)?.organizers ?? [])
  const canSwapOrganizer = Boolean(detail.permissions['operations.event.create'] && organizerOptions.length > 0)
  const headcountNumber = draft.expectedHeadcount === '' ? null : Number(draft.expectedHeadcount)

  // W2.7: same silent-dead-button fix as CreateEventForm — the edit form is
  // prefilled, so this mostly catches "cleared the title" / invalid schedule.
  const missingFields: string[] = []
  if (!draft.title.trim()) missingFields.push('Tên sự kiện không được để trống.')
  if (!draft.startsAt || !draft.endsAt) missingFields.push('Chọn thời gian bắt đầu và kết thúc.')
  else if (draft.endsAt <= draft.startsAt) missingFields.push('Giờ kết thúc phải sau giờ bắt đầu.')
  if (headcountNumber !== null && (!Number.isInteger(headcountNumber) || headcountNumber < 0)) missingFields.push('Số người dự kiến phải là số nguyên không âm.')
  const showMissingHint = dirty.current && missingFields.length > 0 && !saving

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (!draft.title.trim() || !draft.startsAt || !draft.endsAt || draft.endsAt <= draft.startsAt) return
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        version: detail.event.version,
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        eventType: draft.eventType,
        startsAt: toIso(draft.startsAt),
        endsAt: toIso(draft.endsAt),
        timezone: detail.event.timezone,
        location: draft.location.trim() || null,
        expectedHeadcount: headcountNumber,
        visibility: draft.visibility,
        // Swapping to a user organizer must clear a person organizer in the
        // same command (server rejects both set).
        ...(draft.organizerUserId && draft.organizerUserId !== detail.event.organizerUserId
          ? { organizerUserId: draft.organizerUserId, organizerPersonId: null }
          : {}),
      }
      await updateEvent(detail.event.id, payload, stableKey('update-event', { id: detail.event.id, ...payload }))
      releaseKey('update-event')
      dirty.current = false
      useToastStore.getState().addToast('Đã lưu thông tin sự kiện.', 'success')
      await selectEvent(detail.event.id)
    } catch (error: any) {
      setFormError(operationsErrorText(error?.code, error?.message || 'Không thể cập nhật thông tin sự kiện'))
    } finally { setSaving(false) }
  }

  return (
    <form className="rounded-2xl border border-surface-border bg-surface-card p-3.5 sm:p-4 space-y-3.5 shadow-2xs" aria-label="Sửa thông tin sự kiện" onSubmit={handleSave}>
      <div className="flex items-center justify-between gap-2 border-b border-surface-border/70 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <div>
            <h3 className="m-0 text-sm font-extrabold text-text-main">Thông tin sự kiện</h3>
            <p className="mb-0 mt-0.5 text-xs text-text-muted">Operations là nơi duy nhất sửa dữ liệu; Lịch chỉ hiển thị bản chiếu công khai.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={draft.visibility === 'PUBLIC_SUMMARY' ? 'success' : 'neutral'}>
            {draft.visibility === 'PUBLIC_SUMMARY' ? 'Công khai' : 'Nội bộ'}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-[44px] sm:min-h-0 text-xs font-semibold"
            onClick={() => setIsExpanded(prev => !prev)}
            aria-expanded={isExpanded}
            leadingIcon={isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          >
            {isExpanded ? 'Thu gọn' : 'Chỉnh sửa'}
          </Button>
        </div>
      </div>

      {!isExpanded && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-ground/50 px-3 py-2 text-xs text-text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text-main">{draft.title || 'Chưa đặt tên'}</span>
            <span>·</span>
            <span>{draft.location || 'Chưa có địa điểm'}</span>
            {draft.expectedHeadcount && (
              <>
                <span>·</span>
                <span>Dự kiến: {draft.expectedHeadcount} người</span>
              </>
            )}
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-parish-primary hover:underline min-h-[44px] sm:min-h-0 inline-flex items-center"
            onClick={() => setIsExpanded(true)}
          >
            Mở rộng chỉnh sửa
          </button>
        </div>
      )}

      <div className={isExpanded ? 'space-y-3.5' : 'hidden'}>
        <fieldset>
          <legend className="mb-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">Hiển thị sự kiện</legend>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sửa hiển thị sự kiện">
            <Button
              type="button"
              variant={draft.visibility === 'INTERNAL' ? 'primary' : 'secondary'}
              size="sm"
              className="min-h-[44px] sm:min-h-0"
              disabled={saving || !detail.permissions['operations.event.create']}
              onClick={() => { markDirty(); setDraft(value => ({ ...value, visibility: 'INTERNAL' })) }}
            >
              Nội bộ
            </Button>
            <Button
              type="button"
              variant={draft.visibility === 'PUBLIC_SUMMARY' ? 'primary' : 'secondary'}
              size="sm"
              className="min-h-[44px] sm:min-h-0"
              disabled={saving || !detail.permissions['operations.event.publish_public']}
              title={!detail.permissions['operations.event.publish_public'] ? 'Bạn chưa có quyền công khai sự kiện.' : undefined}
              onClick={() => { markDirty(); setDraft(value => ({ ...value, visibility: 'PUBLIC_SUMMARY' })) }}
            >
              Công khai
            </Button>
          </div>
          <p className="mb-0 mt-1.5 text-xs text-text-muted">Bật Công khai sẽ tự tạo/cập nhật Lịch và xếp thông báo phụ huynh; dữ liệu vận hành vẫn nội bộ.</p>
        </fieldset>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="text-sm font-semibold text-text-main sm:col-span-2">Tên sự kiện
            <TextInput className="mt-1 w-full" value={draft.title} required maxLength={draft.visibility === 'PUBLIC_SUMMARY' ? 200 : 300} disabled={saving} onChange={event => { markDirty(); setDraft(value => ({ ...value, title: event.target.value })) }} />
          </label>
          <label className="text-sm font-semibold text-text-main sm:col-span-2">Mô tả sự kiện
            <TextArea className="mt-1 w-full" value={draft.description} maxLength={5000} disabled={saving} placeholder="Diễn biến, lưu ý chung (không bắt buộc)" onChange={event => { markDirty(); setDraft(value => ({ ...value, description: event.target.value })) }} />
          </label>
          <label className="text-sm font-semibold text-text-main">Loại sự kiện
            <Select className="mt-1 w-full" value={draft.eventType} disabled={saving} onChange={event => { markDirty(); setDraft(value => ({ ...value, eventType: event.target.value })) }}>
              {EVENT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </label>
          <label className="text-sm font-semibold text-text-main">Địa điểm
            <TextInput className="mt-1 w-full" value={draft.location} maxLength={draft.visibility === 'PUBLIC_SUMMARY' ? 200 : 300} disabled={saving} onChange={event => { markDirty(); setDraft(value => ({ ...value, location: event.target.value })) }} />
          </label>
          <label className="text-sm font-semibold text-text-main">Số người dự kiến
            <TextInput className="mt-1 w-full" type="number" min={0} value={draft.expectedHeadcount} disabled={saving} onChange={event => { markDirty(); setDraft(value => ({ ...value, expectedHeadcount: event.target.value })) }} />
          </label>
          {canSwapOrganizer && (
            <label className="text-sm font-semibold text-text-main">Người chịu trách nhiệm (Organizer)
              <Select className="mt-1 w-full" value={draft.organizerUserId || detail.event.organizerUserId || ''} disabled={saving} onChange={event => { markDirty(); setDraft(value => ({ ...value, organizerUserId: event.target.value })) }}>
                {detail.event.organizerUserId && !organizerOptions.some(person => person.userId === detail.event.organizerUserId) && (
                  <option value={detail.event.organizerUserId}>{detail.organizer?.displayName ?? 'Organizer hiện tại'}</option>
                )}
                {organizerOptions.map(person => (
                  <option key={person.userId} value={person.userId}>{person.displayName}{OPERATIONS_POSITION_LABELS_VI[person.positionCode as keyof typeof OPERATIONS_POSITION_LABELS_VI] ? ` · ${OPERATIONS_POSITION_LABELS_VI[person.positionCode as keyof typeof OPERATIONS_POSITION_LABELS_VI]}` : ''}</option>
                ))}
              </Select>
              <span className="mt-1 block text-xs font-normal text-text-muted">Máy chủ kiểm tra lại điều kiện trưởng ban đương nhiệm khi lưu.</span>
            </label>
          )}
          <SmartEventTimePicker
            className="sm:col-span-2"
            startsAt={draft.startsAt}
            endsAt={draft.endsAt}
            eventType={draft.eventType}
            disabled={saving}
            required
            idPrefix="edit-event"
            onChange={({ startsAt, endsAt }) => { markDirty(); setDraft(value => ({ ...value, startsAt, endsAt })) }}
          />
        </div>
        {showMissingHint && (
          <ul role="status" className="m-0 space-y-0.5 rounded-lg border border-parish-warning/30 bg-parish-warning-bg/30 p-2 text-xs text-parish-warning">
            {missingFields.map(field => <li key={field}>{field}</li>)}
          </ul>
        )}
        <div className="flex items-center justify-end gap-2">
          {formError && <p role="alert" className="m-0 text-xs text-parish-danger">{formError}</p>}
          <Button type="submit" size="sm" className="min-h-[44px] sm:min-h-0" loading={saving} disabled={!canMutate || missingFields.length > 0}>
            Lưu thay đổi
          </Button>
        </div>
      </div>
    </form>
  )
}
