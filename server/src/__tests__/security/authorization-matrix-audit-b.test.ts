import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { generateTokens } from '../../middleware/auth.js'
import { db } from '../../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, pushSubscriptions, promotionRecords, semesterLocks, importBatchStudents, importBatches, auditLogs } from '../../db/schema.js'
import importRouter from '../../routes/import.js'
import usersRouter from '../../routes/users.js'
import promotionRouter from '../../routes/promotion.js'
import notificationsRouter from '../../routes/notifications.js'
import backupRouter from '../../routes/backup.js'
import { eq } from 'drizzle-orm'
import { createHash } from 'crypto'

const PREFIX = `AUDB-${Date.now()}`
const parishA = `parish-auditb-a-${PREFIX}`
const parishB = `parish-auditb-b-${PREFIX}`

const adminAId = `usr-admin-a-${PREFIX}`
const catA1Id = `usr-cat-a1-${PREFIX}`
const catA2Id = `usr-cat-a2-${PREFIX}`
const adminBId = `usr-admin-b-${PREFIX}`

const branchAId = `br-a-${PREFIX}`
const ayAId = `AY-A-${PREFIX}`
const ayANextId = `AY-A-NEXT-${PREFIX}`
const classA1Id = `cls-a1-${PREFIX}`
const classA2Id = `cls-a2-${PREFIX}`
const classA1NextId = `cls-a1-next-${PREFIX}`
const studentA1Id = `st-a1-${PREFIX}`
const studentA2Id = `st-a2-${PREFIX}`

const branchBId = `br-b-${PREFIX}`
const ayBId = `AY-B-${PREFIX}`
const classB1Id = `cls-b1-${PREFIX}`
const studentB1Id = `st-b1-${PREFIX}`

const ADMIN_PASSWORD = 'AuditBAdmin@123'

const adminAToken = generateTokens({ userId: adminAId, username: `admin_a_${PREFIX}`, role: 'admin', parishId: parishA, tokenVersion: 1 }).accessToken
const catA1Token = generateTokens({ userId: catA1Id, username: `cat_a1_${PREFIX}`, role: 'chunhiem', parishId: parishA, tokenVersion: 1 }).accessToken
const _catA2Token = generateTokens({ userId: catA2Id, username: `cat_a2_${PREFIX}`, role: 'chunhiem', parishId: parishA, tokenVersion: 1 }).accessToken
const _adminBToken = generateTokens({ userId: adminBId, username: `admin_b_${PREFIX}`, role: 'admin', parishId: parishB, tokenVersion: 1 }).accessToken

const headersAdminA = { Authorization: `Bearer ${adminAToken}` }
const headersCatA1 = { Authorization: `Bearer ${catA1Token}` }

