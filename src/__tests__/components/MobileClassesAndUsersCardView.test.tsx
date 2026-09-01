import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { DesktopClasses } from '../../components/desktop/DesktopClasses'
import { UserManagementPage } from '../../components/desktop/UserManagementPage'
import { useAuthStore } from '../../stores/authStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'

vi.mock(import('../../lib/api'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      ...actual.api,
      getUsers: vi.fn().mockResolvedValue([
        {
          id: 'u1',
          username: 'glv.an',
          fullName: 'Nguyễn Văn An',
          holyName: 'Phêrô',
          role: 'chunhiem',
          status: 'ACTIVE',
          phone: '0901234567',
          assignedClasses: ['c1'],
          lastLoginAt: '2026-08-25T10:00:00Z',
        },
        {
          id: 'u2',
          username: 'parent.binh',
          fullName: 'Trần Văn Bình',
          holyName: 'Giuse',
          role: 'phuhuynh',
          status: 'ACTIVE',
          phone: '0912345678',
          assignedClasses: [],
          lastLoginAt: null,
        },
      ]),
      getAvailableTeachers: vi.fn().mockResolvedValue([]),
    },
  }
})

vi.mock(import('@tanstack/react-router'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

describe('MobileClasses and UserManagement Responsive Views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: { id: 'admin-1', username: 'admin', fullName: 'Admin User', role: 'admin', status: 'ACTIVE', parishId: 'test-parish' },
    })
    useClassStore.setState({
      classes: [
        {
          id: 'c1',
          code: 'CC-01',
          name: 'Chiên Con 1',
          branchId: 'chien',
          branchName: 'Chiên Con',
          academicYearId: '2025-2026',
          studentCount: 24,
          room: 'Phòng 101',
          homeroomTeacher: { id: 't1', fullName: 'Nguyễn Văn A' },
          assistants: [{ id: 't2', fullName: 'Trần Thị B' }],
        },
        {
          id: 'c2',
          code: 'AU-01',
          name: 'Ấu Nhi 1',
          branchId: 'au',
          branchName: 'Ấu Nhi',
          academicYearId: '2025-2026',
          studentCount: 30,
          room: 'Phòng 102',
          homeroomTeacher: { id: 't3', fullName: 'Lê Văn C' },
          assistants: [],
        },
      ] as any,
      branches: [
        { id: 'chien', name: 'Chiên Con' },
        { id: 'au', name: 'Ấu Nhi' },
      ] as any,
      loading: false,
      fetchClasses: vi.fn(),
      fetchBranches: vi.fn(),
    })
    useAcademicYearStore.setState({
      academicYears: [
        { id: '2025-2026', startDate: '2025-09-01', endDate: '2026-05-31', status: 'OPEN' },
      ] as any,
      fetchAcademicYears: vi.fn(),
    })
  })

  it('renders DesktopClasses with both mobile card list and desktop table', async () => {
    const onViewClassStudents = vi.fn()
    await act(async () => {
      render(<DesktopClasses onViewClassStudents={onViewClassStudents} />)
    })

    expect(screen.getAllByText('Chiên Con 1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Ấu Nhi 1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('24 thiếu nhi')).toBeInTheDocument()
    expect(screen.getByText('30 thiếu nhi')).toBeInTheDocument()
    const viewButtons = screen.getAllByRole('button', { name: /Xem Danh Sách/i })
    expect(viewButtons.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(viewButtons[0])
    expect(onViewClassStudents).toHaveBeenCalledWith('c1')
  })

  it('does not expose class mutations to catechists', async () => {
    useAuthStore.setState({
      user: { id: 'glv-1', username: 'glv', fullName: 'GLV User', role: 'chunhiem', status: 'ACTIVE', parishId: 'test-parish' },
    })

    await act(async () => {
      render(<DesktopClasses embedded />)
    })

    expect(screen.queryByRole('button', { name: /Sửa lớp/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Xóa lớp/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Thêm Lớp/i })).not.toBeInTheDocument()
  })

  it('renders UserManagementPage with both mobile card list and desktop table', async () => {
    await act(async () => {
      render(<UserManagementPage />)
    })

    expect(screen.getAllByText('Nguyễn Văn An').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Trần Văn Bình').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Đặt Mật Khẩu/i).length).toBeGreaterThanOrEqual(1)
  })
})
