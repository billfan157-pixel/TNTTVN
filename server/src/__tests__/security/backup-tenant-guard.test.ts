import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import backupRouter from '../../routes/backup.js'
import { db } from '../../db/index.js'
import { users, students, classes, grades, branches, academicYears, auditLogs } from '../../db/schema.js'
import { generateTokens } from '../../middleware/auth.js'
import { eq, and, inArray } from 'drizzle-orm'

/**
 * A-NEW-31 (2026-08-11): TENANT GUARD khi restore.
 *
 * PK các bảng là id thuần (không composite parish_id) và bước xóa của restore chỉ
 * xóa theo parish HIỆN TẠI → row của parish KHÁC (sống sót) có cùng id với row
 * trong payload sẽ bị INSERT..ON CONFLICT GHI ĐÈ (upsert) bằng dữ liệu file restore
 * → dữ liệu parish khác bị phá, row bị 'cướp' sang parish hiện tại, và
 * verifyActualCount KHÔNG phát hiện (row vừa cướp thuộc parish hiện tại nên count
 * khớp). Guard: trong transaction, mỗi batch upsert SELECT id thuộc parish ≠ current
 * → THROW → rollback toàn bộ.
 *
 * 6 cases từ audit (A-NEW-31 §verification matrix):
 *   1. Id trùng row parish KHÁC → 500 + rollback (dữ liệu 2 parish không đổi)
 *   2. Row parish khác KHÔNG bị xóa (vẫn còn, parishId không đổi — không bị cướp)
 *   3. Id lạ chung payload với id hợp lệ → rollback TOÀN BỘ (không có partial restore)
 *   4. Id MỚI (chưa thuộc parish nào) → restore THÀNH CÔNG (không false-positive)
 *   5. Id trùng row CHÍNH parish → restore THÀNH CÔNG (upsert idempotent vẫn hoạt động)
 *   6. Id lạ ở BẢNG KHÁC (grades) → 500 (guard áp cho mọi bảng restore)
 */

const PREFIX = `GUARD-${Date.now()}`
const PARISH_A = `pa-${PREFIX}`
const PARISH_B = `pb-${PREFIX}`
const ADMIN_ID = `USR-${PREFIX}`
const ADMIN_PASSWORD = 'GuardAdmin@123'
const BRANCH_ID = `BR-${PREFIX}`
const AY_ID = `AY-${PREFIX}`
const CLS_A = `CLS-A-${PREFIX}`
const CLS_B = `CLS-B-${PREFIX}`
const ST_B = `ST-B-${PREFIX}`

const { accessToken } = generateTokens({
  userId: ADMIN_ID,
  username: `guard_${PREFIX}`,
  role: 'admin',
  parishId: PARISH_A,
  tokenVersion: 1,
})
const authHeaders = { Authorization: `Bearer ${accessToken}` }

function sha256(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex')
}

function buildRestorePayload(opts: { students?: any[]; grades?: any[]; classes?: any[] } = {}) {
  const dataPayload = {
    students: opts.students ?? [],
    grades: opts.grades ?? [],
    attendance: [],
    classes: opts.classes ?? [],
    semesterLocks: [],
    gradeOverrides: [],
    promotionSnapshots: [],
    examSessions: [],
    examResults: [],
  }
  return {
    version: '2.0-production',
    parish: PARISH_A,
    exportedAt: new Date().toISOString(),
    checksum: sha256(dataPayload),
    data: dataPayload,
  }
}

