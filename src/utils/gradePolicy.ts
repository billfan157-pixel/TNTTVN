export interface GradePolicyInput {
  scoreOral: number | null
  score15m: number | null
  score1Period: number | null
  scoreMidterm: number | null
  scoreFinal: number | null
  scoreDaoDuc?: number | null
}

export interface GradeCalculationPolicy {
  requiredFields?: Array<'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal'>
  minTotalWeight?: number
}

export interface GradeWeightsConfig {
  weightOral: number
  weight15m: number
  weight1Period: number
  weightMidterm: number
  weightFinal: number
  xuatSacThreshold: number
  gioiThreshold: number
  khaThreshold: number
  trungBinhThreshold: number
  roundingDecimal: number
}

export interface GradeResult {
  score: number | null
  label: string
}

export interface GradePolicySnapshot {
  versionId: string
  effectiveAt: string
  weights: GradeWeightsConfig
  thresholds: Pick<
    GradeWeightsConfig,
    'xuatSacThreshold' | 'gioiThreshold' | 'khaThreshold' | 'trungBinhThreshold'
  >
}

export interface GradePolicyDiff {
  changed: boolean
  fields: string[]
  fieldCount: number
}

export interface GradePolicyDeltaSummary {
  changed: boolean
  diffFields: string[]
  gpaBefore: number | null
  gpaAfter: number | null
  labelBefore: string
  labelAfter: string
  note?: string
}

export interface GradePolicyAuditRecord {
  previousPolicyVersion: string
  currentPolicyVersion: string
  previousSnapshot: GradePolicySnapshot
  currentSnapshot: GradePolicySnapshot
  changedFields: string[]
  changed: boolean
  summary: GradePolicyDeltaSummary
  actor: string
  action: string
  reason: string
  recordedAt: string
}

export interface GradePolicyAuditInput {
  grade: GradePolicyInput
  previousPolicy: GradeWeightsConfig
  currentPolicy: GradeWeightsConfig
  previousVersionId: string
  currentVersionId: string
  actor?: string
  action?: string
  reason?: string
}

export const DEFAULT_GRADE_POLICY_WEIGHTS: GradeWeightsConfig = {
  weightOral: 1,
  weight15m: 1,
  weight1Period: 2,
  weightMidterm: 2,
  weightFinal: 3,
  xuatSacThreshold: 9.0,
  gioiThreshold: 8.0,
  khaThreshold: 6.5,
  trungBinhThreshold: 5.0,
  roundingDecimal: 1,
}

export function buildGradePolicySnapshot(
  weights: GradeWeightsConfig,
  versionId: string = `policy-${Date.now()}`
): GradePolicySnapshot {
  return {
    versionId,
    effectiveAt: new Date().toISOString(),
    weights: { ...weights },
    thresholds: {
      xuatSacThreshold: weights.xuatSacThreshold,
      gioiThreshold: weights.gioiThreshold,
      khaThreshold: weights.khaThreshold,
      trungBinhThreshold: weights.trungBinhThreshold,
    },
  }
}

export function diffGradePolicies(
  before: GradeWeightsConfig,
  after: GradeWeightsConfig
): GradePolicyDiff {
  const fields = (Object.keys(DEFAULT_GRADE_POLICY_WEIGHTS) as Array<keyof GradeWeightsConfig>).filter(
    (key) => before[key] !== after[key]
  )

  return {
    changed: fields.length > 0,
    fields: fields.map((field) => String(field)),
    fieldCount: fields.length,
  }
}

export function summarizeGradeDelta(
  grade: GradePolicyInput,
  before: GradeWeightsConfig,
  after: GradeWeightsConfig
): GradePolicyDeltaSummary {
  const engineBefore = new GradePolicyEngine(before)
  const engineAfter = new GradePolicyEngine(after)
  const beforeRes = engineBefore.calculateAverage(grade)
  const afterRes = engineAfter.calculateAverage(grade)
  const diff = diffGradePolicies(before, after)

  return {
    changed: diff.changed,
    diffFields: diff.fields,
    gpaBefore: beforeRes.score,
    gpaAfter: afterRes.score,
    labelBefore: beforeRes.label,
    labelAfter: afterRes.label,
    note: diff.changed ? 'Policy changed; GPA/labels should be recalculated for the affected semester.' : 'No policy change detected.',
  }
}

export function buildGradePolicyAuditRecord({
  grade,
  previousPolicy,
  currentPolicy,
  previousVersionId,
  currentVersionId,
  actor = 'system',
  action = 'policy_update',
  reason,
}: GradePolicyAuditInput): GradePolicyAuditRecord {
  const previousSnapshot = buildGradePolicySnapshot(previousPolicy, previousVersionId)
  const currentSnapshot = buildGradePolicySnapshot(currentPolicy, currentVersionId)
  const summary = summarizeGradeDelta(grade, previousPolicy, currentPolicy)
  const changedFields = diffGradePolicies(previousPolicy, currentPolicy).fields

  return {
    previousPolicyVersion: previousVersionId,
    currentPolicyVersion: currentVersionId,
    previousSnapshot,
    currentSnapshot,
    changedFields,
    changed: summary.changed,
    summary,
    actor,
    action,
    reason: reason ?? summary.note ?? 'Policy snapshot recorded.',
    recordedAt: new Date().toISOString(),
  }
}

export class GradePolicyEngine {
  private readonly config: GradeWeightsConfig

  constructor(config: GradeWeightsConfig = DEFAULT_GRADE_POLICY_WEIGHTS) {
    this.config = config
  }

  normalizeScore(value: number | null | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0
    return Math.min(10, Math.max(0, value))
  }

  getClassificationLabel(avg: number): string {
    const { xuatSacThreshold, gioiThreshold, khaThreshold, trungBinhThreshold } = this.config
    if (avg >= xuatSacThreshold) return 'Xuất Sắc'
    if (avg >= gioiThreshold) return 'Giỏi'
    if (avg >= khaThreshold) return 'Khá'
    if (avg >= trungBinhThreshold) return 'Trung Bình'
    return 'Yếu'
  }

  roundScore(value: number): number {
    const factor = Math.pow(10, this.config.roundingDecimal)
    return Math.round(value * factor) / factor
  }

  calculateAverage(
    grade: GradePolicyInput | null | undefined,
    policy: GradeCalculationPolicy = {}
  ): GradeResult {
    if (!grade) return { score: null, label: 'Chưa có điểm' }

    const { scoreOral, score15m, score1Period, scoreMidterm, scoreFinal } = grade

    if (policy.requiredFields && policy.requiredFields.length > 0) {
      const missingRequired = policy.requiredFields.some(
        (field) => grade[field] === null || grade[field] === undefined
      )
      if (missingRequired) {
        return { score: null, label: 'Chưa đủ bài' }
      }
    }

    let totalPoints = 0
    let totalWeights = 0

    const addField = (value: number | null | undefined, weight: number) => {
      if (value === null || value === undefined) return
      totalPoints += this.normalizeScore(value) * weight
      totalWeights += weight
    }

    addField(scoreOral, this.config.weightOral)
    addField(score15m, this.config.weight15m)
    addField(score1Period, this.config.weight1Period)
    addField(scoreMidterm, this.config.weightMidterm)
    addField(scoreFinal, this.config.weightFinal)

    if (totalWeights === 0) return { score: null, label: 'Chưa nhập' }

    const average = this.roundScore(totalPoints / totalWeights)
    return { score: average, label: this.getClassificationLabel(average) }
  }
}
