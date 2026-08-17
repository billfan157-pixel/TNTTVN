import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import usersApp from '../routes/users.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, students, classes, branches, academicYears, auditLogs, catechistAssignments } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { createUser } from '../services/userService.js'

// Test cipher key — bật mã hóa pass tạm (password_encrypted) cho mật khẩu vừa tạo.
process.env.PASSWORD_CIPHER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const PREFIX = Date.now()
const T = (s: string) => `${s}-${PREFIX}`
const parishId = T('parish-pp') // pp = parent provision

// SĐT chờ được cấp tài khoản
const PHONE_CANDIDATE_1 = '0912345678' // s1 + s2 (2 con)
const PHONE_CANDIDATE_2 = '0911112222' // s10
const PHONE_NORMALIZED = '0903333333' // s6: '+84 903 333 333' → chuẩn hóa
// SĐT bị loại
const PHONE_EXISTING_PH = '0987654321' // đã có tài khoản phuhuynh
const PHONE_EXISTING_GLV = '0922334455' // đã có tài khoản chunhiem
const PHONE_USERNAME_COLLISION = '0900000123' // username đã tồn tại (dù phone khác)
const PHONE_PLACEHOLDER = 'Chưa cập nhật'
const PHONE_INVALID = '123456789' // 9 số — không hợp lệ
const PHONE_DELETED = '0933445566'
const PHONE_FOREIGN = '0944556677' // học sinh giáo xứ KHÁC — không được đụng tới

const ADMIN_ID = T('usr-admin')
const ADMIN_PASSWORD = 'AdminXacNhan@123'
const EXISTING_PH_ID = T('usr-ph')
const EXISTING_GLV_ID = T('usr-glv')
const USERNAME_COLLISION_ID = T('usr-col')
const branchId = T('br')
const yearId = T('yr')
const classId = T('cl')
const foreignParishId = T('parish-foreign')
const foreignClassId = T('cl-foreign')

