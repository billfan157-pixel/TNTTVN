import { describe, it, expect, beforeAll } from 'vitest'
import gradesRouter from '../routes/grades.js'
import settingsRouter from '../routes/settings.js'
import studentsRouter from '../routes/students.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, classes, catechistAssignments, grades, students, academicYears, branches } from '../db/schema.js'

describe('Phase 1.5 - Streamlined P0 Smoke Test Suite', () => {
  const parishId = 'thanh-gia'
  const adminUser = {
    userId: 'USR-ADMIN-SMOKE',
    username: 'admin_smoke',
    role: 'admin' as const,
    parishId,
  }
  const catechistUser = {
    userId: 'USR-CATECHIST-SMOKE',
    username: 'catechist_smoke',
    role: 'chunhiem' as const,
    parishId,
  }
  const parentUser = {
    userId: 'USR-PARENT-SMOKE',
    username: 'parent_smoke',
    role: 'phuhuynh' as const,
    parishId,
  }

  const academicYearId = 'AY-SMOKE'
  const classAId = 'CLS-SMOKE-A'
  const classBId = 'CLS-SMOKE-B'
  const studentAId = 'ST-SMOKE-A'
  const studentBId = 'ST-SMOKE-B'
  const gradeAId = 'GR-SMOKE-A'
  const gradeBId = 'GR-SMOKE-B'

  let adminToken: string
  let catechistToken: string
  let parentToken: string

  beforeAll(async () => {
    adminToken = generateTokens(adminUser).accessToken
    catechistToken = generateTokens(catechistUser).accessToken
    parentToken = generateTokens(parentUser).accessToken

    const now = new Date().toISOString()

    // 0. Seed test academic year
    await db.insert(academicYears).values({
      id: academicYearId,
      startDate: '2025-09-01',
      endDate: '2026-06-30',
      isLocked: 0,
      parishId,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing()

    // 0b. Seed branch (composite FK: classes.branch_id → branches.(parish_id, id))
    await db.insert(branches).values({
      id: 'AuNhi',
      name: 'Ấu Nhi',
      scarfColor: 'Xanh Lá',
      ageMin: 8,
      ageMax: 10,
      parishId,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing()

    // 1. Seed test users
    await db.insert(users).values([
      { id: adminUser.userId, username: adminUser.username, passwordHash: 'hash', fullName: 'Admin Smoke', role: 'admin', parishId, status: 'ACTIVE' },
      { id: catechistUser.userId, username: catechistUser.username, passwordHash: 'hash', fullName: 'Catechist Smoke', role: 'chunhiem', parishId, status: 'ACTIVE' },
      { id: parentUser.userId, username: parentUser.username, passwordHash: 'hash', fullName: 'Parent Smoke', role: 'phuhuynh', parishId, status: 'ACTIVE' },
    ]).onConflictDoNothing()

    // 2. Seed test classes
    await db.insert(classes).values([
      { id: classAId, code: 'C10A', name: 'Lớp 10A Smoke', branchId: 'AuNhi', academicYearId, parishId, createdAt: now, updatedAt: now },
      { id: classBId, code: 'C10B', name: 'Lớp 10B Smoke', branchId: 'AuNhi', academicYearId, parishId, createdAt: now, updatedAt: now },
    ]).onConflictDoNothing()

    // 3. Assign catechist ONLY to Class A
    await db.insert(catechistAssignments).values({
      id: 'ASGN-SMOKE-1',
      userId: catechistUser.userId,
      classId: classAId,
      roleInClass: 'chunhiem',
      parishId,
    }).onConflictDoNothing()

    // 4. Seed test students
    await db.insert(students).values([
      { id: studentAId, code: 'ST-001', holyName: 'Giuse', fullName: 'Học sinh A', classId: classAId, branch: 'AuNhi', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P A', parentPhone: '0900000001', address: 'Addr', parishId, status: 'Đang học', createdAt: now, updatedAt: now },
      { id: studentBId, code: 'ST-002', holyName: 'Maria', fullName: 'Học sinh B', classId: classBId, branch: 'AuNhi', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'P B', parentPhone: '0900000002', address: 'Addr', parishId, status: 'Đang học', createdAt: now, updatedAt: now },
    ]).onConflictDoNothing()

    // 5. Seed test grades
    await db.insert(grades).values([
      { id: gradeAId, studentId: studentAId, academicYear: '2025-2026', semester: 1, scoreOral: 8, version: 1, parishId, createdAt: now, updatedAt: now, updatedBy: adminUser.userId },
      { id: gradeBId, studentId: studentBId, academicYear: '2025-2026', semester: 1, scoreOral: 7, version: 1, parishId, createdAt: now, updatedAt: now, updatedBy: adminUser.userId },
    ]).onConflictDoNothing()
  })

  // ─── SECTION A: AUTHENTICATION & SESSION ───
  describe('A. AUTHENTICATION & SESSION SMOKE TEST', () => {
    it('AUTH-01: Admin / Catechist Login token generation', () => {
      expect(adminToken).toBeDefined()
      expect(catechistToken).toBeDefined()
      expect(parentToken).toBeDefined()
    })

    it('AUTH-02 & AUTH-03: Invalid Token Rejected on Auth Middleware', async () => {
      const res = await settingsRouter.request('/', {
        method: 'GET',
        headers: { Authorization: 'Bearer INVALID_JWT' },
      })
      expect(res.status).toBe(401)
    })
  })

  // ─── SECTION B: GRADE OVERRIDE & RESTORE ───
  describe('B. GRADE OVERRIDE & RESTORE SMOKE TEST', () => {
    it('GRD-01: Manual Override score on Grade record', async () => {
      const res = await gradesRouter.request(`/${gradeAId}/override`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          studentId: studentAId,
          scoreField: 'scoreFinal',
          manualValue: 9.5,
          reasonCode: 'Appeal',
          reasonNote: 'Chấm phúc khảo bài thi cuối kỳ',
        }),
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.success).toBe(true)
      expect(json.data.manualValue).toBe(9.5)
    })

    it('GRD-02: Restore Override reverts score to base', async () => {
      const res = await gradesRouter.request(`/${gradeAId}/override`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          scoreField: 'scoreFinal',
        }),
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.success).toBe(true)
    })

    it('GRD-03: Override History lists audit log entries', async () => {
      const res = await gradesRouter.request(`/${gradeAId}/override/history`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.success).toBe(true)
      expect(Array.isArray(json.data)).toBe(true)
    })
  })

  // ─── SECTION C: AUTHORIZATION & PRIVILEGE (CRITICAL GATE) ───
  describe('C. AUTHORIZATION & PRIVILEGE SMOKE TEST', () => {
    it('PRIV-01: Parent user is blocked (403 Forbidden) from viewing unauthorized student details', async () => {
      const res = await studentsRouter.request(`/${studentAId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${parentToken}` },
      })
      // Parent role is blocked by class check returning 403
      expect(res.status).toBe(403)
    })

    it('PRIV-02: Catechist CAN edit grade override for assigned Class 10A student', async () => {
      const res = await gradesRouter.request(`/${gradeAId}/override`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${catechistToken}`,
        },
        body: JSON.stringify({
          studentId: studentAId,
          scoreField: 'scoreMidterm',
          manualValue: 8.5,
          reasonCode: 'TeacherAdjustment',
        }),
      })

      if (res.status !== 200) {
        console.error('PRIV-02 error response:', (await res.json()) as any)
      }
      expect(res.status).toBe(200)
    })

    it('PRIV-03: Catechist is STRICTLY BLOCKED (403 Forbidden) when attempting override for unassigned Class 10B student', async () => {
      const res = await gradesRouter.request(`/${gradeBId}/override`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${catechistToken}`,
        },
        body: JSON.stringify({
          studentId: studentBId,
          scoreField: 'scoreMidterm',
          manualValue: 10.0,
          reasonCode: 'SpecialAssignment',
        }),
      })

      expect(res.status).toBe(403)
      const json = (await res.json()) as any
      expect(json.error.code).toBe('FORBIDDEN')
      expect(json.error.message).toContain('Bạn không có quyền ghi đè điểm')
    })
  })

  // ─── SECTION D: SYSTEM SETTINGS & REHYDRATION ───
  describe('D. SYSTEM SETTINGS & REHYDRATION SMOKE TEST', () => {
    it('SET-01: Admin updates grade weights via PUT /api/settings', async () => {
      const res = await settingsRouter.request('/', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          gradeWeights: {
            weightOral: 1,
            weight15m: 1,
            weight1Period: 2,
            weightMidterm: 2,
            weightFinal: 4, // Updated weightFinal
          },
        }),
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.success).toBe(true)
      expect(json.data.gradeWeights.weightFinal).toBe(4)
    })

    it('SET-02 & SET-03: GET /api/settings rehydrates updated grade weights for non-admin user', async () => {
      const res = await settingsRouter.request('/', {
        method: 'GET',
        headers: { Authorization: `Bearer ${catechistToken}` },
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.success).toBe(true)
      expect(json.data.gradeWeights.weightFinal).toBe(4)
    })
  })
})
