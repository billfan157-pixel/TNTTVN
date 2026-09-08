import { useEffect, useRef, useState } from 'react'
import { Button, Select, TextInput } from '../common/ui'
import { operationsApi, type OperationEventDetail, type OperationWorkstreamDetail, type OperationWorkstreamMember } from '../../lib/api/operations'
import { getTenantScopeKey } from '../../lib/tenantScope'

type Props = {
  event: OperationEventDetail
  enabled: boolean
  people: Array<{ id: string; fullName: string; serviceStatus: string }>
  refresh: () => Promise<unknown>
}
const roles: Record<OperationWorkstreamMember['operationRole'], string> = { WORKSTREAM_LEAD: 'Trưởng nhóm', CONTRIBUTOR: 'Thành viên', APPROVER: 'Người duyệt', OBSERVER: 'Theo dõi' }

export function WorkstreamPanel({ event, enabled, people, refresh }: Props) {
  const [detail, setDetail] = useState<OperationWorkstreamDetail | null>(null)
  const [name, setName] = useState('')
  const [required, setRequired] = useState(false)
  const [personId, setPersonId] = useState('')
  const [role, setRole] = useState<OperationWorkstreamMember['operationRole']>('CONTRIBUTOR')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const inFlight = useRef(false)
  useEffect(() => () => { generation.current++ }, [])
  const writable = enabled && ['DRAFT', 'PLANNING', 'READY'].includes(event.event.status)
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
  const mutate = (action: () => Promise<unknown>) => run(async () => {
    if (!writable || !detail) return
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
        const created = await operationsApi.createWorkstream({ eventId: event.event.id, name: name.trim(), isRequired: required })
        if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
        await load(created.id)
        if (!scope || scope !== getTenantScopeKey() || token !== generation.current) return
        setName(''); setRequired(false); await refresh()
      })
    }}>
      <TextInput aria-label="Tên nhóm công việc" value={name} maxLength={200} required onChange={e => setName(e.target.value)} />
      <label className="text-sm text-text-main"><input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} /> Nhóm bắt buộc</label>
      <Button type="submit" disabled={busy || !name.trim()}>Tạo nhóm</Button>
    </form>}
    {detail && <div className="space-y-3">
      <h4 className="text-sm font-bold text-text-main">{detail.workstream.name} · {detail.workstream.status === 'READY' ? 'Sẵn sàng' : detail.workstream.status === 'BLOCKED' ? 'Bị chặn' : 'Đang chuẩn bị'}</h4>
      <Button variant="ghost" size="sm" disabled={!enabled || busy} onClick={() => void run(() => load(detail.workstream.id))}>Tải lại nhóm</Button>
      {detail.members.map(member => <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-main">
        <span>{people.find(person => person.id === member.personId)?.fullName ?? 'Thành viên được phân công'} · {roles[member.operationRole]}</span>
        {writable && detail.permissions['operations.workstream.manage'] && <Button variant="danger" size="sm" disabled={busy || !reason.trim()} onClick={() => void mutate(() => operationsApi.removeWorkstreamMember(detail.workstream.id, member.id, { version: detail.workstream.version, memberVersion: member.version, reason: reason.trim() }))}>Thu hồi vai trò</Button>}
      </div>)}
      {writable && detail.permissions['operations.workstream.manage'] && <div className="flex flex-wrap gap-2">
        <Select aria-label="Thành viên nhóm" value={personId} onChange={e => setPersonId(e.target.value)}><option value="">Chọn nhân sự</option>{people.filter(person => person.serviceStatus === 'ACTIVE').map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select>
        <Select aria-label="Vai trò trong nhóm" value={role} onChange={e => setRole(e.target.value as typeof role)}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Button disabled={busy || !personId || (role === 'WORKSTREAM_LEAD' && !detail.permissions['operations.workstream.assign_lead'])} onClick={() => void mutate(() => operationsApi.addWorkstreamMember(detail.workstream.id, { version: detail.workstream.version, personId, operationRole: role }))}>Phân công vào nhóm</Button>
      </div>}
      {writable && (detail.permissions['operations.workstream.manage'] || detail.permissions['operations.workstream.mark_ready']) && <TextInput aria-label="Lý do thay đổi nhóm" placeholder="Lý do khi thu hồi vai trò hoặc báo bị chặn" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} />}
      {writable && detail.permissions['operations.workstream.mark_ready'] && <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void mutate(() => operationsApi.setWorkstreamReady(detail.workstream.id, { version: detail.workstream.version, status: 'READY' }))}>Nhóm đã sẵn sàng</Button>
        <Button variant="secondary" disabled={busy || !reason.trim()} onClick={() => void mutate(() => operationsApi.setWorkstreamReady(detail.workstream.id, { version: detail.workstream.version, status: 'BLOCKED', reason: reason.trim() }))}>Báo nhóm bị chặn</Button>
      </div>}
    </div>}
  </section>
}
