import { Calendar, ListTodo, MapPin, Users } from 'lucide-react'

/**
 * Event Overview Stats Card Grid (Catevia Design System v4.5 & Rule 6).
 * Displays key telemetry: Date/Schedule, Venue, Task completion with progress bar, and Team size.
 * Styled with 14px spacing rhythm (gap-3.5) and high-density semantic tokens.
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
  const taskPercent = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0
  const eventDate = new Date(startsAt)
  const isPast = eventDate.getTime() < Date.now()
  const daysDiff = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4" aria-label="Chỉ số nhanh sự kiện">
      {/* 1. Thời gian */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-3 sm:p-3.5 flex items-center gap-3 shadow-2xs hover:border-parish-primary/40 transition-colors">
        <div className="icon-container rounded-xl bg-parish-primary-light text-parish-primary shrink-0 p-2">
          <Calendar className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-text-muted truncate">Thời gian</p>
            {!isPast && daysDiff >= 0 && daysDiff <= 7 && (
              <span className="rounded-full bg-parish-warning-bg px-1.5 py-0.5 text-xs font-extrabold text-parish-warning shrink-0">
                {daysDiff === 0 ? 'Hôm nay' : `Còn ${daysDiff} ngày`}
              </span>
            )}
          </div>
          <p className="m-0 text-xs sm:text-sm font-extrabold text-text-main truncate">
            {eventDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* 2. Địa điểm */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-3 sm:p-3.5 flex items-center gap-3 shadow-2xs hover:border-parish-primary/40 transition-colors">
        <div className="icon-container rounded-xl bg-parish-primary-light text-parish-primary shrink-0 p-2">
          <MapPin className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs font-bold uppercase tracking-wider text-text-muted truncate">Địa điểm</p>
          <p className="m-0 text-xs sm:text-sm font-extrabold text-text-main truncate" title={location || 'Chưa thiết lập'}>
            {location || 'Chưa thiết lập'}
          </p>
        </div>
      </div>

      {/* 3. Nhiệm vụ & Tiến độ */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-3 sm:p-3.5 flex flex-col justify-between gap-2 shadow-2xs hover:border-parish-primary/40 transition-colors">
        <div className="flex items-center gap-3">
          <div className="icon-container rounded-xl bg-parish-primary-light text-parish-primary shrink-0 p-2">
            <ListTodo className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <p className="m-0 text-xs font-bold uppercase tracking-wider text-text-muted truncate">Công việc</p>
              <span className={`text-xs font-bold ${taskPercent === 100 ? 'text-parish-success' : 'text-parish-primary'}`}>
                {taskPercent}%
              </span>
            </div>
            <p className="m-0 text-xs sm:text-sm font-extrabold text-text-main truncate">
              {completedTasksCount}/{totalTasksCount} hoàn tất
            </p>
          </div>
        </div>
        {/* Mini progress bar */}
        <div className="h-1.5 w-full rounded-full bg-surface-border/80 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${taskPercent === 100 ? 'bg-parish-success' : 'bg-parish-primary'}`}
            style={{ width: `${taskPercent}%` }}
          />
        </div>
      </div>

      {/* 4. Đội ngũ & Nhóm công tác */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-3 sm:p-3.5 flex items-center gap-3 shadow-2xs hover:border-parish-primary/40 transition-colors">
        <div className="icon-container rounded-xl bg-parish-primary-light text-parish-primary shrink-0 p-2">
          <Users className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs font-bold uppercase tracking-wider text-text-muted truncate">Đội ngũ</p>
          <p className="m-0 text-xs sm:text-sm font-extrabold text-text-main truncate">
            {totalAssigneesCount} người · {totalWorkstreamsCount} nhóm
          </p>
        </div>
      </div>
    </div>
  )
}
