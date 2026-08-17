import { semesterLockSpecification, SemesterLockSpecification } from './SemesterLockSpecification.js'

export interface PromotionPolicyConfig {
  minGpa: number
  minAttendance: number
}

export const DEFAULT_PROMOTION_POLICY: PromotionPolicyConfig = {
  minGpa: 5.0,
  minAttendance: 80,
}

export class GpaEligibilitySpecification {
  public isSatisfiedBy(gpa: number | null, minGpa: number = DEFAULT_PROMOTION_POLICY.minGpa): boolean {
    // null = chưa có điểm nào → không đủ điều kiện (không coi là 0.0)
    return gpa !== null && gpa >= minGpa
  }
}

export class AttendanceEligibilitySpecification {
  public isSatisfiedBy(attendanceRate: number, minAttendance: number = DEFAULT_PROMOTION_POLICY.minAttendance): boolean {
    return attendanceRate >= minAttendance
  }
}

export interface EvaluationInput {
  studentId: string
  academicYear: string
  parishId: string
  /** null = học sinh chưa có điểm học tập nào (không đồng nghĩa 0.0) */
  gpa: number | null
  attendanceRate: number
  policy?: PromotionPolicyConfig
}

export interface EvaluationResult {
  isEligible: boolean
  rejectionReasons: string[]
  suggestedStatus: 'PROMOTED' | 'RETAINED'
}

export class PromotionEligibilitySpecification {
  private gpaSpec: GpaEligibilitySpecification
  private attendanceSpec: AttendanceEligibilitySpecification
  private semesterLockSpec: SemesterLockSpecification

  constructor(
    gpaSpec: GpaEligibilitySpecification = new GpaEligibilitySpecification(),
    attendanceSpec: AttendanceEligibilitySpecification = new AttendanceEligibilitySpecification(),
    semesterLockSpec: SemesterLockSpecification = semesterLockSpecification
  ) {
    this.gpaSpec = gpaSpec
    this.attendanceSpec = attendanceSpec
    this.semesterLockSpec = semesterLockSpec
  }

  public async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const policy = input.policy || DEFAULT_PROMOTION_POLICY
    const rejectionReasons: string[] = []

    // 1. Semester 2 MUST be LOCKED before promotion evaluation
    const isHk2Unlocked = await this.semesterLockSpec.isSatisfiedBy(input.academicYear, 2, input.parishId)
    if (isHk2Unlocked) {
      rejectionReasons.push(`Học kỳ 2 năm học ${input.academicYear} chưa được khóa sổ điểm. Không thể xét duyệt lên lớp.`)
    }

    // 2. GPA Eligibility check — reason khớp client checkPromotionEligibility:
    // chưa có điểm → "Chưa có kết quả điểm học tập" (không phải "(0) chưa đạt")
    if (input.gpa === null) {
      rejectionReasons.push('Chưa có kết quả điểm học tập')
    } else if (!this.gpaSpec.isSatisfiedBy(input.gpa, policy.minGpa)) {
      rejectionReasons.push(`Điểm trung bình (${input.gpa}) chưa đạt ngưỡng tối thiểu (${policy.minGpa}).`)
    }

    // 3. Attendance Eligibility check
    if (!this.attendanceSpec.isSatisfiedBy(input.attendanceRate, policy.minAttendance)) {
      rejectionReasons.push(`Tỷ lệ chuyên cần (${input.attendanceRate}%) chưa đạt ngưỡng tối thiểu (${policy.minAttendance}%).`)
    }

    const isEligible = rejectionReasons.length === 0
    return {
      isEligible,
      rejectionReasons,
      suggestedStatus: isEligible ? 'PROMOTED' : 'RETAINED',
    }
  }
}

export const promotionEligibilitySpecification = new PromotionEligibilitySpecification()
