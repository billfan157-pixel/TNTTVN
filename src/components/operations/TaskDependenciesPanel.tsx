import { Link2 } from 'lucide-react'
import { Badge } from '../common/ui'
import type { OperationTaskDetail } from '../../lib/api/operations'
import { statusLabel, statusTone } from './operationsViewHelpers'

/**
 * W4.2b (decision 2026-09-15): dependencies are shown, never edited. The
 * server has no DELETE endpoint — an edge only unblocks when its source task
 * reaches DONE/CANCELLED — so a "add dependency" UI would be a one-way door
 * and is deliberately not offered (backend DELETE is a separate D3 ticket).
 * Labels come from the enriched GET /tasks/:id edges (title/status joined
 * server-side); a soft-deleted source degrades honestly to "đã xóa".
 */
export function TaskDependenciesPanel({ detail }: { detail: OperationTaskDetail }) {
  if (detail.dependencies.length === 0) return null
  return (
    <section className="mt-4 rounded-lg border border-surface-border p-3" aria-label="Nhiệm vụ đang chờ">
      <h3 className="m-0 text-sm font-bold text-text-main">Chờ hoàn tất nhiệm vụ khác ({detail.dependencies.length})</h3>
      <p className="mb-2 mt-1 text-xs text-text-muted">Nhiệm vụ này không thể hoàn tất hoặc mở chặn cho tới khi các nhiệm vụ dưới đây xong hoặc bị hủy.</p>
      <ul className="m-0 space-y-1.5 p-0">
        {detail.dependencies.map(dependency => (
          <li key={dependency.dependsOnTaskId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-main">
            <span className="flex min-w-0 items-center gap-1.5">
              <Link2 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span className="min-w-0 truncate">{dependency.dependsOnTitle ?? 'Nhiệm vụ đã xóa'}</span>
            </span>
            {dependency.dependsOnStatus
              ? <Badge tone={statusTone(dependency.dependsOnStatus)}>{statusLabel[dependency.dependsOnStatus] || dependency.dependsOnStatus}</Badge>
              : <Badge tone="neutral">ĐÃ XÓA</Badge>}
          </li>
        ))}
      </ul>
    </section>
  )
}
