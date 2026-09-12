import { useEffect, useRef, useState } from 'react'
import { Button, Select, TextInput } from '../common/ui'
import { operationsApi, type OperationEventDetail, type OperationWorkstreamDetail, type OperationWorkstreamMember } from '../../lib/api/operations'
import { getTenantScopeKey } from '../../lib/tenantScope'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { operationCandidateValue, parseOperationCandidateValue, useOperationCandidates } from '../../hooks/useOperationCandidates'

type Props = {
  event: OperationEventDetail
  enabled: boolean
  refresh: () => Promise<unknown>
  /** Units the caller may own a Field in (from creation-options). Server re-checks. */
  fieldUnits?: Array<{ id: string; name: string }>
}
const roles: Record<OperationWorkstreamMember['operationRole'], string> = { WORKSTREAM_LEAD: 'Trưởng nhóm', OBSERVER: 'Theo dõi' }

function localDateTime(iso: string | null) {
  if (!iso) return ''
  const value = new Date(iso)
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function MemberValidityEditor({ member, busy, save }: { member: OperationWorkstreamMember; busy: boolean; save: (startsAt: string | null, endsAt: string | null, reason: string) => void }) {
  const [startsAt, setStartsAt] = useState(() => localDateTime(member.startsAt))
  const [endsAt, setEndsAt] = useState(() => localDateTime(member.endsAt))
  const [validityReason, setValidityReason] = useState('')
  useEffect(() => { setStartsAt(localDateTime(member.startsAt)); setEndsAt(localDateTime(member.endsAt)); setValidityReason('') }, [member.endsAt, member.startsAt, member.version])
  const invalidInterval = Boolean(startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime())
  return <div className="mt-2 grid w-full gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
    <TextInput aria-label={`Bắt đầu vai trò ${member.id}`} type="datetime-local" value={startsAt} disabled={busy} onChange={event => setStartsAt(event.target.value)} />
    <TextInput aria-label={`Kết thúc vai trò ${member.id}`} type="datetime-local" value={endsAt} disabled={busy} onChange={event => setEndsAt(event.target.value)} />
    <TextInput aria-label={`Lý do đổi thời hạn ${member.id}`} value={validityReason} maxLength={2000} required disabled={busy} placeholder="Lý do đổi thời hạn" onChange={event => setValidityReason(event.target.value)} />
    <Button size="sm" variant="secondary" disabled={busy || invalidInterval || !validityReason.trim()} onClick={() => save(startsAt ? new Date(startsAt).toISOString() : null, endsAt ? new Date(endsAt).toISOString() : null, validityReason.trim())}>Lưu thời hạn</Button>
  </div>
}

export function WorkstreamPanel({ event, enabled, refresh, fieldUnits = [] }: Props) {
  const [detail, setDetail] = useState<OperationWorkstreamDetail | null>(null)
  const [name, setName] = useState('')
  const [required, setRequired] = useState(false)
  const [sourceUnitId, setSourceUnitId] = useState('')
  const [candidateValue, setCandidateValue] = useState('')
  const [currentLeadId, setCurrentLeadId] = useState('')
  const [role, setRole] = useState<OperationWorkstreamMember['operationRole']>('OBSERVER')
  // One reason draft per destructive command: a reason typed for "remove
  // member" must never silently satisfy the mandatory reason of "lead
  // handover" or "report blocked" (P1-9).
  const [removeReasons, setRemoveReasons] = useState<Record<string, string>>({})
  const [leadReplaceReason, setLeadReplaceReason] = useState('')
  const [blockedReason, setBlockedReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const inFlight = useRef(false)
  const { stableKey, releaseKey } = useStableCommandKey()
  useEffect(() => () => { generation.current++ }, [])
  const writable = enabled && ['DRAFT', 'PLANNING', 'PREPARING', 'READY'].includes(event.event.status)
  const isXuDoanEvent = (event.event.eventScopeType ?? (event.event.scopeUnitId ? 'UNIT' : 'XU_DOAN')) === 'XU_DOAN'
  // UNIT events inherit the event scope; XU_DOAN Fields must name their owning unit.
  const effectiveSourceUnitId = isXuDoanEvent ? (sourceUnitId || null) : (event.event.scopeUnitId ?? null)
  const needsFieldUnit = isXuDoanEvent && fieldUnits.length > 0 && !effectiveSourceUnitId
  const canReplaceLiveLead = Boolean(enabled && detail && event.event.status === 'LIVE' && detail.permissions['operations.workstream.assign_lead'])
  const candidateDirectory = useOperationCandidates(detail ? { workstreamId: detail.workstream.id } : null, Boolean(detail && ((writable && detail.permissions['operations.workstream.manage']) || canReplaceLiveLead)))
  const candidates = candidateDirectory.candidates.filter(candidate => candidate.eligibility !== 'INELIGIBLE')
  const actionableCandidates = candidates.filter(candidate => candidate.eligibility === 'ACTIONABLE')
  const leadMembers = detail?.members.filter(member => member.operationRole === 'WORKSTREAM_LEAD') ?? []
  const currentLead = leadMembers.find(member => member.id === currentLeadId) ?? leadMembers[0] ?? null
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
  return <section className="mt-4 space-y-3 rounded-xl border border-surface-border p-3" aria-label="Nhóm công việc">
    <h3 className="m-0 text-sm font-extrabold text-text-main">Nhóm công việc</h3>
    {error && <p role="alert" className="text-sm text-text-main">{error}</p>}
    <div className="flex flex-wrap gap-2">{event.workstreams.map(group => <Button key={group.id} variant="secondary" size="sm" disabled={!enabled || busy} onClick={() => void run(() => load(group.id))}>{group.name}{group.isRequired ? ' · Bắt buộc' : ''}</Button>)}</div>
    {writable && event.permissions['operations.workstream.create'] && <form className="flex flex-wrap items-center gap-2" onSubmit={e => {
      e.preventDefault()
      void run(async () => {
        const scope = getTenantScopeKey(); const token = generation.current
        const payload = { eventId: event.event.id, sourceUnitId: effectiveSourceUnitId, name: name.trim(), isRequired: required }
        const created = await operationsApi.createWorkstream(payload, stableKey('workstream-create', payload))
        releaseKey('workstream-create')
        if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
        await load(created.id)
        if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
        setName(''); setRequired(false); setSourceUnitId(''); await refresh()
      })
    }}>
      <TextInput aria-label={isXuDoanEvent ? 'Tên mảng phụ trách' : 'Tên nhóm công việc'} value={name} maxLength={200} required onChange={e => setName(e.target.value)} />
      {isXuDoanEvent && fieldUnits.length > 0 && (
        <Select aria-label="Ban/Ngành phụ trách mảng" value={sourceUnitId} required onChange={e => setSourceUnitId(e.target.value)}>
          <option value="">Chọn Ban/Ngành phụ trách</option>
          {fieldUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </Select>
      )}
      <label className="text-sm text-text-main"><input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} /> {isXuDoanEvent ? 'Mảng bắt buộc' : 'Nhóm bắt buộc'}</label>
      <Button type="submit" disabled={busy || !name.trim() || needsFieldUnit}>{isXuDoanEvent ? 'Tạo mảng' : 'Tạo nhóm'}</Button>
    </form>}
    {detail && <div className="space-y-3">
      <h4 className="text-sm font-bold text-text-main">{detail.workstream.name} · {detail.workstream.status === 'READY' ? 'Sẵn sàng' : detail.workstream.status === 'BLOCKED' ? 'Bị chặn' : 'Đang chuẩn bị'}</h4>
      <Button variant="ghost" size="sm" disabled={!enabled || busy} onClick={() => void run(() => load(detail.workstream.id))}>Tải lại nhóm</Button>
      {detail.members.map(member => <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-main">
        <span>{candidates.find(candidate => candidate.personId === member.personId || candidate.userId === member.userId)?.displayName ?? 'Thành viên được phân công'} · {roles[member.operationRole]}{member.endsAt ? ` · đến ${new Date(member.endsAt).toLocaleString('vi-VN')}` : ''}</span>
        {writable && detail.permissions[member.operationRole === 'WORKSTREAM_LEAD' ? 'operations.workstream.assign_lead' : 'operations.workstream.manage'] && <div className="flex w-full items-center gap-2">
          <TextInput aria-label={`Lý do thu hồi vai trò ${member.id}`} value={removeReasons[member.id] ?? ''} maxLength={2000} disabled={busy} placeholder="Lý do thu hồi vai trò" onChange={e => setRemoveReasons(value => ({ ...value, [member.id]: e.target.value }))} />
          <Button variant="danger" size="sm" disabled={busy || !(removeReasons[member.id] ?? '').trim()} onClick={() => {
          const payload = { version: detail.workstream.version, memberVersion: member.version, reason: (removeReasons[member.id] ?? '').trim() }
          const key = stableKey('workstream-member-remove', { workstreamId: detail.workstream.id, memberId: member.id, ...payload })
          return void mutate(async () => {
            const result = await operationsApi.removeWorkstreamMember(detail.workstream.id, member.id, payload, key)
            releaseKey('workstream-member-remove')
            return result
          })
        }}>Thu hồi vai trò</Button></div>}
        {writable && detail.permissions[member.operationRole === 'WORKSTREAM_LEAD' ? 'operations.workstream.assign_lead' : 'operations.workstream.manage'] && <MemberValidityEditor member={member} busy={busy} save={(startsAt, endsAt, validityReason) => {
          const payload = { version: detail.workstream.version, memberVersion: member.version, startsAt, endsAt, reason: validityReason }
          const key = stableKey('workstream-member-validity', { workstreamId: detail.workstream.id, memberId: member.id, ...payload })
          return void mutate(async () => {
            const result = await operationsApi.updateWorkstreamMemberValidity(detail.workstream.id, member.id, payload, key)
            releaseKey('workstream-member-validity')
            return result
          })
        }} />}
      </div>)}
      {writable && detail.permissions['operations.workstream.manage'] && <div className="flex flex-wrap gap-2">
        <Select aria-label="Thành viên nhóm" value={candidateValue} disabled={candidateDirectory.loading} onChange={e => setCandidateValue(e.target.value)}><option value="">{candidateDirectory.loading ? 'Đang tải nhân sự…' : 'Chọn nhân sự'}</option>{candidates.map(candidate => <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>{candidate.displayName}{candidate.eligibility === 'PLANNING_ONLY' ? ' · chưa có tài khoản' : ''}</option>)}</Select>
        <Select aria-label="Vai trò trong nhóm" value={role} onChange={e => setRole(e.target.value as typeof role)}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Button disabled={busy || !candidateValue || (role === 'WORKSTREAM_LEAD' && !detail.permissions['operations.workstream.assign_lead'])} onClick={() => {
          const target = parseOperationCandidateValue(candidateValue)
          if (!target) return
          const payload = { version: detail.workstream.version, ...target, operationRole: role }
          const key = stableKey('workstream-member-add', { workstreamId: detail.workstream.id, ...payload })
          return void mutate(async () => {
            const result = await operationsApi.addWorkstreamMember(detail.workstream.id, payload, key)
            releaseKey('workstream-member-add')
            return result
          })
        }}>Phân công vào nhóm</Button>
      </div>}
      {candidateDirectory.error && <p role="alert" className="text-sm text-text-main">{candidateDirectory.error}</p>}
      {canReplaceLiveLead && <div className="space-y-2 rounded-lg border border-surface-border p-3">
        <p className="m-0 text-sm font-bold text-text-main">{currentLead ? 'Bàn giao Trưởng nhóm đang trực' : 'Bổ nhiệm Trưởng nhóm đang trực'}</p>
        <p className="m-0 text-xs text-text-muted">Thao tác này có hiệu lực ngay và được lưu nguyên tử để không tạo khoảng trống điều hành.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          {currentLead && <Select aria-label="Trưởng nhóm hiện tại" value={currentLead.id} disabled={busy} onChange={e => setCurrentLeadId(e.target.value)}>{leadMembers.map(member => <option key={member.id} value={member.id}>{candidates.find(candidate => candidate.personId === member.personId || candidate.userId === member.userId)?.displayName ?? 'Trưởng nhóm hiện tại'}</option>)}</Select>}
          <Select aria-label="Trưởng nhóm mới" value={candidateValue} disabled={busy || candidateDirectory.loading} onChange={e => setCandidateValue(e.target.value)}><option value="">{candidateDirectory.loading ? 'Đang tải nhân sự…' : 'Chọn người có tài khoản'}</option>{actionableCandidates.map(candidate => <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>{candidate.displayName}</option>)}</Select>
          <TextInput aria-label="Lý do bàn giao Trưởng nhóm" value={leadReplaceReason} maxLength={2000} required disabled={busy} placeholder="Lý do bàn giao" onChange={e => setLeadReplaceReason(e.target.value)} />
          <Button disabled={busy || !candidateValue || !leadReplaceReason.trim()} onClick={() => {
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
              return result
            }, canReplaceLiveLead)
          }}>{currentLead ? 'Bàn giao ngay' : 'Bổ nhiệm ngay'}</Button>
        </div>
      </div>}
      {writable && detail.permissions['operations.workstream.mark_ready'] && <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => {
          const payload = { version: detail.workstream.version, status: 'READY' as const }
          const key = stableKey('workstream-ready', { workstreamId: detail.workstream.id, ...payload })
          return void mutate(async () => {
            const result = await operationsApi.setWorkstreamReady(detail.workstream.id, payload, key)
            releaseKey('workstream-ready')
            return result
          })
        }}>Nhóm đã sẵn sàng</Button>
        <TextInput aria-label="Lý do báo nhóm bị chặn" className="max-w-md" value={blockedReason} maxLength={2000} disabled={busy} placeholder="Lý do nhóm bị chặn" onChange={e => setBlockedReason(e.target.value)} />
        <Button variant="secondary" disabled={busy || !blockedReason.trim()} onClick={() => {
          const payload = { version: detail.workstream.version, status: 'BLOCKED' as const, reason: blockedReason.trim() }
          const key = stableKey('workstream-ready', { workstreamId: detail.workstream.id, ...payload })
          return void mutate(async () => {
            const result = await operationsApi.setWorkstreamReady(detail.workstream.id, payload, key)
            releaseKey('workstream-ready')
            setBlockedReason('')
            return result
          })
        }}>Báo nhóm bị chặn</Button>
      </div>}
    </div>}
  </section>
}
