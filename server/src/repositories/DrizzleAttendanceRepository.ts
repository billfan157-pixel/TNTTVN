import { db, type DbExecutor } from '../db/index.js'
import { attendance } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { AttendanceRecord } from '../domain/AttendanceRecord.js'
import type { AttendanceStatus, AttendanceSessionType } from '../domain/AttendanceRecord.js'
import { VersionConflictError } from '../services/gradeService.js'

export class DrizzleAttendanceRepository {
  public async findByStudentAndSession(
    studentId: string,
    date: string,
    type: AttendanceSessionType,
    parishId: string,
    tx: DbExecutor = db
  ): Promise<AttendanceRecord | null> {
    const [row] = await tx
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.parishId, parishId),
          eq(attendance.studentId, studentId),
          eq(attendance.date, date),
           eq(attendance.type, type as 'SundayMass' | 'CatechismClass')
        )
      )
      .limit(1)

    if (!row) return null

    return new AttendanceRecord({
      id: row.id,
      studentId: row.studentId,
      parishId: row.parishId,
      date: row.date,
      type: row.type as AttendanceSessionType,
      status: row.status as AttendanceStatus,
      note: row.note,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    })
  }

  public async save(record: AttendanceRecord, userId: string, parishId: string, tx: DbExecutor = db): Promise<void> {
    const now = new Date().toISOString()

    const [existing] = await tx
      .select({ id: attendance.id, version: attendance.version })
      .from(attendance)
      .where(and(eq(attendance.id, record.id), eq(attendance.parishId, parishId)))
      .limit(1)

    if (existing) {
      if (existing.version === record.version) {
        // Idempotent skip: zero version mutation, no DB write needed
        return
      }
      // ATT-03 (audit 2026-08-08): UPDATE scoped parishId — không sửa dòng bảng khác tenant
      await this.applyOccUpdate(record, existing.id, record.version - 1, now, userId, parishId, tx)
      return
    }

    try {
      await tx.insert(attendance).values({
        id: record.id,
        studentId: record.studentId,
        date: record.date,
        type: record.type as 'SundayMass' | 'CatechismClass',
        status: record.status,
        note: record.note,
        version: record.version,
        parishId,
        createdAt: now,
        updatedAt: now,
        updatedBy: userId,
      })
    } catch (err: any) {
      // ATT-01 (audit 2026-08-08): race — thiết bị khác đã chèn dòng cùng
      // (parishId, studentId, date, type) khiến UNIQUE ném 500 thô. Re-query theo
      // composite key rồi đi đúng OCC path (idempotent skip / update / conflict).
      if (!this.isUniqueViolation(err)) throw err
      const [racer] = await tx
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.parishId, parishId),
            eq(attendance.studentId, record.studentId),
            eq(attendance.date, record.date),
            eq(attendance.type, record.type as 'SundayMass' | 'CatechismClass')
          )
        )
        .limit(1)
      if (!racer) throw new Error(String(err?.cause?.message ?? err))
      if (racer.version === record.version) return
      await this.applyOccUpdate(record, racer.id, record.version - 1, now, userId, parishId, tx)
    }
  }

  private isUniqueViolation(err: any): boolean {
    let depth = 0
    let cur = err
    while (cur && depth < 4) {
      if (String(cur?.message ?? '').toLowerCase().includes('unique')) return true
      cur = cur?.cause
      depth++
    }
    return false
  }

  private async applyOccUpdate(
    record: AttendanceRecord,
    targetId: string,
    previousVersion: number,
    now: string,
    userId: string,
    parishId: string,
    tx: DbExecutor
  ): Promise<void> {
    // Optimistic Locking: UPDATE ... WHERE id = ? AND parish_id = ? AND version = ?
    const updateRes = await tx
      .update(attendance)
      .set({
        status: record.status,
        note: record.note,
        version: record.version,
        updatedAt: now,
        updatedBy: userId,
      })
      .where(and(eq(attendance.id, targetId), eq(attendance.parishId, parishId), eq(attendance.version, previousVersion)))

    const affectedRows = Number((updateRes as { changes?: number; rowsAffected?: number }).changes ?? (updateRes as { changes?: number; rowsAffected?: number }).rowsAffected ?? 1)
    if (affectedRows === 0) {
      const [fresh] = await tx
        .select()
        .from(attendance)
        .where(and(eq(attendance.id, targetId), eq(attendance.parishId, parishId)))
        .limit(1)
      throw new VersionConflictError('Bản ghi điểm danh đã bị thay đổi bởi người dùng khác.', fresh)
    }
  }
}

export const drizzleAttendanceRepository = new DrizzleAttendanceRepository()
