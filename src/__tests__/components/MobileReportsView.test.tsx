import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MobileReportsView } from '../../components/mobile/MobileReportsView'
import { fetchOfficialAcademicYearReports } from '../../services/officialReporting'
import { buildBranchSummaryRows, exportCsv } from '../../services/reportExporter'

// The view joins local students to official reports. Grades and historical class
// membership come from the gateway; the fixture supplies both sides of that join.
const { students, officialReports } = vi.hoisted(() => {
  const list = [
    { id: 's1', code: 'TN-001', holyName: 'Phê-rô', fullName: 'Nguyễn Văn An', branch: 'ThieuNhi' },
    { id: 's2', code: 'AN-002', holyName: 'Maria', fullName: 'Trần Ngọc Bình', branch: 'AuNhi' },
    ...Array.from({ length: 33 }, (_, index) => ({
      id: `extra-${index}`,
      code: `EX-${index}`,
      holyName: 'Giuse',
      fullName: `Học Sinh ${index}`,
      branch: 'ThieuNhi',
    })),
  ]
  const reportCard = (student: (typeof list)[number]) => ({
    student,
    grades: [
      { semester: 1, gpa: 8.5, classification: 'Giỏi' },
      { semester: 2, gpa: 7.5, classification: 'Khá' },
    ],
  })
  const reports = [
    {
      classInfo: { id: 'c1', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYear: '2026-2027' },
      summary: { className: 'Ấu Nhi 1', branchId: 'AuNhi' },
      reportCards: list.slice(0, 5).map(reportCard),
    },
    {
      classInfo: { id: 'c2', name: 'Thiếu Nhi 2', branchId: 'ThieuNhi', academicYear: '2026-2027' },
      summary: { className: 'Thiếu Nhi 2', branchId: 'ThieuNhi' },
      reportCards: list.slice(5).map(reportCard),
    },
  ]
  return { students: list, officialReports: reports }
})

vi.mock('../../services/officialReporting', () => ({
  fetchOfficialAcademicYearReports: vi.fn().mockResolvedValue(officialReports as any),
}))

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: (selector: (state: { students: typeof students }) => unknown) => selector({ students }),
}))

vi.mock('../../stores/gradeStore', () => ({
  useGradeStore: (selector: (state: { calculateStudentAvg: () => { score: number; label: string } }) => unknown) => selector({
    calculateStudentAvg: () => ({ score: 8.5, label: 'Giỏi' }),
  }),
}))

vi.mock('../../stores/filterStore', () => ({
  useFilterStore: (selector: (state: { selectedSemester: 1; setSelectedSemester: () => void }) => unknown) => selector({
    selectedSemester: 1,
    setSelectedSemester: vi.fn(),
  }),
}))
vi.mock('../../stores/classStore', () => ({
  useClassStore: (selector: (state: any) => unknown) => selector({
    findClassById: (id: string) => ({ id, name: id === 'c1' ? 'Ấu Nhi 1' : 'Thiếu Nhi 2' }),
    getClassList: () => [
      { id: 'c1', name: 'Ấu Nhi 1', branchId: 'AuNhi' },
      { id: 'c2', name: 'Thiếu Nhi 2', branchId: 'ThieuNhi' },
    ],
  }),
}))

vi.mock('../../services/reportExporter', () => ({
  buildBranchSummaryRows: vi.fn(() => []),
  buildStudentDetailRows: vi.fn(() => []),
  exportCsv: vi.fn(),
  exportXlsx: vi.fn().mockResolvedValue(undefined),
  exportFilename: (prefix: string) => `${prefix}.csv`,
}))

vi.mock('../../components/common/PrintReportModal', () => ({
  PrintReportModal: ({ isOpen, onClose, initialReportType }: any) => {
    if (!isOpen) return null
    return (
      <div role="dialog" aria-modal="true">
        <h2>Print Report Modal: {initialReportType}</h2>
        <button onClick={onClose}>Đóng Modal</button>
      </div>
    )
  },
}))

vi.mock('../../hooks/useSemesterAccess', () => ({
  useSemesterAccess: () => ({ restricted: false, openSemester: 1 }),
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    role: 'admin',
    can: () => true,
  }),
}))

