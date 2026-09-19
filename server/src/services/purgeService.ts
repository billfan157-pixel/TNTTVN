import { createHash } from 'crypto'
import { sql } from 'drizzle-orm'
import { runDbTransaction, type DbExecutor } from '../db/index.js'
import { auditLogs } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { writeSafetySnapshot, pruneSafetySnapshots, safetySnapshotDigest, assertSafetySnapshotUnchanged } from './safetySnapshot.js'
import { advanceClientResetVersion } from './clientDataGeneration.js'
import type { AdminReauthProof } from './userService.js'

export { PURGE_VERSION_KEY, DEFAULT_PURGE_VERSION } from './clientDataGeneration.js'

export const PURGE_CONFIRM_KEY = 'XÓA TẤT CẢ'

// ─── Các bảng nghiệp vụ thuộc hợp đồng Purge v2.5 ───
// Mọi bảng đều có cột parish_id → xóa theo parish (audit P4:
// grade_overrides + outbox_messages đã add-column migration 096/097 — bỏ join-workaround v1.0).
export const PURGE_TABLES = [
  'password_reset_requests',
  'feedback_messages',
  'grade_overrides',
  'academic_year_snapshots',
  'assessments',
  'promotion_records',
  'attendance_sessions',
  'exam_result_mutations',
  'exam_results',
  'exam_question_snapshots',
  'exam_sessions',
  'exam_blueprint_rules',
  'exam_blueprints',
  'question_bank_versions',
  'question_bank_items',
  'catechist_assignments',
  'notifications',
  'refresh_tokens',
  'attendance',
  'grades',
  'service_assignments',
  'import_batch_students',
  'import_batches',
  'grade_import_hashes',
  'mapping_memory',
  'notices',
  'outbox_messages',
  'semester_locks',
  'students',
  'classes',
  'academic_years',
] as const

export type PurgeTableName = (typeof PURGE_TABLES)[number]

// Snapshot coverage includes the FK delete closure, without granting any new
// explicit deletion authority. In particular manual assessment entries remain
// protected by their student RESTRICT FK and still cause the purge to roll back.
export const PURGE_SNAPSHOT_TABLES = [
  ...PURGE_TABLES,
  'assessment_entries', 'exam_finalizations', 'exam_finalization_items',
  'leave_requests', 'student_fee_records',
] as const

async function capturePurgeSafetyData(executor: DbExecutor, parishId: string): Promise<Record<string, unknown[]>> {
  const data: Record<string, unknown[]> = {}
  for (const name of PURGE_SNAPSHOT_TABLES) {
    data[name] = await executor.all(sql`SELECT * FROM ${sql.raw(name)} WHERE parish_id = ${parishId}`)
  }
  return data
}

// Thứ tự DELETE con-trước-cha-trước (an toàn ngay cả khi không dùng defer_foreign_keys).
const DELETE_ORDER: PurgeTableName[] = [
  'password_reset_requests', // FK -> users (users được giữ)
  'feedback_messages',       // FK nullable/restrict -> users (users được giữ)
  'grade_overrides',        // FK → grades
  'academic_year_snapshots', // FK → academicYears, students
  'assessments',            // FK → academicYears
  'promotion_records',      // FK → students
  'attendance_sessions',    // FK → classes
  'exam_result_mutations',  // FK → exam_sessions, students
  'exam_results',           // FK → exam_sessions, students
  'exam_question_snapshots', // FK → exam_sessions, question bank/version
  'exam_sessions',          // FK → classes, blueprint
  'exam_blueprint_rules',   // FK → exam_blueprints
  'exam_blueprints',        // FK → branches, users (giữ)
  'question_bank_versions', // FK → question_bank_items, users (giữ)
  'question_bank_items',    // FK → branches, users (giữ)
  'catechist_assignments',  // FK → classes, users (giữ users)
  'notifications',          // FK → students (set null), users (set null)
  'refresh_tokens',         // FK → users (cascade) — xóa phiên đăng nhập tránh ghost session
  'attendance',             // FK → students
  'grades',                 // FK → students
  'service_assignments',    // FK → students
  'import_batch_students',  // FK → importBatches, students
  'import_batches',         // FK → users
  'grade_import_hashes',    // FK → users
  'mapping_memory',         // không FK
  'notices',                // không FK
  'outbox_messages',        // không FK — xóa sạch để không replay event của dữ liệu đã purge
  'semester_locks',         // không FK
  'students',               // FK → classes
  'classes',                // FK → branches (giữ), academicYears
  'academic_years',
]

