export interface GradeRowViewModel {
  semesterLabel: string
  scoreOral: string
  score15m: string
  score1Period: string
  scoreMidterm: string
  scoreFinal: string
  scoreDaoDuc: string
  gpaLabel: string
  classification: string
}

export interface AttendanceTypeStats {
  present: number
  absent: number
  total: number
}

export interface StudentAttendanceReportViewModel {
  rate: number
  presentCount: number
  absentCount: number
  totalCount: number
  sundayMass: AttendanceTypeStats
  catechism: AttendanceTypeStats
  adoration: AttendanceTypeStats
}

export interface StudentReportCardViewModel {
  student: {
    id: string
    code: string
    holyName: string
    fullName: string
    dateOfBirth: string
    className: string
    parentName: string
    parentPhone: string
  }
  summary: {
    gpa: number | null
    gpaLabel: string
    attendanceRate: number
    presentMassCount: number
    totalMassCount: number
    classification: string
    attendanceDetails?: StudentAttendanceReportViewModel
  }
  grades: readonly GradeRowViewModel[]
  options: {
    academicYear: string
    parishName: string
    dioceseName: string
  }
}

export interface BatchReportViewModel {
  readonly classInfo?: { id: string; name: string }
  readonly reports: readonly StudentReportCardViewModel[]
}
