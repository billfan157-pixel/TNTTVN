import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DesktopAttendanceGrid } from '../../components/desktop/DesktopAttendanceGrid'

const mockNavigate = vi.fn()
let mockSearchParams: Record<string, any> = {}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearchParams,
}))

const authState = {
  can: () => true,
  role: 'admin',
  user: { id: 'admin-a', parishId: 'gia-ton' },
}
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authState,
}))

const studentStoreState = { students: [] as any[] }
vi.mock('../../stores/studentStore', () => ({
  useStudentStore: (selector: any) => {
    const state = studentStoreState
    return typeof selector === 'function' ? selector(state) : state
  },
}))

const attendanceStoreState = {
  attendance: [] as any[],
  batchSaveAttendance: vi.fn(),
}
vi.mock('../../stores/attendanceStore', () => ({
  useAttendanceStore: (selector: any) => {
    return typeof selector === 'function' ? selector(attendanceStoreState) : attendanceStoreState
  },
}))

const mockFetchPendingCount = vi.fn()
const leaveRequestStoreState = {
  pendingCount: 3,
  fetchPendingCount: mockFetchPendingCount,
}

const mockSetSelectedClassId = vi.fn()
const filterStoreState = {
  selectedClassId: 'c1',
  setSelectedClassId: mockSetSelectedClassId,
}

const classStoreState = {
  classes: [{ id: 'c1', name: 'Khai Tâm 1', branch: 'Ấu Nhi' }],
  findClassById: () => ({ id: 'c1', name: 'Khai Tâm 1', branch: 'Ấu Nhi' }),
}

vi.mock('../../stores/leaveRequestStore', () => ({
  useLeaveRequestStore: (selector: any) => {
    return typeof selector === 'function' ? selector(leaveRequestStoreState) : leaveRequestStoreState
  },
}))

vi.mock('../../stores/classStore', () => ({
  getFilteredClassList: (classes: any[]) => classes,
  scopeClassesForAssignedWrites: (classes: any[]) => classes,
  useClassStore: (selector: any) => {
    return typeof selector === 'function' ? selector(classStoreState) : classStoreState
  },
}))

vi.mock('../../stores/filterStore', () => ({
  useFilterStore: (selector: any) => {
    return typeof selector === 'function' ? selector(filterStoreState) : filterStoreState
  },
}))

vi.mock('../../components/desktop/DesktopAttendanceSummary', () => ({
  DesktopAttendanceSummary: () => <div data-testid="attendance-summary">Attendance Summary View</div>,
}))

vi.mock('../../components/desktop/DesktopLeaveRequests', () => ({
  DesktopLeaveRequests: () => <div data-testid="leave-requests">Leave Requests View</div>,
}))

describe('DesktopAttendanceGrid URL Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = {}
    studentStoreState.students = []
    attendanceStoreState.attendance = []
    authState.user = { id: 'admin-a', parishId: 'gia-ton' }
  })

  it('defaults to summary sub-tab when tab param is missing', async () => {
    mockSearchParams = {}
    await act(async () => {
      render(<DesktopAttendanceGrid />)
    })

    expect(screen.getByTestId('attendance-summary')).toBeDefined()
  })

  it('renders leave requests when tab=leave-requests in URL', async () => {
    mockSearchParams = { tab: 'leave-requests' }
    await act(async () => {
      render(<DesktopAttendanceGrid />)
    })

    expect(screen.getByTestId('leave-requests')).toBeDefined()
  })

  it('navigates with tab=leave-requests when pending requests banner is clicked', async () => {
    mockSearchParams = { tab: 'summary' }
    await act(async () => {
      render(<DesktopAttendanceGrid />)
    })

    const pendingBtn = screen.getByText(/đơn xin nghỉ chờ duyệt/)
    fireEvent.click(pendingBtn)

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/attendance',
        replace: true,
      })
    )
  })

  it('retains an edited status when an unchanged attendance read arrives before save', async () => {
    mockSearchParams = { tab: 'attendance', date: '2026-10-04', type: 'SundayMass' }
    studentStoreState.students = [{ id: 's1', classId: 'c1', fullName: 'Maria Test', saintName: 'Maria', code: 'S1' }]
    attendanceStoreState.batchSaveAttendance.mockResolvedValue({ results: [], acknowledgement: 'server' })
    const view = render(<DesktopAttendanceGrid />)
    fireEvent.click(screen.getByRole('radio', { name: 'Vắng' }))
    expect(screen.getByRole('radio', { name: 'Vắng' })).toHaveAttribute('aria-checked', 'true')
    attendanceStoreState.attendance = [{ id: 'a1', studentId: 's1', date: '2026-10-04', type: 'SundayMass', status: 'Present', note: '', version: 2 }]
    view.rerender(<DesktopAttendanceGrid />)
    expect(screen.getByRole('radio', { name: 'Vắng' })).toHaveAttribute('aria-checked', 'true')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Lưu Điểm Danh' })) })
    expect(attendanceStoreState.batchSaveAttendance).toHaveBeenCalledWith(
      [expect.objectContaining({ studentId: 's1', status: 'AbsentUnexcused' })], '2026-10-04', 'SundayMass')
  })

  it('hydrates a changed server row and never carries an edit into another actor or date', () => {
    mockSearchParams = { tab: 'attendance', date: '2026-10-04', type: 'SundayMass' }
    studentStoreState.students = [{ id: 's1', classId: 'c1', fullName: 'Maria Test', saintName: 'Maria', code: 'S1' }]
    const view = render(<DesktopAttendanceGrid />)
    fireEvent.click(screen.getByRole('radio', { name: 'Vắng' }))
    attendanceStoreState.attendance = [{ id: 'a1', studentId: 's1', date: '2026-10-04', type: 'SundayMass', status: 'AbsentExcused', note: 'Approved leave', version: 2 }]
    view.rerender(<DesktopAttendanceGrid />)
    expect(screen.getByRole('radio', { name: 'Có phép' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Vắng' }))
    authState.user = { id: 'admin-b', parishId: 'gia-ton' }
    view.rerender(<DesktopAttendanceGrid />)
    expect(screen.getByRole('radio', { name: 'Có phép' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Vắng' }))
    mockSearchParams = { ...mockSearchParams, date: '2026-10-11' }
    view.rerender(<DesktopAttendanceGrid />)
    expect(screen.getByRole('radio', { name: 'Có mặt' })).toHaveAttribute('aria-checked', 'true')
  })
})
