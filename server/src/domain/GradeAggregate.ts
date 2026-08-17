export type ScoreField = 'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal' | 'scoreDaoDuc'

export interface GradeRecordDTO {
  id: string
  studentId: string
  academicYear: string
  semester: number
  scoreOral?: number | null
  score15m?: number | null
  score1Period?: number | null
  scoreMidterm?: number | null
  scoreFinal?: number | null
  scoreDaoDuc?: number | null
  comments?: string | null
  version: number
  parishId: string
  createdAt?: string
  updatedAt?: string
  updatedBy?: string | null
}

export interface GradeOverrideDTO {
  id: string
  gradeId: string
  scoreField: ScoreField
  manualValue: number
  reasonCode: string
  reasonNote?: string | null
  overriddenBy: string
  overriddenAt: string
  version: number
  deletedAt?: string | null
  createdAt?: string
  updatedAt?: string
  policyVersionId?: string | null
}

export interface DomainEvent {
  aggregateId: string
  eventType: string
  payload: Record<string, unknown>
  sequenceNumber: number
  createdAt: string
}

export class GradeAggregate {
  private grade: GradeRecordDTO
  private overrides: Map<string, GradeOverrideDTO>
  private uncommittedEvents: DomainEvent[] = []

  constructor(grade: GradeRecordDTO, overrides: GradeOverrideDTO[] = []) {
    this.grade = { ...grade }
    this.overrides = new Map()
    for (const ov of overrides) {
      if (!ov.deletedAt) {
        this.overrides.set(ov.scoreField, { ...ov })
      }
    }
  }

  public getGrade(): Readonly<GradeRecordDTO> {
    return this.grade
  }

  public getActiveOverrides(): ReadonlyArray<GradeOverrideDTO> {
    return Array.from(this.overrides.values())
  }

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return this.uncommittedEvents
  }

  public clearUncommittedEvents(): void {
    this.uncommittedEvents = []
  }

  /**
   * Domain Invariant: Perform manual score override.
   * policyVersionId tracks which policy version was active when the override was made.
   */
  public override(
    scoreField: ScoreField,
    manualValue: number,
    reasonCode: string = 'TeacherAdjustment',
    reasonNote?: string | null,
    userId: string = 'system',
    policyVersionId?: string | null
  ): GradeOverrideDTO {
    if (manualValue < 0 || manualValue > 10) {
      throw new Error(`Invalid manual score ${manualValue}. Must be between 0 and 10.`)
    }

    const now = new Date().toISOString()
    const existing = this.overrides.get(scoreField)
    const nextOverrideVersion = (existing?.version || 0) + 1

    const overridePayload: GradeOverrideDTO = {
      id: existing?.id || `GROV-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      gradeId: this.grade.id,
      scoreField,
      manualValue,
      reasonCode,
      reasonNote: reasonNote || null,
      overriddenBy: userId,
      overriddenAt: now,
      version: nextOverrideVersion,
      deletedAt: null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      policyVersionId: policyVersionId || null,
    }

    this.overrides.set(scoreField, overridePayload)
    this.grade.version = (this.grade.version || 1) + 1
    this.grade.updatedAt = now
    this.grade.updatedBy = userId

    this.uncommittedEvents.push({
      aggregateId: this.grade.id,
      eventType: 'GradeOverrideCreated',
      payload: overridePayload as unknown as Record<string, unknown>,
      sequenceNumber: this.grade.version,
      createdAt: now,
    })

    return overridePayload
  }

  /**
   * Domain Invariant: Restore score field to its underlying raw value.
   * (Auto-calculated average or raw manual input via upsertGrade).
   * policyVersionId tracks which policy was active at restoration time.
   */
  public restore(scoreField: ScoreField, userId: string = 'system', policyVersionId?: string | null): GradeOverrideDTO | null {
    const existing = this.overrides.get(scoreField)
    if (!existing) return null

    const now = new Date().toISOString()
    const restoredRecord: GradeOverrideDTO = {
      ...existing,
      deletedAt: now,
      version: existing.version + 1,
      updatedAt: now,
      policyVersionId: policyVersionId || existing.policyVersionId || null,
    }

    this.overrides.delete(scoreField)
    this.grade.version = (this.grade.version || 1) + 1
    this.grade.updatedAt = now
    this.grade.updatedBy = userId

    this.uncommittedEvents.push({
      aggregateId: this.grade.id,
      eventType: 'GradeOverrideRemoved',
      payload: restoredRecord as unknown as Record<string, unknown>,
      sequenceNumber: this.grade.version,
      createdAt: now,
    })

    return restoredRecord
  }
}

/**
 * G-02: SSOT Helper to apply active overrides onto raw grade fields,
 * producing the "effective grade" used in GPA, Report Cards, and Promotion.
 */
export function applyOverridesToGrade<T extends Partial<GradeRecordDTO>>(
  rawGrade: T,
  activeOverrides: GradeOverrideDTO[]
): T {
  const effectiveGrade = { ...rawGrade }
  for (const ov of activeOverrides) {
    if (!ov.deletedAt && ov.gradeId === rawGrade.id) {
      ;(effectiveGrade as any)[ov.scoreField] = ov.manualValue
    }
  }
  return effectiveGrade
}
