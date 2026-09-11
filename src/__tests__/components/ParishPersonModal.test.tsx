import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ParishPersonModal } from '../../components/parish/ParishPersonModal'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import type { ParishPerson, ParishProfileSnapshot } from '../../types/parishProfile'

const mockSnapshot: ParishProfileSnapshot = {
  profile: {
    parishId: 'gia-ton',
    displayName: 'Xứ Đoàn Đức Mẹ Fatima',
    patronName: 'Đức Mẹ Fatima',
    foundedDate: '1998-05-13',
    motto: 'Cầu nguyện – Rước lễ – Hy sinh – Làm tông đồ',
    description: 'Cùng nhau phụng sự.',
    updatedBy: 'USR-1',
    createdAt: '2026-08-31T00:00:00Z',
    updatedAt: '2026-08-31T00:00:00Z',
  },
  people: [
    {
      id: 'PPE-1',
      parishId: 'gia-ton',
      linkedUserId: 'USR-1',
      holyName: 'Giuse',
      fullName: 'Nguyễn Văn An',
      birthYear: 1992,
      biography: 'Huynh trưởng kỳ cựu.',
      serviceStatus: 'ACTIVE',
      visibility: 'STAFF',
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    },
    {
      id: 'PPE-2',
      parishId: 'gia-ton',
      linkedUserId: null,
      holyName: 'Maria',
      fullName: 'Trần Thị Bình',
      birthYear: 1998,
      biography: 'GLV ngành Ấu.',
      serviceStatus: 'ACTIVE',
      visibility: 'STAFF',
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    },
  ],
  units: [],
  terms: [],
  records: [],
  assets: [],
  timeline: [],
  accounts: [
    { id: 'USR-1', fullName: 'Nguyễn Văn An', holyName: 'Giuse', role: 'admin', status: 'ACTIVE' },
    { id: 'USR-2', fullName: 'Lê Văn Cường', holyName: 'Gioan Baotixita', role: 'chunhiem', status: 'ACTIVE' },
    { id: 'USR-3', fullName: 'Phạm Thị Dung', holyName: 'Têrêsa', role: 'phuta', status: 'ACTIVE' },
  ],
  permissions: { canManage: true, canUpload: true },
}

