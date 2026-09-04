import { describe, it, expect, vi } from 'vitest'
import {
  computeSessionStat,
  computeStudentAttendanceSummary,
  calculateClassAttendanceAnalytics,
  exportAttendanceSummaryReport,
} from '../../services/attendanceAnalyticsService'
import type { AttendanceRecord, Student } from '../../types'

describe('attendanceAnalyticsService Unit & Integration Tests', () => {
  const mockStudent: Student = {
    id: 'STU-001',
    code: 'TN001',
    holyName: 'Giuse',
    fullName: 'Nguyễn Văn An',
    gender: 'Nam',
    dateOfBirth: '2015-05-10',
    address: '123 Giáo Xứ',
    branch: 'AuNhi',
    classId: 'CLS-001',
    status: 'Đang học',
    parentName: 'Nguyễn Văn Ba',
    parentPhone: '0901234567',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  }

  const mockRecords: AttendanceRecord[] = [
    // Thánh Lễ: 3 có mặt, 1 vắng phép
    { id: 'ATT-1', studentId: 'STU-001', date: '2026-08-03', type: 'SundayMass', status: 'Present' },
    { id: 'ATT-2', studentId: 'STU-001', date: '2026-08-10', type: 'SundayMass', status: 'Present' },
    { id: 'ATT-3', studentId: 'STU-001', date: '2026-08-17', type: 'SundayMass', status: 'AbsentExcused', note: 'Đi khám bệnh' },
    { id: 'ATT-4', studentId: 'STU-001', date: '2026-08-24', type: 'SundayMass', status: 'Present' },

    // Giáo Lý: 2 có mặt, 1 vắng không phép
    { id: 'ATT-5', studentId: 'STU-001', date: '2026-08-03', type: 'CatechismClass', status: 'Present' },
    { id: 'ATT-6', studentId: 'STU-001', date: '2026-08-10', type: 'CatechismClass', status: 'AbsentUnexcused' },
    { id: 'ATT-7', studentId: 'STU-001', date: '2026-08-17', type: 'CatechismClass', status: 'Present' },

    // Chầu: 1 có mặt
    { id: 'ATT-8', studentId: 'STU-001', date: '2026-08-07', type: 'EucharisticAdoration', status: 'Present' },
  ]

  it('computeSessionStat tính chính xác số buổi và tỷ lệ có mặt theo trọng số', () => {
    const massRecords = mockRecords.filter((r) => r.type === 'SundayMass')
    // 3 Present, 1 AbsentExcused -> total = 4
    // Với excusedWeight = 1.0 -> effective = 4 -> rate = 100%
    const stat1 = computeSessionStat(massRecords, 1.0)
    expect(stat1.present).toBe(3)
    expect(stat1.excused).toBe(1)
    expect(stat1.unexcused).toBe(0)
    expect(stat1.total).toBe(4)
    expect(stat1.rate).toBe(100)

    // Với excusedWeight = 0.5 -> effective = 3.5 -> rate = 3.5 / 4 = 87.5%
    const stat2 = computeSessionStat(massRecords, 0.5)
    expect(stat2.rate).toBe(87.5)
  })

  it('computeStudentAttendanceSummary tổng hợp 3 loại hình Lễ, Giáo Lý, Chầu và phân loại xếp loại', () => {
    const summary = computeStudentAttendanceSummary(mockStudent, mockRecords, 1.0, 80)
    expect(summary.student.id).toBe('STU-001')
    expect(summary.mass.total).toBe(4)
    expect(summary.mass.present).toBe(3)
    expect(summary.catechism.total).toBe(3)
    expect(summary.catechism.unexcused).toBe(1)
    expect(summary.adoration.total).toBe(1)

    // Tổng số: 4 + 3 + 1 = 8 buổi. Có mặt: 3+2+1=6, Phép: 1, K.Phép: 1
    // Effective = 7 -> Rate = 7/8 = 87.5% -> Đạt Chuẩn
    expect(summary.overall.totalSessions).toBe(8)
    expect(summary.overall.presentCount).toBe(6)
    expect(summary.overall.excusedCount).toBe(1)
    expect(summary.overall.unexcusedCount).toBe(1)
    expect(summary.overall.rate).toBe(87.5)
    expect(summary.overall.status).toBe('good')
    expect(summary.overall.statusLabel).toBe('Đạt Chuẩn')
  })

  it('calculateClassAttendanceAnalytics tính KPIs, At-Risk List và Timeline xu hướng', () => {
    const mockStudent2: Student = {
      ...mockStudent,
      id: 'STU-002',
      code: 'TN002',
      fullName: 'Trần Thị B',
    }

    const mockRecords2: AttendanceRecord[] = [
      // Vắng không phép 3 buổi
      { id: 'ATT-10', studentId: 'STU-002', date: '2026-08-03', type: 'SundayMass', status: 'AbsentUnexcused' },
      { id: 'ATT-11', studentId: 'STU-002', date: '2026-08-10', type: 'SundayMass', status: 'AbsentUnexcused' },
      { id: 'ATT-12', studentId: 'STU-002', date: '2026-08-17', type: 'CatechismClass', status: 'AbsentUnexcused' },
    ]

    const allStudents = [mockStudent, mockStudent2]
    const allRecords = [...mockRecords, ...mockRecords2]

    const { kpis, summaries } = calculateClassAttendanceAnalytics(allStudents, allRecords, undefined, 1.0, 80)

    expect(kpis.totalStudents).toBe(2)
    expect(kpis.totalSessionsMarked).toBeGreaterThan(0)
    expect(summaries.length).toBe(2)

    // STU-002 phải lọt vào atRiskStudents do vắng không phép 3 buổi và tỷ lệ 0%
    expect(kpis.atRiskStudents.length).toBe(1)
    expect(kpis.atRiskStudents[0].student.id).toBe('STU-002')
    expect(kpis.atRiskStudents[0].reasons.length).toBeGreaterThan(0)

    // Timeline chứa các buổi điểm danh
    expect(kpis.trendTimeline.length).toBeGreaterThan(0)
  })

  it('exportAttendanceSummaryReport xuất CSV/XLSX và dọn tài nguyên trước khi test kết thúc', async () => {
    const summary = computeStudentAttendanceSummary(mockStudent, mockRecords, 1.0, 80)
    // Mock triggerDownload
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const removeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'remove')

    await expect(exportAttendanceSummaryReport([summary], 'AuNhi_1', 'HK1', 'csv')).resolves.toBeUndefined()
    await expect(exportAttendanceSummaryReport([summary], 'AuNhi_1', 'HK1', 'xlsx')).resolves.toBeUndefined()

    expect(removeSpy).toHaveBeenCalledTimes(2)
    expect(revokeObjectUrlSpy).toHaveBeenNthCalledWith(1, 'blob:mock')
    expect(revokeObjectUrlSpy).toHaveBeenNthCalledWith(2, 'blob:mock')

    createObjectUrlSpy.mockRestore()
    revokeObjectUrlSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
