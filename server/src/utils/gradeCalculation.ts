export interface GradeItem {
  scoreOral?: number | null
  score15m?: number | null
  score1Period?: number | null
  scoreMidterm?: number | null
  scoreFinal?: number | null
}

export interface GradeWeightsConfig {
  weightOral?: number
  weight15m?: number
  weight1Period?: number
  weightMidterm?: number
  weightFinal?: number
  /**
   * Số chữ số thập phân làm tròn GPA (1 = 0.1, 2 = 0.01).
   * Khớp client `GradeWeightsConfig.roundingDecimal` (src/utils/grades.ts) —
   * server KHÔNG được hardcode 0.1 khi parish đã cấu hình 2 chữ số.
   */
  roundingDecimal?: number
}

export const DEFAULT_GRADE_WEIGHTS: Required<GradeWeightsConfig> = {
  weightOral: 1,
  weight15m: 1,
  weight1Period: 2,
  weightMidterm: 2,
  weightFinal: 3,
  roundingDecimal: 1,
}

export function computeWeightedGpa(
  grade: GradeItem,
  weights: GradeWeightsConfig = DEFAULT_GRADE_WEIGHTS
): number | null {
  const wOral = weights.weightOral ?? 1
  const w15m = weights.weight15m ?? 1
  const w1Period = weights.weight1Period ?? 2
  const wMidterm = weights.weightMidterm ?? 2
  const wFinal = weights.weightFinal ?? 3

  let weightedSum = 0
  let totalWeight = 0

  if (typeof grade.scoreOral === 'number' && !isNaN(grade.scoreOral)) {
    weightedSum += Math.min(10, Math.max(0, grade.scoreOral)) * wOral
    totalWeight += wOral
  }
  if (typeof grade.score15m === 'number' && !isNaN(grade.score15m)) {
    weightedSum += Math.min(10, Math.max(0, grade.score15m)) * w15m
    totalWeight += w15m
  }
  if (typeof grade.score1Period === 'number' && !isNaN(grade.score1Period)) {
    weightedSum += Math.min(10, Math.max(0, grade.score1Period)) * w1Period
    totalWeight += w1Period
  }
  if (typeof grade.scoreMidterm === 'number' && !isNaN(grade.scoreMidterm)) {
    weightedSum += Math.min(10, Math.max(0, grade.scoreMidterm)) * wMidterm
    totalWeight += wMidterm
  }
  if (typeof grade.scoreFinal === 'number' && !isNaN(grade.scoreFinal)) {
    weightedSum += Math.min(10, Math.max(0, grade.scoreFinal)) * wFinal
    totalWeight += wFinal
  }

  if (totalWeight === 0) return null
  const rounding = Number(weights.roundingDecimal ?? 1)
  const factor = Math.pow(10, rounding)
  return Math.round((weightedSum / totalWeight) * factor) / factor
}

export interface ClassificationThresholds {
  xuatSac: number
  gioi: number
  kha: number
  trungBinh: number
}

export const DEFAULT_CLASSIFICATION_THRESHOLDS: ClassificationThresholds = {
  xuatSac: 9.0,
  gioi: 8.0,
  kha: 6.5,
  trungBinh: 5.0,
}

/**
 * Xếp loại học lực từ GPA cả năm (khớp client getClassificationLabel
 * trong src/utils/grades.ts). Chỉ dùng cho snapshot Finalize Year.
 */
export function getClassificationLabel(
  avg: number,
  thresholds: ClassificationThresholds = DEFAULT_CLASSIFICATION_THRESHOLDS
): string {
  if (avg >= thresholds.xuatSac) return 'Xuất Sắc'
  if (avg >= thresholds.gioi) return 'Giỏi'
  if (avg >= thresholds.kha) return 'Khá'
  if (avg >= thresholds.trungBinh) return 'Trung Bình'
  return 'Yếu'
}
