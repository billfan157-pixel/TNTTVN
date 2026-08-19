import { describe, expect, it } from 'vitest'
import { evaluateOmrBenchmarkGate } from '../omrBenchmarkGate'

const passing = {
  samples: 120,
  exactSheetAccuracy: 0.99,
  answerAccuracy: 0.998,
  firstCaptureRate: 0.94,
  falseAcceptCount: 0,
  reviewRoutingAccuracy: 0.995,
  p95DurationMs: 420,
}

describe('OMR benchmark release gate', () => {
  it('passes a report meeting all targets', () => {
    expect(evaluateOmrBenchmarkGate(passing)).toEqual({ passed: true, reasons: [] })
  })

  it('fails closed when corpus is too small or has any false accept', () => {
    const result = evaluateOmrBenchmarkGate({ ...passing, samples: 12, falseAcceptCount: 1 })
    expect(result.passed).toBe(false)
    expect(result.reasons).toContain('samples 12 < 100')
    expect(result.reasons).toContain('false_accepts_above_target')
  })
})
