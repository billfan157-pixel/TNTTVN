import { describe, expect, it } from 'vitest'
import type { OmrBenchmarkReport } from '../omrBenchmark'
import { DEFAULT_OMR_BENCHMARK_TARGETS, evaluateOmrBenchmarkGate } from '../omrBenchmarkGate'

const timingProfile = {
  key: '["multiple_choice","omr-v4-benchmark","target-android","chrome-128",1280,1707,"integrated",50,"warm"]',
  workload: 'multiple_choice' as const,
  engineVersion: 'omr-v4-benchmark',
  deviceProfile: 'target-android',
  browser: 'chrome-128',
  frameWidth: 1280,
  frameHeight: 1707,
  templateMode: 'integrated' as const,
  questionCount: 50,
  runKind: 'warm' as const,
  samples: 200,
  p95DurationMs: 150,
}

const coldTimingProfile = {
  ...timingProfile,
  key: '["multiple_choice","omr-v4-benchmark","target-android","chrome-128",1280,1707,"integrated",50,"cold"]',
  runKind: 'cold' as const,
}

const accuracyProfile = {
  key: '["multiple_choice","omr-v4-benchmark","target-android","chrome-128",1280,1707,"integrated",50]',
  workload: 'multiple_choice' as const,
  engineVersion: timingProfile.engineVersion,
  deviceProfile: timingProfile.deviceProfile,
  browser: timingProfile.browser,
  frameWidth: timingProfile.frameWidth,
  frameHeight: timingProfile.frameHeight,
  templateMode: timingProfile.templateMode,
  questionCount: timingProfile.questionCount,
  samples: 400,
  answerSheetSamples: 300,
  answerCells: 15_000,
  reviewSamples: 100,
  acceptedSamples: 200,
  normalSamples: 200,
  stressSamples: 100,
  negativeSamples: 100,
  normalExactSheetAccuracy: 0.995,
  stressExactSheetAccuracy: 0.98,
  answerAccuracy: 0.998,
  firstCaptureRate: 0.95,
  falseAcceptCount: 0,
  reviewRoutingAccuracy: 1,
  negativeRoutingAccuracy: 1,
}

const passing: OmrBenchmarkReport = {
  inputSamples: 400,
  samples: 400,
  invalidSamples: 0,
  duplicateSamples: 0,
  answerSheetSamples: 300,
  answerCells: 15_000,
  reviewSamples: 100,
  acceptedSamples: 200,
  durationSamples: 400,
  normalSamples: 200,
  stressSamples: 100,
  negativeSamples: 100,
  exactSheetAccuracy: 0.99,
  normalExactSheetAccuracy: 0.995,
  stressExactSheetAccuracy: 0.98,
  answerAccuracy: 0.998,
  firstCaptureRate: 0.95,
  falseAcceptCount: 0,
  reviewRoutingAccuracy: 1,
  negativeRoutingAccuracy: 1,
  p95DurationMs: 150,
  timingProfiles: [timingProfile, coldTimingProfile],
  accuracyProfiles: [accuracyProfile],
}

const configuredTargets = {
  ...DEFAULT_OMR_BENCHMARK_TARGETS,
  requiredTimingProfiles: [timingProfile, coldTimingProfile].map(profile => ({
    workload: profile.workload,
    engineVersion: profile.engineVersion,
    deviceProfile: profile.deviceProfile,
    browser: profile.browser,
    frameWidth: profile.frameWidth,
    frameHeight: profile.frameHeight,
    templateMode: profile.templateMode,
    questionCount: profile.questionCount,
    runKind: profile.runKind,
  })),
  requiredAccuracyProfiles: [{
    workload: accuracyProfile.workload,
    engineVersion: accuracyProfile.engineVersion,
    deviceProfile: accuracyProfile.deviceProfile,
    browser: accuracyProfile.browser,
    frameWidth: accuracyProfile.frameWidth,
    frameHeight: accuracyProfile.frameHeight,
    templateMode: accuracyProfile.templateMode,
    questionCount: accuracyProfile.questionCount,
  }],
}

