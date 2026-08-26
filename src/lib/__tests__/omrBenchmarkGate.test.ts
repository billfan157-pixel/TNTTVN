import { describe, expect, it } from 'vitest'
import { evaluateOmrBenchmarkGate } from '../omrBenchmarkGate'

const passing = {
  samples: 400,
  normalSamples: 200,
  stressSamples: 100,
  negativeSamples: 100,
  exactSheetAccuracy: 0.995,
  normalExactSheetAccuracy: 0.995,
  stressExactSheetAccuracy: 0.98,
  answerAccuracy: 0.998,
  firstCaptureRate: 0.95,
  falseAcceptCount: 0,
  reviewRoutingAccuracy: 1,
  negativeRoutingAccuracy: 1,
  p95DurationMs: 150,
}

describe('OMR benchmark release gate', () => {
  it('passes a report meeting all targets', () => {
    expect(evaluateOmrBenchmarkGate(passing)).toEqual({ passed: true, reasons: [] })
  })

  it('fails closed when corpus is too small or has any false accept', () => {
    const result = evaluateOmrBenchmarkGate({ ...passing, samples: 12, falseAcceptCount: 1 })
    expect(result.passed).toBe(false)
    expect(result.reasons).toContain('samples 12 < 400')
    expect(result.reasons).toContain('false_accepts_above_target')
  })
})
