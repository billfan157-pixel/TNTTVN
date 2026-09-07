import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, inArray, count, getTableColumns, sql, and, ne } from 'drizzle-orm'
import { createHash } from 'crypto'
import { db, runDbTransaction, type DbTransaction, type DbExecutor } from '../db/index.js'
import {
  students, grades, attendance, classes, semesterLocks, gradeOverrides,
  promotionRecords, examSessions, examResults, auditLogs, attendanceSessions,
  academicYearSnapshots, academicYears, catechistAssignments, questionBankItems,
  questionBankVersions, examBlueprints, examBlueprintRules,
  examQuestionSnapshots,
  assessmentEntries, examResultMutations, examFinalizations, leaveRequests,
  studentFeeRecords, importBatchStudents, serviceAssignments, outboxMessages,
  notifications, financialTransactions, gradeImportHashes, mappingMemory,
} from '../db/schema.js'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { adminReauthRateLimiter } from '../middleware/security.js'
import { verifyAdminReauth } from '../services/userService.js'
import { errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { generateId } from '../utils/id.js'
import { writeSafetySnapshot, pruneSafetySnapshots } from '../services/safetySnapshot.js'
import { advanceClientResetVersion } from '../services/clientDataGeneration.js'

const backupRouter = new Hono()

/** JSON restore is a partial data import, not a complete academic recovery
 * image. Never delete immutable evidence while leaving its lifecycle state
 * behind. Repeat this preflight inside the destructive transaction to cover
 * a finalize that commits while the safety snapshot is being written. */
async function assertJsonRestoreLifecycleSafe(executor: DbExecutor, parishId: string): Promise<void> {
  const [snapshot] = await executor.select({ id: academicYearSnapshots.id }).from(academicYearSnapshots)
    .where(eq(academicYearSnapshots.parishId, parishId)).limit(1)
  const years = await executor.select({ status: academicYears.status, isLocked: academicYears.isLocked }).from(academicYears)
    .where(eq(academicYears.parishId, parishId))
  if (snapshot || years.some(year => year.isLocked === 1 || ['FINALIZED', 'PROMOTED', 'ARCHIVED'].includes(year.status || ''))) {
    throw Object.assign(new Error('Không thể dùng bản JSON khôi phục một phần khi giáo xứ có năm đã chốt hoặc snapshot học vụ. Cần quy trình khôi phục cơ sở dữ liệu đầy đủ để bảo toàn lịch sử.'), { code: 'RESTORE_PROTECTED_ACADEMIC_STATE', status: 409 })
  }
}

/**
 * The JSON profile does not contain these cross-domain facts. Replacing their
 * parents would either hit an FK backstop or silently cascade provenance/user
 * intent. Block before the safety write, and repeat in the transaction to close
 * a concurrent insert window. Full-schema recovery is the supported path.
 */
async function assertJsonRestoreDependencySafe(executor: DbExecutor, parishId: string, includeQuestionBank: boolean): Promise<void> {
  const blockers: string[] = []
  const tables: Array<{ label: string; table: any; column: any }> = [
    { label: 'assessment ledger', table: assessmentEntries, column: assessmentEntries.id },
    { label: 'exam mutation receipts', table: examResultMutations, column: examResultMutations.clientMutationId },
    { label: 'exam finalization receipts', table: examFinalizations, column: examFinalizations.id },
    { label: 'leave requests', table: leaveRequests, column: leaveRequests.id },
    { label: 'student fee records', table: studentFeeRecords, column: studentFeeRecords.id },
    { label: 'financial transactions', table: financialTransactions, column: financialTransactions.id },
    { label: 'import rollback provenance', table: importBatchStudents, column: importBatchStudents.id },
    { label: 'student service assignments', table: serviceAssignments, column: serviceAssignments.id },
    { label: 'staff class assignments', table: catechistAssignments, column: catechistAssignments.id },
    { label: 'attendance sessions', table: attendanceSessions, column: attendanceSessions.id },
    { label: 'notification history or delivery intent', table: notifications, column: notifications.id },
    { label: 'grade import receipts', table: gradeImportHashes, column: gradeImportHashes.id },
    { label: 'import mapping memory', table: mappingMemory, column: mappingMemory.id },
  ]
  for (const { label, table, column } of tables) {
    const [row] = await executor.select({ id: column }).from(table)
      .where(eq(table.parishId, parishId)).limit(1)
    if (row) blockers.push(label)
  }
  const [undispatched] = await executor.select({ id: outboxMessages.id }).from(outboxMessages)
    .where(and(eq(outboxMessages.parishId, parishId), ne(outboxMessages.status, 'dispatched'))).limit(1)
  if (undispatched) blockers.push('undispatched outbox messages')
  if (!includeQuestionBank) {
    const [questionSnapshot] = await executor.select({ id: examQuestionSnapshots.id }).from(examQuestionSnapshots)
      .where(eq(examQuestionSnapshots.parishId, parishId)).limit(1)
    if (questionSnapshot) blockers.push('exam question snapshots unsupported by this legacy backup version')
  }

  if (blockers.length > 0) {
    throw Object.assign(
      new Error(`Bản JSON không chứa đủ dependency để thay thế an toàn (${blockers.join(', ')}). Hãy dùng quy trình khôi phục cơ sở dữ liệu đầy đủ.`),
      { code: 'RESTORE_UNSUPPORTED_DEPENDENCIES', status: 409 },
    )
  }
}

backupRouter.use('/*', authMiddleware)

// ═══════════════════════════════════════════════════════════════════════════
// A07 (2026-08-10): RE-AUTHENTICATION cho /export + /restore.
//
// Trước đây: roleMiddleware('admin') là rào cản DUY NHẤT — một admin (hoặc kẻ
// chiếm session admin) có thể RESTORE (xóa sạch toàn bộ dữ liệu parish) hoặc
// EXPORT (exfiltrate toàn bộ DB) mà không cần biết mật khẩu.
//
// Giờ đây: chain bảo vệ = auth → role(admin) → adminReauthRateLimiter
// (10/60s/IP) → zValidator → verifyAdminReauth (bcrypt mật khẩu HIỆN TẠI của
// admin — SSOT, audit RESTORE_BACKUP_FAILED / EXPORT_BACKUP_FAILED khi sai)
// → checksum → mới chạm dữ liệu. Audit EXPORT_BACKUP / RESTORE_BACKUP đầy đủ.
// ═══════════════════════════════════════════════════════════════════════════

const adminPasswordSchema = z.string().min(1, 'Mật khẩu xác nhận Admin không được để trống').max(128)

const restoreRowSchema = z.record(z.string(), z.any())

// Restore: adminPassword BẮT BUỘC + data phải là snapshot chuẩn (students luôn
// có — file export luôn sinh ra). Passthrough cho các khóa legacy (users...).
//
// A19 (2026-08-10): checksum + parish BẮT BUỘC (fail-closed cho destructive op) —
// export luôn sinh checksum SHA256 + ghi parish nguồn; thiếu/không khớp → 400
// TRƯỚC khi chạm dữ liệu. Trước đây checksum optional → restore chạy tiếp khi
// file thiếu integrity metadata.
const restoreBackupSchema = z.object({
  adminPassword: adminPasswordSchema,
  checksum: z.string().regex(/^[a-f0-9]{64}$/i, 'checksum phải là SHA256 hex (64 ký tự)'),
  parish: z.string().min(1, 'thiếu parish nguồn của file sao lưu'),
  version: z.union([z.number(), z.string()]).optional(),
  exportedAt: z.string().optional(),
  data: z.object({
    students: z.array(restoreRowSchema),
    grades: z.array(restoreRowSchema).default([]),
    attendance: z.array(restoreRowSchema).default([]),
    classes: z.array(restoreRowSchema).default([]),
    semesterLocks: z.array(restoreRowSchema).default([]),
    gradeOverrides: z.array(restoreRowSchema).default([]),
    // Export v2.0-production ghi khóa 'promotionSnapshots' (xem dataPayload trong
    // GET /export); schema phải khai ĐÚNG khóa đó, nếu không zod sẽ strip key làm
    // JSON.stringify lệch → checksum không bao giờ khớp. Khóa promotionRecords là
    // dạng legacy (đời export cũ).
    promotionSnapshots: z.array(restoreRowSchema).default([]),
    promotionRecords: z.array(restoreRowSchema).default([]),
    questionBankItems: z.array(restoreRowSchema).default([]),
    questionBankVersions: z.array(restoreRowSchema).default([]),
    examBlueprints: z.array(restoreRowSchema).default([]),
    examBlueprintRules: z.array(restoreRowSchema).default([]),
    examSessions: z.array(restoreRowSchema).default([]),
    examQuestionSnapshots: z.array(restoreRowSchema).default([]),
    examResults: z.array(restoreRowSchema).default([]),
  }),
}).passthrough()

// A-NEW-28 (2026-08-11): export đổi GET → POST body. Trước đây adminPassword nằm
// trong query string (?adminPassword=...) — credential trong URL bị rò qua nginx
// access log (log_format mặc định ghi full request line) + cache/proxy trung gian
// (A-NEW-19, P1). Giờ giống mọi endpoint re-auth khác (auth/users): POST + JSON body.
const exportBackupBodySchema = z.object({
  adminPassword: adminPasswordSchema,
})

function computeChecksum(dataObj: any): string {
  const jsonStr = JSON.stringify(dataObj)
  return createHash('sha256').update(jsonStr).digest('hex')
}

// A21 (2026-08-10): upsert — restore phải đạt "expected state == actual state",
// KHÔNG best-effort. onConflictDoUpdate thay onConflictDoNothing: nếu pk đã tồn
// tại (restore 2 lần, delete thất bại…), row được GHI ĐÈ bằng giá trị snapshot
// thay vì bỏ qua im lặng → không còn silent data loss.
//
// A-NEW-26 (2026-08-11): BATCH upsert (100 rows/statement) thay vì row-by-row —
// restore 10k+ rows cũ phát sinh 10k+ INSERT đơn lẻ trong 1 transaction (giữ lock
// lâu, dễ SQLITE_BUSY dưới concurrency). Batch giảm ~N/100 số statement → rút ngắn
// thời gian giữ lock đáng kể. Atomicity GIỮ NGUYÊN: mọi batch nằm trong cùng
// transaction; lỗi bất kỳ → rollback toàn bộ (A20 fail-fast).
// Duplicate id trong payload: last-write-wins trong batch (excluded.*) rồi
// verifyActualCount phát hiện lệch count → rollback (giữ nguyên hành vi A21).
const UPSERT_BATCH_SIZE = 100

// Domain 2 (2026-08-20): IDs are tenant-local. Every restored row is forced to
// the authenticated parish and the conflict target is the composite PK
// (parish_id, id). A row in another parish with the same logical id is therefore
// valid and must not block restore; the old cross-parish-id guard encoded the
// obsolete assumption that id was globally unique and caused false restore
// failures after the composite-key migration.
async function upsertAll(tx: DbTransaction, table: any, rows: any[], _label: string, parishId: string) {
  if (rows.length === 0) return
  const columns = Object.values(getTableColumns(table)) as { name: string }[]
  const setMap: Record<string, unknown> = {}
  for (const col of columns) {
    setMap[col.name] = sql.raw(`excluded.${JSON.stringify(col.name)}`)
  }
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows
      .slice(i, i + UPSERT_BATCH_SIZE)
      .map((row: Record<string, any>) => ({ ...row, parishId }))
    await tx
      .insert(table)
      .values(batch)
      .onConflictDoUpdate({ target: [table.parishId, table.id], set: setMap })
  }
}

