import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ParentDashboard } from '../../components/common/ParentDashboard'
import { api } from '../../lib/api'
import type { ParentChild, ReportCardDTO, ParishNotice } from '../../types'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../../lib/api', () => ({
  api: {
    getMyChildren: vi.fn(),
    getStudentReportCard: vi.fn(),
    getLeaveRequests: vi.fn().mockResolvedValue([]),
    getPendingLeaveRequestsCount: vi.fn().mockResolvedValue({ pendingCount: 0 }),
    cancelLeaveRequest: vi.fn(),
  },
}))

const mockChildren: ParentChild[] = [
  {
    id: 'child-1', code: 'TN001', holyName: 'Anna', fullName: 'Nguyễn Thị Lan',
    gender: 'female', dateOfBirth: '2015-05-10', branch: 'LE1',
    status: 'ACTIVE', classId: 'cls-1', className: 'Lớp 1', classCode: 'L1',
  },
  {
    id: 'child-2', code: 'TN002', holyName: 'Gioan', fullName: 'Nguyễn Văn Minh',
    gender: 'male', dateOfBirth: '2013-08-20', branch: 'LE3',
    status: 'ACTIVE', classId: 'cls-2', className: 'Lớp 3', classCode: 'L3',
  },
]

const mockReport: ReportCardDTO = {
  student: { id: 'child-1', code: 'TN001', holyName: 'Anna', fullName: 'Nguyễn Thị Lan', className: 'Lớp 1' },
  academicYear: '2025-2026',
  grades: [
    { semester: 1, scoreOral: 8, score15m: 7, score1Period: 8, scoreMidterm: 8, scoreFinal: 9, gpa: 8.2 },
    { semester: 2, scoreOral: 9, score15m: 8, score1Period: 9, scoreMidterm: 9, scoreFinal: 10, gpa: 9.1 },
  ],
  attendanceSummary: { massPresentCount: 18, massTotalCount: 20, catechismPresentCount: 19, catechismTotalCount: 20, overallAttendanceRate: 92.5 },
  promotion: { status: 'PROMOTED', gpa: 8.65, attendanceRate: 92.5, isOverridden: false },
}

const mockNotices: ParishNotice[] = [
  { id: 'n1', title: 'Thông báo lễ khai giảng', content: 'Nội dung 1', date: '2026-08-01', author: 'Ban Giáo Lý', priority: 'important' },
  { id: 'n2', title: 'Lịch họp phụ huynh', content: 'Nội dung 2', date: '2026-08-05', author: 'Cha Chánh Xứ', priority: 'normal' },
]

vi.mock('../../stores/noticeStore', () => ({
  useNoticeStore: (selector?: any) => selector ? selector({ notices: mockNotices }) : { notices: mockNotices },
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: { getState: () => ({ resolveActiveYear: () => '2025-2026' }) },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { fullName: 'Nguyễn Văn Ba' } }),
}))

describe('ParentDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigateMock.mockClear()
  })

  it('renders greeting with parent name and child summary after loading', async () => {
    vi.mocked(api.getMyChildren).mockResolvedValue(mockChildren)
    vi.mocked(api.getStudentReportCard).mockResolvedValue(mockReport)

    await act(async () => { render(<ParentDashboard />) })

    expect(screen.getByText(/Chào, Nguyễn Văn Ba/)).toBeDefined()
    expect(screen.getAllByRole('tab', { name: 'Anna Nguyễn Thị Lan' }).length).toBeGreaterThan(0)
    expect(screen.getByText('9.1')).toBeDefined()
    expect(screen.getByText('92.5%')).toBeDefined()
    expect(screen.getByText(/Được lên lớp/)).toBeDefined()
    expect(screen.getByText('Thông báo lễ khai giảng')).toBeDefined()
    expect(api.getMyChildren).toHaveBeenCalledTimes(1)
    expect(api.getStudentReportCard).toHaveBeenCalledWith('child-1', '2025-2026')
  })

  it('renders empty state when no children linked', async () => {
    vi.mocked(api.getMyChildren).mockResolvedValue([])

    await act(async () => { render(<ParentDashboard />) })

    expect(screen.getByText(/Chưa có thiếu nhi nào được liên kết/)).toBeDefined()
  })

  it('switches child when clicking a child chip', async () => {
    vi.mocked(api.getMyChildren).mockResolvedValue(mockChildren)
    vi.mocked(api.getStudentReportCard).mockResolvedValue(mockReport)

    await act(async () => { render(<ParentDashboard />) })
    expect(api.getStudentReportCard).toHaveBeenCalledWith('child-1', '2025-2026')

    await act(async () => {
      screen.getByRole('tab', { name: 'Gioan Nguyễn Văn Minh' }).click()
    })

    expect(api.getStudentReportCard).toHaveBeenCalledWith('child-2', '2025-2026')
  })

  it('renders error state when children fetch fails', async () => {
    vi.mocked(api.getMyChildren).mockRejectedValue(new Error('network'))

    await act(async () => { render(<ParentDashboard />) })

    expect(screen.getByText(/Không thể tải danh sách con/)).toBeDefined()
  })

  it('navigates to /parent when detail button clicked', async () => {
    vi.mocked(api.getMyChildren).mockResolvedValue(mockChildren)
    vi.mocked(api.getStudentReportCard).mockResolvedValue(mockReport)

    await act(async () => { render(<ParentDashboard />) })

    await act(async () => {
      screen.getByText(/Xem Chi Tiết & In Kết Quả Học Tập/).click()
    })
    expect(navigateMock).toHaveBeenCalledWith({ to: '/parent' })
  })
})
