import { db, runDbTransaction, type DbExecutor, type DbTransaction } from '../db/index.js'
import {
  academicYears,
  academicYearSnapshots,
  assessments,
  attendance,
  attendanceSessions,
  auditLogs,
  classes,
  gradeOverrides,
  grades,
  promotionRecords,
  semesterLocks,
  students,
} from '../db/schema.js'
import { eq, and, isNull, inArray, gte, lte, desc, sql } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { normalizeAcademicYear, computeAcademicYearDateRange, parseAcademicYear } from '../utils/academicYear.js'
import { computeWeightedGpa } from '../utils/gradeCalculation.js'
import { getClassificationLabel } from '../utils/gradeCalculation.js'
import { academicReportSnapshotSchema, finalizationPolicySchema } from '../utils/academicYearHistory.js'
import { applyOverridesToGrade } from '../domain/GradeAggregate.js'
import { getAcademicYearDateRange } from './academicYearService.js'
import { getParishGradeWeights, getParishAttendancePolicy, getParishPromotionPolicy, getParishClassificationThresholds } from './parishSettingsService.js'
import { drizzleSemesterLockRepository } from '../repositories/DrizzleSemesterLockRepository.js'
import { promotionApplicationService } from './PromotionApplicationService.js'
import { drizzlePromotionRepository, promotionCompletionPredicate } from '../repositories/DrizzlePromotionRepository.js'
import { resolveMembershipBranch } from './studentMembershipPolicy.js'
import { findNextClassInYear, branchTypeByWeight } from '../utils/promotionPath.js'
import {
  deriveAcademicYearStatus,
  deriveAcademicYearState,
  type AcademicYearStatus,
  type SemesterLockState,
} from '../domain/AcademicYearStatus.js'

export interface CompletenessIssue {
  code: string
  severity: 'error' | 'warning'
  label: string
  items: string[]
}

export interface CompletenessChecklist {
  yearId: string
  status: AcademicYearStatus
  ready: boolean
  totals: {
    classes: number
    students: number
    gradeRows: number
    openSessions: number
  }
  issues: CompletenessIssue[]
}

export interface FinalizeSummary {
  yearId: string
  status: AcademicYearStatus
  snapshotCount: number
  finalizedAt: string
}

export interface PromoteSummary {
  yearId: string
  nextYearId: string
  status: AcademicYearStatus
  total: number
  attempted: number
  movedToNextYear: number
  retained: number
  graduated: number
  errors: { studentId: string; reason: string }[]
  /**
   * PRM-F4 (audit 2026-08-21): học sinh KHÔNG được chuyển lớp nhưng cũng không
   * lỗi — trước đây im lặng (năm vẫn PROMOTED) khi lớp năm mới không có cùng
   * `code` hoặc HS không tìm thấy lớp nguồn. Giờ ghi rõ để admin xử lý thủ công.
   */
  warnings: { studentId: string; reason: string }[]
  unresolvedCount: number
}

export interface PromotionReconciliationItem {
  studentId: string
  promotionStatus: string | null
  reason: string
}

export interface PromotionReconciliation {
  yearId: string
  targetYearId: string | null
  total: number
  resolved: number
  unresolvedCount: number
  unresolved: PromotionReconciliationItem[]
}

function httpError(message: string, status: number): Error & { status: number; details?: unknown } {
  const err = new Error(message) as Error & { status: number; details?: unknown }
  err.status = status
  return err
}

function isEmptyGrade(g: { scoreOral: number | null; score15m: number | null; score1Period: number | null; scoreMidterm: number | null; scoreFinal: number | null } | undefined): boolean {
  if (!g) return true
  return (
    g.scoreOral === null && g.score15m === null && g.score1Period === null &&
    g.scoreMidterm === null && g.scoreFinal === null
  )
}

function computeAttendanceRate(
  rows: { status: string }[],
  excusedWeight: number
): number {
  if (rows.length === 0) return 100.0
  const present = rows.reduce((acc, a) => {
    if (a.status === 'Present') return acc + 1
    if (a.status === 'AbsentExcused') return acc + excusedWeight
    return acc
  }, 0)
  return Number(((present / rows.length) * 100).toFixed(1))
}

/**
 * Academic Year Lifecycle — orchestration cho state machine năm học:
 *   OPEN → SEMESTER_1_LOCKED → SEMESTER_2_OPEN → SEMESTER_2_LOCKED → FINALIZED → PROMOTED
 *
 * - Lock/Unlock học kỳ: dùng lại DrizzleSemesterLockRepository (không nhân bản).
 * - Finalize: checklist completeness → snapshot từng học sinh (GPA HK, GPA năm,
 *   xếp loại, chuyên cần, quyết định thăng tiến) → khóa năm học.
 * - Promote: sinh promotion_records (qua PromotionApplicationService — SSOT) và
 *   chuyển học sinh sang lớp năm học mới (copy lớp + assessments, KHÔNG copy điểm).
 */
export class AcademicYearLifecycleService {
  /**
   * Học kỳ đang mở của giáo xứ = current_semester của năm học hoạt động
   * (năm chưa Finalize, đang chứa ngày hôm nay; fallback năm chưa khóa mới nhất).
   * Dùng làm SSOT để giới hạn bộ lọc học kỳ cho tài khoản không phải admin.
   */
  public async getOpenSemester(parishId: string, executor: DbExecutor = db): Promise<1 | 2> {
    const now = new Date().toISOString()
    const [active] = await executor
      .select({ currentSemester: academicYears.currentSemester })
      .from(academicYears)
      .where(and(
        eq(academicYears.parishId, parishId),
        eq(academicYears.isLocked, 0),
        gte(academicYears.endDate, now),
        lte(academicYears.startDate, now),
      ))
      .orderBy(desc(academicYears.startDate))
      .limit(1)
    if (active) return active.currentSemester === 2 ? 2 : 1

    const [latest] = await executor
      .select({ currentSemester: academicYears.currentSemester })
      .from(academicYears)
      .where(and(
        eq(academicYears.parishId, parishId),
        eq(academicYears.isLocked, 0),
      ))
      .orderBy(desc(academicYears.startDate))
      .limit(1)
    if (latest) return latest.currentSemester === 2 ? 2 : 1
    return 1
  }

