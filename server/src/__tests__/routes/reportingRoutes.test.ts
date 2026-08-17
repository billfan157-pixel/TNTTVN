import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { students, classes, branches, academicYears, grades, attendance, promotionRecords, users } from '../../db/schema.js'
import reportingRouter from '../../routes/reporting.js'
import { generateTokens } from '../../middleware/auth.js'

describe('Reporting REST Routes Integration Tests', () => {
  const testParish = 'parish-rpt-routes'
  const adminUserId = 'usr-admin-rpt-rt'
  const studentId = 'st-rpt-rt-01'
  const classId = 'cl-rpt-rt-01'
  const branchId = 'br-rpt-rt-01'
  const yearId = 'AY-2025-2026'
  const academicYear = '2025-2026'
  let adminToken: string

  beforeAll(async () => {
    adminToken = generateTokens({ userId: adminUserId, username: 'adminrptrts', role: 'admin', parishId: testParish }).accessToken

    await db.insert(users).values({ id: adminUserId, username: 'adminrptrts', fullName: 'Admin Rpt Rts', passwordHash: 'hash', role: 'admin', parishId: testParish }).onConflictDoNothing()
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-RPT-RT', name: 'Lớp Rpt Rt', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()

    await db.insert(students).values({
      id: studentId,
      code: 'ST-RPT-RT-01',
      holyName: 'Anna',
      fullName: 'Nguyen Thi Report Route',
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
    await db.delete(grades)
    await db.delete(attendance)
    await db.delete(promotionRecords)

    await db.insert(grades).values({
      id: 'grd-rpt-rt-01',
      studentId,
      academicYear,
      semester: 1,
      scoreOral: 10,
      scoreFinal: 10,
      parishId: testParish,
    })
  })

  it('1. GET /api/reports/report-card/:studentId returns student report card projection JSON', async () => {
    const res = await reportingRouter.request(`/report-card/${studentId}?academicYear=${academicYear}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.data.student.fullName).toBe('Nguyen Thi Report Route')
    expect(json.data.grades[0].gpa).toBe(10.0)
  })

  it('2. GET /api/reports/class-summary/:classId returns class summary roster projection JSON', async () => {
    const res = await reportingRouter.request(`/class-summary/${classId}?academicYear=${academicYear}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.data.className).toBe('Lớp Rpt Rt')
    expect(json.data.totalStudents).toBe(1)
    expect(json.data.averageGpa).toBe(10.0)
  })
})
