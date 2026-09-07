import type { DbExecutor } from '../db/index.js'
import { students, classes, grades, attendance, promotionRecords, gradeOverrides, academicYearSnapshots } from '../db/schema.js'
import { eq, and, isNull, gte, lte, inArray } from 'drizzle-orm'
import { computeWeightedGpa, type GradeWeightsConfig } from '../utils/gradeCalculation.js'
import { applyOverridesToGrade } from '../domain/GradeAggregate.js'
import { academicReportSnapshotSchema, historicalEvidenceRequired, parseHistoricalEvidence, type FinalizationPolicy } from '../utils/academicYearHistory.js'

export interface ReportingProjectionContext {
  finalizedYear?: { yearId: string; policy: FinalizationPolicy }
  executor: DbExecutor
  gradeWeights: GradeWeightsConfig
  attendancePolicy: { excusedWeight: number }
  academicYearRange: { startDate: string; endDate: string }
}

export interface ReportCardDTO {
  student: {
    id: string
    code: string
    holyName?: string | null
    fullName: string
    gender?: string | null
    dateOfBirth?: string | null
    className?: string | null
  }
  academicYear: string
  grades: Array<{
    semester: number
    scoreOral?: number | null
    score15m?: number | null
    score1Period?: number | null
    scoreMidterm?: number | null
    scoreFinal?: number | null
    gpa?: number | null
  }>
  attendanceSummary: {
    massPresentCount: number
    massTotalCount: number
    catechismPresentCount: number
    catechismTotalCount: number
    overallAttendanceRate: number
  }
  promotion?: {
    status: string
    gpa: number
    attendanceRate: number
    isOverridden: boolean
    overrideReason?: string | null
    approvedAt?: string | null
  } | null
}

