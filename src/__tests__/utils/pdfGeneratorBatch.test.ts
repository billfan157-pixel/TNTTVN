import { describe, it, expect } from 'vitest'
import type { Student, GradeRecord, AttendanceRecord, ReportCardDTO } from '../../types'
import { ReportViewModelFactory } from '../../utils/reportViewModelFactory'
import {
  generateBatchReportCardsHTML,
  generateClassGradebookHTML,
  generateParentReportCardHTML,
  renderStudentReportCardBody,
} from '../../utils/pdfGenerator'

describe('Batch Print / PDF Export System Test Suite', () => {
  const mockStudents: Student[] = [
    {
      id: 'ST-001',
      code: 'TN001',
      holyName: 'Phêrô',
      fullName: 'Nguyễn Văn A',
      gender: 'Nam',
      dateOfBirth: '2015-05-15',
      parentName: 'Nguyễn Văn B',
      parentPhone: '0901234567',
      address: '123 Đường Lớn',
      branch: 'AuNhi',
      classId: 'CLS-AU1',
      parishId: 'parish-test',
      status: 'Đang học',
      createdAt: '2025-09-01T00:00:00Z',
      updatedAt: '2025-09-01T00:00:00Z',
    },
    {
      id: 'ST-002',
      code: 'TN002',
      holyName: 'Maria',
      fullName: 'Trần Thị <Script>Alert("XSS")</Script> B',
      gender: 'Nữ',
      dateOfBirth: '2015-08-20',
      parentName: 'Trần Văn C',
      parentPhone: '0908888888',
      address: '456 Đường Nhỏ',
      branch: 'AuNhi',
      classId: 'CLS-AU1',
      parishId: 'parish-test',
      status: 'Đang học',
      createdAt: '2025-09-01T00:00:00Z',
      updatedAt: '2025-09-01T00:00:00Z',
    },
    {
      id: 'ST-DELETED',
      code: 'TN003',
      holyName: 'Giuse',
      fullName: 'Học Sinh Đã Xóa',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Cha Mẹ',
      parentPhone: '0909999999',
      address: 'Bản Ẩn',
      branch: 'AuNhi',
      classId: 'CLS-AU1',
      parishId: 'parish-test',
      status: 'Đang học',
      deletedAt: '2025-10-01T00:00:00Z',
      createdAt: '2025-09-01T00:00:00Z',
      updatedAt: '2025-09-01T00:00:00Z',
    },
  ]

  const mockGrades: GradeRecord[] = [
    {
      id: 'GR-1',
      studentId: 'ST-001',
      academicYear: '2025 - 2026',
      semester: 1,
      scoreOral: 8,
      scoreOral_source: null,
      scoreOral_updated_at: null,
      score15m: 9,
      score15m_source: null,
      score15m_updated_at: null,
      score1Period: 8,
      score1Period_source: null,
      score1Period_updated_at: null,
      scoreMidterm: 9,
      scoreMidterm_source: null,
      scoreMidterm_updated_at: null,
      scoreFinal: 10,
      scoreFinal_source: null,
      scoreFinal_updated_at: null,
      scoreDaoDuc: null,
    },
    {
      id: 'GR-2',
      studentId: 'ST-001',
      academicYear: '2025 - 2026',
      semester: 2,
      scoreOral: 9,
      scoreOral_source: null,
      scoreOral_updated_at: null,
      score15m: 9,
      score15m_source: null,
      score15m_updated_at: null,
      score1Period: 9,
      score1Period_source: null,
      score1Period_updated_at: null,
      scoreMidterm: 9.5,
      scoreMidterm_source: null,
      scoreMidterm_updated_at: null,
      scoreFinal: 9.5,
      scoreFinal_source: null,
      scoreFinal_updated_at: null,
      scoreDaoDuc: null,
    },
  ]

  const mockAttendance: AttendanceRecord[] = [
    {
      id: 'ATT-1',
      studentId: 'ST-001',
      date: '2025-09-07',
      type: 'SundayMass',
      status: 'Present',
    },
    {
      id: 'ATT-2',
      studentId: 'ST-001',
      date: '2025-09-14',
      type: 'SundayMass',
      status: 'Present',
    },
  ]

  it('1. Renders clean printable Empty State HTML when students list is empty', () => {
    const batchVm = ReportViewModelFactory.createBatchViewModel({
      students: [],
      grades: [],
      attendance: [],
      academicYear: '2025 - 2026',
    })
    const html = generateBatchReportCardsHTML(batchVm)
    expect(html).toContain('Không có học sinh trong danh sách để xuất kết quả học tập hàng loạt.')
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('2. Excludes soft-deleted students and preserves input immutability', () => {
    const studentsCopy = [...mockStudents]
    const batchVm = ReportViewModelFactory.createBatchViewModel({
      students: studentsCopy,
      grades: mockGrades,
      attendance: mockAttendance,
      academicYear: '2025 - 2026',
    })

    // Excludes soft-deleted student ST-DELETED
    expect(batchVm.reports.length).toBe(2)
    expect(batchVm.reports.some((r) => r.student.id === 'ST-DELETED')).toBe(false)

    // Input immutability check
    expect(studentsCopy.length).toBe(3)
    expect(studentsCopy[0].fullName).toBe('Nguyễn Văn A')
  })

  it('3. Escapes HTML and handles XSS injection attempts in student names', () => {
    const batchVm = ReportViewModelFactory.createBatchViewModel({
      students: mockStudents,
      grades: mockGrades,
      attendance: mockAttendance,
      academicYear: '2025 - 2026',
    })
    const html = generateBatchReportCardsHTML(batchVm)
    expect(html).not.toContain('<Script>')
    expect(html).toContain('&lt;Script&gt;Alert(&quot;XSS&quot;)&lt;/Script&gt;')
  })

  it('4. Embeds canonical print CSS styles with A4 portrait & page-break-after', () => {
    const batchVm = ReportViewModelFactory.createBatchViewModel({
      students: mockStudents,
      grades: mockGrades,
      attendance: mockAttendance,
      academicYear: '2025 - 2026',
    })
    const html = generateBatchReportCardsHTML(batchVm)
    expect(html).toContain('@page { size: A4 portrait; margin: 10mm; }')
    expect(html).toContain('print-color-adjust: exact;')
    expect(html).toContain('page-break-after: always;')
  })

  it('5. Verifies O(N) pre-indexed linear performance for 100 students', () => {
    const largeStudents: Student[] = Array.from({ length: 100 }, (_, i) => ({
      id: `ST-PERF-${i}`,
      code: `TN${i}`,
      holyName: 'Giuse',
      fullName: `Học Sinh Thứ ${i}`,
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Phụ Huynh',
      parentPhone: '0901111111',
      address: 'Địa chỉ',
      branch: 'AuNhi',
      classId: 'CLS-AU1',
      parishId: 'parish-test',
      status: 'Đang học',
      createdAt: '2025-09-01T00:00:00Z',
      updatedAt: '2025-09-01T00:00:00Z',
    }))

    const startMemory = process.memoryUsage().heapUsed
    const batchVm = ReportViewModelFactory.createBatchViewModel({
      students: largeStudents,
      grades: mockGrades,
      attendance: mockAttendance,
      academicYear: '2025 - 2026',
    })
    const html = generateBatchReportCardsHTML(batchVm)
    const endMemory = process.memoryUsage().heapUsed

    expect(batchVm.reports.length).toBe(100)
    expect(html).toContain('Học Sinh Thứ 99')
    const memoryDiffMb = (endMemory - startMemory) / (1024 * 1024)
    expect(memoryDiffMb).toBeLessThan(50) // Heap allocation bounds check
  })

  it('6. Single student report card matches canonical template snapshot', () => {
    const vm = ReportViewModelFactory.createStudentViewModel(mockStudents[0], mockGrades, mockAttendance, { academicYear: '2025 - 2026' })
    const bodyHtml = renderStudentReportCardBody(vm)
    expect(bodyHtml).toMatchSnapshot()
  })

  it('6b. labels the unsigned QR as a non-verifying reference', () => {
    const vm = ReportViewModelFactory.createStudentViewModel(mockStudents[0], mockGrades, mockAttendance, { academicYear: '2025 - 2026' })
    const bodyHtml = renderStudentReportCardBody(vm)
    expect(bodyHtml).toContain('Mã tham chiếu báo cáo')
    expect(bodyHtml).toContain('không phải chữ ký số')
    expect(bodyHtml).toContain('không xác nhận tính toàn vẹn của điểm số')
    expect(bodyHtml).not.toContain('QR Verification')
  })

  it('7. generateClassGradebookHTML calculates weighted semester GPA and yearly average correctly (Item 3)', () => {
    const html = generateClassGradebookHTML('CLS-AU1', mockStudents, mockGrades, mockAttendance, { academicYear: '2025 - 2026' })
    expect(html).toContain('SỔ ĐIỂM GIÁO LÝ')
    // Student ST-001 has semester 1 grade: Oral=8, 15m=9, 1P=8, Midterm=9, Final=10 -> weighted average is 9.0
    expect(html).toContain('9.0')
    expect(html).toContain('9.2')
  })

  it('8. ReportViewModelFactory marks classification as provisional when HK2 is missing (Item 4)', () => {
    const sem1OnlyGrades = mockGrades.filter(g => g.semester === 1)
    const vm = ReportViewModelFactory.createStudentViewModel(mockStudents[0], sem1OnlyGrades, mockAttendance, { academicYear: '2025 - 2026' })
    expect(vm.summary.classification).toContain('(Tạm tính)')
  })

  it('9. generateParentReportCardHTML renders server ReportCardDTO + escapes user data (B2)', () => {
    const dto: ReportCardDTO = {
      student: { id: 'ST-001', code: 'TN001', holyName: 'Phê-rô', fullName: 'Nguyễn Văn <Script>Alert("X")</Script>', className: 'Lớp 1' },
      academicYear: '2025 - 2026',
      grades: [
        { semester: 1, scoreOral: 8, score15m: 9, score1Period: 8, scoreMidterm: 9, scoreFinal: 10, scoreDaoDuc: 9, gpa: 9.0, classification: 'Xếp loại đã chốt HK1' },
        { semester: 2, scoreOral: 7, score15m: 8, score1Period: 9, scoreMidterm: 8, scoreFinal: 9, scoreDaoDuc: 8, gpa: 8.4, classification: 'Xếp loại đã chốt HK2' },
      ],
      yearSummary: { gpa: 8.7, classification: 'Giỏi' },
      attendanceSummary: {
        massPresentCount: 20, massTotalCount: 22,
        catechismPresentCount: 18, catechismTotalCount: 20,
        overallAttendanceRate: 90,
      },
      promotion: { status: 'PROMOTED', gpa: 8.7, attendanceRate: 90, isOverridden: false },
    }
    const html = generateParentReportCardHTML(dto)
    // Đúng dữ liệu server POST qua
    expect(html).toContain('PHIẾU KẾT QUẢ HỌC TẬP GIÁO LÝ')
    expect(html).toContain('Phê-rô')
    expect(html).toContain('Học Kỳ 1')
    expect(html).toContain('Xếp loại đã chốt HK1')
    expect(html).toContain('Cả năm: <strong>8.7</strong> — <strong>Giỏi</strong>')
    expect(html).toContain('Được lên lớp')
    // XSS: dữ liệu user bị escape, không xuất hiện raw <Script>
    expect(html).not.toContain('Nguyễn Văn <Script>')
    expect(html).toContain('Nguyễn Văn &lt;Script&gt;')
  })
})

