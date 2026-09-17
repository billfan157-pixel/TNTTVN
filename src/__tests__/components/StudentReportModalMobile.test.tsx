import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StudentReportModal } from '../../components/common/StudentReportModal'
import type { Student } from '../../types'

const { getStudentReportCardMock } = vi.hoisted(() => ({ getStudentReportCardMock: vi.fn() }))

vi.mock('../../lib/api', () => ({
  api: { getStudentReportCard: (...args: unknown[]) => getStudentReportCardMock(...args) },
  isAuthenticated: () => false,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const student: Student = {
  id: 'ST-1',
  code: 'TN2026676014',
  holyName: 'Têrêsa',
  fullName: 'Đỗ Ngọc Bảo An',
  gender: 'Nam',
  dateOfBirth: '2018-01-01',
  parentName: 'Phụ Huynh A',
  parentPhone: '0901234567',
  address: 'X',
  branch: 'AuNhi',
  classId: 'CL-1',
  status: 'Đang học',
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

describe('StudentReportModal mobile layout (MOBILE-REPORT)', () => {
  beforeEach(() => {
    cleanup()
    setViewportWidth(1280)
    getStudentReportCardMock.mockResolvedValue({
      student: { id: student.id, code: student.code, holyName: student.holyName, fullName: student.fullName, gender: student.gender, dateOfBirth: student.dateOfBirth, className: 'Ấu Nhi 1' },
      academicYear: '2026-2027',
      grades: [{ semester: 1, gpa: 8, classification: 'Giỏi' }, { semester: 2, gpa: 9, classification: 'Xuất Sắc' }],
      yearSummary: { gpa: 8.5, classification: 'Giỏi' },
      attendanceSummary: { massPresentCount: 8, massTotalCount: 10, catechismPresentCount: 9, catechismTotalCount: 10, overallAttendanceRate: 85 },
      promotion: null,
    })
  })

  it('hiển thị đầy đủ nội dung phiếu ở desktop (2 cột, full title)', async () => {
    setViewportWidth(1280)
    render(<StudentReportModal isOpen onClose={() => {}} student={student} />)
    expect(screen.getByText('Phiếu Kết Quả Học Tập Thiếu Nhi')).toBeInTheDocument()
    expect(await screen.findByTestId('report-student-grid')).toHaveStyle({ gridTemplateColumns: '1fr 1fr' })
    expect(screen.getByTestId('report-attendance-grid')).toHaveStyle({ gridTemplateColumns: '1fr 1fr 1fr' })
    expect(screen.getByTestId('report-signatures-grid')).toHaveStyle({ gridTemplateColumns: '1fr 1fr 1fr' })
    expect(screen.getByRole('table')).not.toHaveStyle({ minWidth: '620px' })
  })

  it('gọn header + xếp chồng các khối ở mobile 390px', async () => {
    setViewportWidth(390)
    render(<StudentReportModal isOpen onClose={() => {}} student={student} />)
    // Tiêu đề ngắn để không cụt "Thiếu..." cạnh nút In.
    expect(await screen.findByText('Kết Quả Học Tập')).toBeInTheDocument()
    expect(screen.queryByText('Phiếu Kết Quả Học Tập Thiếu Nhi')).not.toBeInTheDocument()
    expect(screen.getByTestId('report-student-grid')).toHaveStyle({ gridTemplateColumns: '1fr' })
    expect(screen.getByTestId('report-attendance-grid')).toHaveStyle({ gridTemplateColumns: '1fr' })
    expect(screen.getByTestId('report-signatures-grid')).toHaveStyle({ gridTemplateColumns: '1fr' })
  })

  it('bảng điểm mobile: min-width chống gãy chữ + sticky cột Học Kỳ + nowrap tiêu đề', async () => {
    setViewportWidth(390)
    render(<StudentReportModal isOpen onClose={() => {}} student={student} />)
    const table = await screen.findByRole('table')
    expect(table).toHaveStyle({ minWidth: '620px' })
    // Cột đầu sticky để giữ ngữ cảnh hàng khi cuộn ngang.
    expect(screen.getByText('Học Kỳ')).toHaveStyle({ position: 'sticky', left: '0px' })
    expect(screen.getByText('HK I')).toHaveStyle({ position: 'sticky', left: '0px' })
    // Tiêu đề cột không gãy ký tự ("Mi ện g").
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).toHaveStyle({ whiteSpace: 'nowrap' })
    }
  })

  it('không render khi đóng hoặc thiếu học sinh', () => {
    const { container } = render(<StudentReportModal isOpen={false} onClose={() => {}} student={student} />)
    expect(container).toBeEmptyDOMElement()
    cleanup()
    const closed = render(<StudentReportModal isOpen onClose={() => {}} student={null} />)
    expect(closed.container).toBeEmptyDOMElement()
  })
})
