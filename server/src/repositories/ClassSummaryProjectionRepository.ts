import { db } from '../db/index.js'
import { students, classes, grades, attendance, promotionRecords } from '../db/schema.js'
import { eq, and, isNull, inArray, gte, lte } from 'drizzle-orm'
import { computeWeightedGpa } from '../utils/gradeCalculation.js'
import { getAcademicYearDateRange } from '../services/academicYearService.js'
import { getParishGradeWeights, getParishAttendancePolicy } from '../services/parishSettingsService.js'

export interface ClassStudentSummaryDTO {
  studentId: string
  code: string
  holyName?: string | null
  fullName: string
  gpa: number
  attendanceRate: number
  promotionStatus?: string | null
}

export interface ClassSummaryDTO {
  classId: string
  className: string
  academicYear: string
  totalStudents: number
  promotedCount: number
  retainedCount: number
  transferredCount: number
  averageGpa: number
  averageAttendanceRate: number
  students: ClassStudentSummaryDTO[]
}

export class ClassSummaryProjectionRepository {
  /**
   * CQRS Read Projection: Fetch Class Academic & Attendance Roster Summary
   */
  public async getClassSummary(
    classId: string,
    academicYear: string,
    parishId: string
  ): Promise<ClassSummaryDTO | null> {
    // 1. Fetch Class Info
    const [classRow] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.parishId, parishId)))
      .limit(1)

    if (!classRow) return null

    // 2. Fetch Roster Students (excluding soft-deleted)
    const studentRows = await db
      .select()
      .from(students)
      .where(and(eq(students.classId, classId), eq(students.parishId, parishId), isNull(students.deletedAt)))

    if (studentRows.length === 0) {
      return {
        classId,
        className: classRow.name,
        academicYear,
        totalStudents: 0,
        promotedCount: 0,
        retainedCount: 0,
        transferredCount: 0,
        averageGpa: 0,
        averageAttendanceRate: 100,
        students: [],
      }
    }

    const studentIds = studentRows.map((s) => s.id)

    // 3. Batch Fetch All Grades, Attendance, and Promotion Records in O(1) Queries
    // ADR-017 (F3): Trọng số từ parish settings.
    const weights = await getParishGradeWeights(parishId)
    // F3: Attendance policy hoisted (tránh N+1 trong vòng lặp roster).
    const attendancePolicy = await getParishAttendancePolicy(parishId)
    const excusedWeight = Math.min(Math.max(attendancePolicy.excusedWeight, 0), 1)

    const allGrades = await db
      .select()
      .from(grades)
      .where(
        and(
          inArray(grades.studentId, studentIds),
          eq(grades.academicYear, academicYear),
          eq(grades.parishId, parishId)
        )
      )

    // ADR-017 (F2): Attendance giới hạn theo năm học đang xét — trước đây đếm
    // all-time làm lệch tỷ lệ chuyên cần trong báo cáo lớp.
    const range = await getAcademicYearDateRange(parishId, academicYear)
    const allAttendance = await db
      .select()
      .from(attendance)
      .where(and(
        inArray(attendance.studentId, studentIds),
        eq(attendance.parishId, parishId),
        gte(attendance.date, range.startDate),
        lte(attendance.date, range.endDate)
      ))

    const allPromotions = await db
      .select()
      .from(promotionRecords)
      .where(
        and(
          inArray(promotionRecords.studentId, studentIds),
          eq(promotionRecords.academicYear, academicYear),
          eq(promotionRecords.parishId, parishId),
          eq(promotionRecords.status, 'ACTIVE')
        )
      )

    // Grouping by studentId
    const gradesByStudent = new Map<string, typeof allGrades>()
    for (const g of allGrades) {
      const list = gradesByStudent.get(g.studentId) || []
      list.push(g)
      gradesByStudent.set(g.studentId, list)
    }

    const attendanceByStudent = new Map<string, typeof allAttendance>()
    for (const a of allAttendance) {
      const list = attendanceByStudent.get(a.studentId) || []
      list.push(a)
      attendanceByStudent.set(a.studentId, list)
    }

    const promotionByStudent = new Map<string, typeof allPromotions[0]>()
    for (const p of allPromotions) {
      promotionByStudent.set(p.studentId, p)
    }

    const roster: ClassStudentSummaryDTO[] = []
    let totalGpaSum = 0
    let totalAttendanceSum = 0
    let promotedCount = 0
    let retainedCount = 0
    let transferredCount = 0

    for (const s of studentRows) {
      const gradeRows = gradesByStudent.get(s.id) || []
      let studentGpas: number[] = []
      for (const g of gradeRows) {
        const semesterGpa = computeWeightedGpa(g, weights)
        if (typeof semesterGpa === 'number') studentGpas.push(semesterGpa)
      }
      // F4: Làm tròn theo roundingDecimal của parish — trước đây toFixed(2) cứng
      // (8.89) lệch với mọi nơi khác (0.1) và với client (roundingDecimal settings).
      const rounding = Number(weights.roundingDecimal ?? 1)
      const gpaFactor = Math.pow(10, rounding)
      const gpa = studentGpas.length > 0 ? Math.round((studentGpas.reduce((a, b) => a + b, 0) / studentGpas.length) * gpaFactor) / gpaFactor : 0.0

      const attRows = attendanceByStudent.get(s.id) || []
      // F3: Rate dùng excusedWeight từ attendancePolicy (khớp ReportCardProjection).
      const presentCount = attRows.reduce((acc, a) => {
        if (a.status === 'Present') return acc + 1
        if (a.status === 'AbsentExcused') return acc + excusedWeight
        return acc
      }, 0)
      const attRate = attRows.length > 0 ? Number(((presentCount / attRows.length) * 100).toFixed(1)) : 100.0

      const prm = promotionByStudent.get(s.id)
      const status = prm ? prm.finalDecision : null
      // ADR-016: Count TRANSFERRED so promoted+retained+transferred == totalStudents
      // for classes where some students transferred mid-year.
      if (status === 'PROMOTED' || status === 'GRADUATED' || status === 'CONDITIONALLY_PROMOTED') {
        promotedCount++
      } else if (status === 'RETAINED') {
        retainedCount++
      } else if (status === 'TRANSFERRED') {
        transferredCount++
      }

      totalGpaSum += gpa
      totalAttendanceSum += attRate

      roster.push({
        studentId: s.id,
        code: s.code,
        holyName: s.holyName,
        fullName: s.fullName,
        gpa,
        attendanceRate: attRate,
        promotionStatus: status,
      })
    }

    const total = studentRows.length
    const averageGpa = total > 0 ? Number((totalGpaSum / total).toFixed(2)) : 0.0
    const averageAttendanceRate = total > 0 ? Number((totalAttendanceSum / total).toFixed(1)) : 100.0

    return {
      classId,
      className: classRow.name,
      academicYear,
      totalStudents: total,
      promotedCount,
      retainedCount,
      transferredCount,
      averageGpa,
      averageAttendanceRate,
      students: roster,
    }
  }
}

export const classSummaryProjectionRepository = new ClassSummaryProjectionRepository()
