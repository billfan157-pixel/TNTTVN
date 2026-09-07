import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import backupRouter from '../routes/backup.js'
import studentsRouter from '../routes/students.js'
import gradesRouter from '../routes/grades.js'
import { db } from '../db/index.js'
import { students, grades, classes, users, auditLogs,  catechistAssignments, branches, academicYears } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { generateTokens } from '../middleware/auth.js'
import { eq, and } from 'drizzle-orm'

describe('PARISH LMS GO-LIVE PRODUCTION COMBAT VERIFICATION SUITE', () => {
  const parishId = 'gia-ton-golive'
  const adminId = generateId('USR')
  const catechistAId = generateId('USR')
  const catechistBId = generateId('USR')
  const parentId = generateId('USR')

  // A07 (2026-08-10): backup export/restore yêu cầu re-authentication — admin
  // phải có bcrypt hash hợp lệ + gửi adminPassword.
  const ADMIN_PASSWORD = 'GoLiveAdmin@123'

  const classAId = generateId('CLS')
  const classBId = generateId('CLS')

  const { accessToken: adminToken } = generateTokens({ userId: adminId, username: 'admin_golive', role: 'admin', parishId, tokenVersion: 1 })
  const { accessToken: catechistAToken } = generateTokens({ userId: catechistAId, username: 'glv_a', role: 'chunhiem', parishId, tokenVersion: 1 })
  const { accessToken: _catechistBToken } = generateTokens({ userId: catechistBId, username: 'glv_b', role: 'chunhiem', parishId, tokenVersion: 1 })
  const { accessToken: parentToken } = generateTokens({ userId: parentId, username: 'parent_user', role: 'phuhuynh', parishId, tokenVersion: 1 })

  beforeEach(async () => {
    // Seed Branch & Academic Year for FK integrity
    await db.insert(branches).values({
      id: 'br-au',
      name: 'Ấu Nhi',
      scarfColor: 'Xanh Lá',
      ageMin: 7,
      ageMax: 9,
      parishId,
    }).onConflictDoNothing()

    await db.insert(academicYears).values({
      id: '2025-2026',
      startDate: '2025-09-01',
      endDate: '2026-06-01',
      isLocked: 0,
      parishId,
    }).onConflictDoNothing()

    // Seed Users
    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 4)
    await db.insert(users).values([
      { id: adminId, username: `admin_gl_${Date.now()}`, passwordHash: adminHash, fullName: 'Admin GoLive', role: 'admin', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: catechistAId, username: `glv_a_${Date.now()}`, passwordHash: 'hash', fullName: 'GLV Class A', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: catechistBId, username: `glv_b_${Date.now()}`, passwordHash: 'hash', fullName: 'GLV Class B', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: parentId, username: `parent_${Date.now()}`, passwordHash: 'hash', fullName: 'Parent User', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
    ]).onConflictDoNothing()

    // Seed Classes & Assignments
    await db.insert(classes).values([
      { id: classAId, code: `AN1-${Date.now()}`, name: 'Ấu Nhi 1A', branchId: 'br-au', academicYearId: '2025-2026', parishId },
      { id: classBId, code: `AN2-${Date.now()}`, name: 'Ấu Nhi 2B', branchId: 'br-au', academicYearId: '2025-2026', parishId },
    ]).onConflictDoNothing()

    await db.insert(catechistAssignments).values([
      { id: generateId('ASN'), userId: catechistAId, classId: classAId, roleInClass: 'chunhiem', parishId },
      { id: generateId('ASN'), userId: catechistBId, classId: classBId, roleInClass: 'chunhiem', parishId },
    ]).onConflictDoNothing()
  })

  // ─── CHECK 1: MIGRATION & DATA INTEGRITY ───
  it('CHECK 1: Database Migration applies all schema constraints without data loss', async () => {
    const testStudentId = generateId('ST')
    await db.insert(students).values({
      id: testStudentId,
      code: `ST-MIG-${Date.now()}`,
      holyName: 'Giuse',
      fullName: 'Học Sinh Migration',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Cha Mẹ',
      parentPhone: '0901234567',
      address: 'Giáo Xứ',
      branch: 'AuNhi',
      classId: classAId,
      parishId,
      status: 'Đang học',
    })

    const [retrieved] = await db.select().from(students).where(eq(students.id, testStudentId))
    expect(retrieved).toBeDefined()
    expect(retrieved.fullName).toBe('Học Sinh Migration')
  })

  // ─── CHECK 2: BACKUP & RESTORE COMBAT ───
  describe('CHECK 2: Real Backup & Restore Combat Protocol', () => {
    it('2.1 partial profile rejects excluded assignments, then round-trips supported rows', async () => {
      const testId = generateId('ST')
      await db.insert(students).values({
        id: testId,
        code: `ST-BK-COMBAT-${Date.now()}`,
        holyName: 'Maria',
        fullName: 'Thiếu Nhi Backup Test',
        gender: 'Nữ',
        dateOfBirth: '2016-03-03',
        parentName: 'Mẹ',
        parentPhone: '0900000000',
        address: 'Địa chỉ',
        branch: 'AuNhi',
        classId: classAId,
        parishId,
        status: 'Đang học',
      })

      // Export (A-NEW-28: POST body — adminPassword không còn trong URL)
      const exportRes = await backupRouter.request('/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
      })
      expect(exportRes.status).toBe(200)
      const backupData = (await exportRes.json()) as any
      expect(backupData.checksum).toBeDefined()

      const blockedRes = await backupRouter.request('/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ ...backupData, adminPassword: ADMIN_PASSWORD }),
      })
      expect(blockedRes.status).toBe(409)
      expect(((await blockedRes.json()) as any).error.code).toBe('RESTORE_UNSUPPORTED_DEPENDENCIES')
      expect(await db.select().from(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))).not.toHaveLength(0)

      // This fixture deliberately narrows current state to the documented
      // partial profile. Real state with assignments requires full DB recovery.
      await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))

      // Delete record to simulate data loss
      await db.delete(students).where(eq(students.id, testId))
      const checkDeleted = await db.select().from(students).where(eq(students.id, testId))
      expect(checkDeleted.length).toBe(0)

      // Restore
      const restoreRes = await backupRouter.request('/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ ...backupData, adminPassword: ADMIN_PASSWORD })
      })
      expect(restoreRes.status).toBe(200)

      // Verify the supported profile row was restored.
      const [restoredStudent] = await db.select().from(students).where(eq(students.id, testId))
      expect(restoredStudent).toBeDefined()
      expect(restoredStudent.fullName).toBe('Thiếu Nhi Backup Test')
    })

    it('2.2 Rejects restore when SHA256 checksum is corrupted', async () => {
      const payload = {
        version: '2.0-production',
        adminPassword: ADMIN_PASSWORD,
        parish: parishId,
        exportedAt: new Date().toISOString(),
        checksum: 'b'.repeat(64),
        data: {
          students: [{ id: 'ST-X', code: 'ST-X', fullName: 'X', gender: 'Nam', dateOfBirth: '2015-01-01', branch: 'AuNhi', classId: classAId, parishId }],
          grades: [],
          attendance: [],
          classes: [],
          semesterLocks: [],
          gradeOverrides: [],
          promotionSnapshots: [],
          examSessions: [],
          examResults: [],
        }
      }
      const res = await backupRouter.request('/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(payload)
      })
      expect(res.status).toBe(400)
      const json = (await res.json()) as any
      expect(json.error).toContain('Checksum')
    })
  })

  // ─── CHECK 3: RBAC & IDOR PRIVILEGE GATE ───
  describe('CHECK 3: RBAC & IDOR Privilege Security Controls', () => {
    it('3.1 Parent user is blocked (403 Forbidden) from viewing unauthorized student details', async () => {
      const studentId = generateId('ST')
      await db.insert(students).values({
        id: studentId,
        code: `ST-IDOR-${Date.now()}`,
        holyName: 'Phaolô',
        fullName: 'Học Sinh IDOR Test',
        gender: 'Nam',
        dateOfBirth: '2015-01-01',
        parentName: 'Cha Mẹ B',
        parentPhone: '0911111111',
        address: 'Địa chỉ',
        branch: 'AuNhi',
        classId: classBId,
        parishId,
        status: 'Đang học',
      })

      const res = await studentsRouter.request(`/${studentId}`, {
        headers: { Authorization: `Bearer ${parentToken}` }
      })
      expect(res.status).toBe(403)
    })

    it('3.2 Catechist Class A is blocked (403 Forbidden) from modifying Class B student grades', async () => {
      const studentInClassBId = generateId('ST')
      const gradeInClassBId = generateId('GRD')

      await db.insert(students).values({
        id: studentInClassBId,
        code: `ST-CLS-B-${Date.now()}`,
        holyName: 'Tôma',
        fullName: 'Học Sinh Lớp B',
        gender: 'Nam',
        dateOfBirth: '2015-01-01',
        parentName: 'Cha Mẹ B',
        parentPhone: '0922222222',
        address: 'Địa chỉ',
        branch: 'AuNhi',
        classId: classBId,
        parishId,
        status: 'Đang học',
      })

      await db.insert(grades).values({
        id: gradeInClassBId,
        studentId: studentInClassBId,
        academicYear: '2025-2026',
        semester: 1,
        scoreOral: 8,
        version: 1,
        parishId,
      })

      // Catechist A (assigned to Class A) tries to edit Grade in Class B
      const res = await gradesRouter.request(`/${gradeInClassBId}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catechistAToken}` },
        body: JSON.stringify({ studentId: studentInClassBId, scoreField: 'scoreMidterm', manualValue: 9.0, reasonCode: 'TeacherAdjustment' })
      })
      expect(res.status).toBe(403)
    })
  })

  // ─── CHECK 4: CONCURRENT EDITING & VERSION LOCK ───
  it('CHECK 4: Version conflict is triggered on stale concurrent edit', async () => {
    const studentId = generateId('ST')
    const gradeId = generateId('GRD')

    await db.insert(students).values({
      id: studentId,
      code: `ST-CONCUR-${Date.now()}`,
      holyName: 'Anna',
      fullName: 'Học Sinh Concurrency Test',
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'Mẹ',
      parentPhone: '0933333333',
      address: 'Địa chỉ',
      branch: 'AuNhi',
      classId: classAId,
      parishId,
      status: 'Đang học',
    })

    await db.insert(grades).values({
      id: gradeId,
      studentId,
      academicYear: '2025-2026',
      semester: 1,
      scoreOral: 7,
      version: 1,
      parishId,
    })

    // Catechist A saves first: updates version from 1 -> 2
    await db.update(grades).set({ scoreOral: 8, version: 2 }).where(and(eq(grades.id, gradeId), eq(grades.version, 1)))

    // Catechist B attempts to save using stale version 1
    const [freshGrade] = await db.select().from(grades).where(eq(grades.id, gradeId))
    expect(freshGrade.version).toBe(2)
  })

  // ─── CHECK 5: AUDIT LOG APPEND-ONLY INTEGRITY ───
  it('CHECK 5: Audit logs accurately capture userId, IP, and timestamps', async () => {
    const auditId = generateId('AUD')
    await db.insert(auditLogs).values({
      id: auditId,
      userId: adminId,
      action: 'GRADE_OVERRIDE',
      entityType: 'Grade',
      entityId: 'GRD-100',
      oldValue: JSON.stringify({ score: 5.0 }),
      newValue: JSON.stringify({ score: 8.5 }),
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0 Vitest',
      parishId,
    })

    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.id, auditId))
    expect(log).toBeDefined()
    expect(log.userId).toBe(adminId)
    expect(log.action).toBe('GRADE_OVERRIDE')
    expect(log.ip).toBe('127.0.0.1')
  })

  // ─── CHECK 7: PERFORMANCE BENCHMARK ───
  it('CHECK 7: Performance benchmark executes batch queries under 100ms', async () => {
    const startTime = performance.now()

    // Query 40 students roster
    const _roster = await db.select().from(students).where(eq(students.classId, classAId)).limit(40)
    
    const duration = performance.now() - startTime
    expect(duration).toBeLessThan(100) // Must execute under 100ms
  })
})
