import { describe, it, expect } from 'vitest'
import { GradeAggregate } from '../domain/GradeAggregate'
import type { GradeRecord } from '../types'

describe('GradeAggregate Invariants & Rules', () => {
  const dummyGrade: GradeRecord = {
    id: 'GR-TEST-001',
    studentId: 'ST-001',
    academicYear: '2025-2026',
    semester: 1,
    scoreOral: 8.0,
    scoreOral_source: null,
    scoreOral_updated_at: null,
    score15m: 7.5,
    score15m_source: null,
    score15m_updated_at: null,
    score1Period: 9.0,
    score1Period_source: null,
    score1Period_updated_at: null,
    scoreMidterm: null,
    scoreMidterm_source: null,
    scoreMidterm_updated_at: null,
    scoreFinal: null,
    scoreFinal_source: null,
    scoreFinal_updated_at: null,
    scoreDaoDuc: 10,
    version: 1,
  }

  it('initializes with AUTO state when no active overrides exist', () => {
    const aggregate = new GradeAggregate(dummyGrade)
    const view = aggregate.getEffectiveView('scoreOral', 8.0)

    expect(view.state).toBe('AUTO')
    expect(view.effectiveValue).toBe(8.0)
    expect(view.manualValue).toBeNull()
  })

  it('enforces 0-10 score boundary on manual override', () => {
    const aggregate = new GradeAggregate(dummyGrade)

    expect(() => aggregate.override('scoreOral', 11, 'TeacherAdjustment')).toThrowError('between 0 and 10')
    expect(() => aggregate.override('scoreOral', -1, 'TeacherAdjustment')).toThrowError('between 0 and 10')
  })

  it('applies manual override and transitions to MANUAL_OVERRIDDEN state', () => {
    const aggregate = new GradeAggregate(dummyGrade)
    const overrideRecord = aggregate.override('scoreOral', 9.5, 'SpecialAssignment', 'Cộng điểm thi đua', 'user-admin')

    expect(overrideRecord.manualValue).toBe(9.5)
    expect(overrideRecord.version).toBe(1)

    const view = aggregate.getEffectiveView('scoreOral', 8.0)
    expect(view.state).toBe('AUTO_UPDATED_WHILE_OVERRIDDEN')
    expect(view.effectiveValue).toBe(9.5)
    expect(view.manualValue).toBe(9.5)

    const viewSame = aggregate.getEffectiveView('scoreOral', 9.5)
    expect(viewSame.state).toBe('MANUAL_OVERRIDDEN')
  })

  it('records uncommitted Domain Events during override and restore', () => {
    const aggregate = new GradeAggregate(dummyGrade)
    aggregate.override('scoreOral', 9.0, 'TeacherAdjustment', undefined, 'user-admin')
    aggregate.restore('scoreOral', 'user-admin')

    const events = aggregate.getUncommittedEvents()
    expect(events.length).toBe(2)
    expect(events[0].eventType).toBe('GradeOverrideCreated')
    expect(events[1].eventType).toBe('GradeOverrideRemoved')
  })
})
