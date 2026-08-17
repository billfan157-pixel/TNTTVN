export type PromotionStatus =
  | 'PROMOTED'
  | 'RETAINED'
  | 'GRADUATED'
  | 'CONDITIONALLY_PROMOTED'
  | 'TRANSFERRED'

export interface PromotionDecisionProps {
  studentId: string
  academicYear: string
  status: PromotionStatus
  gpa: number
  attendanceRate: number
  isEligible: boolean
  rejectionReasons: string[]
  isOverridden?: boolean
  overrideReason?: string | null
  evaluatedAt: string
  rulesVersion?: string
}

export class PromotionDecision {
  public readonly studentId: string
  public readonly academicYear: string
  public readonly status: PromotionStatus
  public readonly gpa: number
  public readonly attendanceRate: number
  public readonly isEligible: boolean
  public readonly rejectionReasons: ReadonlyArray<string>
  public readonly isOverridden: boolean
  public readonly overrideReason: string | null
  public readonly evaluatedAt: string
  public readonly rulesVersion: string

  constructor(props: PromotionDecisionProps) {
    this.studentId = props.studentId
    this.academicYear = props.academicYear
    this.status = props.status
    this.gpa = props.gpa
    this.attendanceRate = props.attendanceRate
    this.isEligible = props.isEligible
    this.rejectionReasons = Object.freeze([...props.rejectionReasons])
    this.isOverridden = props.isOverridden ?? false
    this.overrideReason = props.overrideReason ?? null
    this.evaluatedAt = props.evaluatedAt
    this.rulesVersion = props.rulesVersion ?? 'v1.0'
  }
}
