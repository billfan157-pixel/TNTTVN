// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { automaticEventTransition, canCreateEventTask, EVENT_PHASES, manualEventTransition, preparationAcceptanceReadiness, reserveInvitationAt, shouldInviteReserve } from '../domain/OperationsEventLifecycle.js'

const event = { status: 'PLANNING' as const, startsAt: '2026-09-10T08:00:00+07:00', endsAt: '2026-09-10T10:00:00+07:00', automationPaused: false }
describe('approved Operations lifecycle policy', () => {
  it('allows adjacent steps and requires a reason plus pause on every rewind', () => {
    for (let index = 1; index < EVENT_PHASES.length - 1; index++) {
      expect(manualEventTransition(EVENT_PHASES[index - 1], EVENT_PHASES[index])).toEqual({ backwards: false, pauseAutomation: false })
      expect(() => manualEventTransition(EVENT_PHASES[index], EVENT_PHASES[index - 1], ' ')).toThrow('EVENT_REWIND_REASON_REQUIRED')
      expect(manualEventTransition(EVENT_PHASES[index], EVENT_PHASES[index - 1], 'Điều chỉnh')).toEqual({ backwards: true, pauseAutomation: true })
    }
    expect(manualEventTransition('LIVE', 'COMPLETED')).toEqual({ backwards: false, pauseAutomation: false })
    // COMPLETED là trạng thái cuối: không lùi được nữa, kể cả có lý do.
    expect(() => manualEventTransition('COMPLETED', 'LIVE', 'Mở lại')).toThrow('EVENT_COMPLETED_TERMINAL')
    expect(() => manualEventTransition('COMPLETED', 'LIVE')).toThrow('EVENT_COMPLETED_TERMINAL')
    expect(() => manualEventTransition('DRAFT', 'READY')).toThrow('NOT_ADJACENT')
    expect(() => manualEventTransition('CANCELLED', 'LIVE')).toThrow('NOT_ADJACENT')
    expect(() => manualEventTransition('READY', 'READY')).toThrow('NOT_ADJACENT')
  })
  it('permits task planning in drafts but not live or terminal events', () => {
    expect(EVENT_PHASES.filter(canCreateEventTask)).toEqual(['DRAFT', 'PLANNING', 'PREPARING', 'READY'])
    expect(canCreateEventTask('CANCELLED')).toBe(false)
  })
  it('moves at exact instants, recording that readiness was skipped', () => {
    expect(automaticEventTransition(event, new Date('2026-09-10T00:59:59Z'))).toBeNull()
    expect(automaticEventTransition(event, new Date('2026-09-10T01:00:00Z'))).toEqual({ status: 'LIVE', missedReady: true })
    expect(automaticEventTransition({ ...event, status: 'READY' }, new Date('2026-09-10T01:00:00Z'))).toEqual({ status: 'LIVE', missedReady: false })
    expect(automaticEventTransition(event, new Date('2026-09-10T03:00:00Z'))).toEqual({ status: 'COMPLETED', missedReady: true })
  })
  it.each(['DRAFT', 'CANCELLED', 'COMPLETED'] as const)('never automatically advances %s', status => {
    expect(automaticEventTransition({ ...event, status }, new Date('2026-09-11T00:00:00Z'))).toBeNull()
  })
  it('keeps paused events paused past both start and end', () => {
    expect(automaticEventTransition({ ...event, status: 'READY', automationPaused: true }, new Date('2026-09-11T00:00:00Z'))).toBeNull()
  })
  it('rejects invalid and timezone-ambiguous timestamps', () => {
    expect(() => automaticEventTransition({ ...event, endsAt: event.startsAt }, new Date())).toThrow('TIME_RANGE')
    expect(() => reserveInvitationAt('2026-09-10T08:00:00', event.endsAt)).toThrow('REQUIRES_OFFSET')
    expect(() => reserveInvitationAt(event.endsAt, event.startsAt)).toThrow('WINDOW_INVALID')
  })
  it('invites reserve once at 70 percent elapsed, not 30 percent elapsed', () => {
    const input = { eventStatus: 'PLANNING' as const, invitedAt: '2026-09-10T08:00:00Z', acknowledgeBy: '2026-09-10T18:00:00Z', acceptedUserId: null, reserveInvitedAt: null }
    expect(reserveInvitationAt(input.invitedAt, input.acknowledgeBy)).toBe('2026-09-10T15:00:00.000Z')
    expect(shouldInviteReserve(input, new Date('2026-09-10T14:59:59Z'))).toBe(false)
    expect(shouldInviteReserve(input, new Date('2026-09-10T15:00:00Z'))).toBe(true)
    for (const patch of [{ eventStatus: 'DRAFT' as const }, { invitedAt: null }, { acceptedUserId: 'winner' }, { reserveInvitedAt: input.invitedAt }]) {
      expect(shouldInviteReserve({ ...input, ...patch }, new Date('2026-09-10T15:00:00Z'))).toBe(false)
    }
  })
  it('does not report zero tasks, missing owners or invalid performers as ready', () => {
    expect(preparationAcceptanceReadiness([]).eligible).toBe(false)
    const task = { id: 'task', cancelled: false, hasOwner: true, performers: [{ valid: true, accepted: true }] }
    expect(preparationAcceptanceReadiness([task]).eligible).toBe(true)
    expect(preparationAcceptanceReadiness([{ ...task, cancelled: true }]).eligible).toBe(false)
    for (const patch of [{ hasOwner: false }, { performers: [] }, { performers: [{ valid: false, accepted: true }] }, { performers: [{ valid: true, accepted: false }] }]) {
      expect(preparationAcceptanceReadiness([{ ...task, ...patch }])).toEqual({ eligible: false, pendingTaskIds: ['task'] })
    }
  })
})
