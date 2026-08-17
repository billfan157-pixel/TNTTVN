import React from 'react'
import type { GradeRecord, GradeOverride, OverrideReasonCode, EffectiveGradeView } from '../types'

export interface DomainEventPayload {
  aggregateId: string
  eventType: string
  payload: Record<string, unknown>
  sequenceNumber: number
  createdAt: string
}

export class GradeAggregate {
  private grade: GradeRecord
  private overrides: Map<string, GradeOverride>
  private events: DomainEventPayload[] = []
  private sequenceCounter: number = 0

  constructor(grade: GradeRecord, overrides: GradeOverride[] = []) {
    this.grade = { ...grade }
    this.overrides = new Map()
    for (const ov of overrides) {
      if (!ov.deletedAt) {
        this.overrides.set(ov.scoreField, { ...ov })
      }
    }
  }

  public getGrade(): Readonly<GradeRecord> {
    return this.grade
  }

  public getActiveOverrides(): ReadonlyArray<GradeOverride> {
    return Array.from(this.overrides.values())
  }

  public getUncommittedEvents(): ReadonlyArray<DomainEventPayload> {
    return this.events
  }

  public clearUncommittedEvents(): void {
    this.events = []
  }

  /**
   * Domain Invariant: Perform a manual override on a score field.
   */
  public override(
    scoreField: keyof Pick<GradeRecord, 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal' | 'scoreDaoDuc'>,
    manualValue: number,
    reasonCode: OverrideReasonCode = 'TeacherAdjustment',
    reasonNote?: string,
    userId: string = 'system'
  ): GradeOverride {
    if (manualValue < 0 || manualValue > 10) {
      throw new Error(`Invalid manual score ${manualValue}. Must be between 0 and 10.`)
    }

    const now = new Date().toISOString()
    const existing = this.overrides.get(scoreField)

    const nextVersion = (existing?.version || 0) + 1
    const overrideRecord: GradeOverride = {
      id: existing?.id || `GROV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      gradeId: this.grade.id,
      scoreField: String(scoreField),
      manualValue,
      reasonCode,
      reasonNote: reasonNote || null,
      overriddenBy: userId,
      overriddenAt: now,
      version: nextVersion,
      deletedAt: null,
    }

    this.overrides.set(String(scoreField), overrideRecord)
    this.grade.version = (this.grade.version || 1) + 1
    this.grade.updatedAt = now
    this.grade.updatedBy = userId

    this.recordEvent('GradeOverrideCreated', {
      gradeId: this.grade.id,
      studentId: this.grade.studentId,
      scoreField,
      manualValue,
      reasonCode,
      version: nextVersion,
      userId,
    })

    return overrideRecord
  }

  /**
   * Domain Invariant: Restore a score field back to auto-calculated average.
   */
  public restore(
    scoreField: keyof Pick<GradeRecord, 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal' | 'scoreDaoDuc'>,
    userId: string = 'system'
  ): GradeOverride | null {
    const existing = this.overrides.get(String(scoreField))
    if (!existing) return null

    const now = new Date().toISOString()
    const restoredRecord: GradeOverride = {
      ...existing,
      deletedAt: now,
      version: existing.version + 1,
    }

    this.overrides.delete(String(scoreField))
    this.grade.version = (this.grade.version || 1) + 1
    this.grade.updatedAt = now
    this.grade.updatedBy = userId

    this.recordEvent('GradeOverrideRemoved', {
      gradeId: this.grade.id,
      studentId: this.grade.studentId,
      scoreField,
      previousManualValue: existing.manualValue,
      userId,
    })

    return restoredRecord
  }

  /**
   * Calculates the Effective Grade View for a given score field.
   */
  public getEffectiveView(
    scoreField: keyof Pick<GradeRecord, 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal' | 'scoreDaoDuc'>,
    autoCalculatedValue: number | null
  ): EffectiveGradeView {
    const activeOverride = this.overrides.get(String(scoreField))
    const rawVal = this.grade[scoreField] as number | null

    if (!activeOverride) {
      return {
        effectiveValue: autoCalculatedValue ?? rawVal ?? null,
        autoCalculatedValue: autoCalculatedValue ?? rawVal ?? null,
        manualValue: null,
        state: 'AUTO',
        badge: '📊 Tự động',
        tooltip: 'Điểm tự động tính từ danh sách bài kiểm tra hằng ngày',
      }
    }

    const hasNewerAuto = autoCalculatedValue !== null && Math.abs(autoCalculatedValue - activeOverride.manualValue) > 0.01

    if (hasNewerAuto) {
      return {
        effectiveValue: activeOverride.manualValue,
        autoCalculatedValue,
        manualValue: activeOverride.manualValue,
        state: 'AUTO_UPDATED_WHILE_OVERRIDDEN',
        override: activeOverride,
        badge: '🟣 Sửa tay (Có ĐTB mới)',
        tooltip: `ĐTB tự động mới: ${autoCalculatedValue} (Hiện dùng điểm sửa đè: ${activeOverride.manualValue})`,
      }
    }

    return {
      effectiveValue: activeOverride.manualValue,
      autoCalculatedValue,
      manualValue: activeOverride.manualValue,
      state: 'MANUAL_OVERRIDDEN',
      override: activeOverride,
      badge: '✏️ Sửa tay thủ công',
      tooltip: `Đã sửa thủ công bởi ${activeOverride.overriddenBy} (${activeOverride.reasonCode})`,
    }
  }

  private recordEvent(eventType: string, payload: Record<string, unknown>): void {
    this.sequenceCounter += 1
    this.events.push({
      aggregateId: this.grade.id,
      eventType,
      payload,
      sequenceNumber: this.sequenceCounter,
      createdAt: new Date().toISOString(),
    })
  }
}
