import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LeaveRequestModal } from '../components/common/LeaveRequestModal'
import { DesktopSidebar } from '../components/desktop/DesktopSidebar'
import { DesktopLeaveRequests } from '../components/desktop/DesktopLeaveRequests'
import { useLeaveRequestStore } from '../stores/leaveRequestStore'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getLeaveRequests: vi.fn().mockResolvedValue([]),
      getPendingLeaveRequestsCount: vi.fn().mockResolvedValue({ pendingCount: 0 }),
      createLeaveRequest: vi.fn(),
      reviewLeaveRequest: vi.fn(),
      cancelLeaveRequest: vi.fn(),
    },
  }
})

describe('Leave Requests Frontend Components & Store Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLeaveRequestStore.setState({
      requests: [],
      loading: false,
      error: null,
      pendingCount: 0,
    })
  })

  describe('LeaveRequestModal', () => {
    it('renders form elements and allows selecting session types', () => {
      render(
        <LeaveRequestModal
          isOpen={true}
          onClose={vi.fn()}
          studentId="st-1"
          studentName="Nguyễn Văn A"
          holyName="Giuse"
          className="Ấu 1"
        />
      )

      expect(screen.getByText(/Đơn Xin Phép Nghỉ/i)).toBeDefined()
      expect(screen.getByText(/Giuse/i)).toBeDefined()
      expect(screen.getByText(/Thánh Lễ Chúa Nhật/i)).toBeDefined()
      expect(screen.getByText(/Giờ Học Giáo Lý/i)).toBeDefined()
      expect(screen.getByText(/Chầu Thánh Thể/i)).toBeDefined()
    })

    it('submits leave request via store when valid', async () => {
      const mockCreated = {
        id: 'lrq-123',
        studentId: 'st-1',
        studentName: 'Nguyễn Văn A',
        date: '2026-08-16',
        sessionTypes: ['SundayMass', 'CatechismClass'] as any,
        reason: 'Em bị sốt cần nghỉ dưỡng bệnh',
        status: 'PENDING' as const,
        parentName: 'Phụ Huynh Test',
        parentPhone: '0901234567',
        createdAt: new Date().toISOString(),
      }
      vi.mocked(api.createLeaveRequest).mockResolvedValue(mockCreated)

      const onSuccess = vi.fn()
      const onClose = vi.fn()

      render(
        <LeaveRequestModal
          isOpen={true}
          onClose={onClose}
          studentId="st-1"
          studentName="Nguyễn Văn A"
          holyName="Giuse"
          onSuccess={onSuccess}
        />
      )

      const textarea = screen.getByPlaceholderText(/VD: Em bị sốt/i)
      fireEvent.change(textarea, { target: { value: 'Em bị sốt cần nghỉ dưỡng bệnh' } })

      const submitBtn = screen.getByRole('button', { name: /Gửi Đơn Xin Phép/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(api.createLeaveRequest).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
      })
    })
  })

  describe('DesktopSidebar Leave Request Tab & Badge', () => {
    it('shows Duyệt Nghỉ Phép with pending badge when pendingCount > 0', async () => {
      vi.mocked(api.getPendingLeaveRequestsCount).mockResolvedValue({ pendingCount: 3 })
      useAuthStore.setState({
        user: { id: 'glv-1', username: 'glv1', role: 'chunhiem', parishId: 'gia-ton' } as any,
        isAuthenticated: true,
      })
      useLeaveRequestStore.setState({ pendingCount: 3 })

      render(
        <DesktopSidebar
          activeTab="dashboard"
          setActiveTab={vi.fn()}
          selectedBranchId="all"
          setSelectedBranchId={vi.fn()}
          selectedClassId="all"
          setSelectedClassId={vi.fn()}
          classes={[]}
          branches={{}}
        />
      )

      expect(screen.getByText('Điểm Danh')).toBeDefined()
      expect(screen.getByText('3')).toBeDefined()
    })
  })

  describe('DesktopLeaveRequests component', () => {
    it('renders leave requests table and review actions for teacher/admin', async () => {
      useAuthStore.setState({
        user: { id: 'admin-1', username: 'admin', role: 'admin', parishId: 'gia-ton' } as any,
        isAuthenticated: true,
      })

      const mockRequests = [
        {
          id: 'lrq-1',
          studentId: 'st-1',
          classId: 'cl-1',
          studentName: 'Trần Văn B',
          holyName: 'Phêrô',
          className: 'Thiếu 2',
          parentName: 'Trần Văn Cha',
          parentPhone: '0988776655',
          date: '2026-08-16',
          sessionTypes: ['SundayMass', 'CatechismClass'] as any,
          reason: 'Về quê ăn giỗ',
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      vi.mocked(api.getLeaveRequests).mockResolvedValue(mockRequests)

      render(<DesktopLeaveRequests />)

      await waitFor(() => {
        expect(screen.getByText(/Trần Văn B/i)).toBeDefined()
      })

      expect(screen.getByText(/Phêrô/i)).toBeDefined()
      expect(screen.getByText(/Về quê ăn giỗ/i)).toBeDefined()
      expect(screen.getAllByText(/Chờ duyệt/i).length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /^Duyệt$/i })).toBeDefined()
    })
  })
})
