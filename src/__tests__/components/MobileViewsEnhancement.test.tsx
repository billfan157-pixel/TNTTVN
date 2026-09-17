import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MobileGradeView } from '../../components/mobile/MobileGradeView'
import { MobileNoticesView } from '../../components/mobile/MobileNoticesView'
import { MobileStudentsView } from '../../components/mobile/MobileStudentsView'
import { MobileHomeView } from '../../components/mobile/MobileHomeView'
import { MobileAttendanceView } from '../../components/mobile/MobileAttendanceView'
import { MobileAttendanceSummaryView } from '../../components/mobile/MobileAttendanceSummaryView'
import { MobileLeaveRequests } from '../../components/mobile/MobileLeaveRequests'
import { MobileBottomNav } from '../../components/mobile/MobileBottomNav'
import { DesktopNotices } from '../../components/desktop/DesktopNotices'
import { useAuthStore } from '../../stores/authStore'
import { useNoticeStore } from '../../stores/noticeStore'
import { useStudentStore } from '../../stores/studentStore'
import { useClassStore } from '../../stores/classStore'
import { useFilterStore } from '../../stores/filterStore'
import { useAttendanceStore } from '../../stores/attendanceStore'

// Mock Stores & Hooks
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: useAuthStore.getState().user,
    role: useAuthStore.getState().user?.role || 'phuta',
    can: (...roles: string[]) => {
      const u = useAuthStore.getState().user
      if (!u) return false
      return roles.includes(u.role)
    }
  })
}))

