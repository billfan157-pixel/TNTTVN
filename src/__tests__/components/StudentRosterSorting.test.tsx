import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopStudentList } from '../../components/desktop/DesktopStudentList'
import { MobileStudentsView } from '../../components/mobile/MobileStudentsView'
import { useAuthStore } from '../../stores/authStore'
import { useClassStore } from '../../stores/classStore'
import { useFilterStore } from '../../stores/filterStore'
import { useStudentStore } from '../../stores/studentStore'
import type { Student } from '../../types'

// Keep class CRUD out of roster tests; exercise the real view switch, stores and sorters.
vi.mock('../../components/desktop/DesktopClasses', () => ({ DesktopClasses: () => null }))

const names = ['An', 'Ân', 'Bình', 'Dũng', 'Đức', 'Hà',
  ...Array.from({ length: 54 }, (_, i) => `Trần ${String(i + 1).padStart(2, '0')}`)]
const students: Student[] = names.map((fullName, i) => ({
  id: `student-${i}`, code: `TN-${i}`, fullName,
  // Holy names and input order intentionally disagree with the full-name order.
  holyName: i === 0 ? 'Phêrô' : 'Anna',
  classId: 'class-1', branch: 'AuNhi', status: 'Đang học', gender: 'Nam',
  dateOfBirth: '2018-01-01', parentName: '', parentPhone: '', address: '',
  createdAt: '', updatedAt: '',
}))

beforeEach(() => {
  useAuthStore.setState({ user: {
    id: 'admin-sort', username: 'admin-sort', fullName: 'Admin', role: 'admin',
    status: 'ACTIVE', parishId: 'test-parish',
  } })
  useClassStore.setState({ classes: [{
    id: 'class-1', code: 'AU-1', name: 'Ấu Nhi 1', branchId: 'AuNhi', branchName: 'Ấu Nhi',
    academicYearId: '2026-2027', academicYear: '2026-2027', room: '',
    homeroomTeacher: null, assistants: [], studentCount: 60, parishId: 'test-parish',
    createdAt: '', updatedAt: '', updatedBy: null,
  }] })
  useFilterStore.setState({ selectedClassId: 'class-1', selectedBranchId: 'all', searchQuery: '' })
  useStudentStore.setState({
    students: [...students].reverse(), pagination: { page: 1, limit: 50, total: 60 },
  })
})

