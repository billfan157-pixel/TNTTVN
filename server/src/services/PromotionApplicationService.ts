import { db, runDbTransaction, type DbTransaction, type DbExecutor } from '../db/index.js'
import { students, classes, grades, attendance, gradeOverrides, auditLogs } from '../db/schema.js'
import { eq, and, isNull, gte, lte, inArray } from 'drizzle-orm'
import { drizzlePromotionRepository, DrizzlePromotionRepository } from '../repositories/DrizzlePromotionRepository.js'
import type { PromotionRecordDTO } from '../repositories/DrizzlePromotionRepository.js'
import { createCanAccessStudentSpecification, createPromotionEligibilitySpecification } from './policyAdapters.js'
import type { EvaluationInput } from '../domain/PromotionSpecifications.js'
import { PromotionDecision } from '../domain/PromotionDecision.js'
import type { PromotionStatus } from '../domain/PromotionDecision.js'
import { generateId } from '../utils/id.js'
import { computeWeightedGpa } from '../utils/gradeCalculation.js'
import { applyOverridesToGrade } from '../domain/GradeAggregate.js'
import { getAcademicYearDateRange } from './academicYearService.js'
import { getParishGradeWeights, getParishAttendancePolicy, getParishPromotionPolicy, getCurrentPolicyVersionId } from './parishSettingsService.js'

import { checkUserClassAccess } from './classAccessQueryService.js'
import type { ActorContext } from '../types/actor.js'

export interface ApprovePromotionCommand {
  studentId: string
  academicYear: string
  targetClassId: string
  nextClassId?: string | null
  gpa: number
  attendanceRate: number
  conductSnapshot?: string | null
  manualDecision?: PromotionStatus
  overrideReason?: string | null
  userId: string
  parishId: string
  user?: ActorContext
  policy?: { minGpa: number; minAttendance: number }
  ip?: string
  userAgent?: string
}

export class PromotionApplicationService {
  private promotionRepo: DrizzlePromotionRepository

  constructor(
    promotionRepo: DrizzlePromotionRepository = drizzlePromotionRepository,
  ) {
    this.promotionRepo = promotionRepo
  }

  /**
   * Nguồn sự thật duy nhất: tính GPA cả năm + tỷ lệ chuyên cần từ DB theo
   * settings giáo xứ. Dùng chung cho evaluateStudentWithData (đọc) và
   * approvePromotion (xác minh dữ liệu client trước khi lưu).
   */
  private async computeAuthoritativeMetrics(params: {
    parishId: string
    studentId: string
    academicYear: string
    executor?: DbExecutor
  }): Promise<{ gpa: number | null; attendanceRate: number }> {
    const { parishId, studentId, academicYear, executor = db } = params

    // GPA = trung bình các GPA học kỳ (mỗi GPA học kỳ đã round theo
    // roundingDecimal từ settings) — khớp client calculateYearlyGpa.
    // PRM-01 (audit 2026-08-08): chỉ tính semester 1+2 cho khớp Finalize
    // (AcademicYearLifecycleService chỉ lấy g1/g2) — nếu có dòng semester 3/4
    // mà đem trung bình luôn thì GPA approve lệch snapshot → 409 chặn promote.
    const gradeRows = await executor
      .select()
      .from(grades)
      .where(
        and(
          eq(grades.studentId, studentId),
          eq(grades.academicYear, academicYear),
          eq(grades.parishId, parishId),
          inArray(grades.semester, [1, 2])
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

    const weights = await getParishGradeWeights(parishId, executor)
    const studentGpas: number[] = []
    for (const g of gradeRows) {
      // G-02: Apply overrides to form effective grade
      // Casting to any to resolve pre-existing type mismatch between Drizzle row and GradeRecordDTO Partial
      const effectiveGrade = applyOverridesToGrade(g as any, activeOverrides as any[])
      const semesterGpa = computeWeightedGpa(effectiveGrade as any, weights)
      if (typeof semesterGpa === 'number') studentGpas.push(semesterGpa)
    }
    // F4: rounding theo parish settings (roundingDecimal), không hardcode 0.1.
    const rounding = Number(weights.roundingDecimal ?? 1)
    const gpaFactor = Math.pow(10, rounding)
    const gpa = studentGpas.length > 0
      ? Math.round((studentGpas.reduce((a, b) => a + b, 0) / studentGpas.length) * gpaFactor) / gpaFactor
      : null

    // Attendance: chỉ đếm trong năm học đang xét (không phải all-time).
    const range = await getAcademicYearDateRange(parishId, academicYear, executor)
    const attendanceRows = await executor
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.studentId, studentId),
          eq(attendance.parishId, parishId),
          gte(attendance.date, range.startDate),
          lte(attendance.date, range.endDate)
        )
      )

