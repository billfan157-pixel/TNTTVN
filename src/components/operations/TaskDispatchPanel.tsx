import { useCallback, useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { Badge } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import { operationsApi, type OperationTaskDispatch, type OperationTaskDetail } from '../../lib/api/operations'
import { getTenantScopeKey } from '../../lib/tenantScope'
import { useOperationCandidates } from '../../hooks/useOperationCandidates'

const dispatchStatusLabel: Record<OperationTaskDispatch['status'], string> = {
  SCHEDULED: 'Lên lịch', PENDING: 'Đang chờ', ACCEPTED: 'Đã nhận', CANCELLED: 'Đã hủy',
}

/**
 * W2.3: read-only history of dispatch rounds for one task
 * (`GET /tasks/:id/dispatches`, server :2487 — newest first). Managers could
 * invite primary/reserve people but had no way to see which round resolved
 * how; there is intentionally no cancel here — the server exposes no
 * dispatch-cancel command (D3, separate ticket per the plan).
 * Candidate directory is only fetched to render names, via the existing
 * task-scoped candidates hook; a failure degrades to the generic label.
 */
export function TaskDispatchPanel({ detail, enabled }: { detail: OperationTaskDetail; enabled: boolean }) {
  const [rounds, setRounds] = useState<OperationTaskDispatch[] | null>(null)
  const [error, setError] = useState('')
  // Load on demand only when the task had at least one dispatch (the detail
  // does not carry the count, so a cheap probe runs whenever task view is on).
  const directory = useOperationCandidates({ taskId: detail.task.id }, enabled)
  useEffect(() => {
    const scope = getTenantScopeKey()
    let alive = true
    setError('')
    operationsApi.getTaskDispatches(detail.task.id).then(rows => {
      if (!alive || getTenantScopeKey() !== scope) return
      const safe = rows.filter(row => row.taskId === detail.task.id)
      setRounds(safe)
    }).catch(() => { if (alive && getTenantScopeKey() === scope) setError('Không tải được lịch sử lời mời.') })
    return () => { alive = false }
  }, [detail.task.id])
  const nameOf = useCallback((userId?: string | null, personId?: string | null) => {
    if (!userId && !personId) return null
    const candidate = directory.candidates.find(item => (userId && item.userId === userId) || (personId && item.personId === personId))
    return candidate?.displayName ?? 'Không xác định'
  }, [directory.candidates])

  if (error) return <p role="alert" className="m-0 mt-3 text-xs text-text-muted">{error}</p>
  if (rounds === null) return null
  return <section className="mt-3 space-y-2 rounded-lg border border-surface-border p-3" aria-label="Lịch sử lời mời nhận việc">
    <h3 className="m-0 text-sm font-bold text-text-main">Lịch sử lời mời nhận việc</h3>
    {rounds.length === 0
      ? <EmptyState icon={Send} title="Chưa có lời mời nào." description="Mời người phụ trách từ biểu mẫu Phân Công." className="py-4" />
      : rounds.map(round => {
        const primary = nameOf(round.primaryUserId, round.primaryPersonId)
        const reserve = nameOf(round.reserveUserId, round.reservePersonId)
        return <div key={round.id} data-dispatch-round={round.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-main">
          <span className="min-w-0">
            {primary ? `Chính: ${primary}` : 'Không có người chính'}
            {reserve ? ` · Dự bị: ${reserve}` : ''}
            {round.acceptedTarget ? ` · Nhận bằng lời mời ${round.acceptedTarget === 'PRIMARY' ? 'chính' : 'dự bị'}` : ''}
          </span>
          <span className="flex items-center gap-2 text-xs text-text-muted">
            <span>Hạn phản hồi {new Date(round.acknowledgeBy).toLocaleString('vi-VN')}</span>
            <Badge tone={round.status === 'ACCEPTED' ? 'success' : round.status === 'PENDING' ? 'warning' : round.status === 'CANCELLED' ? 'danger' : 'neutral'}>{dispatchStatusLabel[round.status]}</Badge>
          </span>
        </div>
      })}
  </section>
}
