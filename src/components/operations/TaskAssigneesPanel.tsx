import { useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { Badge, Button, TextInput } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import { operationsApi, type OperationTaskDetail } from '../../lib/api/operations'
import { operationsErrorText } from '../../lib/operationsErrors'
import { getTenantScopeKey } from '../../lib/tenantScope'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { useOperationCandidates } from '../../hooks/useOperationCandidates'

/**
 * W2.4: current assignees of a task with a revoke path. The server command
 * `POST /tasks/:id/assignments/:assignmentId/remove` (mandatory reason, OCC on
 * task + assignment, `operations.task.reassign`) previously had no client
 * surface at all — the capability existed but nobody could reach it.
 * OWNER revokes normally leave the task without a responsible person, so the
 * handover form remains the gentler path; this one is the explicit removal.
 */
export function TaskAssigneesPanel({ detail, enabled, refresh }: {
  detail: OperationTaskDetail
  enabled: boolean
  refresh: () => Promise<unknown>
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { stableKey, releaseKey } = useStableCommandKey()
  const active = useRef(true)
  const inFlight = useRef(false)
  const canReassign = Boolean(detail.permissions['operations.task.reassign'] && !['DONE', 'CANCELLED'].includes(detail.task.status))
  const directory = useOperationCandidates({ taskId: detail.task.id }, canReassign && enabled)
  const displayName = (assignment: { userId?: string | null; personId?: string | null }) =>
    directory.candidates.find(candidate =>
      (assignment.userId != null && candidate.userId === assignment.userId)
      || (assignment.personId != null && candidate.personId === assignment.personId),
    )?.displayName ?? 'Thành viên được phân công'

  const remove = async (assignmentId: string, assignmentVersion: number) => {
    const scope = getTenantScopeKey()
    const reason = (reasons[assignmentId] ?? '').trim()
    if (!scope || !enabled || inFlight.current || !reason) return
    inFlight.current = true; setBusyId(assignmentId); setError('')
    const current = () => active.current && scope === getTenantScopeKey()
    try {
      const payload = { version: detail.task.version, assignmentVersion, reason }
      const key = stableKey('assignment-remove', { taskId: detail.task.id, assignmentId, ...payload })
      await operationsApi.removeTaskAssignment(detail.task.id, assignmentId, payload, key)
      releaseKey('assignment-remove')
      if (!current()) return
      setReasons(value => ({ ...value, [assignmentId]: '' }))
      await refresh()
    } catch (failure) {
      if (current()) setError(operationsErrorText((failure as { code?: string })?.code, failure instanceof Error ? failure.message : 'Không thu hồi được phân công.'))
    } finally {
      inFlight.current = false
      if (current()) setBusyId(null)
    }
  }

  return <section className="mt-4 space-y-2 rounded-lg border border-surface-border p-3" aria-label="Người được phân công">
    <h3 className="m-0 text-sm font-bold text-text-main">Người được phân công</h3>
    {error && <p role="alert" className="m-0 text-sm text-text-main">{error}</p>}
    {detail.assignees.length === 0 && <EmptyState icon={Users} title="Chưa có ai được phân công." description="Giao việc từ biểu mẫu Phân Công trong sự kiện." className="py-4" />}
    {detail.assignees.map(assignment => <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-main">
      <span className="min-w-0 truncate">
        {displayName(assignment)} · {assignment.assignmentRole === 'OWNER' ? 'Phụ trách chính' : 'Phối hợp'}
        <Badge tone={assignment.acknowledgementStatus === 'ACCEPTED' ? 'success' : assignment.acknowledgementStatus === 'DECLINED' ? 'danger' : 'warning'} className="ml-2">
          {assignment.acknowledgementStatus === 'ACCEPTED' ? 'Đã nhận' : assignment.acknowledgementStatus === 'DECLINED' ? 'Từ chối' : 'Chờ xác nhận'}
        </Badge>
      </span>
      {canReassign && (
        <span className="flex w-full items-center gap-2 sm:w-auto">
          <TextInput
            aria-label={`Lý do thu hồi phân công của ${displayName(assignment)}`}
            className="min-w-0 flex-1 sm:w-56 sm:flex-none"
            value={reasons[assignment.id] ?? ''}
            maxLength={2000}
            disabled={busyId !== null}
            placeholder="Lý do thu hồi"
            onChange={event => setReasons(value => ({ ...value, [assignment.id]: event.target.value }))}
          />
          <Button
            variant="danger"
            size="sm"
            disabled={!enabled || busyId !== null || !(reasons[assignment.id] ?? '').trim()}
            loading={busyId === assignment.id}
            onClick={() => void remove(assignment.id, assignment.version)}
          >
            Thu hồi
          </Button>
        </span>
      )}
    </div>)}
  </section>
}
