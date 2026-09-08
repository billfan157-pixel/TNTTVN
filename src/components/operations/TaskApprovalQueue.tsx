import { useEffect, useRef, useState } from 'react'
import { Button } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import { operationsApi, type OperationTask } from '../../lib/api/operations'
import { getTenantScope, getTenantScopeKey } from '../../lib/tenantScope'

export function TaskApprovalQueue({ enabled, openTask }: { enabled: boolean; openTask: (id: string) => Promise<unknown> }) {
  const [tasks, setTasks] = useState<OperationTask[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const pending = useRef(false)
  useEffect(() => { if (!enabled) { generation.current++; setTasks([]); setLoaded(false); setHasMore(false); setPage(0); setBusy(false) } }, [enabled])
  useEffect(() => () => { generation.current++ }, [])
  const load = async (next: number) => {
    const scope = getTenantScopeKey(); const parishId = getTenantScope()?.parishId
    if (!enabled || pending.current || !scope || !parishId) return
    pending.current = true; setBusy(true); setError('')
    const token = ++generation.current
    const current = () => token === generation.current && scope === getTenantScopeKey()
    try {
      const result = await operationsApi.getApprovalQueue(next)
      if (!current()) return
      if (result.data.some(task => task.parishId !== parishId) || result.meta.page !== next) throw new Error('Danh sách duyệt không đúng phạm vi.')
      setTasks(previous => next === 1 ? result.data : [...previous, ...result.data.filter(task => !previous.some(item => item.id === task.id))])
      setPage(next); setHasMore(result.meta.page < result.meta.totalPages); setLoaded(true)
    } catch (failure) {
      if (current()) {
        setTasks([]); setLoaded(false); setHasMore(false); setPage(0)
        setError(failure instanceof Error ? failure.message : 'Không tải được việc chờ duyệt.')
      }
    }
    finally { pending.current = false; if (current()) setBusy(false) }
  }
  return <section aria-label="Việc chờ tôi duyệt" className="rounded-xl border border-surface-border p-4">
    <h2 className="m-0 text-sm font-bold text-text-main">Chờ tôi duyệt</h2>
    <p className="text-xs text-text-muted">Theo quyền duyệt hiện tại, gồm phân công trực tiếp và vai trò trong nhóm.</p>
    <Button variant="secondary" size="sm" disabled={!enabled || busy} onClick={() => void load(1)}>Tải việc chờ duyệt</Button>
    {error && <p role="alert" className="text-sm text-text-main">{error}</p>}
    {loaded && tasks.length === 0 && <EmptyState title="Không có nhiệm vụ đang chờ bạn duyệt." description="Tải lại danh sách khi có phân công mới hoặc thay đổi quyền duyệt." />}
    {tasks.map(task => <div key={task.id} className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-text-main">{task.title}</span><Button size="sm" disabled={!enabled} onClick={() => void openTask(task.id).catch(() => undefined)}>Mở để duyệt</Button></div>)}
    {hasMore && <Button variant="ghost" size="sm" disabled={!enabled || busy} onClick={() => void load(page + 1)}>Tải thêm việc chờ duyệt</Button>}
  </section>
}
