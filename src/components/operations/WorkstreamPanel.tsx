import { useEffect, useRef, useState } from 'react'
import {
  Building2,
  ChevronRight,
  ClipboardList,
  Layers,
  Plus,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { Badge, Button, Select, TextInput } from '../common/ui'
import {
  operationsApi,
  type OperationEventDetail,
  type OperationWorkstreamDetail,
  type OperationWorkstreamMember,
  OPERATIONS_POSITION_LABELS_VI,
  type OperationsOrganizerOption,
} from '../../lib/api/operations'
import { getTenantScopeKey } from '../../lib/tenantScope'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationCandidateValue, parseOperationCandidateValue, useOperationCandidates } from '../../hooks/useOperationCandidates'
import { statusTone, taskPhaseLabel } from './operationsViewHelpers'

type Props = {
  event: OperationEventDetail
  enabled: boolean
  refresh: () => Promise<unknown>
  /** Units the caller may own a Field in (from creation-options). Server re-checks. */
  fieldUnits?: Array<{
    id: string
    name: string
    unitType?: 'BRANCH' | 'COMMITTEE'
    organizers?: OperationsOrganizerOption[]
  }>
}
const memberRoles: Record<OperationWorkstreamMember['operationRole'], string> = { WORKSTREAM_LEAD: 'Trưởng nhóm', OBSERVER: 'Theo dõi' }