describe('OMR benchmark release gate', () => {
  it('passes a report meeting all targets', () => {
    expect(evaluateOmrBenchmarkGate(passing, configuredTargets)).toEqual({ passed: true, reasons: [] })
  })

  it('fails closed until operations bind exact required timing and accuracy profiles', () => {
    const result = evaluateOmrBenchmarkGate(passing)
    expect(result.reasons).toContain('required_timing_profiles_not_configured')
    expect(result.reasons).toContain('required_accuracy_profiles_not_configured')
  })

  it('fails closed when corpus is too small or has any false accept', () => {
    const result = evaluateOmrBenchmarkGate({
      ...passing,
      inputSamples: 12,
      samples: 12,
      durationSamples: 12,
      normalSamples: 6,
      stressSamples: 3,
      negativeSamples: 3,
      answerSheetSamples: 9,
      falseAcceptCount: 1,
      timingProfiles: [{ ...timingProfile, samples: 6 }, { ...coldTimingProfile, samples: 6 }],
    }, configuredTargets)
    expect(result.passed).toBe(false)
    expect(result.reasons).toContain('samples 12 < 400')
    expect(result.reasons).toContain('false_accepts_above_target')
  })

  it('fails closed when timing or review evidence is missing', () => {
    const result = evaluateOmrBenchmarkGate({
      ...passing,
      durationSamples: 399,
      reviewSamples: 0,
      timingProfiles: [{ ...timingProfile, samples: 199 }, { ...coldTimingProfile, samples: 200 }],
    }, configuredTargets)
    expect(result.passed).toBe(false)
    expect(result.reasons).toContain('duration_samples_incomplete')
    expect(result.reasons).toContain('review_samples_missing')
  })

  it('fails closed on duplicate/malformed accounting and NaN metrics', () => {
    const result = evaluateOmrBenchmarkGate({
      ...passing,
      inputSamples: 402,
      invalidSamples: 1,
      duplicateSamples: 1,
      answerAccuracy: Number.NaN,
    }, configuredTargets)
    expect(result.passed).toBe(false)
    expect(result.reasons).toContain('invalid_samples_present')
    expect(result.reasons).toContain('duplicate_samples_present')
    expect(result.reasons).toContain('report_metrics_invalid')
  })

  it('checks p95 and sample sufficiency independently for every timing profile', () => {
    const slowProfile = {
      ...timingProfile,
      key: '["multiple_choice","omr-v4-benchmark","target-ios","safari-20",960,1280,"full_page",50,"cold"]',
      deviceProfile: 'target-ios',
      browser: 'safari-20',
      frameWidth: 960,
      frameHeight: 1280,
      templateMode: 'full_page' as const,
      runKind: 'cold' as const,
      samples: 10,
      p95DurationMs: 151,
    }
    const result = evaluateOmrBenchmarkGate({
      ...passing,
      p95DurationMs: 151,
      timingProfiles: [{ ...timingProfile, samples: 190 }, { ...coldTimingProfile, samples: 200 }, slowProfile],
    }, configuredTargets)
    expect(result.passed).toBe(false)
    expect(result.reasons.some(reason => reason.startsWith('timing_profile_samples 10 < 20'))).toBe(true)
    expect(result.reasons.some(reason => reason.startsWith('p95_duration_above_target'))).toBe(true)
  })

  it('rejects a non-finite timing summary instead of allowing NaN comparisons to pass', () => {
    const result = evaluateOmrBenchmarkGate({ ...passing, p95DurationMs: Number.NaN }, configuredTargets)
    expect(result.passed).toBe(false)
    expect(result.reasons).toContain('report_timing_invalid')
  })

  it('fails when a configured production profile is absent', () => {
    const fullPage = {
      ...configuredTargets.requiredTimingProfiles[0],
      templateMode: 'full_page' as const,
    }
    const result = evaluateOmrBenchmarkGate(passing, {
      ...configuredTargets,
      requiredTimingProfiles: [...configuredTargets.requiredTimingProfiles, fullPage],
    })
    expect(result.reasons.some(reason => reason.startsWith('required_timing_profile_missing'))).toBe(true)
  })

  it('requires cold and warm timing for every configured accuracy profile', () => {
    const result = evaluateOmrBenchmarkGate(passing, {
      ...configuredTargets,
      requiredTimingProfiles: [configuredTargets.requiredTimingProfiles[0]],
    })
    expect(result.reasons.some(reason => reason.startsWith('required_timing_run_kinds_incomplete'))).toBe(true)
  })

  it('fails a weak per-profile accuracy result even when aggregate metrics look good', () => {
    const result = evaluateOmrBenchmarkGate({
      ...passing,
      accuracyProfiles: [{ ...accuracyProfile, stressExactSheetAccuracy: 0.9 }],
    }, configuredTargets)
    expect(result.reasons.some(reason => reason.startsWith('accuracy_profile_stress_exact_below_target'))).toBe(true)
  })

  it('rejects profile metrics that do not reconcile with the aggregate report', () => {
    const result = evaluateOmrBenchmarkGate({
      ...passing,
      accuracyProfiles: [{ ...accuracyProfile, acceptedSamples: 199 }],
    }, configuredTargets)
    expect(result.reasons).toContain('accuracy_profile_accounting_mismatch')
  })
})
