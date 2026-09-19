import { students, classes, grades, attendance, promotionRecords, academicYearSnapshots, gradeOverrides } from '../db/schema.js'
import { eq, and, isNull, inArray, gte, lte } from 'drizzle-orm'
import { computeWeightedGpa, getClassificationLabel } from '../utils/gradeCalculation.js'
import { applyOverridesToGrade } from '../domain/GradeAggregate.js'
import type { ReportingProjectionContext } from './ReportCardProjectionRepository.js'
import { academicReportSnapshotSchema, historicalEvidenceRequired, parseHistoricalEvidence } from '../utils/academicYearHistory.js'
import { toCanonicalReportingYear } from '../utils/academicYear.js'

export interface ReportClassDTO {
  id: string
  name: string
  branchId: string | null
  academicYear: string
}

export interface ClassStudentSummaryDTO {
  studentId: string
  code: string
  holyName?: string | null
  fullName: string
  gender?: string | null
  dateOfBirth?: string | null
  gpa: number
  attendanceRate: number
  classification?: string | null
  promotionStatus?: string | null
  grades?: Array<{
    semester: number
    scoreOral?: number | null
    score15m?: number | null
    score1Period?: number | null
    scoreMidterm?: number | null
    scoreFinal?: number | null
    scoreDaoDuc?: number | null
    gpa?: number | null
    classification?: string | null
  }>
}

export interface ClassSummaryDTO {
  classId: string
  className: string
  branchId: string | null
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
  public async listClasses(
    academicYear: string,
    parishId: string,
    context: ReportingProjectionContext,
  ): Promise<ReportClassDTO[]> {
    if (context.finalizedYear) {
      return context.finalizedYear.policy.classes.map((item) => ({
        id: item.id,
        name: item.name,
        branchId: item.branchId || null,
        academicYear,
      }))
    }
    const rows = await context.executor.select({
      id: classes.id,
      name: classes.name,
      branchId: classes.branchId,
      academicYear: classes.academicYearId,
    }).from(classes).where(and(eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    return rows
      // Label-only comparison: legacy prefixed class IDs (e.g. `AY-2025-2026`)
      // map to the canonical reporting year for display grouping; the row's
      // persisted identity is untouched.
      .filter((item) => toCanonicalReportingYear(item.academicYear) === academicYear)
      .map((item) => ({ ...item, branchId: item.branchId || null, academicYear }))
  }

  /**
   * CQRS Read Projection: Fetch Class Academic & Attendance Roster Summary
   */
  public async getClassSummary(
    classId: string,
    academicYear: string,
    parishId: string,
    context: ReportingProjectionContext,
  ): Promise<ClassSummaryDTO | null> {
    const { executor, gradeWeights, attendancePolicy, classificationThresholds, academicYearRange } = context
    // 1. Fetch Class Info
    const [classRow] = await executor
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.parishId, parishId)))
      .limit(1)

    if (!classRow) return null

    if (context.finalizedYear) {
      const { yearId, policy } = context.finalizedYear
      const sourceClass = policy.classes.find(c => c.id === classId)
      if (!sourceClass) return null
      const snapshots = await executor.select().from(academicYearSnapshots).where(and(
        eq(academicYearSnapshots.parishId, parishId), eq(academicYearSnapshots.academicYearId, yearId),
      ))
      if (snapshots.some(s => !s.sourceClassId || !policy.classes.some(c => c.id === s.sourceClassId))) throw historicalEvidenceRequired()
      const cohort = snapshots.filter(s => s.sourceClassId === classId)
      const ids = cohort.map(s => s.studentId)
      const profiles = ids.length ? await executor.select().from(students).where(and(
        eq(students.parishId, parishId), inArray(students.id, ids), isNull(students.deletedAt),
      )) : []
      const promotions = ids.length ? await executor.select().from(promotionRecords).where(and(
        eq(promotionRecords.parishId, parishId), inArray(promotionRecords.studentId, ids),
        eq(promotionRecords.academicYear, academicYear), eq(promotionRecords.status, 'ACTIVE'),
      )) : []
      const roster: ClassStudentSummaryDTO[] = profiles.map(s => {
        const snapshot = cohort.find(row => row.studentId === s.id)!
        if (snapshot.attendanceRate === null) throw historicalEvidenceRequired()
        const frozen = parseHistoricalEvidence(academicReportSnapshotSchema, snapshot.reportSnapshot)
        return {
          studentId: s.id,
          code: s.code,
          holyName: s.holyName,
          fullName: s.fullName,
          gender: s.gender,
          dateOfBirth: s.dateOfBirth,
          gpa: snapshot.yearGpa ?? 0,
          attendanceRate: snapshot.attendanceRate,
          classification: snapshot.classification ?? (snapshot.yearGpa !== null ? getClassificationLabel(snapshot.yearGpa, policy.classificationThresholds) : null),
          promotionStatus: promotions.find(p => p.studentId === s.id)?.finalDecision ?? snapshot.promotionStatus,
          grades: (frozen.grades || []).map(grade => ({
            semester: grade.semester,
            scoreOral: grade.scoreOral ?? null,
            score15m: grade.score15m ?? null,
            score1Period: grade.score1Period ?? null,
            scoreMidterm: grade.scoreMidterm ?? null,
            scoreFinal: grade.scoreFinal ?? null,
            scoreDaoDuc: grade.scoreDaoDuc ?? null,
            gpa: grade.gpa ?? null,
            classification: grade.gpa === null || grade.gpa === undefined ? null : getClassificationLabel(grade.gpa, policy.classificationThresholds),
          })),
        }
      })
      return {
        classId, className: sourceClass.name, branchId: sourceClass.branchId || null, academicYear, totalStudents: roster.length,
        promotedCount: roster.filter(s => ['PROMOTED', 'GRADUATED', 'CONDITIONALLY_PROMOTED'].includes(s.promotionStatus || '')).length,
        retainedCount: roster.filter(s => s.promotionStatus === 'RETAINED').length,
        transferredCount: roster.filter(s => s.promotionStatus === 'TRANSFERRED').length,
        averageGpa: roster.length ? Number((roster.reduce((sum, s) => sum + s.gpa, 0) / roster.length).toFixed(2)) : 0,
        averageAttendanceRate: roster.length ? Number((roster.reduce((sum, s) => sum + s.attendanceRate, 0) / roster.length).toFixed(1)) : 100,
        students: roster,
      }
    }

