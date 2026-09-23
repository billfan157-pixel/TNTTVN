import { useState } from 'react'
import {
  Calendar,
  CalendarCheck,
  CalendarPlus,
  Check,
  Clock,
  Eye,
  Globe,
  Layers,
  Lock,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { Badge, Button, Select, Surface, TextArea, TextInput } from '../common/ui'
import type { OperationEvent } from '../../lib/api/operations'
import { OPERATIONS_POSITION_LABELS_VI } from '../../lib/api/operations'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationsErrorText } from '../../lib/operationsErrors'
import { useOperationsStore } from '../../stores/operationsStore'
import { SmartEventTimePicker } from './SmartEventTimePicker'
import { toIso, EVENT_TYPE_OPTIONS, formatEventSchedule } from './operationsViewHelpers'

/**
 * Common quick-pick venues for parish events.
 */
const COMMON_VENUES = ['Nhà thờ', 'Hội trường Giáo xứ', 'Khuôn viên sinh hoạt', 'Sân bóng xứ']

/**
 * Suggested primary workstream roles for multi-department events.
 */
const SUGGESTED_WORKSTREAMS = [
  'Ban Phụng vụ & Lễ tân',
  'Ban Hậu cần & Ẩm thực',
  'Ban Kỷ luật & Trật tự',
  'Ban Y tế & Sơ cấp cứu',
  'Ban Kỹ thuật & Âm thanh',
]

