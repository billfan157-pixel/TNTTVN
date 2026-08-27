export type OmrBenchmarkOutcome = 'accepted' | 'review_required' | 'rejected'
export type OmrBenchmarkRunKind = 'cold' | 'warm'
export type OmrBenchmarkTemplateMode = 'integrated' | 'full_page'

export interface OmrBenchmarkExecutionProfile {
  workload: 'multiple_choice'
  engineVersion: string
  deviceProfile: string
  browser: string
  frameWidth: number
  frameHeight: number
  templateMode: OmrBenchmarkTemplateMode
  questionCount: number
  runKind: OmrBenchmarkRunKind
}

export interface OmrBenchmarkObservation {
  sampleId: string
  fileChecksum: string
  cohort: 'normal' | 'stress' | 'negative'
  expectedAnswers: Array<string | null>
  detectedAnswers: Array<string | null>
  expectedOutcome: OmrBenchmarkOutcome
  actualOutcome: OmrBenchmarkOutcome
  firstCaptureAccepted: boolean
  durationMs: number
  profile: OmrBenchmarkExecutionProfile
}

export interface OmrBenchmarkTimingProfile extends OmrBenchmarkExecutionProfile {
  key: string
  samples: number
  p95DurationMs: number
}

export type OmrBenchmarkAccuracyProfileIdentity = Omit<OmrBenchmarkExecutionProfile, 'runKind'>

export type OmrBenchmarkAccuracyProfile = OmrBenchmarkAccuracyProfileIdentity & {
  key: string
  samples: number
  answerSheetSamples: number
  answerCells: number
  reviewSamples: number
  acceptedSamples: number
  normalSamples: number
  stressSamples: number
  negativeSamples: number
  normalExactSheetAccuracy: number
  stressExactSheetAccuracy: number
  answerAccuracy: number
  firstCaptureRate: number
  falseAcceptCount: number
  reviewRoutingAccuracy: number
  negativeRoutingAccuracy: number
}

export interface OmrBenchmarkReport {
  inputSamples: number
  samples: number
  invalidSamples: number
  duplicateSamples: number
  answerSheetSamples: number
  answerCells: number
  reviewSamples: number
  acceptedSamples: number
  durationSamples: number
  normalSamples: number
  stressSamples: number
  negativeSamples: number
  exactSheetAccuracy: number
  normalExactSheetAccuracy: number
  stressExactSheetAccuracy: number
  answerAccuracy: number
  firstCaptureRate: number
  falseAcceptCount: number
  reviewRoutingAccuracy: number
  negativeRoutingAccuracy: number
  /** Worst per-profile p95. Durations from different profiles are never pooled. */
  p95DurationMs: number
  timingProfiles: OmrBenchmarkTimingProfile[]
  /** Accuracy/routing split by exact engine/device/browser/resolution/template/workload. */
  accuracyProfiles: OmrBenchmarkAccuracyProfile[]
}

const ANSWER_OPTIONS = new Set(['A', 'B', 'C', 'D'])
const COHORTS = new Set(['normal', 'stress', 'negative'])
const OUTCOMES = new Set<OmrBenchmarkOutcome>(['accepted', 'review_required', 'rejected'])
const RUN_KINDS = new Set<OmrBenchmarkRunKind>(['cold', 'warm'])
const TEMPLATE_MODES = new Set<OmrBenchmarkTemplateMode>(['integrated', 'full_page'])

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

