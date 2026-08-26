import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PhotoCard } from '../../components/common/PhotoCard'

const mockStudent = {
  id: 'ST-001',
  code: 'TN-1001',
  holyName: 'Phê-rô',
  fullName: 'Nguyễn Văn A',
  gender: 'Nam' as const,
  dateOfBirth: '2012-05-15',
  baptismDate: '2020-01-15',
  firstCommunionDate: '2022-06-10',
  parentName: 'Nguyễn Văn B',
  parentPhone: '0901234567',
  address: '123 Đường ABC',
  branch: 'ThieuNhi' as const,
  classId: 'TN1',
  status: 'Đang học' as const,
}

vi.mock('../../stores/classStore', () => ({
  useClassStore: Object.assign(
    (selector?: any) => {
      const state = {
        findClassById: () => ({ id: 'TN1', name: 'Lớp TN 1', catechistLeader: 'Huynh trưởng A', academicYear: '2025 - 2026', branch: 'ThieuNhi', code: 'TN1', room: null, branchName: null, catechistAssistants: [] }),
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        findClassById: () => ({ id: 'TN1', name: 'Lớp TN 1', catechistLeader: 'Huynh trưởng A', academicYear: '2025 - 2026', branch: 'ThieuNhi', code: 'TN1', room: null, branchName: null, catechistAssistants: [] }),
      }),
      setState: vi.fn(),
    },
  ),
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: (selector?: any) => {
    const state = { currentYear: '2025 - 2026' }
    return selector ? selector(state) : state
  },
}))

vi.mock('lucide-react', () => ({
  Printer: 'svg', X: 'svg',
}))

describe('PhotoCard', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<PhotoCard isOpen={false} onClose={vi.fn()} student={mockStudent} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when student is null', () => {
    const { container } = render(<PhotoCard isOpen={true} onClose={vi.fn()} student={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders student info when open', () => {
    render(<PhotoCard isOpen={true} onClose={vi.fn()} student={mockStudent} />)
    expect(screen.getByText('Thẻ Thiếu Nhi')).toBeDefined()
    expect(screen.getByText(/Nguyễn Văn A/)).toBeDefined()
    expect(screen.getByText(/TN-1001/)).toBeDefined()
  })

  it('shows branch, class, and other details', () => {
    render(<PhotoCard isOpen={true} onClose={vi.fn()} student={mockStudent} />)
    expect(screen.getByText(/Ngành/)).toBeDefined()
    expect(screen.getByText('Lớp TN 1')).toBeDefined()
    expect(screen.getByText('Nguyễn Văn B')).toBeDefined()
    expect(screen.getByText('0901234567')).toBeDefined()
  })

  it('shows sacrament journey', () => {
    render(<PhotoCard isOpen={true} onClose={vi.fn()} student={mockStudent} />)
    expect(screen.getByText(/Rửa Tội/)).toBeDefined()
    expect(screen.getByText(/Rước Lễ LĐ/)).toBeDefined()
  })

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<PhotoCard isOpen={true} onClose={onClose} student={mockStudent} />)
    const overlay = container.querySelector('.modal-overlay')
    fireEvent.click(overlay!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stops propagation when clicking inside modal', () => {
    const onClose = vi.fn()
    render(<PhotoCard isOpen={true} onClose={onClose} student={mockStudent} />)
    const inner = document.querySelector('.modal-content')
    fireEvent.click(inner!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows academic year', () => {
    render(<PhotoCard isOpen={true} onClose={vi.fn()} student={mockStudent} />)
    expect(screen.getByText(/2025 - 2026/)).toBeDefined()
  })
})
