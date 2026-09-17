import type { Student, GradeRecord, AttendanceRecord, ReportCardDTO } from '../types'
import type { StudentReportCardViewModel, BatchReportViewModel, GradeRowViewModel } from '../types/reportViewModel'
import { calculateGradeAverage, calculateAttendanceRate, calculateYearlyGpa, countAttendancePresent, getClassificationLabel, type GradeWeightsConfig } from './grades'
import { normalizeAcademicYear, getCurrentAcademicYear } from './academicYear'
import { useClassStore } from '../stores/classStore'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { useSettingsStore } from '../stores/settingsStore'

export interface CreateReportViewModelParams {
  students: readonly Student[]
  grades: readonly GradeRecord[]
  attendance: readonly AttendanceRecord[]
  academicYear?: string
  parishName?: string
  dioceseName?: string
  classId?: string
}

export class ReportViewModelFactory {
  /**
   * Builds a printable/viewable model from the server CQRS projection without
   * recalculating GPA, classification, class membership or attendance from
   * mutable client state. Current profile contact fields remain presentation
   * data only and never influence academic results.
   */
  public static createOfficialStudentViewModel(
    report: ReportCardDTO,
    profile?: Pick<Student, 'parentName' | 'parentPhone'>,
    options?: { parishName?: string; dioceseName?: string },
  ): StudentReportCardViewModel {
    const gradeBySemester = new Map(report.grades.map((grade) => [grade.semester, grade]))
    const format = (value: number | null | undefined): string => value === null || value === undefined ? '-' : String(value)
    const gradeRows: GradeRowViewModel[] = [1, 2].map((semester) => {
      const grade = gradeBySemester.get(semester)
      return {
        semesterLabel: `Học Kỳ ${semester}`,
        scoreOral: format(grade?.scoreOral),
        score15m: format(grade?.score15m),
        score1Period: format(grade?.score1Period),
        scoreMidterm: format(grade?.scoreMidterm),
        scoreFinal: format(grade?.scoreFinal),
        scoreDaoDuc: format(grade?.scoreDaoDuc),
        gpaLabel: format(grade?.gpa),
        classification: grade?.classification || 'Chưa có',
      }
    })
    const attendance = report.attendanceSummary
    const massAbsent = Math.max(0, attendance.massTotalCount - attendance.massPresentCount)
    const catechismAbsent = Math.max(0, attendance.catechismTotalCount - attendance.catechismPresentCount)
    const totalPresent = attendance.massPresentCount + attendance.catechismPresentCount
    const totalCount = attendance.massTotalCount + attendance.catechismTotalCount

    return {
      student: {
        id: report.student.id,
        code: report.student.code,
        holyName: report.student.holyName || '',
        fullName: report.student.fullName,
        dateOfBirth: report.student.dateOfBirth || '',
        className: report.student.className || '',
        parentName: profile?.parentName || '',
        parentPhone: profile?.parentPhone || '',
      },
      summary: {
        gpa: report.yearSummary.gpa,
        gpaLabel: format(report.yearSummary.gpa),
        attendanceRate: attendance.overallAttendanceRate,
        presentMassCount: attendance.massPresentCount,
        totalMassCount: attendance.massTotalCount,
        classification: report.yearSummary.classification || 'Chưa có',
        attendanceDetails: {
          rate: attendance.overallAttendanceRate,
          presentCount: totalPresent,
          absentCount: massAbsent + catechismAbsent,
          totalCount,
          sundayMass: { present: attendance.massPresentCount, absent: massAbsent, total: attendance.massTotalCount },
          catechism: { present: attendance.catechismPresentCount, absent: catechismAbsent, total: attendance.catechismTotalCount },
          adoration: { present: 0, absent: 0, total: 0 },
        },
      },
      grades: Object.freeze(gradeRows),
      options: {
        academicYear: report.academicYear,
        parishName: options?.parishName || useSettingsStore.getState().settings.parishName || 'Giáo Xứ Gia Tôn',
        dioceseName: options?.dioceseName || useSettingsStore.getState().settings.dioceseName || 'Giáo Phận Xuân Lộc',
      },
    }
  }

