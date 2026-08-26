export interface OmrBenchmarkObservation {
  sampleId: string
  cohort: 'normal' | 'stress' | 'negative'
  expectedAnswers: Array<string | null>
  detectedAnswers: Array<string | null>
  expectedOutcome: 'accepted' | 'review_required' | 'rejected'
  actualOutcome: 'accepted' | 'review_required' | 'rejected'
  firstCaptureAccepted: boolean
  durationMs: number
}

export interface OmrBenchmarkReport {
  samples: number
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
  p95DurationMs: number
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

/**
 * Tính các KPI đã chốt từ corpus ảnh gán nhãn. Hàm không nhận/ghi ảnh; runner
 * fixture chỉ cần đưa observation sau khi detector xử lý từng ảnh.
 */
export function buildOmrBenchmarkReport(observations: OmrBenchmarkObservation[]): OmrBenchmarkReport {
  let exactSheets = 0
  let correctAnswers = 0
  let answerCells = 0
  let firstCaptures = 0
  let falseAcceptCount = 0
  let routedReviews = 0
  let acceptedSamples = 0
  let normalSamples = 0
  let stressSamples = 0
  let negativeSamples = 0
  let normalExactSheets = 0
  let stressExactSheets = 0
  let correctlyRoutedNegative = 0

  for (const observation of observations) {
    const maxLength = Math.max(observation.expectedAnswers.length, observation.detectedAnswers.length)
    let sheetExact = observation.expectedAnswers.length === observation.detectedAnswers.length
    for (let index = 0; index < maxLength; index++) {
      const correct = observation.expectedAnswers[index] === observation.detectedAnswers[index]
      if (correct) correctAnswers++
      else sheetExact = false
      answerCells++
    }
    if (sheetExact) exactSheets++
    if (observation.cohort === 'normal') {
      normalSamples++
      if (sheetExact) normalExactSheets++
    } else if (observation.cohort === 'stress') {
      stressSamples++
      if (sheetExact) stressExactSheets++
    } else {
      negativeSamples++
      if (observation.actualOutcome === observation.expectedOutcome) correctlyRoutedNegative++
    }
    if (observation.expectedOutcome === 'accepted') {
      acceptedSamples++
      if (observation.firstCaptureAccepted) firstCaptures++
    }
    if (observation.actualOutcome === 'accepted' && observation.expectedOutcome !== 'accepted') falseAcceptCount++
    if (observation.actualOutcome === observation.expectedOutcome) routedReviews++
  }

  const sortedDurations = observations.map(item => Math.max(0, item.durationMs)).sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.ceil(sortedDurations.length * 0.95) - 1)
  return {
    samples: observations.length,
    normalSamples,
    stressSamples,
    negativeSamples,
    exactSheetAccuracy: ratio(exactSheets, observations.length),
    normalExactSheetAccuracy: ratio(normalExactSheets, normalSamples),
    stressExactSheetAccuracy: ratio(stressExactSheets, stressSamples),
    answerAccuracy: ratio(correctAnswers, answerCells),
    firstCaptureRate: ratio(firstCaptures, acceptedSamples),
    falseAcceptCount,
    reviewRoutingAccuracy: ratio(routedReviews, observations.length),
    negativeRoutingAccuracy: ratio(correctlyRoutedNegative, negativeSamples),
    p95DurationMs: sortedDurations[p95Index] ?? 0,
  }
}
