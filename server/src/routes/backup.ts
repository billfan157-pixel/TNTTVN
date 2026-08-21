import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { count, getTableColumns, sql, eq } from 'drizzle-orm'
import { createHash } from 'crypto'
import { db, runDbTransaction, type DbExecutor, type DbTransaction } from '../db/index.js'
import {
  students,
  grades,
  attendance,
  classes,
  semesterLocks,
  gradeOverrides,
  promotionRecords,
  examSessions,
  examResults,
  auditLogs,
  attendanceSessions,
  academicYearSnapshots,
  catechistAssignments,
  notifications,
  serviceAssignments,
  importBatches,
  importBatchStudents,
  leaveRequests,
  assessmentEntries,
  examFinalizations,
  examFinalizationItems,
  funds,
  financialTransactions,
  studentFeeRecords,
} from '../db/schema.js'
import { authMiddleware, roleMiddleware, type JwtPayload } from '../middleware/auth.js'
import { adminReauthRateLimiter } from '../middleware/security.js'
import { verifyAdminReauth } from '../services/userService.js'
import { errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { generateId } from '../utils/id.js'
import { writeSafetySnapshot, pruneSafetySnapshots } from '../services/safetySnapshot.js'

const backupRouter = new Hono()

backupRouter.use('/*', authMiddleware)

const BACKUP_VERSION = '3.0-operational'
const LEGACY_BACKUP_VERSION = '2.0-production'

const adminPasswordSchema = z.string().min(1, 'Mật khẩu xác nhận Admin không được để trống').max(128)
const restoreRowSchema = z.record(z.string(), z.any())

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
    promotionSnapshots: z.array(restoreRowSchema).default([]),
    promotionRecords: z.array(restoreRowSchema).default([]),
    examSessions: z.array(restoreRowSchema).default([]),
    examResults: z.array(restoreRowSchema).default([]),
    attendanceSessions: z.array(restoreRowSchema).default([]),
    academicYearSnapshots: z.array(restoreRowSchema).default([]),
    catechistAssignments: z.array(restoreRowSchema).default([]),
    notifications: z.array(restoreRowSchema).default([]),
    serviceAssignments: z.array(restoreRowSchema).default([]),
    importBatches: z.array(restoreRowSchema).default([]),
    importBatchStudents: z.array(restoreRowSchema).default([]),
    leaveRequests: z.array(restoreRowSchema).default([]),
    assessmentEntries: z.array(restoreRowSchema).default([]),
    examFinalizations: z.array(restoreRowSchema).default([]),
    examFinalizationItems: z.array(restoreRowSchema).default([]),
    funds: z.array(restoreRowSchema).default([]),
    financialTransactions: z.array(restoreRowSchema).default([]),
    studentFeeRecords: z.array(restoreRowSchema).default([]),
  }),
}).passthrough()

const exportBackupBodySchema = z.object({
  adminPassword: adminPasswordSchema,
})

function computeChecksum(dataObj: any): string {
  return createHash('sha256').update(JSON.stringify(dataObj)).digest('hex')
}

const UPSERT_BATCH_SIZE = 100

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

async function verifyActualCount(tx: DbTransaction, table: any, label: string, expected: number, parishId: string) {
  const [row] = await tx.select({ c: count() }).from(table).where(eq(table.parishId, parishId))
  if (Number(row?.c ?? 0) !== expected) {
    throw new Error(`Kiểm tra khôi phục thất bại [${label}]: mong đợi ${expected}, thực tế ${row?.c ?? 0} — đã rollback`)
  }
}

