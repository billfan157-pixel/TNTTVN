import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ParentPage } from '../../pages/ParentPage'

const mockSelectChild = vi.fn()
const mockFetchRequests = vi.fn()
const mockCancelRequest = vi.fn()

const mockChildren = [
  { id: 'child-1', code: 'TN001', holyName: 'Maria', fullName: 'Nguyễn Thị Hoa', branch: 'AuNhi', className: 'Ấu Nhi 1', status: 'ACTIVE' },
  { id: 'child-2', code: 'TN002', holyName: 'Giuse', fullName: 'Nguyễn Văn Nam', branch: 'ThieuNhi', className: 'Thiếu Nhi 1', status: 'ACTIVE' },
]

const mockReport = {
  student: { id: 'child-1', code: 'TN001', holyName: 'Maria', fullName: 'Nguyễn Thị Hoa', className: 'Ấu Nhi 1' },
  academicYear: '2025-2026',
  grades: [
    { semester: 1, scoreOral: 8, score15m: 9, score1Period: 8, scoreMidterm: 8.5, scoreFinal: 9, gpa: 8.6 },
    { semester: 2, scoreOral: 9, score15m: 8.5, score1Period: 9, scoreMidterm: 9, scoreFinal: 9.5, gpa: 9.1 },
  ],
  yearSummary: { gpa: 8.6, classification: 'Giỏi' },
  attendanceSummary: {
    massPresentCount: 18,
    massTotalCount: 20,
    catechismPresentCount: 19,
    catechismTotalCount: 20,
    overallAttendanceRate: 92.5,
  },
  promotion: { status: 'PROMOTED', gpa: 8.85, attendanceRate: 92.5, isOverridden: false },
}

const { portalState, printMock } = vi.hoisted(() => ({
  portalState: {
    selectedId: 'child-1',
    report: null as any,
  },
  printMock: vi.fn(),
}))

vi.mock('../../hooks/useParentPortal', () => ({
  useParentPortal: () => ({
    children: mockChildren,
    loading: false,
    error: null,
    selectedId: portalState.selectedId,
    report: portalState.report,
    reportLoading: false,
    reportError: null,
    selectChild: mockSelectChild,
  }),
}))

vi.mock('../../services/reportExportService', () => ({
  ReportExportService: { print: (...args: unknown[]) => printMock(...args) },
}))

vi.mock('../../utils/pdfGenerator', () => ({
  generateParentReportCardHTML: (report: unknown) => `HTML:${(report as { student: { id: string } }).student.id}`,
}))

vi.mock('../../stores/leaveRequestStore', () => ({
  useLeaveRequestStore: (selector: any) => {
    const state = {
      requests: [
        {
          id: 'req-1',
          studentId: 'child-1',
          date: '2026-09-06',
          sessionTypes: ['SundayMass'],
          reason: 'Về quê thăm ông bà',
          status: 'PENDING',
        },
      ],
      fetchRequests: mockFetchRequests,
      cancelRequest: mockCancelRequest,
    }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

vi.mock('../../components/common/LeaveRequestModal', () => ({
  LeaveRequestModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="leave-modal">Leave Request Modal</div> : null,
}))

describe('ParentPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    portalState.selectedId = 'child-1'
    portalState.report = mockReport
  })

  it('renders page header and child cards', async () => {
    await act(async () => {
      render(<ParentPage />)
    })

    expect(screen.getByText('Con Của Tôi')).toBeDefined()
    expect(screen.getByText('Nguyễn Thị Hoa')).toBeDefined()
    expect(screen.getByText('Nguyễn Văn Nam')).toBeDefined()
  })

  it('calls selectChild when a child card is clicked', async () => {
    await act(async () => {
      render(<ParentPage />)
    })

    const secondChildBtn = screen.getByText('Nguyễn Văn Nam').closest('button')
    expect(secondChildBtn).toBeDefined()
    fireEvent.click(secondChildBtn!)

    expect(mockSelectChild).toHaveBeenCalledWith('child-2')
  })

  it('renders report card details for selected child', async () => {
    await act(async () => {
      render(<ParentPage />)
    })

    expect(screen.getAllByText('8.6').length).toBeGreaterThan(0)
    expect(screen.getAllByText('9.1').length).toBeGreaterThan(0)
    expect(screen.getByText('92.5%')).toBeDefined()
    expect(screen.getByText(/Được lên lớp/)).toBeDefined()
  })

  it('opens leave request modal when clicking Xin Phép Nghỉ', async () => {
    await act(async () => {
      render(<ParentPage />)
    })

    const leaveBtn = screen.getByRole('button', { name: /Xin Phép Nghỉ/ })
    fireEvent.click(leaveBtn)

    expect(screen.getByTestId('leave-modal')).toBeDefined()
  })

  it('calls cancelRequest when clicking Hủy đơn on pending leave request', async () => {
    await act(async () => {
      render(<ParentPage />)
    })

    const cancelBtn = screen.getByRole('button', { name: /Hủy đơn/ })
    fireEvent.click(cancelBtn)

    expect(mockCancelRequest).toHaveBeenCalledWith('req-1')
  })

  it('FE-F2: in đúng phiếu điểm của thiếu nhi đang chọn', async () => {
    await act(async () => {
      render(<ParentPage />)
    })

    fireEvent.click(screen.getByRole('button', { name: /In Kết Quả Học Tập/ }))

    expect(printMock).toHaveBeenCalledTimes(1)
    expect(printMock.mock.calls[0][0]).toBe('HTML:child-1')
  })

  it('FE-F2: không in phiếu điểm cũ khi DTO thuộc thiếu nhi khác đang chọn', async () => {
    portalState.selectedId = 'child-2'
    // report vẫn là DTO của child-1 (ví dụ: report của lựa chọn trước còn sót lại)
    await act(async () => {
      render(<ParentPage />)
    })

    fireEvent.click(screen.getByRole('button', { name: /In Kết Quả Học Tập/ }))

    expect(printMock).not.toHaveBeenCalled()
  })
})