  public async listAcademicYears(parishId: string): Promise<any[]> {
    const yearRows = await db
      .select()
      .from(academicYears)
      .where(eq(academicYears.parishId, parishId))
      .orderBy(desc(academicYears.startDate))

    const lockRows = await db
      .select()
      .from(semesterLocks)
      .where(eq(semesterLocks.parishId, parishId))

    const lockMap = new Map<string, SemesterLockState>()
    for (const lock of lockRows) {
      const entry = lockMap.get(lock.academicYear) || { semester1Locked: false, semester2Locked: false }
      if (lock.semester === 1) entry.semester1Locked = lock.isLocked === 1
      if (lock.semester === 2) entry.semester2Locked = lock.isLocked === 1
      lockMap.set(lock.academicYear, entry)
    }

    const classCountRows = await db
      .select({ yearId: classes.academicYearId, count: sql<number>`count(*)` })
      .from(classes)
      .where(and(eq(classes.parishId, parishId), isNull(classes.deletedAt)))
      .groupBy(classes.academicYearId)

    const studentCountRows = await db
      .select({ yearId: classes.academicYearId, count: sql<number>`count(*)` })
      .from(students)
      // TENANT-F7 (audit 2026-08-21): join phải scope cả hai phía theo parish —
      // composite PK cho phép 2 giáo xứ trùng classes.id; thiếu predicate thì
      // count có thể khớp nhầm lớp của giáo xứ khác.
      .innerJoin(classes, and(
        eq(students.classId, classes.id),
        eq(classes.parishId, students.parishId),
      ))
      .where(and(eq(students.parishId, parishId), isNull(students.deletedAt)))
      .groupBy(classes.academicYearId)

    const snapshotCountRows = await db
      .select({ yearId: academicYearSnapshots.academicYearId, count: sql<number>`count(*)` })
      .from(academicYearSnapshots)
      .where(eq(academicYearSnapshots.parishId, parishId))
      .groupBy(academicYearSnapshots.academicYearId)

    const promotionCoverageRows = await db
      .select({
        yearId: academicYearSnapshots.academicYearId,
        studentId: academicYearSnapshots.studentId,
        promotionRecordId: promotionRecords.id,
      })
      .from(academicYearSnapshots)
      .innerJoin(academicYears, and(eq(academicYears.parishId, academicYearSnapshots.parishId), eq(academicYears.id, academicYearSnapshots.academicYearId)))
      .leftJoin(promotionRecords, and(
        eq(promotionRecords.parishId, academicYearSnapshots.parishId),
        eq(promotionRecords.studentId, academicYearSnapshots.studentId),
        eq(promotionRecords.academicYear, academicYearSnapshots.academicYearId),
        eq(promotionRecords.status, 'ACTIVE'),
        eq(promotionRecords.isLatest, 1),
        promotionCompletionPredicate(),
      ))
      .where(eq(academicYearSnapshots.parishId, parishId))

    const classCountMap = new Map(classCountRows.map((r) => [r.yearId, Number(r.count)]))
    const studentCountMap = new Map(studentCountRows.map((r) => [r.yearId, Number(r.count)]))
    const snapshotCountMap = new Map(snapshotCountRows.map((r) => [r.yearId, Number(r.count)]))
    const unresolvedPromotionCountMap = new Map<string, number>()
    for (const row of promotionCoverageRows) {
      if (!row.promotionRecordId) {
        unresolvedPromotionCountMap.set(row.yearId, (unresolvedPromotionCountMap.get(row.yearId) || 0) + 1)
      }
    }

    return yearRows.map((year) => {
      const locks = lockMap.get(year.id) || { semester1Locked: false, semester2Locked: false }
      const status = deriveAcademicYearStatus(year, locks)
      return {
        id: year.id,
        startDate: year.startDate,
        endDate: year.endDate,
        isLocked: year.isLocked,
        status,
        currentSemester: year.currentSemester,
        semesterLocks: locks,
        classCount: classCountMap.get(year.id) || 0,
        studentCount: studentCountMap.get(year.id) || 0,
        snapshotCount: snapshotCountMap.get(year.id) || 0,
        promotionTargetYearId: year.promotionTargetYearId || null,
        unresolvedPromotionCount: unresolvedPromotionCountMap.get(year.id) || 0,
        createdAt: year.createdAt,
        updatedAt: year.updatedAt,
      }
    })
  }

  private async getYearOrThrow(yearId: string, parishId: string, executor: DbExecutor = db) {
    const [year] = await executor
      .select()
      .from(academicYears)
      .where(and(eq(academicYears.id, yearId), eq(academicYears.parishId, parishId)))
      .limit(1)
    if (!year) throw httpError('Không tìm thấy năm học', 404)
    return year
  }

