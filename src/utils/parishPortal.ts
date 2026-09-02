export interface PortalDatedItem {
  date: string
  time?: string | null
  title?: string
}

export function canManageParishEvents(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'chunhiem'
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function selectUpcomingPortalEvents<T extends PortalDatedItem>(
  events: readonly T[],
  now = new Date(),
  horizonDays = 14,
  limit = 4,
): T[] {
  if (horizonDays <= 0 || limit <= 0) return []
  const start = new Date(now)
  start.setHours(12, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + horizonDays - 1)
  const from = localDateKey(start)
  const to = localDateKey(end)

  return [...events]
    .filter(event => event.date >= from && event.date <= to)
    .sort((left, right) => (
      left.date.localeCompare(right.date)
      || (left.time ?? '').localeCompare(right.time ?? '')
      || (left.title ?? '').localeCompare(right.title ?? '', 'vi')
    ))
    .slice(0, limit)
}