// A21: xác minh count THỰC TẾ sau restore == count mong đợi (payload). Lệch →
// throw → transaction rollback → 500. Endpoint không bao giờ trả success với
// state không khớp snapshot.
async function verifyActualCount(tx: DbTransaction, table: any, label: string, expected: number, where: any) {
  const [row] = await tx.select({ c: count() }).from(table).where(where)
  if (Number(row?.c ?? 0) !== expected) {
    throw new Error(`Kiểm tra khôi phục thất bại [${label}]: mong đợi ${expected}, thực tế ${row?.c ?? 0} — đã rollback`)
  }
}

/**
 * Sprint 3.1: REAL SERVER BACKUP ENDPOINT
 *
 * A22 (2026-08-10): sửa tuyên bố "100% of Parish LMS records" SAI LỆCH.
 * File này = snapshot dữ liệu HOẠT ĐỘNG (14 bảng): students, grades, attendance,
 * classes, semesterLocks, gradeOverrides, promotionSnapshots (bảng
 * `promotion_records` — key payload giữ tên legacy), questionBankItems,
 * questionBankVersions, examBlueprints, examBlueprintRules, examSessions,
 * examQuestionSnapshots, examResults — kèm SHA256 checksum. Đây là partial
 * interchange profile, không phải database backup. Auth/audit/config không nằm
 * trong payload. Restore từ chối trước mutation nếu state hiện tại có lifecycle,
 * ledger, receipt, assignment, notification hoặc provenance ngoài profile mà
 * việc thay parent rows có thể xóa hoặc rebind; dùng full-schema recovery cho
 * các trạng thái đó (chi tiết: SECURITY_AUDIT_LOG XD-20260907).
 */