describe('MobileReportsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchOfficialAcademicYearReports).mockResolvedValue(officialReports as any)
  })
  it('filters the print list by name, holy name, or student code', async () => {
    render(<MobileReportsView onPrintReport={vi.fn()} />)
    await screen.findByText('35/35 em')

    expect(screen.getByText('35/35 em')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm học sinh để in kết quả' }), {
      target: { value: 'TN-001' },
    })

    expect(screen.getByText('1/35 em')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.queryByText('Trần Ngọc Bình')).not.toBeInTheDocument()
  })

  it('filters students by class selection dropdown', async () => {
    render(<MobileReportsView onPrintReport={vi.fn()} />)
    await screen.findByText('35/35 em')

    const classSelect = screen.getByRole('combobox', { name: 'Chọn lớp để in kết quả' })
    expect(classSelect).toBeInTheDocument()
    expect(screen.getByText(/Tất cả các lớp/)).toBeInTheDocument()

    // Official class membership applies even without local classId pointers.
    fireEvent.change(classSelect, { target: { value: 'c1' } })
    expect(screen.getByText('5/5 em')).toBeInTheDocument()

    // Reset back to all
    fireEvent.change(classSelect, { target: { value: 'all' } })
    expect(screen.getByText('35/35 em')).toBeInTheDocument()
  })

  it('opens PrintReportModal when clicking In Sổ Điểm Lớp and In Hàng Loạt buttons', async () => {
    render(<MobileReportsView onPrintReport={vi.fn()} />)
    await screen.findByText('35/35 em')

    // Click In Sổ Điểm Lớp
    const gradebookBtn = screen.getByRole('button', { name: /In Sổ Điểm Lớp/i })
    fireEvent.click(gradebookBtn)
    expect(screen.getByText(/Print Report Modal: CLASS_GRADEBOOK/i)).toBeInTheDocument()

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: 'Đóng Modal' }))
    expect(screen.queryByText(/Print Report Modal/i)).not.toBeInTheDocument()

    // Click In Hàng Loạt
    const batchBtn = screen.getByRole('button', { name: /In Hàng Loạt/i })
    fireEvent.click(batchBtn)
    expect(screen.getByText(/Print Report Modal: BATCH_STUDENT_REPORT_CARDS/i)).toBeInTheDocument()
  })

  it('shows a recoverable empty state when no student matches', async () => {
    render(<MobileReportsView onPrintReport={vi.fn()} />)
    await screen.findByText('35/35 em')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'không tồn tại' } })

    expect(screen.getByText('Không tìm thấy học sinh phù hợp')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tìm kiếm' }))
    expect(screen.getByText('35/35 em')).toBeInTheDocument()
  })

  it('renders large lists in incremental batches', async () => {
    render(<MobileReportsView onPrintReport={vi.fn()} />)
    await screen.findByText('35/35 em')

    expect(screen.getAllByRole('button', { name: /In kết quả học tập cho/ })).toHaveLength(30)
    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm 5 em' }))
    expect(screen.getAllByRole('button', { name: /In kết quả học tập cho/ })).toHaveLength(35)
    expect(screen.queryByRole('button', { name: /Xem thêm/ })).not.toBeInTheDocument()
  })

  it('switches between In Phiếu, Thống Kê, and Xuất File tabs', async () => {
    render(<MobileReportsView onPrintReport={vi.fn()} />)
    await screen.findByText('35/35 em')

    // Check default tab
    expect(screen.getByRole('tab', { name: 'In Phiếu' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Danh Sách In Kết Quả')).toBeInTheDocument()

    // Switch to Thống Kê
    fireEvent.click(screen.getByRole('tab', { name: 'Thống Kê' }))
    expect(screen.getByRole('tab', { name: 'Thống Kê' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Thống Kê Chi Tiết Phân Ngành/i)).toBeInTheDocument()
    expect(screen.getByText('Tỉ Lệ Giỏi Trở Lên')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(5)

    // Switch to Xuất File
    fireEvent.click(screen.getByRole('tab', { name: 'Xuất File' }))
    expect(screen.getByRole('tab', { name: 'Xuất File' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Xuất Báo Cáo & Dữ Liệu/i)).toBeInTheDocument()
    const exportCsvBtns = screen.getAllByRole('button', { name: /Xuất CSV/i })
    expect(exportCsvBtns).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /Xuất Excel/i })).toHaveLength(2)

    // Trigger export
    fireEvent.click(exportCsvBtns[0])
    await waitFor(() => expect(screen.getByText(/Đã xuất file CSV thành công!/i)).toBeInTheDocument())
    expect(buildBranchSummaryRows).toHaveBeenCalledWith(1)
    expect(exportCsv).toHaveBeenCalledWith('BaoCao_ThongKe_PhanNganh_HK1.csv', [])
  })
})

it('does not show local students when official report evidence fails to load', async () => {
  vi.mocked(fetchOfficialAcademicYearReports).mockRejectedValueOnce(new Error('Thiếu snapshot đã chốt'))
  render(<MobileReportsView onPrintReport={vi.fn()} />)
  await screen.findByText(/Thiếu snapshot đã chốt. Không dùng dữ liệu cục bộ thay thế/)
  expect(screen.queryByRole('button', { name: /In kết quả học tập cho/ })).not.toBeInTheDocument()
  expect(screen.queryByText('Nguyễn Văn An')).not.toBeInTheDocument()
  expect(screen.getByText('0/0 em')).toBeInTheDocument()
})

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: (selector: (state: { currentYear: string }) => unknown) => selector({
    currentYear: '2026-2027',
  }),
}))
