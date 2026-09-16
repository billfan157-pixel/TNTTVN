import { ClipboardList, Clock } from 'lucide-react'
import { Badge, Button } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import type { OperationTask, OperationEventDetail } from '../../lib/api/operations'
import { statusLabel, statusTone, taskPhaseLabel } from './operationsViewHelpers'
import { EventTaskForm } from './EventTaskForm'
import { TaskAssignForm } from './TaskAssignForm'

export type EventTaskFilter = 'ALL' | 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'ARCHIVED'

/**
 * W3.2 extraction: the "Nhiệm vụ & Phân công" tab of the event modal.
 * Filtering/grouping (taskGroups, taskFilterOptions) stays computed by the page
 * — it is cheap memoized data — while this component owns only presentation:
 * the conflict warning, the status chips, the grouped task rows and the two
 * side forms. Behavior (open edit, open checklist dialog) is callbacks.
 */
export function EventTasksTab({
  detail,
  assignmentWarnings,
  taskGroups,
  taskFilterOptions,
  taskStatusFilter,
  onTaskStatusFilterChange,
  assigneeCountByTask,
  selectedTaskId,
  pendingTaskId,
  taskDetailLoading,
  isOnline,
  source,
  onOpenEditTask,
  onOpenChecklist,
  onCancelTask,
}: {
  detail: OperationEventDetail
  assignmentWarnings: { taskId: string; items: Array<{ id: string; startsAt: string; endsAt: string }> } | null
  taskGroups: Array<{ key: string; label: string | null; tasks: OperationTask[] }>
  taskFilterOptions: Array<{ key: EventTaskFilter; label: string; count: number }>
  taskStatusFilter: EventTaskFilter
  onTaskStatusFilterChange: (filter: EventTaskFilter) => void
  assigneeCountByTask: Map<string, number>
  selectedTaskId: string | null
  pendingTaskId: string | null
  taskDetailLoading: boolean
  isOnline: boolean
  source: 'server' | 'cache' | 'none'
  onOpenEditTask: (task: OperationTask) => void
  onOpenChecklist: (task: OperationTask) => void
  onCancelTask?: (task: OperationTask) => void
}) {
  const filteredEmpty = taskGroups.every(group => group.tasks.length === 0)
  return (
    <>
      {/* Cảnh báo phân công trùng lịch */}
      {assignmentWarnings && assignmentWarnings.items.length > 0 && detail.tasks.some(task => task.id === assignmentWarnings.taskId) && (
        <div role="status" className="rounded-lg border border-surface-border p-3 text-sm text-text-main">
          <p className="m-0 font-medium">Đã lưu phân công, nhưng người nhận có lịch bận tại hạn công việc. Hãy trao đổi lại; đây chưa phải xác nhận nhận việc hoặc kiểm tra toàn bộ ca phục vụ.</p>
          <div className="mt-2 space-y-1">
            {assignmentWarnings.items.map(item => (
              <p key={item.id} className="m-0 text-xs">{new Date(item.startsAt).toLocaleString('vi-VN')} – {new Date(item.endsAt).toLocaleString('vi-VN')}</p>
            ))}
          </div>
        </div>
      )}

      {/* Lưới Task List + Forms */}
      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="m-0 text-base font-bold text-text-main">Task của sự kiện</h3>
            {/* Filter Chips — same DS-deviation rationale as the task-board chips above (B5). */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc task theo trạng thái">
              {taskFilterOptions.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={taskStatusFilter === opt.key}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] sm:min-h-0 inline-flex items-center justify-center mobile-touch-target ${
                    taskStatusFilter === opt.key
                      ? 'bg-parish-primary text-text-inverse shadow-xs'
                      : 'bg-surface-card text-text-muted hover:text-text-main border border-surface-border hover:bg-surface-hover'
                  }`}
                  onClick={() => onTaskStatusFilterChange(opt.key)}
                >
                  {opt.label} ({opt.count})
                </button>
              ))}
            </div>
          </div>

          {filteredEmpty ? (
            <EmptyState
              icon={ClipboardList}
              title={
                taskStatusFilter === 'ALL'
                  ? 'Chưa có task.'
                  : taskStatusFilter === 'ARCHIVED'
                    ? 'Lưu trữ trống.'
                    : 'Không có task nào trong bộ lọc này.'
              }
              description={
                taskStatusFilter === 'ALL'
                  ? 'Tạo công việc mới ở biểu mẫu bên cạnh để bắt đầu phân công.'
                  : taskStatusFilter === 'ARCHIVED'
                    ? 'Chưa có công việc nào bị hủy hoặc đưa vào lưu trữ.'
                    : 'Hãy chọn một trạng thái khác để xem công việc.'
              }
              className="rounded-xl border border-surface-border py-8"
            />
          ) : (
            <div className="space-y-4">
              {taskGroups.filter(group => group.tasks.length > 0).map(group => (
                <section key={group.key} aria-label={group.label ?? 'Task của sự kiện'}>
                  {group.label && (
                    <h4 className="m-0 mb-2 text-xs font-extrabold uppercase tracking-wider text-text-muted">{group.label} ({group.tasks.length})</h4>
                  )}
                  <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface-card overflow-hidden">
                    {group.tasks.map(task => (
                        <div key={task.id} className="flex items-start justify-between gap-3 px-3.5 py-3 hover:bg-surface-hover/40 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="m-0 text-sm font-bold text-text-main">{task.title}</p>
                              {task.isRequired && (
                                <Badge tone="warning" className="uppercase font-bold py-0">Bắt buộc</Badge>
                              )}
                            </div>
                            <p className="mb-0 mt-1 text-xs text-text-muted">
                              {taskPhaseLabel[task.phase]} · {assigneeCountByTask.get(task.id) ?? 0} người được phân công
                            </p>
                            {task.scheduledStartAt && task.scheduledEndAt && (
                              <p className="mb-0 mt-1 text-xs text-text-muted flex items-center gap-1">
                                <Clock className="h-3 w-3 text-text-muted" />
                                Ca: {new Date(task.scheduledStartAt).toLocaleString('vi-VN')} – {new Date(task.scheduledEndAt).toLocaleString('vi-VN')}
                              </p>
                            )}
                            {task.dueAt && (
                              <p className="mb-0 mt-1 text-xs text-text-muted flex items-center gap-1">
                                <Clock className="h-3 w-3 text-text-muted" />
                                Hạn: {new Date(task.dueAt).toLocaleString('vi-VN')}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <Badge tone={statusTone(task.status)}>
                              {task.status === 'CANCELLED' ? 'Đã hủy / Lưu trữ' : (statusLabel[task.status] || task.status)}
                            </Badge>
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              {detail.permissions['operations.task.manage'] && task.status !== 'DONE' && task.status !== 'CANCELLED' && (
                                <>
                                  <Button variant="ghost" size="sm" disabled={!isOnline || source !== 'server'} onClick={() => onOpenEditTask(task)}>
                                    Sửa
                                  </Button>
                                  {onCancelTask && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-parish-danger hover:text-parish-danger hover:bg-parish-danger-bg"
                                      disabled={!isOnline || source !== 'server'}
                                      onClick={() => onCancelTask(task)}
                                    >
                                      Hủy việc
                                    </Button>
                                  )}
                                </>
                              )}
                              <Button
                                variant={selectedTaskId === task.id ? 'primary' : 'ghost'}
                                size="sm"
                                loading={taskDetailLoading && pendingTaskId === task.id}
                                disabled={!isOnline || source !== 'server'}
                                onClick={() => onOpenChecklist(task)}
                              >
                                {task.status === 'CANCELLED' ? 'Chi tiết & Khôi phục' : 'Checklist'}
                              </Button>
                            </div>
                          </div>
                        </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <EventTaskForm detail={detail} />
          <TaskAssignForm detail={detail} />
        </div>
      </div>

      {/* W1.7: the checklist no longer renders inline in this tab — the
          "Checklist" buttons (here and in Việc của tôi) open the shared
          TaskDetail modal below, so task detail always appears in front
          of the user instead of at the bottom of the page. */}
    </>
  )
}
