import { describe, it, expect } from 'vitest'
import { ReportViewModelFactory } from '../../utils/reportViewModelFactory'
import type { Student, GradeRecord, AttendanceRecord } from '../../types'

describe('ReportViewModelFactory Attendance Breakdown Tests', () => {
  const mockStudent: Student = {
    id: 'STU-001',
    code: 'TN001',
    holyName: 'Giuse',
    fullName: 'Nguyễn Văn An',
    gender: 'Nam',
    dateOfBirth: '2015-05-15',
    classId: 'CLS-01',
    branch: 'AuNhi',
    parentName: 'Nguyễn Văn Bình',
    parentPhone: '0901234567',
    address: 'Xứ Đoàn Gia Tôn',
    status: 'Đang học',
  }

  const mockGrades: GradeRecord[] = [
    {
      id: 'GR-1',
      studentId: 'STU-001',
      academicYear: '2025-2026',
      semester: 1,
      scoreOral: 8,
      score15m: 9,
      score1Period: 8.5,
      scoreMidterm: 8,
      scoreFinal: 9,
      scoreDaoDuc: 10,
    } as unknown as GradeRecord,
  ]

  const mockAttendance: AttendanceRecord[] = [
    // 3 buổi Thánh Lễ (2 Có mặt, 1 Vắng)
    { id: 'ATT-1', studentId: 'STU-001', date: '2025-09-07', type: 'SundayMass', status: 'Present' },
    { id: 'ATT-2', studentId: 'STU-001', date: '2025-09-14', type: 'SundayMass', status: 'Present' },
    { id: 'ATT-3', studentId: 'STU-001', date: '2025-09-21', type: 'SundayMass', status: 'AbsentUnexcused' },

    // 2 buổi Giáo Lý (2 Có mặt)
    { id: 'ATT-4', studentId: 'STU-001', date: '2025-09-07', type: 'CatechismClass', status: 'Present' },
    { id: 'ATT-5', studentId: 'STU-001', date: '2025-09-14', type: 'CatechismClass', status: 'Present' },

    // 1 buổi Chầu (1 Có mặt)
    { id: 'ATT-6', studentId: 'STU-001', date: '2025-09-05', type: 'EucharisticAdoration', status: 'Present' },
  ]

  it('tính toán chính xác số buổi đi, vắng và tổng số theo 3 loại hình điểm danh', () => {
    const vm = ReportViewModelFactory.createStudentViewModel(mockStudent, mockGrades, mockAttendance, {
      academicYear: '2025-2026',
      parishName: 'Giáo Xứ Gia Tôn',
      dioceseName: 'Giáo Phận Xuân Lộc',
    })

    const att = vm.summary.attendanceDetails
    expect(att).toBeDefined()
    expect(att?.totalCount).toBe(6)
    expect(att?.presentCount).toBe(5)
    expect(att?.absentCount).toBe(1)

    // Thánh Lễ: 2 đi, 1 vắng, tổng 3
    expect(att?.sundayMass.present).toBe(2)
    expect(att?.sundayMass.absent).toBe(1)
    expect(att?.sundayMass.total).toBe(3)

    // Giáo Lý: 2 đi, 0 vắng, tổng 2
    expect(att?.catechism.present).toBe(2)
    expect(att?.catechism.absent).toBe(0)
    expect(att?.catechism.total).toBe(2)

    // Chầu: 1 đi, 0 vắng, tổng 1
    expect(att?.adoration.present).toBe(1)
    expect(att?.adoration.absent).toBe(0)
    expect(att?.adoration.total).toBe(1)
  })
})
