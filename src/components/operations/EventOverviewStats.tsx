import { Calendar, ListTodo, MapPin, Users } from 'lucide-react'

/**
 * W3.2 extraction: the four quick-stat cards at the top of the event detail
 * modal (time / place / task progress / people). Pure presentational — all
 * values come from the store-derived detail the page already computes.
 */
export function EventOverviewStats({
  startsAt,
  location,
  completedTasksCount,
  totalTasksCount,
  totalAssigneesCount,
  totalWorkstreamsCount,
}: {
  startsAt: string
  location: string | null
  completedTasksCount: number
  totalTasksCount: number
  totalAssigneesCount: number
  totalWorkstreamsCount: number
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <div className="rounded-xl border border-surface-border bg-surface-card p-3 flex items-center gap-2.5 shadow-xs">
        <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
          <Calendar className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-xs font-medium text-text-muted truncate">Thời gian</p>
          <p className="m-0 text-xs font-bold text-text-main truncate">
            {new Date(startsAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-card p-3 flex items-center gap-2.5 shadow-xs">
        <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
          <MapPin className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-xs font-medium text-text-muted truncate">Địa điểm</p>
          <p className="m-0 text-xs font-bold text-text-main truncate">
            {location || 'Chưa thiết lập'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-card p-3 flex items-center gap-2.5 shadow-xs">
        <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
          <ListTodo className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-xs font-medium text-text-muted truncate">Công việc</p>
          <p className="m-0 text-xs font-bold text-text-main truncate">
            {completedTasksCount}/{totalTasksCount} hoàn tất
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-card p-3 flex items-center gap-2.5 shadow-xs">
        <div className="icon-container rounded-lg bg-parish-primary-light text-parish-primary shrink-0">
          <Users className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-xs font-medium text-text-muted truncate">Đội ngũ</p>
          <p className="m-0 text-xs font-bold text-text-main truncate">
            {totalAssigneesCount} người · {totalWorkstreamsCount} nhóm
          </p>
        </div>
      </div>
    </div>
  )
}
