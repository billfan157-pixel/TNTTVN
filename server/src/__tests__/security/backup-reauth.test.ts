import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import backupRouter from '../../routes/backup.js'
import { db } from '../../db/index.js'
import { users, students, classes, branches, academicYears, auditLogs } from '../../db/schema.js'
import { generateTokens } from '../../middleware/auth.js'
import { eq } from 'drizzle-orm'

/**
 * A07 (2026-08-10): RE-AUTHENTICATION cho /api/backup/export + /api/backup/restore.
 *
 * Trước fix: roleMiddleware('admin') là rào cản DUY NHẤT — restore xóa sạch dữ
 * liệu parish / export tải toàn bộ DB chỉ cần token admin (không cần mật khẩu).
 *
 * Sau fix: adminReauthRateLimiter (10/60s/IP) + zValidator + verifyAdminReauth
 * (bcrypt mật khẩu hiện tại) TRƯỚC khi chạm dữ liệu; audit EXPORT_BACKUP /
 * RESTORE_BACKUP / *_FAILED.
 *
 * LƯU Ý sequence: mỗi request đi qua adminReauthRateLimiter (key = IP test —
 * 'unknown') cộng dồn trong cửa sổ 60s. Thứ tự test phải giữ budget ≤ 10 trước
 * test brute force; brute bắt đầu ở count 8 → 429 xuất hiện đúng ở request 11.
 */

const PREFIX = `A07-${Date.now()}`
const PARISH = `parish-${PREFIX}`
const ADMIN_ID = `USR-${PREFIX}`
const ADMIN_PASSWORD = 'A07Admin@123'
const BRANCH_ID = `BR-${PREFIX}`
const AY_ID = `AY-${PREFIX}`
const CLASS_ID = `CLS-${PREFIX}`

const classRow = { id: CLASS_ID, code: `A07-${PREFIX}`, name: 'A07 Lớp', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH }

const { accessToken } = generateTokens({
  userId: ADMIN_ID,
  username: `a07_${PREFIX}`,
  role: 'admin',
  parishId: PARISH,
  tokenVersion: 1,
})

const authHeaders = { Authorization: `Bearer ${accessToken}` }

