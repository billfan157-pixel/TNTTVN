import { Calendar, ChevronRight, ListTodo, Users } from 'lucide-react'
import type { OperationsCreationOptions } from '../../lib/api/operations'

type UnitOption = NonNullable<OperationsCreationOptions['units']>[number]

/**
 * W3.3: the single source of the "Tạo mới" menu rows. The desktop dropdown
 * and the mobile bottom-sheet previously carried two full copies of the same
 * item list (same data, different markup) that could drift independently.
 * Both layouts share the label/semantic rules; only visual density differs.
 * - `layout="dropdown"`: compact menu rows (popover owns role="menu" + keys).
 * - `layout="sheet"`: bordered 56px+ cards for touch (inside a ModalShell).
 */
export function CreateMenuItems({
  layout,
  canCreateXuDoan,
  units,
  onPickEvent,
  onPickStandaloneTask,
}: {
  layout: 'dropdown' | 'sheet'
  canCreateXuDoan: boolean
  units: UnitOption[]
  onPickEvent: (scopeKind: 'XU_DOAN' | 'UNIT', scopeUnitId: string) => void
  onPickStandaloneTask: (scopeUnitId: string) => void
}) {
  const eventUnits = units.filter(unit => unit.canCreateEvent)
  const taskUnits = units.filter(unit => unit.canCreateTask)
  const hasEventSection = canCreateXuDoan || eventUnits.length > 0
  const dropdown = layout === 'dropdown'

  const rowClass = dropdown
    ? 'group menu-create-item flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-hover active:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parish-primary'
    : 'menu-create-item flex w-full items-center gap-3 rounded-xl border border-surface-border bg-surface-card p-3.5 text-left transition-colors hover:bg-surface-hover active:bg-surface-active min-h-[56px] mobile-touch-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parish-primary'
  const iconClass = dropdown ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl' : 'icon-container rounded-lg shrink-0'
  const iconSize = dropdown ? 'h-4 w-4' : 'h-5 w-5'
  const titleClass = dropdown ? 'text-sm font-semibold text-text-main' : 'm-0 text-sm font-bold text-text-main'
  const chevron = dropdown ? <ChevronRight className="h-4 w-4 shrink-0 text-text-muted/40 transition-transform group-hover:translate-x-0.5 group-hover:text-text-main" aria-hidden="true" /> : null

  return (
    <div className={dropdown ? '' : 'space-y-2 py-1'} role="group" aria-label="Tùy chọn tạo mới">
      {hasEventSection && (
        <div className={dropdown ? 'mb-1' : undefined}>
          {dropdown && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 typography-caption font-bold">
              <Calendar className="h-3.5 w-3.5 text-parish-primary" aria-hidden="true" />
              <span>Sự kiện</span>
            </div>
          )}
          <div className={dropdown ? 'space-y-0.5' : 'space-y-2'}>
            {canCreateXuDoan && (
              <button type="button" role="menuitem" className={rowClass} onClick={() => onPickEvent('XU_DOAN', '')}>
                <div className={`${iconClass} bg-parish-primary-light text-parish-primary`}>
                  <Calendar className={iconSize} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  {dropdown ? <div className="flex items-center gap-1.5">
                    <span className={titleClass}>Tạo sự kiện Xứ đoàn</span>
                    <span className="rounded-md bg-parish-primary-light px-1.5 py-0.5 text-xs font-bold text-parish-primary">Toàn xứ</span>
                  </div> : <span className={`block ${titleClass}`}>Tạo sự kiện Xứ đoàn</span>}
                  <span className="block truncate text-xs text-text-muted">Toàn Xứ đoàn · nhiều Ban/Ngành phối hợp</span>
                </div>
                {chevron}
              </button>
            )}
            {eventUnits.map(unit => (
              <button key={`event-${unit.id}`} type="button" role="menuitem" className={rowClass} onClick={() => onPickEvent('UNIT', unit.id)}>
                <div className={`${iconClass} bg-parish-primary-light text-parish-primary`}>
                  <Users className={iconSize} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  {dropdown ? <div className="flex items-center gap-1.5">
                    <span className={titleClass}>Tạo sự kiện {unit.name}</span>
                    <span className="rounded-md border border-surface-border bg-surface-ground px-1.5 py-0.5 text-xs font-medium text-text-muted">
                      {unit.unitType === 'BRANCH' ? 'Ngành' : 'Ban'}
                    </span>
                  </div> : <span className={`block ${titleClass}`}>Tạo sự kiện {unit.name}</span>}
                  <span className="block truncate text-xs text-text-muted">Sự kiện chuyên môn · {unit.unitType === 'BRANCH' ? 'Ngành' : 'Ban'}</span>
                </div>
                {chevron}
              </button>
            ))}
          </div>
        </div>
      )}
      {taskUnits.length > 0 && (
        <div className={dropdown ? (hasEventSection ? 'mt-1.5 pt-1.5 border-t border-surface-border/70' : '') : 'space-y-2'}>
          {dropdown && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 typography-caption font-bold">
              <ListTodo className="h-3.5 w-3.5 text-parish-success" aria-hidden="true" />
              <span>Nhiệm vụ độc lập</span>
            </div>
          )}
          <div className={dropdown ? 'space-y-0.5' : 'space-y-2'}>
            {taskUnits.map(unit => (
              <button key={`task-${unit.id}`} type="button" role="menuitem" className={rowClass} onClick={() => onPickStandaloneTask(unit.id)}>
                <div className={`${iconClass} bg-parish-success-bg text-parish-success`}>
                  <ListTodo className={iconSize} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  {dropdown ? <div className="flex items-center gap-1.5">
                    <span className={titleClass}>Tạo Task · {unit.name}</span>
                    <span className="rounded-md bg-parish-success-bg px-1.5 py-0.5 text-xs font-medium text-parish-success">Task</span>
                  </div> : <span className={`block ${titleClass}`}>Tạo Task · {unit.name}</span>}
                  <span className="block truncate text-xs text-text-muted">Việc độc lập, không cần sự kiện</span>
                </div>
                {chevron}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