function percentile95(sortedValues: number[]): number {
  const index = Math.max(0, Math.ceil(sortedValues.length * 0.95) - 1)
  return sortedValues[index] ?? 0
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasValidAnswers(value: unknown): value is Array<string | null> {
  return Array.isArray(value) && value.every(answer => answer === null || ANSWER_OPTIONS.has(answer))
}

function isValidProfile(value: unknown): value is OmrBenchmarkExecutionProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<OmrBenchmarkExecutionProfile>
  return profile.workload === 'multiple_choice'
    && isNonEmptyText(profile.engineVersion)
    && profile.engineVersion.startsWith('omr-v4-')
    && isNonEmptyText(profile.deviceProfile)
    && isNonEmptyText(profile.browser)
    && Number.isInteger(profile.frameWidth)
    && Number(profile.frameWidth) > 0
    && Number.isInteger(profile.frameHeight)
    && Number(profile.frameHeight) > 0
    && TEMPLATE_MODES.has(profile.templateMode as OmrBenchmarkTemplateMode)
    && Number.isInteger(profile.questionCount)
    && Number(profile.questionCount) >= 1
    && Number(profile.questionCount) <= 50
    && RUN_KINDS.has(profile.runKind as OmrBenchmarkRunKind)
}

function isValidObservation(observation: OmrBenchmarkObservation): boolean {
  if (!/^[a-f0-9]{64}$/i.test(observation.fileChecksum)) return false
  if (!COHORTS.has(observation.cohort)) return false
  if (!hasValidAnswers(observation.expectedAnswers) || !hasValidAnswers(observation.detectedAnswers)) return false
  if (!OUTCOMES.has(observation.expectedOutcome) || !OUTCOMES.has(observation.actualOutcome)) return false
  if (typeof observation.firstCaptureAccepted !== 'boolean') return false
  if (!Number.isFinite(observation.durationMs) || observation.durationMs < 0) return false
  if (!isValidProfile(observation.profile)) return false
  if (observation.cohort !== 'negative' && observation.expectedAnswers.length === 0) return false
  if (observation.cohort !== 'negative' && observation.expectedAnswers.length !== observation.profile.questionCount) return false
  if (observation.cohort === 'negative' && observation.expectedOutcome === 'accepted') return false
  if (observation.firstCaptureAccepted && observation.actualOutcome !== 'accepted') return false
  return true
}

export function getOmrBenchmarkTimingProfileKey(profile: OmrBenchmarkExecutionProfile): string {
  return JSON.stringify([
    profile.workload,
    profile.engineVersion.trim(),
    profile.deviceProfile.trim(),
    profile.browser.trim(),
    profile.frameWidth,
    profile.frameHeight,
    profile.templateMode,
    profile.questionCount,
    profile.runKind,
  ])
}

export function getOmrBenchmarkAccuracyProfileKey(profile: OmrBenchmarkAccuracyProfileIdentity): string {
  return JSON.stringify([
    profile.workload,
    profile.engineVersion.trim(),
    profile.deviceProfile.trim(),
    profile.browser.trim(),
    profile.frameWidth,
    profile.frameHeight,
    profile.templateMode,
    profile.questionCount,
  ])
}

interface OmrBenchmarkMetricAccumulator {
  samples: number
  exactSheets: number
  correctAnswers: number
  answerCells: number
  firstCaptures: number
  falseAcceptCount: number
  routedReviews: number
  reviewSamples: number
  acceptedSamples: number
  normalSamples: number
  stressSamples: number
  negativeSamples: number
  normalExactSheets: number
  stressExactSheets: number
  correctlyRoutedNegative: number
}

function createMetricAccumulator(): OmrBenchmarkMetricAccumulator {
  return {
    samples: 0,
    exactSheets: 0,
    correctAnswers: 0,
    answerCells: 0,
    firstCaptures: 0,
    falseAcceptCount: 0,
    routedReviews: 0,
    reviewSamples: 0,
    acceptedSamples: 0,
    normalSamples: 0,
    stressSamples: 0,
    negativeSamples: 0,
    normalExactSheets: 0,
    stressExactSheets: 0,
    correctlyRoutedNegative: 0,
  }
}