export class ReportCardProjectionRepository {
  /**
   * CQRS Read Projection: Fetch comprehensive Student Report Card (0 Mutations, 0 Aggregates)
   */
  public async getStudentReportCard(
    studentId: string,
    academicYear: string,
    parishId: string,
    context: ReportingProjectionContext,
  ): Promise<ReportCardDTO | null> {
    const { executor, gradeWeights, attendancePolicy, academicYearRange } = context
    // 1. Fetch Student Profile (excluding soft-deleted)
    const [studentRow] = await executor
      .select({
        id: students.id,
        code: students.code,
        holyName: students.holyName,
        fullName: students.fullName,
        gender: students.gender,
        dateOfBirth: students.dateOfBirth,
        className: classes.name,
      })
      .from(students)
      .leftJoin(classes, and(eq(students.classId, classes.id), eq(students.parishId, classes.parishId), eq(classes.parishId, parishId)))
      .where(and(eq(students.id, studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
      .limit(1)

    if (!studentRow) return null

    if (context.finalizedYear) {
      const { yearId, policy } = context.finalizedYear
      const [snapshot] = await executor.select().from(academicYearSnapshots).where(and(
        eq(academicYearSnapshots.parishId, parishId), eq(academicYearSnapshots.studentId, studentId),
        eq(academicYearSnapshots.academicYearId, yearId),
      )).limit(1)
      if (!snapshot) return null // Not in the frozen academic cohort.
      const sourceClass = policy.classes.find(c => c.id === snapshot.sourceClassId)
      if (!sourceClass) throw historicalEvidenceRequired()
      const frozen = parseHistoricalEvidence(academicReportSnapshotSchema, snapshot.reportSnapshot)
      const [promotion] = await executor.select().from(promotionRecords).where(and(
        eq(promotionRecords.parishId, parishId), eq(promotionRecords.studentId, studentId),
        eq(promotionRecords.academicYear, academicYear), eq(promotionRecords.status, 'ACTIVE'),
      )).limit(1)
      return {
        student: { ...studentRow, className: sourceClass.name }, academicYear,
        grades: frozen.grades, attendanceSummary: frozen.attendanceSummary,
        promotion: promotion ? {
          status: promotion.finalDecision, gpa: promotion.gpaSnapshot, attendanceRate: promotion.attendanceSnapshot,
          isOverridden: !!promotion.isOverridden, overrideReason: promotion.overrideReason, approvedAt: promotion.approvedAt,
        } : null,
      }
    }

    // 2. Fetch Grade Rows
    const gradeRows = await executor
      .select()
      .from(grades)
      .where(
        and(
          eq(grades.studentId, studentId),
          eq(grades.academicYear, academicYear),
          eq(grades.parishId, parishId)
        )
      )

    // G-02: Load Active Grade Overrides for these gradeRows
    const gradeIds = gradeRows.map(g => g.id)
    const activeOverrides = gradeIds.length > 0 ? await executor
      .select()
      .from(gradeOverrides)
      .where(
        and(
          inArray(gradeOverrides.gradeId, gradeIds),
          eq(gradeOverrides.parishId, parishId),
          isNull(gradeOverrides.deletedAt)
        )
      ) : []

    // ADR-017 (F3): Trọng số từ parish settings.
    const formattedGrades = gradeRows.map((g) => {
      // G-02: Apply overrides to raw grade fields to form effective grade
      // Casting to any to resolve pre-existing type mismatch between Drizzle row and GradeRecordDTO Partial
      const effectiveGrade = applyOverridesToGrade(g as any, activeOverrides as any[])
      const gpa = computeWeightedGpa(effectiveGrade as any, gradeWeights)

      return {
        semester: effectiveGrade.semester!,
        scoreOral: effectiveGrade.scoreOral,
        score15m: effectiveGrade.score15m,
        score1Period: effectiveGrade.score1Period,
        scoreMidterm: effectiveGrade.scoreMidterm,
        scoreFinal: effectiveGrade.scoreFinal,
        gpa,
      }
    })

    // 3. Fetch Attendance Summary — ADR-017 (F2): chỉ đếm attendance trong năm
    // học đang xét (trước đây đếm all-time → % lệch với client ReportViewModelFactory).
    const attendanceRows = await executor
      .select()
      .from(attendance)
      .where(and(
        eq(attendance.studentId, studentId),
        eq(attendance.parishId, parishId),
        gte(attendance.date, academicYearRange.startDate),
        lte(attendance.date, academicYearRange.endDate)
      ))

    const massRows = attendanceRows.filter((a) => a.type === 'SundayMass')
    const massPresent = massRows.filter((a) => a.status === 'Present' || a.status === 'AbsentExcused').length

    const catechismRows = attendanceRows.filter((a) => a.type === 'CatechismClass')
    const catechismPresent = catechismRows.filter((a) => a.status === 'Present' || a.status === 'AbsentExcused').length

    const totalSessions = attendanceRows.length
    // F3: Rate dùng excusedWeight từ attendancePolicy (giống AttendanceRateSpecification
    // & client RecreationFactory) — count fields vẫn là số raw cho hiển thị.
    const excusedWeight = Math.min(Math.max(attendancePolicy.excusedWeight, 0), 1)
    const totalPresent = attendanceRows.reduce((acc, a) => {
      if (a.status === 'Present') return acc + 1
      if (a.status === 'AbsentExcused') return acc + excusedWeight
      return acc
    }, 0)
    const overallRate = totalSessions > 0 ? Number(((totalPresent / totalSessions) * 100).toFixed(1)) : 100.0

    // 4. Fetch Promotion Snapshot Record
    const [prmRow] = await executor
      .select()
      .from(promotionRecords)
      .where(
        and(
          eq(promotionRecords.studentId, studentId),
          eq(promotionRecords.academicYear, academicYear),
          eq(promotionRecords.parishId, parishId),
          eq(promotionRecords.status, 'ACTIVE')
        )
      )
      .limit(1)

    return {
      student: studentRow,
      academicYear,
      grades: formattedGrades,
      attendanceSummary: {
        massPresentCount: massPresent,
        massTotalCount: massRows.length,
        catechismPresentCount: catechismPresent,
        catechismTotalCount: catechismRows.length,
        overallAttendanceRate: overallRate,
      },
      promotion: prmRow
        ? {
            status: prmRow.finalDecision,
            gpa: prmRow.gpaSnapshot,
            attendanceRate: prmRow.attendanceSnapshot,
            isOverridden: !!prmRow.isOverridden,
            overrideReason: prmRow.overrideReason,
            approvedAt: prmRow.approvedAt,
          }
        : null,
    }
  }
}

export const reportCardProjectionRepository = new ReportCardProjectionRepository()
