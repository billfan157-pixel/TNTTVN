import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import backupRouter from '../../routes/backup.js'
import { db } from '../../db/index.js'
import { users, students, classes, grades, attendance, semesterLocks, gradeOverrides, promotionRecords, examSessions, examResults, branches, academicYears, auditLogs } from '../../db/schema.js'
import { generateTokens } from '../../middleware/auth.js'
import { eq } from 'drizzle-orm'

/**
 * A19/A20/A21 (2026-08-10): restore integrity — file riêng để không vỡ budget
 * adminReauthRateLimiter (10/60s/IP — store singleton per-process; vitest chạy
 * từng file trong process riêng nên bucket mới).
 *
 * A19: checksum + parish BẮT BUỘC.
 * A20: transaction fail-fast — lỗi insert → rollback toàn bộ + 500 + audit fail.
 * A21: upsert + verify "expected state == actual state"; payload trùng id → 500 + rollback.
 * WHATS-NEW: semesterLocks/gradeOverrides/promotionSnapshots giờ ĐƯỢC restore
 * (trước đây chỉ export mà không insert lại — silent loss).
 */

const PREFIX = `INTEG-${Date.now()}`
const PARISH = `parish-${PREFIX}`
const ADMIN_ID = `USR-${PREFIX}`
const ADMIN_PASSWORD = 'IntegAdmin@123'
const BRANCH_ID = `BR-${PREFIX}`
const AY_ID = `AY-${PREFIX}`
const CLASS_ID = `CLS-${PREFIX}`

const { accessToken } = generateTokens({
  userId: ADMIN_ID,
  username: `integ_${PREFIX}`,
  role: 'admin',
  parishId: PARISH,
  tokenVersion: 1,
})
const authHeaders = { Authorization: `Bearer ${accessToken}` }

function sha256(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex')
}

interface PayloadOptions {
  students?: any[]
  grades?: any[]
  classes?: any[]
  semesterLocks?: any[]
  gradeOverrides?: any[]
  promotionSnapshots?: any[]
  examSessions?: any[]
  examResults?: any[]
  checksum?: string | null
  parish?: string
}

/** Dựng payload restore theo đúng cấu trúc dataPayload của GET /export. */
function buildRestorePayload(opts: PayloadOptions = {}) {
  const dataPayload = {
    students: opts.students ?? [],
    grades: opts.grades ?? [],
    attendance: [],
    classes: opts.classes ?? [],
    semesterLocks: opts.semesterLocks ?? [],
    gradeOverrides: opts.gradeOverrides ?? [],
    promotionSnapshots: opts.promotionSnapshots ?? [],
    examSessions: opts.examSessions ?? [],
    examResults: opts.examResults ?? [],
  }
  const payload: Record<string, unknown> = {
    version: '2.0-production',
    parish: opts.parish ?? PARISH,
    exportedAt: new Date().toISOString(),
    data: dataPayload,
  }
  if (opts.checksum !== null) {
    payload.checksum = opts.checksum ?? sha256(dataPayload)
  }
  return payload
}

