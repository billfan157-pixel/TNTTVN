import { beforeEach, describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StudentModal } from '../../components/common/StudentModal'

const studentStoreMocks = vi.hoisted(() => ({
  addStudent: vi.fn(),
  updateStudent: vi.fn(),
}))

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: Object.assign(
    (selector?: any) => {
      const state = studentStoreMocks
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
  { id: 'AU2', code: 'AN-02', name: 'Ấu Nhi 2', branch: 'AuNhi', branchName: 'Ấu Nhi', academicYear: '2025-2026', room: null, catechistLeader: '', catechistAssistants: [] },
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
  KeyRound: 'svg',
  Copy: 'svg',
  CheckCircle2: 'svg',
  AlertCircle: 'svg',
  Loader2: 'svg',
}))

beforeEach(() => {
  studentStoreMocks.addStudent.mockReset().mockResolvedValue(undefined)
  studentStoreMocks.updateStudent.mockReset().mockResolvedValue(undefined)
})

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

  it('displays inline errors and aria-invalid when submitting empty required fields', () => {
    render(<StudentModal isOpen={true} onClose={vi.fn()} />)

    const saveBtn = screen.getByRole('button', { name: /Thêm Thiếu Nhi/i })
    fireEvent.click(saveBtn)

    expect(screen.getByText('Vui lòng nhập Tên Thánh.')).toBeDefined()
    expect(screen.getByText('Vui lòng nhập Họ và Tên.')).toBeDefined()
    expect(screen.getByText('Vui lòng chọn Giới tính.')).toBeDefined()
    expect(screen.getByText('Vui lòng chọn Ngày sinh.')).toBeDefined()

    const holyNameInput = screen.getByPlaceholderText('VD: Maria, Giuse...')
    expect(holyNameInput.getAttribute('aria-invalid')).toBe('true')
  })

  it('clears inline error when user types into the field', () => {
    render(<StudentModal isOpen={true} onClose={vi.fn()} />)

    const saveBtn = screen.getByRole('button', { name: /Thêm Thiếu Nhi/i })
    fireEvent.click(saveBtn)

    expect(screen.getByText('Vui lòng nhập Tên Thánh.')).toBeDefined()

    const holyNameInput = screen.getByPlaceholderText('VD: Maria, Giuse...')
    fireEvent.change(holyNameInput, { target: { value: 'Maria' } })

    expect(screen.queryByText('Vui lòng nhập Tên Thánh.')).toBeNull()
    expect(holyNameInput.getAttribute('aria-invalid')).toBeNull()
  })

  it('waits for durable enqueue before reporting success and closing', async () => {
    let resolveUpdate!: () => void
    studentStoreMocks.updateStudent.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveUpdate = resolve
    }))
    const onClose = vi.fn()
    render(<StudentModal isOpen={true} onClose={onClose} studentToEdit={{
      id: 'ST-1', fullName: 'Test', holyName: 'Phero', gender: 'Nam', dateOfBirth: '2015-01-01',
      branch: 'AuNhi', classId: 'AU1', status: 'Đang học',
    } as any} />)

    fireEvent.click(screen.getByRole('button', { name: /Lưu Thay Đổi/i }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Đang lưu/i }).getAttribute('aria-busy')).toBe('true')

    await act(async () => resolveUpdate())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('keeps the modal open when durable enqueue fails', async () => {
    studentStoreMocks.updateStudent.mockRejectedValueOnce(new Error('Không thể ghi hàng đợi'))
    const onClose = vi.fn()
    render(<StudentModal isOpen={true} onClose={onClose} studentToEdit={{
      id: 'ST-1', fullName: 'Test', holyName: 'Phero', gender: 'Nam', dateOfBirth: '2015-01-01',
      branch: 'AuNhi', classId: 'AU1', status: 'Đang học',
    } as any} />)

    fireEvent.click(screen.getByRole('button', { name: /Lưu Thay Đổi/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /Lưu Thay Đổi/i }).getAttribute('aria-busy')).toBe('false'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('requires and forwards a reason when correcting class membership', async () => {
    render(<StudentModal isOpen={true} onClose={vi.fn()} studentToEdit={{
      id: 'ST-1', fullName: 'Test', holyName: 'Phero', gender: 'Nam', dateOfBirth: '2015-01-01',
      branch: 'AuNhi', classId: 'AU1', status: 'Đang học',
    } as any} />)

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[2], { target: { value: 'AU2' } })
    fireEvent.click(screen.getByRole('button', { name: /Lưu Thay Đổi/i }))

    expect(screen.getByText('Vui lòng nhập lý do chuyển lớp/ngành (ít nhất 5 ký tự).')).toBeDefined()
    expect(studentStoreMocks.updateStudent).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Lý do chuyển lớp/ngành *'), {
      target: { value: 'Điều chỉnh do xếp nhầm lớp' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Lưu Thay Đổi/i }))

    await waitFor(() => expect(studentStoreMocks.updateStudent).toHaveBeenCalledWith(
      'ST-1',
      expect.objectContaining({
        classId: 'AU2',
        membershipChangeReason: 'Điều chỉnh do xếp nhầm lớp',
      }),
    ))
  })
})