function accumulateMetrics(accumulator: OmrBenchmarkMetricAccumulator, observation: OmrBenchmarkObservation): void {
  accumulator.samples++
  // Accuracy đáp án chỉ có nghĩa cho phiếu normal/stress. Ảnh negative có
  // thể chứa mảng rỗng/null và không được làm đẹp sheet/cell KPI.
  const isAnswerSheet = observation.cohort !== 'negative'
  let sheetExact = false
  if (isAnswerSheet) {
    const maxLength = Math.max(observation.expectedAnswers.length, observation.detectedAnswers.length)
    sheetExact = observation.expectedAnswers.length === observation.detectedAnswers.length
    for (let index = 0; index < maxLength; index++) {
      const expected = observation.expectedAnswers[index]
      const detected = observation.detectedAnswers[index]
      if (expected === null || expected === undefined) {
        if (expected !== detected) sheetExact = false
        continue
      }
      if (expected === detected) accumulator.correctAnswers++
      else sheetExact = false
      accumulator.answerCells++
    }
    if (sheetExact) accumulator.exactSheets++
  }
  if (observation.cohort === 'normal') {
    accumulator.normalSamples++
    if (sheetExact) accumulator.normalExactSheets++
  } else if (observation.cohort === 'stress') {
    accumulator.stressSamples++
    if (sheetExact) accumulator.stressExactSheets++
  } else {
    accumulator.negativeSamples++
    if (observation.actualOutcome === observation.expectedOutcome) accumulator.correctlyRoutedNegative++
  }
  if (observation.expectedOutcome === 'accepted') {
    accumulator.acceptedSamples++
    if (observation.firstCaptureAccepted) accumulator.firstCaptures++
  }
  if (observation.actualOutcome === 'accepted' && observation.expectedOutcome !== 'accepted') accumulator.falseAcceptCount++
  if (observation.expectedOutcome === 'review_required') {
    accumulator.reviewSamples++
    if (observation.actualOutcome === 'review_required') accumulator.routedReviews++
  }
}

function summarizeMetrics(accumulator: OmrBenchmarkMetricAccumulator) {
  const answerSheetSamples = accumulator.normalSamples + accumulator.stressSamples
  return {
    answerSheetSamples,
    answerCells: accumulator.answerCells,
    reviewSamples: accumulator.reviewSamples,
    acceptedSamples: accumulator.acceptedSamples,
    normalSamples: accumulator.normalSamples,
    stressSamples: accumulator.stressSamples,
    negativeSamples: accumulator.negativeSamples,
    exactSheetAccuracy: ratio(accumulator.exactSheets, answerSheetSamples),
    normalExactSheetAccuracy: ratio(accumulator.normalExactSheets, accumulator.normalSamples),
    stressExactSheetAccuracy: ratio(accumulator.stressExactSheets, accumulator.stressSamples),
    answerAccuracy: ratio(accumulator.correctAnswers, accumulator.answerCells),
    firstCaptureRate: ratio(accumulator.firstCaptures, accumulator.acceptedSamples),
    falseAcceptCount: accumulator.falseAcceptCount,
    reviewRoutingAccuracy: ratio(accumulator.routedReviews, accumulator.reviewSamples),
    negativeRoutingAccuracy: ratio(accumulator.correctlyRoutedNegative, accumulator.negativeSamples),
  }
}

/**
 * Tính KPI từ corpus ảnh gán nhãn. Observation trùng/malformed bị loại khỏi mọi
 * mẫu số và được đếm fail-visible. Timing được nhóm theo đúng
 * device/browser/resolution/cold-warm; không bao giờ pool profile để làm đẹp p95.
 */
