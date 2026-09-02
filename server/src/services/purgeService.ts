import { createHash } from 'crypto'
import { sql, and, eq } from 'drizzle-orm'
import { db, client } from '../db/index.js'
import { auditLogs, systemSettings } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { writeSafetySnapshot, pruneSafetySnapshots } from './safetySnapshot.js'

export const PURGE_CONFIRM_KEY = 'XÓA TẤT CẢ'

export const PURGE_VERSION_KEY = 'purge_version'
export const DEFAULT_PURGE_VERSION = 1

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
}

/**
 * PURGE v2.5 — Xóa 31 bảng nghiệp vụ thuộc hợp đồng purge trong 1 transaction.
 * Giữ nguyên: users, branches, permissions, rolePermissions, auditLogs,
 * pushSubscriptions, nativePushTokens, systemSettings.
 * - Không DROP bảng / không xóa function / trigger / schema — chỉ DELETE rows.
 * - DELETE scope theo parish_id (toàn bộ 31 bảng trong danh sách — P4: grade_overrides/outbox_messages
 *   đã có cột parish_id từ migration 096/097, không còn special-case join).
 * - Snapshot v3.2 (31 bảng, SHA256 checksum) ghi file trước khi xóa.
 * - purge_version tăng 1 → client khác phát hiện ghost data và tự reset.
 * - auditLogs ghi 1 entry 'SYSTEM_PURGE' kèm counts trước-khi-xóa.
 */
export async function purgeParishData(
  options: PurgeSnapshotOptions,
): Promise<{ countsBefore: Record<string, number>; purgeVersion: number }> {
  const { parishId, userId } = options

  const countsBefore: Record<string, number> = {}
  const snapshotData: Record<string, any[]> = {}

  // 1. Đếm + snapshot toàn bộ dữ liệu trước khi xóa (v3.2: đủ 31 bảng, scope theo parish).
  for (const name of DELETE_ORDER) {
    const rows = (await client.execute(
      `SELECT * FROM ${name} WHERE parish_id = ?`,
      [parishId],
    )).rows as any[]
    snapshotData[name] = rows
    countsBefore[name] = rows.length
  }

  const snapshotPayload = {
    type: 'PURGE_SAFETY_SNAPSHOT',
    version: '3.2',
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
  const nextVersion = await db.transaction(async (tx) => {
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

    // A-NEW-36 (2026-08-11): lọc theo CẢ key + parishId — trước đây SELECT chỉ theo
    // key GLOBAL (PK cũ) → purge của parish này có thể đọc/upsert đè purge_version
    // của parish khác (dữ liệu bị 'cướp', ghost data không bao giờ wipe).
    const [existing] = await tx.select().from(systemSettings)
      .where(and(eq(systemSettings.key, PURGE_VERSION_KEY), eq(systemSettings.parishId, parishId)))
      .limit(1)
    const currentVersion = existing && existing.value
      ? Number(existing.value)
      : DEFAULT_PURGE_VERSION
    const nextVersion = currentVersion + 1

    const now = new Date().toISOString()
    await tx.insert(systemSettings)
      .values({
        key: PURGE_VERSION_KEY,
        value: String(nextVersion),
        description: 'Purge version marker — tăng khi xóa toàn bộ dữ liệu giáo xứ',
        updatedBy: userId,
        updatedAt: now,
        parishId,
      })
      .onConflictDoUpdate({
        // A-NEW-36: target phải khớp composite PK (key, parish_id) — target key đơn
        // sẽ sinh ON CONFLICT(key) không khớp PK → SQLITE_CONSTRAINT mọi lần purge.
        target: [systemSettings.key, systemSettings.parishId],
        set: {
          value: String(nextVersion),
          updatedBy: userId,
          updatedAt: now,
          parishId,
        },
      })

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
