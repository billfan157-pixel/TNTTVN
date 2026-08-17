import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import authApp from '../routes/auth.js'
import { db, client } from '../db/index.js'
import { users, students, classes, branches, academicYears, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

const PREFIX = Date.now()
const T = (s: string) => `${s}-${PREFIX}`
const parishId = T('parish-pfp')

const PHONE_PARENT_1 = '0901234567'
const PHONE_PARENT_2 = '0988776655'
const PHONE_GLV = '0911223344'

const PARENT_1_ID = T('usr-p1')
const PARENT_2_ID = T('usr-p2')
const GLV_ID = T('usr-glv')

const branchId = T('br')
const yearId = T('yr')
const classId = T('cl')

const STUDENT_1_ID = T('st1')
const STUDENT_2_ID = T('st2') // Sibling of Student 1
const STUDENT_DELETED_ID = T('st-del')

describe('ADR-042: Parent Self-Service Password Reset via Student Verification', () => {
  beforeEach(async () => {
    await client.execute({ sql: 'DELETE FROM rate_limits' }).catch(() => {})
  })

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({
      id: branchId,
      name: 'Phân Ngành PFP',
      scarfColor: '#fff',
      ageMin: 8,
      ageMax: 12,
      parishId,
    })
    await db.insert(academicYears).values({
      id: yearId,
      startDate: '2025-09-01',
      endDate: '2026-06-30',
      parishId,
    })
    await db.insert(classes).values({
      id: classId,
      code: `CL-PFP-${PREFIX}`,
      name: 'Lớp PFP',
      branchId,
      academicYearId: yearId,
      parishId,
    })
    await db.insert(users).values([
      {
        id: PARENT_1_ID,
        username: PHONE_PARENT_1,
        passwordHash: bcrypt.hashSync('OldPassword@123', 10),
        passwordEncrypted: 'v1:encrypted:old',
        fullName: 'Phụ Huynh Một',
        phone: PHONE_PARENT_1,
        role: 'phuhuynh',
        status: 'FORCE_PASSWORD_CHANGE',
        mustChangePassword: 1,
        tokenVersion: 1,
        parishId,
      },
      {
        id: PARENT_2_ID,
        username: PHONE_PARENT_2,
        passwordHash: bcrypt.hashSync('OldPassword@123', 10),
        passwordEncrypted: 'v1:encrypted:old',
        fullName: 'Phụ Huynh Hai',
        phone: PHONE_PARENT_2,
        role: 'phuhuynh',
        status: 'ACTIVE',
        mustChangePassword: 0,
        tokenVersion: 2,
        parishId,
      },
      {
        id: GLV_ID,
        username: 'glv_test',
        passwordHash: bcrypt.hashSync('OldPassword@123', 10),
        fullName: 'GLV Test',
        phone: PHONE_GLV,
        role: 'chunhiem',
        status: 'ACTIVE',
        tokenVersion: 1,
        parishId,
      },
    ])
    await db.insert(students).values([
      {
        id: STUDENT_1_ID,
        code: `ST1-${PREFIX}`,
        holyName: 'Giuse',
        fullName: 'Nguyễn Văn An',
        gender: 'Nam',
        dateOfBirth: '2015-05-20',
        parentName: 'Phụ Huynh Một',
        parentPhone: PHONE_PARENT_1,
        address: 'X',
        branch: 'AuNhi',
        classId,
        parishId,
        status: 'Đang học',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: STUDENT_2_ID,
        code: `ST2-${PREFIX}`,
        holyName: 'Maria',
        fullName: 'Nguyễn Thị Bình',
        gender: 'Nữ',
        dateOfBirth: '2017-10-15',
        parentName: 'Phụ Huynh Một',
        parentPhone: PHONE_PARENT_1,
        address: 'X',
        branch: 'AuNhi',
        classId,
        parishId,
        status: 'Đang học',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: STUDENT_DELETED_ID,
        code: `STDEL-${PREFIX}`,
        holyName: 'Phêrô',
        fullName: 'Trần Văn Cũ',
        gender: 'Nam',
        dateOfBirth: '2014-01-01',
        parentName: 'Phụ Huynh Hai',
        parentPhone: PHONE_PARENT_2,
        address: 'Y',
        branch: 'AuNhi',
        classId,
        parishId,
        status: 'Nghỉ học',
        deletedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ])
  })

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
    await db.delete(classes).where(eq(classes.id, classId))
    await db.delete(academicYears).where(eq(academicYears.id, yearId))
    await db.delete(branches).where(eq(branches.id, branchId))
  })

  it('rejects invalid phone number format with 400', async () => {
    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '123456',
        childDob: '2015-05-20',
        childName: 'An',
        newPassword: 'NewPassword@123',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects weak new password with 400', async () => {
    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: PHONE_PARENT_1,
        childDob: '2015-05-20',
        childName: 'An',
        newPassword: 'weakpassword',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects non-existent phone number with 400 INVALID_VERIFICATION_DATA', async () => {
    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '0999999999',
        childDob: '2015-05-20',
        childName: 'An',
        newPassword: 'NewPassword@123',
      }),
    })
    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error.code).toBe('INVALID_VERIFICATION_DATA')
  })

  it('rejects phone belonging to non-parent role with 400', async () => {
    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: PHONE_GLV,
        childDob: '2015-05-20',
        childName: 'An',
        newPassword: 'NewPassword@123',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects incorrect child DOB with 400', async () => {
    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: PHONE_PARENT_1,
        childDob: '2015-01-01', // sai DOB
        childName: 'Nguyễn Văn An',
        newPassword: 'NewPassword@123',
      }),
    })
    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error.code).toBe('INVALID_VERIFICATION_DATA')
  })

  it('rejects incorrect child name with 400', async () => {
    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: PHONE_PARENT_1,
        childDob: '2015-05-20',
        childName: 'Tên Không Khớp',
        newPassword: 'NewPassword@123',
      }),
    })
    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error.code).toBe('INVALID_VERIFICATION_DATA')
  })

  it('rejects soft-deleted student profile with 400', async () => {
    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: PHONE_PARENT_2,
        childDob: '2014-01-01',
        childName: 'Trần Văn Cũ',
        newPassword: 'NewPassword@123',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('resets password successfully with valid phone + DOB (YYYY-MM-DD) + fullName', async () => {
    const NEW_PASS = 'MatKhauMoi@2026'
    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: PHONE_PARENT_1,
        childDob: '2015-05-20',
        childName: 'Nguyễn Văn An',
        newPassword: NEW_PASS,
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.success).toBe(true)

    // Verify DB update
    const [u] = await db.select().from(users).where(eq(users.id, PARENT_1_ID)).limit(1)
    expect(bcrypt.compareSync(NEW_PASS, u.passwordHash)).toBe(true)
    expect(u.passwordEncrypted).toBeNull()
    expect(u.status).toBe('ACTIVE')
    expect(u.mustChangePassword).toBe(0)
    expect(u.tokenVersion).toBe(2) // incremented from 1 to 2

    // Verify audit log without PII
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, PARENT_1_ID), eq(auditLogs.action, 'PARENT_RESET_PASSWORD')))
      .limit(1)
    expect(audit).toBeDefined()
    expect(audit.newValue).not.toContain(NEW_PASS)
    expect(audit.newValue).toContain('090****567')
  })

  it('resets password successfully using sibling (child 2) with DD/MM/YYYY + holyName', async () => {
    const NEW_PASS_2 = 'SiblingPass@789'
    const res = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: PHONE_PARENT_1,
        childDob: '15/10/2017', // Format DD/MM/YYYY
        childName: 'Maria', // Tên Thánh của em thứ 2
        newPassword: NEW_PASS_2,
      }),
    })
    expect(res.status).toBe(200)

    const [u] = await db.select().from(users).where(eq(users.id, PARENT_1_ID)).limit(1)
    expect(bcrypt.compareSync(NEW_PASS_2, u.passwordHash)).toBe(true)
    expect(u.tokenVersion).toBe(3) // incremented from 2 to 3
  })
})
