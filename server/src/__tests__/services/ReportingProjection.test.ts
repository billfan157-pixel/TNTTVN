import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { db } from '../../db/index.js'
import { students, classes, branches, academicYears, grades, attendance, promotionRecords, users } from '../../db/schema.js'
import { reportCardProjectionRepository } from '../../repositories/ReportCardProjectionRepository.js'
import { classSummaryProjectionRepository } from '../../repositories/ClassSummaryProjectionRepository.js'
import { getAcademicYearDateRange } from '../../services/academicYearService.js'
import { getParishAttendancePolicy, getParishGradeWeights } from '../../services/parishSettingsService.js'
import { reportingApplicationService } from '../../services/ReportingApplicationService.js'

async function reportingContext(parishId: string, academicYear: string) {
  return {
    executor: db,
    academicYearRange: await getAcademicYearDateRange(parishId, academicYear),
    gradeWeights: await getParishGradeWeights(parishId),
    attendancePolicy: await getParishAttendancePolicy(parishId),
  }
}

describe('Reporting CQRS Projection Repositories Micro-Step R2 Tests', () => {
  const testParish = 'parish-rpt-test'
  const studentId = 'st-rpt-01'
  const classId = 'cl-rpt-01'
  const branchId = 'br-rpt-01'
  const yearId = 'AY-2025-2026'
  const academicYear = '2025-2026'

  beforeAll(async () => {
    await db.insert(users).values({ id: 'usr-admin-rpt', username: 'adminrpt', fullName: 'Admin Rpt', passwordHash: 'hash', role: 'admin', parishId: testParish }).onConflictDoNothing()
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-RPT', name: 'Lớp Reporting', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()

    await db.insert(students).values({
      id: studentId,
      code: 'ST-RPT-01',
      holyName: 'Giacobe',
      fullName: 'Nguyen Van Report',
      gender: 'Nam',
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

    // Seed test grade
    await db.insert(grades).values({
      id: 'grd-rpt-01',
      studentId,
      academicYear,
      semester: 1,
      scoreOral: 9,
      scoreFinal: 9,
      parishId: testParish,
    })

    // Seed test attendance
    await db.insert(attendance).values({
      id: 'att-rpt-01',
      studentId,
      date: '2025-10-05',
      type: 'SundayMass',
      status: 'Present',
      parishId: testParish,
    })

    // Seed test promotion snapshot
    await db.insert(promotionRecords).values({
      id: 'prm-rpt-01',
      studentId,
      academicYear,
      targetClassId: classId,
      gpaSnapshot: 9.0,
      attendanceSnapshot: 100.0,
      autoDecision: 'PROMOTED',
      finalDecision: 'PROMOTED',
      isOverridden: 0,
      version: 1,
      status: 'ACTIVE',
      approvedBy: 'usr-admin-rpt',
      parishId: testParish,
    })
  })

  it('1. ReportCardProjectionRepository returns compiled report card (Pure CQRS SELECT)', async () => {
    const reportCard = await reportCardProjectionRepository.getStudentReportCard(
      studentId,
      academicYear,
      testParish,
      await reportingContext(testParish, academicYear),
    )

    expect(reportCard).not.toBeNull()
    expect(reportCard?.student.fullName).toBe('Nguyen Van Report')
    expect(reportCard?.student.className).toBe('Lớp Reporting')
    expect(reportCard?.grades.length).toBe(1)
    expect(reportCard?.grades[0].gpa).toBe(9.0)
    expect(reportCard?.attendanceSummary.overallAttendanceRate).toBe(100.0)
    expect(reportCard?.promotion?.status).toBe('PROMOTED')
  })

  it('2. ClassSummaryProjectionRepository returns class roster summary (Pure CQRS SELECT)', async () => {
    const classSummary = await classSummaryProjectionRepository.getClassSummary(
      classId,
      academicYear,
      testParish,
      await reportingContext(testParish, academicYear),
    )

    expect(classSummary).not.toBeNull()
    expect(classSummary?.className).toBe('Lớp Reporting')
    expect(classSummary?.totalStudents).toBe(1)
    expect(classSummary?.promotedCount).toBe(1)
    expect(classSummary?.averageGpa).toBe(9.0)
    expect(classSummary?.averageAttendanceRate).toBe(100.0)
  })

  it('D5: application service owns one transaction snapshot for authorization, policy and projection reads', async () => {
    const globalSelect = vi.spyOn(db, 'select')
    try {
      const reportCard = await reportingApplicationService.getStudentReportCard(
        { userId: 'usr-admin-rpt', role: 'admin', parishId: testParish },
        studentId,
        academicYear,
      )
      expect(reportCard?.student.id).toBe(studentId)
      expect(globalSelect).not.toHaveBeenCalled()
    } finally {
      globalSelect.mockRestore()
    }
  })
})
