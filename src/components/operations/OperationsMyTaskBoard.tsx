import type { Ref } from 'react'
import { AlertTriangle, Archive, CheckCircle2, CircleAlert, Clock, ShieldCheck } from 'lucide-react'
import { Badge, Button, Surface } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import type { OperationTask, OperationTaskDispatchInvitation } from '../../lib/api/operations'
import { isTerminalTask, statusLabel, statusTone, taskPhaseLabel } from './operationsViewHelpers'

export type MyTaskFilter = 'ALL' | 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'DONE' | 'ARCHIVED'

export interface TaskOverflowAction {
  key: string
  label: string
  danger?: boolean
  run: () => void
}

/**
 * W3.2 extraction: the "Việc của tôi" section (dispatch invitations, status
 * filter chips, task cards with the W3.8 overflow trigger). Purely
 * props-driven — the page keeps handlers, busy tracking and the idempotent
 * command flow so mutation semantics stay exactly where their tests probe
 * them; only markup moved.
 */
export function OperationsMyTaskBoard({
  sectionRef,
  tasks,
  filteredMyTasks,
  taskTotal,
  taskHasMore,
  loadingMoreTasks,
  onLoadMoreTasks,
  myTaskFilter,
  onMyTaskFilterChange,
  myTaskFilterOptions,
  dispatchInvitations,
  dispatchTotal,
  dispatchHasMore,
  loadingMoreDispatches,
  onLoadMoreDispatches,
  busyInbox,
  onAcceptDispatch,
  isOnline,
  source,
  canMutate,
  loading,
  taskDetailLoading,
  busyTask,
  onSelectTask,
  onTaskAction,
  onOverflowOpen,
  overflowTaskId,
}: {
  sectionRef: Ref<HTMLElement>
  tasks: OperationTask[]
  filteredMyTasks: OperationTask[]
  taskTotal: number
  taskHasMore: boolean
  loadingMoreTasks: boolean
  onLoadMoreTasks: () => void
  myTaskFilter: MyTaskFilter
  onMyTaskFilterChange: (filter: MyTaskFilter) => void
  myTaskFilterOptions: Array<{ key: MyTaskFilter; label: string; count: number }>
  dispatchInvitations: OperationTaskDispatchInvitation[]
  dispatchTotal: number
  dispatchHasMore: boolean
  loadingMoreDispatches: boolean
  onLoadMoreDispatches: () => void
  busyInbox: Set<string>
  onAcceptDispatch: (invitation: OperationTaskDispatchInvitation) => void
  isOnline: boolean
  source: 'server' | 'cache' | 'none'
  canMutate: boolean
  loading: boolean
  taskDetailLoading: boolean
  busyTask: string | null
  onSelectTask: (taskId: string) => void
  onTaskAction: (task: OperationTask, action: 'DONE' | 'ACCEPTED' | 'DECLINED' | 'IN_PROGRESS' | 'BLOCKED' | 'CANCELLED') => void
  onOverflowOpen: (task: OperationTask, actions: TaskOverflowAction[], button: HTMLButtonElement) => void
  overflowTaskId: string | null
}) {
  return (
    <Surface ref={sectionRef} as="section" variant="card" className="overflow-hidden rounded-2xl border border-surface-border shadow-xs flex flex-col scroll-mt-4" aria-label="Việc của tôi">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3.5 bg-surface-ground/30">
        <div className="flex items-center gap-2">
          <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="m-0 text-base font-bold text-text-main">Việc Của Tôi</h2>
            <p className="m-0 text-xs text-text-muted">{tasks.length} nhiệm vụ được giao cho bạn{taskTotal > tasks.length ? ` · ${taskTotal} tất cả` : ''}</p>
          </div>
        </div>
        <Badge tone="neutral">{filteredMyTasks.length}/{tasks.length}</Badge>
      </div>

      {dispatchInvitations.length > 0 && (
        <div className="space-y-2 border-b border-surface-border bg-parish-warning-bg p-3" aria-label="Lời mời nhận nhiệm vụ">
          <p className="m-0 text-xs font-extrabold text-text-main">Lời mời phụ trách đang chờ{dispatchTotal > dispatchInvitations.length ? ` (${dispatchInvitations.length}/${dispatchTotal})` : ''}</p>
          {dispatchInvitations.map(invitation => (
            <div key={invitation.id} className="flex flex-col gap-2 rounded-xl border border-parish-warning/30 bg-surface-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold text-text-main">{invitation.taskTitle}</p>
                <p className="m-0 text-xs text-text-muted">
                  {invitation.eventTitle} · {invitation.target === 'PRIMARY' ? 'Người chính' : 'Người dự bị'} · phản hồi trước {new Date(invitation.acknowledgeBy).toLocaleString('vi-VN')}
                </p>
              </div>
              <Button
                size="sm"
                disabled={!canMutate || busyInbox.has(invitation.id)}
                loading={busyInbox.has(invitation.id)}
                onClick={() => onAcceptDispatch(invitation)}
              >
                Nhận nhiệm vụ
              </Button>
            </div>
          ))}
          {/* W2.3: page 2+ of the inbox was invisible at >100 invitations. */}
          {dispatchHasMore && (
            <Button variant="secondary" size="sm" loading={loadingMoreDispatches} disabled={!isOnline || source !== 'server' || loading} onClick={onLoadMoreDispatches}>
              Tải thêm lời mời
            </Button>
          )}
        </div>
      )}

      {/* Quick Filter Chips — intentionally hand-rolled, not DS FilterChips:
          DS pills are 32px/grouped 30px tall, below the 44px mobile touch
          invariant; these keep role=group + aria-pressed + min-h-44. (B5) */}
      <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-surface-ground/40 border-b border-surface-border" role="group" aria-label="Lọc công việc theo trạng thái">
        {myTaskFilterOptions.map(opt => (
          <button
            key={opt.key}
            type="button"
            aria-pressed={myTaskFilter === opt.key}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] sm:min-h-0 inline-flex items-center justify-center mobile-touch-target ${
              myTaskFilter === opt.key
                ? 'bg-parish-primary text-text-inverse shadow-xs'
                : 'bg-surface-card text-text-muted hover:text-text-main border border-surface-border hover:bg-surface-hover'
            }`}
            onClick={() => onMyTaskFilterChange(opt.key)}
          >
            {opt.label} ({opt.count})
          </button>
        ))}
      </div>

      <div className="divide-y divide-surface-border flex-1">
        {filteredMyTasks.length === 0 && (
          <div className="p-8">
            <EmptyState
              icon={ShieldCheck}
              title="Không có công việc nào"
              description={
                myTaskFilter === 'ALL'
                  ? 'Hiện không có công việc nào cần xử lý.'
                  : myTaskFilter === 'ARCHIVED'
                    ? 'Chưa có công việc nào trong mục lưu trữ.'
                    : `Không có công việc nào ở trạng thái ${myTaskFilterOptions.find(o => o.key === myTaskFilter)?.label.toLowerCase()}.`
              }
            />
          </div>
        )}
        {filteredMyTasks.map(task => {
          const mutable = !isTerminalTask(task.status)
          const hasPending = mutable && task.myAssignments?.some(assignment => assignment.acknowledgementStatus === 'PENDING')
          const canExecute = task.myAssignments?.some(assignment =>
            assignment.acknowledgementStatus === 'ACCEPTED'
            && (assignment.assignmentRole === 'OWNER' || assignment.assignmentRole === 'CONTRIBUTOR'))
          // W3.8: the secondary set collapses into "...". canExecute and
          // hasPending are mutually exclusive (server ack states), so the max
          // simultaneous overflow entries here is two (BLOCKED + CANCELLED)
          // for an accepted worker, or three when decline joins.
          const overflowActions: TaskOverflowAction[] = []
          if (hasPending) overflowActions.push({ key: 'decline', label: 'Từ chối', danger: true, run: () => onTaskAction(task, 'DECLINED') })
          if (mutable) overflowActions.push({ key: 'block', label: 'Báo bị chặn', run: () => onTaskAction(task, 'BLOCKED') })
          if (mutable) overflowActions.push({ key: 'cancel', label: 'Hủy việc', danger: true, run: () => onTaskAction(task, 'CANCELLED') })
          const overflowOpen = overflowTaskId === task.id
          return (
            <article key={task.id} className="p-4 transition-colors hover:bg-surface-hover/30">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {task.status === 'DONE' ? (
                    <div className="rounded-full bg-parish-success-bg p-1 text-parish-success">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  ) : task.status === 'BLOCKED' ? (
                    <div className="rounded-full bg-parish-danger-bg p-1 text-parish-danger">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                  ) : task.status === 'CANCELLED' ? (
                    <div className="rounded-full bg-parish-danger-bg p-1 text-parish-danger">
                      <Archive className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="rounded-full bg-parish-primary-light p-1 text-parish-primary">
                      <CircleAlert className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="m-0 text-sm font-bold text-text-main">{task.title}</h3>
                      {task.isRequired && <Badge tone="warning">Bắt buộc</Badge>}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Badge tone="neutral">{taskPhaseLabel[task.phase]}</Badge>
                      <Badge tone={statusTone(task.status)}>
                        {task.status === 'CANCELLED' ? 'Đã hủy / Lưu trữ' : (statusLabel[task.status] || task.status)}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {task.scheduledStartAt && task.scheduledEndAt
                        ? `Ca: ${new Date(task.scheduledStartAt).toLocaleString('vi-VN')} – ${new Date(task.scheduledEndAt).toLocaleString('vi-VN')}`
                        : task.dueAt ? `Hạn: ${new Date(task.dueAt).toLocaleString('vi-VN')}` : 'Chưa có lịch'}
                    </span>
                    {task.scheduledStartAt && task.scheduledEndAt && task.dueAt && <span>Hạn: {new Date(task.dueAt).toLocaleString('vi-VN')}</span>}
                  </div>

                  {task.blockedReason && (
                    <div className="mt-2 rounded-lg border border-parish-danger/30 bg-parish-danger-bg p-2 text-xs text-parish-danger">
                      <span className="font-bold">Điểm nghẽn:</span> {task.blockedReason}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!isOnline || source !== 'server' || taskDetailLoading}
                      onClick={() => onSelectTask(task.id)}
                    >
                      {task.status === 'CANCELLED' ? 'Chi tiết & Khôi phục' : 'Chi tiết nhiệm vụ'}
                    </Button>
                    {/* W1.6: TODO → IN_PROGRESS was server-legal and handler-ready
                        but had no button, so "Đang làm" never moved from the UI. */}
                    {canExecute && task.status === 'TODO' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!canMutate || busyTask === task.id}
                        loading={busyTask === task.id}
                        onClick={() => onTaskAction(task, 'IN_PROGRESS')}
                      >
                        Bắt đầu làm
                      </Button>
                    )}
                    {canExecute && mutable && (
                      <Button
                        size="sm"
                        disabled={!canMutate || busyTask === task.id}
                        onClick={() => onTaskAction(task, 'DONE')}
                      >
                        Hoàn tất
                      </Button>
                    )}
                    {hasPending && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!canMutate || busyTask === task.id}
                        onClick={() => onTaskAction(task, 'ACCEPTED')}
                      >
                        Nhận việc
                      </Button>
                    )}
                    {/* W3.8: secondary actions collapse into an overflow menu. */}
                    {overflowActions.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Thêm thao tác cho ${task.title}`}
                        aria-haspopup="menu"
                        aria-expanded={overflowOpen}
                        disabled={!canMutate || busyTask === task.id}
                        onClick={event => {
                          onOverflowOpen(task, overflowActions, event.currentTarget)
                        }}
                      >
                        ···
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          )
        })}
        {taskHasMore && (
          <div className="p-3 text-center bg-surface-ground/20">
            <Button variant="secondary" size="sm" loading={loadingMoreTasks} disabled={!isOnline || source !== 'server' || loading} onClick={onLoadMoreTasks}>
              Tải thêm công việc
            </Button>
          </div>
        )}
      </div>
    </Surface>
  )
}
