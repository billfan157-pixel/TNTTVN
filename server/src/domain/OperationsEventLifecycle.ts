/** Approved lifecycle policy. Callers must authorize and persist under OCC. */
export const EVENT_PHASES = ['DRAFT', 'PLANNING', 'PREPARING', 'READY', 'LIVE', 'COMPLETED'] as const
export type EventPhase = typeof EVENT_PHASES[number] | 'CANCELLED'

export function manualEventTransition(from: EventPhase, to: EventPhase, reason?: string | null) {
  if (from === 'COMPLETED') throw new Error('EVENT_COMPLETED_TERMINAL')
  const previous = EVENT_PHASES.indexOf(from as typeof EVENT_PHASES[number])
  const next = EVENT_PHASES.indexOf(to as typeof EVENT_PHASES[number])
  if (previous < 0 || next < 0 || Math.abs(next - previous) !== 1) {
    throw new Error('EVENT_TRANSITION_NOT_ADJACENT')
  }
  const backwards = next < previous
  if (backwards && !reason?.trim()) throw new Error('EVENT_REWIND_REASON_REQUIRED')
  return { backwards, pauseAutomation: backwards }
}

export function canCreateEventTask(status: EventPhase): boolean {
  return ['DRAFT', 'PLANNING', 'PREPARING', 'READY'].includes(status)
}

function instant(value: string): number {
  // Explicit offset required: avoid machine-local timezone interpretation.
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('EVENT_TIMESTAMP_REQUIRES_OFFSET')
  const time = Date.parse(value)
  if (!Number.isFinite(time)) throw new Error('EVENT_TIMESTAMP_INVALID')
  return time
}

export function automaticEventTransition(event: {
  status: EventPhase; startsAt: string; endsAt: string; automationPaused: boolean
}, now: Date): { status: 'LIVE' | 'COMPLETED'; missedReady: boolean } | null {
  const current = now.getTime()
  const start = instant(event.startsAt)
  const end = instant(event.endsAt)
  if (!Number.isFinite(current) || end <= start) throw new Error('EVENT_TIME_RANGE_INVALID')
  if (event.automationPaused || ['DRAFT', 'CANCELLED', 'COMPLETED'].includes(event.status)) return null
  if (current >= end) return { status: 'COMPLETED', missedReady: event.status !== 'LIVE' && event.status !== 'READY' }
  if (current >= start && event.status !== 'LIVE') return { status: 'LIVE', missedReady: event.status !== 'READY' }
  return null
}

/** Persist actual invitation time, never task creation time while still DRAFT. */
export function reserveInvitationAt(invitedAt: string, acknowledgeBy: string): string {
  const start = instant(invitedAt)
  const end = instant(acknowledgeBy)
  if (end <= start) throw new Error('ACKNOWLEDGEMENT_WINDOW_INVALID')
  return new Date(start + Math.ceil((end - start) * 0.7)).toISOString()
}

export function shouldInviteReserve(input: {
  eventStatus: EventPhase; invitedAt: string | null; acknowledgeBy: string;
  acceptedUserId: string | null; reserveInvitedAt: string | null
}, now: Date): boolean {
  if (!input.invitedAt || input.acceptedUserId || input.reserveInvitedAt || ['DRAFT', 'COMPLETED', 'CANCELLED'].includes(input.eventStatus)) return false
  return now.getTime() >= Date.parse(reserveInvitationAt(input.invitedAt, input.acknowledgeBy))
}

export function preparationAcceptanceReadiness(tasks: Array<{
  id: string; cancelled: boolean; hasOwner: boolean;
  performers: Array<{ valid: boolean; accepted: boolean }>
}>) {
  const active = tasks.filter(task => !task.cancelled)
  const pendingTaskIds = active.filter(task => !task.hasOwner || task.performers.length === 0 || task.performers.some(person => !person.valid || !person.accepted)).map(task => task.id)
  return { eligible: active.length > 0 && pendingTaskIds.length === 0, pendingTaskIds }
}
