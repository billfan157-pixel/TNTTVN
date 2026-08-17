import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { promotionRecords, semesterLocks, users, students, classes, branches, academicYears, auditLogs, grades, attendance, systemSettings } from '../../db/schema.js'
import promotionRouter from '../../routes/promotion.js'
import { drizzleSemesterLockRepository } from '../../repositories/DrizzleSemesterLockRepository.js'
import { generateTokens } from '../../middleware/auth.js'
import { eq } from 'drizzle-orm'

describe('Promotion Routes P2 Integration Tests', () => {
  const testParish = 'parish-prm-routes'
  const adminUserId = 'usr-admin-prm-rt'
  const studentId = 'st-prm-rt-01'
  const classId = 'cl-prm-rt-01'
  const branchId = 'br-prm-rt-01'
  const yearId = 'AY-2025-2026'
  const academicYear = '2025-2026'
  let adminToken: string

  beforeAll(async () => {
    adminToken = generateTokens({ userId: adminUserId, username: 'adminprmrt', role: 'admin', parishId: testParish }).accessToken

    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-PRM-RT', name: 'Lớp Prm Rt', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()
    await db.insert(users).values({ id: adminUserId, username: 'adminprmrt', fullName: 'Admin Prm Rt', passwordHash: 'hash', role: 'admin', parishId: testParish }).onConflictDoNothing()
    await db.insert(students).values({
      id: studentId,
      code: 'ST-PRM-RT-01',
      holyName: 'Maria',
      fullName: 'Nguyen Thi Route',
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '000',
      address: 'X',
      branch: 'AuNhi',
      classId,
      parishId: testParish,
    }).onConflictDoNothing()
  })

  beforeEach(async () => {
    await db.delete(promotionRecords)
    await db.delete(semesterLocks)
    await db.delete(auditLogs)
    // A-NEW-36: PK giờ là composite (key, parish_id) — xóa theo key vẫn dọn được
    // mọi row (any parish) nên F3 settings test và smokeTestPhase15 SET-01 không collide.
    await db.delete(systemSettings).where(eq(systemSettings.key, 'parish_system_settings'))
    await db.delete(grades).where(eq(grades.studentId, studentId))
    await db.delete(attendance).where(eq(attendance.studentId, studentId))

    // Seed grade & attendance rows for computation
    await db.insert(grades).values({
      id: 'grd-rt-01',
      studentId,
      academicYear,
      semester: 1,
      scoreOral: 8,
      scoreFinal: 9,
      parishId: testParish,
    })
    await db.insert(attendance).values({
      id: 'att-rt-01',
      studentId,
      date: '2025-10-05',
      type: 'CatechismClass',
      status: 'Present',
      parishId: testParish,
    })
  })

  it('P2.1: GET /api/promotion/evaluate/:studentId returns evaluated decision (Read-Only)', async () => {
    // Lock HK2
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    const res = await promotionRouter.request(`/evaluate/${studentId}?academicYear=${academicYear}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.data.status).toBe('PROMOTED')
    expect(json.data.gpa).toBe(8.8)
    expect(json.data.attendanceRate).toBe(100)
  })

  it('P2.2 & P2.3: POST /api/promotion/approve approves snapshot & creates Audit Log', async () => {
    // Lock HK2
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    const res = await promotionRouter.request('/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId,
        academicYear,
        targetClassId: classId,
        gpa: 8.8, // máy chủ tự tính: (8*1 + 9*3)/4 = 8.75 → 8.8
        attendanceRate: 100,
      }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.data.finalDecision).toBe('PROMOTED')
    expect(json.data.status).toBe('ACTIVE')

    // P2.3 Check Audit Log entry
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.parishId, testParish))
    expect(logs.length).toBeGreaterThan(0)
    expect(logs[0].action).toBe('APPROVE_PROMOTION')
  })

  it('F2-audit: POST /approve with client GPA different from server-computed GPA is rejected (409)', async () => {
    // Lock HK2
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    // Seed: (8*1 + 9*3)/4 = 8.75 → 8.8, nhưng payload gửi 9.9 → DATA_MISMATCH
    const res = await promotionRouter.request('/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId,
        academicYear,
        targetClassId: classId,
        gpa: 9.9,
        attendanceRate: 100,
      }),
    })

    expect(res.status).toBe(409)
    const json = (await res.json()) as any
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('DATA_MISMATCH')
    expect(json.error.message).toContain('không khớp dữ liệu máy chủ')
  })

  it('ADR-017 F2: attendance outside the academic year is excluded from rate', async () => {
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    // Attendance from a previous year (outside 2025-08-01..2026-07-31 fallback range)
    await db.insert(attendance).values({
      id: 'att-prm-old-01',
      studentId,
      date: '2024-06-01',
      type: 'CatechismClass',
      status: 'AbsentUnexcused',
      parishId: testParish,
    })

    const res = await promotionRouter.request(`/evaluate/${studentId}?academicYear=${academicYear}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    // Only the in-year Present row (2025-10-05) counts → 100%, not 50%
    expect(json.data.attendanceRate).toBe(100)
  })

  it('ADR-017 F3: GPA uses parish grade weights from system settings', async () => {
    await drizzleSemesterLockRepository.setLockState(academicYear, 2, true, adminUserId, testParish)

    // Custom weights: oral 0.5 / final 0.15 → (8*0.5 + 9*0.15) / (0.5+0.15) = 8.23 → 8.2
    // Upsert + cleanup by key: A-NEW-36 — system_settings PK giờ là composite
    // (key, parish_id) nên target phải là cả 2 column (target key đơn → ON CONFLICT
    // không khớp PK → SQLITE_CONSTRAINT). Rows vẫn không bao giờ persist giữa runs
    // (delete theo key + parish bên dưới).
    await db.insert(systemSettings).values({
      key: 'parish_system_settings',
      value: JSON.stringify({
        gradeWeights: { weightOral: 0.5, weight15m: 0.1, weight1Period: 0.15, weightMidterm: 0.1, weightFinal: 0.15 },
      }),
      parishId: testParish,
    }).onConflictDoUpdate({
      target: [systemSettings.key, systemSettings.parishId],
      set: {
        value: JSON.stringify({
          gradeWeights: { weightOral: 0.5, weight15m: 0.1, weight1Period: 0.15, weightMidterm: 0.1, weightFinal: 0.15 },
        }),
        parishId: testParish,
      },
    })

    try {
      const res = await promotionRouter.request(`/evaluate/${studentId}?academicYear=${academicYear}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.data.gpa).toBe(8.2) // default weights would give 8.8
    } finally {
      await db.delete(systemSettings).where(eq(systemSettings.key, 'parish_system_settings'))
    }
  })})