describe('MobileViewsEnhancement Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: { id: 'admin-1', username: 'admin', fullName: 'Admin User', role: 'admin', status: 'ACTIVE', parishId: 'test-parish' }
    })
    useNoticeStore.setState({
      notices: [
        { id: '1', title: 'Thông báo 1', content: 'Nội dung 1', date: '2026-08-08', priority: 'normal', author: 'Admin' }
      ]
    })
    useClassStore.setState({
      classes: [
        { id: 'cls-1', name: 'Ấu Nhi 1', branchId: 'AuNhi', room: 'Phòng 1', activeYear: '2026-2027', order: 1 } as any
      ],
      branches: [{ id: 'AuNhi', name: 'Ấu Nhi' }] as any,
      academicYears: [{ id: '2026-2027', startDate: '2026-09-01', endDate: '2027-05-31', status: 'OPEN' }] as any,
      fetchClasses: vi.fn(),
      fetchBranches: vi.fn(),
      fetchAcademicYears: vi.fn(),
    })
    useStudentStore.setState({
      students: [
        { id: 'st-1', holyName: 'Phêrô', fullName: 'Nguyễn Văn A', code: 'TN-001', branch: 'AuNhi', classId: 'cls-1', status: 'Đang học', gender: 'Nam', dateOfBirth: '2018-01-01', parentName: 'Nguyễn Văn X', parentPhone: '0901234567', address: 'Xứ đoàn' },
        { id: 'st-2', holyName: 'Maria', fullName: 'Trần Thị B', code: 'TN-002', branch: 'AuNhi', classId: 'cls-1', status: 'Đang học', gender: 'Nữ', dateOfBirth: '2018-02-02', parentName: 'Trần Văn Y', parentPhone: '0901234568', address: 'Xứ đoàn' }
      ]
    })
    useFilterStore.setState({
      selectedClassId: 'cls-1'
    })
  })

  describe('MobileBottomNav', () => {
    it('renders native-style role-aware navigation and reports active tab changes', () => {
      const setActiveTab = vi.fn()
      render(<MobileBottomNav activeTab="home" setActiveTab={setActiveTab} />)

      expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveClass('mobile-bottom-nav')
      expect(screen.getByRole('button', { name: /Trang chủ/i })).toHaveAttribute('aria-current', 'page')
      fireEvent.click(screen.getByRole('button', { name: /Điểm danh/i }))
      expect(setActiveTab).toHaveBeenCalledWith('attendance')
      fireEvent.click(screen.getByRole('button', { name: /Báo cáo/i }))
      expect(setActiveTab).toHaveBeenCalledWith('reports')
    })

    it('shows the parent information architecture without staff management tabs', () => {
      useAuthStore.setState({
        user: { id: 'parent-1', username: 'parent', fullName: 'Parent User', role: 'phuhuynh', status: 'ACTIVE', parishId: 'test-parish' }
      })
      render(<MobileBottomNav activeTab="home" setActiveTab={vi.fn()} />)

      expect(screen.getByRole('button', { name: /Con tôi/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Điểm danh/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Thiếu nhi/i })).not.toBeInTheDocument()
    })

    it('keeps the reports workspace available to phuta', () => {
      useAuthStore.setState({
        user: { id: 'assistant-1', username: 'assistant', fullName: 'Phụ tá', role: 'phuta', status: 'ACTIVE', parishId: 'test-parish' }
      })
      render(<MobileBottomNav activeTab={null} setActiveTab={vi.fn()} />)

      expect(screen.getByRole('button', { name: /Báo cáo/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { current: 'page' })).not.toBeInTheDocument()
    })
  })

  describe('MobileGradeView', () => {
    it('switches between Cards, Daily Entry, and Comparison tabs', async () => {
      const handleViewReport = vi.fn()
      render(<MobileGradeView onViewReport={handleViewReport} />)

      // Default: Unified Bảng điểm tab active (C1 gộp Thẻ điểm + Ma trận)
      expect(screen.getByText('Bảng Điểm Giáo Lý')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Bảng điểm/ })).toHaveAttribute('aria-selected', 'true')

      // Click Daily Entry tab
      const dailyBtn = screen.getByRole('tab', { name: 'Hằng ngày' })
      fireEvent.click(dailyBtn)
      expect(await screen.findByText('Nhập Điểm Hằng Ngày')).toBeInTheDocument()

      // Click Comparison tab
      const compBtn = screen.getByRole('tab', { name: 'So sánh' })
      fireEvent.click(compBtn)
      expect(await screen.findByText(/So Sánh Học Kỳ I vs/i)).toBeInTheDocument()
    })

    it('renders unified Bảng điểm board with 4 tabs instead of 5 (C1)', async () => {
      const handleViewReport = vi.fn()
      render(<MobileGradeView onViewReport={handleViewReport} />)

      // C1: 4 tabs only - Bảng điểm appears twice (tab + board header) so use getAllByText
      expect(screen.getAllByText('Bảng điểm').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByRole('tab', { name: /Bảng điểm/ })).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByText('Thẻ điểm')).not.toBeInTheDocument()
      expect(screen.queryByText('Ma trận')).not.toBeInTheDocument()
      expect(screen.getByText('Hằng ngày')).toBeInTheDocument()
      expect(screen.getByText('So sánh')).toBeInTheDocument()
      expect(screen.getByText('Chấm bài')).toBeInTheDocument()
    })
  })

  describe('MobileNoticesView', () => {
    it('shows Add button and Edit button for admin users', () => {
      render(<MobileNoticesView />)

      expect(screen.getByText('Thêm')).toBeInTheDocument()
      expect(screen.getByText('Sửa')).toBeInTheDocument()
    })

    it('shows Add button and Edit button for chunhiem users', () => {
      useAuthStore.setState({
        user: { id: 'cn-1', username: 'cn', fullName: 'Chủ nhiệm', role: 'chunhiem', status: 'ACTIVE', parishId: 'test-parish' }
      })

      render(<MobileNoticesView />)

      expect(screen.getByText('Thêm')).toBeInTheDocument()
      expect(screen.getByText('Sửa')).toBeInTheDocument()
    })

    it('hides Add button and Edit button for phuta users', () => {
      useAuthStore.setState({
        user: { id: 'glv-1', username: 'glv', fullName: 'GLV User', role: 'phuta', status: 'ACTIVE', parishId: 'test-parish' }
      })

      render(<MobileNoticesView />)

      expect(screen.queryByText('Thêm')).not.toBeInTheDocument()
      expect(screen.queryByText('Sửa')).not.toBeInTheDocument()
    })
  })

  describe('DesktopNotices', () => {
    it('matches server notice mutation roles for chunhiem and phuta', () => {
      useAuthStore.setState({
        user: { id: 'cn-desktop', username: 'cn-desktop', fullName: 'Chủ nhiệm', role: 'chunhiem', status: 'ACTIVE', parishId: 'test-parish' }
      })
      const { unmount } = render(<DesktopNotices />)
      expect(screen.getByRole('button', { name: /Thêm Thông Báo/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument()
      unmount()

      useAuthStore.setState({
        user: { id: 'phuta-desktop', username: 'phuta-desktop', fullName: 'Phụ tá', role: 'phuta', status: 'ACTIVE', parishId: 'test-parish' }
      })
      render(<DesktopNotices />)
      expect(screen.queryByRole('button', { name: /Thêm Thông Báo/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
    })
  })

  describe('MobileStudentsView', () => {
    it('shows class management only for admin and keeps phuta read-only', () => {
      useFilterStore.setState({ selectedClassId: 'all' })
      const dummyHandlers = {
        workspace: 'students' as const,
        onWorkspaceChange: vi.fn(),
        onViewClassStudents: vi.fn(),
        onOpenAddStudent: vi.fn(),
        onImportStudents: vi.fn(),
        onEditStudent: vi.fn(),
        onViewReport: vi.fn(),
        onPrintReport: vi.fn(),
        onSendReportCards: vi.fn(),
      }

      const { rerender } = render(<MobileStudentsView {...dummyHandlers} />)
      expect(screen.getByText('Thăng Tiến')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Danh Sách & Lớp' })).toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Lớp Học' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Lớp Học' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Thêm Lớp/i })).toBeInTheDocument()

      fireEvent.click(screen.getAllByRole('button', { name: /Xem Danh Sách/i })[0])
      expect(dummyHandlers.onViewClassStudents).toHaveBeenCalled()

      // Switch to phuta role
      useAuthStore.setState({
        user: { id: 'glv-2', username: 'phuta', fullName: 'Phu Ta User', role: 'phuta', status: 'ACTIVE', parishId: 'test-parish' }
      })

      rerender(<MobileStudentsView {...dummyHandlers} />)
      expect(screen.queryByText('Thăng Tiến')).not.toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Lớp Học' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Lớp Học' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Thêm Lớp/i })).not.toBeInTheDocument()
      expect(screen.queryByText('Thêm em')).not.toBeInTheDocument()
      expect(screen.queryByText('Nhập Excel')).not.toBeInTheDocument()
      expect(screen.queryByText('Gửi KQ')).not.toBeInTheDocument()

      useFilterStore.setState({ selectedClassId: 'cls-1' })
      rerender(<MobileStudentsView {...dummyHandlers} />)
      expect(useFilterStore.getState().selectedClassId).toBe('cls-1')
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    })

    it('opens confirmation modal when clicking Send Report Cards button', () => {
      const handleSendCards = vi.fn()
      render(
        <MobileStudentsView
          workspace="students"
          onWorkspaceChange={vi.fn()}
          onViewClassStudents={vi.fn()}
          onOpenAddStudent={vi.fn()}
          onImportStudents={vi.fn()}
          onEditStudent={vi.fn()}
          onViewReport={vi.fn()}
          onPrintReport={vi.fn()}
          onSendReportCards={handleSendCards}
        />
      )

      const sendBtn = screen.getByText('Gửi KQ')
      fireEvent.click(sendBtn)

      // Confirm dialog should appear
      expect(screen.getByText(/Bạn có chắc chắn muốn gửi kết quả học tập cho/i)).toBeInTheDocument()
    })
  })

  it('keeps a GLV class selection while they stay on the roster route', () => {
    const rootLayoutSource = readFileSync(resolve(process.cwd(), 'src/components/common/RootLayout.tsx'), 'utf8')
    expect(rootLayoutSource).toContain("pathname !== '/students' && selectedClassId !== 'all'")
  })

  describe('MobileAttendanceView', () => {
    it('renders Command Deck and filters students by search query and status', () => {
      render(<MobileAttendanceView />)

      // Command Deck header exists
      expect(screen.getByText(/Phiên Điểm Danh/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Có mặt tất cả/i })).toBeInTheDocument()

      // Search input exists and filters student list
      const searchInput = screen.getByLabelText('Tìm thiếu nhi trong lớp')
      expect(searchInput).toBeInTheDocument()

      fireEvent.change(searchInput, { target: { value: 'Phêrô' } })
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
      expect(screen.queryByText('Trần Thị B')).not.toBeInTheDocument()

      // Clear search
      fireEvent.change(searchInput, { target: { value: '' } })
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
      expect(screen.getByText('Trần Thị B')).toBeInTheDocument()

      // Interactive status summary filter toggle
      const presentSummaryBtn = screen.getByRole('button', { name: /Lọc có mặt/i })
      fireEvent.click(presentSummaryBtn)
      expect(presentSummaryBtn).toHaveAttribute('aria-pressed', 'true')
    })

    it('toggles attendance status and allows adding notes via note modal', () => {
      render(<MobileAttendanceView />)

      // Toggle first student to AbsentExcused
      const excusedBtns = screen.getAllByTitle('Vắng có phép')
      expect(excusedBtns.length).toBeGreaterThanOrEqual(1)
      fireEvent.click(excusedBtns[0])

      // After setting to absent, the + Ghi chú button appears
      const addNoteBtn = screen.getByRole('button', { name: /\+ Ghi chú/i })
      expect(addNoteBtn).toBeInTheDocument()
      fireEvent.click(addNoteBtn)

      // Note modal dialog appears
      expect(screen.getByRole('dialog', { name: /Nguyễn Văn A/i })).toBeInTheDocument()
      expect(screen.getByText('Lý do nhanh:')).toBeInTheDocument()

      // Click quick reason "Bệnh"
      fireEvent.click(screen.getByRole('button', { name: 'Bệnh' }))
      expect(screen.getByPlaceholderText('Nhập lý do vắng / phép / ghi chú...')).toHaveValue('Bệnh')

      // Save note
      fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi chú' }))

      // Note badge is now displayed on student row
      expect(screen.getByTitle('Ghi chú: Bệnh')).toBeInTheDocument()
    })

    it('displays lock indicator and disables edit controls when semester is locked', () => {
      useAttendanceStore.setState({
        lockError: 'Học kỳ 1 đã bị khóa điểm danh',
      })

      render(<MobileAttendanceView />)

      // Lock badge is shown
      expect(screen.getByText(/Khóa sổ/i)).toBeInTheDocument()

      // Có mặt tất cả button is disabled
      const markAllBtn = screen.getByRole('button', { name: /Có mặt tất cả/i })
      expect(markAllBtn).toBeDisabled()

      // Status buttons are disabled
      const excusedBtns = screen.getAllByTitle(/Không thể chỉnh sửa/i)
      expect(excusedBtns.length).toBeGreaterThan(0)
      expect(excusedBtns[0]).toBeDisabled()

      // Clear lockError
      useAttendanceStore.setState({ lockError: null })
    })
  })

  describe('MobileAttendanceSummaryView', () => {
    it('switches time filter via SegmentedControl and filters student list by search', () => {
      render(<MobileAttendanceSummaryView />)

      // Check SegmentedControl options (role="radio")
      expect(screen.getByRole('radio', { name: 'Cả Năm' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Học Kỳ 1' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Học Kỳ 2' })).toBeInTheDocument()

      // Switch to HK1
      fireEvent.click(screen.getByRole('radio', { name: 'Học Kỳ 1' }))
      expect(screen.getByRole('radio', { name: 'Học Kỳ 1' })).toHaveAttribute('aria-checked', 'true')

      // Search student
      const searchInput = screen.getByPlaceholderText(/Tìm theo tên hoặc mã/i)
      fireEvent.change(searchInput, { target: { value: 'Phêrô' } })
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    })
  })

  describe('MobileLeaveRequests', () => {
    it('renders status tabs and filter toggle', () => {
      render(<MobileLeaveRequests />)

      // Check header and tabs
      expect(screen.getByText('Đơn Xin Nghỉ Phép')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Tất cả/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Chờ duyệt/i })).toBeInTheDocument()

      // Click filter button to open filter panel
      const filterToggle = screen.getByRole('button', { name: /Bộ lọc/i })
      fireEvent.click(filterToggle)
      expect(screen.getByPlaceholderText(/Tìm theo tên con \/ phụ huynh/i)).toBeInTheDocument()
    })
  })

  describe('MobileHomeView', () => {
    it('renders Xem tất cả link in Notices section and calls onNavigateTab', () => {
      const handleNavigateTab = vi.fn()
      render(
        <MobileHomeView
          onNavigateTab={handleNavigateTab}
          onOpenAddStudent={vi.fn()}
        />
      )

      const xemTatCaBtn = screen.getByRole('button', { name: /tất cả/i })
      expect(xemTatCaBtn).toBeInTheDocument()

      fireEvent.click(xemTatCaBtn)
      expect(handleNavigateTab).toHaveBeenCalledWith('notices')
    })

    it('uses shared hero and touch-action primitives', () => {
      const { container } = render(
        <MobileHomeView
          onNavigateTab={vi.fn()}
          onOpenAddStudent={vi.fn()}
        />
      )

      expect(container.querySelector('.mobile-home-hero')).toBeInTheDocument()
      expect(container.querySelectorAll('.mobile-quick-action')).toHaveLength(4)
      expect(screen.getByRole('button', { name: /mở lịch phụng vụ/i })).toBeInTheDocument()
    })
  })
})
