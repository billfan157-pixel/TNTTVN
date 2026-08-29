import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MobileReportsView } from '../../components/mobile/MobileReportsView'

const students = [
  { id: 's1', code: 'TN-001', holyName: 'Phê-rô', fullName: 'Nguyễn Văn An', branch: 'ThieuNhi' },
  { id: 's2', code: 'AN-002', holyName: 'Maria', fullName: 'Trần Ngọc Bình', branch: 'AuNhi' },
  ...Array.from({ length: 33 }, (_, index) => ({
    id: `extra-${index}`,
    code: `EX-${index}`,
    holyName: 'Giuse',
    fullName: `Học Sinh ${index}`,
    branch: 'ThieuNhi',
  })),
]

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: (selector: (state: { students: typeof students }) => unknown) => selector({ students }),
}))

vi.mock('../../stores/gradeStore', () => ({
  useGradeStore: (selector: (state: { calculateStudentAvg: () => { score: number; label: string } }) => unknown) => selector({
    calculateStudentAvg: () => ({ score: 8.5, label: 'Giỏi' }),
  }),
}))

vi.mock('../../stores/filterStore', () => ({
  useFilterStore: (selector: (state: { selectedSemester: 1; setSelectedSemester: () => void }) => unknown) => selector({
    selectedSemester: 1,
    setSelectedSemester: vi.fn(),
  }),
}))

vi.mock('../../hooks/useSemesterAccess', () => ({
  useSemesterAccess: () => ({ restricted: false, openSemester: 1 }),
}))

describe('MobileReportsView', () => {
  it('filters the print list by name, holy name, or student code', () => {
    render(<MobileReportsView onPrintReport={vi.fn()} />)

    expect(screen.getByText('35/35 em')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm học sinh để in kết quả' }), {
      target: { value: 'TN-001' },
    })

    expect(screen.getByText('1/35 em')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.queryByText('Trần Ngọc Bình')).not.toBeInTheDocument()
  })

  it('shows a recoverable empty state when no student matches', () => {
    render(<MobileReportsView onPrintReport={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'không tồn tại' } })

    expect(screen.getByText('Không tìm thấy học sinh phù hợp')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tìm kiếm' }))
    expect(screen.getByText('35/35 em')).toBeInTheDocument()
  })

  it('renders large lists in incremental batches', () => {
    render(<MobileReportsView onPrintReport={vi.fn()} />)

    expect(screen.getAllByRole('button', { name: /In kết quả học tập cho/ })).toHaveLength(30)
    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm 5 em' }))
    expect(screen.getAllByRole('button', { name: /In kết quả học tập cho/ })).toHaveLength(35)
    expect(screen.queryByRole('button', { name: /Xem thêm/ })).not.toBeInTheDocument()
  })
})
