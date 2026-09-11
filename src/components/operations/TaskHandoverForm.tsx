import { useEffect, useRef, useState } from 'react'
import { Button, Select, TextArea } from '../common/ui'
import { operationsApi, type OperationTaskDetail } from '../../lib/api/operations'
import { getTenantScopeKey } from '../../lib/tenantScope'
import { operationCandidateValue, parseOperationCandidateValue, useOperationCandidates } from '../../hooks/useOperationCandidates'

export function TaskHandoverForm({ detail, enabled, refresh, onWarnings }: {
  detail: OperationTaskDetail
  enabled: boolean
  refresh: () => Promise<unknown>
  onWarnings?: (taskId: string, items: Array<{ id: string; startsAt: string; endsAt: string }>) => void
}) {
  const [candidateValue, setCandidateValue] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const owner = detail.assignees.find(item => item.assignmentRole === 'OWNER')
  const directory = useOperationCandidates({ taskId: detail.task.id }, Boolean(owner && enabled && detail.permissions['operations.task.reassign'] && !['DONE', 'CANCELLED'].includes(detail.task.status)))
  const candidates = directory.candidates.filter(candidate => candidate.eligibility !== 'INELIGIBLE' && candidate.personId !== owner?.personId && candidate.userId !== owner?.userId)
  if (!owner || !detail.permissions['operations.task.reassign'] || ['DONE', 'CANCELLED'].includes(detail.task.status)) return null
  return <form aria-label="Bàn giao người phụ trách" className="mt-4 space-y-2 rounded-lg border border-surface-border p-3" onSubmit={async event => {
    event.preventDefault()
    const scope = getTenantScopeKey()
    const target = parseOperationCandidateValue(candidateValue)
    if (!scope || !enabled || inFlight.current || !reason.trim() || !target || !candidates.some(candidate => operationCandidateValue(candidate) === candidateValue)) return
    inFlight.current = true; setBusy(true); setError('')
    const current = () => active.current && scope === getTenantScopeKey()
    try {
      const result = await operationsApi.handoverTask(detail.task.id, { version: detail.task.version, assignmentId: owner.id, assignmentVersion: owner.version, ...target, reason: reason.trim() })
      if (!current()) return
      onWarnings?.(detail.task.id, result.conflictWarnings)
      setCandidateValue(''); setReason('')
      await refresh()
    } catch (failure) { if (current()) setError(failure instanceof Error ? failure.message : 'Không bàn giao được. Hãy tải lại nhiệm vụ.') }
    finally { inFlight.current = false; if (current()) setBusy(false) }
  }}>
    <h3 className="m-0 text-sm font-bold text-text-main">Bàn giao người phụ trách</h3>
    <p className="text-xs text-text-muted">Người cũ được thu hồi vai trò phụ trách khi bàn giao thành công. Người mới cần xác nhận nhận việc.</p>
    {error && <p role="alert" className="text-sm text-text-main">{error}</p>}
    {directory.error && <p role="alert" className="text-sm text-text-main">{directory.error}</p>}
    <Select aria-label="Người phụ trách mới" value={candidateValue} required disabled={!enabled || busy || directory.loading} onChange={event => setCandidateValue(event.target.value)}>
      <option value="">{directory.loading ? 'Đang tải người mới…' : 'Chọn người mới'}</option>
      {candidates.map(candidate => <option key={operationCandidateValue(candidate)} value={operationCandidateValue(candidate)}>{candidate.displayName}{candidate.eligibility === 'PLANNING_ONLY' ? ' · chưa có tài khoản' : ''}</option>)}
    </Select>
    <TextArea aria-label="Lý do bàn giao" value={reason} required maxLength={2000} disabled={!enabled || busy} onChange={event => setReason(event.target.value)} />
    <Button type="submit" size="sm" disabled={!enabled || busy || !candidateValue || !reason.trim()}>Xác nhận bàn giao</Button>
  </form>
}