describe('AUDIT B — Comprehensive Authorization Matrix Integration Tests', () => {
  beforeAll(async () => {
    const passHash = await bcrypt.hash(ADMIN_PASSWORD, 4)
    const now = new Date().toISOString()
    const year = new Date().getFullYear()

    // 1. Users
    await db.insert(users).values([
      { id: adminAId, username: `admin_a_${PREFIX}`, fullName: 'Admin A', passwordHash: passHash, role: 'admin', parishId: parishA, status: 'ACTIVE', tokenVersion: 1, createdAt: now },
      { id: catA1Id, username: `cat_a1_${PREFIX}`, fullName: 'Chủ Nhiệm A1', passwordHash: passHash, role: 'chunhiem', parishId: parishA, status: 'ACTIVE', tokenVersion: 1, createdAt: now },
      { id: catA2Id, username: `cat_a2_${PREFIX}`, fullName: 'Chủ Nhiệm A2', passwordHash: passHash, role: 'chunhiem', parishId: parishA, status: 'ACTIVE', tokenVersion: 1, createdAt: now },
      { id: adminBId, username: `admin_b_${PREFIX}`, fullName: 'Admin B', passwordHash: passHash, role: 'admin', parishId: parishB, status: 'ACTIVE', tokenVersion: 1, createdAt: now },
    ]).onConflictDoNothing()

    // 2. Branches & Academic Years
    await db.insert(branches).values([
      { id: branchAId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: parishA },
      { id: branchBId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: parishB },
    ]).onConflictDoNothing()

    await db.insert(academicYears).values([
      { id: ayAId, parishId: parishA, startDate: `${year}-08-01`, endDate: `${year + 1}-07-31`, isLocked: 0, promotionTargetYearId: ayANextId },
      { id: ayANextId, parishId: parishA, startDate: `${year + 1}-08-01`, endDate: `${year + 2}-07-31`, isLocked: 0 },
      { id: ayBId, parishId: parishB, startDate: `${year}-08-01`, endDate: `${year + 1}-07-31`, isLocked: 0 },
    ]).onConflictDoNothing()

    // 3. Classes
    await db.insert(classes).values([
      { id: classA1Id, code: `Lớp A1-${PREFIX}`, name: `Lớp A1-${PREFIX}`, branchId: branchAId, academicYearId: ayAId, parishId: parishA },
      { id: classA2Id, code: `Lớp A2-${PREFIX}`, name: `Lớp A2-${PREFIX}`, branchId: branchAId, academicYearId: ayAId, parishId: parishA },
      { id: classA1NextId, code: `Lớp A1 Next-${PREFIX}`, name: `Lớp A1 Next-${PREFIX}`, branchId: branchAId, academicYearId: ayANextId, parishId: parishA },
      { id: classB1Id, code: `Lớp B1-${PREFIX}`, name: `Lớp B1-${PREFIX}`, branchId: branchBId, academicYearId: ayBId, parishId: parishB },
    ]).onConflictDoNothing()

    // 4. Assignments
    await db.insert(catechistAssignments).values([
      { id: `asg-a1-${PREFIX}`, userId: catA1Id, classId: classA1Id, roleInClass: 'chunhiem', parishId: parishA },
      { id: `asg-a1-next-${PREFIX}`, userId: catA1Id, classId: classA1NextId, roleInClass: 'phuta', parishId: parishA },
      { id: `asg-a2-${PREFIX}`, userId: catA2Id, classId: classA2Id, roleInClass: 'chunhiem', parishId: parishA },
    ]).onConflictDoNothing()

    // 5. Students
    await db.insert(students).values([
      { id: studentA1Id, code: `STA1-${PREFIX}`, holyName: 'Giuse', fullName: 'Học Sinh A1', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P1', parentPhone: '0981111111', address: 'X', branch: 'AuNhi', classId: classA1Id, parishId: parishA },
      { id: studentA2Id, code: `STA2-${PREFIX}`, holyName: 'Maria', fullName: 'Học Sinh A2', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'P2', parentPhone: '0982222222', address: 'X', branch: 'AuNhi', classId: classA2Id, parishId: parishA },
      { id: studentB1Id, code: `STB1-${PREFIX}`, holyName: 'Phero', fullName: 'Học Sinh B1', gender: 'Nam', dateOfBirth: '2015-03-03', parentName: 'P3', parentPhone: '0983333333', address: 'Y', branch: 'AuNhi', classId: classB1Id, parishId: parishB },
    ]).onConflictDoNothing()

    // 6. Semester lock for promotion tests
    await db.insert(semesterLocks).values({
      id: `sl-a-${PREFIX}`, parishId: parishA, academicYear: `${year}-${year + 1}`, semester: 2, isLocked: 1,
    }).onConflictDoNothing()
  })

  afterAll(async () => {
    await db.delete(importBatchStudents).where(eq(importBatchStudents.parishId, parishA))
    await db.delete(importBatches).where(eq(importBatches.parishId, parishA))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishA))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishB))
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.parishId, parishA))
    await db.delete(promotionRecords).where(eq(promotionRecords.parishId, parishA))
    await db.delete(semesterLocks).where(eq(semesterLocks.parishId, parishA))
    await db.delete(students).where(eq(students.parishId, parishA))
    await db.delete(students).where(eq(students.parishId, parishB))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishA))
    await db.delete(classes).where(eq(classes.parishId, parishA))
    await db.delete(classes).where(eq(classes.parishId, parishB))
    await db.delete(users).where(eq(users.parishId, parishA))
    await db.delete(users).where(eq(users.parishId, parishB))
    await db.delete(branches).where(eq(branches.parishId, parishA))
    await db.delete(branches).where(eq(branches.parishId, parishB))
    await db.delete(academicYears).where(eq(academicYears.parishId, parishA))
    await db.delete(academicYears).where(eq(academicYears.parishId, parishB))
  })

  describe('B-01: Import Class-Level Authorization Bypass Prevention', () => {
    it('chunhiem CAN import students into assigned class', async () => {
      const res = await importRouter.request('/import', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{ rowIndex: 0, holyName: 'Phero', fullName: 'Học Sinh Mới A1', gender: 'Nam', dateOfBirth: '2015-05-05', parentName: 'P', parentPhone: '0901234567', address: 'X', branch: 'AuNhi', className: `Lớp A1-${PREFIX}` }],
          academicYearId: ayAId,
          classMappings: { [`Lớp A1-${PREFIX}`]: classA1Id },
          duplicateActions: {},
          fileName: 'test_a1.xlsx',
        }),
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.data.imported).toBe(1)
    })

    it('chunhiem CANNOT import students into unassigned class (returns class_error)', async () => {
      const res = await importRouter.request('/import', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{ rowIndex: 0, holyName: 'Toma', fullName: 'Học Sinh Ké A2', gender: 'Nam', dateOfBirth: '2015-06-06', parentName: 'P', parentPhone: '0907654321', address: 'X', branch: 'AuNhi', className: `Lớp A2-${PREFIX}` }],
          academicYearId: ayAId,
          classMappings: { [`Lớp A2-${PREFIX}`]: classA2Id },
          duplicateActions: {},
          fileName: 'test_a2.xlsx',
        }),
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.data.imported).toBe(0)
      expect(json.data.errors).toBe(1)
    })

    it('chunhiem CANNOT update existing student in unassigned class via import duplicate match', async () => {
      const res = await importRouter.request('/import', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{ rowIndex: 0, holyName: 'Maria', fullName: 'Học Sinh A2', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'P2', parentPhone: '0982222222', address: 'Địa Chỉ Bị Giả Mạo', branch: 'AuNhi', className: `Lớp A1-${PREFIX}` }],
          academicYearId: ayAId,
          classMappings: { [`Lớp A1-${PREFIX}`]: classA1Id },
          duplicateActions: { '0': 'update' },
          fileName: 'test_dup_hack.xlsx',
        }),
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.data.imported).toBe(0)

      // Verify student A2 was NOT modified
      const [st] = await db.select().from(students).where(eq(students.id, studentA2Id))
      expect(st.address).toBe('X')
      expect(st.classId).toBe(classA2Id)
    })

    it('chunhiem CANNOT create new classes via import payload (rejects with error)', async () => {
      const res = await importRouter.request('/import', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{ rowIndex: 0, holyName: 'Lucia', fullName: 'Học Sinh Lớp Mới', gender: 'Nữ', dateOfBirth: '2015-07-07', parentName: 'P', parentPhone: '0909999999', address: 'X', branch: 'AuNhi', className: 'Lớp Mới Tạo' }],
          academicYearId: ayAId,
          classMappings: {},
          newClasses: [{ name: 'Lớp Mới Tạo', branch: 'AuNhi', academicYearId: ayAId }],
          duplicateActions: {},
          fileName: 'test_new_class.xlsx',
        }),
      })
      expect(res.status).toBe(403)
      const json = (await res.json()) as any
      expect(json.error.message).toContain('không có quyền tạo mới lớp')
    })
  })

  describe('B-02: Import Validation Information Disclosure Prevention', () => {
    it('validateImport for chunhiem does NOT leak unassigned class metadata or duplicates', async () => {
      const res = await importRouter.request('/validate', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{ rowIndex: 0, holyName: 'Maria', fullName: 'Học Sinh A2', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'P2', parentPhone: '0982222222', address: 'X', branch: 'AuNhi', className: `Lớp A2-${PREFIX}` }],
          academicYearId: ayAId,
        }),
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      // Duplicate detection should return null because studentA2 is in unassigned classA2
      expect(json.data.rows[0].duplicateOf).toBeNull()
    })
  })

  describe('NEW-B01: Import Mapping Memory Object Authorization Enforcement', () => {
    it('chunhiem CAN save mapping memory for assigned class', async () => {
      const res = await importRouter.request('/mappings', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'class',
          alias: 'Lớp 1A',
          entityId: classA1Id,
        }),
      })
      expect(res.status).toBe(200)
    })

    it('chunhiem is FORBIDDEN (403) from saving mapping memory for unassigned class', async () => {
      const res = await importRouter.request('/mappings', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'class',
          alias: 'Lớp 2A Ké',
          entityId: classA2Id, // classA2 is unassigned for catA1!
        }),
      })
      expect(res.status).toBe(403)
      const json = (await res.json()) as any
      expect(json.error.message).toContain('không có quyền lưu ghi nhớ ánh xạ cho lớp này')
    })

    it('chunhiem is FORBIDDEN (403) from saving mapping memory for student in unassigned class', async () => {
      const res = await importRouter.request('/mappings', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'student',
          alias: 'Em A2 Ké',
          entityId: studentA2Id, // studentA2 belongs to classA2!
        }),
      })
      expect(res.status).toBe(403)
      const json = (await res.json()) as any
      expect(json.error.message).toContain('không có quyền lưu ghi nhớ ánh xạ cho thiếu nhi này')
    })
  })

  describe('NEW-B02: Import History Ownership Scoping', () => {
    const batchIdCatA1 = `batch-cat-a1-${PREFIX}`
    const batchIdCatA2 = `batch-cat-a2-${PREFIX}`

    beforeAll(async () => {
      const now = new Date().toISOString()
      await db.insert(importBatches).values([
        { id: batchIdCatA1, userId: catA1Id, parishId: parishA, fileName: 'a1.xlsx', totalRows: 1, imported: 1, status: 'completed', createdAt: now },
        { id: batchIdCatA2, userId: catA2Id, parishId: parishA, fileName: 'a2.xlsx', totalRows: 1, imported: 1, status: 'completed', createdAt: now },
      ]).onConflictDoNothing()
    })

    it('chunhiem GET /import/history ONLY returns import batches created by themselves', async () => {
      const res = await importRouter.request('/history', {
        method: 'GET',
        headers: headersCatA1,
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.data.some((b: any) => b.id === batchIdCatA1)).toBe(true)
      expect(json.data.some((b: any) => b.id === batchIdCatA2)).toBe(false)
    })

    it('admin GET /import/history returns ALL import batches in the parish', async () => {
      const res = await importRouter.request('/history', {
        method: 'GET',
        headers: headersAdminA,
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.data.some((b: any) => b.id === batchIdCatA1)).toBe(true)
      expect(json.data.some((b: any) => b.id === batchIdCatA2)).toBe(true)
    })

    it('chunhiem CANNOT view batch details (403) of another catechist import batch', async () => {
      const res = await importRouter.request(`/batch/${batchIdCatA2}`, {
        method: 'GET',
        headers: headersCatA1,
      })
      expect(res.status).toBe(403)
    })

    it('chunhiem CAN view batch details of their own import batch', async () => {
      const res = await importRouter.request(`/batch/${batchIdCatA1}`, {
        method: 'GET',
        headers: headersCatA1,
      })
      expect(res.status).toBe(200)
    })
  })

  describe('B-03: Restore Backup Cross-Tenant Overwrite Protection', () => {
    it('restore payload containing existing ID from foreign parish is REJECTED with RESTORE_TENANT_VIOLATION', async () => {
      const dataPayload = {
        students: [
          // studentB1Id belongs to parishB in DB!
          { id: studentB1Id, code: 'STB1-HACK', holyName: 'Phero', fullName: 'Học Sinh B1 Bị Cướp', gender: 'Nam', dateOfBirth: '2015-03-03', parentName: 'P3', parentPhone: '0983333333', address: 'Hack', branch: 'AuNhi', classId: classA1Id, parishId: parishA },
        ],
        grades: [], attendance: [], classes: [], semesterLocks: [], gradeOverrides: [], promotionSnapshots: [], examSessions: [], examResults: [],
      }
      const dataJson = JSON.stringify(dataPayload)
      const checksum = createHash('sha256').update(dataJson).digest('hex')

      const res = await backupRouter.request('/restore', {
        method: 'POST',
        headers: { ...headersAdminA, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPassword: ADMIN_PASSWORD,
          checksum,
          parish: parishA,
          version: '2.0-production',
          exportedAt: new Date().toISOString(),
          data: dataPayload,
        }),
      })

      expect(res.status).toBe(500)
      // Verify studentB1 in parishB was NOT overwritten or stolen
      const [stB] = await db.select().from(students).where(eq(students.id, studentB1Id))
      expect(stB.parishId).toBe(parishB)
      expect(stB.fullName).toBe('Học Sinh B1')
    })
  })

  describe('B-04: User Management vs Catechist Directory API Separation', () => {
    it('chunhiem is FORBIDDEN (403) from accessing admin user management GET /users', async () => {
      const res = await usersRouter.request('/', {
        method: 'GET',
        headers: headersCatA1,
      })
      expect(res.status).toBe(403)
    })

    it('chunhiem is FORBIDDEN (403) from accessing admin user management GET /users/:id', async () => {
      const res = await usersRouter.request(`/${catA1Id}`, {
        method: 'GET',
        headers: headersCatA1,
      })
      expect(res.status).toBe(403)
    })

    it('chunhiem CAN access catechist directory GET /users/catechists', async () => {
      const res = await usersRouter.request('/catechists', {
        method: 'GET',
        headers: headersCatA1,
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(Array.isArray(json.data)).toBe(true)
      expect(json.data.length).toBeGreaterThan(0)
      // Check that response does not contain sensitive admin user fields like passwordHash/passwordEncrypted/tokenVersion
      const first = json.data[0]
      expect(first.passwordHash).toBeUndefined()
      expect(first.passwordEncrypted).toBeUndefined()
      expect(first.tokenVersion).toBeUndefined()
    })
  })

  describe('B-05: Promotion Target Class Authorization Enforcement', () => {
    it('chunhiem CAN approve promotion when nextClassId is in assigned classes', async () => {
      const year = new Date().getFullYear()
      const res = await promotionRouter.request('/approve', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentA1Id,
          academicYear: `${year}-${year + 1}`,
          targetClassId: classA1Id,
          nextClassId: classA1NextId,
          gpa: 0,
          attendanceRate: 100,
        }),
      })
      expect(res.status).toBe(200)
    })

    it('chunhiem is FORBIDDEN (403) from setting nextClassId to an unassigned class', async () => {
      const year = new Date().getFullYear()
      const res = await promotionRouter.request('/approve', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentA1Id,
          academicYear: `${year}-${year + 1}`,
          targetClassId: classA1Id,
          nextClassId: classA2Id, // classA2 is unassigned for catA1!
          gpa: 0,
          attendanceRate: 100,
        }),
      })
      expect(res.status).toBe(403)
      const json = (await res.json()) as any
      expect(json.error.message).toContain('không có quyền gán thiếu nhi vào lớp chuyển đến này')
    })
  })

  describe('B-06: Push Subscription User-Scoped Delete Enforcement', () => {
    it('user A CANNOT delete push subscription of user B', async () => {
      const endpointB = `https://push.example.com/sub-b-${PREFIX}`
      // Insert subscription owned by catA2
      await db.insert(pushSubscriptions).values({
        id: `sub-b-${PREFIX}`,
        endpoint: endpointB,
        p256dh: 'keys_b',
        auth: 'auth_b',
        userId: catA2Id,
        parishId: parishA,
      })

      // catA1 attempts to unsubscribe catA2's endpoint
      const res = await notificationsRouter.request('/unsubscribe', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpointB }),
      })
      expect(res.status).toBe(200)

      // Verify sub-b is STILL in DB
      const [sub] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpointB))
      expect(sub).toBeDefined()
      expect(sub.userId).toBe(catA2Id)
    })

    it('user A CAN delete their own push subscription', async () => {
      const endpointA = `https://push.example.com/sub-a-${PREFIX}`
      await db.insert(pushSubscriptions).values({
        id: `sub-a-${PREFIX}`,
        endpoint: endpointA,
        p256dh: 'keys_a',
        auth: 'auth_a',
        userId: catA1Id,
        parishId: parishA,
      })

      const res = await notificationsRouter.request('/unsubscribe', {
        method: 'POST',
        headers: { ...headersCatA1, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpointA }),
      })
      expect(res.status).toBe(200)

      const [sub] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpointA))
      expect(sub).toBeUndefined()
    })
  })
})
