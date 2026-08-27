import {
  getOmrBenchmarkAccuracyProfileKey,
  getOmrBenchmarkTimingProfileKey,
  type OmrBenchmarkAccuracyProfileIdentity,
  type OmrBenchmarkExecutionProfile,
  type OmrBenchmarkReport,
} from './omrBenchmark'

export interface OmrBenchmarkTargets {
  minSamples: number
  minNormalSamples: number
  minStressSamples: number
  minNegativeSamples: number
  minTimingSamplesPerProfile: number
  minAccuracySamplesPerProfile: number
  minNormalSamplesPerAccuracyProfile: number
  minStressSamplesPerAccuracyProfile: number
  minNegativeSamplesPerAccuracyProfile: number
  minReviewSamplesPerAccuracyProfile: number
  minAcceptedSamplesPerAccuracyProfile: number
  minNormalExactSheetAccuracy: number
  minStressExactSheetAccuracy: number
  minAnswerAccuracy: number
  minFirstCaptureRate: number
  maxFalseAcceptCount: number
  minReviewRoutingAccuracy: number
  minNegativeRoutingAccuracy: number
  maxP95DurationMs: number
  /** Exact release matrix. Empty means the gate is intentionally fail-closed. */
  requiredTimingProfiles: OmrBenchmarkExecutionProfile[]
  /** Same matrix without cold/warm, because accuracy combines both run kinds. */
  requiredAccuracyProfiles: OmrBenchmarkAccuracyProfileIdentity[]
}

/**
 * Release targets are policy, not claims about current production accuracy.
 * They only become meaningful once a de-identified real-camera corpus is present.
 */
export const DEFAULT_OMR_BENCHMARK_TARGETS: OmrBenchmarkTargets = {
  minSamples: 400,
  minNormalSamples: 200,
  minStressSamples: 100,
  minNegativeSamples: 100,
  minTimingSamplesPerProfile: 20,
  minAccuracySamplesPerProfile: 40,
  minNormalSamplesPerAccuracyProfile: 20,
  minStressSamplesPerAccuracyProfile: 10,
  minNegativeSamplesPerAccuracyProfile: 10,
  minReviewSamplesPerAccuracyProfile: 10,
  minAcceptedSamplesPerAccuracyProfile: 20,
  minNormalExactSheetAccuracy: 0.995,
  minStressExactSheetAccuracy: 0.98,
  minAnswerAccuracy: 0.995,
  minFirstCaptureRate: 0.95,
  maxFalseAcceptCount: 0,
  minReviewRoutingAccuracy: 1,
  minNegativeRoutingAccuracy: 1,
  maxP95DurationMs: 150,
  // Operations must bind the exact engine/device/browser/resolution/template
  // matrix for a release. An empty default can never silently certify desktop
  // or one template as representative of production devices.
  requiredTimingProfiles: [],
  requiredAccuracyProfiles: [],
}

