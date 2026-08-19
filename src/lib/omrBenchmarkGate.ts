import type { OmrBenchmarkReport } from './omrBenchmark'

export interface OmrBenchmarkTargets {
  minSamples: number
  minExactSheetAccuracy: number
  minAnswerAccuracy: number
  minFirstCaptureRate: number
  maxFalseAcceptCount: number
  minReviewRoutingAccuracy: number
  maxP95DurationMs: number
}

/**
 * Release targets are intentionally policy, not claims about current production accuracy.
 * They only become meaningful once a de-identified real-camera corpus is present.
 */
export const DEFAULT_OMR_BENCHMARK_TARGETS: OmrBenchmarkTargets = {
  minSamples: 100,
  minExactSheetAccuracy: 0.98,
  minAnswerAccuracy: 0.995,
  minFirstCaptureRate: 0.90,
  maxFalseAcceptCount: 0,
  minReviewRoutingAccuracy: 0.99,
  maxP95DurationMs: 500,
}

export interface OmrBenchmarkGateResult {
  passed: boolean
  reasons: string[]
}

export function evaluateOmrBenchmarkGate(
  report: OmrBenchmarkReport,
  targets: OmrBenchmarkTargets = DEFAULT_OMR_BENCHMARK_TARGETS,
): OmrBenchmarkGateResult {
  const reasons: string[] = []
  if (report.samples < targets.minSamples) reasons.push(`samples ${report.samples} < ${targets.minSamples}`)
  if (report.exactSheetAccuracy < targets.minExactSheetAccuracy) reasons.push('exact_sheet_accuracy_below_target')
  if (report.answerAccuracy < targets.minAnswerAccuracy) reasons.push('answer_accuracy_below_target')
  if (report.firstCaptureRate < targets.minFirstCaptureRate) reasons.push('first_capture_rate_below_target')
  if (report.falseAcceptCount > targets.maxFalseAcceptCount) reasons.push('false_accepts_above_target')
  if (report.reviewRoutingAccuracy < targets.minReviewRoutingAccuracy) reasons.push('review_routing_accuracy_below_target')
  if (report.p95DurationMs > targets.maxP95DurationMs) reasons.push('p95_duration_above_target')
  return { passed: reasons.length === 0, reasons }
}
