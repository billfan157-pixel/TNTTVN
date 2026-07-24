export interface GradeInput {
  scoreOral: number | null
  score15m: number | null
  score1Period: number | null
  scoreMidterm: number | null
  scoreFinal: number | null
}

export interface GradeWeightsConfig {
  weightOral: number
  weight15m: number
  weight1Period: number
  weightMidterm: number
  weightFinal: number
  xuatSacThreshold: number
  gioiThreshold: number
  khaThreshold: number
  trungBinhThreshold: number
  roundingDecimal: number // 1 for 0.1, 2 for 0.01
}

export const DEFAULT_GRADE_WEIGHTS: GradeWeightsConfig = {
  weightOral: 1,
  weight15m: 1,
  weight1Period: 2,
  weightMidterm: 2,
  weightFinal: 3,
  xuatSacThreshold: 9.0,
  gioiThreshold: 8.0,
  khaThreshold: 6.5,
  trungBinhThreshold: 5.0,
  roundingDecimal: 1,
}

export function getStoredGradeWeights(): GradeWeightsConfig {
  try {
    const raw = localStorage.getItem('parish_grade_weights')
    if (raw) return { ...DEFAULT_GRADE_WEIGHTS, ...JSON.parse(raw) }
  } catch {
    // Fallback to default
  }
  return DEFAULT_GRADE_WEIGHTS
}

export function saveStoredGradeWeights(config: GradeWeightsConfig): void {
  try {
    localStorage.setItem('parish_grade_weights', JSON.stringify(config))
  } catch {
    // Ignore storage errors
  }
}

export interface GradeResult {
  score: number | null
  label: string
}

export function calculateGradeAverage(
  grade: GradeInput | null | undefined,
  config: GradeWeightsConfig = getStoredGradeWeights()
): GradeResult {
  if (!grade) return { score: null, label: 'Chưa có điểm' }

  const { scoreOral, score15m, score1Period, scoreMidterm, scoreFinal } = grade
  const {
    weightOral,
    weight15m,
    weight1Period,
    weightMidterm,
    weightFinal,
    xuatSacThreshold,
    gioiThreshold,
    khaThreshold,
    trungBinhThreshold,
    roundingDecimal,
  } = config

  let totalPoints = 0
  let totalWeights = 0

  const clamp = (v: number) => Math.min(10, Math.max(0, v))

  if (scoreOral !== null && scoreOral !== undefined) {
    totalPoints += clamp(scoreOral) * weightOral
    totalWeights += weightOral
  }
  if (score15m !== null && score15m !== undefined) {
    totalPoints += clamp(score15m) * weight15m
    totalWeights += weight15m
  }
  if (score1Period !== null && score1Period !== undefined) {
    totalPoints += clamp(score1Period) * weight1Period
    totalWeights += weight1Period
  }
  if (scoreMidterm !== null && scoreMidterm !== undefined) {
    totalPoints += clamp(scoreMidterm) * weightMidterm
    totalWeights += weightMidterm
  }
  if (scoreFinal !== null && scoreFinal !== undefined) {
    totalPoints += clamp(scoreFinal) * weightFinal
    totalWeights += weightFinal
  }

  if (totalWeights === 0) return { score: null, label: 'Chưa nhập' }

  const factor = Math.pow(10, roundingDecimal)
  const avg = Math.round((totalPoints / totalWeights) * factor) / factor

  let label = 'Yếu'
  if (avg >= xuatSacThreshold) label = 'Xuất Sắc'
  else if (avg >= gioiThreshold) label = 'Giỏi'
  else if (avg >= khaThreshold) label = 'Khá'
  else if (avg >= trungBinhThreshold) label = 'Trung Bình'

  return { score: avg, label }
}

export function calculateAttendanceRate(
  presentCount: number,
  totalCount: number
): { rate: number; presentCount: number; totalCount: number } {
  if (totalCount === 0) return { rate: 100, presentCount: 0, totalCount: 0 }
  const rate = Math.round((presentCount / totalCount) * 100)
  return { rate, presentCount, totalCount }
}
