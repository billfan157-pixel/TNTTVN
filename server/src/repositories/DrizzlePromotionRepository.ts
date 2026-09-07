import { db, type DbExecutor, type DbTransaction } from '../db/index.js'
import { promotionRecords, students, classes, academicYears, auditLogs } from '../db/schema.js'
import { eq, and, isNull, isNotNull } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import type { PromotionStatus } from '../domain/PromotionDecision.js'

export interface PromotionRecordDTO {
  id: string
  studentId: string
  parishId: string
  academicYear: string
  targetClassId: string
  nextClassId?: string | null
  autoDecision: PromotionStatus
  finalDecision: PromotionStatus
  isOverridden: boolean
  overrideReason?: string | null
  gpaSnapshot: number
  attendanceSnapshot: number
  conductSnapshot?: string | null
  rulesVersion: string
  approvedBy: string
  approvedAt: string
  status: 'ACTIVE' | 'SUPERSEDED'
  version: number
  createdAt?: string
  updatedAt?: string
  policyVersionId?: string | null
  gradeWeightsSnapshot?: Record<string, any> | null
  completedAt?: string | null
  completedTargetYearId?: string | null
}

/** Shared join predicate for list, worklist, retry and archive. */
export function promotionCompletionPredicate() {
  return and(isNotNull(promotionRecords.completedAt), eq(promotionRecords.completedTargetYearId, academicYears.promotionTargetYearId))
}

export class DrizzlePromotionRepository {
  /** Called after membership write in the SAME transaction. Terminal decisions
   * explicitly complete without a move; missing destination otherwise is unresolved. */
  public async markCompleted(snapshot: PromotionRecordDTO, targetYearId: string, userId: string, tx: DbTransaction): Promise<void> {
    const terminal = ['GRADUATED', 'TRANSFERRED'].includes(snapshot.finalDecision)
    const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(and(eq(academicYears.parishId, snapshot.parishId), eq(academicYears.id, targetYearId))).limit(1)
    const [student] = await tx.select({ classId: students.classId }).from(students).where(and(eq(students.parishId, snapshot.parishId), eq(students.id, snapshot.studentId), isNull(students.deletedAt))).limit(1)
    if (!year || !student) throw new Error('Không thể xác nhận hoàn tất chuyển năm học: thiếu năm đích hoặc học sinh')
    if (snapshot.nextClassId) {
      const [destination] = await tx.select({ yearId: classes.academicYearId }).from(classes).where(and(eq(classes.parishId, snapshot.parishId), eq(classes.id, snapshot.nextClassId), isNull(classes.deletedAt))).limit(1)
      if (student.classId !== snapshot.nextClassId || destination?.yearId !== targetYearId) throw new Error('Chuyển lớp chưa hoàn tất đúng năm đích')
    } else if (!terminal || student.classId !== snapshot.targetClassId) {
      throw new Error('Chưa có lớp đích; không thể xác nhận hoàn tất xét lên lớp')
    }
    const now = new Date().toISOString()
    const changed = await tx.update(promotionRecords).set({ completedAt: now, completedTargetYearId: targetYearId })
      .where(and(eq(promotionRecords.parishId, snapshot.parishId), eq(promotionRecords.id, snapshot.id), eq(promotionRecords.status, 'ACTIVE'), eq(promotionRecords.isLatest, 1), isNull(promotionRecords.completedAt)))
    if (Number(changed.rowsAffected) === 1) {
      await tx.insert(auditLogs).values({ id: generateId('AUD'), userId, parishId: snapshot.parishId, action: 'COMPLETE_PROMOTION', entityType: 'promotion_record', entityId: snapshot.id, newValue: JSON.stringify({ targetYearId, nextClassId: snapshot.nextClassId || null, finalDecision: snapshot.finalDecision }), createdAt: now })
    } else {
      const [existing] = await tx.select().from(promotionRecords).where(and(eq(promotionRecords.parishId, snapshot.parishId), eq(promotionRecords.id, snapshot.id))).limit(1)
      if (!existing?.completedAt || existing.completedTargetYearId !== targetYearId || existing.status !== 'ACTIVE' || existing.isLatest !== 1) throw new Error('Bằng chứng hoàn tất xét lên lớp không khớp')
    }
  }

  public async findActiveSnapshot(
    studentId: string,
    academicYear: string,
    parishId: string,
    tx: DbExecutor = db
  ): Promise<PromotionRecordDTO | null> {
    const [row] = await tx
      .select()
      .from(promotionRecords)
      .where(
        and(
          eq(promotionRecords.parishId, parishId),
          eq(promotionRecords.studentId, studentId),
          eq(promotionRecords.academicYear, academicYear),
          eq(promotionRecords.status, 'ACTIVE')
        )
      )
      .limit(1)

    if (!row) return null

    return {
      ...row,
      autoDecision: row.autoDecision as PromotionStatus,
      finalDecision: row.finalDecision as PromotionStatus,
      isOverridden: row.isOverridden === 1,
      status: row.status as 'ACTIVE' | 'SUPERSEDED',
    }
  }

  public async saveSnapshot(snapshot: PromotionRecordDTO, tx: DbExecutor = db): Promise<void> {
    const now = new Date().toISOString()

    await tx.insert(promotionRecords).values({
      id: snapshot.id,
      studentId: snapshot.studentId,
      parishId: snapshot.parishId,
      academicYear: snapshot.academicYear,
      targetClassId: snapshot.targetClassId,
      nextClassId: snapshot.nextClassId || null,
      autoDecision: snapshot.autoDecision,
      finalDecision: snapshot.finalDecision,
      isOverridden: snapshot.isOverridden ? 1 : 0,
      overrideReason: snapshot.overrideReason || null,
      gpaSnapshot: snapshot.gpaSnapshot,
      attendanceSnapshot: snapshot.attendanceSnapshot,
      conductSnapshot: snapshot.conductSnapshot || null,
      rulesVersion: snapshot.rulesVersion || 'v1.0',
      approvedBy: snapshot.approvedBy,
      approvedAt: snapshot.approvedAt || now,
      status: snapshot.status || 'ACTIVE',
      version: snapshot.version || 1,
      createdAt: snapshot.createdAt || now,
      updatedAt: now,
    })
  }

  public async markSuperseded(studentId: string, academicYear: string, parishId: string, tx: DbExecutor = db): Promise<void> {
    await tx
      .update(promotionRecords)
      .set({ status: 'SUPERSEDED', updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(promotionRecords.parishId, parishId),
          eq(promotionRecords.studentId, studentId),
          eq(promotionRecords.academicYear, academicYear),
          eq(promotionRecords.status, 'ACTIVE')
        )
      )
  }
}

export const drizzlePromotionRepository = new DrizzlePromotionRepository()
