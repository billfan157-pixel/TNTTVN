import type { ExamAnswerVariants, ExamResult, ExamVersionCode, MultipleChoiceOption } from '../types'

export interface ExamItemAnalysis {
  questionIndex: number
  responses: number
  counts: Record<MultipleChoiceOption | 'blank', number>
  correctRate: number | null
  blankRate: number
  discrimination: number | null
}

export interface ExamAnalytics {
  count: number
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
  passRate: number | null
  distribution: Array<{ score: number; count: number }>
  versions: Array<{ version: ExamVersionCode; count: number }>
  items: ExamItemAnalysis[]
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

export function computeExamAnalytics(
  results: ExamResult[],
  questionCount: number,
  maxScore: number,
  answerVariants: Partial<ExamAnswerVariants>,
): ExamAnalytics {
  const scores = results.map(result => Number(result.score)).filter(Number.isFinite).sort((a, b) => a - b)
  const distributionMap = new Map<number, number>()
  const versionMap = new Map<ExamVersionCode, number>()
  for (const result of results) {
    const score = round(Number(result.score), 1)
    distributionMap.set(score, (distributionMap.get(score) ?? 0) + 1)
    const version = result.examVersion ?? 'A'
    versionMap.set(version, (versionMap.get(version) ?? 0) + 1)
  }

  const items: ExamItemAnalysis[] = []
  for (let questionIndex = 1; questionIndex <= questionCount; questionIndex++) {
    const counts: ExamItemAnalysis['counts'] = { A: 0, B: 0, C: 0, D: 0, blank: 0 }
    const scored: Array<{ score: number; correct: boolean }> = []
    for (const result of results) {
      const answer = result.answers?.[questionIndex] ?? null
      if (answer === 'A' || answer === 'B' || answer === 'C' || answer === 'D') counts[answer]++
      else counts.blank++
      const version = result.examVersion ?? 'A'
      const expected = answerVariants[version]?.[questionIndex]
      if (expected) scored.push({ score: result.score, correct: answer === expected })
    }
    const correctCount = scored.filter(item => item.correct).length
    const p = scored.length ? correctCount / scored.length : 0
    let discrimination: number | null = null
    if (scored.length >= 5 && p > 0 && p < 1) {
      const correctScores = scored.filter(item => item.correct).map(item => item.score)
      const wrongScores = scored.filter(item => !item.correct).map(item => item.score)
      const scoreSd = standardDeviation(scored.map(item => item.score))
      if (scoreSd > 0 && correctScores.length && wrongScores.length) {
        const correctMean = correctScores.reduce((sum, value) => sum + value, 0) / correctScores.length
        const wrongMean = wrongScores.reduce((sum, value) => sum + value, 0) / wrongScores.length
        discrimination = round(((correctMean - wrongMean) / scoreSd) * Math.sqrt(p * (1 - p)))
      }
    }
    items.push({
      questionIndex,
      responses: scored.length,
      counts,
      correctRate: scored.length ? round(correctCount / scored.length) : null,
      blankRate: results.length ? round(counts.blank / results.length) : 0,
      discrimination,
    })
  }

  const mean = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null
  const middle = Math.floor(scores.length / 2)
  const median = scores.length === 0 ? null : scores.length % 2 ? scores[middle] : (scores[middle - 1] + scores[middle]) / 2
  return {
    count: scores.length,
    mean: mean === null ? null : round(mean, 2),
    median: median === null ? null : round(median, 2),
    min: scores[0] ?? null,
    max: scores.at(-1) ?? null,
    passRate: scores.length ? round(scores.filter(score => score >= maxScore * 0.5).length / scores.length) : null,
    distribution: [...distributionMap.entries()].sort(([a], [b]) => a - b).map(([score, count]) => ({ score, count })),
    versions: [...versionMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([version, count]) => ({ version, count })),
    items,
  }
}