export function buildOmrBenchmarkReport(observations: OmrBenchmarkObservation[]): OmrBenchmarkReport {
  let invalidSamples = 0
  let duplicateSamples = 0
  const seenSampleIds = new Set<string>()
  const seenFileChecksums = new Set<string>()
  const validObservations: OmrBenchmarkObservation[] = []

  for (const observation of observations) {
    if (!isNonEmptyText(observation?.sampleId)) {
      invalidSamples++
      continue
    }
    const normalizedSampleId = observation.sampleId.trim()
    if (seenSampleIds.has(normalizedSampleId)) {
      duplicateSamples++
      continue
    }
    seenSampleIds.add(normalizedSampleId)
    if (!isValidObservation(observation)) {
      invalidSamples++
      continue
    }
    const normalizedChecksum = observation.fileChecksum.toLowerCase()
    if (seenFileChecksums.has(normalizedChecksum)) {
      duplicateSamples++
      continue
    }
    seenFileChecksums.add(normalizedChecksum)
    validObservations.push(observation)
  }

  const overallMetrics = createMetricAccumulator()
  const accuracyGroups = new Map<string, {
    profile: OmrBenchmarkAccuracyProfileIdentity
    metrics: OmrBenchmarkMetricAccumulator
  }>()
  for (const observation of validObservations) {
    accumulateMetrics(overallMetrics, observation)
    const profile: OmrBenchmarkAccuracyProfileIdentity = {
      workload: observation.profile.workload,
      engineVersion: observation.profile.engineVersion.trim(),
      deviceProfile: observation.profile.deviceProfile.trim(),
      browser: observation.profile.browser.trim(),
      frameWidth: observation.profile.frameWidth,
      frameHeight: observation.profile.frameHeight,
      templateMode: observation.profile.templateMode,
      questionCount: observation.profile.questionCount,
    }
    const key = getOmrBenchmarkAccuracyProfileKey(profile)
    const group = accuracyGroups.get(key) ?? { profile, metrics: createMetricAccumulator() }
    accumulateMetrics(group.metrics, observation)
    accuracyGroups.set(key, group)
  }

  const timingGroups = new Map<string, { profile: OmrBenchmarkExecutionProfile; durations: number[] }>()
  for (const observation of validObservations) {
    const key = getOmrBenchmarkTimingProfileKey(observation.profile)
    const existing = timingGroups.get(key)
    if (existing) existing.durations.push(observation.durationMs)
    else timingGroups.set(key, { profile: observation.profile, durations: [observation.durationMs] })
  }
  const timingProfiles = [...timingGroups.entries()]
    .map(([key, group]) => {
      const durations = [...group.durations].sort((left, right) => left - right)
      return {
        ...group.profile,
        engineVersion: group.profile.engineVersion.trim(),
        deviceProfile: group.profile.deviceProfile.trim(),
        browser: group.profile.browser.trim(),
        key,
        samples: durations.length,
        p95DurationMs: percentile95(durations),
      }
    })
    .sort((left, right) => left.key.localeCompare(right.key))

  const accuracyProfiles: OmrBenchmarkAccuracyProfile[] = [...accuracyGroups.entries()]
    .map(([key, group]) => ({
      ...group.profile,
      key,
      samples: group.metrics.samples,
      ...summarizeMetrics(group.metrics),
    }))
    .sort((left, right) => left.key.localeCompare(right.key))

  const summary = summarizeMetrics(overallMetrics)
  return {
    inputSamples: observations.length,
    samples: validObservations.length,
    invalidSamples,
    duplicateSamples,
    answerSheetSamples: summary.answerSheetSamples,
    answerCells: summary.answerCells,
    reviewSamples: summary.reviewSamples,
    acceptedSamples: summary.acceptedSamples,
    durationSamples: validObservations.length,
    normalSamples: summary.normalSamples,
    stressSamples: summary.stressSamples,
    negativeSamples: summary.negativeSamples,
    exactSheetAccuracy: summary.exactSheetAccuracy,
    normalExactSheetAccuracy: summary.normalExactSheetAccuracy,
    stressExactSheetAccuracy: summary.stressExactSheetAccuracy,
    answerAccuracy: summary.answerAccuracy,
    firstCaptureRate: summary.firstCaptureRate,
    falseAcceptCount: summary.falseAcceptCount,
    reviewRoutingAccuracy: summary.reviewRoutingAccuracy,
    negativeRoutingAccuracy: summary.negativeRoutingAccuracy,
    p95DurationMs: timingProfiles.reduce((worst, profile) => Math.max(worst, profile.p95DurationMs), 0),
    timingProfiles,
    accuracyProfiles,
  }
}
