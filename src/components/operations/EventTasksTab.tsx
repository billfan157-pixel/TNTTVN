import { useState } from 'react'
import { ClipboardList, Clock, Layers, Plus } from 'lucide-react'
import { Badge, Button } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import type { OperationTask, OperationEventDetail, OperationsCreationOptions } from '../../lib/api/operations'
import { canUseFieldTasks, fieldLayerUnitIds, statusLabel, statusTone, taskPhaseLabel } from './operationsViewHelpers'
import { EventTaskForm } from './EventTaskForm'
import { TaskAssignForm } from './TaskAssignForm'
import { useEffectiveMode } from '../../hooks/useEffectiveMode'

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
  creationOptions,
  onSwitchToWorkstreamsTab,
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
  /** U-21: `creation-options` cho biết caller là Trưởng/Phó Ban-Ngành nào → tầng Mảng. */
  creationOptions?: OperationsCreationOptions | null
  onSwitchToWorkstreamsTab?: () => void
}) {
  const mode = useEffectiveMode()
  const isMobile = mode === 'mobile'
  const [mobileSubTab, setMobileSubTab] = useState<'tasks' | 'form'>('tasks')
  const filteredEmpty = taskGroups.every(group => group.tasks.length === 0)
  const isXuDoanEvent = (detail.event.eventScopeType ?? (detail.event.scopeUnitId ? 'UNIT' : 'XU_DOAN')) === 'XU_DOAN'
  // U-21: task trong Mảng thuộc Ban/Ngành sở hữu Mảng, nên quyền Sửa/Hủy phải xét
  // theo từng Mảng — map cấp event không mô tả được tầng Mảng (nó trả false cho
  // Trưởng Mảng và true cho người điều phối, ngược với luật server đang enforce).
  const fieldUnitIds = fieldLayerUnitIds(creationOptions)
  const blanketFieldAccess = fieldUnitIds.size === 0 && Boolean(detail.permissions['operations.task.create'])
  const fieldOfWorkstream = (groupKey: string) => detail.workstreams.find(group => group.id === groupKey) ?? null
  const unitNameOfField = (groupKey: string) => {
    const unitId = fieldOfWorkstream(groupKey)?.sourceUnitId
    return unitId ? creationOptions?.units.find(unit => unit.id === unitId)?.name ?? null : null
  }
  const manageTasksInGroup = (groupKey: string) => {
    if (!detail.permissions['operations.task.manage']) return false
    const group = fieldOfWorkstream(groupKey)
    // Task không thuộc Mảng (grandfather) giữ luật cấp event; Mảng đi theo tầng Mảng.
    if (!isXuDoanEvent || !group) return true
    return canUseFieldTasks({ unitId: group.sourceUnitId, fieldUnitIds, blanket: blanketFieldAccess })
  }
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

      {/* Mobile Sub-tabs Switcher */}
      {isMobile && (
        <div className="view-tabs p-1 bg-surface-sunken/80 rounded-xl mb-3" role="tablist" aria-label="Chế độ xem nhiệm vụ">
          <button
            type="button"
            role="tab"
            aria-selected={mobileSubTab === 'tasks'}
            onClick={() => setMobileSubTab('tasks')}
            className={`view-tab flex-1 min-h-[44px] justify-center text-xs font-bold ${mobileSubTab === 'tasks' ? 'is-active' : ''}`}
          >
            <ClipboardList className="h-4 w-4" />
            <span>Danh sách việc ({detail.tasks.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileSubTab === 'form'}
            onClick={() => setMobileSubTab('form')}
            className={`view-tab flex-1 min-h-[44px] justify-center text-xs font-bold ${mobileSubTab === 'form' ? 'is-active' : ''}`}
          >
            <Plus className="h-4 w-4" />
            <span>Tạo &amp; Phân công</span>
          </button>
        </div>
      )}

      {/* Lưới Task List + Forms */}
      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <div className={isMobile && mobileSubTab !== 'tasks' ? 'hidden' : 'block'}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="m-0 text-base font-bold text-text-main">Task của sự kiện</h3>
            {/* Filter Chips — same DS-deviation rationale as the task-board chips above (B5). */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap py-1" role="group" aria-label="Lọc task theo trạng thái">
              {taskFilterOptions.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={taskStatusFilter === opt.key}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] sm:min-h-0 inline-flex items-center justify-center mobile-touch-target ${
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
                  ? (detail.permissions['operations.task.create']
                    ? 'Tạo công việc mới ở biểu mẫu bên cạnh để bắt đầu phân công.'
                    : isXuDoanEvent
                      ? 'Việc trong Mảng do Trưởng Mảng — Trưởng/Phó Ban-Ngành phụ trách — tạo và phân công.'
                      : 'Bạn chỉ xem được danh sách công việc của sự kiện này.')
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
                  {/* U-21: Mảng thuộc một Ban/Ngành và việc trong Mảng do Trưởng Mảng
                      tạo — người điều phối Mảng vẫn xem được nhưng không sửa việc. */}
                  {isXuDoanEvent && fieldOfWorkstream(group.key) && (
                    <p className="m-0 mb-2 text-xs text-text-muted">
                      {unitNameOfField(group.key) ? `Ban/Ngành phụ trách: ${unitNameOfField(group.key)}` : 'Mảng phụ trách'}
                      {!manageTasksInGroup(group.key) ? ' · việc trong Mảng do Trưởng Mảng tạo và phân công' : ''}
                    </p>
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
                              {manageTasksInGroup(group.key) && task.status !== 'DONE' && task.status !== 'CANCELLED' && (
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

        <div className={isMobile && mobileSubTab !== 'form' ? 'hidden' : 'space-y-4'}>
          {isXuDoanEvent && detail.workstreams.length === 0 && (
            <div className="rounded-xl border border-surface-border bg-surface-card p-4 shadow-xs text-center space-y-3">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-parish-primary-light text-parish-primary">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h4 className="m-0 text-sm font-extrabold text-text-main">Cần thiết lập Mảng phụ trách</h4>
                <p className="m-0 mt-1 text-xs text-text-muted">
                  Sự kiện Xứ đoàn vận hành theo cơ chế phân cấp: Phân công các Mảng cho Ban/Ngành phụ trách trước khi triển khai nhiệm vụ chi tiết.
                </p>
              </div>
              {onSwitchToWorkstreamsTab && (
                <Button variant="primary" size="sm" fullWidth onClick={onSwitchToWorkstreamsTab}>
                  Thiết lập Mảng &amp; Ban/Ngành
                </Button>
              )}
            </div>
          )}
          <EventTaskForm detail={detail} creationOptions={creationOptions} />
          <TaskAssignForm detail={detail} creationOptions={creationOptions} />
        </div>
      </div>

      {/* W1.7: the checklist no longer renders inline in this tab — the
          "Checklist" buttons (here and in Việc của tôi) open the shared
          TaskDetail modal below, so task detail always appears in front
          of the user instead of at the bottom of the page. */}
    </>
  )
}
