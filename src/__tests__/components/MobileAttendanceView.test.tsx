import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileAttendanceView } from '../../components/mobile/MobileAttendanceView'

const mocks = vi.hoisted(() => ({
  role: 'admin',
  selectedClassId: 'all',
  students: [] as any[],
  attendance: [] as any[],
  classes: [] as any[],
  setSelectedClassId: vi.fn(),
  batchSaveAttendance: vi.fn(),
  fetchPendingCount: vi.fn().mockResolvedValue(undefined),
  clearErrors: vi.fn(),
  pendingCount: 2,
  isSubmitting: false,
  error: null as string | null,
  lockError: null as string | null,
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ role: mocks.role }),
}))

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: (selector: (state: any) => unknown) => selector({ students: mocks.students }),
}))

vi.mock('../../stores/attendanceStore', () => ({
  useAttendanceStore: (selector: (state: any) => unknown) => selector({
    attendance: mocks.attendance,
    batchSaveAttendance: mocks.batchSaveAttendance,
    isSubmitting: mocks.isSubmitting,
    error: mocks.error,
    lockError: mocks.lockError,
    clearErrors: mocks.clearErrors,
  }),
}))

vi.mock('../../stores/leaveRequestStore', () => ({
  useLeaveRequestStore: (selector: (state: any) => unknown) => selector({
    pendingCount: mocks.pendingCount,
    fetchPendingCount: mocks.fetchPendingCount,
  }),
}))

vi.mock('../../stores/filterStore', () => ({
  useFilterStore: (selector: (state: any) => unknown) => selector({
    selectedClassId: mocks.selectedClassId,
    setSelectedClassId: mocks.setSelectedClassId,
  }),
}))

vi.mock('../../stores/classStore', () => ({
  useClassStore: (selector: (state: any) => unknown) => selector({
    getClassList: () => mocks.classes,
    findClassById: (id: string) => mocks.classes.find(classItem => classItem.id === id),
  }),
}))

vi.mock('../../utils/getDefaultDate', () => ({ getDefaultDate: () => '2026-08-23' }))
vi.mock('../../components/mobile/MobileLeaveRequests', () => ({ MobileLeaveRequests: () => <div>Leave requests</div> }))
vi.mock('../../components/mobile/MobileAttendanceSummaryView', () => ({ MobileAttendanceSummaryView: () => <div>Attendance summary</div> }))

const student = (id: string, holyName: string, fullName: string, classId = 'class-a') => ({
  id,
  code: `TN-${id}`,
  holyName,
  fullName,
  gender: 'Nam',
  dateOfBirth: '2015-01-01',
  parentName: 'Phụ huynh',
  parentPhone: '0900000000',
  address: 'Gia Tôn',
  branch: 'AuNhi',
  classId,
  status: 'Đang học',
})

describe('MobileAttendanceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'admin'
    mocks.selectedClassId = 'all'
    mocks.students = [
      student('1', 'Têrêsa', 'Đỗ Ngọc Bảo An'),
      student('2', 'Giuse', 'Nguyễn Hoàng Gia An'),
      student('3', 'Maria', 'Trần Bảo Ngọc', 'class-b'),
    ]
    mocks.attendance = []
    mocks.classes = [
      { id: 'class-a', name: 'Ấu Nhi 1A' },
      { id: 'class-b', name: 'Thiếu Nhi 1B' },
    ]
    mocks.pendingCount = 2
    mocks.isSubmitting = false
    mocks.error = null
    mocks.lockError = null
    mocks.batchSaveAttendance.mockResolvedValue({
      total: 2,
      successCount: 2,
      skippedCount: 0,
      conflictCount: 0,
      errorCount: 0,
      results: [],
    })
  })

  it('asks an admin to choose one class instead of rendering the parish-wide roster', async () => {
    render(<MobileAttendanceView />)

    expect(await screen.findByRole('heading', { name: 'Chọn lớp cần điểm danh' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chọn lớp Ấu Nhi 1A, 2 thiếu nhi' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chọn lớp Thiếu Nhi 1B, 1 thiếu nhi' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: /Danh sách điểm danh/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu điểm danh' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Chọn lớp Ấu Nhi 1A, 2 thiếu nhi' }))
    expect(mocks.setSelectedClassId).toHaveBeenCalledWith('class-a')
  })

  it('renders a compact, fully labelled exception-first roster and updates its status summary', async () => {
    mocks.selectedClassId = 'class-a'
    render(<MobileAttendanceView />)

    const roster = await screen.findByRole('list', { name: 'Danh sách điểm danh gồm 2 thiếu nhi' })
    expect(within(roster).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('group', { name: 'Trạng thái của Têrêsa Đỗ Ngọc Bảo An' })).toBeInTheDocument()

    const excusedButton = screen.getByRole('button', { name: 'Vắng có phép: Têrêsa Đỗ Ngọc Bảo An' })
    expect(excusedButton).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(excusedButton)
    expect(excusedButton).toHaveAttribute('aria-pressed', 'true')

    const statusSummary = screen.getByLabelText('Tổng hợp trạng thái hiện tại')
    expect(statusSummary.querySelector('.attendance-summary-item--present strong')).toHaveTextContent('1')
    expect(statusSummary.querySelector('.attendance-summary-item--excused strong')).toHaveTextContent('1')
    expect(screen.getByText('2 chưa lưu')).toBeInTheDocument()
  })

  it('only announces success after the asynchronous batch result resolves', async () => {
    mocks.selectedClassId = 'class-a'
    let resolveSave: (result: any) => void = () => undefined
    mocks.batchSaveAttendance.mockReturnValue(new Promise(resolve => { resolveSave = resolve }))
    render(<MobileAttendanceView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Lưu điểm danh' }))
    expect(screen.queryByText(/Đã lưu điểm danh cho/)).not.toBeInTheDocument()

    await act(async () => {
      resolveSave({
        total: 2,
        successCount: 2,
        skippedCount: 0,
        conflictCount: 0,
        errorCount: 0,
        results: [],
      })
    })

    expect(await screen.findByText('Đã lưu điểm danh cho 2 thiếu nhi.')).toBeInTheDocument()
    expect(mocks.batchSaveAttendance).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ studentId: '1', status: 'Present' }),
        expect.objectContaining({ studentId: '2', status: 'Present' }),
      ]),
      '2026-08-23',
      'SundayMass'
    )
  })

  it('keeps partial-success feedback explicit and preserves the online-leave marker', async () => {
    mocks.selectedClassId = 'class-a'
    mocks.attendance = [{
      id: 'attendance-1',
      studentId: '1',
      date: '2026-08-23',
      type: 'SundayMass',
      status: 'AbsentExcused',
      note: '[Đơn online] Gia đình xin phép',
    }]
    mocks.batchSaveAttendance.mockResolvedValue({
      total: 2,
      successCount: 1,
      skippedCount: 0,
      conflictCount: 1,
      errorCount: 0,
      results: [],
    })
    render(<MobileAttendanceView />)

    expect(await screen.findByText('Phép online')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu điểm danh' }))
    await waitFor(() => expect(screen.getByText('Đã lưu 1/2. Còn 1 mục cần kiểm tra.')).toBeInTheDocument())
  })
})
