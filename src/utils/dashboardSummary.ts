import type { AttendanceRecord, GradeRecord, Student } from '../types'
import {
  calculateAttendanceRate,
  calculateGradeAverage,
  countAttendancePresent,
  type GradeWeightsConfig,
} from './grades'
import { indexDashboardGrades } from './dashboardGradeIndex'

/**
 * FE-F3: một read model duy nhất cho dashboard desktop + mobile.
 *
 * Trước đây mỗi màn hình tự tính một công thức riêng (mobile: mọi bản ghi
 * attendance không lọc năm học, index điểm theo học kỳ, đọc settings qua
 * getState() không subscribe; desktop: lọc theo năm nhưng vẫn một công thức
 * khác). Read model này nhận đủ (năm học, khoảng ngày, học kỳ, attendance
 * policy) và tái sử dụng đúng các helper đã có — `countAttendancePresent`,
 * `calculateAttendanceRate`, `indexDashboardGrades` — nên không sinh công thức
 * thứ ba.
 */

/** Phạm vi dữ liệu THẬT mà server trả cho phiên hiện tại. */
export type DashboardScope = 'parish' | 'assigned-classes'

export function getDashboardScope(role?: string | null): DashboardScope {
  // §11.5: chỉ admin đọc điểm/chuyên cần toàn giáo xứ; chunhiem/phuta bị giới
  // hạn theo lớp phụ trách (server-side classAccessQueryService).
  return role === 'admin' ? 'parish' : 'assigned-classes'
}

export function getDashboardScopeLabel(scope: DashboardScope): string {
  return scope === 'parish' ? 'Toàn xứ đoàn' : 'Lớp bạn phụ trách'
}

export interface DashboardSummaryInput {
  students: readonly Student[]
  attendance: readonly AttendanceRecord[]
  grades: readonly GradeRecord[]
  semester: number
  academicYear: string
  /** Khoảng ngày của niên học đang chọn (getYearRange). */
  range: { startDate: string; endDate: string }
  excusedWeight: number
  gradeWeights: GradeWeightsConfig
  role?: string | null
  /** Số em tiêu biểu tối đa trong bảng xếp hạng. */
  topLimit?: number
}

export interface DashboardSummary {
  scope: DashboardScope
  scopeLabel: string
  semester: number
  academicYear: string
  range: { startDate: string; endDate: string }
  students: {
    /** Sĩ số đang học (chưa xoá) */
    total: number
    active: number
  }
  attendance: {
    /** false ⇒ chưa có buổi nào được ghi nhận trong scope+range: KHÔNG kết luận "đạt". */
    hasRecords: boolean
    rate: number
    presentCount: number
    totalCount: number
    /** Số buổi (ngày) đã ghi nhận */
    sessionDates: number
  }
  grades: {
    totalGraded: number
    xuatSac: number
    gioi: number
    kha: number
    yeu: number
    topStudents: Array<{ student: Student; avg: number; label: string }>
  }
}

export function buildDashboardSummary(input: DashboardSummaryInput): DashboardSummary {
  const { students, attendance, grades, semester, academicYear, range, excusedWeight, gradeWeights } = input
  const scope = getDashboardScope(input.role)

  const visibleStudents = students.filter((student) => !student.deletedAt)
  const active = visibleStudents.filter((student) => student.status === 'Đang học').length

  const records = attendance.filter(
    (record) => record.date >= range.startDate && record.date <= range.endDate,
  )
  const presentCount = countAttendancePresent(records, excusedWeight)
  const attendanceRate = calculateAttendanceRate(presentCount, records.length)
  const sessionDates = new Set(records.map((record) => record.date)).size

  const gradeByStudent = indexDashboardGrades(grades, semester, academicYear)
  let xuatSac = 0
  let gioi = 0
  let kha = 0
  let yeu = 0
  const studentAverages: DashboardSummary['grades']['topStudents'] = []
  for (const student of visibleStudents) {
    const studentGrade = gradeByStudent.get(student.id)
    if (!studentGrade) continue
    const avgResult = calculateGradeAverage(studentGrade, gradeWeights)
    if (avgResult.score === null) continue
    studentAverages.push({ student, avg: avgResult.score, label: avgResult.label })
    if (avgResult.label === 'Xuất Sắc') xuatSac++
    else if (avgResult.label === 'Giỏi') gioi++
    else if (avgResult.label === 'Khá') kha++
    else if (avgResult.label === 'Yếu') yeu++
  }
  studentAverages.sort((a, b) => b.avg - a.avg)

  return {
    scope,
    scopeLabel: getDashboardScopeLabel(scope),
    semester,
    academicYear,
    range,
    students: { total: visibleStudents.length, active },
    attendance: {
      hasRecords: records.length > 0,
      rate: attendanceRate.rate,
      presentCount: attendanceRate.presentCount,
      totalCount: attendanceRate.totalCount,
      sessionDates,
    },
    grades: {
      totalGraded: studentAverages.length,
      xuatSac,
      gioi,
      kha,
      yeu,
      topStudents: studentAverages.slice(0, input.topLimit ?? 5),
    },
  }
}
