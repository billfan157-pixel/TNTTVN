import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ParishServiceTermModal } from '../../components/parish/ParishServiceTermModal'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import type { ParishProfileSnapshot, ParishServiceTerm } from '../../types/parishProfile'

const mockSnapshot: ParishProfileSnapshot = {
  profile: {
    parishId: 'gia-ton', displayName: 'Xứ Đoàn Đức Mẹ Fatima', patronName: 'Đức Mẹ Fatima',
    foundedDate: '1998-05-13', motto: 'Cầu nguyện – Rước lễ – Hy sinh – Làm tông đồ',
    description: 'Cùng nhau phụng sự.', updatedBy: 'USR-1', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  },
  people: [
    {
      id: 'PPE-1', parishId: 'gia-ton', linkedUserId: 'USR-1', holyName: 'Giuse', fullName: 'Nguyễn Văn A', birthYear: 1990,
      biography: 'Huynh trưởng lâu năm.', serviceStatus: 'ACTIVE', visibility: 'STAFF', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
    },
    {
      id: 'PPE-2', parishId: 'gia-ton', linkedUserId: null, holyName: 'Maria', fullName: 'Trần Thị B', birthYear: 1995,
      biography: 'GLV mới.', serviceStatus: 'ACTIVE', visibility: 'STAFF', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
    },
  ],
  units: [
    {
      id: 'POU-BOARD', parishId: 'gia-ton', parentId: null, name: 'Ban Điều Hành', unitType: 'BOARD', description: null,
      sortOrder: 0, isActive: true, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
    },
    {
      id: 'POU-BRANCH', parishId: 'gia-ton', parentId: 'POU-BOARD', name: 'Ngành Thiếu', unitType: 'BRANCH', description: null,
      sortOrder: 1, isActive: true, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
    },
    {
      id: 'POU-COMM', parishId: 'gia-ton', parentId: 'POU-BOARD', name: 'Ban Truyền Thông', unitType: 'COMMITTEE', description: null,
      sortOrder: 2, isActive: true, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
    },
  ],
  terms: [
    {
      id: 'PST-1', parishId: 'gia-ton', personId: 'PPE-1', unitId: 'POU-BOARD', positionTitle: 'Trưởng Xứ đoàn', positionCode: 'PARISH_LEADER', rankTitle: 'Huynh trưởng cấp III',
      startDate: '2024-01-01', endDate: '2027-01-01', notes: null, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
    },
  ],
  records: [],
  assets: [],
  timeline: [],
  accounts: [
    { id: 'USR-1', fullName: 'Nguyễn Văn A', holyName: 'Giuse', role: 'admin', status: 'ACTIVE' },
  ],
  permissions: { canManage: true, canUpload: true },
}

