import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ParishUnitModal } from '../../components/parish/ParishUnitModal'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import type { ParishProfileSnapshot } from '../../types/parishProfile'

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
      fullName: 'Nguyễn Văn A',
      birthYear: 1990,
      biography: 'Huynh trưởng lâu năm.',
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
      fullName: 'Trần Thị B',
      birthYear: 1995,
      biography: 'GLV mới.',
      serviceStatus: 'ACTIVE',
      visibility: 'STAFF',
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    },
  ],
  units: [
    {
      id: 'POU-BOARD',
      parishId: 'gia-ton',
      parentId: null,
      name: 'Ban Điều Hành',
      unitType: 'BOARD',
      description: 'Ban điều hành toàn xứ',
      sortOrder: 0,
      isActive: true,
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    },
    {
      id: 'POU-BRANCH-THIEU',
      parishId: 'gia-ton',
      parentId: 'POU-BOARD',
      name: 'Ngành Thiếu Nhi',
      unitType: 'BRANCH',
      description: 'Khối Thiếu',
      sortOrder: 1,
      isActive: true,
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    },
    {
      id: 'POU-COMM-TECH',
      parishId: 'gia-ton',
      parentId: 'POU-BOARD',
      name: 'Ban Kỹ Thuật',
      unitType: 'COMMITTEE',
      description: 'Âm thanh ánh sáng',
      sortOrder: 2,
      isActive: true,
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    },
    {
      id: 'POU-CHAP-THIEU-1',
      parishId: 'gia-ton',
      parentId: 'POU-BRANCH-THIEU',
      name: 'Chi đoàn Thiếu 1',
      unitType: 'CHAPTER',
      description: 'Chi đoàn 1',
      sortOrder: 3,
      isActive: true,
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    },
  ],
  terms: [
    {
      id: 'PST-1',
      parishId: 'gia-ton',
      personId: 'PPE-1',
      unitId: 'POU-BOARD',
      positionTitle: 'Trưởng Xứ đoàn',
      positionCode: 'PARISH_LEADER',
      rankTitle: 'Huynh trưởng cấp III',
      startDate: '2024-01-01',
      endDate: '2027-01-01',
      notes: null,
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
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

describe('ParishUnitModal', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    useParishProfileStore.getState().clear()
    useToastStore.setState({ toasts: [] })
  })

  it('renders creation modal with title, sections, unit type buttons and actions', () => {
    render(
      <ParishUnitModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Thêm Đơn Vị Tổ Chức Mới' })).toBeTruthy()
    expect(screen.getByText('1. Phân Loại & Cấu Trúc Tổ Chức')).toBeTruthy()
    expect(screen.getByText('2. Thông Tin Định Danh & Tên Gọi')).toBeTruthy()
    expect(screen.getByText('3. Trạng Thái Hoạt Động')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tạo đơn vị/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Hủy bỏ/i })).toBeTruthy()
  })

  it('renders edit modal with unit details and Section 4 (Current personnel and child units)', () => {
    const boardUnit = mockSnapshot.units[0]
    render(
      <ParishUnitModal
        unit={boardUnit}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Cập Nhật Đơn Vị Tổ Chức' })).toBeTruthy()
    expect(screen.getByDisplayValue('Ban Điều Hành')).toBeTruthy()
    expect(screen.getByText('4. Nhân Sự & Đơn Vị Liên Kết Hiện Tại')).toBeTruthy()
    expect(screen.getByText(/Nguyễn Văn A/i)).toBeTruthy()
    expect(screen.getByText(/Trưởng Xứ đoàn/i)).toBeTruthy()
  })

  it('disables parent selection when unit type is BOARD and shows top-level info', () => {
    render(
      <ParishUnitModal
        unit={mockSnapshot.units[0]}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Click on BOARD type card
    const boardButton = screen.getByRole('button', { name: /Loại đơn vị: Ban Điều Hành/i })
    fireEvent.click(boardButton)

    expect(screen.getByText(/Ban Điều Hành là cấp cao nhất/i)).toBeTruthy()
    expect(screen.queryByLabelText('Chọn đơn vị cấp trên')).toBeNull()
  })

  it('requires and filters parents to active BOARD when unit type is BRANCH or COMMITTEE', () => {
    render(
      <ParishUnitModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Click on BRANCH type card
    const branchButton = screen.getByRole('button', { name: /Loại đơn vị: Ban Chuyên Môn/i })
    fireEvent.click(branchButton)

    const select = screen.getByLabelText('Chọn đơn vị cấp trên') as HTMLSelectElement
    expect(select).toBeTruthy()

    // Options should contain Ban Điều Hành and NOT contain other branches/chapters
    const optionTexts = Array.from(select.options).map(o => o.text)
    expect(optionTexts.some(t => t.includes('Ban Điều Hành'))).toBe(true)
    expect(optionTexts.some(t => t.includes('Ngành Thiếu Nhi'))).toBe(false)
    expect(optionTexts.some(t => t.includes('Chi đoàn Thiếu 1'))).toBe(false)
  })

  it('applies quick preset chips for unit name and description', () => {
    render(
      <ParishUnitModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Click on COMMITTEE type card
    const commButton = screen.getByRole('button', { name: /Loại đơn vị: Ban Chuyên Môn/i })
    fireEvent.click(commButton)

    // Click on "+ Ban Phụng Vụ" preset chip
    const presetChip = screen.getByRole('button', { name: /\+ Ban Phụng Vụ/i })
    fireEvent.click(presetChip)

    expect(screen.getByDisplayValue('Ban Phụng Vụ')).toBeTruthy()
    expect(screen.getByDisplayValue(/Phụ trách thánh lễ, nghi thức phụng vụ/i)).toBeTruthy()
  })

  it('calculates next sort order dynamically', () => {
    render(
      <ParishUnitModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const calcButton = screen.getByRole('button', { name: /\+1 Kế tiếp/i })
    fireEvent.click(calcButton)

    const sortInput = screen.getByLabelText('Thứ tự sắp xếp') as HTMLInputElement
    expect(Number(sortInput.value)).toBeGreaterThanOrEqual(1)
  })

  it('prevents cycle in hierarchy: does not list self or descendant units as parent options', () => {
    const branchUnit = mockSnapshot.units.find(u => u.id === 'POU-BRANCH-THIEU')!
    render(
      <ParishUnitModal
        unit={branchUnit}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Switch to CHAPTER to check candidate parent list
    const chapterButton = screen.getByRole('button', { name: /Loại đơn vị: Chi Đoàn/i })
    fireEvent.click(chapterButton)

    const select = screen.getByLabelText('Chọn đơn vị cấp trên') as HTMLSelectElement
    const optionValues = Array.from(select.options).map(o => o.value)

    // Must NOT contain self (POU-BRANCH-THIEU)
    expect(optionValues.includes('POU-BRANCH-THIEU')).toBe(false)
    // Must NOT contain its child (POU-CHAP-THIEU-1)
    expect(optionValues.includes('POU-CHAP-THIEU-1')).toBe(false)
  })

  it('only offers Committee and Other for manual creation', () => {
    render(
      <ParishUnitModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.queryByRole('button', { name: /Loại đơn vị: Ban Điều Hành/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Loại đơn vị: Ngành/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Loại đơn vị: Chi Đoàn/i })).toBeNull()
    expect(screen.getByRole('button', { name: /Loại đơn vị: Ban Chuyên Môn/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Loại đơn vị: Đơn Vị Khác/i })).toBeTruthy()
  })

  it('warns when editing a BOARD with child units if trying to change type or deactivate', () => {
    const boardUnit = mockSnapshot.units[0] // Has children
    render(
      <ParishUnitModal
        unit={boardUnit}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Click Inactive radio
    const inactiveRadio = screen.getByRole('radio', { name: /Ngừng hoạt động \/ Lưu trữ/i })
    fireEvent.click(inactiveRadio)

    expect(screen.getByText(/Không thể thay đổi loại hoặc ngưng hoạt động Ban Điều Hành/i)).toBeTruthy()
    expect(screen.getByText(/2 Ngành \/ Ban chuyên môn trực thuộc/i)).toBeTruthy()
  })

  it('validates empty name and shows error toast', async () => {
    render(
      <ParishUnitModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const nameInput = screen.getByLabelText('Tên đơn vị')
    fireEvent.change(nameInput, { target: { value: '   ' } })

    const submitBtn = screen.getByRole('button', { name: /Tạo đơn vị/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(useToastStore.getState().toasts.some((t: { message: string }) => t.message.includes('Vui lòng nhập tên đơn vị'))).toBe(true)
    })
  })

  it('successfully creates a new unit and triggers success toast', async () => {
    const createUnitSpy = vi.spyOn(useParishProfileStore.getState(), 'createUnit').mockResolvedValue(true)

    render(
      <ParishUnitModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Select COMMITTEE
    const commButton = screen.getByRole('button', { name: /Loại đơn vị: Ban Chuyên Môn/i })
    fireEvent.click(commButton)

    // Set Name
    const nameInput = screen.getByLabelText('Tên đơn vị')
    fireEvent.change(nameInput, { target: { value: 'Ban Ẩm Thực' } })

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Tạo đơn vị/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(createUnitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Ban Ẩm Thực',
          unitType: 'COMMITTEE',
          parentId: 'POU-BOARD',
          isActive: true,
        }),
      )
      expect(useToastStore.getState().toasts.some((t: { message: string }) => t.message.includes('Đã tạo đơn vị tổ chức mới'))).toBe(true)
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('successfully updates an existing unit', async () => {
    const updateUnitSpy = vi.spyOn(useParishProfileStore.getState(), 'updateUnit').mockResolvedValue(true)
    const commUnit = mockSnapshot.units.find(u => u.id === 'POU-COMM-TECH')!

    render(
      <ParishUnitModal
        unit={commUnit}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Update name
    const nameInput = screen.getByLabelText('Tên đơn vị')
    fireEvent.change(nameInput, { target: { value: 'Ban Kỹ Thuật & Truyền Thông' } })

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Lưu cập nhật/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(updateUnitSpy).toHaveBeenCalledWith(
        'POU-COMM-TECH',
        expect.objectContaining({
          name: 'Ban Kỹ Thuật & Truyền Thông',
          unitType: 'COMMITTEE',
          parentId: 'POU-BOARD',
        }),
      )
      expect(useToastStore.getState().toasts.some((t: { message: string }) => t.message.includes('Đã cập nhật đơn vị'))).toBe(true)
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })
})