    // 2. Fetch Roster Students (excluding soft-deleted)
    const studentRows = await executor
      .select()
      .from(students)
      .where(and(eq(students.classId, classId), eq(students.parishId, parishId), isNull(students.deletedAt)))

    if (studentRows.length === 0) {
      return {
        classId,
        className: classRow.name,
        branchId: classRow.branchId || null,
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
    // F3: Attendance policy hoisted (tránh N+1 trong vòng lặp roster).
    const excusedWeight = Math.min(Math.max(attendancePolicy.excusedWeight, 0), 1)

    const allGrades = await executor
      .select()
      .from(grades)
      .where(
        and(
          inArray(grades.studentId, studentIds),
          eq(grades.academicYear, academicYear),
          eq(grades.parishId, parishId)
        )
      )

    const gradeIds = allGrades.map((g) => g.id)
    const allOverrides = gradeIds.length > 0 ? await executor
      .select()
      .from(gradeOverrides)
      .where(
        and(
          inArray(gradeOverrides.gradeId, gradeIds),
          eq(gradeOverrides.parishId, parishId),
          isNull(gradeOverrides.deletedAt)
        )
      ) : []

    const overridesByGradeId = new Map<string, typeof allOverrides>()
    for (const o of allOverrides) {
      const list = overridesByGradeId.get(o.gradeId) || []
      list.push(o)
      overridesByGradeId.set(o.gradeId, list)
    }

    // ADR-017 (F2): Attendance giới hạn theo năm học đang xét — trước đây đếm
    // all-time làm lệch tỷ lệ chuyên cần trong báo cáo lớp.
    const allAttendance = await executor
      .select()
      .from(attendance)
      .where(and(
        inArray(attendance.studentId, studentIds),
        eq(attendance.parishId, parishId),
        gte(attendance.date, academicYearRange.startDate),
        lte(attendance.date, academicYearRange.endDate)
      ))

    const allPromotions = await executor
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
      const studentGrades: NonNullable<ClassStudentSummaryDTO['grades']> = []

      for (const g of gradeRows) {
        const gradeOverridesList = overridesByGradeId.get(g.id) || []
        const effectiveGrade = applyOverridesToGrade(g as any, gradeOverridesList as any[])
        const semesterGpa = computeWeightedGpa(effectiveGrade as any, gradeWeights)
        if (typeof semesterGpa === 'number') studentGpas.push(semesterGpa)
        studentGrades.push({
          semester: effectiveGrade.semester!,
          scoreOral: effectiveGrade.scoreOral ?? null,
          score15m: effectiveGrade.score15m ?? null,
          score1Period: effectiveGrade.score1Period ?? null,
          scoreMidterm: effectiveGrade.scoreMidterm ?? null,
          scoreFinal: effectiveGrade.scoreFinal ?? null,
          scoreDaoDuc: effectiveGrade.scoreDaoDuc ?? null,
          gpa: semesterGpa,
          classification: semesterGpa === null ? null : getClassificationLabel(semesterGpa, classificationThresholds),
        })
      }
      // F4: Làm tròn theo roundingDecimal của parish — trước đây toFixed(2) cứng
      // (8.89) lệch với mọi nơi khác (0.1) và với client (roundingDecimal settings).
      const rounding = Number(gradeWeights.roundingDecimal ?? 1)
      const gpaFactor = Math.pow(10, rounding)
      const gpa = studentGpas.length > 0 ? Math.round((studentGpas.reduce((a, b) => a + b, 0) / studentGpas.length) * gpaFactor) / gpaFactor : 0.0
      const classification = studentGpas.length > 0 ? getClassificationLabel(gpa, classificationThresholds) : null

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
        gender: s.gender,
        dateOfBirth: s.dateOfBirth,
        gpa,
        attendanceRate: attRate,
        classification,
        promotionStatus: status,
        grades: studentGrades,
      })
    }

    const total = studentRows.length
    const averageGpa = total > 0 ? Number((totalGpaSum / total).toFixed(2)) : 0.0
    const averageAttendanceRate = total > 0 ? Number((totalAttendanceSum / total).toFixed(1)) : 100.0

    return {
      classId,
      className: classRow.name,
      branchId: classRow.branchId || null,
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
