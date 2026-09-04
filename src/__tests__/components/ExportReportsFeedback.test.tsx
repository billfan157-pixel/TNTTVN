import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DesktopReports } from '../../components/desktop/DesktopReports'
import { useToastStore } from '../../stores/toastStore'
import * as reportExporter from '../../services/reportExporter'

const mockStudents = [
  {
    id: 'st-1',
    fullName: 'Nguyễn Văn A',
    saintName: 'Giuse',
    classId: 'c-1',
    gender: 'male',
    dateOfBirth: '2015-01-01',
    status: 'Đang học',
  },
]

const mockStudentState = {
  students: mockStudents,
}

const mockGradeState = {
  grades: {},
  calculateStudentAvg: () => ({ avg: 8.5 }),
}

const mockClassState = {
  classes: [],
  branches: [],
  academicYears: [],
  getClassList: () => [],
  findClassById: () => ({ id: 'c-1', name: 'Ấu Nhi 1' }),
}

const mockFilterState = {
  selectedSemester: 1,
}

const mockAttendanceState = {
  attendance: {},
}

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: (selector?: any) => (selector ? selector(mockStudentState) : mockStudentState),
}))

vi.mock('../../stores/gradeStore', () => ({
  useGradeStore: (selector?: any) => (selector ? selector(mockGradeState) : mockGradeState),
}))

vi.mock('../../stores/classStore', () => ({
  useClassStore: (selector?: any) => (selector ? selector(mockClassState) : mockClassState),
}))

vi.mock('../../stores/filterStore', () => ({
  useFilterStore: (selector?: any) => (selector ? selector(mockFilterState) : mockFilterState),
}))

vi.mock('../../stores/attendanceStore', () => ({
  useAttendanceStore: (selector?: any) => (selector ? selector(mockAttendanceState) : mockAttendanceState),
}))

const mockAuthState = {
  can: () => true,
  user: { role: 'admin' },
}

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}))

describe('DesktopReports Error Feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
  })

  it('triggers toast error notification instead of confirm dialog when export fails', () => {
    // Force exportCsv to throw
    vi.spyOn(reportExporter, 'exportCsv').mockImplementation(() => {
      throw new Error('Disk write failure')
    })

    render(<DesktopReports onPrintReport={vi.fn()} />)

    // Find export CSV button
    const exportCsvButtons = screen.getAllByRole('button', { name: /Xuất CSV/i })
    expect(exportCsvButtons.length).toBeGreaterThan(0)

    fireEvent.click(exportCsvButtons[0])

    // Toast store should have received error toast
    const toasts = useToastStore.getState().toasts
    expect(toasts.length).toBe(1)
    expect(toasts[0].message).toBe('Lỗi khi xuất báo cáo! Vui lòng thử lại.')
    expect(toasts[0].type).toBe('error')

    // Confirm dialog should NOT be shown
    expect(screen.queryByRole('dialog', { name: /Lỗi xuất báo cáo/i })).toBeNull()
  })
})