  /** Bước ① — Check Data Completeness (read-only, không ghi DB). */
  public async getCompletenessChecklist(yearId: string, parishId: string, executor: DbExecutor = db): Promise<CompletenessChecklist> {
    const year = await this.getYearOrThrow(yearId, parishId, executor)
    const hk1Locked = await drizzleSemesterLockRepository.isLocked(year.id, 1, parishId, executor)
    const hk2Locked = await drizzleSemesterLockRepository.isLocked(year.id, 2, parishId, executor)

    const classRows = await executor
      .select()
      .from(classes)
      .where(and(eq(classes.academicYearId, year.id), eq(classes.parishId, parishId), isNull(classes.deletedAt)))

    const classIds = classRows.map((c) => c.id)
    const studentRows = classIds.length > 0
      ? await executor
          .select()
          .from(students)
          .where(and(inArray(students.classId, classIds), eq(students.parishId, parishId), isNull(students.deletedAt)))
      : []

    const gradeRows = await executor
      .select()
      .from(grades)
      .where(and(eq(grades.academicYear, normalizeAcademicYear(year.id)), eq(grades.parishId, parishId)))

    const sessionRows = classIds.length > 0
      ? await executor
          .select()
          .from(attendanceSessions)
          .where(and(inArray(attendanceSessions.classId, classIds), eq(attendanceSessions.parishId, parishId)))
      : []
    const openSessions = sessionRows.filter((s) => s.status !== 'LOCKED')

    const gradeByStudentSem = new Map<string, { 1?: (typeof gradeRows)[number]; 2?: (typeof gradeRows)[number] }>()
    for (const g of gradeRows) {
      const entry = gradeByStudentSem.get(g.studentId) || {}
      entry[g.semester as 1 | 2] = g
      gradeByStudentSem.set(g.studentId, entry)
    }

    const studentsByClass = new Map<string, (typeof studentRows)[number][]>()
    for (const s of studentRows) {
      const list = studentsByClass.get(s.classId) || []
      list.push(s)
      studentsByClass.set(s.classId, list)
    }

    const issues: CompletenessIssue[] = []
    const activeStudents = studentRows.filter((s) => s.status === 'Đang học')
    const missingSem1 = activeStudents.filter((s) => isEmptyGrade(gradeByStudentSem.get(s.id)?.[1]))
    const missingSem2 = activeStudents.filter((s) => isEmptyGrade(gradeByStudentSem.get(s.id)?.[2]))
    const cannotClassify = activeStudents.filter(
      (s) => isEmptyGrade(gradeByStudentSem.get(s.id)?.[1]) || isEmptyGrade(gradeByStudentSem.get(s.id)?.[2])
    )

    if (missingSem1.length > 0) {
      issues.push({
        code: 'STUDENTS_MISSING_HK1_GRADES',
        severity: 'error',
        label: `Có ${missingSem1.length} học sinh chưa đủ điểm HK1`,
        items: missingSem1.slice(0, 30).map((s) => `${s.holyName} ${s.fullName} (${s.code})`),
      })
    }
    if (missingSem2.length > 0) {
      issues.push({
        code: 'STUDENTS_MISSING_HK2_GRADES',
        severity: 'error',
        label: `Có ${missingSem2.length} học sinh chưa đủ điểm HK2`,
        items: missingSem2.slice(0, 30).map((s) => `${s.holyName} ${s.fullName} (${s.code})`),
      })
    }
    if (cannotClassify.length > 0) {
      issues.push({
        code: 'STUDENTS_NOT_CLASSIFIED',
        severity: 'error',
        label: `Có ${cannotClassify.length} học sinh chưa đủ dữ liệu để xếp loại (thiếu điểm một học kỳ)`,
        items: cannotClassify.slice(0, 30).map((s) => `${s.holyName} ${s.fullName} (${s.code})`),
      })
    }

    for (const cls of classRows) {
      const clsStudents = studentsByClass.get(cls.id) || []
      const active = clsStudents.filter((s) => s.status === 'Đang học')
      const withoutSem1 = active.filter((s) => isEmptyGrade(gradeByStudentSem.get(s.id)?.[1]))
      const withoutSem2 = active.filter((s) => isEmptyGrade(gradeByStudentSem.get(s.id)?.[2]))
      if (active.length > 0 && withoutSem1.length === active.length) {
        issues.push({
          code: 'CLASS_WITHOUT_HK1_GRADES',
          severity: 'error',
          label: `Lớp ${cls.name} chưa có điểm HK1 cho học sinh nào`,
          items: [cls.name],
        })
      }
      if (active.length > 0 && withoutSem2.length === active.length) {
        issues.push({
          code: 'CLASS_WITHOUT_HK2_GRADES',
          severity: 'error',
          label: `Lớp ${cls.name} chưa có điểm HK2 cho học sinh nào`,
          items: [cls.name],
        })
      }
    }

    if (openSessions.length > 0) {
      issues.push({
        code: 'ATTENDANCE_SESSIONS_OPEN',
        severity: 'warning',
        label: `Có ${openSessions.length} buổi điểm danh chưa chốt (trạng thái khác LOCKED)`,
        items: openSessions.slice(0, 30).map((s) => `${s.date} ${s.type === 'SundayMass' ? 'Đi lễ' : 'Học giáo lý'}`),
      })
    }

    return {
      yearId: year.id,
      status: deriveAcademicYearStatus(year, {
        semester1Locked: hk1Locked,
        semester2Locked: hk2Locked,
      }),
      ready: issues.every((i) => i.severity !== 'error'),
      totals: {
        classes: classRows.length,
        students: studentRows.length,
        gradeRows: gradeRows.length,
        openSessions: openSessions.length,
      },
      issues,
    }
  }