function studentRow(id: string, code: string, fullName: string) {
  return {
    id,
    code,
    holyName: 'A07',
    fullName,
    gender: 'Nam',
    dateOfBirth: '2015-01-01',
    parentName: 'Bố A07',
    parentPhone: '0900000000',
    address: 'Xã A07',
    branch: 'ThieuNhi',
    classId: CLASS_ID,
    status: 'Đang học',
    parishId: PARISH,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as const
}

const SEED_STUDENTS = [studentRow(`ST-${PREFIX}-1`, `S1-${PREFIX}`, 'Nguyễn A07 Một'), studentRow(`ST-${PREFIX}-2`, `S2-${PREFIX}`, 'Trần A07 Hai')]

function sha256(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex')
}

/**
 * Dựng payload restore hợp lệ theo đúng cấu trúc dataPayload của GET /export.
 * Lưu ý (ADR-031): students.class_id có composite FK (parish_id, class_id) →
 * classes — snapshot restore thiếu class mà student tham chiếu sẽ FAIL-CLOSED
 * (FK constraint, rollback toàn bộ). Payload hợp lệ phải đi kèm classes.
 */
function buildRestorePayload(overrides: { students?: any[]; classes?: any[]; checksum?: string | null } = {}) {
  const students = overrides.students ?? []
  const classes = overrides.classes ?? []
  const dataPayload = {
    students,
    grades: [],
    attendance: [],
    classes,
    semesterLocks: [],
    gradeOverrides: [],
    promotionSnapshots: [],
    examSessions: [],
    examResults: [],
  }
  const payload: Record<string, unknown> = {
    version: '2.0-production',
    parish: PARISH,
    exportedAt: new Date().toISOString(),
    data: dataPayload,
  }
  if (overrides.checksum !== null) {
    payload.checksum = overrides.checksum ?? sha256(dataPayload)
  }
  return payload
}

// restoreBackupSchema passthrough → adminPassword thêm vào body là hợp lệ
function restoreRequest(body: Record<string, unknown>) {
  return backupRouter.request('/restore', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('A07 — Backup Export/Restore Re-Authentication', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4)
    await db.insert(users).values({
      id: ADMIN_ID,
      username: `a07_${PREFIX}`,
      passwordHash,
      fullName: 'Admin A07',
      role: 'admin',
      parishId: PARISH,
      status: 'ACTIVE',
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    })
    await db.insert(branches).values({ id: BRANCH_ID, name: 'Thiếu Nhi', scarfColor: 'Xanh', ageMin: 10, ageMax: 14, parishId: PARISH }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: AY_ID, startDate: '2025-09-01', endDate: '2026-05-31', parishId: PARISH }).onConflictDoNothing()
    await db.insert(classes).values(classRow).onConflictDoNothing()
    await db.insert(students).values(SEED_STUDENTS)
  })

  afterAll(async () => {
    await db.delete(students).where(eq(students.parishId, PARISH))
    await db.delete(classes).where(eq(classes.id, CLASS_ID))
    await db.delete(auditLogs).where(eq(auditLogs.userId, ADMIN_ID))
    await db.delete(users).where(eq(users.id, ADMIN_ID))
  })

  async function studentCount(): Promise<number> {
    const rows = await db.select().from(students).where(eq(students.parishId, PARISH))
    return rows.length
  }

  async function auditActions(): Promise<string[]> {
    const rows = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.userId, ADMIN_ID))
    return rows.map((r) => r.action)
  }

  async function exportRequest(body: Record<string, unknown>) {
    return backupRouter.request('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
    })
  }

  it('1. export thiếu adminPassword → 400 (zValidator), dữ liệu không bị đọc ra', async () => {
    const res = await exportRequest({})
    expect(res.status).toBe(400)
    expect((await auditActions()).length).toBe(0)
  })

  it('2. export sai mật khẩu → 401 + audit EXPORT_BACKUP_FAILED', async () => {
    const res = await exportRequest({ adminPassword: 'wrong-password' })
    expect(res.status).toBe(401)
    const json = (await res.json()) as any
    expect(json.error?.code ?? json.code ?? json.error?.message).toBeTruthy()
    expect(await auditActions()).toContain('EXPORT_BACKUP_FAILED')
  })

  it('3. export đúng mật khẩu → 200, snapshot đầy đủ + audit EXPORT_BACKUP', async () => {
    const res = await exportRequest({ adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.version).toBe('2.1-question-bank')
    expect(json.checksum).toBeTruthy()
    expect(json.data.students.some((s: any) => s.id === `ST-${PREFIX}-1`)).toBe(true)
    expect(await auditActions()).toContain('EXPORT_BACKUP')
  })

  it('4. restore sai mật khẩu → 401 + audit RESTORE_BACKUP_FAILED, dữ liệu KHÔNG bị xóa', async () => {
    const countBefore = await studentCount()
    const res = await restoreRequest({ ...buildRestorePayload(), adminPassword: 'wrong-password' })
    expect(res.status).toBe(401)
    expect(await studentCount()).toBe(countBefore)
    expect(await auditActions()).toContain('RESTORE_BACKUP_FAILED')
  })

  it('5. restore thiếu adminPassword → 400 (zValidator), dữ liệu KHÔNG bị xóa', async () => {
    const countBefore = await studentCount()
    const res = await restoreRequest(buildRestorePayload({ checksum: null }))
    expect(res.status).toBe(400)
    expect(await studentCount()).toBe(countBefore)
  })

  it('6. restore đúng mật khẩu nhưng checksum sai → 400, dữ liệu KHÔNG bị xóa', async () => {
    const countBefore = await studentCount()
    const res = await restoreRequest({ ...buildRestorePayload({ checksum: 'abc' }), adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(400)
    expect(await studentCount()).toBe(countBefore)
    expect(await auditActions()).not.toContain('RESTORE_BACKUP')
  })

  it('7. restore đúng mật khẩu + checksum → 200, dữ liệu THAY THẾ đúng + audit RESTORE_BACKUP', async () => {
    const newStudent = studentRow(`ST-${PREFIX}-NEW`, `SN-${PREFIX}`, 'Lê A07 Mới')
    // ADR-031: snapshot phải kèm class mà student tham chiếu (composite FK
    // students → classes) — restore xóa + ghi lại theo đúng payload.
    const res = await restoreRequest({ ...buildRestorePayload({ students: [newStudent], classes: [classRow] }), adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.counts.students).toBe(1)

    const remaining = await db.select().from(students).where(eq(students.parishId, PARISH))
    expect(remaining.length).toBe(1)
    expect(remaining[0].id).toBe(`ST-${PREFIX}-NEW`)
    expect(remaining[0].fullName).toBe('Lê A07 Mới')
    expect(await auditActions()).toContain('RESTORE_BACKUP')
  })

  it('8. adminReauthRateLimiter: brute force mật khẩu → 429 sau nỗ lực thứ 11', async () => {
    let got429 = false
    let attempts = 0
    for (let i = 0; i < 15; i++) {
      attempts++
      const res = await exportRequest({ adminPassword: 'brute-force-guess' })
      if (res.status === 429) {
        got429 = true
        break
      }
    }
    expect(got429).toBe(true)
    expect(attempts).toBeLessThanOrEqual(11)
  })
})