export interface OmrBenchmarkGateResult {
  passed: boolean
  reasons: string[]
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function isFiniteRatio(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function isValidRequiredAccuracyProfile(profile: OmrBenchmarkAccuracyProfileIdentity): boolean {
  return profile?.workload === 'multiple_choice'
    && typeof profile.engineVersion === 'string'
    && profile.engineVersion.startsWith('omr-v4-')
    && typeof profile.deviceProfile === 'string'
    && profile.deviceProfile.trim().length > 0
    && typeof profile.browser === 'string'
    && profile.browser.trim().length > 0
    && Number.isInteger(profile.frameWidth)
    && profile.frameWidth > 0
    && Number.isInteger(profile.frameHeight)
    && profile.frameHeight > 0
    && (profile.templateMode === 'integrated' || profile.templateMode === 'full_page')
    && Number.isInteger(profile.questionCount)
    && profile.questionCount >= 1
    && profile.questionCount <= 50
}

function isValidRequiredTimingProfile(profile: OmrBenchmarkExecutionProfile): boolean {
  return isValidRequiredAccuracyProfile(profile) && (profile.runKind === 'cold' || profile.runKind === 'warm')
}

function timingToAccuracyProfile(profile: OmrBenchmarkExecutionProfile): OmrBenchmarkAccuracyProfileIdentity {
  return {
    workload: profile.workload,
    engineVersion: profile.engineVersion,
    deviceProfile: profile.deviceProfile,
    browser: profile.browser,
    frameWidth: profile.frameWidth,
    frameHeight: profile.frameHeight,
    templateMode: profile.templateMode,
    questionCount: profile.questionCount,
  }
}

export function evaluateOmrBenchmarkGate(
  report: OmrBenchmarkReport,
  targets: OmrBenchmarkTargets = DEFAULT_OMR_BENCHMARK_TARGETS,
): OmrBenchmarkGateResult {
  const reasons: string[] = []
  const targetCounts = [
    targets.minSamples,
    targets.minNormalSamples,
    targets.minStressSamples,
    targets.minNegativeSamples,
    targets.minTimingSamplesPerProfile,
    targets.minAccuracySamplesPerProfile,
    targets.minNormalSamplesPerAccuracyProfile,
    targets.minStressSamplesPerAccuracyProfile,
    targets.minNegativeSamplesPerAccuracyProfile,
    targets.minReviewSamplesPerAccuracyProfile,
    targets.minAcceptedSamplesPerAccuracyProfile,
    targets.maxFalseAcceptCount,
  ]
  const targetRatios = [
    targets.minNormalExactSheetAccuracy,
    targets.minStressExactSheetAccuracy,
    targets.minAnswerAccuracy,
    targets.minFirstCaptureRate,
    targets.minReviewRoutingAccuracy,
    targets.minNegativeRoutingAccuracy,
  ]
  if (targetCounts.some(value => !Number.isInteger(value) || value < 0)
    || targetRatios.some(value => !isFiniteRatio(value))
    || !isFiniteNonNegative(targets.maxP95DurationMs)
    || targets.minSamples < targets.minNormalSamples + targets.minStressSamples + targets.minNegativeSamples
    || targets.minAccuracySamplesPerProfile < targets.minNormalSamplesPerAccuracyProfile
      + targets.minStressSamplesPerAccuracyProfile
      + targets.minNegativeSamplesPerAccuracyProfile
    || targets.minReviewSamplesPerAccuracyProfile > targets.minAccuracySamplesPerProfile
    || targets.minAcceptedSamplesPerAccuracyProfile > targets.minAccuracySamplesPerProfile) {
    reasons.push('targets_invalid')
  }
  const counts = [
    report.inputSamples,
    report.samples,
    report.invalidSamples,
    report.duplicateSamples,
    report.answerSheetSamples,
    report.answerCells,
    report.reviewSamples,
    report.acceptedSamples,
    report.durationSamples,
    report.normalSamples,
    report.stressSamples,
    report.negativeSamples,
    report.falseAcceptCount,
  ]
  const ratios = [
    report.exactSheetAccuracy,
    report.normalExactSheetAccuracy,
    report.stressExactSheetAccuracy,
    report.answerAccuracy,
    report.firstCaptureRate,
    report.reviewRoutingAccuracy,
    report.negativeRoutingAccuracy,
  ]
  if (counts.some(value => !Number.isInteger(value) || value < 0) || ratios.some(value => !isFiniteRatio(value))) {
    reasons.push('report_metrics_invalid')
  }
  if (!isFiniteNonNegative(report.p95DurationMs)) reasons.push('report_timing_invalid')
  if (report.inputSamples !== report.samples + report.invalidSamples + report.duplicateSamples) reasons.push('sample_accounting_mismatch')
  if (report.normalSamples + report.stressSamples + report.negativeSamples !== report.samples) reasons.push('cohort_accounting_mismatch')
  if (report.answerSheetSamples !== report.normalSamples + report.stressSamples) reasons.push('answer_sheet_accounting_mismatch')
  if (report.answerCells < report.answerSheetSamples) reasons.push('answer_cells_missing')
  if (report.reviewSamples > report.samples || report.acceptedSamples > report.samples || report.durationSamples > report.samples || report.falseAcceptCount > report.samples) {
    reasons.push('report_count_bounds_invalid')
  }
  if (report.invalidSamples > 0) reasons.push('invalid_samples_present')
  if (report.duplicateSamples > 0) reasons.push('duplicate_samples_present')
  if (report.samples < targets.minSamples) reasons.push(`samples ${report.samples} < ${targets.minSamples}`)
  if (report.normalSamples < targets.minNormalSamples) reasons.push(`normal_samples ${report.normalSamples} < ${targets.minNormalSamples}`)
  if (report.stressSamples < targets.minStressSamples) reasons.push(`stress_samples ${report.stressSamples} < ${targets.minStressSamples}`)
  if (report.negativeSamples < targets.minNegativeSamples) reasons.push(`negative_samples ${report.negativeSamples} < ${targets.minNegativeSamples}`)
  if (report.durationSamples !== report.samples) reasons.push('duration_samples_incomplete')
  if (report.reviewSamples < 1) reasons.push('review_samples_missing')

  if (!Array.isArray(targets.requiredTimingProfiles) || targets.requiredTimingProfiles.length === 0) {
    reasons.push('required_timing_profiles_not_configured')
  }
  if (!Array.isArray(targets.requiredAccuracyProfiles) || targets.requiredAccuracyProfiles.length === 0) {
    reasons.push('required_accuracy_profiles_not_configured')
  }
  if (Array.isArray(targets.requiredTimingProfiles)
    && targets.requiredTimingProfiles.length > 0
    && Array.isArray(targets.requiredAccuracyProfiles)
    && targets.requiredAccuracyProfiles.length > 0) {
    const requiredAccuracyKeys = new Set(
      targets.requiredAccuracyProfiles
        .filter(isValidRequiredAccuracyProfile)
        .map(getOmrBenchmarkAccuracyProfileKey),
    )
    const timingRunKindsByAccuracyKey = new Map<string, Set<'cold' | 'warm'>>()
    for (const timingProfile of targets.requiredTimingProfiles.filter(isValidRequiredTimingProfile)) {
      const accuracyKey = getOmrBenchmarkAccuracyProfileKey(timingToAccuracyProfile(timingProfile))
      const runKinds = timingRunKindsByAccuracyKey.get(accuracyKey) ?? new Set<'cold' | 'warm'>()
      runKinds.add(timingProfile.runKind)
      timingRunKindsByAccuracyKey.set(accuracyKey, runKinds)
      if (!requiredAccuracyKeys.has(accuracyKey)) reasons.push(`required_profile_matrix_mismatch: ${accuracyKey}`)
    }
    for (const accuracyKey of requiredAccuracyKeys) {
      const runKinds = timingRunKindsByAccuracyKey.get(accuracyKey)
      if (!runKinds) reasons.push(`required_profile_matrix_mismatch: ${accuracyKey}`)
      else if (!runKinds.has('cold') || !runKinds.has('warm')) {
        reasons.push(`required_timing_run_kinds_incomplete: ${accuracyKey}`)
      }
    }
  }

  if (!Array.isArray(report.timingProfiles) || report.timingProfiles.length === 0) {
    reasons.push('timing_profiles_missing')
  } else {
    let timingSamples = 0
    let worstProfileP95 = 0
    const profileKeys = new Set<string>()
    for (const profile of report.timingProfiles) {
      const profileValid = typeof profile.key === 'string'
        && profile.key.length > 0
        && profile.workload === 'multiple_choice'
        && typeof profile.engineVersion === 'string'
        && profile.engineVersion.startsWith('omr-v4-')
        && typeof profile.deviceProfile === 'string'
        && profile.deviceProfile.trim().length > 0
        && typeof profile.browser === 'string'
        && profile.browser.trim().length > 0
        && Number.isInteger(profile.frameWidth)
        && profile.frameWidth > 0
        && Number.isInteger(profile.frameHeight)
        && profile.frameHeight > 0
        && (profile.templateMode === 'integrated' || profile.templateMode === 'full_page')
        && Number.isInteger(profile.questionCount)
        && profile.questionCount >= 1
        && profile.questionCount <= 50
        && (profile.runKind === 'cold' || profile.runKind === 'warm')
        && Number.isInteger(profile.samples)
        && profile.samples >= 0
        && isFiniteNonNegative(profile.p95DurationMs)
      if (!profileValid) {
        reasons.push('timing_profile_invalid')
        continue
      }
      if (profile.key !== getOmrBenchmarkTimingProfileKey(profile)) reasons.push('timing_profile_key_mismatch')
      if (profileKeys.has(profile.key)) reasons.push('timing_profile_duplicate')
      profileKeys.add(profile.key)
      timingSamples += profile.samples
      worstProfileP95 = Math.max(worstProfileP95, profile.p95DurationMs)
      if (profile.samples < targets.minTimingSamplesPerProfile) {
        reasons.push(`timing_profile_samples ${profile.samples} < ${targets.minTimingSamplesPerProfile}: ${profile.key}`)
      }
      if (profile.p95DurationMs > targets.maxP95DurationMs) reasons.push(`p95_duration_above_target: ${profile.key}`)
    }
    if (timingSamples !== report.durationSamples) reasons.push('timing_profile_samples_mismatch')
    if (Number.isFinite(report.p95DurationMs) && report.p95DurationMs !== worstProfileP95) reasons.push('timing_summary_mismatch')

    if (Array.isArray(targets.requiredTimingProfiles)) {
      const requiredKeys = new Set<string>()
      for (const requiredProfile of targets.requiredTimingProfiles) {
        if (!isValidRequiredTimingProfile(requiredProfile)) {
          reasons.push('required_timing_profile_invalid')
          continue
        }
        const requiredKey = getOmrBenchmarkTimingProfileKey(requiredProfile)
        if (requiredKeys.has(requiredKey)) reasons.push('required_timing_profile_duplicate')
        requiredKeys.add(requiredKey)
        if (!profileKeys.has(requiredKey)) reasons.push(`required_timing_profile_missing: ${requiredKey}`)
      }
    }
  }

  if (!Array.isArray(report.accuracyProfiles) || report.accuracyProfiles.length === 0) {
    reasons.push('accuracy_profiles_missing')
  } else {
    let accuracySamples = 0
    let accuracyAnswerSheetSamples = 0
    let accuracyAnswerCells = 0
    let accuracyReviewSamples = 0
    let accuracyAcceptedSamples = 0
    let accuracyNormalSamples = 0
    let accuracyStressSamples = 0
    let accuracyNegativeSamples = 0
    let accuracyFalseAccepts = 0
    let profileNormalExact = 0
    let profileStressExact = 0
    let profileCorrectAnswers = 0
    let profileFirstCaptures = 0
    let profileRoutedReviews = 0
    let profileRoutedNegatives = 0
    const accuracyKeys = new Set<string>()
    for (const profile of report.accuracyProfiles) {
      const countsForProfile = [
        profile.samples,
        profile.answerSheetSamples,
        profile.answerCells,
        profile.reviewSamples,
        profile.acceptedSamples,
        profile.normalSamples,
        profile.stressSamples,
        profile.negativeSamples,
        profile.falseAcceptCount,
      ]
      const ratiosForProfile = [
        profile.normalExactSheetAccuracy,
        profile.stressExactSheetAccuracy,
        profile.answerAccuracy,
        profile.firstCaptureRate,
        profile.reviewRoutingAccuracy,
        profile.negativeRoutingAccuracy,
      ]
      const profileValid = typeof profile.key === 'string'
        && profile.key.length > 0
        && profile.workload === 'multiple_choice'
        && typeof profile.engineVersion === 'string'
        && profile.engineVersion.startsWith('omr-v4-')
        && typeof profile.deviceProfile === 'string'
        && profile.deviceProfile.trim().length > 0
        && typeof profile.browser === 'string'
        && profile.browser.trim().length > 0
        && Number.isInteger(profile.frameWidth)
        && profile.frameWidth > 0
        && Number.isInteger(profile.frameHeight)
        && profile.frameHeight > 0
        && (profile.templateMode === 'integrated' || profile.templateMode === 'full_page')
        && Number.isInteger(profile.questionCount)
        && profile.questionCount >= 1
        && profile.questionCount <= 50
        && countsForProfile.every(value => Number.isInteger(value) && value >= 0)
        && ratiosForProfile.every(value => isFiniteRatio(value))
      if (!profileValid) {
        reasons.push('accuracy_profile_invalid')
        continue
      }
      if (profile.key !== getOmrBenchmarkAccuracyProfileKey(profile)) reasons.push('accuracy_profile_key_mismatch')
      if (accuracyKeys.has(profile.key)) reasons.push('accuracy_profile_duplicate')
      accuracyKeys.add(profile.key)
      accuracySamples += profile.samples
      accuracyAnswerSheetSamples += profile.answerSheetSamples
      accuracyAnswerCells += profile.answerCells
      accuracyReviewSamples += profile.reviewSamples
      accuracyAcceptedSamples += profile.acceptedSamples
      accuracyNormalSamples += profile.normalSamples
      accuracyStressSamples += profile.stressSamples
      accuracyNegativeSamples += profile.negativeSamples
      accuracyFalseAccepts += profile.falseAcceptCount
      profileNormalExact += profile.normalExactSheetAccuracy * profile.normalSamples
      profileStressExact += profile.stressExactSheetAccuracy * profile.stressSamples
      profileCorrectAnswers += profile.answerAccuracy * profile.answerCells
      profileFirstCaptures += profile.firstCaptureRate * profile.acceptedSamples
      profileRoutedReviews += profile.reviewRoutingAccuracy * profile.reviewSamples
      profileRoutedNegatives += profile.negativeRoutingAccuracy * profile.negativeSamples
      if (profile.normalSamples + profile.stressSamples + profile.negativeSamples !== profile.samples
        || profile.answerSheetSamples !== profile.normalSamples + profile.stressSamples
        || profile.answerCells < profile.answerSheetSamples
        || profile.reviewSamples > profile.samples
        || profile.acceptedSamples > profile.samples
        || profile.falseAcceptCount > profile.samples) {
        reasons.push(`accuracy_profile_accounting_invalid: ${profile.key}`)
      }
      if (profile.samples < targets.minAccuracySamplesPerProfile) reasons.push(`accuracy_profile_samples ${profile.samples} < ${targets.minAccuracySamplesPerProfile}: ${profile.key}`)
      if (profile.normalSamples < targets.minNormalSamplesPerAccuracyProfile) reasons.push(`accuracy_profile_normal_samples ${profile.normalSamples} < ${targets.minNormalSamplesPerAccuracyProfile}: ${profile.key}`)
      if (profile.stressSamples < targets.minStressSamplesPerAccuracyProfile) reasons.push(`accuracy_profile_stress_samples ${profile.stressSamples} < ${targets.minStressSamplesPerAccuracyProfile}: ${profile.key}`)
      if (profile.negativeSamples < targets.minNegativeSamplesPerAccuracyProfile) reasons.push(`accuracy_profile_negative_samples ${profile.negativeSamples} < ${targets.minNegativeSamplesPerAccuracyProfile}: ${profile.key}`)
      if (profile.reviewSamples < targets.minReviewSamplesPerAccuracyProfile) reasons.push(`accuracy_profile_review_samples ${profile.reviewSamples} < ${targets.minReviewSamplesPerAccuracyProfile}: ${profile.key}`)
      if (profile.acceptedSamples < targets.minAcceptedSamplesPerAccuracyProfile) reasons.push(`accuracy_profile_accepted_samples ${profile.acceptedSamples} < ${targets.minAcceptedSamplesPerAccuracyProfile}: ${profile.key}`)
      if (profile.normalExactSheetAccuracy < targets.minNormalExactSheetAccuracy) reasons.push(`accuracy_profile_normal_exact_below_target: ${profile.key}`)
      if (profile.stressExactSheetAccuracy < targets.minStressExactSheetAccuracy) reasons.push(`accuracy_profile_stress_exact_below_target: ${profile.key}`)
      if (profile.answerAccuracy < targets.minAnswerAccuracy) reasons.push(`accuracy_profile_answer_accuracy_below_target: ${profile.key}`)
      if (profile.firstCaptureRate < targets.minFirstCaptureRate) reasons.push(`accuracy_profile_first_capture_below_target: ${profile.key}`)
      if (profile.falseAcceptCount > targets.maxFalseAcceptCount) reasons.push(`accuracy_profile_false_accepts_above_target: ${profile.key}`)
      if (profile.reviewRoutingAccuracy < targets.minReviewRoutingAccuracy) reasons.push(`accuracy_profile_review_routing_below_target: ${profile.key}`)
      if (profile.negativeRoutingAccuracy < targets.minNegativeRoutingAccuracy) reasons.push(`accuracy_profile_negative_routing_below_target: ${profile.key}`)
    }
    if (accuracySamples !== report.samples) reasons.push('accuracy_profile_samples_mismatch')
    if (accuracyAnswerSheetSamples !== report.answerSheetSamples
      || accuracyAnswerCells !== report.answerCells
      || accuracyReviewSamples !== report.reviewSamples
      || accuracyAcceptedSamples !== report.acceptedSamples
      || accuracyNormalSamples !== report.normalSamples
      || accuracyStressSamples !== report.stressSamples
      || accuracyNegativeSamples !== report.negativeSamples
      || accuracyFalseAccepts !== report.falseAcceptCount) {
      reasons.push('accuracy_profile_accounting_mismatch')
    }
    const nearlyEqual = (left: number, right: number) => Math.abs(left - right) <= 1e-9
    if (!nearlyEqual(profileNormalExact + profileStressExact, report.exactSheetAccuracy * report.answerSheetSamples)
      || !nearlyEqual(profileNormalExact, report.normalExactSheetAccuracy * report.normalSamples)
      || !nearlyEqual(profileStressExact, report.stressExactSheetAccuracy * report.stressSamples)
      || !nearlyEqual(profileCorrectAnswers, report.answerAccuracy * report.answerCells)
      || !nearlyEqual(profileFirstCaptures, report.firstCaptureRate * report.acceptedSamples)
      || !nearlyEqual(profileRoutedReviews, report.reviewRoutingAccuracy * report.reviewSamples)
      || !nearlyEqual(profileRoutedNegatives, report.negativeRoutingAccuracy * report.negativeSamples)) {
      reasons.push('accuracy_profile_summary_mismatch')
    }

    if (Array.isArray(targets.requiredAccuracyProfiles)) {
      const requiredKeys = new Set<string>()
      for (const requiredProfile of targets.requiredAccuracyProfiles) {
        if (!isValidRequiredAccuracyProfile(requiredProfile)) {
          reasons.push('required_accuracy_profile_invalid')
          continue
        }
        const requiredKey = getOmrBenchmarkAccuracyProfileKey(requiredProfile)
        if (requiredKeys.has(requiredKey)) reasons.push('required_accuracy_profile_duplicate')
        requiredKeys.add(requiredKey)
        if (!accuracyKeys.has(requiredKey)) reasons.push(`required_accuracy_profile_missing: ${requiredKey}`)
      }
    }
  }

  if (report.normalExactSheetAccuracy < targets.minNormalExactSheetAccuracy) reasons.push('normal_exact_sheet_accuracy_below_target')
  if (report.stressExactSheetAccuracy < targets.minStressExactSheetAccuracy) reasons.push('stress_exact_sheet_accuracy_below_target')
  if (report.answerAccuracy < targets.minAnswerAccuracy) reasons.push('answer_accuracy_below_target')
  if (report.firstCaptureRate < targets.minFirstCaptureRate) reasons.push('first_capture_rate_below_target')
  if (report.falseAcceptCount > targets.maxFalseAcceptCount) reasons.push('false_accepts_above_target')
  if (report.reviewRoutingAccuracy < targets.minReviewRoutingAccuracy) reasons.push('review_routing_accuracy_below_target')
  if (report.negativeRoutingAccuracy < targets.minNegativeRoutingAccuracy) reasons.push('negative_routing_accuracy_below_target')
  return { passed: reasons.length === 0, reasons }
}