backupRouter.post('/export', roleMiddleware('admin'), adminReauthRateLimiter, zValidator('json', exportBackupBodySchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { adminPassword } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  // A07: re-authentication TRƯỚC khi đọc toàn bộ dữ liệu parish — chống
  // exfiltration bằng token/session admin bị đánh cắp.
  const reauthOk = await verifyAdminReauth(user.userId, adminPassword, user.parishId, ip, userAgent, user.parishId, 'EXPORT_BACKUP_FAILED')
  if (!reauthOk) return errorResponse(c, 'INVALID_ADMIN_PASSWORD', 'Mật khẩu xác nhận Admin không chính xác', 401)

  try {
    const exportedAt = new Date().toISOString()
    const dateStr = exportedAt.split('T')[0]
    const fileName = `parish-lms-backup-${dateStr}.json`

    c.header('Content-Type', 'application/json')
    c.header('Content-Disposition', `attachment; filename="${fileName}"`)

    return stream(c, async (st) => {
      const hash = createHash('sha256')
      
      async function writeData(chunk: string) {
        hash.update(chunk)
        await st.write(chunk)
      }

      await st.write(`{"version":"2.1-question-bank","parish":${JSON.stringify(user.parishId)},"exportedAt":${JSON.stringify(exportedAt)},"data":`)
      await writeData('{')

      const counts: Record<string, number> = {}

      async function streamTable(tableName: string, query: any, isFirst: boolean) {
        if (!isFirst) await writeData(',')
        await writeData(`${JSON.stringify(tableName)}:[`)
        
        let offset = 0
        const limit = 2000
        let firstRow = true
        let count = 0
        
        while (true) {
          const batch = await query.limit(limit).offset(offset)
          if (batch.length === 0) break
          for (const row of batch) {
            if (!firstRow) await writeData(',')
            await writeData(JSON.stringify(row))
            firstRow = false
            count++
          }
          offset += limit
        }
        await writeData(']')
        counts[tableName] = count
      }

      await streamTable('students', db.select().from(students).where(eq(students.parishId, user.parishId)), true)
      await streamTable('grades', db.select().from(grades).where(eq(grades.parishId, user.parishId)), false)
      await streamTable('attendance', db.select().from(attendance).where(eq(attendance.parishId, user.parishId)), false)
      await streamTable('classes', db.select().from(classes).where(eq(classes.parishId, user.parishId)), false)
      await streamTable('semesterLocks', db.select().from(semesterLocks).where(eq(semesterLocks.parishId, user.parishId)), false)
      
      const overrideQuery = db.select({
        id: gradeOverrides.id,
        gradeId: gradeOverrides.gradeId,
        parishId: gradeOverrides.parishId,
        scoreField: gradeOverrides.scoreField,
        manualValue: gradeOverrides.manualValue,
        reasonCode: gradeOverrides.reasonCode,
        reasonNote: gradeOverrides.reasonNote,
        overriddenBy: gradeOverrides.overriddenBy,
        overriddenAt: gradeOverrides.overriddenAt,
        version: gradeOverrides.version,
        deletedAt: gradeOverrides.deletedAt,
        createdAt: gradeOverrides.createdAt,
        updatedAt: gradeOverrides.updatedAt,
      }).from(gradeOverrides).where(eq(gradeOverrides.parishId, user.parishId))
      await streamTable('gradeOverrides', overrideQuery, false)
      
      await streamTable('promotionSnapshots', db.select().from(promotionRecords).where(eq(promotionRecords.parishId, user.parishId)), false)
      await streamTable('questionBankItems', db.select().from(questionBankItems).where(eq(questionBankItems.parishId, user.parishId)), false)
      await streamTable('questionBankVersions', db.select().from(questionBankVersions).where(eq(questionBankVersions.parishId, user.parishId)), false)
      await streamTable('examBlueprints', db.select().from(examBlueprints).where(eq(examBlueprints.parishId, user.parishId)), false)
      await streamTable('examBlueprintRules', db.select().from(examBlueprintRules).where(eq(examBlueprintRules.parishId, user.parishId)), false)
      await streamTable('examSessions', db.select().from(examSessions).where(eq(examSessions.parishId, user.parishId)), false)
      await streamTable('examQuestionSnapshots', db.select().from(examQuestionSnapshots).where(eq(examQuestionSnapshots.parishId, user.parishId)), false)
      
      const sessionRecords = await db.select({id: examSessions.id}).from(examSessions).where(eq(examSessions.parishId, user.parishId))
      const sessionIds = sessionRecords.map(s => s.id)
      
      if (sessionIds.length > 0) {
        await streamTable('examResults', db.select().from(examResults).where(and(
          eq(examResults.parishId, user.parishId),
          inArray(examResults.examSessionId, sessionIds),
        )), false)
      } else {
        await streamTable('examResults', db.select().from(examResults).where(and(
          eq(examResults.parishId, user.parishId),
          eq(examResults.id, '__none__'),
        )), false)
      }

      await writeData('}') // end of data

      const checksum = hash.digest('hex')
      await st.write(`,"counts":${JSON.stringify(counts)},"checksum":${JSON.stringify(checksum)}}`)

      // Ghi audit log sau khi stream thành công
      await db.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: user.userId,
        action: 'EXPORT_BACKUP',
        entityType: 'parish',
        entityId: user.parishId,
        newValue: JSON.stringify({
          exportedAt,
          checksum,
          counts,
        }),
        ip,
        userAgent,
        parishId: user.parishId,
      }).catch(e => console.error('Lỗi lưu audit log (Export Backup):', e))
    })
  } catch (err: any) {
    console.error('SERVER BACKUP EXPORT ERROR:', err)
    return c.json({ error: 'Failed to generate database backup', details: process.env.NODE_ENV === 'development' ? err?.message || String(err) : undefined }, 500)
  }
})

