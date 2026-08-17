import React from 'react'
import { GradeAggregate } from './GradeAggregate'
import type { GradeRecord, GradeOverride, OverrideReasonCode, EffectiveGradeView } from '../types'

export class GradeAggregateAdapter {
  private aggregateMap: Map<string, GradeAggregate> = new Map()

  /**
   * Instantiates or retrieves a GradeAggregate instance from a raw GradeRecord and its active overrides.
   */
  public getOrCreateAggregate(grade: GradeRecord, overrides: GradeOverride[] = []): GradeAggregate {
    const key = grade.id
    if (!this.aggregateMap.has(key)) {
      this.aggregateMap.set(key, new GradeAggregate(grade, overrides))
    }
    return this.aggregateMap.get(key)!
  }

  /**
   * Micro-Step A.2: Execute overrideScore via GradeAggregate domain invariant.
   */
  public overrideScore(
    grade: GradeRecord,
    overrides: GradeOverride[],
    scoreField: keyof Pick<GradeRecord, 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal' | 'scoreDaoDuc'>,
    manualValue: number,
    reasonCode: OverrideReasonCode = 'TeacherAdjustment',
    reasonNote?: string,
    userId: string = 'system'
  ): { override: GradeOverride; updatedGrade: GradeRecord } {
    const aggregate = new GradeAggregate(grade, overrides)
    const override = aggregate.override(scoreField, manualValue, reasonCode, reasonNote, userId)
    return {
      override,
      updatedGrade: aggregate.getGrade(),
    }
  }

  /**
   * Micro-Step A.4: Execute restoreScore via GradeAggregate domain invariant.
   */
  public restoreScore(
    grade: GradeRecord,
    overrides: GradeOverride[],
    scoreField: keyof Pick<GradeRecord, 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal' | 'scoreDaoDuc'>,
    userId: string = 'system'
  ): { restoredOverride: GradeOverride | null; updatedGrade: GradeRecord } {
    const aggregate = new GradeAggregate(grade, overrides)
    const restoredOverride = aggregate.restore(scoreField, userId)
    return {
      restoredOverride,
      updatedGrade: aggregate.getGrade(),
    }
  }

  /**
   * Micro-Step A.5: Compute Effective Grade View via GradeAggregate.
   */
  public getEffectiveView(
    grade: GradeRecord,
    overrides: GradeOverride[],
    scoreField: keyof Pick<GradeRecord, 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal' | 'scoreDaoDuc'>,
    autoCalculatedValue: number | null
  ): EffectiveGradeView {
    const aggregate = new GradeAggregate(grade, overrides)
    return aggregate.getEffectiveView(scoreField, autoCalculatedValue)
  }
}

export const gradeAggregateAdapter = new GradeAggregateAdapter()
