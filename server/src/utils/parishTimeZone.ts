export const DEFAULT_PARISH_TIME_ZONE = 'Asia/Ho_Chi_Minh'

/**
 * Resolve the server-authoritative civil timezone used for parish calendar
 * dates. Organizational service terms are date-only records, so comparing
 * them against UTC can grant or revoke authority on the wrong local day.
 */
export function getParishTimeZone(configuredValue: string | undefined = process.env.PARISH_TIME_ZONE): string {
  const timeZone = configuredValue?.trim() || DEFAULT_PARISH_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0))
  } catch {
    throw new Error('PARISH_TIME_ZONE must be a valid IANA time zone')
  }
  return timeZone
}

/** Return YYYY-MM-DD in the deployment parish timezone, never browser time. */
export function parishCalendarDate(now: Date = new Date(), timeZone: string = getParishTimeZone()): string {
  if (Number.isNaN(now.getTime())) throw new Error('Cannot resolve parish calendar date from an invalid instant')
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: getParishTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
