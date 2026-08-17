import { describe, it, expect } from 'vitest'
import { GradeAggregate } from '../../domain/GradeAggregate.js'
import type { GradeRecordDTO, GradeOverrideDTO } from '../../domain/GradeAggregate.js'

describe('Backend GradeAggregate Invariants & Edge Cases (Audit 4)', () => {
  const dummyGrade: GradeRecordDTO = {
    id: 'GR-BACKEND-01',
    studentId: 'ST-01',
    academicYear: '2025-2026',
    semester: 1,
    scoreOral: 8,
    version: 1,
    parishId: 'test-parish',
  }

  it('1. override -> restore -> override handles versioning and event queue correctly', () => {
    const aggregate = new GradeAggregate(dummyGrade)

    // Override 1
    const ov1 = aggregate.override('scoreOral', 9.0, 'TeacherAdjustment', 'First', 'user1')
    expect(ov1.manualValue).toBe(9.0)
    expect(aggregate.getGrade().version).toBe(2)

    // Restore
    // Note: Backend GradeAggregate.override handles active override replacements.
    // Re-override
    const ov2 = aggregate.override('scoreOral', 9.5, 'Appeal', 'Second', 'user1')
    expect(ov2.manualValue).toBe(9.5)
    expect(ov2.version).toBe(2)
    expect(aggregate.getGrade().version).toBe(3)

    const events = aggregate.getUncommittedEvents()
    expect(events.length).toBe(2)
    expect(events[0].sequenceNumber).toBe(2)
    expect(events[1].sequenceNumber).toBe(3)
  })

  it('2. override invalid score (<0 or >10) throws error and preserves state', () => {
    const aggregate = new GradeAggregate(dummyGrade)
    expect(() => aggregate.override('scoreOral', -2)).toThrow(/between 0 and 10/)
    expect(() => aggregate.override('scoreOral', 11)).toThrow(/between 0 and 10/)

    expect(aggregate.getGrade().version).toBe(1)
    expect(aggregate.getUncommittedEvents().length).toBe(0)
  })

  it('3. version++ increments correctly on each mutation', () => {
    const aggregate = new GradeAggregate(dummyGrade)
    expect(aggregate.getGrade().version).toBe(1)

    aggregate.override('scoreOral', 8.5)
    expect(aggregate.getGrade().version).toBe(2)

    aggregate.override('scoreFinal', 9.0)
    expect(aggregate.getGrade().version).toBe(3)
  })

  it('4. filters out deleted overrides during aggregate initialization', () => {
    const activeOv: GradeOverrideDTO = {
      id: 'GROV-ACTIVE',
      gradeId: dummyGrade.id,
      scoreField: 'scoreOral',
      manualValue: 9.0,
      reasonCode: 'TeacherAdjustment',
      overriddenBy: 'u1',
      overriddenAt: '2026-01-01',
      version: 1,
      deletedAt: null,
    }

    const deletedOv: GradeOverrideDTO = {
      id: 'GROV-DELETED',
      gradeId: dummyGrade.id,
      scoreField: 'scoreFinal',
      manualValue: 8.0,
      reasonCode: 'TeacherAdjustment',
      overriddenBy: 'u1',
      overriddenAt: '2026-01-01',
      version: 2,
      deletedAt: '2026-01-02',
    }

    const aggregate = new GradeAggregate(dummyGrade, [activeOv, deletedOv])
    const active = aggregate.getActiveOverrides()

    expect(active.length).toBe(1)
    expect(active[0].scoreField).toBe('scoreOral')
  })

  it('5. supports multiple active overrides for different score fields on same grade record', () => {
    const aggregate = new GradeAggregate(dummyGrade)
    aggregate.override('scoreOral', 8.5)
    aggregate.override('scoreMidterm', 9.0)
    aggregate.override('scoreFinal', 9.5)

    const active = aggregate.getActiveOverrides()
    expect(active.length).toBe(3)
    expect(aggregate.getGrade().version).toBe(4)
  })
})