  public static createStudentViewModel(
    student: Student,
    grades: readonly GradeRecord[],
    attendance: readonly AttendanceRecord[],
    options?: { academicYear?: string; parishName?: string; dioceseName?: string }
  ): StudentReportCardViewModel {
    const classInfo = useClassStore.getState().findClassById(student.classId)
    // ADR-017: Năm học luôn chuẩn hóa 'YYYY-YYYY' + fallback currentYear/năm hiện
    // tại. Trước đây exact-match `g.academicYear === year` với year rỗng hoặc
    // 'YYYY - YYYY' → bảng điểm trống trong phiếu hàng loạt.
    const year = normalizeAcademicYear(options?.academicYear || useAcademicYearStore.getState().currentYear) || getCurrentAcademicYear()
    // ADR-017 (F2): Attendance luôn được giới hạn theo năm học — ưu tiên
    // academic_years từ server, fallback mặc định tháng 8 (khớp server).
    const range = useAcademicYearStore.getState().getYearRange(year)
    const yearStart = range.startDate
    const yearEnd = range.endDate

    // ADR-017 (F3): Dùng trọng số giáo xứ (settings.gradeWeights) cho mọi phép
    // tính GPA — trước đây chỉ DesktopGradeMatrix đọc settings, phần còn lại
    // hardcode DEFAULT_GRADE_WEIGHTS → GPA/xếp loại lệch giữa các màn hình.
    const gradeWeights: GradeWeightsConfig = useSettingsStore.getState().settings.gradeWeights

    const studentGrades = grades.filter((g) => g.studentId === student.id && normalizeAcademicYear(g.academicYear) === year)
    const sem1Grade = studentGrades.find((g) => g.semester === 1)
    const sem2Grade = studentGrades.find((g) => g.semester === 2)

    const sem1Res = sem1Grade ? calculateGradeAverage(sem1Grade, gradeWeights) : { score: null, label: 'Chưa có' }
    const sem2Res = sem2Grade ? calculateGradeAverage(sem2Grade, gradeWeights) : { score: null, label: 'Chưa có' }

    const gradeRows: GradeRowViewModel[] = [
      {
        semesterLabel: 'Học Kỳ 1',
        scoreOral: sem1Grade?.scoreOral !== null && sem1Grade?.scoreOral !== undefined ? String(sem1Grade.scoreOral) : '-',
        score15m: sem1Grade?.score15m !== null && sem1Grade?.score15m !== undefined ? String(sem1Grade.score15m) : '-',
        score1Period: sem1Grade?.score1Period !== null && sem1Grade?.score1Period !== undefined ? String(sem1Grade.score1Period) : '-',
        scoreMidterm: sem1Grade?.scoreMidterm !== null && sem1Grade?.scoreMidterm !== undefined ? String(sem1Grade.scoreMidterm) : '-',
        scoreFinal: sem1Grade?.scoreFinal !== null && sem1Grade?.scoreFinal !== undefined ? String(sem1Grade.scoreFinal) : '-',
        scoreDaoDuc: sem1Grade?.scoreDaoDuc !== null && sem1Grade?.scoreDaoDuc !== undefined ? String(sem1Grade.scoreDaoDuc) : '-',
        gpaLabel: sem1Res.score !== null ? sem1Res.score.toFixed(gradeWeights.roundingDecimal) : '-',
        classification: sem1Res.label,
      },
      {
        semesterLabel: 'Học Kỳ 2',
        scoreOral: sem2Grade?.scoreOral !== null && sem2Grade?.scoreOral !== undefined ? String(sem2Grade.scoreOral) : '-',
        score15m: sem2Grade?.score15m !== null && sem2Grade?.score15m !== undefined ? String(sem2Grade.score15m) : '-',
        score1Period: sem2Grade?.score1Period !== null && sem2Grade?.score1Period !== undefined ? String(sem2Grade.score1Period) : '-',
        scoreMidterm: sem2Grade?.scoreMidterm !== null && sem2Grade?.scoreMidterm !== undefined ? String(sem2Grade.scoreMidterm) : '-',
        scoreFinal: sem2Grade?.scoreFinal !== null && sem2Grade?.scoreFinal !== undefined ? String(sem2Grade.scoreFinal) : '-',
        scoreDaoDuc: sem2Grade?.scoreDaoDuc !== null && sem2Grade?.scoreDaoDuc !== undefined ? String(sem2Grade.scoreDaoDuc) : '-',
        gpaLabel: sem2Res.score !== null ? sem2Res.score.toFixed(gradeWeights.roundingDecimal) : '-',
        classification: sem2Res.label,
      },
    ]

    const studentAtt = attendance.filter(
      (a) => a.studentId === student.id && a.date >= yearStart && a.date <= yearEnd
    )
    // ADR-017 (F3): ExcusedWeight từ attendancePolicy (khớp server
    // AttendanceRateSpecification) — trước đây đếm AbsentExcused full 1.0 bất kể
    // parish cấu hình excusedWeight < 1 → tỷ lệ lệch giữa phiếu điểm và server.
    const { settings } = useSettingsStore.getState()
    const excusedWeight = settings.attendancePolicy?.excusedWeight ?? 1.0
    const presentCount = countAttendancePresent(studentAtt, excusedWeight)
    const attRes = calculateAttendanceRate(presentCount, studentAtt.length)

    // Calculate 3-pillar breakdown: SundayMass, CatechismClass, EucharisticAdoration
    const massRecords = studentAtt.filter((a) => a.type === 'SundayMass' || !a.type)
    const catechismRecords = studentAtt.filter((a) => a.type === 'CatechismClass')
    const adorationRecords = studentAtt.filter((a) => a.type === 'EucharisticAdoration')

    const massPresent = countAttendancePresent(massRecords, excusedWeight)
    const catechismPresent = countAttendancePresent(catechismRecords, excusedWeight)
    const adorationPresent = countAttendancePresent(adorationRecords, excusedWeight)

    const attendanceDetails = {
      rate: attRes.rate,
      presentCount: presentCount,
      absentCount: studentAtt.length - presentCount,
      totalCount: studentAtt.length,
      sundayMass: {
        present: massPresent,
        absent: massRecords.length - massPresent,
        total: massRecords.length,
      },
      catechism: {
        present: catechismPresent,
        absent: catechismRecords.length - catechismPresent,
        total: catechismRecords.length,
      },
      adoration: {
        present: adorationPresent,
        absent: adorationRecords.length - adorationPresent,
        total: adorationRecords.length,
      },
    }

    // ADR-017 (F4): GPA cả năm dùng roundToDecimal theo roundingDecimal của
    // parish (không hardcode toFixed(1)) — khớp server evaluateStudentWithData.
    const yearResult = calculateYearlyGpa(sem1Res.score, sem2Res.score, gradeWeights)
    const yearGpa = yearResult.gpa
    const isProvisional = yearResult.isProvisional

    // ADR-016: Delegate classification thresholds to the shared helper so this
    // factory never drifts from calculateGradeAverage / pdfGenerator.
    let overallClass = 'Chưa có'
    if (yearGpa !== null) {
      overallClass = getClassificationLabel(yearGpa, gradeWeights)
      if (isProvisional) {
        overallClass += ' (Tạm tính)'
      }
    }

    return {
      student: {
        id: student.id,
        code: student.code,
        holyName: student.holyName || '',
        fullName: student.fullName,
        dateOfBirth: student.dateOfBirth || '',
        className: classInfo?.name || student.classId,
        parentName: student.parentName || '',
        parentPhone: student.parentPhone || '',
      },
      summary: {
        gpa: yearGpa,
        gpaLabel: yearGpa !== null ? yearGpa.toFixed(gradeWeights.roundingDecimal) : '-',
        attendanceRate: attRes.rate,
        presentMassCount: presentCount,
        totalMassCount: studentAtt.length,
        classification: overallClass,
        attendanceDetails,
      },
      grades: Object.freeze(gradeRows),
      options: {
        academicYear: year,
        parishName: options?.parishName || useSettingsStore.getState().settings.parishName || 'Giáo Xứ Gia Tôn',
        dioceseName: options?.dioceseName || useSettingsStore.getState().settings.dioceseName || 'Giáo Phận Xuân Lộc',
      },
    }
  }

