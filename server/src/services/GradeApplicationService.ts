import { db } from '../db/index.js'
import { drizzleGradeRepository, DrizzleGradeRepository } from '../repositories/DrizzleGradeRepository.js'
import { createCanOverrideGradeSpecification, createSemesterLockSpecification } from './policyAdapters.js'
import { GradeAggregate, type ScoreField } from '../domain/GradeAggregate.js'
import { getCurrentPolicyVersionId } from './parishSettingsService.js'
import { notifyGradeOverride } from './smartNotifications.js'

export interface OverrideScoreCommand {
  gradeId: string
  studentId?: string
  scoreField: ScoreField
  manualValue: number
  reasonCode?: string
  reasonNote?: string | null
  userId: string
  parishId: string
  ip: string
  userAgent: string
  idempotencyKey?: string
}

export interface RestoreScoreCommand {
  gradeId: string
  scoreField: ScoreField
  userId: string
  parishId: string
  ip: string
  userAgent: string
}

export class GradeApplicationService {
  private gradeRepo: DrizzleGradeRepository
  constructor(
    gradeRepo: DrizzleGradeRepository = drizzleGradeRepository,
  ) {
    this.gradeRepo = gradeRepo
  }

  public async overrideScore(cmd: OverrideScoreCommand) {
    let notifiedStudentId = cmd.studentId ?? ''
    const overrideDTO = await db.transaction(async (tx) => {
      // 0. Get current policy version ID for audit trail
      const policyVersionId = await getCurrentPolicyVersionId(cmd.parishId, tx)

      // 1. Load Grade Record & Active Overrides
      const gradeRecord = await this.gradeRepo.findById(cmd.gradeId, cmd.parishId, tx)
      if (!gradeRecord) {
        const err = new Error('Grade record not found') as any
        err.status = 404
        throw err
      }
      notifiedStudentId = gradeRecord.studentId

      // 2. Check Semester Lock Specification FIRST
      const isSemesterUnlocked = await createSemesterLockSpecification(tx).isSatisfiedBy(
        gradeRecord.academicYear,
        gradeRecord.semester,
        cmd.parishId,
      )
      if (!isSemesterUnlocked) {
        const err = new Error(`Học kỳ ${gradeRecord.semester} năm học ${gradeRecord.academicYear} đã bị khóa sổ điểm. Không thể chỉnh sửa điểm.`) as any
        err.status = 403
        throw err
      }

      // 3. Check Class Access Permission Specification (TOCTOU safe - inside transaction)
      if (cmd.studentId && cmd.studentId !== gradeRecord.studentId) {
        const err = new Error('Thông tin học sinh không khớp với điểm') as any
        err.status = 400
        throw err
      }
      
      const isAuthorized = await createCanOverrideGradeSpecification(tx).isSatisfiedBy(cmd.userId, gradeRecord.studentId, cmd.parishId)
      if (!isAuthorized) {
        const err = new Error('Bạn không có quyền ghi đè điểm cho thiếu nhi này') as any
        err.status = 403
        throw err
      }

      const overrides = await this.gradeRepo.findActiveOverrides(gradeRecord.id, cmd.parishId, tx)

      // 4. Instantiate Aggregate & execute Domain Invariant (now with policyVersionId)
      const aggregate = new GradeAggregate(gradeRecord, overrides)
      const overrideDTO = aggregate.override(
        cmd.scoreField,
        cmd.manualValue,
        cmd.reasonCode || 'TeacherAdjustment',
        cmd.reasonNote,
        cmd.userId,
        policyVersionId
      )

      // 5. Save Aggregate via Repository with Real SQL Optimistic Locking
      await this.gradeRepo.save(
        aggregate,
        cmd.userId,
        cmd.parishId,
        cmd.ip,
        cmd.userAgent,
        cmd.idempotencyKey,
        tx
      )

      return overrideDTO
    })

    // Phase 2 (outbox convergence): post-commit qua notificationQueue
    // (precedent noticeService — delivery best-effort, audit trong tx là trail).
    // Await để deterministic (không bao giờ throw — lỗi đã catch trong notify).
    await notifyGradeOverride(cmd.parishId, {
      studentId: notifiedStudentId,
      scoreField: overrideDTO.scoreField,
      manualValue: overrideDTO.manualValue,
      reasonCode: overrideDTO.reasonCode,
    })
    return overrideDTO
  }

  public async restoreScore(cmd: RestoreScoreCommand) {
    let notifiedStudentId = ''
    const restoredRecord = await db.transaction(async (tx) => {
      // 0. Get current policy version ID for audit trail
      const policyVersionId = await getCurrentPolicyVersionId(cmd.parishId, tx)

      // 1. Load Grade Record
      const gradeRecord = await this.gradeRepo.findById(cmd.gradeId, cmd.parishId, tx)
      if (!gradeRecord) return null
      notifiedStudentId = gradeRecord.studentId

      // 2. Check Semester Lock Specification FIRST
      const isSemesterUnlocked = await createSemesterLockSpecification(tx).isSatisfiedBy(
        gradeRecord.academicYear,
        gradeRecord.semester,
        cmd.parishId,
      )
      if (!isSemesterUnlocked) {
        const err = new Error(`Học kỳ ${gradeRecord.semester} năm học ${gradeRecord.academicYear} đã bị khóa sổ điểm. Không thể khôi phục điểm.`) as any
        err.status = 403
        throw err
      }

      // 3. Check Class Access Permission Specification
      const isAuthorized = await createCanOverrideGradeSpecification(tx).isSatisfiedBy(cmd.userId, gradeRecord.studentId, cmd.parishId)
      if (!isAuthorized) {
        const err = new Error('Bạn không có quyền khôi phục điểm cho thiếu nhi này') as any
        err.status = 403
        throw err
      }

      const overrides = await this.gradeRepo.findActiveOverrides(gradeRecord.id, cmd.parishId, tx)
      const aggregate = new GradeAggregate(gradeRecord, overrides)

      const restoredRecord = aggregate.restore(cmd.scoreField, cmd.userId, policyVersionId)
      if (!restoredRecord) return null

      await this.gradeRepo.save(
        aggregate,
        cmd.userId,
        cmd.parishId,
        cmd.ip,
        cmd.userAgent,
        undefined,
        tx
      )

      return restoredRecord
    })

    // Phase 2 (outbox convergence): post-commit qua notificationQueue.
    if (restoredRecord) {
      await notifyGradeOverride(cmd.parishId, {
        studentId: notifiedStudentId,
        scoreField: cmd.scoreField,
        removed: true,
      })
    }
    return restoredRecord
  }

  public async getOverrideHistory(gradeId: string, parishId: string) {
    return this.gradeRepo.findOverrideHistory(gradeId, parishId)
  }

  public async restoreScoreBatch(
    items: { gradeId: string; scoreField: ScoreField }[],
    userId: string,
    parishId: string,
    ip: string,
    userAgent: string
  ) {
    const results: { gradeId: string; scoreField: string; status: 'restored' | 'error'; error?: string }[] = []

    for (const item of items) {
      try {
        await this.restoreScore({
          gradeId: item.gradeId,
          scoreField: item.scoreField,
          userId,
          parishId,
          ip,
          userAgent,
        })
        results.push({ gradeId: item.gradeId, scoreField: item.scoreField, status: 'restored' })
      } catch (err: any) {
        results.push({ gradeId: item.gradeId, scoreField: item.scoreField, status: 'error', error: err.message || 'Unknown error' })
      }
    }

    return results
  }
}

export const gradeApplicationService = new GradeApplicationService()