/**
 * Smart Multi-Step Event Creation Wizard Studio (Catevia Design System v4.5 & Rule 6).
 * Features 3 progressive steps:
 * 1. Căn tính & Loại hình (Identity, Type, Scope & Organizer)
 * 2. Thời gian & Không gian (Schedule, Venue & Smart Time Picker)
 * 3. Quy mô & Xem trước (Scale, Workstream hints & Live Visual Preview)
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
  /** `sheet` = body only inside ModalShell. */
  variant?: 'card' | 'sheet'
}) {
  const isOnline = useOnlineStatus()
  const source = useOperationsStore(s => s.source)
  const permissions = useOperationsStore(s => s.permissions)
  const creationOptions = useOperationsStore(s => s.creationOptions)
  const parishTimezone = useOperationsStore(s => s.parishTimezone)
  const browserTimezone = typeof Intl !== 'undefined' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || '') : ''
  const effectiveTimezone = parishTimezone || browserTimezone || 'Asia/Ho_Chi_Minh'
  const timezoneMismatch = Boolean(parishTimezone && browserTimezone && parishTimezone !== browserTimezone)
  const createEvent = useOperationsStore(s => s.createEvent)
  const selectEvent = useOperationsStore(s => s.selectEvent)
  const canMutate = isOnline && source === 'server'
  const canCreateXuDoan = Boolean(creationOptions?.canCreateXuDoanEvent)
  const unitCreationOptions = creationOptions?.units ?? []
  const canCreateAnyUnitEvent = unitCreationOptions.some(unit => unit.canCreateEvent)

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    startsAt: '',
    endsAt: '',
    eventType: 'OTHER',
    location: '',
    expectedHeadcount: '',
    visibility: 'INTERNAL' as OperationEvent['visibility'],
    scopeKind: initialScopeKind,
    scopeUnitId: initialScopeUnitId,
    organizerUserId: '',
  })
  const [selectedPresets, setSelectedPresets] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { stableKey, releaseKey } = useStableCommandKey()

  const draftScopeUnit = unitCreationOptions.find(unit => unit.id === draft.scopeUnitId) ?? null
  const draftOrganizers = draft.scopeKind === 'XU_DOAN'
    ? (creationOptions?.xuDoanOrganizers ?? [])
    : (draftScopeUnit?.organizers ?? [])
  const effectiveOrganizerId = draft.organizerUserId || (draftOrganizers.length === 1 ? draftOrganizers[0].userId : '')

  const scheduleInvalid = Boolean(draft.startsAt && draft.endsAt && draft.endsAt <= draft.startsAt)
  const formDirty = Boolean(draft.title.trim() || draft.startsAt || draft.endsAt || draft.organizerUserId || (draft.scopeKind === 'UNIT' && draft.scopeUnitId))
  const missingFields: string[] = []
  if (!draft.title.trim()) missingFields.push('Nhập tên sự kiện.')
  if (!draft.startsAt || !draft.endsAt) missingFields.push('Chọn thời gian bắt đầu và kết thúc.')
  if (scheduleInvalid) missingFields.push('Giờ kết thúc phải sau giờ bắt đầu.')
  if (draft.scopeKind === 'UNIT' && !draft.scopeUnitId) missingFields.push('Chọn Ban/Ngành phụ trách.')
  if (draftOrganizers.length > 1 && !effectiveOrganizerId) missingFields.push('Chọn người chịu trách nhiệm (Organizer).')
  const showMissingHint = formDirty && missingFields.length > 0 && !creating

  const selectedOrganizerName = draftOrganizers.find(person => person.userId === effectiveOrganizerId)?.displayName || 'Chưa chọn'
  const eventTypeLabel = EVENT_TYPE_OPTIONS.find(opt => opt.value === draft.eventType)?.label || draft.eventType

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (creating) return
    if (!draft.title.trim() || !draft.startsAt || !draft.endsAt || draft.endsAt <= draft.startsAt) return
    if (draft.scopeKind === 'UNIT' && !draft.scopeUnitId) return
    setCreating(true)
    setFormError(null)
    try {
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        eventType: draft.eventType,
        startsAt: toIso(draft.startsAt),
        endsAt: toIso(draft.endsAt),
        timezone: effectiveTimezone,
        location: draft.location.trim() || null,
        expectedHeadcount: draft.expectedHeadcount ? Number(draft.expectedHeadcount) : null,
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
    } finally {
      setCreating(false)
    }
  }

  const togglePreset = (name: string) => {
    setSelectedPresets(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name],
    )
  }

  const stepItems = [
    { step: 1 as const, title: 'Căn tính & Quy mô', desc: 'Tên, loại hình & điều hành' },
    { step: 2 as const, title: 'Thời gian & Địa điểm', desc: 'Khung giờ, địa điểm' },
    { step: 3 as const, title: 'Quy mô & Xem trước', desc: 'Sĩ số, nhóm & kiểm tra' },
  ]

  const formBody = (
    <form className="space-y-4" onSubmit={handleCreate}>
      {/* 1. Thanh Tiến Trình 3 Bước (Wizard Stepper Bar) */}
      <nav aria-label="Các bước tạo sự kiện" className="rounded-xl border border-surface-border bg-surface-ground/40 p-2 shadow-2xs">
        <ol className="grid grid-cols-3 gap-1.5 sm:gap-2 text-xs">
          {stepItems.map(item => {
            const isCurrent = currentStep === item.step
            const isDone = currentStep > item.step
            return (
              <li key={item.step}>
                <button
                  type="button"
                  onClick={() => setCurrentStep(item.step)}
                  className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isCurrent
                      ? 'bg-parish-primary text-text-inverse font-bold shadow-xs'
                      : isDone
                        ? 'bg-surface-card text-text-main hover:bg-surface-hover font-semibold border border-surface-border'
                        : 'text-text-muted hover:bg-surface-hover/70 hover:text-text-main'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                      isCurrent
                        ? 'bg-white/20 text-white'
                        : isDone
                          ? 'bg-parish-success text-white'
                          : 'border border-surface-border bg-surface-sunken text-text-muted'
                    }`}
                  >
                    {isDone ? <Check className="h-3 w-3 stroke-[3]" /> : item.step}
                  </span>
                  <div className="min-w-0 hidden sm:block">
                    <p className="m-0 truncate leading-tight">{item.title}</p>
                    <p className={`m-0 truncate text-xs font-normal ${isCurrent ? 'text-white/80' : 'text-text-muted'}`}>
                      {item.desc}
                    </p>
                  </div>
                  <span className="sm:hidden font-bold truncate">{item.title}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {/* ============================================================== */}
      {/* BƯỚC 1: CĂN TÍNH & QUY MÔ SỰ KIỆN                              */}
      {/* ============================================================== */}
      <div className={currentStep === 1 ? 'space-y-3.5' : 'hidden'} aria-label="Bước 1: Căn tính & Quy mô">
        {canCreateXuDoan && canCreateAnyUnitEvent && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">Phạm vi sự kiện</legend>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Phạm vi sự kiện">
              <Button
                type="button"
                variant={draft.scopeKind === 'XU_DOAN' ? 'primary' : 'secondary'}
                size="sm"
                className="justify-center font-bold"
                onClick={() => setDraft(value => ({ ...value, scopeKind: 'XU_DOAN', scopeUnitId: '', organizerUserId: '' }))}
              >
                Sự kiện Xứ đoàn (Đa mảng)
              </Button>
              <Button
                type="button"
                variant={draft.scopeKind === 'UNIT' ? 'primary' : 'secondary'}
                size="sm"
                className="justify-center font-bold"
                onClick={() => setDraft(value => ({
                  ...value,
                  scopeKind: 'UNIT',
                  scopeUnitId: unitCreationOptions.find(unit => unit.canCreateEvent)?.id ?? '',
                  organizerUserId: '',
                }))}
              >
                Sự kiện chuyên môn Ban / Ngành
              </Button>
            </div>
            <p className="mb-0 mt-1.5 text-xs text-text-muted">
              Sự kiện Xứ đoàn cần phối hợp đa ngành (Hậu cần, Phụng vụ, Trật tự). Sự kiện chuyên môn thuộc riêng một Ban/Ngành.
            </p>
          </fieldset>
        )}

        {draft.scopeKind === 'UNIT' && (
          <label className="block text-sm font-semibold text-text-main">
            Ban / Ngành phụ trách
            <Select
              className="mt-1 w-full"
              value={draft.scopeUnitId}
              required
              onChange={event => setDraft(value => ({ ...value, scopeUnitId: event.target.value, organizerUserId: '' }))}
            >
              <option value="">Chọn Ban / Ngành</option>
              {unitCreationOptions.filter(unit => unit.canCreateEvent).map(unit => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </Select>
          </label>
        )}

        <label className="block text-sm font-semibold text-text-main">
          Tên sự kiện
          <TextInput
            className="mt-1 w-full"
            value={draft.title}
            maxLength={draft.visibility === 'PUBLIC_SUMMARY' ? 200 : 300}
            required
            placeholder="VD: Hội Trại Sa Mạc Bổn Mạng, Lễ Khai Giảng Niên Khóa..."
            onChange={event => setDraft(value => ({ ...value, title: event.target.value }))}
          />
        </label>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="text-sm font-semibold text-text-main">
            Loại sự kiện
            <Select
              className="mt-1 w-full"
              value={draft.eventType}
              onChange={event => setDraft(value => ({ ...value, eventType: event.target.value }))}
            >
              {EVENT_TYPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </label>

          <label className="text-sm font-semibold text-text-main">
            Người chịu trách nhiệm (Organizer)
            <Select
              className="mt-1 w-full"
              value={draft.organizerUserId || (draftOrganizers.length === 1 ? draftOrganizers[0].userId : '')}
              required={draftOrganizers.length > 0}
              disabled={draftOrganizers.length <= 1}
              onChange={event => setDraft(value => ({ ...value, organizerUserId: event.target.value }))}
            >
              {draftOrganizers.length !== 1 && <option value="">Chọn người chịu trách nhiệm</option>}
              {draftOrganizers.map(person => (
                <option key={person.userId} value={person.userId}>
                  {person.displayName}
                  {OPERATIONS_POSITION_LABELS_VI[person.positionCode as keyof typeof OPERATIONS_POSITION_LABELS_VI]
                    ? ` · ${OPERATIONS_POSITION_LABELS_VI[person.positionCode as keyof typeof OPERATIONS_POSITION_LABELS_VI]}`
                    : ''}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">Hiển thị sự kiện</legend>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Hiển thị sự kiện">
            <Button
              type="button"
              variant={draft.visibility === 'INTERNAL' ? 'primary' : 'secondary'}
              size="sm"
              className="justify-center"
              onClick={() => setDraft(value => ({ ...value, visibility: 'INTERNAL' }))}
            >
              Nội bộ
            </Button>
            <Button
              type="button"
              variant={draft.visibility === 'PUBLIC_SUMMARY' ? 'primary' : 'secondary'}
              size="sm"
              className="justify-center"
              disabled={!permissions['operations.event.publish_public']}
              title={!permissions['operations.event.publish_public'] ? 'Bạn chưa có quyền công khai sự kiện.' : undefined}
              onClick={() => setDraft(value => ({ ...value, visibility: 'PUBLIC_SUMMARY' }))}
            >
              Công khai
            </Button>
          </div>
          <p className="mb-0 mt-1.5 text-xs text-text-muted">
            {permissions['operations.event.publish_public']
              ? 'Công khai tự sinh mục Lịch và thông báo phụ huynh.'
              : 'Bạn chỉ được tạo sự kiện nội bộ trong phạm vi phụ trách; việc công khai cần quyền riêng.'} Task, phân công, readiness và hậu kiểm không bao giờ xuất hiện trên Lịch.
          </p>
        </fieldset>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setCurrentStep(2)}
            trailingIcon={<ChevronRight className="h-4 w-4" />}
          >
            Tiếp tục: Thời gian &amp; Địa điểm
          </Button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* BƯỚC 2: THỜI GIAN & KHÔNG GIAN                                 */}
      {/* ============================================================== */}
      <div className={currentStep === 2 ? 'space-y-3.5' : 'hidden'} aria-label="Bước 2: Thời gian & Không gian">
        <SmartEventTimePicker
          className="w-full"
          startsAt={draft.startsAt}
          endsAt={draft.endsAt}
          eventType={draft.eventType}
          required
          idPrefix="create-event"
          onChange={({ startsAt, endsAt }) => setDraft(value => ({ ...value, startsAt, endsAt }))}
        />

        {timezoneMismatch && (
          <p role="note" className="m-0 rounded-lg border border-surface-border bg-surface-ground/50 p-2.5 text-xs text-text-muted">
            Giờ lưu theo <span className="font-bold text-text-main">Giờ Xứ đoàn ({effectiveTimezone})</span>; máy bạn đang ở {browserTimezone}.
          </p>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-text-main">
            Địa điểm
            <TextInput
              className="mt-1 w-full"
              value={draft.location}
              maxLength={draft.visibility === 'PUBLIC_SUMMARY' ? 200 : 300}
              placeholder="VD: Hội trường lớn, Khuôn viên sân nhà thờ..."
              onChange={event => setDraft(value => ({ ...value, location: event.target.value }))}
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs text-text-muted">Gợi ý nhanh:</span>
            {COMMON_VENUES.map(venue => (
              <button
                key={venue}
                type="button"
                className="rounded-md border border-surface-border bg-surface-card px-2 py-0.5 text-xs font-medium text-text-muted transition-colors hover:border-parish-primary hover:text-parish-primary"
                onClick={() => setDraft(value => ({ ...value, location: venue }))}
              >
                {venue}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-sm font-semibold text-text-main">
          Mô tả sự kiện
          <TextArea
            className="mt-1 w-full"
            value={draft.description}
            maxLength={5000}
            rows={3}
            placeholder="Nội dung tóm tắt, mục tiêu tổ chức, lưu ý hậu cần và trang phục (không bắt buộc)..."
            onChange={event => setDraft(value => ({ ...value, description: event.target.value }))}
          />
        </label>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep(1)}
            leadingIcon={<ChevronLeft className="h-4 w-4" />}
          >
            Quay lại bước 1
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setCurrentStep(3)}
            trailingIcon={<ChevronRight className="h-4 w-4" />}
          >
            Tiếp tục: Quy mô &amp; Xem trước
          </Button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* BƯỚC 3: QUY MÔ, NHÓM CÔNG TÁC & XEM TRƯỚC TRỰC QUAN             */}
      {/* ============================================================== */}
      <div className={currentStep === 3 ? 'space-y-3.5' : 'hidden'} aria-label="Bước 3: Quy mô & Xem trước">
        <label className="block text-sm font-semibold text-text-main">
          Số người dự kiến
          <TextInput
            className="mt-1 w-full"
            type="number"
            min={0}
            placeholder="VD: 150"
            value={draft.expectedHeadcount}
            onChange={event => setDraft(value => ({ ...value, expectedHeadcount: event.target.value }))}
          />
        </label>

        {draft.scopeKind === 'XU_DOAN' && (
          <div className="rounded-xl border border-surface-border bg-surface-ground/30 p-3 space-y-2">
            <p className="m-0 text-xs font-bold text-text-main">Đề xuất các Nhóm công tác phối hợp ban đầu:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {SUGGESTED_WORKSTREAMS.map(item => {
                const checked = selectedPresets.includes(item)
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => togglePreset(item)}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs text-left transition-colors ${
                      checked
                        ? 'border-parish-primary bg-parish-primary-light/40 font-bold text-parish-primary'
                        : 'border-surface-border bg-surface-card text-text-muted hover:border-surface-border/80'
                    }`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-parish-primary bg-parish-primary text-text-inverse' : 'border-surface-border'}`}>
                      {checked && <Check className="h-3 w-3 stroke-[3]" />}
                    </span>
                    <span className="truncate">{item}</span>
                  </button>
                )
              })}
            </div>
            <p className="mb-0 mt-1 text-xs text-text-muted">Các nhóm công tác chính thức sẽ được kích hoạt tại tab Nhóm Công Tác sau khi tạo sự kiện.</p>
          </div>
        )}

        {/* THẺ XEM TRƯỚC TRỰC QUAN (LIVE EVENT PREVIEW CARD) */}
        <div className="space-y-1.5 pt-1">
          <p className="m-0 text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-parish-primary" />
            Xem trước thông tin sự kiện
          </p>
          <div className="rounded-xl border-2 border-dashed border-parish-primary/30 bg-surface-card p-3.5 sm:p-4 space-y-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="primary" className="font-extrabold text-xs">
                  {eventTypeLabel}
                </Badge>
                <Badge tone="neutral" className="text-xs">
                  {draft.scopeKind === 'XU_DOAN' ? 'Sự kiện Xứ đoàn' : (draftScopeUnit?.name ?? 'Chuyên môn')}
                </Badge>
                <Badge tone={draft.visibility === 'PUBLIC_SUMMARY' ? 'success' : 'neutral'} className="text-xs">
                  {draft.visibility === 'PUBLIC_SUMMARY' ? 'Công khai Lịch' : 'Nội bộ'}
                </Badge>
              </div>
              <span className="text-xs font-semibold text-text-muted">Bản nháp ban đầu</span>
            </div>

            <h4 className="m-0 text-base font-extrabold text-text-main">
              {draft.title.trim() || 'Tên sự kiện chưa nhập'}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-text-muted">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-parish-primary shrink-0" />
                <span className="font-medium text-text-main truncate">
                  {draft.startsAt && draft.endsAt
                    ? formatEventSchedule(toIso(draft.startsAt), toIso(draft.endsAt), effectiveTimezone)
                    : 'Chưa chọn đầy đủ thời gian'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-parish-primary shrink-0" />
                <span className="font-medium text-text-main truncate">
                  {draft.location.trim() || 'Chưa thiết lập địa điểm'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-parish-primary shrink-0" />
                <span className="font-medium text-text-main truncate">
                  Phụ trách: {selectedOrganizerName}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-parish-primary shrink-0" />
                <span className="font-medium text-text-main truncate">
                  Dự kiến: {draft.expectedHeadcount ? `${draft.expectedHeadcount} người` : 'Chưa nhập số lượng'}
                </span>
              </div>
            </div>

            {draft.description.trim() && (
              <p className="m-0 pt-2 border-t border-surface-border text-xs text-text-muted line-clamp-2">
                {draft.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep(2)}
            leadingIcon={<ChevronLeft className="h-4 w-4" />}
          >
            Quay lại bước 2
          </Button>
        </div>
      </div>

      {/* Thông báo thiếu dữ liệu hoặc lỗi */}
      {showMissingHint && (
        <ul role="status" className="m-0 space-y-0.5 rounded-lg border border-parish-warning/30 bg-parish-warning-bg/30 p-2.5 text-xs text-parish-warning">
          {missingFields.map(field => <li key={field}>{field}</li>)}
        </ul>
      )}

      {/* FOOTER ACTIONS CHÍNH */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-surface-border">
        {formError && <p role="alert" className="m-0 text-xs text-parish-danger">{formError}</p>}
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="submit"
            size="sm"
            loading={creating}
            disabled={!canMutate || missingFields.length > 0}
            leadingIcon={<CalendarPlus className="h-4 w-4" />}
          >
            Lưu bản nháp
          </Button>
        </div>
      </div>
    </form>
  )

  if (variant === 'sheet') {
    return (
      <div className="space-y-3.5" aria-label="Tạo sự kiện mới">
        <p className="m-0 text-xs text-text-muted">Khởi tạo sự kiện tại Operations; sự kiện công khai sẽ tự động xuất hiện trên Lịch Xứ đoàn.</p>
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
            <h3 className="m-0 text-base font-extrabold text-text-main">
              {draft.scopeKind === 'XU_DOAN' ? 'Tạo sự kiện Xứ đoàn' : `Tạo sự kiện chuyên môn${draftScopeUnit ? ` · ${draftScopeUnit.name}` : ''}`}
            </h3>
            <p className="m-0 text-xs text-text-muted">Tạo một lần tại Operations; sự kiện công khai sẽ tự xuất hiện trên Lịch.</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button>
      </div>
      {formBody}
    </Surface>
  )
}
