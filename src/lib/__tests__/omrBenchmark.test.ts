import { describe, expect, it } from 'vitest'
import { buildOmrBenchmarkReport, type OmrBenchmarkExecutionProfile, type OmrBenchmarkObservation } from '../omrBenchmark'

const profile: OmrBenchmarkExecutionProfile = {
  workload: 'multiple_choice',
  engineVersion: 'omr-v4-benchmark',
  deviceProfile: 'pixel-8',
  browser: 'chrome-128',
  frameWidth: 1280,
  frameHeight: 1707,
  templateMode: 'integrated',
  questionCount: 2,
  runKind: 'warm',
}

function observation(overrides: Partial<OmrBenchmarkObservation> = {}): OmrBenchmarkObservation {
  return {
    sampleId: 'normal-1',
    fileChecksum: 'a'.repeat(64),
    cohort: 'normal',
    expectedAnswers: ['A', 'B'],
    detectedAnswers: ['A', 'B'],
    expectedOutcome: 'accepted',
    actualOutcome: 'accepted',
    firstCaptureAccepted: true,
    durationMs: 90,
    profile,
    ...overrides,
  }
}

describe('OMR benchmark KPI report', () => {
  it('tính exact sheet, false accept, review routing và p95 theo profile', () => {
    const report = buildOmrBenchmarkReport([
      observation(),
      observation({
        sampleId: 'stress-1',
        fileChecksum: 'b'.repeat(64),
        cohort: 'stress',
        expectedAnswers: [null, 'B'],
        detectedAnswers: [null, 'B'],
        expectedOutcome: 'review_required',
        actualOutcome: 'review_required',
        firstCaptureAccepted: false,
        durationMs: 140,
      }),
      observation({
        sampleId: 'blank-1',
        fileChecksum: 'c'.repeat(64),
        cohort: 'negative',
        expectedAnswers: [null, null],
        detectedAnswers: ['A', null],
        expectedOutcome: 'rejected',
        actualOutcome: 'accepted',
        firstCaptureAccepted: false,
        durationMs: 170,
      }),
    ])
    expect(report.inputSamples).toBe(3)
    expect(report.samples).toBe(3)
    expect(report.invalidSamples).toBe(0)
    expect(report.duplicateSamples).toBe(0)
    expect(report.answerSheetSamples).toBe(2)
    expect(report.reviewSamples).toBe(1)
    expect(report.durationSamples).toBe(3)
    expect(report.exactSheetAccuracy).toBe(1)
    expect(report.normalExactSheetAccuracy).toBe(1)
    expect(report.stressExactSheetAccuracy).toBe(1)
    expect(report.negativeRoutingAccuracy).toBe(0)
    expect(report.firstCaptureRate).toBe(1)
    // Chỉ 3 đáp án có nhãn khác null trên normal/stress; negative và ô trống
    // không được làm đẹp accuracy.
    expect(report.answerAccuracy).toBe(1)
    expect(report.falseAcceptCount).toBe(1)
    expect(report.reviewRoutingAccuracy).toBe(1)
    expect(report.p95DurationMs).toBe(170)
    expect(report.timingProfiles).toEqual([expect.objectContaining({ samples: 3, p95DurationMs: 170 })])
    expect(report.accuracyProfiles).toEqual([expect.objectContaining({ samples: 3, falseAcceptCount: 1 })])
  })

  it('không tính negative/ô null vào accuracy', () => {
    const report = buildOmrBenchmarkReport([
      observation({
        sampleId: 'stress-null',
        fileChecksum: 'd'.repeat(64),
        cohort: 'stress',
        expectedAnswers: [null, 'B'],
        detectedAnswers: ['A', 'B'],
        expectedOutcome: 'review_required',
        actualOutcome: 'accepted',
        firstCaptureAccepted: false,
        durationMs: 120,
      }),
      observation({
        sampleId: 'negative-empty',
        fileChecksum: 'e'.repeat(64),
        cohort: 'negative',
        expectedAnswers: [],
        detectedAnswers: [],
        expectedOutcome: 'rejected',
        actualOutcome: 'rejected',
        firstCaptureAccepted: false,
        durationMs: 20,
      }),
    ])
    expect(report.exactSheetAccuracy).toBe(0)
    expect(report.answerAccuracy).toBe(1)
    expect(report.reviewRoutingAccuracy).toBe(0)
    expect(report.durationSamples).toBe(2)
  })

  it('coi detectedAnswers thiếu ô là kết quả sai thay vì loại khỏi corpus', () => {
    const report = buildOmrBenchmarkReport([
      observation({ detectedAnswers: ['A'] }),
    ])
    expect(report.samples).toBe(1)
    expect(report.invalidSamples).toBe(0)
    expect(report.exactSheetAccuracy).toBe(0)
    expect(report.answerAccuracy).toBe(0.5)
  })

  it('loại và đếm fail-visible observation trùng hoặc malformed', () => {
    const valid = observation()
    const report = buildOmrBenchmarkReport([
      valid,
      { ...valid },
      observation({ sampleId: 'same-file-different-id' }),
      observation({ sampleId: 'nan-duration', fileChecksum: 'f'.repeat(64), durationMs: Number.NaN }),
      { ...observation({ sampleId: 'missing-profile', fileChecksum: '1'.repeat(64) }), profile: undefined } as unknown as OmrBenchmarkObservation,
    ])
    expect(report.inputSamples).toBe(5)
    expect(report.samples).toBe(1)
    expect(report.duplicateSamples).toBe(2)
    expect(report.invalidSamples).toBe(2)
    expect(report.durationSamples).toBe(1)
  })

  it('không pool timing của các device/browser/resolution profile', () => {
    const report = buildOmrBenchmarkReport([
      observation({ sampleId: 'pixel', durationMs: 80 }),
      observation({
        sampleId: 'iphone',
        fileChecksum: '2'.repeat(64),
        durationMs: 145,
        profile: { workload: 'multiple_choice', engineVersion: 'omr-v4-benchmark', deviceProfile: 'iphone-15', browser: 'safari-20', frameWidth: 960, frameHeight: 1280, templateMode: 'full_page', questionCount: 2, runKind: 'cold' },
      }),
    ])
    expect(report.timingProfiles).toHaveLength(2)
    expect(report.timingProfiles.map(item => item.p95DurationMs).sort((a, b) => a - b)).toEqual([80, 145])
    expect(report.p95DurationMs).toBe(145)
    expect(report.accuracyProfiles).toHaveLength(2)
  })

  it('không pool cùng device/resolution khi template hoặc questionCount khác nhau', () => {
    const report = buildOmrBenchmarkReport([
      observation({ sampleId: 'integrated-2', durationMs: 80 }),
      observation({
        sampleId: 'full-page-1',
        fileChecksum: '3'.repeat(64),
        expectedAnswers: ['A'],
        detectedAnswers: ['A'],
        durationMs: 145,
        profile: { ...profile, templateMode: 'full_page', questionCount: 1 },
      }),
    ])
    expect(report.timingProfiles).toHaveLength(2)
    expect(report.accuracyProfiles).toHaveLength(2)
  })
})