function localDateTime(iso: string | null) {
  if (!iso) return ''
  const value = new Date(iso)
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

// W3.5 (U-16): editors receive a human `memberLabel` — raw member UUIDs in
// aria-labels made screen readers spell meaningless ids.
function MemberValidityEditor({ member, memberLabel, busy, save }: { member: OperationWorkstreamMember; memberLabel: string; busy: boolean; save: (startsAt: string | null, endsAt: string | null, reason: string) => void }) {
  const [startsAt, setStartsAt] = useState(() => localDateTime(member.startsAt))
  const [endsAt, setEndsAt] = useState(() => localDateTime(member.endsAt))
  const [validityReason, setValidityReason] = useState('')
  useEffect(() => { setStartsAt(localDateTime(member.startsAt)); setEndsAt(localDateTime(member.endsAt)); setValidityReason('') }, [member.endsAt, member.startsAt, member.version])
  const invalidInterval = Boolean(startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime())
  return (
    <div className="mt-3 pt-2.5 border-t border-surface-border/60 grid w-full gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end">
      <div className="space-y-1">
        <label className="block text-xs font-semibold text-text-muted">Bắt đầu vai trò</label>
        <TextInput aria-label={`Bắt đầu vai trò của ${memberLabel}`} type="datetime-local" value={startsAt} disabled={busy} onChange={event => setStartsAt(event.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-semibold text-text-muted">Kết thúc vai trò</label>
        <TextInput aria-label={`Kết thúc vai trò của ${memberLabel}`} type="datetime-local" value={endsAt} disabled={busy} onChange={event => setEndsAt(event.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-semibold text-text-muted">Lý do đổi thời hạn</label>
        <TextInput aria-label={`Lý do đổi thời hạn vai trò của ${memberLabel}`} value={validityReason} maxLength={2000} required disabled={busy} placeholder="Lý do đổi thời hạn" onChange={event => setValidityReason(event.target.value)} />
      </div>
      <div className="pt-1 sm:pt-0">
        <Button size="sm" variant="secondary" className="w-full sm:w-auto whitespace-nowrap min-h-9 px-4" disabled={busy || invalidInterval || !validityReason.trim()} onClick={() => save(startsAt ? new Date(startsAt).toISOString() : null, endsAt ? new Date(endsAt).toISOString() : null, validityReason.trim())}>Lưu thời hạn</Button>
      </div>
    </div>
  )
}

export function WorkstreamPanel({ event, enabled, refresh, fieldUnits = [] }: Props) {
  const [detail, setDetail] = useState<OperationWorkstreamDetail | null>(null)
  const [name, setName] = useState('')
  const [required, setRequired] = useState(false)
  const [sourceUnitId, setSourceUnitId] = useState('')
  const [candidateValue, setCandidateValue] = useState('')
  const [currentLeadId, setCurrentLeadId] = useState('')
  const [role, setRole] = useState<OperationWorkstreamMember['operationRole']>('OBSERVER')
  const [showHandoverForm, setShowHandoverForm] = useState(false)
  // One reason draft per destructive command: a reason typed for "remove
  // member" must never silently satisfy the mandatory reason of "lead
  // handover" or "report blocked" (P1-9).
  const [removeReasons, setRemoveReasons] = useState<Record<string, string>>({})
  const [leadReplaceReason, setLeadReplaceReason] = useState('')
  const [blockedReason, setBlockedReason] = useState('')
  // W2.5: inline rename/description editor for one group (PUT /workstreams/:id).
  const [editingGroup, setEditingGroup] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editRequired, setEditRequired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const generation = useRef(0)
  const inFlight = useRef(false)
  const detailSectionRef = useRef<HTMLDivElement | null>(null)
  const { stableKey, releaseKey } = useStableCommandKey()
  useEffect(() => () => { generation.current++ }, [])
  useEffect(() => {
    setShowHandoverForm(false)
    setShowDeleteConfirm(false)
    setLeadReplaceReason('')
    setCandidateValue('')
  }, [detail?.workstream.id])
  const writable = enabled && ['DRAFT', 'PLANNING', 'PREPARING', 'READY'].includes(event.event.status)
  const isXuDoanEvent = (event.event.eventScopeType ?? (event.event.scopeUnitId ? 'UNIT' : 'XU_DOAN')) === 'XU_DOAN'
  const isLive = event.event.status === 'LIVE'
  // U-21: tầng Mảng gọi WORKSTREAM_LEAD là "Trưởng Mảng" và Mảng luôn thuộc một
  // Ban/Ngành — UI phải nói đúng tầng trách nhiệm mà server đang enforce.
  const leadRoleLabel = isXuDoanEvent ? 'Trưởng Mảng' : 'Trưởng nhóm'
  const unitNameOf = (unitId: string | null | undefined) => (unitId ? fieldUnits.find(unit => unit.id === unitId)?.name ?? null : null)
  const defaultUnitLeader = (unitId: string | null | undefined): OperationsOrganizerOption | null => {
    if (!unitId) return null
    const unit = fieldUnits.find(u => u.id === unitId)
    return unit?.organizers?.[0] ?? null
  }
  const positionLabelOf = (code?: string) => {
    if (!code) return 'Trưởng Ban/Ngành'
    return OPERATIONS_POSITION_LABELS_VI[code as keyof typeof OPERATIONS_POSITION_LABELS_VI] ?? code
  }
  const roleLabel = (role: OperationWorkstreamMember['operationRole']) => (role === 'WORKSTREAM_LEAD' ? leadRoleLabel : 'Theo dõi')
  // UNIT events inherit the event scope; XU_DOAN Fields must name their owning unit.
  const effectiveSourceUnitId = isXuDoanEvent ? (sourceUnitId || null) : (event.event.scopeUnitId ?? null)
  const needsFieldUnit = isXuDoanEvent && fieldUnits.length > 0 && !effectiveSourceUnitId
  const canAssignLead = Boolean(enabled && detail && detail.permissions['operations.workstream.assign_lead'])
  // U-20/U-21: Trưởng Xứ đoàn bổ nhiệm Field Lead cho Mảng của event Xứ đoàn (ngoài
  // LIVE vẫn hợp lệ), nên khối bổ nhiệm không còn chỉ dành cho LIVE.
  const canManageLead = Boolean(canAssignLead && (writable || isLive))
  const candidateDirectory = useOperationCandidates(detail ? { workstreamId: detail.workstream.id } : null, Boolean(detail && ((writable && detail.permissions['operations.workstream.manage']) || canAssignLead)))
  const candidates = candidateDirectory.candidates.filter(candidate => candidate.eligibility !== 'INELIGIBLE')
  const actionableCandidates = candidates.filter(candidate => candidate.eligibility === 'ACTIONABLE')
  const leadMembers = detail?.members.filter(member => member.operationRole === 'WORKSTREAM_LEAD') ?? []
  const currentLead = leadMembers.find(member => member.id === currentLeadId) ?? leadMembers[0] ?? null
  const defaultLeader = defaultUnitLeader(detail?.workstream.sourceUnitId)
  const hasExplicitLead = leadMembers.length > 0
  const leadNameOf = (member: OperationWorkstreamMember) => {
    const matched = candidates.find(candidate => (member.personId && candidate.personId === member.personId) || (member.userId && candidate.userId === member.userId))
    if (matched?.displayName) return matched.displayName
    if (defaultLeader && ((member.userId && member.userId === defaultLeader.userId) || (member.personId && (defaultLeader as any).personId === member.personId))) {
      return defaultLeader.displayName
    }
    return 'Thành viên được phân công'
  }
  const effectiveLeadName = hasExplicitLead
    ? leadNameOf(currentLead!)
    : (defaultLeader ? defaultLeader.displayName : null)
  const leadSummary = hasExplicitLead
    ? leadMembers.map(leadNameOf).join(', ')
    : (defaultLeader ? `${defaultLeader.displayName} (Mặc định)` : 'Chưa bổ nhiệm')
  // User requirement: Field Lead defaults to Unit Leader (Trưởng Ban/Ngành).
  // - No need to pick candidates or type reasons manually.
  // - Manual handover form is hidden unless:
  //   1) Event is LIVE (atomic shift handover is an operational priority), OR
  //   2) User explicitly clicks "Bàn giao / Đổi Trưởng Mảng" (showHandoverForm === true), OR
  //   3) Neither an explicit lead nor a default leader exists (!hasExplicitLead && !defaultLeader, e.g. test U-21 / fixture).
  const shouldShowForm = Boolean(canManageLead && (isLive || showHandoverForm || (!hasExplicitLead && !defaultLeader)))

  // Stats calculation
  const totalWorkstreams = event.workstreams.length
  const readyWorkstreams = event.workstreams.filter(ws => ws.status === 'READY').length
  const blockedWorkstreams = event.workstreams.filter(ws => ws.status === 'BLOCKED').length
  const preparingWorkstreams = event.workstreams.filter(ws => ws.status !== 'READY' && ws.status !== 'BLOCKED').length

  const run = async (action: () => Promise<void>) => {
    if (inFlight.current || !enabled || !getTenantScopeKey()) return
    inFlight.current = true
    const token = ++generation.current
    const scope = getTenantScopeKey()
    const current = () => token === generation.current && scope !== null && scope === getTenantScopeKey()
    setBusy(true); setError('')
    try { await action() } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : 'Không thực hiện được. Hãy tải lại nhóm.')
    } finally { inFlight.current = false; if (current()) setBusy(false) }
  }
  const load = async (id: string) => {
    const token = generation.current
    const scope = getTenantScopeKey()
    const result = await operationsApi.getWorkstream(id)
    if (token !== generation.current || !scope || scope !== getTenantScopeKey()) return
    if (result.workstream.id !== id || result.workstream.parishId !== event.event.parishId || result.workstream.operationEventId !== event.event.id
      || result.members.some(member => member.parishId !== event.event.parishId || member.workstreamId !== id)) throw new Error('Chi tiết nhóm không đúng phạm vi sự kiện.')
    setDetail(result)
  }
  const mutate = (action: () => Promise<unknown>, permitted = writable) => run(async () => {
    if (!permitted || !detail) return
    const scope = getTenantScopeKey()
    const token = generation.current
    try { await action() } catch (failure) {
      if (scope && scope === getTenantScopeKey() && token === generation.current) {
        // Discard stale permissions and versions; require an explicit reload.
        setDetail(null)
      }
      throw failure
    }
    if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
    await load(detail.workstream.id)
    if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
    await refresh()
  })

  // Filter tasks belonging to currently selected workstream
  const tasksInCurrentWorkstream = detail ? (event.tasks ?? []).filter(t => t.workstreamId === detail.workstream.id) : []

  return (
    <section className="space-y-4 rounded-xl border border-surface-border bg-surface-card p-4 shadow-xs" aria-label={isXuDoanEvent ? 'Mảng phụ trách' : 'Nhóm công việc'}>
      {/* 1. HEADER & GIẢI THÍCH PHÂN CẤP */}
      <div className="border-b border-surface-border pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="m-0 text-base font-extrabold text-text-main">
                {isXuDoanEvent ? 'Mảng & Ban/Ngành phụ trách' : 'Nhóm công việc'}
              </h3>
              <p className="m-0 text-xs text-text-muted">
                {isXuDoanEvent
                  ? 'Cơ chế phân cấp Xứ đoàn: Giao Mảng cho Ban/Ngành & Bổ nhiệm Trưởng Ban/Ngành điều hành.'
                  : 'Phân chia các nhóm chuyên trách cho sự kiện.'}
              </p>
            </div>
          </div>
          {writable && event.permissions['operations.workstream.create'] && (
            <Button
              variant={showCreateForm ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setShowCreateForm(prev => !prev)}
            >
              {showCreateForm ? 'Đóng tạo mảng' : isXuDoanEvent ? '+ Thêm Mảng & Giao Ban/Ngành' : '+ Thêm nhóm'}
            </Button>
          )}
        </div>

        {/* Thống kê chỉ số nhanh */}
        {totalWorkstreams > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-surface-border bg-surface-ground/40 px-3 py-2">
              <span className="text-xs text-text-muted">Tổng số Mảng</span>
              <p className="m-0 text-lg font-black text-text-main">{totalWorkstreams}</p>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-ground/40 px-3 py-2">
              <span className="text-xs text-text-muted">Đã sẵn sàng</span>
              <p className="m-0 text-lg font-black text-parish-success">{readyWorkstreams}</p>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-ground/40 px-3 py-2">
              <span className="text-xs text-text-muted">Đang chuẩn bị</span>
              <p className="m-0 text-lg font-black text-parish-warning">{preparingWorkstreams}</p>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-ground/40 px-3 py-2">
              <span className="text-xs text-text-muted">Bị chặn</span>
              <p className="m-0 text-lg font-black text-parish-danger">{blockedWorkstreams}</p>
            </div>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-parish-danger bg-parish-danger-bg p-3 rounded-lg">{error}</p>}

      {/* 2. FORM TẠO MẢNG MỚI (COLLAPSIBLE / CONDITIONAL) */}
      {writable && event.permissions['operations.workstream.create'] && (showCreateForm || totalWorkstreams === 0) && (
        <form
          className="rounded-xl border border-surface-border bg-surface-ground/40 p-4 sm:p-5 space-y-4 shadow-xs"
          onSubmit={e => {
            e.preventDefault()
            void run(async () => {
              const scope = getTenantScopeKey(); const token = generation.current
              const payload = {
                eventId: event.event.id,
                sourceUnitId: effectiveSourceUnitId,
                name: name.trim(),
                isRequired: required,
                autoAssignLeader: true,
              }
              const created = await operationsApi.createWorkstream(payload, stableKey('workstream-create', payload))
              releaseKey('workstream-create')
              if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
              await load(created.id)
              if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
              setName(''); setRequired(false); setSourceUnitId(''); setShowCreateForm(false); await refresh()
            })
          }}
        >
          <div className="flex items-center gap-2 font-bold text-sm text-text-main">
            <Plus className="h-4 w-4 text-parish-primary" />
            <span>{isXuDoanEvent ? 'Tạo Mảng mới & Phân công Ban/Ngành phụ trách' : 'Tạo nhóm công việc mới'}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ws-create-name" className="mb-1.5 block text-xs font-semibold text-text-muted">
                {isXuDoanEvent ? 'Tên Mảng phụ trách *' : 'Tên nhóm *'}
              </label>
              <TextInput
                id="ws-create-name"
                aria-label={isXuDoanEvent ? 'Tên mảng phụ trách' : 'Tên nhóm công việc'}
                placeholder={isXuDoanEvent ? 'VD: Phụng vụ, Hậu cần, Kỹ thuật...' : 'Tên nhóm công việc'}
                className="w-full"
                value={name}
                maxLength={200}
                required
                onChange={e => setName(e.target.value)}
              />
            </div>
            {isXuDoanEvent && fieldUnits.length > 0 && (
              <div>
                <label htmlFor="ws-create-unit" className="mb-1.5 block text-xs font-semibold text-text-muted">
                  Ban/Ngành chịu trách nhiệm *
                </label>
                <Select
                  id="ws-create-unit"
                  aria-label="Ban/Ngành phụ trách mảng"
                  className="w-full"
                  value={sourceUnitId}
                  required
                  onChange={e => setSourceUnitId(e.target.value)}
                >
                  <option value="">Chọn Ban/Ngành phụ trách</option>
                  {fieldUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </Select>
                {sourceUnitId && defaultUnitLeader(sourceUnitId) && (
                  <div className="mt-2 rounded-lg bg-parish-primary-light/40 border border-parish-primary/20 p-2.5 text-xs text-text-main flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-parish-primary shrink-0" />
                    <span>
                      <strong>Trưởng Mảng mặc định:</strong> {defaultUnitLeader(sourceUnitId)?.displayName} ({positionLabelOf(defaultUnitLeader(sourceUnitId)?.positionCode)}). Sẽ được tự động gán khi tạo mảng.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-surface-border">
            <label className="flex items-center gap-2 text-xs font-medium text-text-main cursor-pointer select-none">
              <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
              <span>{isXuDoanEvent ? 'Mảng bắt buộc (sự kiện không thể hoàn tất nếu mảng chưa xong)' : 'Nhóm bắt buộc'}</span>
            </label>
            <div className="flex items-center gap-2.5">
              {totalWorkstreams > 0 && (
                <Button type="button" variant="ghost" className="min-h-10 px-4" onClick={() => setShowCreateForm(false)}>
                  Hủy
                </Button>
              )}
              <Button type="submit" className="min-h-10 px-5 whitespace-nowrap" disabled={busy || !name.trim() || needsFieldUnit}>
                {isXuDoanEvent ? 'Tạo & Giao Mảng' : 'Tạo nhóm'}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* 3. DANH SÁCH LƯỚI THẺ MẢNG (WORKSTREAM CARD GRID) */}
      {totalWorkstreams === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-6 text-center space-y-2">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-surface-ground text-text-muted">
            <Building2 className="h-5 w-5" />
          </div>
          <p className="m-0 text-sm font-bold text-text-main">
            {isXuDoanEvent ? 'Chưa có Mảng nào được phân công' : 'Chưa có nhóm công tác nào'}
          </p>
          <p className="m-0 text-xs text-text-muted max-w-md mx-auto">
            {isXuDoanEvent
              ? 'Theo cơ chế phân cấp Xứ đoàn, hãy tạo các Mảng (Ban Phụng Vụ, Ban Hậu Cần, Ngành Thiếu...) và bổ nhiệm Trưởng ban trước khi giao việc chi tiết.'
              : 'Hãy tạo nhóm công tác để phân chia phần việc cho sự kiện.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={isXuDoanEvent ? 'Danh sách Mảng' : 'Danh sách nhóm'}>
            {event.workstreams.map(group => {
              const isSelected = detail?.workstream.id === group.id
              return (
                <Button
                  key={group.id}
                  variant={isSelected ? 'primary' : 'secondary'}
                  size="sm"
                  disabled={!enabled || busy}
                  onClick={() => void run(() => load(group.id))}
                >
                  {group.name}{group.isRequired ? ' · Bắt buộc' : ''}{group.blockedReason ? ' · Bị chặn' : ''}
                </Button>
              )
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {event.workstreams.map(group => {
              const isSelected = detail?.workstream.id === group.id
              const owningUnit = unitNameOf(group.sourceUnitId)
              const taskCount = (event.tasks ?? []).filter(t => t.workstreamId === group.id).length
              const doneCount = (event.tasks ?? []).filter(t => t.workstreamId === group.id && t.status === 'DONE').length
              const status = group.status ?? 'PREPARING'

              return (
                <div
                  key={group.id}
                  className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition-colors ${
                    isSelected
                      ? 'border-parish-primary bg-parish-primary-light/20 shadow-xs ring-1 ring-parish-primary'
                      : 'border-surface-border bg-surface-card hover:border-surface-border-strong hover:shadow-xs'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="m-0 text-sm font-bold text-text-main truncate">{group.name}</h4>
                        {owningUnit && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-text-muted">
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{owningUnit}</span>
                          </span>
                        )}
                      </div>
                      <Badge tone={status === 'READY' ? 'success' : status === 'BLOCKED' ? 'danger' : 'warning'}>
                        {status === 'READY' ? 'Sẵn sàng' : status === 'BLOCKED' ? 'Bị chặn' : 'Chuẩn bị'}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {group.isRequired && (
                        <Badge tone="warning" className="text-xs py-0 font-bold uppercase">
                          Bắt buộc
                        </Badge>
                      )}
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <ClipboardList className="h-3 w-3 text-text-muted" />
                        {taskCount} việc {doneCount > 0 ? `(${doneCount} xong)` : ''}
                      </span>
                    </div>

                    {group.blockedReason && (
                      <p className="m-0 text-xs text-parish-danger bg-parish-danger-bg p-1.5 rounded line-clamp-2">
                        Điểm nghẽn: {group.blockedReason}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-surface-border/60 flex items-center justify-between">
                    <Button
                      variant={isSelected ? 'primary' : 'ghost'}
                      size="sm"
                      disabled={!enabled || busy}
                      className="w-full justify-between"
                      onClick={() => void run(() => load(group.id))}
                    >
                      <span>{isSelected ? 'Đang điều hành' : 'Điều hành Mảng'}</span>
                      <ChevronRight className="h-3.5 w-3.5 opacity-70" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 4. KHU VỰC ĐIỀU HÀNH MẢNG CHI TIẾT (SELECTED MẢNG WORKSPACE) */}
      {detail && (
        <div ref={detailSectionRef} className="space-y-5 rounded-xl border border-parish-primary/40 bg-surface-ground/30 p-4 sm:p-6 shadow-xs">
          {/* Header Workspace */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border pb-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-parish-primary text-text-inverse h-6 w-6 inline-flex items-center justify-center text-xs font-bold">
                ✓
              </span>
              <div>
                <h4 className="m-0 text-base font-extrabold text-text-main">
                  {detail.workstream.name}
                </h4>
                <p className="m-0 text-xs text-text-muted">
                  {isXuDoanEvent ? `Đơn vị sở hữu: ${unitNameOf(detail.workstream.sourceUnitId) ?? 'Chưa xác định'} · ` : ''}
                  Trạng thái: {detail.workstream.status === 'READY' ? 'Sẵn sàng' : detail.workstream.status === 'BLOCKED' ? 'Bị chặn' : 'Đang chuẩn bị'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {writable && detail.permissions['operations.workstream.manage'] && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-9 px-3"
                    disabled={busy}
                    aria-expanded={editingGroup}
                    onClick={() => {
                      setEditingGroup(value => {
                        if (!value) {
                          setEditName(detail.workstream.name)
                          setEditDescription(detail.workstream.description ?? '')
                          setEditRequired(detail.workstream.isRequired)
                        }
                        return !value
                      })
                    }}
                  >
                    {isXuDoanEvent ? 'Sửa Mảng' : 'Sửa nhóm'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-9 px-3 text-parish-danger hover:bg-parish-danger-bg hover:text-parish-danger"
                    disabled={busy}
                    aria-expanded={showDeleteConfirm}
                    onClick={() => setShowDeleteConfirm(prev => !prev)}
                  >
                    {isXuDoanEvent ? 'Xóa Mảng' : 'Xóa nhóm'}
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" className="min-h-9 px-3" disabled={!enabled || busy} onClick={() => void run(() => load(detail.workstream.id))}>
                {isXuDoanEvent ? 'Tải lại Mảng' : 'Tải lại nhóm'}
              </Button>
              <Button variant="ghost" size="sm" className="min-h-9 px-2" onClick={() => setDetail(null)} title="Đóng bảng điều hành chi tiết">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Hộp xác nhận xóa Mảng / nhóm */}
          {showDeleteConfirm && (
            <div className="rounded-xl border border-parish-danger/40 bg-parish-danger-bg/20 p-4 sm:p-5 space-y-3 shadow-xs" role="alert">
              {tasksInCurrentWorkstream.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-parish-danger font-bold text-sm">
                    <X className="h-4 w-4" />
                    <span>Không thể xóa {isXuDoanEvent ? 'Mảng' : 'nhóm'} "{detail.workstream.name}"</span>
                  </div>
                  <p className="m-0 text-xs text-text-muted leading-relaxed">
                    {isXuDoanEvent ? 'Mảng' : 'Nhóm'} này hiện đang có <strong>{tasksInCurrentWorkstream.length}</strong> nhiệm vụ bên trong. Hãy chuyển các nhiệm vụ sang {isXuDoanEvent ? 'Mảng' : 'nhóm'} khác hoặc xóa/hủy nhiệm vụ trước khi xóa {isXuDoanEvent ? 'Mảng' : 'nhóm'}.
                  </p>
                  <div className="pt-1">
                    <Button variant="ghost" size="sm" className="min-h-9 px-4" onClick={() => setShowDeleteConfirm(false)}>
                      Đã hiểu
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="m-0 text-sm font-bold text-parish-danger">
                      Xác nhận xóa {isXuDoanEvent ? 'Mảng' : 'nhóm'} "{detail.workstream.name}"?
                    </p>
                    <p className="m-0 text-xs text-text-muted leading-relaxed">
                      Hành động này sẽ xóa hoàn toàn {isXuDoanEvent ? 'Mảng phụ trách' : 'nhóm công việc'} khỏi sự kiện và hủy các phân công nhân sự trong mảng. Hành động không thể hoàn tác.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      className="min-h-9 px-4 whitespace-nowrap"
                      onClick={() => {
                        const payload = { version: detail.workstream.version, reason: `Xóa ${isXuDoanEvent ? 'Mảng' : 'nhóm'} ${detail.workstream.name}` }
                        const key = stableKey('workstream-delete', { workstreamId: detail.workstream.id, ...payload })
                        return void run(async () => {
                          const scope = getTenantScopeKey(); const token = generation.current
                          await operationsApi.deleteWorkstream(detail.workstream.id, payload, key)
                          releaseKey('workstream-delete')
                          if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
                          setDetail(null)
                          setShowDeleteConfirm(false)
                          await refresh()
                        })
                      }}
                    >
                      {isXuDoanEvent ? 'Xác nhận xóa Mảng' : 'Xác nhận xóa nhóm'}
                    </Button>
                    <Button variant="ghost" size="sm" className="min-h-9 px-4" disabled={busy} onClick={() => setShowDeleteConfirm(false)}>
                      Hủy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form sửa thông tin Mảng */}
          {editingGroup && (
            <form
              className="grid gap-3 rounded-lg border border-surface-border bg-surface-card p-4 sm:grid-cols-[2fr_3fr_auto_auto] sm:items-end shadow-xs"
              onSubmit={e => {
                e.preventDefault()
                if (!editName.trim()) return
                void run(async () => {
                  const scope = getTenantScopeKey(); const token = generation.current
                  const payload = { version: detail.workstream.version, name: editName.trim(), description: editDescription.trim() || null, isRequired: editRequired }
                  await operationsApi.updateWorkstream(detail.workstream.id, payload, stableKey('workstream-update', { workstreamId: detail.workstream.id, ...payload }))
                  releaseKey('workstream-update')
                  if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
                  await load(detail.workstream.id)
                  if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
                  setEditingGroup(false); setEditName(''); setEditDescription(''); setEditRequired(false)
                  await refresh()
                })
              }}
            >
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-text-muted">{isXuDoanEvent ? 'Tên mảng mới' : 'Tên nhóm mới'}</label>
                <TextInput aria-label={isXuDoanEvent ? 'Tên mảng mới' : 'Tên nhóm mới'} value={editName} maxLength={200} required disabled={busy} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-text-muted">Mô tả nhóm</label>
                <TextInput aria-label="Mô tả nhóm" value={editDescription} maxLength={3000} disabled={busy} placeholder="Mô tả (không bắt buộc)" onChange={e => setEditDescription(e.target.value)} />
              </div>
              <label className="flex min-h-10 items-center gap-2 text-xs font-medium text-text-main cursor-pointer select-none pb-1">
                <input type="checkbox" checked={editRequired} disabled={busy} onChange={e => setEditRequired(e.target.checked)} />
                {isXuDoanEvent ? 'Mảng bắt buộc' : 'Nhóm bắt buộc'}
              </label>
              <div className="pt-1 sm:pt-0">
                <Button type="submit" size="sm" className="whitespace-nowrap min-h-10 px-5" disabled={busy || !editName.trim()}>Lưu</Button>
              </div>
            </form>
          )}

          {/* KHỐI 1: BỔ NHIỆM & TRÁCH NHIỆM TRƯỞNG MẢNG (FIELD LEAD) */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-parish-primary" />
                <h5 className="m-0 text-xs font-bold uppercase tracking-wider text-text-main">
                  {leadRoleLabel} đương nhiệm
                </h5>
              </div>
              <Badge tone={hasExplicitLead || defaultLeader ? 'success' : 'warning'}>
                {leadSummary}
              </Badge>
            </div>

            {/* Hiển thị thẻ Trưởng Mảng mặc định / đương nhiệm (ẩn form phân công thủ công) */}
            {!shouldShowForm && (hasExplicitLead || defaultLeader) && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-surface-ground/50 border border-surface-border">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-parish-primary-light flex items-center justify-center text-parish-primary font-bold shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-text-main">{effectiveLeadName}</span>
                      <Badge tone="success" className="text-xs">
                        {hasExplicitLead ? 'Trưởng Mảng đương nhiệm' : 'Mặc định theo Ban/Ngành'}
                      </Badge>
                    </div>
                    <p className="m-0 text-xs text-text-muted mt-0.5">
                      {hasExplicitLead
                        ? `Chịu trách nhiệm chính điều hành Mảng ${detail.workstream.name}. Có quyền tạo và phân công nhiệm vụ bên trong mảng.`
                        : `Đương nhiệm ${positionLabelOf(defaultLeader?.positionCode)} (${unitNameOf(detail.workstream.sourceUnitId) ?? 'Ban/Ngành'}). Hệ thống tự động phân cấp quản trị mảng mà không cần bổ nhiệm thủ công.`}
                    </p>
                  </div>
                </div>
                {canManageLead && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-9 px-3 whitespace-nowrap self-start sm:self-auto"
                    onClick={() => setShowHandoverForm(true)}
                  >
                    Bàn giao / Đổi Trưởng Mảng
                  </Button>
                )}
              </div>
            )}

            {/* Form bàn giao/bổ nhiệm Trưởng Mảng: chỉ hiện khi LIVE, khi bấm Bàn giao/Đổi, hoặc khi chưa có trưởng ban/ngành nào */}
            {shouldShowForm && (
              <div className="mt-3.5 pt-3.5 border-t border-surface-border space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="m-0 text-sm font-bold text-text-main">
                      {currentLead
                        ? (isLive ? `Bàn giao ${leadRoleLabel} đang trực` : `Bàn giao ${leadRoleLabel}`)
                        : `Bổ nhiệm ${leadRoleLabel}`}
                      {unitNameOf(detail.workstream.sourceUnitId) ? ` (${unitNameOf(detail.workstream.sourceUnitId)})` : ''}
                    </p>
                    <p className="m-0 text-xs text-text-muted leading-relaxed">
                      {isXuDoanEvent
                        ? `${leadRoleLabel} phải là Trưởng Ban/Ngành đương nhiệm của đơn vị sở hữu Mảng. Trưởng Mảng sẽ chịu trách nhiệm tạo và phân công các nhiệm vụ bên trong Mảng.`
                        : `${leadRoleLabel} phải là Trưởng Ban/Ngành đương nhiệm của đơn vị sở hữu Mảng (Phó, thành viên thường và Trưởng đơn vị khác bị từ chối).`}
                      {isLive ? ' Thao tác này có hiệu lực ngay và được lưu nguyên tử để không tạo khoảng trống điều hành.' : ''}
                    </p>
                  </div>
                  {showHandoverForm && !isLive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 px-2.5 text-xs text-text-muted hover:text-text-main"
                      onClick={() => {
                        setShowHandoverForm(false)
                        setLeadReplaceReason('')
                        setCandidateValue('')
                      }}
                    >
                      Hủy đổi
                    </Button>
                  )}
                </div>

                <div className={`grid gap-3 items-end ${currentLead ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-[1.5fr_2fr_auto]'}`}>
                  {currentLead && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-text-muted">
                        {leadRoleLabel} hiện tại
                      </label>
                      <Select aria-label={`${leadRoleLabel} hiện tại`} value={currentLead.id} disabled={busy} onChange={e => setCurrentLeadId(e.target.value)}>
                        {leadMembers.map(member => <option key={member.id} value={member.id}>{leadNameOf(member)}</option>)}
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-text-muted">
                      {leadRoleLabel} mới
                    </label>
                    <Select aria-label={`${leadRoleLabel} mới`} value={candidateValue} disabled={busy || candidateDirectory.loading} onChange={e => setCandidateValue(e.target.value)}>
                      <option value="">{candidateDirectory.loading ? 'Đang tải nhân sự…' : 'Chọn Trưởng Ban/Ngành đương nhiệm'}</option>
                      {actionableCandidates.map(candidate => (
                        <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>
                          {candidate.displayName}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-text-muted">
                      Lý do {currentLead ? 'bàn giao' : 'bổ nhiệm'}
                    </label>
                    <TextInput
                      aria-label={`Lý do ${currentLead ? 'bàn giao' : 'bổ nhiệm'} ${leadRoleLabel}`}
                      value={leadReplaceReason}
                      maxLength={2000}
                      required
                      disabled={busy}
                      placeholder={`Lý do ${currentLead ? 'bàn giao' : 'bổ nhiệm'} ${leadRoleLabel}`}
                      onChange={e => setLeadReplaceReason(e.target.value)}
                    />
                  </div>
                  <div className="pt-1 sm:pt-0">
                    <Button
                      disabled={busy || !candidateValue || !leadReplaceReason.trim()}
                      className="w-full sm:w-auto px-5 whitespace-nowrap min-h-10"
                      onClick={() => {
                        const target = parseOperationCandidateValue(candidateValue)
                        if (!target) return
                        const payload = {
                          version: detail.workstream.version,
                          currentLeadMemberId: currentLead?.id ?? null,
                          currentLeadMemberVersion: currentLead?.version ?? null,
                          ...target,
                          reason: leadReplaceReason.trim(),
                        }
                        const key = stableKey('workstream-lead-replace', { workstreamId: detail.workstream.id, ...payload })
                        return void mutate(async () => {
                          const result = await operationsApi.replaceWorkstreamLead(detail.workstream.id, payload, key)
                          releaseKey('workstream-lead-replace')
                          setShowHandoverForm(false)
                          setLeadReplaceReason('')
                          setCandidateValue('')
                          return result
                        }, canManageLead)
                      }}
                    >
                      {currentLead ? 'Bàn giao ngay' : 'Bổ nhiệm ngay'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* KHỐI 2: CÁC NHIỆM VỤ THUỘC MẢNG */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-parish-primary" />
                <h5 className="m-0 text-xs font-bold uppercase tracking-wider text-text-main">
                  Nhiệm vụ thuộc Mảng ({tasksInCurrentWorkstream.length})
                </h5>
              </div>
            </div>

            {tasksInCurrentWorkstream.length === 0 ? (
              <p className="m-0 text-xs text-text-muted py-2">
                Chưa có nhiệm vụ nào được phân bổ vào Mảng này. Trưởng Mảng có thể tạo nhiệm vụ tại Tab <em>Nhiệm vụ chi tiết</em>.
              </p>
            ) : (
              <div className="divide-y divide-surface-border rounded-lg border border-surface-border overflow-hidden">
                {tasksInCurrentWorkstream.map(task => (
                  <div key={task.id} className="flex items-center justify-between gap-2 p-2 text-xs bg-surface-card hover:bg-surface-hover/50">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 font-bold text-text-main truncate">{task.title}</p>
                      <p className="m-0 text-xs text-text-muted">
                        {taskPhaseLabel[task.phase]} {task.dueAt ? `· Hạn: ${new Date(task.dueAt).toLocaleString('vi-VN')}` : ''}
                      </p>
                    </div>
                    <Badge tone={statusTone(task.status)}>
                      {task.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* KHỐI 3: THÀNH VIÊN & NGƯỜI THEO DÕI */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-parish-primary" />
                <h5 className="m-0 text-xs font-bold uppercase tracking-wider text-text-main">
                  Nhân sự &amp; Thành viên Mảng ({detail.members.length})
                </h5>
              </div>
            </div>

            <div className="space-y-2">
              {detail.members.map(member => {
                const memberLabel = candidates.find(c => c.personId === member.personId || c.userId === member.userId)?.displayName ?? 'Thành viên được phân công'
                return (
                  <div key={member.id} className="rounded-lg border border-surface-border p-2.5 bg-surface-ground/30 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-text-main">
                        {memberLabel} · {roleLabel(member.operationRole)}
                        {member.endsAt ? ` · đến ${new Date(member.endsAt).toLocaleString('vi-VN')}` : ''}
                      </span>
                      <Badge tone={member.operationRole === 'WORKSTREAM_LEAD' ? 'primary' : 'neutral'}>
                        {roleLabel(member.operationRole)}
                      </Badge>
                    </div>

                    {writable && detail.permissions[member.operationRole === 'WORKSTREAM_LEAD' ? 'operations.workstream.assign_lead' : 'operations.workstream.manage'] && (
                      <>
                        <div className="flex flex-col sm:flex-row w-full items-stretch sm:items-center gap-2.5 pt-2">
                          <TextInput
                            aria-label={`Lý do thu hồi vai trò của ${memberLabel}`}
                            value={removeReasons[member.id] ?? ''}
                            maxLength={2000}
                            disabled={busy}
                            placeholder={`Lý do thu hồi vai trò...`}
                            className="flex-1"
                            onChange={e => setRemoveReasons(value => ({ ...value, [member.id]: e.target.value }))}
                          />
                          <Button
                            variant="danger"
                            size="sm"
                            className="whitespace-nowrap min-h-9 px-4"
                            disabled={busy || !(removeReasons[member.id] ?? '').trim()}
                            onClick={() => {
                              const payload = { version: detail.workstream.version, memberVersion: member.version, reason: (removeReasons[member.id] ?? '').trim() }
                              const key = stableKey(`workstream-member-remove:${member.id}`, { workstreamId: detail.workstream.id, memberId: member.id, ...payload })
                              return void mutate(async () => {
                                const result = await operationsApi.removeWorkstreamMember(detail.workstream.id, member.id, payload, key)
                                releaseKey(`workstream-member-remove:${member.id}`)
                                return result
                              })
                            }}
                          >
                            Thu hồi vai trò
                          </Button>
                        </div>
                        <MemberValidityEditor
                          member={member}
                          memberLabel={memberLabel}
                          busy={busy}
                          save={(startsAt, endsAt, validityReason) => {
                            const payload = { version: detail.workstream.version, memberVersion: member.version, startsAt, endsAt, reason: validityReason }
                            const key = stableKey(`workstream-member-validity:${member.id}`, { workstreamId: detail.workstream.id, memberId: member.id, ...payload })
                            return void mutate(async () => {
                              const result = await operationsApi.updateWorkstreamMemberValidity(detail.workstream.id, member.id, payload, key)
                              releaseKey(`workstream-member-validity:${member.id}`)
                              return result
                            })
                          }}
                        />
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {writable && detail.permissions['operations.workstream.manage'] && (
              <div className="mt-3.5 pt-3.5 border-t border-surface-border space-y-2.5">
                <p className="m-0 text-xs font-bold uppercase tracking-wider text-text-muted">
                  {isXuDoanEvent ? 'Thêm nhân sự vào Mảng' : 'Thêm nhân sự vào nhóm'}
                </p>
                <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_auto] items-end">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-text-muted">Nhân sự tham gia</label>
                    <Select aria-label="Thành viên nhóm" value={candidateValue} disabled={candidateDirectory.loading} onChange={e => setCandidateValue(e.target.value)}>
                      <option value="">{candidateDirectory.loading ? 'Đang tải nhân sự…' : 'Chọn nhân sự tham gia'}</option>
                      {candidates.map(candidate => (
                        <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>
                          {candidate.displayName}{candidate.eligibility === 'PLANNING_ONLY' ? ' · chưa có tài khoản' : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-text-muted">Vai trò</label>
                    <Select aria-label="Vai trò trong nhóm" value={role} onChange={e => setRole(e.target.value as typeof role)}>
                      {Object.entries(memberRoles).map(([value]) => (
                        <option key={value} value={value}>{roleLabel(value as OperationWorkstreamMember['operationRole'])}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="pt-1 sm:pt-0">
                    <Button
                      disabled={busy || !candidateValue || (role === 'WORKSTREAM_LEAD' && !detail.permissions['operations.workstream.assign_lead'])}
                      className="w-full sm:w-auto px-5 whitespace-nowrap min-h-10"
                      onClick={() => {
                        const target = parseOperationCandidateValue(candidateValue)
                        if (!target) return
                        const payload = { version: detail.workstream.version, ...target, operationRole: role }
                        const key = stableKey('workstream-member-add', { workstreamId: detail.workstream.id, ...payload })
                        return void mutate(async () => {
                          const result = await operationsApi.addWorkstreamMember(detail.workstream.id, payload, key)
                          releaseKey('workstream-member-add')
                          return result
                        })
                      }}
                    >
                      {isXuDoanEvent ? 'Phân công vào Mảng' : 'Phân công vào nhóm'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {candidateDirectory.error && <p role="alert" className="text-sm text-parish-danger">{candidateDirectory.error}</p>}
          </div>

          {/* KHỐI 4: ĐIỀU HÀNH TRẠNG THÁI SẴN SÀNG / BỊ CHẶN */}
          {writable && detail.permissions['operations.workstream.mark_ready'] && (
            <div className="rounded-xl border border-surface-border bg-surface-card p-4 sm:p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
                <h5 className="m-0 text-xs font-bold uppercase tracking-wider text-text-main">
                  Trạng thái vận hành của Mảng
                </h5>
                <Badge tone={detail.workstream.status === 'READY' ? 'success' : detail.workstream.status === 'BLOCKED' ? 'danger' : 'warning'}>
                  {detail.workstream.status === 'READY' ? 'Đã sẵn sàng' : detail.workstream.status === 'BLOCKED' ? 'Đang bị chặn' : 'Đang chuẩn bị'}
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Nhánh 1: Xác nhận sẵn sàng */}
                <div className="rounded-lg border border-surface-border bg-surface-ground/30 p-3.5 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <p className="m-0 text-sm font-bold text-text-main">
                      {detail.workstream.status === 'READY' ? 'Mảng đã sẵn sàng' : 'Sẵn sàng vận hành'}
                    </p>
                    <p className="m-0 text-xs text-text-muted leading-relaxed">
                      {detail.workstream.status === 'READY'
                        ? 'Mảng đã được xác nhận hoàn tất khâu chuẩn bị để vận hành trong sự kiện.'
                        : 'Xác nhận toàn bộ nhân sự và kịch bản của Mảng đã sẵn sàng để chuyển sang giai đoạn vận hành.'}
                    </p>
                  </div>
                  <div>
                    <Button
                      disabled={busy}
                      variant="primary"
                      className="w-full sm:w-auto px-5 whitespace-nowrap min-h-10"
                      onClick={() => {
                        const payload = { version: detail.workstream.version, status: 'READY' as const }
                        const key = stableKey('workstream-ready', { workstreamId: detail.workstream.id, ...payload })
                        return void mutate(async () => {
                          const result = await operationsApi.setWorkstreamReady(detail.workstream.id, payload, key)
                          releaseKey('workstream-ready')
                          return result
                        })
                      }}
                    >
                      {isXuDoanEvent ? 'Mảng đã sẵn sàng' : 'Nhóm đã sẵn sàng'}
                    </Button>
                  </div>
                </div>

                {/* Nhánh 2: Báo điểm nghẽn / bị chặn */}
                <div className="rounded-lg border border-surface-border bg-surface-ground/30 p-3.5 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-parish-danger">
                      Báo cáo điểm nghẽn (Mảng bị chặn)
                    </label>
                    <TextInput
                      aria-label={isXuDoanEvent ? 'Lý do báo Mảng bị chặn' : 'Lý do báo nhóm bị chặn'}
                      className="w-full"
                      value={blockedReason}
                      maxLength={2000}
                      disabled={busy}
                      placeholder={isXuDoanEvent ? 'Nhập chi tiết điểm nghẽn cần tháo gỡ...' : 'Lý do nhóm bị chặn...'}
                      onChange={e => setBlockedReason(e.target.value)}
                    />
                  </div>
                  <div>
                    <Button
                      variant="secondary"
                      disabled={busy || !blockedReason.trim()}
                      className="w-full sm:w-auto px-5 whitespace-nowrap min-h-10 text-parish-danger hover:border-parish-danger"
                      onClick={() => {
                        const payload = { version: detail.workstream.version, status: 'BLOCKED' as const, reason: blockedReason.trim() }
                        const key = stableKey('workstream-ready', { workstreamId: detail.workstream.id, ...payload })
                        return void mutate(async () => {
                          const result = await operationsApi.setWorkstreamReady(detail.workstream.id, payload, key)
                          releaseKey('workstream-ready')
                          setBlockedReason('')
                          return result
                        })
                      }}
                    >
                      {isXuDoanEvent ? 'Báo Mảng bị chặn' : 'Báo nhóm bị chặn'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