async function readOperationalState(executor: DbExecutor, parishId: string) {
  const [
    currentStudents,
    currentGrades,
    currentAttendance,
    currentClasses,
    currentLocks,
    currentOverrides,
    currentPromotions,
    currentExamSessions,
    currentExamResults,
    currentAttendanceSessions,
    currentYearSnapshots,
    currentAssignments,
    currentNotifications,
    currentServiceAssignments,
    currentImportBatches,
    currentImportBatchStudents,
    currentLeaveRequests,
    currentAssessmentEntries,
    currentExamFinalizations,
    currentExamFinalizationItems,
    currentFunds,
    currentFinancialTransactions,
    currentStudentFeeRecords,
  ] = await Promise.all([
    executor.select().from(students).where(eq(students.parishId, parishId)),
    executor.select().from(grades).where(eq(grades.parishId, parishId)),
    executor.select().from(attendance).where(eq(attendance.parishId, parishId)),
    executor.select().from(classes).where(eq(classes.parishId, parishId)),
    executor.select().from(semesterLocks).where(eq(semesterLocks.parishId, parishId)),
    executor.select().from(gradeOverrides).where(eq(gradeOverrides.parishId, parishId)),
    executor.select().from(promotionRecords).where(eq(promotionRecords.parishId, parishId)),
    executor.select().from(examSessions).where(eq(examSessions.parishId, parishId)),
    executor.select().from(examResults).where(eq(examResults.parishId, parishId)),
    executor.select().from(attendanceSessions).where(eq(attendanceSessions.parishId, parishId)),
    executor.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, parishId)),
    executor.select().from(catechistAssignments).where(eq(catechistAssignments.parishId, parishId)),
    executor.select().from(notifications).where(eq(notifications.parishId, parishId)),
    executor.select().from(serviceAssignments).where(eq(serviceAssignments.parishId, parishId)),
    executor.select().from(importBatches).where(eq(importBatches.parishId, parishId)),
    executor.select().from(importBatchStudents).where(eq(importBatchStudents.parishId, parishId)),
    executor.select().from(leaveRequests).where(eq(leaveRequests.parishId, parishId)),
    executor.select().from(assessmentEntries).where(eq(assessmentEntries.parishId, parishId)),
    executor.select().from(examFinalizations).where(eq(examFinalizations.parishId, parishId)),
    executor.select().from(examFinalizationItems).where(eq(examFinalizationItems.parishId, parishId)),
    executor.select().from(funds).where(eq(funds.parishId, parishId)),
    executor.select().from(financialTransactions).where(eq(financialTransactions.parishId, parishId)),
    executor.select().from(studentFeeRecords).where(eq(studentFeeRecords.parishId, parishId)),
  ])

  return {
    students: currentStudents,
    grades: currentGrades,
    attendance: currentAttendance,
    classes: currentClasses,
    semesterLocks: currentLocks,
    gradeOverrides: currentOverrides,
    promotionSnapshots: currentPromotions,
    examSessions: currentExamSessions,
    examResults: currentExamResults,
    attendanceSessions: currentAttendanceSessions,
    academicYearSnapshots: currentYearSnapshots,
    catechistAssignments: currentAssignments,
    notifications: currentNotifications,
    serviceAssignments: currentServiceAssignments,
    importBatches: currentImportBatches,
    importBatchStudents: currentImportBatchStudents,
    leaveRequests: currentLeaveRequests,
    assessmentEntries: currentAssessmentEntries,
    examFinalizations: currentExamFinalizations,
    examFinalizationItems: currentExamFinalizationItems,
    funds: currentFunds,
    financialTransactions: currentFinancialTransactions,
    studentFeeRecords: currentStudentFeeRecords,
  }
}

