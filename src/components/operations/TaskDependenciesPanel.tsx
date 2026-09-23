import { useMemo, useState } from 'react'
import { Link2, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Select, TextInput } from '../common/ui'
import type { OperationTaskDetail } from '../../lib/api/operations'
import { operationsApi } from '../../lib/api/operations'
import { operationsErrorText } from '../../lib/operationsErrors'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'
import { useOperationsStore } from '../../stores/operationsStore'
import { isTerminalTask, statusLabel, statusTone } from './operationsViewHelpers'

/**
 * Task dependencies panel (W4.2b read-view + V8/Wave A management).
 * Tasks can depend on other tasks within the same event graph (or other
 * standalone tasks if standalone). Adding an edge prevents circular
 * dependencies (server-checked); removing an edge requires task version,
 * dependency target, and an audit reason (operations.task.manage).
 */
export function TaskDependenciesPanel({
  detail,
  enabled = false,
  refresh,
}: {
  detail: OperationTaskDetail
  enabled?: boolean
  refresh?: () => Promise<unknown>
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeReason, setRemoveReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { stableKey, releaseKey } = useStableCommandKey()

  const selectedEvent = useOperationsStore(s => s.selectedEvent)
  const storeTasks = useOperationsStore(s => s.tasks)

  const canManage = Boolean(enabled && detail.permissions['operations.task.manage'] && !isTerminalTask(detail.task.status))

  // Available candidate tasks within the same event boundary
  const candidateTasks = useMemo(() => {
    if (!canManage) return []
    const all = detail.task.operationEventId
      ? (selectedEvent?.event.id === detail.task.operationEventId ? selectedEvent.tasks : storeTasks.filter(t => t.operationEventId === detail.task.operationEventId))
      : storeTasks.filter(t => !t.operationEventId)
    const existingDepIds = new Set(detail.dependencies.map(d => d.dependsOnTaskId))
    return all.filter(t => t.id !== detail.task.id && !existingDepIds.has(t.id) && t.status !== 'CANCELLED')
  }, [canManage, selectedEvent, storeTasks, detail.task.id, detail.task.operationEventId, detail.dependencies])

  if (detail.dependencies.length === 0 && !canManage) return null

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTaskId || busy || !canManage) return
    setBusy(true)
    setError('')
    const key = stableKey(`dep-add:${selectedTaskId}`, { taskId: detail.task.id, version: detail.task.version, dependsOnTaskId: selectedTaskId })
    try {
      await operationsApi.addTaskDependency(detail.task.id, { version: detail.task.version, dependsOnTaskId: selectedTaskId }, key)
      releaseKey(`dep-add:${selectedTaskId}`)
      setSelectedTaskId('')
      setShowAdd(false)
      await refresh?.()
    } catch (err) {
      setError(operationsErrorText((err as { code?: string })?.code, err instanceof Error ? err.message : 'Không thể thêm phụ thuộc.'))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (dependsOnTaskId: string) => {
    const reason = removeReason.trim()
    if (!reason || busy || !canManage) return
    setBusy(true)
    setError('')
    const key = stableKey(`dep-remove:${dependsOnTaskId}`, { taskId: detail.task.id, version: detail.task.version, dependsOnTaskId, reason })
    try {
      await operationsApi.removeTaskDependency(detail.task.id, dependsOnTaskId, { version: detail.task.version, reason }, key)
      releaseKey(`dep-remove:${dependsOnTaskId}`)
      setRemovingId(null)
      setRemoveReason('')
      await refresh?.()
    } catch (err) {
      setError(operationsErrorText((err as { code?: string })?.code, err instanceof Error ? err.message : 'Không thể gỡ phụ thuộc.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-surface-border p-3" aria-label="Nhiệm vụ đang chờ">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-bold text-text-main">
          Chờ hoàn tất nhiệm vụ khác ({detail.dependencies.length})
        </h3>
        {canManage && !showAdd && candidateTasks.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => { setShowAdd(true); setError('') }}
          >
            Thêm phụ thuộc
          </Button>
        )}
      </div>

      <p className="mb-2 mt-1 text-xs text-text-muted">
        Nhiệm vụ này không thể hoàn tất hoặc mở chặn cho tới khi các nhiệm vụ dưới đây xong hoặc bị hủy.
      </p>

      {error && (
        <p role="alert" className="my-2 text-xs text-parish-danger">
          {error}
        </p>
      )}

      {showAdd && canManage && (
        <form onSubmit={handleAdd} className="mb-3 space-y-2 rounded-lg border border-surface-border bg-surface-card p-2.5 text-xs">
          <p className="m-0 font-medium text-text-main">Chọn nhiệm vụ phải hoàn thành trước:</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="flex-1 min-w-[200px]"
              value={selectedTaskId}
              onChange={e => setSelectedTaskId(e.target.value)}
              disabled={busy}
              aria-label="Chọn nhiệm vụ phụ thuộc"
              required
            >
              <option value="">-- Chọn nhiệm vụ --</option>
              {candidateTasks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title} ({statusLabel[t.status] || t.status})
                </option>
              ))}
            </Select>
            <Button size="sm" type="submit" disabled={busy || !selectedTaskId}>
              Lưu
            </Button>
            <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => { setShowAdd(false); setSelectedTaskId('') }}>
              Hủy
            </Button>
          </div>
        </form>
      )}

      {detail.dependencies.length > 0 && (
        <ul className="m-0 space-y-2 p-0">
          {detail.dependencies.map(dependency => {
            const isRemoving = removingId === dependency.dependsOnTaskId
            return (
              <li key={dependency.dependsOnTaskId} className="rounded-md border border-surface-border/60 bg-surface-card/40 p-2 text-sm text-text-main">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Link2 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                    <span className="min-w-0 truncate">{dependency.dependsOnTitle ?? 'Nhiệm vụ đã xóa'}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {dependency.dependsOnStatus
                      ? <Badge tone={statusTone(dependency.dependsOnStatus)}>{statusLabel[dependency.dependsOnStatus] || dependency.dependsOnStatus}</Badge>
                      : <Badge tone="neutral">ĐÃ XÓA</Badge>}
                    {canManage && !isRemoving && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-text-muted hover:text-parish-danger"
                        onClick={() => { setRemovingId(dependency.dependsOnTaskId); setRemoveReason(''); setError('') }}
                        aria-label={`Gỡ phụ thuộc ${dependency.dependsOnTitle ?? dependency.dependsOnTaskId}`}
                        title="Gỡ phụ thuộc"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {isRemoving && canManage && (
                  <div className="mt-2.5 border-t border-surface-border/50 pt-2 space-y-2">
                    <p className="m-0 text-xs text-text-muted">Nhập lý do gỡ phụ thuộc nhiệm vụ này (bắt buộc):</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <TextInput
                        className="flex-1 min-w-[200px]"
                        value={removeReason}
                        onChange={e => setRemoveReason(e.target.value)}
                        placeholder="Lý do gỡ phụ thuộc..."
                        disabled={busy}
                        required
                        aria-label="Lý do gỡ phụ thuộc"
                      />
                      <Button
                        variant="danger"
                        size="sm"
                        type="button"
                        disabled={busy || !removeReason.trim()}
                        onClick={() => void handleRemove(dependency.dependsOnTaskId)}
                      >
                        Xác nhận gỡ
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={busy}
                        onClick={() => { setRemovingId(null); setRemoveReason('') }}
                      >
                        Đóng
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
