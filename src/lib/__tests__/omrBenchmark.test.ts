import { describe, expect, it } from 'vitest'
import { buildOmrBenchmarkReport } from '../omrBenchmark'

describe('OMR benchmark KPI report', () => {
  it('tính exact sheet, false accept, review routing và p95', () => {
    const report = buildOmrBenchmarkReport([
      { sampleId: 'normal-1', cohort: 'normal', expectedAnswers: ['A', 'B'], detectedAnswers: ['A', 'B'], expectedOutcome: 'accepted', actualOutcome: 'accepted', firstCaptureAccepted: true, durationMs: 90 },
      { sampleId: 'stress-1', cohort: 'stress', expectedAnswers: [null, 'B'], detectedAnswers: [null, 'B'], expectedOutcome: 'review_required', actualOutcome: 'review_required', firstCaptureAccepted: false, durationMs: 140 },
      { sampleId: 'blank-1', cohort: 'negative', expectedAnswers: [null, null], detectedAnswers: ['A', null], expectedOutcome: 'rejected', actualOutcome: 'accepted', firstCaptureAccepted: true, durationMs: 170 },
    ])
    expect(report.samples).toBe(3)
    expect(report.exactSheetAccuracy).toBeCloseTo(2 / 3)
    expect(report.normalExactSheetAccuracy).toBe(1)
    expect(report.stressExactSheetAccuracy).toBe(1)
    expect(report.negativeRoutingAccuracy).toBe(0)
    expect(report.firstCaptureRate).toBe(1)
    expect(report.answerAccuracy).toBeCloseTo(5 / 6)
    expect(report.falseAcceptCount).toBe(1)
    expect(report.reviewRoutingAccuracy).toBeCloseTo(2 / 3)
    expect(report.p95DurationMs).toBe(170)
  })
})
