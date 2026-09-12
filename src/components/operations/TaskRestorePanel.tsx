import { useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, TextArea } from '../common/ui'
import { operationsApi, type OperationTaskDetail } from '../../lib/api/operations'
import { operationsErrorText } from '../../lib/operationsErrors'
import { getTenantScopeKey } from '../../lib/tenantScope'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'

export function TaskRestorePanel({ detail, enabled, refresh }: { detail: OperationTaskDetail; enabled: boolean; refresh: () => Promise<unknown> | unknown }) {
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const { stableKey, releaseKey } = useStableCommandKey()
  if (detail.task.status !== 'CANCELLED' || !detail.permissions['operations.task.manage']) return null

  return <section className="mb-4 space-y-3 rounded-xl border border-parish-warning/30 bg-parish-warning-bg/30 p-3" aria-label="Khôi phục nhiệm vụ đã hủy">
    <div className="flex items-start gap-2">
      <RotateCcw aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-parish-warning" />
      <div>
        <h3 className="m-0 text-sm font-extrabold text-text-main">Khôi phục nhiệm vụ</h3>
        <p className="mb-0 mt-1 text-xs text-text-muted">Đưa task về Chưa làm; checklist và phân công hiện có được giữ, nên cần xác nhận lại người phụ trách nếu hoàn cảnh đã đổi. Lịch sử nằm trong audit và lịch nhắc cũ không tự phục hồi.</p>
      </div>
    </div>
    <label className="block text-sm font-semibold text-text-main">Lý do khôi phục
      <TextArea aria-label="Lý do khôi phục nhiệm vụ" className="mt-1 min-h-20 w-full" value={reason} required maxLength={2000} disabled={busy} placeholder="Vì sao công việc này cần được thực hiện lại?" onChange={event => setReason(event.target.value)} />
    </label>
    <Button size="sm" disabled={!enabled || busy || !reason.trim()} loading={busy} onClick={() => {
      const scope = getTenantScopeKey()
      if (!scope || inFlight.current || !reason.trim()) return
      inFlight.current = true; setBusy(true); setMessage('')
      // Stable idempotency key (P1-5): a retried restore with the same
      // payload reuses the key so the server dedups instead of double-acting.
      const payload = { version: detail.task.version, reason: reason.trim() }
      const key = stableKey('task-restore', { id: detail.task.id, ...payload })
      void operationsApi.restoreTask(detail.task.id, payload, key)
        .then(async () => {
          if (scope !== getTenantScopeKey()) return
          releaseKey('task-restore')
          setReason(''); setMessage('Đã khôi phục nhiệm vụ về trạng thái Chưa làm.')
          await refresh()
        })
        .catch(error => { if (scope === getTenantScopeKey()) setMessage(operationsErrorText((error as { code?: string })?.code, error instanceof Error ? error.message : 'Không khôi phục được nhiệm vụ.')) })
        .finally(() => {
          inFlight.current = false
          if (scope === getTenantScopeKey()) setBusy(false)
        })
    }}>Khôi phục task</Button>
    {message && <p role="status" className="m-0 text-sm text-text-main">{message}</p>}
  </section>
}
