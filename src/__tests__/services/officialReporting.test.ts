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
})