  public static createBatchViewModel(params: CreateReportViewModelParams): BatchReportViewModel {
    const { students, grades, attendance, academicYear, parishName, dioceseName, classId } = params
    const activeStudents = students.filter((s) => !s.deletedAt && (!classId || classId === 'all' || s.classId === classId))

    // Pre-indexing grades & attendance for O(N) linear performance
    const gradesByStudent = new Map<string, GradeRecord[]>()
    for (const g of grades) {
      const list = gradesByStudent.get(g.studentId) || []
      list.push(g)
      gradesByStudent.set(g.studentId, list)
    }

    const attendanceByStudent = new Map<string, AttendanceRecord[]>()
    for (const a of attendance) {
      const list = attendanceByStudent.get(a.studentId) || []
      list.push(a)
      attendanceByStudent.set(a.studentId, list)
    }

    const reports: StudentReportCardViewModel[] = activeStudents.map((s) => {
      const sGrades = gradesByStudent.get(s.id) || []
      const sAttendance = attendanceByStudent.get(s.id) || []
      return ReportViewModelFactory.createStudentViewModel(s, sGrades, sAttendance, { academicYear, parishName, dioceseName })
    })

    const classObj = classId && classId !== 'all' ? useClassStore.getState().findClassById(classId) : undefined

    return {
      classInfo: classObj ? { id: classObj.id, name: classObj.name } : undefined,
      reports: Object.freeze(reports),
    }
  }
}
