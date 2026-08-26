import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DesktopAttendanceSummary } from '../../components/desktop/DesktopAttendanceSummary'
import { useStudentStore } from '../../stores/studentStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useClassStore } from '../../stores/classStore'
import { useFilterStore } from '../../stores/filterStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import type { Student, AttendanceRecord } from '../../types'

describe('DesktopAttendanceSummary Component Tests', () => {
  const mockStudents: Student[] = [
    {
      id: 'STU-1',
      code: 'TN001',
      holyName: 'Maria',
      fullName: 'Trần Thị Mai',
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      address: 'Xứ Đoàn',
      branch: 'AuNhi',
      classId: 'CLS-1',
      status: 'Đang học',
      parentName: 'Trần Văn Phụ',
      parentPhone: '0912345678',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
    {
      id: 'STU-2',
      code: 'TN002',
      holyName: 'Giuse',
      fullName: 'Lê Văn Nam',
      gender: 'Nam',
      dateOfBirth: '2015-02-02',
      address: 'Xứ Đoàn',
      branch: 'AuNhi',
      classId: 'CLS-1',
      status: 'Đang học',
      parentName: 'Lê Văn Mẹ',
      parentPhone: '0987654321',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
  ]

  const mockRecords: AttendanceRecord[] = [
    { id: 'ATT-1', studentId: 'STU-1', date: '2026-08-03', type: 'SundayMass', status: 'Present' },
    { id: 'ATT-2', studentId: 'STU-1', date: '2026-08-03', type: 'CatechismClass', status: 'Present' },
    { id: 'ATT-3', studentId: 'STU-1', date: '2026-08-07', type: 'EucharisticAdoration', status: 'Present' },

    { id: 'ATT-4', studentId: 'STU-2', date: '2026-08-03', type: 'SundayMass', status: 'AbsentUnexcused' },
    { id: 'ATT-5', studentId: 'STU-2', date: '2026-08-03', type: 'CatechismClass', status: 'AbsentUnexcused' },
  ]

  beforeEach(() => {
    useAcademicYearStore.setState({ currentYear: '2026-2027' })
    useStudentStore.setState({ students: mockStudents })
    useAttendanceStore.setState({ attendance: mockRecords })
    useClassStore.setState({
      classes: [{ id: 'CLS-1', name: 'Ấu Nhi 1', branchId: 'AuNhi', room: 'P101', academicYear: '2026-2027' }] as any,
    })
    useFilterStore.setState({ selectedClassId: 'CLS-1' })
  })

  it('renders header, KPI cards and matrix table', () => {
    render(<DesktopAttendanceSummary />)

    expect(screen.getByText('Tổng Hợp Chuyên Cần & Phân Tích Số Liệu')).toBeDefined()
    expect(screen.getByText('Chuyên Cần Chung')).toBeDefined()
    expect(screen.getByText('Tham Dự Thánh Lễ')).toBeDefined()
    expect(screen.getByText('Học Giáo Lý')).toBeDefined()
    expect(screen.getByText('Chầu / Sinh Hoạt')).toBeDefined()

    // Kiểm tra học sinh xuất hiện trên giao diện
    expect(screen.getAllByText(/Trần Thị Mai/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Lê Văn Nam/).length).toBeGreaterThan(0)
  })

  it('filters students in matrix table by search input', () => {
    render(<DesktopAttendanceSummary />)

    const searchInput = screen.getByPlaceholderText('Tìm theo tên hoặc mã học sinh...')
    fireEvent.change(searchInput, { target: { value: 'Mai' } })

    const table = screen.getByRole('table')
    expect(within(table).getByText(/Trần Thị Mai/)).toBeDefined()
    expect(within(table).queryByText(/Lê Văn Nam/)).toBeNull()
  })

  it('opens AttendanceHistoryModal when clicking Chi tiết button', () => {
    render(<DesktopAttendanceSummary />)

    const detailButtons = screen.getAllByText('Chi tiết')
    fireEvent.click(detailButtons[0])

    expect(screen.getAllByText(/Tỷ lệ chuyên cần chung/i).length).toBeGreaterThan(0)
    expect(screen.getByText('Đóng')).toBeDefined()
  })
})
