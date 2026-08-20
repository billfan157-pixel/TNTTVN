import { describe, it, expect, beforeAll } from 'vitest'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, importBatches, importBatchStudents } from '../db/schema.js'
import reportingRouter from '../routes/reporting.js'
import promotionRouter from '../routes/promotion.js'
import importRouter from '../routes/import.js'
import notificationsRouter from '../routes/notifications.js'
import gradesRouter from '../routes/grades.js'

describe('Authorization Boundaries & Data Isolation Audit Tests', () => {
  const parishA = 'parish-auth-test-a'
  const parishB = 'parish-auth-test-b'
  const gradeImportHash = 'domain2-grade-import-assigned-class'

  let catechistA1Token: string
  let adminAToken: string

  beforeAll(async () => {
    catechistA1Token = generateTokens({ userId: 'cat-a1', username: 'cat_a1', role: 'chunhiem', parishId: parishA }).accessToken
    adminAToken = generateTokens({ userId: 'admin-a', username: 'admin_a', role: 'admin', parishId: parishA }).accessToken

    await db.insert(users).values([
      { id: 'cat-a1', username: 'cat_a1', fullName: 'Catechist A1', passwordHash: 'hash', role: 'chunhiem', parishId: parishA },
      { id: 'admin-a', username: 'admin_a', fullName: 'Admin A', passwordHash: 'hash', role: 'admin', parishId: parishA },
      { id: 'cat-b1', username: 'cat_b1', fullName: 'Catechist B1', passwordHash: 'hash', role: 'chunhiem', parishId: parishB },
    ]).onConflictDoNothing()

    await db.insert(branches).values([
      { id: 'br-auth-a', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: parishA },
      { id: 'br-auth-b', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: parishB },
    ]).onConflictDoNothing()

    await db.insert(academicYears).values([
      { id: 'AY-2025-2026', startDate: '2025-09-01', endDate: '2026-05-31', parishId: parishA },
      { id: 'AY-2025-2026-B', startDate: '2025-09-01', endDate: '2026-05-31', parishId: parishB },
    ]).onConflictDoNothing()

    await db.insert(classes).values([
      { id: 'cl-assigned-a', code: 'CLA1', name: 'Lớp Phụ Trách A1', branchId: 'br-auth-a', academicYearId: 'AY-2025-2026', parishId: parishA },
      { id: 'cl-unassigned-a', code: 'CLA2', name: 'Lớp Khác A2', branchId: 'br-auth-a', academicYearId: 'AY-2025-2026', parishId: parishA },
      { id: 'cl-b1', code: 'CLB1', name: 'Lớp Parish B1', branchId: 'br-auth-b', academicYearId: 'AY-2025-2026-B', parishId: parishB },
    ]).onConflictDoNothing()

    await db.insert(catechistAssignments).values({
      id: 'asg-cat-a1',
      classId: 'cl-assigned-a',
      userId: 'cat-a1',
      roleInClass: 'chunhiem',
      parishId: parishA,
    }).onConflictDoNothing()

    await db.insert(students).values([
      { id: 'st-assigned-a', code: 'STA1', holyName: 'Giuse', fullName: 'Nguyen A1', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '0901', address: 'X', branch: 'AuNhi', classId: 'cl-assigned-a', parishId: parishA },
      { id: 'st-unassigned-a', code: 'STA2', holyName: 'Maria', fullName: 'Nguyen A2', gender: 'Nữ', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '0902', address: 'X', branch: 'AuNhi', classId: 'cl-unassigned-a', parishId: parishA },
    ]).onConflictDoNothing()

    await db.insert(importBatches).values({
      id: 'batch-parish-b',
      userId: 'cat-b1',
      fileName: 'import_b.xlsx',
      parishId: parishB,
    }).onConflictDoNothing()

    await db.insert(importBatchStudents).values({
      id: 'ibs-b1',
      batchId: 'batch-parish-b',
      action: 'created',
      rowIndex: 1,
      parishId: parishB,
    }).onConflictDoNothing()
  })

  describe('1. Class Summary Report Authorization Boundary', () => {
    it('Catechist CAN access summary for assigned class', async () => {
      const res = await reportingRouter.request('/class-summary/cl-assigned-a', {
        method: 'GET',
        headers: { Authorization: `Bearer ${catechistA1Token}` },
      })
      expect(res.status).toBe(200)
    })

    it('Catechist is FORBIDDEN (403) from accessing summary for unassigned class', async () => {
      const res = await reportingRouter.request('/class-summary/cl-unassigned-a', {
        method: 'GET',
        headers: { Authorization: `Bearer ${catechistA1Token}` },
      })
      expect(res.status).toBe(403)
      const json = (await res.json()) as any
      expect(json.error.code).toBe('FORBIDDEN')
    })
  })

  describe('2. Promotion Authorization Boundary', () => {
    it('Catechist CAN evaluate student in assigned class', async () => {
      const res = await promotionRouter.request('/evaluate/st-assigned-a?academicYear=2025-2026', {
        method: 'GET',
        headers: { Authorization: `Bearer ${catechistA1Token}` },
      })
      expect(res.status).toBe(200)
    })

    it('Catechist is FORBIDDEN (403) from evaluating student in unassigned class', async () => {
      const res = await promotionRouter.request('/evaluate/st-unassigned-a?academicYear=2025-2026', {
        method: 'GET',
        headers: { Authorization: `Bearer ${catechistA1Token}` },
      })
      expect(res.status).toBe(403)
    })

    it('Catechist is FORBIDDEN (403) from approving promotion for student in unassigned class', async () => {
      const res = await promotionRouter.request('/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catechistA1Token}` },
        body: JSON.stringify({
          studentId: 'st-unassigned-a',
          academicYear: '2025-2026',
          targetClassId: 'cl-unassigned-a',
          gpa: 8.0,
          attendanceRate: 90,
        }),
      })
      expect(res.status).toBe(403)
    })
  })

  describe('3. Import Batch Detail Multi-Tenancy Isolation', () => {
    it('User in Parish A CANNOT view import batch details of Parish B', async () => {
      const res = await importRouter.request('/batch/batch-parish-b', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminAToken}` },
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      // Rows must be empty because batch-parish-b belongs to Parish B, not Parish A
      expect(json.data.rows).toHaveLength(0)
    })
  })

  describe('4. Smart Notifications Class Authorization Boundary', () => {
    it('Catechist is FORBIDDEN (403) from triggering class reminder for unassigned class', async () => {
      const res = await notificationsRouter.request('/smart/reminder/class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catechistA1Token}` },
        body: JSON.stringify({ className: 'Lớp Khác A2', date: '2025-10-05' }),
      })
      expect(res.status).toBe(403)
    })

    it('Catechist CAN trigger class reminder for assigned class', async () => {
      const res = await notificationsRouter.request('/smart/reminder/class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catechistA1Token}` },
        body: JSON.stringify({ className: 'Lớp Phụ Trách A1', date: '2025-10-05' }),
      })
      expect(res.status).toBe(200)
    })
  })

  describe('5. Grade Import Class Authorization Boundary', () => {
    it('Catechist CAN check and register an import for the assigned class', async () => {
      const checkRes = await gradesRouter.request('/check-import-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catechistA1Token}` },
        body: JSON.stringify({
          hash: gradeImportHash,
          classId: 'cl-assigned-a',
          semester: 1,
          academicYear: '2025-2026',
        }),
      })
      expect(checkRes.status).toBe(200)
      const checkJson = (await checkRes.json()) as any
      expect(checkJson.data.isDuplicate).toBe(false)

      const registerRes = await gradesRouter.request('/register-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catechistA1Token}` },
        body: JSON.stringify({
          hash: gradeImportHash,
          classId: 'cl-assigned-a',
          semester: 1,
          academicYear: '2025-2026',
          totalRows: 2,
        }),
      })
      expect(registerRes.status).toBe(200)
    })

    it('Catechist is FORBIDDEN from checking or registering imports for an unassigned class', async () => {
      const payload = {
        hash: 'domain2-grade-import-unassigned-class',
        classId: 'cl-unassigned-a',
        semester: 1,
        academicYear: '2025-2026',
      }

      const checkRes = await gradesRouter.request('/check-import-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catechistA1Token}` },
        body: JSON.stringify(payload),
      })
      expect(checkRes.status).toBe(403)

      const registerRes = await gradesRouter.request('/register-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${catechistA1Token}` },
        body: JSON.stringify({ ...payload, totalRows: 2 }),
      })
      expect(registerRes.status).toBe(403)
    })
  })
})
