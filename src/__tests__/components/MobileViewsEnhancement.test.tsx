import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MobileGradeView } from '../../components/mobile/MobileGradeView'
import { MobileNoticesView } from '../../components/mobile/MobileNoticesView'
import { MobileStudentsView } from '../../components/mobile/MobileStudentsView'
import { MobileHomeView } from '../../components/mobile/MobileHomeView'
import { MobileBottomNav } from '../../components/mobile/MobileBottomNav'
import { useAuthStore } from '../../stores/authStore'
import { useNoticeStore } from '../../stores/noticeStore'

// Mock Stores & Hooks
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: useAuthStore.getState().user,
    role: useAuthStore.getState().user?.role || 'phuta',
    can: (action: string, ...roles: string[]) => {
      const u = useAuthStore.getState().user
      if (!u) return false
      if (action === 'admin') return u.role === 'admin'
      if (u.role === 'admin') return true
      if (roles.length > 0) return roles.includes(u.role)
      return false
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
  })

  describe('MobileBottomNav', () => {
    it('renders native-style role-aware navigation and reports active tab changes', () => {
      const setActiveTab = vi.fn()
      render(<MobileBottomNav activeTab="home" setActiveTab={setActiveTab} />)

      expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveClass('mobile-bottom-nav')
      expect(screen.getByRole('button', { name: 'Trang chủ' })).toHaveAttribute('aria-current', 'page')
      fireEvent.click(screen.getByRole('button', { name: 'Điểm danh' }))
      expect(setActiveTab).toHaveBeenCalledWith('attendance')
      fireEvent.click(screen.getByRole('button', { name: 'Báo cáo' }))
      expect(setActiveTab).toHaveBeenCalledWith('reports')
    })

    it('shows the parent information architecture without staff management tabs', () => {
      useAuthStore.setState({
        user: { id: 'parent-1', username: 'parent', fullName: 'Parent User', role: 'phuhuynh', status: 'ACTIVE', parishId: 'test-parish' }
      })
      render(<MobileBottomNav activeTab="home" setActiveTab={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Con tôi' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Điểm danh' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Thiếu nhi' })).not.toBeInTheDocument()
    })

    it('keeps the reports workspace available to phuta', () => {
      useAuthStore.setState({
        user: { id: 'assistant-1', username: 'assistant', fullName: 'Phụ tá', role: 'phuta', status: 'ACTIVE', parishId: 'test-parish' }
      })
      render(<MobileBottomNav activeTab={null} setActiveTab={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Báo cáo' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { current: 'page' })).not.toBeInTheDocument()
    })
  })

  describe('MobileGradeView', () => {
    it('switches between Cards, Daily Entry, and Comparison tabs', async () => {
      const handleViewReport = vi.fn()
      render(<MobileGradeView onViewReport={handleViewReport} />)

      // Default: Cards tab active
      expect(screen.getByText('Bảng Điểm Giáo Lý')).toBeInTheDocument()

      // Click Daily Entry tab
      const dailyBtn = screen.getByText('Hằng ngày')
      fireEvent.click(dailyBtn)
      expect(await screen.findByText('Nhập Điểm Hằng Ngày')).toBeInTheDocument()

      // Click Comparison tab
      const compBtn = screen.getByText('So sánh')
      fireEvent.click(compBtn)
      expect(await screen.findByText(/So Sánh Học Kỳ I vs Học Kỳ II/i)).toBeInTheDocument()
    })
  })

  describe('MobileNoticesView', () => {
    it('shows Add button and Edit button for admin users', () => {
      render(<MobileNoticesView />)

      expect(screen.getByText('Thêm')).toBeInTheDocument()
      expect(screen.getByText('Sửa')).toBeInTheDocument()
    })

    it('hides Add button and Edit button for non-admin users', () => {
      useAuthStore.setState({
        user: { id: 'glv-1', username: 'glv', fullName: 'GLV User', role: 'phuta', status: 'ACTIVE', parishId: 'test-parish' }
      })

      render(<MobileNoticesView />)

      expect(screen.queryByText('Thêm')).not.toBeInTheDocument()
      expect(screen.queryByText('Sửa')).not.toBeInTheDocument()
    })
  })

  describe('MobileStudentsView', () => {
    it('shows Promotion tab for admin/chunhiem and hides it for phuta', () => {
      const dummyHandlers = {
        onOpenAddStudent: vi.fn(),
        onImportStudents: vi.fn(),
        onEditStudent: vi.fn(),
        onViewReport: vi.fn(),
        onPrintReport: vi.fn(),
        onNavigateToClasses: vi.fn(),
        onSendReportCards: vi.fn(),
      }

      const { rerender } = render(<MobileStudentsView {...dummyHandlers} />)
      expect(screen.getByText('Thăng Tiến')).toBeInTheDocument()

      // Switch to phuta role
      useAuthStore.setState({
        user: { id: 'glv-2', username: 'phuta', fullName: 'Phu Ta User', role: 'phuta', status: 'ACTIVE', parishId: 'test-parish' }
      })

      rerender(<MobileStudentsView {...dummyHandlers} />)
      expect(screen.queryByText('Thăng Tiến')).not.toBeInTheDocument()
    })

    it('opens confirmation modal when clicking Send Report Cards button', () => {
      const handleSendCards = vi.fn()
      render(
        <MobileStudentsView
          onOpenAddStudent={vi.fn()}
          onImportStudents={vi.fn()}
          onEditStudent={vi.fn()}
          onViewReport={vi.fn()}
          onPrintReport={vi.fn()}
          onNavigateToClasses={vi.fn()}
          onSendReportCards={handleSendCards}
        />
      )

      const sendBtn = screen.getByText('Gửi Kết Quả Học Tập')
      fireEvent.click(sendBtn)

      // Confirm dialog should appear
      expect(screen.getByText('Bạn có chắc chắn muốn gửi kết quả học tập cho 0 thiếu nhi?')).toBeInTheDocument()
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