function restoreRequest(body: Record<string, unknown>) {
  return backupRouter.request('/restore', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const FULL_SNAPSHOT: PayloadOptions = {
  classes: [{ id: CLASS_ID, code: `AN1-${PREFIX}`, name: 'Lớp INTEG', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH }],
  students: [{ id: `ST-${PREFIX}`, code: `S-${PREFIX}`, holyName: 'Gioan', fullName: 'Integ Học Sinh', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Bố', parentPhone: '0900000000', address: 'Xã X', branch: 'AuNhi', classId: CLASS_ID, status: 'Đang học', parishId: PARISH }],
  grades: [{ id: `GR-${PREFIX}`, studentId: `ST-${PREFIX}`, academicYear: '2025-2026', semester: 2, scoreFinal: 8.5, parishId: PARISH }],
  semesterLocks: [{ id: `SL-${PREFIX}`, parishId: PARISH, academicYear: '2025-2026', semester: 2, isLocked: 1 }],
  gradeOverrides: [{ id: `OV-${PREFIX}`, gradeId: `GR-${PREFIX}`, parishId: PARISH, scoreField: 'scoreFinal', manualValue: 9, overriddenBy: ADMIN_ID }],
  promotionSnapshots: [{ id: `PR-${PREFIX}`, studentId: `ST-${PREFIX}`, parishId: PARISH, academicYear: '2025-2026', targetClassId: CLASS_ID, autoDecision: 'PROMOTED', finalDecision: 'PROMOTED', gpaSnapshot: 8.5, attendanceSnapshot: 0.9, approvedBy: ADMIN_ID }],
  examSessions: [{ id: `ES-${PREFIX}`, parishId: PARISH, classId: CLASS_ID, subject: 'Toán', scoreType: 'midterm', semester: 2, academicYear: '2025-2026', createdBy: ADMIN_ID }],
  examResults: [{ id: `ER-${PREFIX}`, examSessionId: `ES-${PREFIX}`, studentId: `ST-${PREFIX}`, score: 9, parishId: PARISH }],
}

async function countOf(table: any, where: any): Promise<number> {
  const rows = await db.select().from(table).where(where)
  return rows.length
}

const studentWhere = eq(students.parishId, PARISH)
const classWhere = eq(classes.parishId, PARISH)
const semesterLockWhere = eq(semesterLocks.parishId, PARISH)

describe('A19–A21 — Restore Integrity (checksum/parish required, fail-fast, verify counts)', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4)
    await db.insert(users).values({
      id: ADMIN_ID,
      username: `integ_${PREFIX}`,
      passwordHash,
      fullName: 'Admin INTEG',
      role: 'admin',
      parishId: PARISH,
      status: 'ACTIVE',
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    })
    await db.insert(branches).values({ id: BRANCH_ID, parishId: PARISH, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9 })
    await db.insert(academicYears).values({ id: AY_ID, parishId: PARISH, startDate: '2025-09-01', endDate: '2026-05-31' })
  })

  afterAll(async () => {
    await db.delete(gradeOverrides).where(eq(gradeOverrides.parishId, PARISH))
    await db.delete(promotionRecords).where(eq(promotionRecords.parishId, PARISH))
    await db.delete(semesterLocks).where(semesterLockWhere)
    await db.delete(examResults).where(eq(examResults.parishId, PARISH))
    await db.delete(examSessions).where(eq(examSessions.parishId, PARISH))
    await db.delete(attendance).where(eq(attendance.parishId, PARISH))
    await db.delete(grades).where(eq(grades.parishId, PARISH))
    await db.delete(students).where(studentWhere)
    await db.delete(classes).where(classWhere)
    await db.delete(branches).where(eq(branches.parishId, PARISH))
    await db.delete(academicYears).where(eq(academicYears.parishId, PARISH))
    await db.delete(users).where(eq(users.id, ADMIN_ID))
    await db.delete(auditLogs).where(eq(auditLogs.userId, ADMIN_ID))
  })

  it('A19: thiếu checksum (đúng adminPassword) → 400, dữ liệu KHÔNG đổi', async () => {
    await db.insert(classes).values({ id: CLASS_ID, code: `AN1-${PREFIX}`, name: 'Lớp INTEG', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH })
    await db.insert(students).values({ id: `ST-OLD`, code: `S-OLD`, holyName: 'Gioan', fullName: 'Học Sinh Cũ', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Bố', parentPhone: '0900000000', address: 'Xã Cũ', branch: 'AuNhi', classId: CLASS_ID, status: 'Đang học', parishId: PARISH })

    const before = await countOf(students, studentWhere)
    const res = await restoreRequest({ ...buildRestorePayload({ checksum: null }), adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(400)
    expect(res.status).not.toBe(500)
    expect(res.status).not.toBe(200)
    expect(await countOf(students, studentWhere)).toBe(before)
  })

  it('A19: parish mismatch → 400 RESTORE_PARISH_MISMATCH, dữ liệu KHÔNG đổi', async () => {
    const before = await countOf(students, studentWhere)
    const res = await restoreRequest({ ...buildRestorePayload({ parish: 'parish-khac' }), adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(JSON.stringify(json)).toContain('RESTORE_PARISH_MISMATCH')
    expect(await countOf(students, studentWhere)).toBe(before)
  })

  it('A21: payload sinh ra FK fail (student trỏ lớp không tồn tại) → 500 + rollback toàn bộ + audit RESTORE_BACKUP_FAILED', async () => {
    const beforeStudents = await countOf(students, studentWhere)
    const beforeClasses = await countOf(classes, classWhere)
    const payload = buildRestorePayload({
      classes: [{ id: `CLS-${PREFIX}-X`, code: `X-${PREFIX}`, name: 'Lớp X', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH }],
      students: [{ id: `ST-${PREFIX}-X`, code: `SX-${PREFIX}`, holyName: 'Gioan', fullName: 'Student FK Fail', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Bố', parentPhone: '0900000000', address: 'Xã X', branch: 'AuNhi', classId: 'CLS-KHONG-TON-TAI', status: 'Đang học', parishId: PARISH }],
    })
    const res = await restoreRequest({ ...payload, adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(500)
    // A29 (2026-08-10): raw DB error KHÔNG lộ ra response (details chỉ hiện ở NODE_ENV=development)
    const errJson = (await res.json()) as any
    expect(errJson.details).toBeUndefined()
    expect(JSON.stringify(errJson)).not.toMatch(/FOREIGN KEY|constraint|SQL|\.db\b/i)
    expect(await countOf(students, studentWhere)).toBe(beforeStudents)
    expect(await countOf(classes, classWhere)).toBe(beforeClasses)

    const auditRows = await db.select({ action: auditLogs.action, newValue: auditLogs.newValue }).from(auditLogs).where(eq(auditLogs.userId, ADMIN_ID))
    const failedAudit = auditRows.find((a) => a.action === 'RESTORE_BACKUP_FAILED')
    expect(failedAudit).toBeDefined()
    expect(failedAudit!.newValue).toContain('operation_failed')
  })

  it('A21: snapshot đầy đủ (kể cả semesterLocks/gradeOverrides/promotionSnapshots — trước đây bị rơi) được khôi phục + verified', async () => {
    const res = await restoreRequest({ ...buildRestorePayload(FULL_SNAPSHOT), adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.verified).toBe(true)
    expect(json.counts.students).toBe(1)

    expect(await countOf(students, studentWhere)).toBe(1)
    expect(await countOf(classes, classWhere)).toBe(1)
    expect(await countOf(grades, eq(grades.parishId, PARISH))).toBe(1)
    expect(await countOf(semesterLocks, semesterLockWhere)).toBe(1)
    expect(await countOf(gradeOverrides, eq(gradeOverrides.parishId, PARISH))).toBe(1)
    expect(await countOf(promotionRecords, eq(promotionRecords.parishId, PARISH))).toBe(1)
    expect(await countOf(examSessions, eq(examSessions.parishId, PARISH))).toBe(1)
    expect(await countOf(examResults, eq(examResults.parishId, PARISH))).toBe(1)

    const [lock] = await db.select().from(semesterLocks).where(semesterLockWhere)
    expect(lock.isLocked).toBe(1)
    const [override] = await db.select().from(gradeOverrides).where(eq(gradeOverrides.parishId, PARISH))
    expect(override.manualValue).toBe(9)
  })

  it('A21: restore 2 lần cùng snapshot → idempotent, state vẫn == snapshot', async () => {
    const first = await restoreRequest({ ...buildRestorePayload(FULL_SNAPSHOT), adminPassword: ADMIN_PASSWORD })
    expect(first.status).toBe(200)
    const second = await restoreRequest({ ...buildRestorePayload(FULL_SNAPSHOT), adminPassword: ADMIN_PASSWORD })
    expect(second.status).toBe(200)
    expect(await countOf(students, studentWhere)).toBe(1)
    expect(await countOf(grades, eq(grades.parishId, PARISH))).toBe(1)
  })

  it('A21: payload trùng id trong cùng snapshot → verify count lệch → 500 + rollback', async () => {
    const beforeStudents = await countOf(students, studentWhere)
    const dup = buildRestorePayload({
      students: [
        { id: `ST-DUP`, code: `D1-${PREFIX}`, holyName: 'Gioan', fullName: 'Dup A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Bố', parentPhone: '0900000000', address: 'Xã X', branch: 'AuNhi', classId: CLASS_ID, status: 'Đang học', parishId: PARISH },
        { id: `ST-DUP`, code: `D2-${PREFIX}`, holyName: 'Gioan', fullName: 'Dup B', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Bố', parentPhone: '0900000000', address: 'Xã Y', branch: 'AuNhi', classId: CLASS_ID, status: 'Đang học', parishId: PARISH },
      ],
      classes: [{ id: CLASS_ID, code: `AN1-${PREFIX}`, name: 'Lớp INTEG', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH }],
    })
    const res = await restoreRequest({ ...dup, adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(500)
    expect(await countOf(students, studentWhere)).toBe(beforeStudents)
  })
})