  /** Bước ② — Start Semester 2 (yêu cầu HK1 đã khóa). */
  public async startSemester2(yearId: string, userId: string, parishId: string): Promise<{ yearId: string; currentSemester: number }> {
    const year = await this.getYearOrThrow(yearId, parishId)
    if (year.isLocked === 1) {
      throw httpError(`Năm học ${year.id} đã chốt sổ, không thể chuyển học kỳ`, 403)
    }
    const hk1Locked = await drizzleSemesterLockRepository.isLocked(year.id, 1, parishId)
    if (!hk1Locked) {
      throw httpError(`Phải khóa sổ điểm HK1 của năm học ${year.id} trước khi bắt đầu HK2`, 403)
    }
    if (year.currentSemester === 2) {
      return { yearId: year.id, currentSemester: 2 }
    }
    const now = new Date().toISOString()
    await runDbTransaction(async (tx) => {
      await tx
        .update(academicYears)
        .set({ currentSemester: 2, updatedAt: now, updatedBy: userId })
        .where(and(eq(academicYears.id, year.id), eq(academicYears.parishId, parishId)))
      await this.writeAuditLog(
        'START_SEMESTER_2',
        'academic_year',
        year.id,
        null,
        JSON.stringify({ currentSemester: 2 }),
        userId,
        parishId,
        tx,
      )
    })
    return { yearId: year.id, currentSemester: 2 }
  }

