import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import promotionRouter from '../routes/promotion.js'
import attendanceRouter from '../routes/attendance.js'
import reportingRouter from '../routes/reporting.js'

import { drizzleSemesterLockRepository } from '../repositories/DrizzleSemesterLockRepository.js'

describe('Production Readiness: Security & RBAC Matrix Audit Tests', () => {
  const testParish = 'parish-rbac-test'
  let adminToken: string
  let assistantToken: string
  let parentToken: string

  beforeAll(async () => {
    adminToken = generateTokens({ userId: 'usr-admin-rbac', username: 'adminrbac', role: 'admin', parishId: testParish }).accessToken
    assistantToken = generateTokens({ userId: 'usr-asst-rbac', username: 'assistantrbac', role: 'phuta', parishId: testParish }).accessToken
    parentToken = generateTokens({ userId: 'usr-parent-rbac', username: 'parentrbac', role: 'phuhuynh', parishId: testParish }).accessToken

    await db.insert(users).values([
      { id: 'usr-admin-rbac', username: 'adminrbac', fullName: 'Admin RBAC', passwordHash: 'hash', role: 'admin', parishId: testParish },
      { id: 'usr-cat-rbac', username: 'catechistrbac', fullName: 'Cat RBAC', passwordHash: 'hash', role: 'chunhiem', parishId: testParish },
      { id: 'usr-asst-rbac', username: 'assistantrbac', fullName: 'Asst RBAC', passwordHash: 'hash', role: 'phuta', parishId: testParish },
      { id: 'usr-parent-rbac', username: 'parentrbac', fullName: 'Parent RBAC', phone: '000', passwordHash: 'hash', role: 'phuhuynh', parishId: testParish },
    ]).onConflictDoNothing()

    await db.update(users).set({ phone: '000' }).where(eq(users.id, 'usr-parent-rbac'))
    await db.update(students).set({ parentPhone: '000' }).where(eq(students.id, 'st-rbac-01'))

    await db.insert(branches).values({ id: 'br-rbac-01', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: 'AY-2025-2026', startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: 'cl-rbac-01', code: 'CL-RBAC', name: 'Lớp RBAC', branchId: 'br-rbac-01', academicYearId: 'AY-2025-2026', parishId: testParish }).onConflictDoNothing()

    await db.insert(students).values({
      id: 'st-rbac-01',
      code: 'ST-RBAC-01',
      holyName: 'Maria',
      fullName: 'Nguyen Thi RBAC',
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '000',
      address: 'X',
      branch: 'AuNhi',
      classId: 'cl-rbac-01',
      parishId: testParish,
    }).onConflictDoNothing()

    await db.insert(catechistAssignments).values({
      id: 'ct-rbac-01',
      classId: 'cl-rbac-01',
      userId: 'usr-asst-rbac',
      roleInClass: 'phuta',
      parishId: testParish,
    }).onConflictDoNothing()
  })

  beforeEach(async () => {
    await drizzleSemesterLockRepository.setLockState('2025-2026', 2, true, 'usr-admin-rbac', testParish)
  })

  describe('1. Promotion RBAC Rules', () => {
    it('Admin can approve promotion', async () => {
      const res = await promotionRouter.request('/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ studentId: 'st-rbac-01', academicYear: '2025-2026', targetClassId: 'cl-rbac-01', gpa: 8.0, attendanceRate: 90 }),
      })
      // Should get past auth layer (not 401 or 403 authorization error)
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('Parent role is FORBIDDEN from approving promotion (403)', async () => {
      const res = await promotionRouter.request('/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
        body: JSON.stringify({ studentId: 'st-rbac-01', academicYear: '2025-2026', targetClassId: 'cl-rbac-01', gpa: 8.0, attendanceRate: 90 }),
      })
      expect(res.status).toBe(403)
    })
  })

  describe('2. Attendance RBAC Rules', () => {
    it('Catechist & Assistant can mark attendance', async () => {
      const res = await attendanceRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${assistantToken}` },
        body: JSON.stringify({ studentId: 'st-rbac-01', date: '2025-10-05', type: 'SundayMass', status: 'Present' }),
      })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('Parent role is FORBIDDEN from marking attendance (403)', async () => {
      const res = await attendanceRouter.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
        body: JSON.stringify({ studentId: 'st-01', date: '2025-10-05', type: 'SundayMass', status: 'Present' }),
      })
      expect(res.status).toBe(403)
    })
  })

  describe('3. Reporting RBAC Rules', () => {
    it('Parent role CAN access student report card', async () => {
      const res = await reportingRouter.request('/report-card/st-rbac-01', {
        method: 'GET',
        headers: { Authorization: `Bearer ${parentToken}` },
      })
      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })

    it('Parent role is FORBIDDEN from accessing class-wide summary (403)', async () => {
      const res = await reportingRouter.request('/class-summary/cl-01', {
        method: 'GET',
        headers: { Authorization: `Bearer ${parentToken}` },
      })
      expect(res.status).toBe(403)
    })
  })
})