describe.each(['desktop', 'mobile'] as const)('%s roster alphabetical default', mode => {
  const renderRoster = () => {
    const handlers = { onEditStudent: vi.fn(), onViewReport: vi.fn() }
    return render(mode === 'desktop'
      ? <DesktopStudentList {...handlers} onViewPhotoCard={vi.fn()} />
      : <MobileStudentsView {...handlers} workspace="students" onWorkspaceChange={vi.fn()}
          onViewClassStudents={vi.fn()} onPrintReport={vi.fn()} />)
  }

  const displayedNames = () => screen.queryAllByText(/^(An|Ân|Bình|Dũng|Đức|Hà|Trần \d{2})$/)
    .map(node => node.textContent)

  it('shows matching students while searching from the class grid and restores the grid when cleared', () => {
    useFilterStore.setState({ selectedClassId: 'all' })
    useStudentStore.setState({ students: [
      { ...students[0], fullName: 'Nguyễn Đình Đức', holyName: 'Giuse', classId: 'class-other' },
      { ...students[1], fullName: 'Trần Văn Bình' },
    ] })
    renderRoster()
    expect(screen.getByRole('region', { name: 'Lớp học và phân lớp' })).toBeInTheDocument()
    expect(screen.queryByText('Nguyễn Đình Đức')).not.toBeInTheDocument()
    const search = mode === 'desktop'
      ? screen.getByPlaceholderText('Tìm theo tên, mã thiếu nhi...')
      : screen.getByLabelText('Tìm thiếu nhi')

    fireEvent.change(search, { target: { value: 'duc giuse' } })
    expect(screen.getByText('Nguyễn Đình Đức')).toBeInTheDocument()
    expect(screen.queryByText('Trần Văn Bình')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Lớp học và phân lớp' })).not.toBeInTheDocument()
    expect(useFilterStore.getState().selectedClassId).toBe('all')

    fireEvent.change(search, { target: { value: 'khong ton tai' } })
    expect(screen.queryByText('Nguyễn Đình Đức')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Lớp học và phân lớp' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Xóa tìm kiếm'))
    expect(screen.getByRole('region', { name: 'Lớp học và phân lớp' })).toBeInTheDocument()
    expect(screen.queryByText('Nguyễn Đình Đức')).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: '   ' } })
    expect(screen.getByRole('region', { name: 'Lớp học và phân lớp' })).toBeInTheDocument()
  })

  it('orders Vietnamese full names before pagination and restores A–Z after class sorting', () => {
    renderRoster()
    expect(screen.getByText('Họ tên A–Z').closest('button')).toHaveAttribute('aria-pressed', 'true')
    expect(displayedNames()).toEqual(names.slice(0, 50))

    fireEvent.click(screen.getByLabelText('Trang sau'))
    expect(displayedNames()).toEqual(names.slice(50))

    const classSort = mode === 'desktop'
      ? screen.getByTitle('Sắp xếp lớp từ cao đến thấp')
      : screen.getByText('Cao → Thấp').closest('button')!
    fireEvent.click(classSort)
    expect(classSort).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(classSort)
    expect(screen.getByText('Họ tên A–Z').closest('button')).toHaveAttribute('aria-pressed', 'true')
    expect(displayedNames()).toEqual(names.slice(0, 50))

    fireEvent.click(screen.getByLabelText('Trang sau'))
    const search = mode === 'desktop'
      ? screen.getByPlaceholderText('Tìm theo tên, mã thiếu nhi...')
      : screen.getByLabelText('Tìm thiếu nhi')
    fireEvent.change(search, { target: { value: '01 Trần' } })
    expect(displayedNames()).toEqual(['Trần 01'])
  })

  if (mode === 'desktop') {
    it('selects the displayed sorted page rather than the original input page', () => {
      renderRoster()
      fireEvent.click(screen.getByLabelText('Chọn tất cả học viên trên trang'))
      expect(screen.getByText(/Đã chọn/)).toHaveTextContent('Đã chọn 50 thiếu nhi')
      fireEvent.click(screen.getByLabelText('Trang sau'))
      fireEvent.click(screen.getByLabelText('Chọn tất cả học viên trên trang'))
      expect(screen.getByText(/Đã chọn/)).toHaveTextContent('Đã chọn 60 thiếu nhi')
    })
  }

  it('finds unaccented words across holy/full names and respects class and branch filters', () => {
    const matchingStudent = { ...students[0], fullName: 'Nguyễn Đình Đức', holyName: 'Giuse', code: 'TN-001' }
    useStudentStore.setState({ students: [
      matchingStudent,
      { ...students[1], fullName: 'Trần Đình Đức', holyName: 'Giuse' },
      { ...students[2], fullName: 'Nguyễn Đình Đức', holyName: 'Giuse', classId: 'class-other' },
    ] })
    useFilterStore.setState({ selectedBranchId: 'AuNhi' })
    renderRoster()
    const search = mode === 'desktop'
      ? screen.getByPlaceholderText('Tìm theo tên, mã thiếu nhi...')
      : screen.getByLabelText('Tìm thiếu nhi')

    fireEvent.change(search, { target: { value: '  DUC   giuse NGUYEN ' } })
    expect(screen.getAllByText('Nguyễn Đình Đức')).toHaveLength(1)
    expect(screen.queryByText('Trần Đình Đức')).not.toBeInTheDocument()
    act(() => { useFilterStore.setState({ selectedBranchId: 'ThieuNhi' }) })
    expect(screen.queryByText('Nguyễn Đình Đức')).not.toBeInTheDocument()
    act(() => { useFilterStore.setState({ selectedBranchId: 'AuNhi' }) })
    fireEvent.change(search, { target: { value: 'TN001' } })
    expect(screen.getAllByText('Nguyễn Đình Đức')).toHaveLength(1)
    fireEvent.change(search, { target: { value: 'nguyen maria' } })
    expect(screen.queryByText('Nguyễn Đình Đức')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Xóa tìm kiếm'))
    expect(screen.getAllByText('Nguyễn Đình Đức')).toHaveLength(1)
    expect(screen.getByText('Trần Đình Đức')).toBeInTheDocument()
  })
})
