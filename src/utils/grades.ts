import {
  GradePolicyEngine,
  DEFAULT_GRADE_POLICY_WEIGHTS,
  type GradePolicyInput,
  type GradeCalculationPolicy as GradePolicyCalculationPolicy,
  type GradeWeightsConfig as GradePolicyWeightsConfig,
  type GradeResult as GradePolicyResult,
} from './gradePolicy'

export interface GradeInput extends GradePolicyInput {}

export function escapeHtml(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return ''
  const str = String(text)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export type GradeWeightsConfig = GradePolicyWeightsConfig

export const DEFAULT_GRADE_WEIGHTS: GradeWeightsConfig = DEFAULT_GRADE_POLICY_WEIGHTS

export type GradeCalculationPolicy = GradePolicyCalculationPolicy

export const DEFAULT_GRADE_CALCULATION_POLICY: GradeCalculationPolicy = {
  requiredFields: [],
}

export type GradeResult = GradePolicyResult

/**
 * Single source of truth for academic classification labels/thresholds.
 * Shared by calculateGradeAverage, reportViewModelFactory, pdfGenerator,
 * and official Reporting projections so thresholds never drift between screens.
 */
export function getClassificationLabel(avg: number, config: GradeWeightsConfig = DEFAULT_GRADE_WEIGHTS): string {
  return new GradePolicyEngine(config).getClassificationLabel(avg)
}

/**
 * Làm tròn theo roundingDecimal của parish — KHÔNG hardcode 1 chữ số thập phân.
 * Khớp server computeWeightedGpa/evaluateStudentWithData (Math.round(x*f)/f).
 */
export function roundToDecimal(value: number, roundingDecimal: number = DEFAULT_GRADE_WEIGHTS.roundingDecimal): number {
  const factor = Math.pow(10, roundingDecimal)
  return Math.round(value * factor) / factor
}

export interface YearlyGpaResult {
  gpa: number | null
  isProvisional: boolean
}

/**
 * GPA cả năm = trung bình GPA HK1 + HK2 (mỗi HK đã round theo roundingDecimal),
 * làm tròn 1 lần cuối cùng — cùng công thức server
 * (evaluateStudentWithData: round(avg(gpa_hk1, gpa_hk2))). Nếu chỉ có 1 học kỳ
 * thì dùng GPA học kỳ đó (tạm tính).
 */
export function calculateYearlyGpa(
  sem1Score: number | null,
  sem2Score: number | null,
  config: GradeWeightsConfig = DEFAULT_GRADE_WEIGHTS
): YearlyGpaResult {
  if (sem1Score !== null && sem2Score !== null) {
    return { gpa: roundToDecimal((sem1Score + sem2Score) / 2, config.roundingDecimal), isProvisional: false }
  }
  if (sem1Score !== null) return { gpa: sem1Score, isProvisional: true }
  if (sem2Score !== null) return { gpa: sem2Score, isProvisional: true }
  return { gpa: null, isProvisional: false }
}

export function calculateGradeAverage(
  grade: GradeInput | null | undefined,
  config: GradeWeightsConfig = DEFAULT_GRADE_WEIGHTS,
  policy: GradeCalculationPolicy = DEFAULT_GRADE_CALCULATION_POLICY
): GradeResult {
  return new GradePolicyEngine(config).calculateAverage(grade, policy)
}

/**
 * F3: Đếm "có mặt" có trọng số theo attendancePolicy.excusedWeight — khớp server
 * (AttendanceRateSpecification / ReportCardProjectionRepository): Present = 1,
 * AbsentExcused = excusedWeight (mặc định 1.0, parish có thể cấu hình < 1).
 * Trước đây client luôn đếm AbsentExcused full 1.0 → lệch với rule parish.
 */
export function countAttendancePresent(
  records: ReadonlyArray<{ status: string }>,
  excusedWeight: number = 1.0
): number {
  const w = Math.min(Math.max(Number(excusedWeight) || 0, 0), 1)
  return records.reduce((acc, a) => {
    if (a.status === 'Present') return acc + 1
    if (a.status === 'AbsentExcused') return acc + w
    return acc
  }, 0)
}

export function calculateAttendanceRate(
  presentCount: number,
  totalCount: number
): { rate: number; presentCount: number; totalCount: number } {
  if (totalCount === 0) return { rate: 100, presentCount: 0, totalCount: 0 }
  // ADR-017: Rounding khớp server AttendanceRateSpecification/ReportCardProjectionRepository
  // (toFixed(1)). Trước đây Math.round làm tròn lên số nguyên (79.55% → 80%), khác
  // server (79.6%) → có thể lật kết quả xét thăng tiến ở ngưỡng 80%.
  const rate = Number(((presentCount / totalCount) * 100).toFixed(1))
  return { rate, presentCount, totalCount }
}

export { normalizeAcademicYear, matchAcademicYear } from './academicYear'