function computeChecksum(dataObj: any): string {
  return createHash('sha256').update(JSON.stringify(dataObj)).digest('hex')
}

interface PurgeSnapshotOptions {
  parishId: string
  userId: string
  reauth: AdminReauthProof
}

/**
 * PURGE v2.5 — Xóa 31 bảng nghiệp vụ thuộc hợp đồng purge trong 1 transaction.
 * Giữ nguyên: users, branches, permissions, rolePermissions, auditLogs,
 * pushSubscriptions, nativePushTokens, systemSettings.
 * - Không DROP bảng / không xóa function / trigger / schema — chỉ DELETE rows.
 * - DELETE scope theo parish_id (toàn bộ 31 bảng trong danh sách — P4: grade_overrides/outbox_messages
 *   đã có cột parish_id từ migration 096/097, không còn special-case join).
 * - Snapshot v3.3 includes explicit deletes and cascade coverage; unchanged-state
 *   verification inside the delete transaction binds the file to destroyed data.
 * - purge_version tăng 1 → client khác phát hiện ghost data và tự reset.
 * - auditLogs ghi 1 entry 'SYSTEM_PURGE' kèm counts trước-khi-xóa.
 */
export async function purgeParishData(
  options: PurgeSnapshotOptions,
): Promise<{ countsBefore: Record<string, number>; purgeVersion: number }> {
  const { parishId, userId, reauth } = options

  // One coherent capture; blob publication happens after releasing the DB lock.
  const snapshotData = await runDbTransaction(tx => capturePurgeSafetyData(tx, parishId))
  const expectedDigest = safetySnapshotDigest(snapshotData)
  const countsBefore = Object.fromEntries(Object.entries(snapshotData).map(([name, rows]) => [name, rows.length]))

  const snapshotPayload = {
    type: 'PURGE_SAFETY_SNAPSHOT',
    version: '3.3',
    parishId,
    exportedBy: userId,
    exportedAt: new Date().toISOString(),
    checksum: computeChecksum(snapshotData),
    counts: countsBefore,
    data: snapshotData,
  }

  // A-NEW-34 + ADR-041: ghi safety snapshot qua blobStorage (R2 nếu cấu hình,
  // fallback local chmod 0600). Chứa toàn bộ PII → giữ 5 bản mới nhất/parish.
  await writeSafetySnapshot('purge-safety', parishId, snapshotPayload)
  await pruneSafetySnapshots(5)

  // 2. Purge trong 1 transaction (AD-011: service sở hữu transaction boundary).
  // PRAGMA defer_foreign_keys: FK chỉ được kiểm tra tại commit — vì mọi row reference
  // đều đã bị xóa trong cùng transaction nên commit luôn hợp lệ (bảo hiểm kép cho thứ tự DELETE).
  // Verify nằm TRONG transaction: nếu bất kỳ bảng nào không về 0 → throw → rollback toàn bộ.
  const nextVersion = await runDbTransaction(async (tx) => {
    await reauth(tx, userId, parishId, parishId, 'SYSTEM_PURGE_FAILED')
    assertSafetySnapshotUnchanged(expectedDigest, await capturePurgeSafetyData(tx, parishId))
    try {
      await tx.run(sql`PRAGMA defer_foreign_keys = ON`)
    } catch { /* pragma không bắt buộc — thứ tự DELETE đã an toàn */ }

    for (const name of DELETE_ORDER) {
      await tx.run(sql`DELETE FROM ${sql.raw(name)} WHERE parish_id = ${parishId}`)
    }

    for (const name of DELETE_ORDER) {
      const countRow = await tx.get<{ n: number }>(sql`SELECT count(*) AS n FROM ${sql.raw(name)} WHERE parish_id = ${parishId}`)
      if (Number(countRow?.n ?? 0) !== 0) {
        throw new Error(`PURGE_VERIFY_FAILED: bảng ${name} còn ${countRow?.n} row sau purge`)
      }
    }

    // A-NEW-36: marker is tenant-scoped and advances in the same transaction as
    // the destructive mutation. JSON restore reuses this boundary as well.
    const nextVersion = await advanceClientResetVersion(tx, parishId, userId)
    const now = new Date().toISOString()

    // Audit log — ghi SAU khi purge, trong cùng transaction (audit_logs không bị xóa).
    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'SYSTEM_PURGE',
      entityType: 'system',
      entityId: 'purge',
      oldValue: JSON.stringify(countsBefore),
      newValue: JSON.stringify({ purgeVersion: nextVersion }),
      parishId,
      createdAt: now,
    })

    return nextVersion
  })

  return { countsBefore, purgeVersion: nextVersion }
}