function adminHeaders() {
  const { accessToken } = generateTokens({ userId: ADMIN_ID, username: 'pp-admin', role: 'admin', parishId, tokenVersion: 1 })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

function chunhiemHeaders() {
  const { accessToken } = generateTokens({ userId: T('usr-staff'), username: 'pp-staff', role: 'chunhiem', parishId, tokenVersion: 1 })
  return { Authorization: `Bearer ${accessToken}` }
}

function studentRow(id: string, code: string, parentPhone: string, parish: string, cls: string, deleted = false) {
  return {
    id, code, holyName: 'Giuse', fullName: `Học Sinh ${id}`, gender: 'Nam' as const,
    dateOfBirth: '2015-01-01', parentName: `Phụ Huynh ${id}`, parentPhone,
    address: 'X', branch: 'AuNhi' as const, classId: cls, status: deleted ? ('Nghỉ học' as const) : ('Đang học' as const),
    deletedAt: deleted ? new Date().toISOString() : null, parishId: parish,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
}

describe('ADR-026: Parent Account Provisioning (cấp tài khoản phụ huynh hàng loạt)', () => {
  beforeAll(async () => {
    await db.insert(branches).values([
      { id: branchId, name: 'Phân Ngành PP', scarfColor: '#fff', ageMin: 8, ageMax: 12, parishId },
      { id: T('br-foreign'), name: 'Phân Ngành Khác', scarfColor: '#fff', ageMin: 8, ageMax: 12, parishId: foreignParishId },
    ])
    await db.insert(academicYears).values([
      { id: yearId, startDate: '2025-09-01', endDate: '2026-06-30', parishId },
      { id: T('yr-foreign'), startDate: '2025-09-01', endDate: '2026-06-30', parishId: foreignParishId },
    ])
    await db.insert(classes).values([
      { id: classId, code: `CL-${PREFIX}`, name: 'Lớp 1', branchId, academicYearId: yearId, parishId },
      { id: foreignClassId, code: `CL-F-${PREFIX}`, name: 'Lớp Khác', branchId: T('br-foreign'), academicYearId: T('yr-foreign'), parishId: foreignParishId },
    ])
    await db.insert(users).values([
      { id: ADMIN_ID, username: 'pp-admin', passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10), fullName: 'Admin PP', phone: '0900000000', role: 'admin', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: EXISTING_PH_ID, username: T('pp-ph'), passwordHash: 'hash', fullName: 'Phụ Huynh Có Sẵn', phone: PHONE_EXISTING_PH, role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: EXISTING_GLV_ID, username: T('pp-glv'), passwordHash: 'hash', fullName: 'GLV Có Sẵn', phone: PHONE_EXISTING_GLV, role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
      // Username trùng đúng SĐT (toàn cục) nhưng phone khác — vẫn phải chặn (UNIQUE username)
      { id: USERNAME_COLLISION_ID, username: PHONE_USERNAME_COLLISION, passwordHash: 'hash', fullName: 'Người Dùng Trùng Username', phone: '0901000200', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: T('usr-staff'), username: T('pp-staff'), passwordHash: 'hash', fullName: 'Staff', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
    ])
    await db.insert(students).values([
      studentRow(T('s1'), `C1-${PREFIX}`, PHONE_CANDIDATE_1, parishId, classId),
      studentRow(T('s2'), `C2-${PREFIX}`, `+84${PHONE_CANDIDATE_1.slice(1)}`, parishId, classId), // cùng SĐT dạng +84 → dedupe
      studentRow(T('s3'), `C3-${PREFIX}`, PHONE_EXISTING_PH, parishId, classId),
      studentRow(T('s4'), `C4-${PREFIX}`, PHONE_PLACEHOLDER, parishId, classId),
      studentRow(T('s5'), `C5-${PREFIX}`, PHONE_INVALID, parishId, classId),
      studentRow(T('s6'), `C6-${PREFIX}`, '+84 903 333 333', parishId, classId), // chuẩn hóa → 0903333333
      studentRow(T('s7'), `C7-${PREFIX}`, PHONE_EXISTING_GLV, parishId, classId),
      studentRow(T('s8'), `C8-${PREFIX}`, PHONE_DELETED, parishId, classId, true),
      studentRow(T('s9'), `C9-${PREFIX}`, PHONE_USERNAME_COLLISION, parishId, classId),
      studentRow(T('s10'), `C10-${PREFIX}`, PHONE_CANDIDATE_2, parishId, classId),
      // Tenant isolation: học sinh giáo xứ khác không được xuất hiện trong preview
      studentRow(T('s11'), `C11-${PREFIX}`, PHONE_FOREIGN, foreignParishId, foreignClassId),
    ])
  })

  afterAll(async () => {
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, foreignParishId))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, foreignParishId))
    await db.delete(classes).where(eq(classes.id, classId))
    await db.delete(classes).where(eq(classes.id, foreignClassId))
    await db.delete(academicYears).where(eq(academicYears.id, yearId))
    await db.delete(academicYears).where(eq(academicYears.id, T('yr-foreign')))
    await db.delete(branches).where(eq(branches.id, branchId))
    await db.delete(branches).where(eq(branches.id, T('br-foreign')))
  })

  it('blocks unauthenticated preview with 401', async () => {
    const res = await usersApp.request('/parent-provision-preview')
    expect(res.status).toBe(401)
  })

  it('blocks non-admin preview with 403', async () => {
    const res = await usersApp.request('/parent-provision-preview', { headers: chunhiemHeaders() })
    expect(res.status).toBe(403)
  })

  it('preview returns only unmatched valid phones (dedupe siblings, skip existing/invalid/deleted/foreign)', async () => {
    const res = await usersApp.request('/parent-provision-preview', { headers: adminHeaders() })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.total).toBe(3)
    // validPhoneCount = số SĐT hợp lệ (đã chuẩn hóa, không placeholder/không hợp lệ/đã xóa/ngoài giáo xứ)
    // existingCount = validPhoneCount - total (SĐT hợp lệ đã có tài khoản / trùng username)
    expect(body.data.validPhoneCount).toBe(6)
    expect(body.data.existingCount).toBe(3)
    const phones = body.data.candidates.map((c: any) => c.phone)
    expect(phones.sort()).toEqual([PHONE_CANDIDATE_1, PHONE_CANDIDATE_2, PHONE_NORMALIZED].sort())
    const sibling = body.data.candidates.find((c: any) => c.phone === PHONE_CANDIDATE_1)
    expect(sibling.childrenCount).toBe(2) // s1 + s2 (+84 dạng) cùng SĐT → 1 tài khoản
    const normalized = body.data.candidates.find((c: any) => c.phone === PHONE_NORMALIZED)
    expect(normalized.parentName).toContain(T('s6')) // fullName = parentName của học sinh
  })

  it('provision requires adminPassword (400 khi thiếu)', async () => {
    const res = await usersApp.request('/provision-parents', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({}) })
    expect(res.status).toBe(400)
  })

  it('provision with WRONG adminPassword → 401 + audit PARENT_ACCOUNTS_PROVISION_FAILED', async () => {
    const res = await usersApp.request('/provision-parents', {
      method: 'POST', headers: adminHeaders(), body: JSON.stringify({ adminPassword: 'SaiMatKhau@123' }),
    })
    expect(res.status).toBe(401)
    const err = (await res.json()) as any
    expect(err.error.code).toBe('INVALID_ADMIN_PASSWORD')
    const [auditRow] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, ADMIN_ID), eq(auditLogs.action, 'PARENT_ACCOUNTS_PROVISION_FAILED')))
      .limit(1)
    expect(auditRow).toBeDefined()
  })

  it('provision creates phuhuynh accounts (username=SĐT, FORCE_PASSWORD_CHANGE, temp password đạt policy) + audit KHÔNG PII', async () => {
    const res = await usersApp.request('/provision-parents', {
      method: 'POST', headers: adminHeaders(), body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.total).toBe(3)
    expect(body.data.successCount).toBe(3)
    expect(body.data.skippedCount).toBe(0)
    expect(body.data.errorCount).toBe(0)

    const created = await db.select().from(users).where(and(eq(users.parishId, parishId), eq(users.role, 'phuhuynh'), eq(users.phone, PHONE_CANDIDATE_1)))
    expect(created).toHaveLength(1)
    expect(created[0].username).toBe(PHONE_CANDIDATE_1)
    expect(created[0].status).toBe('FORCE_PASSWORD_CHANGE')
    expect(created[0].mustChangePassword).toBe(1)
    expect(created[0].passwordEncrypted).toBeTruthy() // PASSWORD_CIPHER_KEY có trong test

    const item = body.data.results.find((r: any) => r.phone === PHONE_CANDIDATE_1)
    expect(item.username).toBe(PHONE_CANDIDATE_1)
    expect(item.tempPassword).toMatch(/^Parish@\d{6}$/)
    // bcrypt khớp mật khẩu tạm trả về (SSOT xác thực vẫn là bcrypt)
    expect(bcrypt.compareSync(item.tempPassword, created[0].passwordHash)).toBe(true)

    // SĐT +84 được chuẩn hóa khi lưu vào users.phone (đảm bảo khớp parentService)
    const normalized = await db.select().from(users).where(and(eq(users.parishId, parishId), eq(users.username, PHONE_NORMALIZED)))
    expect(normalized).toHaveLength(1)
    expect(normalized[0].phone).toBe(PHONE_NORMALIZED)

    // Audit gộp — KHÔNG chứa SĐT hoặc mật khẩu (A16)
    const [auditRow] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, ADMIN_ID), eq(auditLogs.action, 'PARENT_ACCOUNTS_PROVISIONED')))
      .limit(1)
    expect(auditRow).toBeDefined()
    const stored = auditRow!.newValue || ''
    expect(stored).not.toContain(PHONE_CANDIDATE_1.slice(0, 6)) // không lộ SĐT (dù che, ta chỉ assert không có SĐT nguyên vẹn)
    expect(stored).not.toContain(item.tempPassword)
    expect(stored).toContain('successCount')
  })

  it('provision is idempotent — chạy lại không tạo trùng (ADR-015)', async () => {
    const res = await usersApp.request('/provision-parents', {
      method: 'POST', headers: adminHeaders(), body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.total).toBe(0)
    expect(body.data.successCount).toBe(0)
    const created = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.parishId, parishId), eq(users.role, 'phuhuynh')))
    // 2 tài khoản PH tạo sẵn (EXISTING_PH_ID + USERNAME_COLLISION_ID) + 3 vừa cấp = 5 — không thừa
    expect(created).toHaveLength(5)
  })

  it('provisioned parents have NO catechistAssignments (only chunhiem/phuta)', async () => {
    const provisioned = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(and(eq(users.parishId, parishId), eq(users.role, 'phuhuynh'), eq(users.username, PHONE_CANDIDATE_1)))
    expect(provisioned).toHaveLength(1)
    const assigned = await db
      .select()
      .from(catechistAssignments)
      .where(eq(catechistAssignments.userId, provisioned[0].id))
    expect(assigned).toHaveLength(0)
  })

  it('createUser with role phuhuynh + assignedClasses does NOT create assignments (fix ô nhiễm)', async () => {
    const res = await createUser(
      { username: T('pp-ph-2'), fullName: 'Phụ Huynh 2', phone: '0955111222', role: 'phuhuynh', assignedClasses: [classId] },
      ADMIN_ID, parishId, '127.0.0.1', 'test',
    )
    expect(res).not.toBeNull()
    const rows = await db
      .select()
      .from(catechistAssignments)
      .where(and(eq(catechistAssignments.userId, res!.id), eq(catechistAssignments.parishId, parishId)))
    expect(rows).toHaveLength(0)
  })
})