/**
 * Sprint 3.2: REAL SERVER RESTORE ENDPOINT WITH CHECKSUM & AUTO-SAFETY BACKUP
 */
backupRouter.post('/restore', roleMiddleware('admin'), adminReauthRateLimiter, zValidator('json', restoreBackupSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const payload = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  // A07: re-authentication TRƯỚC khi chạm dữ liệu — sai mật khẩu → 401 (audit
  // RESTORE_BACKUP_FAILED ghi bởi verifyAdminReauth), KHÔNG xóa gì cả.
  const reauthOk = await verifyAdminReauth(user.userId, payload.adminPassword, user.parishId, ip, userAgent, user.parishId, 'RESTORE_BACKUP_FAILED')
  if (!reauthOk) return errorResponse(c, 'INVALID_ADMIN_PASSWORD', 'Mật khẩu xác nhận Admin không chính xác', 401)

  try {

    // A19: checksum + parish BẮT BUỘC — validate TRƯỚC khi chạm dữ liệu.
    if (payload.parish !== user.parishId) {
      return errorResponse(c, 'RESTORE_PARISH_MISMATCH', `File sao lưu thuộc giáo xứ khác (${payload.parish}) — không thể khôi phục vào giáo xứ hiện tại`, 400)
    }

    // Lưu ý: zod đã normalize/strip data — phải dựng lại object ĐÚNG cấu trúc
    // dataPayload lúc export (cùng key + cùng thứ tự) trước khi băm SHA256.
    const includeQuestionBank = payload.version === '2.1-question-bank'
    const legacyNormalizedData = {
      students: payload.data.students,
      grades: payload.data.grades,
      attendance: payload.data.attendance,
      classes: payload.data.classes,
      semesterLocks: payload.data.semesterLocks,
      gradeOverrides: payload.data.gradeOverrides,
      promotionSnapshots: payload.data.promotionSnapshots.length > 0 ? payload.data.promotionSnapshots : (payload.data.promotionRecords ?? []),
      examSessions: payload.data.examSessions,
      examResults: payload.data.examResults,
    }
    const normalizedData = includeQuestionBank ? {
      students: payload.data.students,
      grades: payload.data.grades,
      attendance: payload.data.attendance,
      classes: payload.data.classes,
      semesterLocks: payload.data.semesterLocks,
      gradeOverrides: payload.data.gradeOverrides,
      promotionSnapshots: payload.data.promotionSnapshots.length > 0 ? payload.data.promotionSnapshots : (payload.data.promotionRecords ?? []),
      questionBankItems: payload.data.questionBankItems,
      questionBankVersions: payload.data.questionBankVersions,
      examBlueprints: payload.data.examBlueprints,
      examBlueprintRules: payload.data.examBlueprintRules,
      examSessions: payload.data.examSessions,
      examQuestionSnapshots: payload.data.examQuestionSnapshots,
      examResults: payload.data.examResults,
    } : legacyNormalizedData
    const calculatedHash = computeChecksum(normalizedData)
    if (calculatedHash !== payload.checksum) {
      return c.json({ error: 'File sao lưu bị hỏng hoặc đã bị chỉnh sửa (Lỗi SHA256 Checksum Mismatch)' }, 400)
    }

    // A-NEW-26 (2026-08-11): PREFLIGHT size guard TRƯỚC khi chạm dữ liệu. Restore
    // chạy trong 1 transaction (atomicity — A20/A21); snapshot quá lớn → hàng trăm
    // nghìn INSERT giữ lock SQLite lâu → mọi request khác dính SQLITE_BUSY, và nếu
    // lỗi giữa chừng thì toàn bộ công sức rollback. Từ chối sớm 400 + message rõ
    // ràng thay vì để người dùng vô tình đẩy file khổng lồ vào parish thật.
    const MAX_RESTORE_ROWS = 200_000
    const totalRows =
      (payload.data.students?.length ?? 0) +
      (payload.data.grades?.length ?? 0) +
      (payload.data.attendance?.length ?? 0) +
      (payload.data.classes?.length ?? 0) +
      (payload.data.semesterLocks?.length ?? 0) +
      (payload.data.gradeOverrides?.length ?? 0) +
      (payload.data.promotionSnapshots?.length ?? 0) +
      (includeQuestionBank ? payload.data.questionBankItems.length : 0) +
      (includeQuestionBank ? payload.data.questionBankVersions.length : 0) +
      (includeQuestionBank ? payload.data.examBlueprints.length : 0) +
      (includeQuestionBank ? payload.data.examBlueprintRules.length : 0) +
      (payload.data.examSessions?.length ?? 0) +
      (includeQuestionBank ? payload.data.examQuestionSnapshots.length : 0) +
      (payload.data.examResults?.length ?? 0)
    if (totalRows > MAX_RESTORE_ROWS) {
      return c.json({ error: `File sao lưu quá lớn (${totalRows} dòng — giới hạn ${MAX_RESTORE_ROWS}) — không thể khôi phục`, }, 400)
    }

    await assertJsonRestoreLifecycleSafe(db, user.parishId)
    await assertJsonRestoreDependencySafe(db, user.parishId, includeQuestionBank)

    // 2. Pre-Restore Auto-Safety Backup — A20: fail-closed. KHÔNG .catch(() => [])
    // như trước: không đọc được dữ liệu hiện tại → không thể tạo bản rollback →
    // ABORT restore (thay vì ghi file safety RỖNG + restore tiếp).
    let safetyData: Record<string, unknown>
    try {
      const currentStudents = await db.select().from(students).where(eq(students.parishId, user.parishId))
      const currentGrades = await db.select().from(grades).where(eq(grades.parishId, user.parishId))
      const currentAttendance = await db.select().from(attendance).where(eq(attendance.parishId, user.parishId))
      const currentClasses = await db.select().from(classes).where(eq(classes.parishId, user.parishId))
      const currentLocks = await db.select().from(semesterLocks).where(eq(semesterLocks.parishId, user.parishId))
      const currentOverrides = await db.select().from(gradeOverrides).where(eq(gradeOverrides.parishId, user.parishId))
      const currentPromotions = await db.select().from(promotionRecords).where(eq(promotionRecords.parishId, user.parishId))
      const currentQuestionBankItems = await db.select().from(questionBankItems).where(eq(questionBankItems.parishId, user.parishId))
      const currentQuestionBankVersions = await db.select().from(questionBankVersions).where(eq(questionBankVersions.parishId, user.parishId))
      const currentExamBlueprints = await db.select().from(examBlueprints).where(eq(examBlueprints.parishId, user.parishId))
      const currentExamBlueprintRules = await db.select().from(examBlueprintRules).where(eq(examBlueprintRules.parishId, user.parishId))
      const currentExamSessions = await db.select().from(examSessions).where(eq(examSessions.parishId, user.parishId))
      const currentExamQuestionSnapshots = await db.select().from(examQuestionSnapshots).where(eq(examQuestionSnapshots.parishId, user.parishId))
      const currentSessionIds = currentExamSessions.map((s) => s.id)
      const currentExamResults = currentSessionIds.length > 0
        ? await db.select().from(examResults).where(and(
            eq(examResults.parishId, user.parishId),
            inArray(examResults.examSessionId, currentSessionIds),
          ))
        : []
      const currentAttendanceSessions = await db.select().from(attendanceSessions).where(eq(attendanceSessions.parishId, user.parishId))
      const currentYearSnapshots = await db.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, user.parishId))
      const currentAssignments = await db.select().from(catechistAssignments).where(eq(catechistAssignments.parishId, user.parishId))

      // A-NEW-37 + Question Bank: snapshot ĐỦ 17 bảng mà restore hiện đại có thể xóa
      // (trước đây chỉ 4: students/grades/attendance/classes — file "safety" thiếu
      // các bảng còn lại nên
      // không thể khôi phục tay toàn bộ state trước restore).
      safetyData = {
        students: currentStudents,
        grades: currentGrades,
        attendance: currentAttendance,
        classes: currentClasses,
        semesterLocks: currentLocks,
        gradeOverrides: currentOverrides,
        promotionRecords: currentPromotions,
        questionBankItems: currentQuestionBankItems,
        questionBankVersions: currentQuestionBankVersions,
        examBlueprints: currentExamBlueprints,
        examBlueprintRules: currentExamBlueprintRules,
        examSessions: currentExamSessions,
        examQuestionSnapshots: currentExamQuestionSnapshots,
        examResults: currentExamResults,
        attendanceSessions: currentAttendanceSessions,
        academicYearSnapshots: currentYearSnapshots,
        catechistAssignments: currentAssignments,
      }

      const safetyPayload = {
        type: 'AUTO_SAFETY_SNAPSHOT',
        parishId: user.parishId,
        exportedAt: new Date().toISOString(),
        checksum: computeChecksum(safetyData),
        data: safetyData
      }

      // A-NEW-34 + ADR-041: ghi safety snapshot qua blobStorage (R2 nếu cấu hình,
      // fallback local chmod 0600). Chứa toàn bộ PII → giữ 5 bản mới nhất/parish.
      await writeSafetySnapshot('pre-restore-safety', user.parishId, safetyPayload)
      await pruneSafetySnapshots(5)
    } catch (safetyErr: any) {
      console.error('AUTO SAFETY SNAPSHOT FAILED — ABORT RESTORE:', safetyErr)
      await db.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: user.userId,
        action: 'RESTORE_BACKUP_FAILED',
        entityType: 'backup',
        entityId: user.parishId,
        newValue: JSON.stringify({ reason: 'safety_snapshot_failed', error: String(safetyErr?.message || safetyErr) }),
        ip,
        userAgent,
        parishId: user.parishId,
      }).catch(() => {})
      return c.json({ error: 'Không thể tạo bản sao lưu an toàn trước khi khôi phục — đã hủy restore', details: process.env.NODE_ENV === 'development' ? String(safetyErr?.message || safetyErr) : undefined }, 500)
    }

    const {
      students: restoredStudents,
      grades: restoredGrades,
      attendance: restoredAttendance,
      classes: restoredClasses,
      semesterLocks: restoredSemesterLocks,
      gradeOverrides: restoredGradeOverrides,
      promotionSnapshots: restoredPromotionSnapshots,
      questionBankItems: restoredQuestionBankItems,
      questionBankVersions: restoredQuestionBankVersions,
      examBlueprints: restoredExamBlueprints,
      examBlueprintRules: restoredExamBlueprintRules,
      examSessions: restoredExamSessions,
      examQuestionSnapshots: restoredExamQuestionSnapshots,
      examResults: restoredExamResults,
    } = payload.data

    const esIds = restoredExamSessions.map((s: any) => s.id)

    // A20 (2026-08-10): transaction fail-fast. BỎ .catch(() => {}) — lỗi ở bất kỳ
    // bước xóa/ghi nào → rollback TOÀN BỘ → 500 + audit lỗi (không success giả).
    // A21: upsert (onConflictDoUpdate) + xác minh count thực tế == count mong đợi.
    // A-NEW-26 (2026-08-11): dùng runDbTransaction (A-NEW-13 helper) thay
    // db.transaction — transaction restore là transaction DÀI (nhiều statement)
    // nên rủi ro SQLITE_BUSY cao; helper set busy_timeout ngay trong tx + retry
    // SQLITE_BUSY với backoff → restore không chết oan dưới concurrency.
    const purgeVersion = await runDbTransaction(async (tx) => {
      await assertJsonRestoreLifecycleSafe(tx, user.parishId)
      await assertJsonRestoreDependencySafe(tx, user.parishId, includeQuestionBank)
      // ── 1. Xóa trạng thái hiện tại của parish (con → cha; gồm các bảng phái
      //    sinh FK-restrict KHÔNG nằm trong payload để không chặn việc xóa:
      //    catechistAssignments, academicYearSnapshots, attendanceSessions —
      //    xem A22 §danh sách loại trừ) ──
      await tx.delete(gradeOverrides).where(eq(gradeOverrides.parishId, user.parishId))
      await tx.delete(promotionRecords).where(eq(promotionRecords.parishId, user.parishId))
      await tx.delete(attendanceSessions).where(eq(attendanceSessions.parishId, user.parishId))
      await tx.delete(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, user.parishId))
      await tx.delete(catechistAssignments).where(eq(catechistAssignments.parishId, user.parishId))
      await tx.delete(semesterLocks).where(eq(semesterLocks.parishId, user.parishId))
      await tx.delete(attendance).where(eq(attendance.parishId, user.parishId))
      await tx.delete(grades).where(eq(grades.parishId, user.parishId))
      await tx.delete(examQuestionSnapshots).where(eq(examQuestionSnapshots.parishId, user.parishId))
      await tx.delete(examSessions).where(eq(examSessions.parishId, user.parishId))
      if (includeQuestionBank) {
        await tx.delete(examBlueprintRules).where(eq(examBlueprintRules.parishId, user.parishId))
        await tx.delete(examBlueprints).where(eq(examBlueprints.parishId, user.parishId))
        await tx.delete(questionBankVersions).where(eq(questionBankVersions.parishId, user.parishId))
        await tx.delete(questionBankItems).where(eq(questionBankItems.parishId, user.parishId))
      }
      await tx.delete(students).where(eq(students.parishId, user.parishId))
      await tx.delete(classes).where(eq(classes.parishId, user.parishId))

      // ── 2. Ghi lại snapshot (cha → con) ──
      await upsertAll(tx, classes, restoredClasses as any[], 'classes', user.parishId)
      await upsertAll(tx, students, restoredStudents as any[], 'students', user.parishId)
      await upsertAll(tx, grades, restoredGrades as any[], 'grades', user.parishId)
      await upsertAll(tx, attendance, restoredAttendance as any[], 'attendance', user.parishId)
      await upsertAll(tx, semesterLocks, restoredSemesterLocks as any[], 'semesterLocks', user.parishId)
      await upsertAll(tx, gradeOverrides, restoredGradeOverrides as any[], 'gradeOverrides', user.parishId)
      await upsertAll(tx, promotionRecords, restoredPromotionSnapshots as any[], 'promotionSnapshots', user.parishId)
      if (includeQuestionBank) {
        await upsertAll(tx, questionBankItems, restoredQuestionBankItems as any[], 'questionBankItems', user.parishId)
        await upsertAll(tx, questionBankVersions, restoredQuestionBankVersions as any[], 'questionBankVersions', user.parishId)
        await upsertAll(tx, examBlueprints, restoredExamBlueprints as any[], 'examBlueprints', user.parishId)
        await upsertAll(tx, examBlueprintRules, restoredExamBlueprintRules as any[], 'examBlueprintRules', user.parishId)
      }
      await upsertAll(tx, examSessions, restoredExamSessions as any[], 'examSessions', user.parishId)
      if (includeQuestionBank) {
        await upsertAll(tx, examQuestionSnapshots, restoredExamQuestionSnapshots as any[], 'examQuestionSnapshots', user.parishId)
      }
      await upsertAll(tx, examResults, restoredExamResults as any[], 'examResults', user.parishId)

      // ── 3. Verify "expected state == actual state" — lệch → rollback ──
      await verifyActualCount(tx, classes, 'classes', (restoredClasses ?? []).length, eq(classes.parishId, user.parishId))
      await verifyActualCount(tx, students, 'students', (restoredStudents ?? []).length, eq(students.parishId, user.parishId))
      await verifyActualCount(tx, grades, 'grades', (restoredGrades ?? []).length, eq(grades.parishId, user.parishId))
      await verifyActualCount(tx, attendance, 'attendance', (restoredAttendance ?? []).length, eq(attendance.parishId, user.parishId))
      await verifyActualCount(tx, semesterLocks, 'semesterLocks', (restoredSemesterLocks ?? []).length, eq(semesterLocks.parishId, user.parishId))
      await verifyActualCount(tx, gradeOverrides, 'gradeOverrides', (restoredGradeOverrides ?? []).length, eq(gradeOverrides.parishId, user.parishId))
      await verifyActualCount(tx, promotionRecords, 'promotionSnapshots', (restoredPromotionSnapshots ?? []).length, eq(promotionRecords.parishId, user.parishId))
      if (includeQuestionBank) {
        await verifyActualCount(tx, questionBankItems, 'questionBankItems', restoredQuestionBankItems.length, eq(questionBankItems.parishId, user.parishId))
        await verifyActualCount(tx, questionBankVersions, 'questionBankVersions', restoredQuestionBankVersions.length, eq(questionBankVersions.parishId, user.parishId))
        await verifyActualCount(tx, examBlueprints, 'examBlueprints', restoredExamBlueprints.length, eq(examBlueprints.parishId, user.parishId))
        await verifyActualCount(tx, examBlueprintRules, 'examBlueprintRules', restoredExamBlueprintRules.length, eq(examBlueprintRules.parishId, user.parishId))
      }
      await verifyActualCount(tx, examSessions, 'examSessions', (restoredExamSessions ?? []).length, eq(examSessions.parishId, user.parishId))
      if (includeQuestionBank) {
        await verifyActualCount(tx, examQuestionSnapshots, 'examQuestionSnapshots', restoredExamQuestionSnapshots.length, eq(examQuestionSnapshots.parishId, user.parishId))
      }
      await verifyActualCount(tx, examResults, 'examResults', (restoredExamResults ?? []).length, and(
        eq(examResults.parishId, user.parishId),
        esIds.length > 0 ? inArray(examResults.examSessionId, esIds) : eq(examResults.examSessionId, '__none__'),
      ))

      // A restore replaces the server generation. Advance the same marker used
      // by purge so every device clears old encrypted caches and queued writes
      // before it can sync against the restored database. Keep marker + success
      // audit in this transaction: neither may acknowledge a rolled-back restore,
      // and an audit failure must not produce a committed restore with HTTP 500.
      const nextPurgeVersion = await advanceClientResetVersion(tx, user.parishId, user.userId)
      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: user.userId,
        action: 'RESTORE_BACKUP',
        entityType: 'parish',
        entityId: user.parishId,
        newValue: JSON.stringify({
          counts: {
            students: restoredStudents.length,
            grades: restoredGrades?.length ?? 0,
            attendance: restoredAttendance?.length ?? 0,
            semesterLocks: restoredSemesterLocks?.length ?? 0,
            gradeOverrides: restoredGradeOverrides?.length ?? 0,
            promotionSnapshots: restoredPromotionSnapshots?.length ?? 0,
            questionBankItems: includeQuestionBank ? restoredQuestionBankItems.length : 'preserved-legacy-backup',
            questionBankVersions: includeQuestionBank ? restoredQuestionBankVersions.length : 'preserved-legacy-backup',
            examBlueprints: includeQuestionBank ? restoredExamBlueprints.length : 'preserved-legacy-backup',
            examBlueprintRules: includeQuestionBank ? restoredExamBlueprintRules.length : 'preserved-legacy-backup',
            examSessions: restoredExamSessions?.length ?? 0,
            examQuestionSnapshots: includeQuestionBank ? restoredExamQuestionSnapshots.length : 0,
            examResults: restoredExamResults?.length ?? 0,
          },
          verified: true,
          purgeVersion: nextPurgeVersion,
        }),
        ip,
        userAgent,
        parishId: user.parishId,
      })
      return nextPurgeVersion
    })

    return c.json({
      success: true,
      message: `Khôi phục thành công dữ liệu ${restoredStudents.length} học viên!`,
      counts: {
        students: restoredStudents.length,
        grades: restoredGrades?.length || 0,
        attendance: restoredAttendance?.length || 0,
        questionBankItems: includeQuestionBank ? restoredQuestionBankItems.length : undefined,
        examSessions: restoredExamSessions?.length || 0,
      },
      verified: true,
      purgeVersion,
    })
  } catch (err: any) {
    console.error('SERVER RESTORE ERROR:', err)
    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.userId,
      action: 'RESTORE_BACKUP_FAILED',
      entityType: 'backup',
      entityId: user.parishId,
      newValue: JSON.stringify({ reason: 'operation_failed', error: String(err?.message || err) }),
      ip,
      userAgent,
      parishId: user.parishId,
    }).catch(() => {})
    if (err?.status === 409 && typeof err?.code === 'string') {
      return errorResponse(c, err.code, err.message, 409)
    }
    return c.json({ error: 'Không thể khôi phục dữ liệu', details: process.env.NODE_ENV === 'development' ? err?.message || String(err) : undefined }, 500)
  }
})

export default backupRouter