    const attendancePolicy = await getParishAttendancePolicy(parishId, executor)
    const excusedWeight = Math.min(Math.max(attendancePolicy.excusedWeight, 0), 1)
    const presentMasses = attendanceRows.reduce((acc, a) => {
      if (a.status === 'Present') return acc + 1
      if (a.status === 'AbsentExcused') return acc + excusedWeight
      return acc
    }, 0)
    const attendanceRate = attendanceRows.length > 0
      ? Number(((presentMasses / attendanceRows.length) * 100).toFixed(1))
      : 100.0

    return { gpa, attendanceRate }
  }

  public async evaluateStudentWithData(params: {
    studentId: string
    academicYear: string
    parishId: string
    user?: ActorContext
  }): Promise<PromotionDecision> {
    const { studentId, academicYear, parishId, user } = params

    if (user && user.role !== 'admin') {
      const isAuthorized = await createCanAccessStudentSpecification(db).isSatisfiedBy(user, studentId)
      if (!isAuthorized) {
        const err = new Error('Bạn không có quyền đánh giá xét lên lớp cho thiếu nhi này') as any
        err.status = 403
        throw err
      }
    }

    // 1. Verify student exists in parish (excluding soft-deleted)
    const [student] = await db
      .select()
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
      .limit(1)

    if (!student) {
      const err = new Error('Không tìm thấy thông tin thiếu nhi') as any
      err.status = 404
      throw err
    }

    // 2+3. GPA & attendance từ nguồn sự thật duy nhất (settings giáo xứ)
    const { gpa: computedGpa, attendanceRate: computedAttendanceRate } =
      await this.computeAuthoritativeMetrics({ parishId, studentId, academicYear })

    // Policy xét thăng tiến từ settings giáo xứ (khớp client settings.promotionPolicy).
    const policy = await getParishPromotionPolicy(parishId)

    // gpa === null nghĩa là "chưa có điểm" — truyền null xuống spec để reason
    // là "Chưa có kết quả điểm học tập"; DTO vẫn giữ số (0) cho khách gọi.
    return this.evaluateStudent({
      studentId,
      academicYear,
      parishId,
      gpa: computedGpa,
      attendanceRate: computedAttendanceRate,
      policy,
    }, db)
  }

  public async evaluateStudent(input: EvaluationInput, executor: DbExecutor = db): Promise<PromotionDecision> {
    const res = await createPromotionEligibilitySpecification(executor).evaluate(input)
    return new PromotionDecision({
      studentId: input.studentId,
      academicYear: input.academicYear,
      status: res.suggestedStatus,
      gpa: input.gpa ?? 0,
      attendanceRate: input.attendanceRate,
      isEligible: res.isEligible,
      rejectionReasons: res.rejectionReasons,
      evaluatedAt: new Date().toISOString(),
    })
  }

  public async approvePromotion(cmd: ApprovePromotionCommand, externalTx?: DbTransaction): Promise<PromotionRecordDTO> {
    // Phase 1 (Promotion TOCTOU): TOÀN BỘ reads/prechecks + snapshot write chạy
    // trong CÙNG 1 transaction (externalTx của batch/promote, hoặc
    // runDbTransaction riêng với SQLITE_BUSY retry). Không còn khe
    // check-then-use giữa validation và commit.
    const runInTx = externalTx
      ? (fn: (tx: DbTransaction) => Promise<PromotionRecordDTO>) => fn(externalTx)
      : (fn: (tx: DbTransaction) => Promise<PromotionRecordDTO>) => runDbTransaction(fn)

    return runInTx(async (tx) => {
      if (cmd.user && cmd.user.role !== 'admin') {
        const isAuthorized = await createCanAccessStudentSpecification(tx).isSatisfiedBy(cmd.user, cmd.studentId)
        if (!isAuthorized) {
          const err = new Error('Bạn không có quyền phê duyệt xét lên lớp cho thiếu nhi này') as any
          err.status = 403
          throw err
        }
        if (cmd.nextClassId) {
          const canAccessNext = await checkUserClassAccess(cmd.user.userId, cmd.parishId, cmd.nextClassId, tx)
          if (!canAccessNext) {
            const err = new Error('Bạn không có quyền gán thiếu nhi vào lớp chuyển đến này') as any
            err.status = 403
            throw err
          }
        }
      }
      // PRM-02 (audit 2026-08-08): không ghi snapshot cho học sinh đã xoá/không còn học
      const [student] = await tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.id, cmd.studentId),
            eq(students.parishId, cmd.parishId),
            isNull(students.deletedAt),
            eq(students.status, 'Đang học')
          )
        )
        .limit(1)
      if (!student) {
        const err = new Error('Không tìm thấy thông tin thiếu nhi') as any
        err.status = 404
        throw err
      }
      // PRM-03 (audit 2026-08-09): targetClassId/nextClassId không có FK vào classes
      // và không verify thuộc parish → chặn snapshot trỏ lớp không tồn tại/khác giáo xứ.
      const classIds = [cmd.targetClassId, cmd.nextClassId].filter((id): id is string => Boolean(id))
      const uniqueClassIds = [...new Set(classIds)]
      if (uniqueClassIds.length > 0) {
        const classRows = await tx
          .select({ id: classes.id })
          .from(classes)
          .where(and(inArray(classes.id, uniqueClassIds), eq(classes.parishId, cmd.parishId)))
        const foundClassIds = new Set(classRows.map((r) => r.id))
        const missingClassIds = uniqueClassIds.filter((id) => !foundClassIds.has(id))
        if (missingClassIds.length > 0) {
          const err = new Error(`Lớp đích không tồn tại hoặc thuộc giáo xứ khác: ${missingClassIds.join(', ')}`) as any
          err.status = 400
          throw err
        }
      }
      // F2-audit: Không tin gpa/attendanceRate do client gửi — máy chủ tự tính lại
      // từ DB và từ chối nếu lệch (chặn dữ liệu cũ/bị chỉnh sửa, race condition,
      // hoặc payload giả mạo).
      const authoritative = await this.computeAuthoritativeMetrics({
        parishId: cmd.parishId,
        studentId: cmd.studentId,
        academicYear: cmd.academicYear,
        executor: tx,
      })
      const authoritativeGpa = authoritative.gpa ?? 0
      if (cmd.gpa !== authoritativeGpa) {
        const err = new Error(
          `Điểm trung bình không khớp dữ liệu máy chủ (máy chủ tính ${authoritativeGpa}, dữ liệu gửi lên ${cmd.gpa}). Hãy đồng bộ lại điểm và thử lại.`
        ) as any
        err.status = 409
        throw err
      }
      if (cmd.attendanceRate !== authoritative.attendanceRate) {
        const err = new Error(
          `Tỷ lệ chuyên cần không khớp dữ liệu máy chủ (máy chủ tính ${authoritative.attendanceRate}%, dữ liệu gửi lên ${cmd.attendanceRate}%). Hãy đồng bộ lại và thử lại.`
        ) as any
        err.status = 409
        throw err
      }

      const parishPolicy = await getParishPromotionPolicy(cmd.parishId, tx)
      const policy = cmd.policy || parishPolicy
      const evalRes = await createPromotionEligibilitySpecification(tx).evaluate({
        studentId: cmd.studentId,
        academicYear: cmd.academicYear,
        parishId: cmd.parishId,
        gpa: authoritativeGpa,
        attendanceRate: authoritative.attendanceRate,
        policy,
      })

      // If HK2 is not locked, evaluation MUST fail
      if (evalRes.rejectionReasons.some((r) => r.includes('chưa được khóa'))) {
        const err = new Error(evalRes.rejectionReasons.find((r) => r.includes('chưa được khóa'))!) as any
        err.status = 403
        throw err
      }

      const autoDecision = evalRes.suggestedStatus
      const finalDecision = cmd.manualDecision || autoDecision
      const isOverridden = autoDecision !== finalDecision

      if (isOverridden && (!cmd.overrideReason || cmd.overrideReason.trim().length === 0)) {
        const err = new Error('Bắt buộc nhập lý do điều chỉnh khi thay đổi kết quả xét lên lớp tự động') as any
        err.status = 400
        throw err
      }

      // ADR-047: Capture current policy version for audit trail
      const policyVersionId = await getCurrentPolicyVersionId(cmd.parishId, tx)
      const gradeWeights = await getParishGradeWeights(cmd.parishId, tx)

      // Check for existing active snapshot for Idempotency
      const existing = await this.promotionRepo.findActiveSnapshot(cmd.studentId, cmd.academicYear, cmd.parishId, tx)

      // Idempotent return nếu đã approve với tham số TƯƠNG ĐƯƠNG — so cả lớp
      // đích (trước đây khác nextClassId nhưng cùng điểm vẫn bị coi là skipped,
      // move lớp bị mất thầm lặng ở lần chạy 2 của batch).
      if (
        existing &&
        existing.finalDecision === finalDecision &&
        existing.gpaSnapshot === authoritativeGpa &&
        existing.attendanceSnapshot === authoritative.attendanceRate &&
        existing.targetClassId === cmd.targetClassId &&
        (existing.nextClassId || null) === (cmd.nextClassId || null)
      ) {
        return existing
      }

      // If existing active snapshot differs (re-evaluation after grade edit), mark previous as SUPERSEDED
      let version = 1
      if (existing) {
        version = existing.version + 1
        await this.promotionRepo.markSuperseded(cmd.studentId, cmd.academicYear, cmd.parishId, tx)
      }

      const now = new Date().toISOString()
      const newSnapshot: PromotionRecordDTO = {
        id: generateId('PRM'),
        studentId: cmd.studentId,
        parishId: cmd.parishId,
        academicYear: cmd.academicYear,
        targetClassId: cmd.targetClassId,
        nextClassId: cmd.nextClassId || null,
        autoDecision,
        finalDecision,
        isOverridden,
        overrideReason: isOverridden ? cmd.overrideReason : null,
        gpaSnapshot: authoritativeGpa,
        attendanceSnapshot: authoritative.attendanceRate,
        conductSnapshot: cmd.conductSnapshot || null,
        rulesVersion: 'v1.0',
        approvedBy: cmd.userId,
        approvedAt: now,
        status: 'ACTIVE',
        version,
        createdAt: now,
        updatedAt: now,
        policyVersionId: policyVersionId || undefined,
        gradeWeightsSnapshot: gradeWeights || null,
      }

      await this.promotionRepo.saveSnapshot(newSnapshot, tx)
      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: cmd.userId,
        action: newSnapshot.isOverridden ? 'OVERRIDE_PROMOTION' : 'APPROVE_PROMOTION',
        entityType: 'promotion_record',
        entityId: newSnapshot.id,
        oldValue: null,
        newValue: JSON.stringify(newSnapshot),
        ip: cmd.ip || '',
        userAgent: cmd.userAgent || '',
        parishId: cmd.parishId,
        createdAt: now,
      })
      return newSnapshot
    })
  }
}

export const promotionApplicationService = new PromotionApplicationService()
