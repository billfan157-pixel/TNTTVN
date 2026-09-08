import { db, type DbExecutor } from '../db/index.js'
import { grades, gradeOverrides, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { GradeAggregate } from '../domain/GradeAggregate.js'
import type { GradeRecordDTO, GradeOverrideDTO, ScoreField } from '../domain/GradeAggregate.js'
import { SCORE_FIELD_METAS } from '../domain/ScoreFields.js'
import { VersionConflictError } from '../domain/errors.js'
import { generateId } from '../utils/id.js'

// GRADE-TD-01 (audit 2026-08-09): lookup nhanh scoreField → cột source/updatedAt
// (SSOT domain/ScoreFields.ts) — thay cho việc tự ghép tên `${field}Source`.
const SCORE_META_BY_FIELD = new Map(SCORE_FIELD_METAS.map((m) => [m.field, m]))

export class DrizzleGradeRepository {
  public async findById(id: string, parishId: string, tx: DbExecutor = db): Promise<GradeRecordDTO | null> {
    const [row] = await tx
      .select()
      .from(grades)
      .where(and(eq(grades.id, id), eq(grades.parishId, parishId)))
      .limit(1)

    return row ? (row as GradeRecordDTO) : null
  }

  public async findActiveOverrides(gradeId: string, parishId: string, tx: DbExecutor = db): Promise<GradeOverrideDTO[]> {
    const rows = await tx
      .select()
      .from(gradeOverrides)
      .where(and(eq(gradeOverrides.gradeId, gradeId), eq(gradeOverrides.parishId, parishId)))

    return rows as GradeOverrideDTO[]
  }

  public async save(
    aggregate: GradeAggregate,
    userId: string,
    parishId: string,
    ip: string,
    userAgent: string,
    idempotencyKey?: string,
    tx: DbExecutor = db
  ): Promise<GradeRecordDTO> {
    const grade = aggregate.getGrade()
    const expectedVersion = grade.version - 1 // version was incremented by aggregate
    const now = new Date().toISOString()

    // 1. Update grade record with Real SQL Optimistic Locking
    const updateRes = await tx
      .update(grades)
      .set({
        version: grade.version,
        updatedAt: now,
        updatedBy: userId,
      })
      .where(and(eq(grades.id, grade.id), eq(grades.parishId, parishId), eq(grades.version, expectedVersion)))

    const affectedRows = Number((updateRes as { changes?: number; rowsAffected?: number }).changes ?? (updateRes as { changes?: number; rowsAffected?: number }).rowsAffected ?? 1)
    if (affectedRows === 0) {
      const [fresh] = await tx.select().from(grades).where(and(eq(grades.id, grade.id), eq(grades.parishId, parishId))).limit(1)
      throw new VersionConflictError('Điểm đã bị thay đổi bởi người dùng khác. Vui lòng tải lại trang.', fresh)
    }

    // 2. Persist active overrides (Optimized: zero extra SELECTs)
    await this.persistOverrideVersions(tx, aggregate, grade, parishId)

    // 3. Persist audit logs and outbox events
    await this.persistOverrideEvents(tx, aggregate, grade, parishId, userId, ip, userAgent, idempotencyKey, now)

    aggregate.clearUncommittedEvents()
    return grade
  }

  /**
   * GRADE-ARCH-01 (2026-08-09): 1 implementation duy nhất (single writer) cho mọi
   * override — cả path application-service lẫn path manual-override (upsertGrade F5)
   * đều đi qua đây. Trước đây supersede được implement 2 lần theo 2 cách
   * (Map key trong aggregate vs soft-delete + insert mới trong gradeService),
   * nay hợp nhất.
   * ADR-047: Now also captures policyVersionId for audit trail.
   */
  public async persistManualOverrideEvents(
    tx: DbExecutor,
    gradeId: string,
    parishId: string,
    entries: { scoreField: ScoreField; manualValue: number; reasonNote?: string | null }[],
    userId: string,
    ip: string,
    userAgent: string,
    policyVersionId?: string | null
  ): Promise<void> {
    const gradeRow = await this.findById(gradeId, parishId, tx)
    if (!gradeRow) return

    const activeOverrides = await this.findActiveOverrides(gradeId, parishId, tx)
    const aggregate = new GradeAggregate(gradeRow, activeOverrides)
    const now = new Date().toISOString()

    for (const e of entries) {
      // Domain invariant (range 0-10) + supersede version semantics ở đây
      aggregate.override(e.scoreField, e.manualValue, 'TeacherAdjustment', e.reasonNote ?? null, userId, policyVersionId)
    }

    await this.persistOverrideVersions(tx, aggregate, gradeRow, parishId)
    await this.persistOverrideEvents(tx, aggregate, gradeRow, parishId, userId, ip, userAgent, undefined, now)

    aggregate.clearUncommittedEvents()
  }

  private async persistOverrideVersions(
    tx: DbExecutor,
    aggregate: GradeAggregate,
    grade: GradeRecordDTO,
    parishId: string
  ): Promise<void> {
    for (const ov of aggregate.getActiveOverrides()) {
      if (ov.version > 1) {
        await tx.update(gradeOverrides).set(ov).where(and(eq(gradeOverrides.id, ov.id), eq(gradeOverrides.parishId, parishId)))
      } else {
        // audit (P4): override mới được gắn parishId
        // của tenant hiện hành (không để default 'gia-ton' khi ghi cho giáo xứ khác).
        await tx.insert(gradeOverrides).values({ ...ov, parishId, gradeId: grade.id })
      }
    }
  }

  private async persistOverrideEvents(
    tx: DbExecutor,
    aggregate: GradeAggregate,
    grade: GradeRecordDTO,
    parishId: string,
    userId: string,
    ip: string,
    userAgent: string,
    idempotencyKey: string | undefined,
    now: string
  ): Promise<void> {
    for (const evt of aggregate.getUncommittedEvents()) {
      const overridePayload = evt.payload as unknown as GradeOverrideDTO

      if (evt.eventType === 'GradeOverrideRemoved') {
        await tx
          .update(gradeOverrides)
          .set({ deletedAt: overridePayload.deletedAt, version: overridePayload.version, updatedAt: now })
          .where(and(eq(gradeOverrides.id, overridePayload.id), eq(gradeOverrides.parishId, parishId)))
        // audit (P5): trả source field về 'không manual'
        // — nếu không guard server sẽ vẫn coi field là bảo vệ (source cũ 'manual')
        // và chặn mọi ghi đè tự động sau restore (điểm mắc kẹt).
        // GRADE-ARCH-02 (2026-08-09): tên cột derive từ metadata SSOT, không viết tay.
        const scoreMeta = SCORE_META_BY_FIELD.get(overridePayload.scoreField)
        if (scoreMeta) {
          await tx
            .update(grades)
            .set({
              [scoreMeta.sqlSourceColumn]: null,
              [scoreMeta.sqlUpdatedAtColumn]: null,
            } as never)
            .where(and(eq(grades.id, grade.id), eq(grades.parishId, parishId)))
        }
      }

      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId,
        action: evt.eventType === 'GradeOverrideRemoved' ? 'RESTORE_GRADE' : 'OVERRIDE_GRADE',
        entityType: 'grade_override',
        entityId: overridePayload.id,
        oldValue: null,
        newValue: JSON.stringify(overridePayload),
        ip,
        userAgent,
        parishId,
        createdAt: now,
      })

      // Phase 2 (outbox convergence): KHÔNG insert outbox_messages nữa.
        // audit_logs trong transaction này là trail chính. Telegram và thông báo
        // override ngoài ứng dụng đã retire; không phát sinh side effect ở đây.
    }
  }

  public async findOverrideHistory(gradeId: string, parishId: string): Promise<any[]> {
    const overrides = await db
      .select({ id: gradeOverrides.id })
      .from(gradeOverrides)
      .where(and(eq(gradeOverrides.gradeId, gradeId), eq(gradeOverrides.parishId, parishId)))

    const overrideIds = overrides.map((o) => o.id)
    if (overrideIds.length === 0) return []

    const { inArray, desc } = await import('drizzle-orm')
    return db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, 'grade_override'),
          eq(auditLogs.parishId, parishId),
          inArray(auditLogs.entityId, overrideIds)
        )
      )
      .orderBy(desc(auditLogs.createdAt))
  }
}

export const drizzleGradeRepository = new DrizzleGradeRepository()