  /** Bước ③ — Finalize Academic Year: checklist → snapshot → khóa năm học. */
  public async finalizeYear(yearId: string, userId: string, parishId: string): Promise<FinalizeSummary> {
    const { finalizedYearId, snapshotCount, finalizedAt } = await runDbTransaction(async (tx: DbTransaction) => {
      // AYL-07 (architecture audit 2026-09-04): toàn bộ guard, completeness,
      // source reads, policy/specification evaluation và writes dùng cùng tx.
      // Transaction vì vậy bảo vệ cả input snapshot lẫn output, không chỉ vòng
      // upsert + year lock như remediation AYL-03 trước đây.
      const year = await this.getYearOrThrow(yearId, parishId, tx)
      const { status, terminal } = deriveAcademicYearState(year, { semester1Locked: false, semester2Locked: false })
      if (terminal) {
        throw httpError(`Năm học ${year.id} đã chốt sổ điểm (${status})`, 409)
      }

      const hk1Locked = await drizzleSemesterLockRepository.isLocked(year.id, 1, parishId, tx)
      const hk2Locked = await drizzleSemesterLockRepository.isLocked(year.id, 2, parishId, tx)
      if (!hk1Locked || !hk2Locked) {
        throw httpError(
          `Phải khóa sổ điểm cả HK1 và HK2 của năm học ${year.id} trước khi chốt năm học. HK1: ${hk1Locked ? 'đã khóa' : 'chưa khóa'}, HK2: ${hk2Locked ? 'đã khóa' : 'chưa khóa'}`,
          403
        )
      }

      const checklist = await this.getCompletenessChecklist(year.id, parishId, tx)
      if (!checklist.ready) {
        const err = httpError(
          `Chưa thể chốt năm học ${year.id}: còn ${checklist.issues.length} vấn đề dữ liệu (${checklist.issues.map((i) => i.label).join('; ')})`,
          400
        )
        err.details = checklist
        throw err
      }

      const classRows = await tx
        .select()
        .from(classes)
        .where(and(eq(classes.academicYearId, year.id), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
      const classIds = classRows.map((c) => c.id)
      const studentRows = classIds.length > 0
        ? await tx
            .select()
            .from(students)
            .where(and(inArray(students.classId, classIds), eq(students.parishId, parishId), isNull(students.deletedAt)))
        : []

      const normYear = normalizeAcademicYear(year.id)
      const gradeRows = await tx
        .select()
        .from(grades)
        .where(and(eq(grades.academicYear, normYear), eq(grades.parishId, parishId)))

      // Snapshot GPA phải áp active overrides để khớp promotion/reporting.
      const gradeIds = gradeRows.map((g) => g.id)
      const activeOverrides = gradeIds.length > 0
        ? await tx
            .select()
            .from(gradeOverrides)
            .where(and(
              inArray(gradeOverrides.gradeId, gradeIds),
              eq(gradeOverrides.parishId, parishId),
              isNull(gradeOverrides.deletedAt),
            ))
        : []

      const range = await getAcademicYearDateRange(parishId, year.id, tx)
      const attendanceRows = await tx
        .select()
        .from(attendance)
        .where(and(eq(attendance.parishId, parishId), gte(attendance.date, range.startDate), lte(attendance.date, range.endDate)))

      const weights = await getParishGradeWeights(parishId, tx)
      const attendancePolicy = await getParishAttendancePolicy(parishId, tx)
      const policy = await getParishPromotionPolicy(parishId, tx)
      const thresholds = await getParishClassificationThresholds(parishId, tx)

      const effectiveGpa = (g: typeof gradeRows[number] | undefined): number | null => {
        if (!g || isEmptyGrade(g)) return null
        return computeWeightedGpa(
          applyOverridesToGrade(g as any, activeOverrides as any[]) as any,
          weights,
        )
      }

      const now = new Date().toISOString()
      let count = 0

      const finalizationPolicy = JSON.stringify(finalizationPolicySchema.parse({
        version: 1, capturedAt: now, gradeWeights: weights, attendancePolicy,
        promotionPolicy: policy, classificationThresholds: thresholds, range,
        classes: classRows.map(c => ({ id: c.id, name: c.name })),
      }))

      for (const student of studentRows) {
        if (student.status !== 'Đang học') continue
        const g1 = gradeRows.find((g) => g.studentId === student.id && g.semester === 1)
        const g2 = gradeRows.find((g) => g.studentId === student.id && g.semester === 2)
        const gpa1 = effectiveGpa(g1)
        const gpa2 = effectiveGpa(g2)
        let yearGpa: number | null = null
        if (gpa1 !== null && gpa2 !== null) {
          const rounding = Number(weights.roundingDecimal ?? 1)
          const factor = Math.pow(10, rounding)
          yearGpa = Math.round(((gpa1 + gpa2) / 2) * factor) / factor
        } else if (gpa1 !== null) {
          yearGpa = gpa1
        } else if (gpa2 !== null) {
          yearGpa = gpa2
        }
        const classification = yearGpa !== null ? getClassificationLabel(yearGpa, thresholds) : null
        const attendanceRate = computeAttendanceRate(
          attendanceRows.filter((a) => a.studentId === student.id),
          attendancePolicy.excusedWeight
        )

        const decision = await promotionApplicationService.evaluateStudent({
          studentId: student.id,
          academicYear: normYear,
          parishId,
          gpa: yearGpa,
          attendanceRate,
          policy,
        }, tx)

        const studentAttendance = attendanceRows.filter(a => a.studentId === student.id)
        const mass = studentAttendance.filter(a => a.type === 'SundayMass')
        const catechism = studentAttendance.filter(a => a.type === 'CatechismClass')
        const presentCount = (rows: typeof studentAttendance) => rows.filter(a => a.status === 'Present' || a.status === 'AbsentExcused').length
        const reportSnapshot = JSON.stringify(academicReportSnapshotSchema.parse({
          version: 1,
          grades: [g1, g2].filter((g): g is NonNullable<typeof g> => Boolean(g)).map(g => {
            const effective = applyOverridesToGrade(g as any, activeOverrides as any[])
            return {
              semester: g.semester, scoreOral: effective.scoreOral ?? null,
              score15m: effective.score15m ?? null, score1Period: effective.score1Period ?? null,
              scoreMidterm: effective.scoreMidterm ?? null, scoreFinal: effective.scoreFinal ?? null,
              gpa: effectiveGpa(g),
            }
          }),
          attendanceSummary: {
            massPresentCount: presentCount(mass), massTotalCount: mass.length,
            catechismPresentCount: presentCount(catechism), catechismTotalCount: catechism.length,
            overallAttendanceRate: attendanceRate,
          },
        }))

        const existing = await tx
          .select({ id: academicYearSnapshots.id })
          .from(academicYearSnapshots)
          .where(
            and(
              eq(academicYearSnapshots.parishId, parishId),
              eq(academicYearSnapshots.studentId, student.id),
              eq(academicYearSnapshots.academicYearId, year.id)
            )
          )
          .limit(1)

        if (existing[0]) {
          await tx
            .update(academicYearSnapshots)
            .set({
              semester1Gpa: gpa1,
              sourceClassId: student.classId,
              reportSnapshot,
              semester2Gpa: gpa2,
              yearGpa,
              classification,
              attendanceRate,
              promotionStatus: decision.status,
              generatedBy: userId,
              generatedAt: now,
              updatedAt: now,
            })
            .where(and(eq(academicYearSnapshots.id, existing[0].id), eq(academicYearSnapshots.parishId, parishId)))
        } else {
          await tx.insert(academicYearSnapshots).values({
            id: generateId('SNA'),
            parishId,
            academicYearId: year.id,
            studentId: student.id,
            semester1Gpa: gpa1,
            sourceClassId: student.classId,
            reportSnapshot,
            semester2Gpa: gpa2,
            yearGpa,
            classification,
            attendanceRate,
            promotionStatus: decision.status,
            generatedBy: userId,
            generatedAt: now,
            createdAt: now,
            updatedAt: now,
          })
        }
        count++
      }

      const finalized = await tx
        .update(academicYears)
        .set({ isLocked: 1, status: 'FINALIZED', finalizationPolicy, updatedAt: now, updatedBy: userId })
        .where(and(
          eq(academicYears.id, year.id),
          eq(academicYears.parishId, parishId),
          eq(academicYears.isLocked, 0),
        ))

      if (Number(finalized.rowsAffected ?? 0) !== 1) {
        throw httpError(`Năm học ${year.id} đã thay đổi trong lúc chốt; vui lòng tải lại và thử lại`, 409)
      }

      await this.writeAuditLog(
        'FINALIZE_ACADEMIC_YEAR',
        'academic_year',
        year.id,
        null,
        JSON.stringify({ snapshotCount: count, finalizedAt: now }),
        userId,
        parishId,
        tx
      )

      return { finalizedYearId: year.id, snapshotCount: count, finalizedAt: now }
    })

    return { yearId: finalizedYearId, status: 'FINALIZED', snapshotCount, finalizedAt }
  }

  /** Durable worklist: approval alone is not completion of membership transfer. */
  public async getPromotionReconciliation(
    yearId: string,
    parishId: string,
    executor: DbExecutor = db,
  ): Promise<PromotionReconciliation> {
    const year = await this.getYearOrThrow(yearId, parishId, executor)
    const rows = await executor
      .select({
        studentId: academicYearSnapshots.studentId,
        promotionStatus: academicYearSnapshots.promotionStatus,
        promotionRecordId: promotionRecords.id,
      })
      .from(academicYearSnapshots)
      .innerJoin(academicYears, and(eq(academicYears.parishId, academicYearSnapshots.parishId), eq(academicYears.id, academicYearSnapshots.academicYearId)))
      .leftJoin(promotionRecords, and(
        eq(promotionRecords.parishId, academicYearSnapshots.parishId),
        eq(promotionRecords.studentId, academicYearSnapshots.studentId),
        eq(promotionRecords.academicYear, academicYearSnapshots.academicYearId),
        eq(promotionRecords.status, 'ACTIVE'),
        eq(promotionRecords.isLatest, 1),
        promotionCompletionPredicate(),
      ))
      .where(and(
        eq(academicYearSnapshots.parishId, parishId),
        eq(academicYearSnapshots.academicYearId, year.id),
      ))

    const unresolved = rows
      .filter((row) => !row.promotionRecordId)
      .map((row) => ({
        studentId: row.studentId,
        promotionStatus: row.promotionStatus,
        reason: 'Chưa có bằng chứng hoàn tất promotion ACTIVE/LATEST đúng năm đích',
      }))

    return {
      yearId: year.id,
      targetYearId: year.promotionTargetYearId || null,
      total: rows.length,
      resolved: rows.length - unresolved.length,
      unresolvedCount: unresolved.length,
      unresolved,
    }
  }

  /** Bước ④+⑤ — ghi target + chuyển PROMOTED trước, rồi xử lý partial items có durable reconciliation gate. */
  public async promoteYear(yearId: string, nextYearId: string, userId: string, parishId: string): Promise<PromoteSummary> {
    const year = await this.getYearOrThrow(yearId, parishId)
    const status = deriveAcademicYearStatus(year, { semester1Locked: false, semester2Locked: false })
    if (status !== 'FINALIZED') {
      if (year.status === 'PROMOTED') {
        throw httpError(`Năm học ${year.id} đã xét lên lớp hoặc đang có item cần Retry`, 409)
      }
      throw httpError(`Năm học ${year.id} chưa chốt (${status}) — phải Finalize trước khi xét lên lớp`, 403)
    }

    const normNextYear = normalizeAcademicYear(nextYearId)
    if (normNextYear === year.id) throw httpError('Năm học mới phải khác năm học hiện tại', 400)
    if (!parseAcademicYear(normNextYear)) {
      throw httpError(`Định dạng năm học mới không hợp lệ (phải là YYYY-YYYY): "${normNextYear}"`, 400)
    }

    let nextYear = await this.getYearOrThrow(normNextYear, parishId).catch(() => null)
    if (!nextYear) {
      const copied = await this.copyAcademicYear(yearId, normNextYear, userId, parishId)
      nextYear = await this.getYearOrThrow(copied.year.id, parishId)
    }

    const startedAt = new Date().toISOString()
    await runDbTransaction(async (tx) => {
      const [current] = await tx.select().from(academicYears)
        .where(and(eq(academicYears.id, year.id), eq(academicYears.parishId, parishId)))
        .limit(1)
      if (!current || current.status !== 'FINALIZED') {
        throw httpError(`Năm học ${year.id} đã thay đổi trong lúc bắt đầu xét lên lớp`, 409)
      }
      if (current.promotionTargetYearId && current.promotionTargetYearId !== nextYear.id) {
        throw httpError(`Năm học ${year.id} đã gắn với năm đích ${current.promotionTargetYearId}`, 409)
      }
      const claimed = await tx.update(academicYears)
        .set({ status: 'PROMOTED', promotionTargetYearId: nextYear.id, updatedAt: startedAt, updatedBy: userId })
        .where(and(
          eq(academicYears.id, year.id),
          eq(academicYears.parishId, parishId),
          eq(academicYears.status, 'FINALIZED'),
        ))
      if (Number(claimed.rowsAffected ?? 0) !== 1) {
        throw httpError(`Năm học ${year.id} đã được process khác bắt đầu xét lên lớp`, 409)
      }
      await this.writeAuditLog(
        'START_PROMOTE_ACADEMIC_YEAR',
        'academic_year',
        year.id,
        JSON.stringify({ status: 'FINALIZED' }),
        JSON.stringify({ status: 'PROMOTED', nextYearId: nextYear.id }),
        userId,
        parishId,
        tx,
      )
    })

    return this.processPromotionItems(year.id, nextYear.id, userId, parishId, 'PROMOTE_ACADEMIC_YEAR')
  }

  public async retryPromotion(yearId: string, userId: string, parishId: string): Promise<PromoteSummary> {
    const year = await this.getYearOrThrow(yearId, parishId)
    if (year.status !== 'PROMOTED') {
      throw httpError(`Năm học ${year.id} không ở trạng thái PROMOTED`, 403)
    }
    if (!year.promotionTargetYearId) {
      throw httpError(`Năm học ${year.id} thiếu promotion target; không thể retry an toàn`, 409)
    }
    const reconciliation = await this.getPromotionReconciliation(year.id, parishId)
    if (reconciliation.unresolvedCount === 0) {
      throw httpError(`Năm học ${year.id} không còn item promotion cần retry`, 409)
    }
    await this.getYearOrThrow(year.promotionTargetYearId, parishId)
    return this.processPromotionItems(year.id, year.promotionTargetYearId, userId, parishId, 'RETRY_PROMOTE_ACADEMIC_YEAR')
  }

  private async processPromotionItems(
    yearId: string,
    nextYearId: string,
    userId: string,
    parishId: string,
    auditAction: 'PROMOTE_ACADEMIC_YEAR' | 'RETRY_PROMOTE_ACADEMIC_YEAR',
  ): Promise<PromoteSummary> {
    const oldClasses = await db
      .select()
      .from(classes)
      .where(and(eq(classes.academicYearId, yearId), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    const newClasses = await db
      .select()
      .from(classes)
      .where(and(eq(classes.academicYearId, nextYearId), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    const classCodeMap = new Map(newClasses.map((c) => [c.code, c.id]))

    const allSnapshotRows = await db
      .select()
      .from(academicYearSnapshots)
      .where(and(eq(academicYearSnapshots.parishId, parishId), eq(academicYearSnapshots.academicYearId, yearId)))

    const before = await this.getPromotionReconciliation(yearId, parishId)
    const unresolvedIds = new Set(before.unresolved.map((item) => item.studentId))
    const snapshotRows = allSnapshotRows.filter((snapshot) => unresolvedIds.has(snapshot.studentId))

    const studentIds = snapshotRows.map((s) => s.studentId)
    const studentRows = studentIds.length > 0
      ? await db.select().from(students).where(and(inArray(students.id, studentIds), eq(students.parishId, parishId)))
      : []
    const studentMap = new Map(studentRows.map((s) => [s.id, s]))

    const now = new Date().toISOString()
    const summary: PromoteSummary = {
      yearId,
      nextYearId,
      status: 'PROMOTED',
      total: allSnapshotRows.length,
      attempted: snapshotRows.length,
      movedToNextYear: 0,
      retained: 0,
      graduated: 0,
      errors: [],
      warnings: [],
      unresolvedCount: before.unresolvedCount,
    }

    for (const snap of snapshotRows) {
      const student = studentMap.get(snap.studentId)
      if (!student) {
        summary.errors.push({ studentId: snap.studentId, reason: 'Không tìm thấy học sinh tương ứng snapshot' })
        continue
      }
      const priorApproval = await drizzlePromotionRepository.findActiveSnapshot(snap.studentId, yearId, parishId)
      const sourceClass = oldClasses.find((c) => c.id === (priorApproval?.targetClassId || student.classId))
      const targetClassId = sourceClass?.id || student.classId

      // PROMO-FIX (2026-08-22): chỉ học sinh ĐẠT điều kiện (PROMOTED /
      // CONDITIONALLY_PROMOTED) mới lên khối +1 (ưu tiên cùng hậu tố; hết cấp
      // ngành thì sang nhập môn ngành kế). RETAINED giữ lớp cùng mã. GRADUATED /
      // TRANSFERRED không di chuyển lớp. Trước đây MỌI học sinh đều bị map về
      // lớp CÙNG MÃ năm mới — người đạt cũng bị giữ nguyên khối.
      const status = snap.promotionStatus
      const canAdvance = status === 'PROMOTED' || status === 'CONDITIONALLY_PROMOTED'
      let nextClassId: string | null = null
      let nextBranchOverride: string | undefined

      if (status === 'GRADUATED' || status === 'TRANSFERRED') {
        // Tốt nghiệp / chuyển trường — không di chuyển lớp, vẫn ghi snapshot.
        summary.graduated++
      } else if (sourceClass && canAdvance) {
        const advanced = findNextClassInYear(sourceClass.name, newClasses)
        if (advanced) {
          nextClassId = advanced.id
          const branchType = branchTypeByWeight(advanced.branchWeight)
          if (branchType && branchType !== student.branch) nextBranchOverride = branchType
        } else {
          // Không có lớp khối +1 / nhập môn trong năm mới → fallback giữ lớp cùng mã
          const mapped = classCodeMap.get(sourceClass.code)
          if (mapped) {
            nextClassId = mapped
            summary.warnings.push({
              studentId: snap.studentId,
              reason: `Đủ điều kiện nhưng chưa có lớp khối kế tiếp trong năm mới cho "${sourceClass.name}" — tạm giữ lớp cùng mã`,
            })
          } else {
            summary.warnings.push({
              studentId: snap.studentId,
              reason: `Đủ điều kiện nhưng năm mới chưa có lớp phù hợp cho "${sourceClass.name}" — học sinh ở lại lớp năm cũ`,
            })
          }
        }
      } else if (sourceClass) {
        // RETAINED hoặc chưa xác định: giữ nguyên lớp cùng mã sang năm mới
        const mapped = classCodeMap.get(sourceClass.code)
        if (mapped) {
          nextClassId = mapped
        } else {
          summary.warnings.push({ studentId: snap.studentId, reason: `Lớp năm mới không có cùng mã "${sourceClass.code}" — học sinh ở lại lớp năm cũ` })
        }
      } else {
        summary.warnings.push({ studentId: snap.studentId, reason: `Không tìm thấy lớp nguồn (classId=${student.classId}) — học sinh ở lại lớp cũ` })
      }

      try {
        // ADR-008 keeps batch-level partial success, but each individual student's
        // promotion snapshot + class move is one atomic unit. A class update failure
        // must roll the newly written promotion record back for that student.
        await runDbTransaction(async (tx) => {
          const destinationBranch = nextClassId
            ? await resolveMembershipBranch(tx, parishId, nextClassId, nextBranchOverride)
            : undefined
          if (!nextClassId && !['GRADUATED', 'TRANSFERRED'].includes(status || '')) {
            throw httpError('Chưa có lớp đích; cần cấu hình lớp năm mới trước khi retry', 409)
          }
          const approved = await promotionApplicationService.approvePromotion({
            studentId: snap.studentId,
            academicYear: normalizeAcademicYear(yearId),
            targetClassId,
            nextClassId,
            newBranch: destinationBranch,
            gpa: snap.yearGpa ?? 0,
            attendanceRate: snap.attendanceRate ?? 0,
            conductSnapshot: snap.classification,
            manualDecision: snap.promotionStatus || undefined,
            userId,
            parishId,
          }, tx)
          if (nextClassId) {
            await tx
              .update(students)
              .set({
                classId: nextClassId,
                branch: destinationBranch,
                updatedAt: now,
                updatedBy: userId,
              })
              .where(and(eq(students.id, snap.studentId), eq(students.parishId, parishId)))
          }
          await drizzlePromotionRepository.markCompleted(approved, nextYearId, userId, tx)
        })

        if (nextClassId && !(status === 'GRADUATED' || status === 'TRANSFERRED')) summary.movedToNextYear++
        if (status === 'RETAINED') summary.retained++
      } catch (err: any) {
        summary.errors.push({ studentId: snap.studentId, reason: err?.message || 'Lỗi không xác định' })
      }
    }

    const reconciliation = await this.getPromotionReconciliation(yearId, parishId)
    summary.unresolvedCount = reconciliation.unresolvedCount

    await runDbTransaction(async (tx) => {
      await this.writeAuditLog(
        auditAction,
        'academic_year',
        yearId,
        null,
        JSON.stringify({ nextYearId, total: summary.total, attempted: summary.attempted, movedToNextYear: summary.movedToNextYear, retained: summary.retained, graduated: summary.graduated, errorCount: summary.errors.length, warningCount: summary.warnings.length, unresolvedCount: summary.unresolvedCount }),
        userId,
        parishId,
        tx,
      )
    })

    return summary
  }

  /** Bước ⑥ — chỉ archive khi durable reconciliation không còn unresolved item. */
  public async archiveYear(yearId: string, userId: string, parishId: string): Promise<{ yearId: string; status: AcademicYearStatus; archivedAt: string }> {
    const now = new Date().toISOString()
    await runDbTransaction(async (tx) => {
      const year = await this.getYearOrThrow(yearId, parishId, tx)
      if (year.status === 'ARCHIVED') throw httpError(`Năm học ${year.id} đã được lưu trữ`, 409)
      if (year.status !== 'PROMOTED') {
        throw httpError(`Năm học ${year.id} chưa được xét lên lớp (${year.status || 'OPEN'}) — chỉ lưu trữ sau khi Xét Lên Lớp`, 403)
      }
      const reconciliation = await this.getPromotionReconciliation(year.id, parishId, tx)
      if (reconciliation.unresolvedCount > 0) {
        const err = httpError(`Còn ${reconciliation.unresolvedCount} học sinh chưa hoàn tất xét lên lớp`, 409)
        err.details = reconciliation
        throw err
      }
      const archived = await tx
        .update(academicYears)
        .set({ status: 'ARCHIVED', updatedAt: now, updatedBy: userId })
        .where(and(eq(academicYears.id, year.id), eq(academicYears.parishId, parishId), eq(academicYears.status, 'PROMOTED')))
      if (Number(archived.rowsAffected ?? 0) !== 1) throw httpError(`Năm học ${year.id} đã thay đổi trong lúc lưu trữ`, 409)
      await this.writeAuditLog(
        'ARCHIVE_ACADEMIC_YEAR',
        'academic_year',
        year.id,
        JSON.stringify({ status: 'PROMOTED' }),
        JSON.stringify({ status: 'ARCHIVED' }),
        userId,
        parishId,
        tx,
      )
    })
    return { yearId, status: 'ARCHIVED', archivedAt: now }
  }

  /** Bước ⑤ — Tạo năm học mới: copy lớp + assessments, KHÔNG copy điểm/điểm danh/báo cáo. */
  public async copyAcademicYear(
    sourceYearId: string,
    newYearId: string,
    userId: string,
    parishId: string
  ): Promise<{ year: { id: string; startDate: string; endDate: string }; copiedClasses: number; copiedAssessments: number }> {
    const source = await this.getYearOrThrow(sourceYearId, parishId)
    const normNewYear = normalizeAcademicYear(newYearId)
    // AY-F5 (audit 2026-08-21): cùng lý do promoteYear — chặn id năm mới tự do.
    if (!parseAcademicYear(normNewYear)) {
      throw httpError(`Định dạng năm học mới không hợp lệ (phải là YYYY-YYYY): "${normNewYear}"`, 400)
    }

    const [existing] = await db
      .select()
      .from(academicYears)
      .where(and(eq(academicYears.id, normNewYear), eq(academicYears.parishId, parishId)))
      .limit(1)
    if (existing) {
      return { year: { id: existing.id, startDate: existing.startDate, endDate: existing.endDate }, copiedClasses: 0, copiedAssessments: 0 }
    }

    const range = computeAcademicYearDateRange(normNewYear)
    const now = new Date().toISOString()
    const sourceClasses = await db
      .select()
      .from(classes)
      .where(and(eq(classes.academicYearId, source.id), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    const sourceAssessments = await db
      .select()
      .from(assessments)
      .where(and(eq(assessments.academicYearId, source.id), eq(assessments.parishId, parishId)))

    await runDbTransaction(async (tx) => {
      await tx.insert(academicYears).values({
        id: normNewYear,
        startDate: range.startDate,
        endDate: range.endDate,
        isLocked: 0,
        status: 'OPEN',
        currentSemester: 1,
        parishId,
        createdAt: now,
        updatedAt: now,
        updatedBy: userId,
      })

      for (const cls of sourceClasses) {
        await tx.insert(classes).values({
          id: `${normNewYear}-${cls.code}`,
          code: cls.code,
          name: cls.name,
          branchId: cls.branchId,
          academicYearId: normNewYear,
          room: cls.room,
          parishId,
          createdAt: now,
          updatedAt: now,
          updatedBy: userId,
        })
      }

      for (const a of sourceAssessments) {
        await tx.insert(assessments).values({
          id: generateId('ASM'),
          name: a.name,
          type: a.type,
          weight: a.weight,
          semester: a.semester,
          academicYearId: normNewYear,
          parishId,
          createdAt: now,
          updatedAt: now,
        })
      }

      await this.writeAuditLog(
        'COPY_ACADEMIC_YEAR',
        'academic_year',
        normNewYear,
        JSON.stringify({ sourceYearId: source.id }),
        JSON.stringify({ copiedClasses: sourceClasses.length, copiedAssessments: sourceAssessments.length }),
        userId,
        parishId,
        tx,
      )
    })

    return {
      year: { id: normNewYear, startDate: range.startDate, endDate: range.endDate },
      copiedClasses: sourceClasses.length,
      copiedAssessments: sourceAssessments.length,
    }
  }

  private async writeAuditLog(
    action: string,
    entityType: string,
    entityId: string,
    oldValue: string | null,
    newValue: string | null,
    userId: string,
    parishId: string,
    tx: DbExecutor = db
  ): Promise<void> {
    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
      ip: '',
      userAgent: '',
      parishId,
      createdAt: new Date().toISOString(),
    })
  }
}

export const academicYearLifecycleService = new AcademicYearLifecycleService()
