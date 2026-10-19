import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MobileAttendanceSummaryView } from '../../components/mobile/MobileAttendanceSummaryView'
import { useStudentStore } from '../../stores/studentStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useClassStore } from '../../stores/classStore'
import { useFilterStore } from '../../stores/filterStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import type { Student } from '../../types'

const student: Student = {
  id: 'SUMMARY-STUDENT', code: 'TN001', holyName: 'Maria', fullName: 'Trần Thị Mai',
  gender: 'Nữ', dateOfBirth: '2015-01-01', address: '', branch: 'AuNhi', classId: 'SUMMARY-CLASS',
  status: 'Đang học', parentName: '', parentPhone: '',
}

describe('Mobile attendance summary evidence states', () => {
  beforeEach(() => {
    useAcademicYearStore.setState({ currentYear: '2026-2027' })
    useStudentStore.setState({ students: [student] })
    useAttendanceStore.setState({ attendance: [] })
    useClassStore.setState({ classes: [{ id: 'SUMMARY-CLASS', name: 'Ấu Nhi 1', branch: 'AuNhi', academicYearId: '2026-2027' }] as any })
    useFilterStore.setState({ selectedClassId: 'SUMMARY-CLASS' })
  })

  it('does not present missing records as a percentage or a safe attendance result', () => {
    render(<MobileAttendanceSummaryView />)
    expect(screen.getAllByText('Chưa có buổi được ghi nhận').length).toBeGreaterThan(0)
    expect(screen.queryByText(/100%/)).toBeNull()
    expect(screen.queryByText('Đều đạt chuẩn')).toBeNull()
    expect(screen.getByText('Chưa có điểm danh')).toBeDefined()
  })

  it('keeps the empty student history neutral as well', () => {
    render(<MobileAttendanceSummaryView />)
    fireEvent.click(screen.getByRole('button', { name: /Trần Thị Mai/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(/100%/)).toBeNull()
    expect(within(dialog).getByText(/Chưa có điểm danh/)).toBeDefined()
  })

  it('still displays a recorded 100 percent result', () => {
    useAttendanceStore.setState({ attendance: [{ id: 'RECORDED', studentId: student.id, date: '2026-09-06', type: 'SundayMass', status: 'Present' }] })
    render(<MobileAttendanceSummaryView />)
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0)
    expect(screen.getByText('Đều đạt chuẩn')).toBeDefined()
    expect(screen.getByText('Giáo lý: Chưa ghi nhận')).toBeDefined()
  })
})