function normalizeV2Data(payload: z.infer<typeof restoreBackupSchema>) {
  return {
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
}

function normalizeV3Data(payload: z.infer<typeof restoreBackupSchema>) {
  return {
    ...normalizeV2Data(payload),
    attendanceSessions: payload.data.attendanceSessions,
    academicYearSnapshots: payload.data.academicYearSnapshots,
    catechistAssignments: payload.data.catechistAssignments,
    notifications: payload.data.notifications,
    serviceAssignments: payload.data.serviceAssignments,
    importBatches: payload.data.importBatches,
    importBatchStudents: payload.data.importBatchStudents,
    leaveRequests: payload.data.leaveRequests,
    assessmentEntries: payload.data.assessmentEntries,
    examFinalizations: payload.data.examFinalizations,
    examFinalizationItems: payload.data.examFinalizationItems,
    funds: payload.data.funds,
    financialTransactions: payload.data.financialTransactions,
    studentFeeRecords: payload.data.studentFeeRecords,
  }
}

async function legacyRestoreUnsafeCounts(parishId: string): Promise<Record<string, number>> {
  const state = await db.transaction((tx) => readOperationalState(tx, parishId))
  const v2Keys = new Set(Object.keys(normalizeV2Data({ data: state } as any)))
  return Object.fromEntries(
    Object.entries(state)
      .filter(([key]) => !v2Keys.has(key))
      .map(([key, rows]) => [key, (rows as unknown[]).length])
      .filter(([, n]) => Number(n) > 0),
  )
}

/**
 * Backup v3 is a point-in-time operational snapshot. All table reads share one
 * SQLite read transaction, and each paginated query has a stable id order. The
 * payload includes every table that restore directly deletes or can mutate via
 * FK cascade/restrict effects, preventing the v2 destructive-scope data loss.
 */
backupRouter.post('/export', roleMiddleware('admin'), adminReauthRateLimiter, zValidator('json', exportBackupBodySchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { adminPassword } = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

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
      const counts: Record<string, number> = {}

      async function writeData(chunk: string) {
        hash.update(chunk)
        await st.write(chunk)
      }

      async function streamTable(tableName: string, query: any, isFirst: boolean) {
        if (!isFirst) await writeData(',')
        await writeData(`${JSON.stringify(tableName)}:[`)
        let offset = 0
        const limit = 2000
        let firstRow = true
        let rowCount = 0
        while (true) {
          const batch = await query.limit(limit).offset(offset)
          if (batch.length === 0) break
          for (const row of batch) {
            if (!firstRow) await writeData(',')
            await writeData(JSON.stringify(row))
            firstRow = false
            rowCount++
          }
          offset += limit
        }
        await writeData(']')
        counts[tableName] = rowCount
      }

      await st.write(`{"version":${JSON.stringify(BACKUP_VERSION)},"parish":${JSON.stringify(user.parishId)},"exportedAt":${JSON.stringify(exportedAt)},"data":`)
      await writeData('{')

      await db.transaction(async (tx) => {
        await streamTable('students', tx.select().from(students).where(eq(students.parishId, user.parishId)).orderBy(students.id), true)
        await streamTable('grades', tx.select().from(grades).where(eq(grades.parishId, user.parishId)).orderBy(grades.id), false)
        await streamTable('attendance', tx.select().from(attendance).where(eq(attendance.parishId, user.parishId)).orderBy(attendance.id), false)
        await streamTable('classes', tx.select().from(classes).where(eq(classes.parishId, user.parishId)).orderBy(classes.id), false)
        await streamTable('semesterLocks', tx.select().from(semesterLocks).where(eq(semesterLocks.parishId, user.parishId)).orderBy(semesterLocks.id), false)
        await streamTable('gradeOverrides', tx.select().from(gradeOverrides).where(eq(gradeOverrides.parishId, user.parishId)).orderBy(gradeOverrides.id), false)
        await streamTable('promotionSnapshots', tx.select().from(promotionRecords).where(eq(promotionRecords.parishId, user.parishId)).orderBy(promotionRecords.id), false)
        await streamTable('examSessions', tx.select().from(examSessions).where(eq(examSessions.parishId, user.parishId)).orderBy(examSessions.id), false)
        await streamTable('examResults', tx.select().from(examResults).where(eq(examResults.parishId, user.parishId)).orderBy(examResults.id), false)
        await streamTable('attendanceSessions', tx.select().from(attendanceSessions).where(eq(attendanceSessions.parishId, user.parishId)).orderBy(attendanceSessions.id), false)
        await streamTable('academicYearSnapshots', tx.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, user.parishId)).orderBy(academicYearSnapshots.id), false)
        await streamTable('catechistAssignments', tx.select().from(catechistAssignments).where(eq(catechistAssignments.parishId, user.parishId)).orderBy(catechistAssignments.id), false)
        await streamTable('notifications', tx.select().from(notifications).where(eq(notifications.parishId, user.parishId)).orderBy(notifications.id), false)
        await streamTable('serviceAssignments', tx.select().from(serviceAssignments).where(eq(serviceAssignments.parishId, user.parishId)).orderBy(serviceAssignments.id), false)
        await streamTable('importBatches', tx.select().from(importBatches).where(eq(importBatches.parishId, user.parishId)).orderBy(importBatches.id), false)
        await streamTable('importBatchStudents', tx.select().from(importBatchStudents).where(eq(importBatchStudents.parishId, user.parishId)).orderBy(importBatchStudents.id), false)
        await streamTable('leaveRequests', tx.select().from(leaveRequests).where(eq(leaveRequests.parishId, user.parishId)).orderBy(leaveRequests.id), false)
        await streamTable('assessmentEntries', tx.select().from(assessmentEntries).where(eq(assessmentEntries.parishId, user.parishId)).orderBy(assessmentEntries.id), false)
        await streamTable('examFinalizations', tx.select().from(examFinalizations).where(eq(examFinalizations.parishId, user.parishId)).orderBy(examFinalizations.id), false)
        await streamTable('examFinalizationItems', tx.select().from(examFinalizationItems).where(eq(examFinalizationItems.parishId, user.parishId)).orderBy(examFinalizationItems.id), false)
        await streamTable('funds', tx.select().from(funds).where(eq(funds.parishId, user.parishId)).orderBy(funds.id), false)
        await streamTable('financialTransactions', tx.select().from(financialTransactions).where(eq(financialTransactions.parishId, user.parishId)).orderBy(financialTransactions.id), false)
        await streamTable('studentFeeRecords', tx.select().from(studentFeeRecords).where(eq(studentFeeRecords.parishId, user.parishId)).orderBy(studentFeeRecords.id), false)
      })

      await writeData('}')
      const checksum = hash.digest('hex')
      await st.write(`,"counts":${JSON.stringify(counts)},"checksum":${JSON.stringify(checksum)}}`)

      await db.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: user.userId,
        action: 'EXPORT_BACKUP',
        entityType: 'parish',
        entityId: user.parishId,
        newValue: JSON.stringify({ exportedAt, checksum, counts, version: BACKUP_VERSION }),
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

backupRouter.post('/restore', roleMiddleware('admin'), adminReauthRateLimiter, zValidator('json', restoreBackupSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const payload = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const reauthOk = await verifyAdminReauth(user.userId, payload.adminPassword, user.parishId, ip, userAgent, user.parishId, 'RESTORE_BACKUP_FAILED')
  if (!reauthOk) return errorResponse(c, 'INVALID_ADMIN_PASSWORD', 'Mật khẩu xác nhận Admin không chính xác', 401)

  try {
    if (payload.parish !== user.parishId) {
      return errorResponse(c, 'RESTORE_PARISH_MISMATCH', `File sao lưu thuộc giáo xứ khác (${payload.parish}) — không thể khôi phục vào giáo xứ hiện tại`, 400)
    }

    const version = String(payload.version ?? '')
    const isV3 = version === BACKUP_VERSION
    const isLegacyV2 = version === LEGACY_BACKUP_VERSION
    if (!isV3 && !isLegacyV2) {
      return errorResponse(c, 'RESTORE_VERSION_UNSUPPORTED', `Phiên bản backup không được hỗ trợ: ${version || '(missing)'}`, 400)
    }

    const normalizedData = isV3 ? normalizeV3Data(payload) : normalizeV2Data(payload)
    if (computeChecksum(normalizedData) !== payload.checksum) {
      return c.json({ error: 'File sao lưu bị hỏng hoặc đã bị chỉnh sửa (Lỗi SHA256 Checksum Mismatch)' }, 400)
    }

    if (isLegacyV2) {
      const unsafe = await legacyRestoreUnsafeCounts(user.parishId)
      if (Object.keys(unsafe).length > 0) {
        return errorResponse(
          c,
          'RESTORE_LEGACY_UNSAFE',
          `Backup v2 không chứa các bảng dữ liệu hiện đang tồn tại (${Object.entries(unsafe).map(([k, v]) => `${k}=${v}`).join(', ')}). Restore đã bị chặn để tránh mất dữ liệu; hãy tạo backup v3 mới hoặc dùng physical SQLite/Turso backup.`,
          409,
        )
      }
    }

    const totalRows = Object.values(normalizedData).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0)
    const MAX_RESTORE_ROWS = 200_000
    if (totalRows > MAX_RESTORE_ROWS) {
      return c.json({ error: `File sao lưu quá lớn (${totalRows} dòng — giới hạn ${MAX_RESTORE_ROWS}) — không thể khôi phục` }, 400)
    }

    let safetyData: Record<string, unknown>
    try {
      safetyData = await db.transaction((tx) => readOperationalState(tx, user.parishId))
      const safetyPayload = {
        type: 'AUTO_SAFETY_SNAPSHOT',
        version: BACKUP_VERSION,
        parishId: user.parishId,
        exportedAt: new Date().toISOString(),
        checksum: computeChecksum(safetyData),
        data: safetyData,
      }
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

    const data = isV3 ? normalizeV3Data(payload) : normalizeV2Data(payload)

    await runDbTransaction(async (tx) => {
      if (isV3) {
        await tx.delete(examFinalizationItems).where(eq(examFinalizationItems.parishId, user.parishId))
        await tx.delete(assessmentEntries).where(eq(assessmentEntries.parishId, user.parishId))
        await tx.delete(examFinalizations).where(eq(examFinalizations.parishId, user.parishId))
        await tx.delete(gradeOverrides).where(eq(gradeOverrides.parishId, user.parishId))
        await tx.delete(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, user.parishId))
        await tx.delete(promotionRecords).where(eq(promotionRecords.parishId, user.parishId))
        await tx.delete(studentFeeRecords).where(eq(studentFeeRecords.parishId, user.parishId))
        await tx.delete(leaveRequests).where(eq(leaveRequests.parishId, user.parishId))
        await tx.delete(attendanceSessions).where(eq(attendanceSessions.parishId, user.parishId))
        await tx.delete(examResults).where(eq(examResults.parishId, user.parishId))
        await tx.delete(catechistAssignments).where(eq(catechistAssignments.parishId, user.parishId))
        await tx.delete(notifications).where(eq(notifications.parishId, user.parishId))
        await tx.delete(serviceAssignments).where(eq(serviceAssignments.parishId, user.parishId))
        await tx.delete(importBatchStudents).where(eq(importBatchStudents.parishId, user.parishId))
        await tx.delete(attendance).where(eq(attendance.parishId, user.parishId))
        await tx.delete(grades).where(eq(grades.parishId, user.parishId))
        await tx.delete(financialTransactions).where(eq(financialTransactions.parishId, user.parishId))
        await tx.delete(examSessions).where(eq(examSessions.parishId, user.parishId))
        await tx.delete(importBatches).where(eq(importBatches.parishId, user.parishId))
        await tx.delete(semesterLocks).where(eq(semesterLocks.parishId, user.parishId))
        await tx.delete(funds).where(eq(funds.parishId, user.parishId))
        await tx.delete(students).where(eq(students.parishId, user.parishId))
        await tx.delete(classes).where(eq(classes.parishId, user.parishId))
      } else {
        await tx.delete(gradeOverrides).where(eq(gradeOverrides.parishId, user.parishId))
        await tx.delete(promotionRecords).where(eq(promotionRecords.parishId, user.parishId))
        await tx.delete(attendanceSessions).where(eq(attendanceSessions.parishId, user.parishId))
        await tx.delete(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, user.parishId))
        await tx.delete(catechistAssignments).where(eq(catechistAssignments.parishId, user.parishId))
        await tx.delete(semesterLocks).where(eq(semesterLocks.parishId, user.parishId))
        await tx.delete(attendance).where(eq(attendance.parishId, user.parishId))
        await tx.delete(grades).where(eq(grades.parishId, user.parishId))
        await tx.delete(examSessions).where(eq(examSessions.parishId, user.parishId))
        await tx.delete(students).where(eq(students.parishId, user.parishId))
        await tx.delete(classes).where(eq(classes.parishId, user.parishId))
      }

      await upsertAll(tx, classes, data.classes as any[], 'classes', user.parishId)
      await upsertAll(tx, students, data.students as any[], 'students', user.parishId)
      await upsertAll(tx, grades, data.grades as any[], 'grades', user.parishId)
      await upsertAll(tx, attendance, data.attendance as any[], 'attendance', user.parishId)
      await upsertAll(tx, semesterLocks, data.semesterLocks as any[], 'semesterLocks', user.parishId)
      await upsertAll(tx, gradeOverrides, data.gradeOverrides as any[], 'gradeOverrides', user.parishId)
      await upsertAll(tx, promotionRecords, data.promotionSnapshots as any[], 'promotionSnapshots', user.parishId)
      await upsertAll(tx, examSessions, data.examSessions as any[], 'examSessions', user.parishId)
      await upsertAll(tx, examResults, data.examResults as any[], 'examResults', user.parishId)

      if (isV3) {
        const v3 = data as ReturnType<typeof normalizeV3Data>
        await upsertAll(tx, attendanceSessions, v3.attendanceSessions as any[], 'attendanceSessions', user.parishId)
        await upsertAll(tx, academicYearSnapshots, v3.academicYearSnapshots as any[], 'academicYearSnapshots', user.parishId)
        await upsertAll(tx, catechistAssignments, v3.catechistAssignments as any[], 'catechistAssignments', user.parishId)
        await upsertAll(tx, notifications, v3.notifications as any[], 'notifications', user.parishId)
        await upsertAll(tx, serviceAssignments, v3.serviceAssignments as any[], 'serviceAssignments', user.parishId)
        await upsertAll(tx, importBatches, v3.importBatches as any[], 'importBatches', user.parishId)
        await upsertAll(tx, importBatchStudents, v3.importBatchStudents as any[], 'importBatchStudents', user.parishId)
        await upsertAll(tx, leaveRequests, v3.leaveRequests as any[], 'leaveRequests', user.parishId)
        await upsertAll(tx, assessmentEntries, v3.assessmentEntries as any[], 'assessmentEntries', user.parishId)
        await upsertAll(tx, examFinalizations, v3.examFinalizations as any[], 'examFinalizations', user.parishId)
        await upsertAll(tx, examFinalizationItems, v3.examFinalizationItems as any[], 'examFinalizationItems', user.parishId)
        await upsertAll(tx, funds, v3.funds as any[], 'funds', user.parishId)
        await upsertAll(tx, financialTransactions, v3.financialTransactions as any[], 'financialTransactions', user.parishId)
        await upsertAll(tx, studentFeeRecords, v3.studentFeeRecords as any[], 'studentFeeRecords', user.parishId)
      }

      for (const [label, rows] of Object.entries(data)) {
        const table = {
          students,
          grades,
          attendance,
          classes,
          semesterLocks,
          gradeOverrides,
          promotionSnapshots: promotionRecords,
          examSessions,
          examResults,
          attendanceSessions,
          academicYearSnapshots,
          catechistAssignments,
          notifications,
          serviceAssignments,
          importBatches,
          importBatchStudents,
          leaveRequests,
          assessmentEntries,
          examFinalizations,
          examFinalizationItems,
          funds,
          financialTransactions,
          studentFeeRecords,
        }[label as keyof ReturnType<typeof normalizeV3Data>]
        if (table) await verifyActualCount(tx, table, label, (rows as unknown[]).length, user.parishId)
      }

      // Success audit is part of the same transaction. If audit insertion fails,
      // the destructive restore rolls back instead of returning a false 500 after commit.
      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: user.userId,
        action: 'RESTORE_BACKUP',
        entityType: 'parish',
        entityId: user.parishId,
        newValue: JSON.stringify({ counts: Object.fromEntries(Object.entries(data).map(([k, rows]) => [k, (rows as unknown[]).length])), verified: true, version }),
        ip,
        userAgent,
        parishId: user.parishId,
      })
    })

    return c.json({
      success: true,
      message: `Khôi phục thành công dữ liệu ${payload.data.students.length} học viên!`,
      counts: Object.fromEntries(Object.entries(data).map(([k, rows]) => [k, (rows as unknown[]).length])),
      verified: true,
      version,
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
    return c.json({ error: 'Không thể khôi phục dữ liệu', details: process.env.NODE_ENV === 'development' ? err?.message || String(err) : undefined }, 500)
  }
})

export default backupRouter
