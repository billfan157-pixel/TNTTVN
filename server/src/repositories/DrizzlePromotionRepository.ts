import { db, type DbExecutor } from '../db/index.js'
import { promotionRecords } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
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
}

export class DrizzlePromotionRepository {
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
