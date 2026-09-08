import { useEffect, useRef, useState } from 'react'
import { Button, Select, TextArea } from '../common/ui'
import { operationsApi, type OperationTaskDetail } from '../../lib/api/operations'
import { getTenantScopeKey } from '../../lib/tenantScope'

export function TaskHandoverForm({ detail, people, enabled, refresh, onWarnings }: {
  detail: OperationTaskDetail
  people: Array<{ id: string; fullName: string; serviceStatus: string; linkedUserId?: string | null }>
  enabled: boolean
  refresh: () => Promise<unknown>
  onWarnings?: (taskId: string, items: Array<{ id: string; startsAt: string; endsAt: string }>) => void
}) {
  const [personId, setPersonId] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const owner = detail.assignees.find(item => item.assignmentRole === 'OWNER')
  const candidates = people.filter(person => person.serviceStatus === 'ACTIVE' && person.id !== owner?.personId && (!owner?.userId || person.linkedUserId !== owner.userId))
  if (!owner || !detail.permissions['operations.task.reassign'] || ['DONE', 'CANCELLED'].includes(detail.task.status)) return null
  return <form aria-label="Bàn giao người phụ trách" className="mt-4 space-y-2 rounded-lg border border-surface-border p-3" onSubmit={async event => {
    event.preventDefault()
    const scope = getTenantScopeKey()
    if (!scope || !enabled || inFlight.current || !reason.trim() || !candidates.some(person => person.id === personId)) return
    inFlight.current = true; setBusy(true); setError('')
    const current = () => active.current && scope === getTenantScopeKey()
    try {
      const result = await operationsApi.handoverTask(detail.task.id, { version: detail.task.version, assignmentId: owner.id, assignmentVersion: owner.version, personId, reason: reason.trim() })
      if (!current()) return
      onWarnings?.(detail.task.id, result.conflictWarnings)
      setPersonId(''); setReason('')
      await refresh()
    } catch (failure) { if (current()) setError(failure instanceof Error ? failure.message : 'Không bàn giao được. Hãy tải lại nhiệm vụ.') }
    finally { inFlight.current = false; if (current()) setBusy(false) }
  }}>
    <h3 className="m-0 text-sm font-bold text-text-main">Bàn giao người phụ trách</h3>
    <p className="text-xs text-text-muted">Người cũ được thu hồi vai trò phụ trách khi bàn giao thành công. Người mới cần xác nhận nhận việc.</p>
    {error && <p role="alert" className="text-sm text-text-main">{error}</p>}
    <Select aria-label="Người phụ trách mới" value={personId} required disabled={!enabled || busy} onChange={event => setPersonId(event.target.value)}>
      <option value="">Chọn người mới</option>
      {candidates.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
    </Select>
    <TextArea aria-label="Lý do bàn giao" value={reason} required maxLength={2000} disabled={!enabled || busy} onChange={event => setReason(event.target.value)} />
    <Button type="submit" size="sm" disabled={!enabled || busy || !personId || !reason.trim()}>Xác nhận bàn giao</Button>
  </form>
}