describe('ParishServiceTermModal', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    useParishProfileStore.getState().clear()
    useToastStore.setState({ toasts: [] })
  })

  it('renders modal with title, 4 structured sections and buttons', () => {
    render(
      <ParishServiceTermModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Bổ Nhiệm Nhiệm Kỳ Mới' })).toBeTruthy()
    expect(screen.getByText(/1\. Nhân Sự Được Bổ Nhiệm/)).toBeTruthy()
    expect(screen.getByText(/2\. Đơn Vị & Chức Vụ Tổ Chức/)).toBeTruthy()
    expect(screen.getByText(/3\. Cấp Bậc & Thời Hạn Phục Vụ/)).toBeTruthy()
    expect(screen.getByText(/4\. Thẩm Quyền Dự Kiến & Xác Thực Bảo Mật/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Xác nhận bổ nhiệm/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Hủy bỏ/i })).toBeTruthy()
  })

  it('searches and selects a person, displaying profile card and account status', () => {
    render(
      <ParishServiceTermModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Search for Maria
    const searchInput = screen.getByPlaceholderText(/Gõ tên Thánh hoặc họ tên/i)
    fireEvent.change(searchInput, { target: { value: 'Maria' } })

    // Click on Maria in filtered list
    const personButton = screen.getByRole('button', { name: /Maria Trần Thị B/i })
    fireEvent.click(personButton)

    // Verify profile card
    expect(screen.getAllByText(/Maria Trần Thị B/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Chưa liên kết tài khoản/i)).toBeTruthy()
  })

  it('shows dual-tenure warning when selected person already holds an active term', () => {
    render(
      <ParishServiceTermModal
        initialPersonId="PPE-1"
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // PPE-1 already has term PST-1 (Trưởng Xứ đoàn)
    expect(screen.getAllByText(/Giuse Nguyễn Văn A/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Đã liên kết Staff/i)).toBeTruthy()
    expect(screen.getByText(/Lưu ý kiêm nhiệm:/i)).toBeTruthy()
    expect(screen.getAllByText(/Trưởng Xứ đoàn/i).length).toBeGreaterThan(0)
  })

  it('smartly suggests positionCode when selecting positionTitle', () => {
    render(
      <ParishServiceTermModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const titleInput = screen.getByPlaceholderText(/Ví dụ: Trưởng ngành, Phó ban, Thủ quỹ/i)

    // Typing Trưởng ngành should suggest BRANCH_LEADER
    fireEvent.change(titleInput, { target: { value: 'Trưởng ngành' } })
    expect(screen.getByText(/Trưởng ngành \(Khối Ngành\)/i)).toBeTruthy()

    // Typing Trưởng Xứ đoàn should suggest PARISH_LEADER
    fireEvent.change(titleInput, { target: { value: 'Trưởng Xứ đoàn' } })
    expect(screen.getByText(/Trưởng Xứ đoàn \(Toàn xứ\)/i)).toBeTruthy()

    // Typing Thủ quỹ should clear leader positionCode
    fireEvent.change(titleInput, { target: { value: 'Thủ quỹ' } })
    expect(screen.getByText(/Chức vụ tổ chức thường nhật/i)).toBeTruthy()
  })

  it('applies duration presets correctly', () => {
    render(
      <ParishServiceTermModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const presetSchoolYear = screen.getByRole('button', { name: /\+ 1 Niên khóa Giáo lý/i })
    fireEvent.click(presetSchoolYear)

    const endDateInput = screen.getByLabelText(/Ngày kết thúc/i) as HTMLInputElement
    expect(endDateInput.value).toMatch(/-08-31$/)

    const presetIndefinite = screen.getByRole('button', { name: /Đương nhiệm \(Không thời hạn\)/i })
    fireEvent.click(presetIndefinite)
    expect(endDateInput.value).toBe('')
  })

  it('validates required fields and shows error toast when submitted incomplete', async () => {
    render(
      <ParishServiceTermModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const submitBtn = screen.getByRole('button', { name: /Xác nhận bổ nhiệm/i })
    fireEvent.click(submitBtn)

    // Missing person
    expect(useToastStore.getState().toasts[0]?.message).toMatch(/Vui lòng chọn nhân sự/i)
  })

  it('submits successfully when form is valid', async () => {
    const createTermSpy = vi.spyOn(useParishProfileStore.getState(), 'createTerm').mockResolvedValue(true)

    render(
      <ParishServiceTermModal
        initialPersonId="PPE-1"
        initialUnitId="POU-BRANCH"
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Fill title
    const titleInput = screen.getByPlaceholderText(/Ví dụ: Trưởng ngành, Phó ban, Thủ quỹ/i)
    fireEvent.change(titleInput, { target: { value: 'Trưởng ngành' } })

    // Fill reason
    const reasonInput = screen.getByPlaceholderText(/Ví dụ: Bổ nhiệm đầu niên khóa mới/i)
    fireEvent.change(reasonInput, { target: { value: 'Bổ nhiệm đầu niên khóa mới' } })

    // Fill admin password
    const passwordInput = screen.getByPlaceholderText(/Nhập mật khẩu tài khoản Admin/i)
    fireEvent.change(passwordInput, { target: { value: 'AdminPass@123' } })

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Xác nhận bổ nhiệm/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(createTermSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          personId: 'PPE-1',
          unitId: 'POU-BRANCH',
          positionTitle: 'Trưởng ngành',
          positionCode: 'BRANCH_LEADER',
          authorityReason: 'Bổ nhiệm đầu niên khóa mới',
          adminPassword: 'AdminPass@123',
        }),
      )
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('renders edit mode with existing term data', () => {
    const existingTerm: ParishServiceTerm = {
      id: 'PST-EDIT',
      parishId: 'gia-ton',
      personId: 'PPE-1',
      unitId: 'POU-BRANCH',
      positionTitle: 'Phó ngành',
      positionCode: null,
      rankTitle: 'Huynh trưởng Cấp II',
      startDate: '2025-09-01',
      endDate: '2026-08-31',
      notes: 'Bổ nhiệm bổ sung',
      createdAt: '2025-09-01T00:00:00Z',
      updatedAt: '2025-09-01T00:00:00Z',
    }

    render(
      <ParishServiceTermModal
        term={existingTerm}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Cập Nhật Nhiệm Kỳ Phục Vụ' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Lưu thay đổi/i })).toBeTruthy()
    expect((screen.getByPlaceholderText(/Ví dụ: Trưởng ngành, Phó ban, Thủ quỹ/i) as HTMLInputElement).value).toBe('Phó ngành')
    expect((screen.getByDisplayValue('Huynh trưởng Cấp II') as HTMLInputElement)).toBeTruthy()
  })
})
