import { describe, it, expect } from 'vitest'
import { gradeAggregateAdapter } from '../domain/GradeAggregateAdapter'
import type { GradeRecord, GradeOverride } from '../types'

describe('GradeAggregateAdapter Unit Tests (Pilot A.1 & A.2)', () => {
  const mockGrade: GradeRecord = {
    id: 'GR-100',
    studentId: 'ST-100',
    academicYear: '2025-2026',
    semester: 1,
    scoreOral: 8,
    scoreOral_source: null,
    scoreOral_updated_at: null,
    score15m: 8,
    score15m_source: null,
    score15m_updated_at: null,
    score1Period: 8,
    score1Period_source: null,
    score1Period_updated_at: null,
    scoreMidterm: 8,
    scoreMidterm_source: null,
    scoreMidterm_updated_at: null,
    scoreFinal: 8,
    scoreFinal_source: null,
    scoreFinal_updated_at: null,
    scoreDaoDuc: null,
    version: 1,
    updatedAt: '2026-01-01T00:00:00Z',
  }

  it('overrideScore creates valid override and increments grade version', () => {
    const { override, updatedGrade } = gradeAggregateAdapter.overrideScore(
      mockGrade,
      [],
      'scoreFinal',
      9.5,
      'Appeal',
      'Phúc khảo',
      'USR-01'
    )

    expect(override.manualValue).toBe(9.5)
    expect(override.reasonCode).toBe('Appeal')
    expect(updatedGrade.version).toBe(2)
  })

  it('restoreScore deletes active override', () => {
    const activeOverride: GradeOverride = {
      id: 'GROV-1',
      gradeId: 'GR-100',
      scoreField: 'scoreFinal',
      manualValue: 9.5,
      reasonCode: 'Appeal',
      overriddenBy: 'USR-01',
      overriddenAt: '2026-01-01T00:00:00Z',
      version: 1,
      deletedAt: null,
    }

    const { restoredOverride, updatedGrade } = gradeAggregateAdapter.restoreScore(
      mockGrade,
      [activeOverride],
      'scoreFinal',
      'USR-01'
    )

    expect(restoredOverride).not.toBeNull()
    expect(restoredOverride?.deletedAt).not.toBeNull()
    expect(updatedGrade.version).toBe(2)
  })

  it('getEffectiveView returns MANUAL_OVERRIDDEN when override matches autoCalculatedValue', () => {
    const activeOverride: GradeOverride = {
      id: 'GROV-1',
      gradeId: 'GR-100',
      scoreField: 'scoreFinal',
      manualValue: 9.5,
      reasonCode: 'Appeal',
      overriddenBy: 'USR-01',
      overriddenAt: '2026-01-01T00:00:00Z',
      version: 1,
      deletedAt: null,
    }

    const view = gradeAggregateAdapter.getEffectiveView(mockGrade, [activeOverride], 'scoreFinal', 9.5)
    expect(view.state).toBe('MANUAL_OVERRIDDEN')
    expect(view.effectiveValue).toBe(9.5)
  })

  it('getEffectiveView returns AUTO_UPDATED_WHILE_OVERRIDDEN when autoCalculatedValue differs from override', () => {
    const activeOverride: GradeOverride = {
      id: 'GROV-1',
      gradeId: 'GR-100',
      scoreField: 'scoreFinal',
      manualValue: 9.5,
      reasonCode: 'Appeal',
      overriddenBy: 'USR-01',
      overriddenAt: '2026-01-01T00:00:00Z',
      version: 1,
      deletedAt: null,
    }

    const view = gradeAggregateAdapter.getEffectiveView(mockGrade, [activeOverride], 'scoreFinal', 8.0)
    expect(view.state).toBe('AUTO_UPDATED_WHILE_OVERRIDDEN')
    expect(view.effectiveValue).toBe(9.5)
  })

  it('rejects invalid scores (-2 or 11) and preserves state (Validation Rollback Safety)', () => {
    expect(() => {
      gradeAggregateAdapter.overrideScore(mockGrade, [], 'scoreFinal', 11, 'TeacherAdjustment')
    }).toThrow(/Invalid manual score/)

    expect(() => {
      gradeAggregateAdapter.overrideScore(mockGrade, [], 'scoreFinal', -2, 'TeacherAdjustment')
    }).toThrow(/Invalid manual score/)

    // State remains pristine
    expect(mockGrade.version).toBe(1)
  })

  it('handles idempotency gracefully when overriding repeatedly', () => {
    const res1 = gradeAggregateAdapter.overrideScore(mockGrade, [], 'scoreFinal', 8.5, 'TeacherAdjustment')
    const res2 = gradeAggregateAdapter.overrideScore(res1.updatedGrade, [res1.override], 'scoreFinal', 8.5, 'TeacherAdjustment')

    expect(res2.override.manualValue).toBe(8.5)
    expect(res2.override.version).toBe(2)
  })

  it('restoreScore returns null when no active override exists for scoreField', () => {
    const { restoredOverride } = gradeAggregateAdapter.restoreScore(mockGrade, [], 'scoreFinal', 'USR-01')
    expect(restoredOverride).toBeNull()
  })

  it('restoreScore is idempotent when called repeatedly on restored override', () => {
    const activeOverride: GradeOverride = {
      id: 'GROV-1',
      gradeId: 'GR-100',
      scoreField: 'scoreFinal',
      manualValue: 9.5,
      reasonCode: 'Appeal',
      overriddenBy: 'USR-01',
      overriddenAt: '2026-01-01T00:00:00Z',
      version: 1,
      deletedAt: null,
    }

    // First restore succeeds
    const res1 = gradeAggregateAdapter.restoreScore(mockGrade, [activeOverride], 'scoreFinal', 'USR-01')
    expect(res1.restoredOverride).not.toBeNull()

    // Second restore on empty active overrides array returns null (idempotent)
    const res2 = gradeAggregateAdapter.restoreScore(res1.updatedGrade, [], 'scoreFinal', 'USR-01')
    expect(res2.restoredOverride).toBeNull()
  })
})