describe('ParishPersonModal', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    useParishProfileStore.getState().clear()
    useToastStore.setState({ toasts: [] })
  })

  it('renders modal with title, 4 structured sections, and action buttons', () => {
    render(
      <ParishPersonModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Thêm Hồ Sơ Huynh Trưởng / GLV Mới' })).toBeTruthy()
    expect(screen.getByText(/1\. Căn Tính Kitô Giáo & Thông Tin Cá Nhân/)).toBeTruthy()
    expect(screen.getByText(/2\. Liên Kết Tài Khoản Hệ Thống/)).toBeTruthy()
    expect(screen.getByText(/3\. Trạng Thái Phục Vụ & Phạm Vi Hiển Thị/)).toBeTruthy()
    expect(screen.getByText(/4\. Tiểu Sử & Quá Trình Dấn Thân/)).toBeTruthy()
    expect(screen.getByText(/Xem trước thẻ hồ sơ \(Live Preview\):/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tạo hồ sơ nhân sự/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Hủy bỏ/i })).toBeTruthy()
  })

  it('renders in edit mode with pre-filled person details and avatar initials', () => {
    const existingPerson = mockSnapshot.people[0]
    render(
      <ParishPersonModal
        person={existingPerson}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Cập Nhật Hồ Sơ Huynh Trưởng / GLV' })).toBeTruthy()
    expect(screen.getByDisplayValue('Giuse')).toBeTruthy()
    expect(screen.getByDisplayValue('Nguyễn Văn An')).toBeTruthy()
    expect(screen.getByDisplayValue('1992')).toBeTruthy()
    expect(screen.getByDisplayValue('Huynh trưởng kỳ cựu.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Lưu cập nhật/i })).toBeTruthy()
  })

  it('opens account picker, searches account and auto-fills empty name fields', () => {
    render(
      <ParishPersonModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Click "Chọn tài khoản liên kết"
    const openPickerBtn = screen.getByRole('button', { name: /Chọn tài khoản liên kết/i })
    fireEvent.click(openPickerBtn)

    // Search for "Lê Văn Cường"
    const searchInput = screen.getByPlaceholderText(/Tìm tài khoản theo tên/i)
    fireEvent.change(searchInput, { target: { value: 'Cường' } })

    // Select account
    const accountBtn = screen.getByRole('button', { name: /Gioan Baotixita Lê Văn Cường/i })
    fireEvent.click(accountBtn)

    // Verify auto-fill populated the inputs
    expect(screen.getByDisplayValue('Gioan Baotixita')).toBeTruthy()
    expect(screen.getByDisplayValue('Lê Văn Cường')).toBeTruthy()
    expect(screen.getByText(/Đã tự động điền Tên thánh & Họ tên từ tài khoản Lê Văn Cường/i)).toBeTruthy()
  })

  it('allows switching service status and updates selection', () => {
    render(
      <ParishPersonModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const formerBtn = screen.getByRole('button', { name: /Đã mãn nhiệm/i })
    fireEvent.click(formerBtn)

    // In preview card, should see "Đã mãn nhiệm"
    expect(screen.getAllByText('Đã mãn nhiệm').length).toBeGreaterThan(0)
  })

  it('appends preset text to biography when clicked', () => {
    render(
      <ParishPersonModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const presetBtn = screen.getByRole('button', { name: /\+ Tuyên hứa Huynh trưởng năm 2020\./i })
    fireEvent.click(presetBtn)

    const textarea = screen.getByPlaceholderText(/Ghi nhận quá trình phục vụ/i) as HTMLTextAreaElement
    expect(textarea.value).toContain('Tuyên hứa Huynh trưởng năm 2020.')
  })

  it('blocks submit if full name is empty', async () => {
    render(
      <ParishPersonModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const submitBtn = screen.getByRole('button', { name: /Tạo hồ sơ nhân sự/i })
    fireEvent.click(submitBtn)

    expect(useToastStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Vui lòng nhập Họ và tên nhân sự', type: 'error' }),
      ]),
    )
  })

  it('blocks submit if birth year is out of valid range', async () => {
    render(
      <ParishPersonModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/Nguyễn Văn An/i), { target: { value: 'Trần Văn X' } })
    fireEvent.change(screen.getByPlaceholderText(/1900 –/i), { target: { value: '1850' } })

    const submitBtn = screen.getByRole('button', { name: /Tạo hồ sơ nhân sự/i })
    fireEvent.click(submitBtn)

    expect(useToastStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringMatching(/Năm sinh không hợp lệ/), type: 'error' }),
      ]),
    )
  })

  it('submits a new person successfully and triggers callbacks', async () => {
    const createPersonSpy = vi.spyOn(useParishProfileStore.getState(), 'createPerson').mockResolvedValue(true)

    render(
      <ParishPersonModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/VD: Giuse, Maria/i), { target: { value: 'Phêrô' } })
    fireEvent.change(screen.getByPlaceholderText(/Nguyễn Văn An/i), { target: { value: 'Nguyễn Văn Phát' } })
    fireEvent.change(screen.getByPlaceholderText(/1900 –/i), { target: { value: '1996' } })

    const submitBtn = screen.getByRole('button', { name: /Tạo hồ sơ nhân sự/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(createPersonSpy).toHaveBeenCalledWith({
        linkedUserId: null,
        holyName: 'Phêrô',
        fullName: 'Nguyễn Văn Phát',
        birthYear: 1996,
        biography: null,
        serviceStatus: 'ACTIVE',
        visibility: 'STAFF',
      })
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('updates existing person successfully', async () => {
    const updatePersonSpy = vi.spyOn(useParishProfileStore.getState(), 'updatePerson').mockResolvedValue(true)
    const existingPerson: ParishPerson = mockSnapshot.people[1]

    render(
      <ParishPersonModal
        person={existingPerson}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByDisplayValue('Trần Thị Bình'), { target: { value: 'Trần Thị Bình An' } })

    const submitBtn = screen.getByRole('button', { name: /Lưu cập nhật/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(updatePersonSpy).toHaveBeenCalledWith(
        'PPE-2',
        expect.objectContaining({
          fullName: 'Trần Thị Bình An',
        }),
      )
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('displays error toast when store returns false', async () => {
    vi.spyOn(useParishProfileStore.getState(), 'createPerson').mockImplementation(async () => {
      useParishProfileStore.setState({ error: 'Lỗi trùng lặp dữ liệu nhân sự' })
      return false
    })

    render(
      <ParishPersonModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/Nguyễn Văn An/i), { target: { value: 'Trần Văn X' } })
    const submitBtn = screen.getByRole('button', { name: /Tạo hồ sơ nhân sự/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: 'Lỗi trùng lặp dữ liệu nhân sự', type: 'error' }),
        ]),
      )
    })
  })
})
