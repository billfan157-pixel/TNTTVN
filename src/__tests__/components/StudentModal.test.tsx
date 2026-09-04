import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StudentModal } from '../../components/common/StudentModal'

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: Object.assign(
    (selector?: any) => {
      const state = { addStudent: vi.fn(), updateStudent: vi.fn() }
      return selector ? selector(state) : state
    },
    { getState: () => ({ students: [] }), setState: vi.fn() },
  ),
}))

vi.mock('../../constants/branches', () => ({
  BRANCHES: {
    AuNhi: { id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#FF69B4' },
    ThieuNhi: { id: 'ThieuNhi', name: 'Thiếu Nhi', scarfColor: '#4169E1' },
  },
}))

vi.mock('../../hooks/useFocusTrap', () => ({ useFocusTrap: () => null }))

const fakeClassList = [
  { id: 'AU1', code: 'AN-01', name: 'Ấu Nhi 1', branch: 'AuNhi', branchName: 'Ấu Nhi', academicYear: '2025-2026', room: null, catechistLeader: '', catechistAssistants: [] },
]

vi.mock('../../stores/classStore', () => ({
  useClassStore: Object.assign(
    (selector?: any) => {
      const state = { classes: fakeClassList, getClassList: () => fakeClassList }
      return selector ? selector(state) : state
    },
    { getState: () => ({ getClassList: () => fakeClassList }) },
  ),
  getFilteredClassList: (classes: any[]) => classes,
}))

vi.mock('lucide-react', () => ({
  X: 'svg',
  Save: 'svg',
  UserPlus: 'svg',
}))

describe('StudentModal Component', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<StudentModal isOpen={false} onClose={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders form fields when open', () => {
    render(<StudentModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Thêm Hồ Sơ Thiếu Nhi Mới')).toBeDefined()
    expect(screen.getByText('Họ và Tên Thiếu Nhi *')).toBeDefined()
  })

  it('renders with edit title when studentToEdit is provided', () => {
    render(<StudentModal isOpen={true} onClose={vi.fn()} studentToEdit={{ id: 'ST-1', fullName: 'Test', holyName: 'Phero', gender: 'Nam', dateOfBirth: '2015-01-01', branch: 'AuNhi', classId: 'AU1', status: 'Đang học' } as any} />)
    expect(screen.getByText('Chỉnh Sửa Thông Tin Thiếu Nhi')).toBeDefined()
  })

  it('initializes with empty holyName and fullName instead of fake defaults', () => {
    render(<StudentModal isOpen={true} onClose={vi.fn()} />)
    const holyNameInput = screen.getByPlaceholderText('VD: Maria, Giuse...') as HTMLInputElement
    const fullNameInput = screen.getByPlaceholderText('VD: Nguyễn Văn An') as HTMLInputElement
    expect(holyNameInput.value).toBe('')
    expect(fullNameInput.value).toBe('')
  })
})