function restoreRequest(body: Record<string, unknown>) {
  return backupRouter.request('/restore', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const foreignStudentRow = (id = ST_B) => ({
  id,
  code: `S-${PREFIX}`,
  holyName: 'Gioan',
  fullName: 'Học Sinh Parish Khác',
  gender: 'Nam',
  dateOfBirth: '2015-01-01',
  parentName: 'Bố B',
  parentPhone: '0900111222',
  address: 'Xã B',
  branch: 'AuNhi',
  classId: CLS_B,
  status: 'Đang học',
  parishId: PARISH_B,
} as const)

const newStudentRow = (id: string, classId: string) => ({
  id,
  code: `SN-${PREFIX}-${id}`,
  holyName: 'Gioan',
  fullName: 'Học Sinh Mới',
  gender: 'Nam',
  dateOfBirth: '2015-01-01',
  parentName: 'Bố Mới',
  parentPhone: '0900333444',
  address: 'Xã A',
  branch: 'AuNhi',
  classId,
  status: 'Đang học',
  parishId: PARISH_A,
} as const)

async function countStudents(parish: string): Promise<number> {
  const rows = await db.select().from(students).where(eq(students.parishId, parish))
  return rows.length
}

describe('A-NEW-31 — Restore Tenant Guard (id trùng row parish khác)', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4)
    await db.insert(users).values({
      id: ADMIN_ID,
      username: `guard_${PREFIX}`,
      passwordHash,
      fullName: 'Admin Guard',
      role: 'admin',
      parishId: PARISH_A,
      status: 'ACTIVE',
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    })
    await db.insert(branches).values([
      { id: BRANCH_ID, parishId: PARISH_A, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9 },
      { id: BRANCH_ID, parishId: PARISH_B, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9 },
    ])
    await db.insert(academicYears).values([
      { id: AY_ID, parishId: PARISH_A, startDate: '2025-09-01', endDate: '2026-05-31' },
      { id: AY_ID, parishId: PARISH_B, startDate: '2025-09-01', endDate: '2026-05-31' },
    ])
    // Lớp + học sinh của parish B (dữ liệu ngoài tầm ảnh hưởng của restore parish A)
    await db.insert(classes).values({ id: CLS_B, code: `CLSB-${PREFIX}`, name: 'Lớp Parish B', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH_B })
    await db.insert(students).values(foreignStudentRow())
  })

  afterAll(async () => {
    await db.delete(grades).where(eq(grades.parishId, PARISH_A))
    await db.delete(grades).where(eq(grades.parishId, PARISH_B))
    await db.delete(students).where(eq(students.parishId, PARISH_A))
    await db.delete(students).where(eq(students.parishId, PARISH_B))
    await db.delete(classes).where(eq(classes.parishId, PARISH_A))
    await db.delete(classes).where(eq(classes.parishId, PARISH_B))
    await db.delete(branches).where(inArray(branches.parishId, [PARISH_A, PARISH_B]))
    await db.delete(academicYears).where(inArray(academicYears.parishId, [PARISH_A, PARISH_B]))
    await db.delete(users).where(eq(users.id, ADMIN_ID))
    await db.delete(auditLogs).where(eq(auditLogs.userId, ADMIN_ID))
  })

  it('1. id trùng row parish KHÁC → 500 + rollback; dữ liệu 2 parish không đổi', async () => {
    const beforeA = await countStudents(PARISH_A)
    const beforeB = await countStudents(PARISH_B)
    const payload = buildRestorePayload({ students: [foreignStudentRow()] })

    const res = await restoreRequest({ ...payload, adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(500)

    expect(await countStudents(PARISH_A)).toBe(beforeA)
    expect(await countStudents(PARISH_B)).toBe(beforeB)
  })

  it('2. row parish khác KHÔNG bị xóa, KHÔNG bị cướp (parishId vẫn là B)', async () => {
    await restoreRequest({ ...buildRestorePayload({ students: [foreignStudentRow()] }), adminPassword: ADMIN_PASSWORD })

    const [row] = await db.select().from(students).where(eq(students.id, ST_B))
    expect(row).toBeDefined()
    expect(row.parishId).toBe(PARISH_B)
  })

  it('3. id lạ chung payload với id hợp lệ → rollback TOÀN BỘ (không partial restore)', async () => {
    const beforeA = await countStudents(PARISH_A)
    const payload = buildRestorePayload({
      classes: [{ id: CLS_A, code: `CLSA-${PREFIX}`, name: 'Lớp A', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH_A }],
      students: [newStudentRow('ST-NEW-G', CLS_A), foreignStudentRow()],
    })

    const res = await restoreRequest({ ...payload, adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(500)

    // Rollback: lớp A + student mới KHÔNG tồn tại (guard phát hiện trước khi ghi? không —
    // guard chạy per-batch nên batch classes đã INSERT rồi mới tới batch students throw →
    // transaction rollback phải hủy cả lớp đã insert).
    const [cls] = await db.select().from(classes).where(eq(classes.id, CLS_A))
    expect(cls).toBeUndefined()
    expect(await countStudents(PARISH_A)).toBe(beforeA)
  })

  it('4. id MỚI (chưa thuộc parish nào) → restore THÀNH CÔNG (không false-positive)', async () => {
    await db.insert(classes).values({ id: CLS_A, code: `CLSA-${PREFIX}`, name: 'Lớp A', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH_A })
    const clsRow = { id: CLS_A, code: `CLSA-${PREFIX}`, name: 'Lớp A', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH_A }
    const payload = buildRestorePayload({ classes: [clsRow], students: [newStudentRow('ST-NEW-OK', CLS_A)] })

    const res = await restoreRequest({ ...payload, adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.verified).toBe(true)
    expect(await countStudents(PARISH_A)).toBe(1)
  })

  it('5. id trùng row CHÍNH parish → restore THÀNH CÔNG (upsert idempotent vẫn hoạt động)', async () => {
    const ownId = 'ST-OWN-A'
    const clsRow = { id: CLS_A, code: `CLSA-${PREFIX}`, name: 'Lớp A', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH_A }
    await db.insert(students).values(newStudentRow(ownId, CLS_A))
    const payload = buildRestorePayload({
      classes: [clsRow],
      students: [{ ...newStudentRow(ownId, CLS_A), fullName: 'Đã cập nhật qua restore' }],
    })

    const res = await restoreRequest({ ...payload, adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(200)
    const [row] = await db.select().from(students).where(eq(students.id, ownId))
    expect(row).toBeDefined()
    expect(row.fullName).toBe('Đã cập nhật qua restore')
    expect(row.parishId).toBe(PARISH_A)
  })

  it('6. id lạ ở BẢNG KHÁC (grades) → 500 + rollback', async () => {
    const foreignGradeId = 'GR-B-1'
    await db.insert(grades).values({
      id: foreignGradeId,
      studentId: ST_B,
      academicYear: '2025-2026',
      semester: 1,
      scoreFinal: 7.5,
      parishId: PARISH_B,
    })

    const beforeB = await countStudents(PARISH_B)
    const payload = buildRestorePayload({ grades: [{ id: foreignGradeId, studentId: ST_B, academicYear: '2025-2026', semester: 1, scoreFinal: 9, parishId: PARISH_B }] })

    const res = await restoreRequest({ ...payload, adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(500)

    const [gr] = await db.select().from(grades).where(eq(grades.id, foreignGradeId))
    expect(gr).toBeDefined()
    expect(gr.scoreFinal).toBe(7.5) // không bị đè bởi payload
    expect(gr.parishId).toBe(PARISH_B)
    expect(await countStudents(PARISH_B)).toBe(beforeB)
    await db.delete(grades).where(and(eq(grades.id, foreignGradeId), eq(grades.parishId, PARISH_B)))
  })
})
