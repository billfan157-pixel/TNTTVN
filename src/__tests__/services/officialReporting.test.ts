import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getReportClassesMock, getClassSummaryMock, getStudentReportCardMock } = vi.hoisted(() => ({
  getReportClassesMock: vi.fn(),
  getClassSummaryMock: vi.fn(),
  getStudentReportCardMock: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    getReportClasses: (...args: unknown[]) => getReportClassesMock(...args),
    getClassSummary: (...args: unknown[]) => getClassSummaryMock(...args),
    getStudentReportCard: (...args: unknown[]) => getStudentReportCardMock(...args),
  },
}))

import { fetchOfficialAcademicYearReports, fetchOfficialClassReport } from '../../services/officialReporting'

const report = {
  student: { id: 'student-frozen', code: 'TN-1', fullName: 'Frozen Student', className: 'Old Class' },
  academicYear: '2025-2026',
  grades: [{ semester: 1, gpa: 8, classification: 'Giỏi' }],
  yearSummary: { gpa: 8, classification: 'Giỏi' },
  attendanceSummary: { massPresentCount: 1, massTotalCount: 1, catechismPresentCount: 1, catechismTotalCount: 1, overallAttendanceRate: 100 },
  promotion: null,
}

describe('officialReporting server-authoritative gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getClassSummaryMock.mockResolvedValue({
      classId: 'old-class', className: 'Old Class', branchId: 'AuNhi', academicYear: '2025-2026', totalStudents: 1,
      promotedCount: 1, retainedCount: 0, transferredCount: 0, averageGpa: 8, averageAttendanceRate: 100,
      students: [{ studentId: 'student-frozen', code: 'TN-1', fullName: 'Frozen Student', gpa: 8, attendanceRate: 100 }],
    })
    getStudentReportCardMock.mockResolvedValue(report)
  })

  it('derives the roster from class-summary and then reads each official report card', async () => {
    const result = await fetchOfficialClassReport('old-class', '2025 - 2026')

    expect(getClassSummaryMock).toHaveBeenCalledWith('old-class', '2025-2026')
    expect(getStudentReportCardMock).toHaveBeenCalledWith('student-frozen', '2025-2026')
    expect(result.reportCards).toEqual([report])
  })

  it('does not replace missing frozen evidence with client state', async () => {
    getStudentReportCardMock.mockRejectedValue(Object.assign(new Error('Historical evidence required'), { status: 409 }))

    await expect(fetchOfficialClassReport('old-class', '2025-2026')).rejects.toMatchObject({ status: 409 })
  })

  it('uses the server-authorized historical class index instead of mutable client class metadata', async () => {
    getReportClassesMock.mockResolvedValue([
      { id: 'old-class', name: 'Old Class', branchId: 'AuNhi', academicYear: '2025-2026' },
    ])

    const result = await fetchOfficialAcademicYearReports('2025-2026')

    expect(result).toHaveLength(1)
    expect(getReportClassesMock).toHaveBeenCalledWith('2025-2026')
    expect(getClassSummaryMock).toHaveBeenCalledTimes(1)
    expect(getClassSummaryMock).toHaveBeenCalledWith('old-class', '2025-2026')
  })

  it('synthesizes reportCards directly without N+1 HTTP calls when summary includes embedded grades', async () => {
    getClassSummaryMock.mockResolvedValue({
      classId: 'live-class',
      className: 'Live Class',
      branchId: 'AuNhi',
      academicYear: '2026-2027',
      totalStudents: 1,
      promotedCount: 1,
      retainedCount: 0,
      transferredCount: 0,
      averageGpa: 8.5,
      averageAttendanceRate: 98,
      students: [{
        studentId: 'student-live',
        code: 'TN-2',
        holyName: 'Maria',
        fullName: 'Live Student',
        gender: 'Nữ',
        dateOfBirth: '2015-05-10',
        gpa: 8.5,
        attendanceRate: 98,
        classification: 'Giỏi',
        promotionStatus: 'PROMOTED',
        grades: [{
          semester: 1,
          scoreOral: 8,
          score15m: 9,
          score1Period: 8.5,
          scoreMidterm: null,
          scoreFinal: 9,
          scoreDaoDuc: 10,
          gpa: 8.5,
          classification: 'Giỏi',
        }],
      }],
    })

    const result = await fetchOfficialClassReport('live-class', '2026-2027')

    expect(getStudentReportCardMock).not.toHaveBeenCalled()
    expect(result.reportCards).toHaveLength(1)
    expect(result.reportCards[0].student.id).toBe('student-live')
    expect(result.reportCards[0].yearSummary.classification).toBe('Giỏi')
    expect(result.reportCards[0].yearSummary.gpa).toBe(8.5)
    expect(result.reportCards[0].grades[0].scoreFinal).toBe(9)
    expect(result.reportCards[0].promotion?.status).toBe('PROMOTED')
  })
})
