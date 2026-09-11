import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ParishOrgChart } from '../../components/parish/ParishOrgChart'
import type {
  ParishOrganizationUnit,
  ParishPerson,
  ParishServiceTerm,
} from '../../types/parishProfile'

const mockUnits: ParishOrganizationUnit[] = [
  {
    id: 'U-BOARD',
    parishId: 'parish-1',
    parentId: null,
    name: 'Ban Điều Hành Xứ Đoàn',
    unitType: 'BOARD',
    description: 'Ban lãnh đạo cấp cao nhất',
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'U-BRANCH-AU',
    parishId: 'parish-1',
    parentId: 'U-BOARD',
    name: 'Ngành Ấu Nhi',
    unitType: 'BRANCH',
    description: 'Khăn xanh lá',
    sortOrder: 1,
    isActive: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'U-COMMITTEE-MEDIA',
    parishId: 'parish-1',
    parentId: 'U-BOARD',
    name: 'Ban Truyền Thông',
    unitType: 'COMMITTEE',
    description: 'Phụ trách truyền thông',
    sortOrder: 2,
    isActive: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'U-CHAPTER-AU1',
    parishId: 'parish-1',
    parentId: 'U-BRANCH-AU',
    name: 'Chi đoàn Ấu 1',
    unitType: 'CHAPTER',
    description: null,
    sortOrder: 1,
    isActive: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'U-OTHER-PARENTS',
    parishId: 'parish-1',
    parentId: null,
    name: 'Ban Phụ Huynh',
    unitType: 'OTHER',
    description: 'Hỗ trợ xứ đoàn',
    sortOrder: 9,
    isActive: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
]

const mockPeople: ParishPerson[] = [
  {
    id: 'P-1',
    parishId: 'parish-1',
    linkedUserId: 'usr-1',
    holyName: 'Giuse',
    fullName: 'Trần Văn Minh',
    birthYear: 1992,
    biography: null,
    serviceStatus: 'ACTIVE',
    visibility: 'STAFF',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'P-2',
    parishId: 'parish-1',
    linkedUserId: 'usr-2',
    holyName: 'Maria',
    fullName: 'Lê Thị Hoa',
    birthYear: 1995,
    biography: null,
    serviceStatus: 'ACTIVE',
    visibility: 'STAFF',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'P-3',
    parishId: 'parish-1',
    linkedUserId: null,
    holyName: 'Phêrô',
    fullName: 'Nguyễn Văn Nam',
    birthYear: 1998,
    biography: null,
    serviceStatus: 'ACTIVE',
    visibility: 'STAFF',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
]

const mockTerms: ParishServiceTerm[] = [
  {
    id: 'T-1',
    parishId: 'parish-1',
    personId: 'P-1',
    unitId: 'U-BOARD',
    positionTitle: 'Trưởng Xứ đoàn',
    positionCode: 'PARISH_LEADER',
    rankTitle: 'Huynh trưởng cấp III',
    startDate: '2024-01-01',
    endDate: null,
    notes: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'T-2',
    parishId: 'parish-1',
    personId: 'P-2',
    unitId: 'U-BRANCH-AU',
    positionTitle: 'Trưởng ngành',
    positionCode: 'BRANCH_LEADER',
    rankTitle: 'Huynh trưởng cấp II',
    startDate: '2025-01-01',
    endDate: null,
    notes: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'T-3',
    parishId: 'parish-1',
    personId: 'P-3',
    unitId: 'U-CHAPTER-AU1',
    positionTitle: 'Chi đoàn trưởng',
    positionCode: null,
    rankTitle: 'Huynh trưởng cấp I',
    startDate: '2020-01-01',
    endDate: '2022-01-01', // Expired
    notes: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
]

describe('ParishOrgChart', () => {
  const peopleById = new Map(mockPeople.map(p => [p.id, p]))
  const unitsById = new Map(mockUnits.map(u => [u.id, u]))

  const baseProps = {
    units: mockUnits,
    terms: mockTerms,
    peopleById,
    unitsById,
    canManage: true,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onEditTerm: vi.fn(),
    onDeleteTerm: vi.fn(),
    onSelectPerson: vi.fn(),
    onAddSubUnit: vi.fn(),
    onAddTerm: vi.fn(),
  }

  it('hiển thị đầy đủ 3 cấp tổ chức và cấu trúc cây phân cấp', () => {
    render(<ParishOrgChart {...baseProps} />)

    // Cấp 1: Ban Điều Hành
    expect(screen.getByText(/Cấp 1 · Ban Điều hành \(1\)/)).toBeTruthy()
    expect(screen.getByText('Ban Điều Hành Xứ Đoàn')).toBeTruthy()
    expect(screen.getByText('Trần Văn Minh')).toBeTruthy()
    expect(screen.getByText(/Trưởng Xứ đoàn/)).toBeTruthy()
    expect(screen.getAllByText('Điều phối').length).toBeGreaterThan(0)

    // Cấp 2: Ngành & Ban chuyên môn
    expect(screen.getByRole('heading', { name: /Ngành & Ban chuyên môn — song song \(2\)/i })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Các Ngành' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Các Ban chuyên môn' })).toBeTruthy()
    expect(screen.getByText('Ngành Ấu Nhi')).toBeTruthy()
    expect(screen.getByText('Ban Truyền Thông')).toBeTruthy()

    // Cấp 3: Chi đoàn trực thuộc lồng bên dưới Ngành Ấu Nhi
    expect(screen.getByText('Chi đoàn Ấu 1')).toBeTruthy()
    expect(screen.getByText(/1 trực thuộc/)).toBeTruthy()

    // Cấp 3: Đơn vị trực thuộc khác
    expect(screen.getByText('Ban Phụ Huynh')).toBeTruthy()
  })

  it('hỗ trợ tìm kiếm theo tên đơn vị và tên nhân sự', () => {
    render(<ParishOrgChart {...baseProps} />)

    const searchInput = screen.getByPlaceholderText('Tìm đơn vị, huynh trưởng, chức vụ...')
    fireEvent.change(searchInput, { target: { value: 'Truyền Thông' } })

    // Chỉ Ban Truyền Thông hiển thị, Ngành Ấu Nhi không khớp
    expect(screen.getByText('Ban Truyền Thông')).toBeTruthy()
    expect(screen.queryByText('Ngành Ấu Nhi')).toBeNull()

    // Tìm theo tên nhân sự
    fireEvent.change(searchInput, { target: { value: 'Hoa' } })
    expect(screen.getByText('Lê Thị Hoa')).toBeTruthy()
    expect(screen.getByText('Ngành Ấu Nhi')).toBeTruthy()

    // Tìm kiếm không có kết quả -> NoResultState
    fireEvent.change(searchInput, { target: { value: 'KhôngTồnTạiXYZ' } })
    expect(screen.getByText('Không tìm thấy đơn vị hoặc nhân sự')).toBeTruthy()
  })

  it('hỗ trợ lọc nhiệm kỳ đương nhiệm', () => {
    render(<ParishOrgChart {...baseProps} />)

    // Ban đầu hiển thị tất cả nhiệm kỳ kể cả đã mãn nhiệm (Nguyễn Văn Nam - Chi đoàn trưởng kết thúc 2022)
    expect(screen.getByText('Nguyễn Văn Nam')).toBeTruthy()

    // Bấm lọc "Chỉ đương nhiệm"
    const filterBtn = screen.getByRole('button', { name: /Tất cả nhiệm kỳ/i })
    fireEvent.click(filterBtn)

    // Nhiệm kỳ đã hết hạn của Nguyễn Văn Nam bị ẩn
    expect(screen.queryByText('Nguyễn Văn Nam')).toBeNull()

    // Nhiệm kỳ đương nhiệm của Trần Văn Minh vẫn còn
    expect(screen.getByText('Trần Văn Minh')).toBeTruthy()
  })

  it('hỗ trợ thu gọn và mở rộng các đơn vị trực thuộc', () => {
    render(<ParishOrgChart {...baseProps} />)

    // Mặc định Chi đoàn Ấu 1 đang hiển thị
    expect(screen.getByText('Chi đoàn Ấu 1')).toBeTruthy()

    // Bấm nút thu gọn trên Ngành Ấu Nhi
    const collapseBtn = screen.getByRole('button', { name: /1 trực thuộc/i })
    fireEvent.click(collapseBtn)

    // Chi đoàn Ấu 1 bị ẩn
    expect(screen.queryByText('Chi đoàn Ấu 1')).toBeNull()

    // Bấm lại để mở rộng
    fireEvent.click(collapseBtn)
    expect(screen.getByText('Chi đoàn Ấu 1')).toBeTruthy()
  })

  it('gọi các callback khi tương tác', () => {
    const onSelectPerson = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onEditTerm = vi.fn()
    const onDeleteTerm = vi.fn()
    const onAddSubUnit = vi.fn()
    const onAddTerm = vi.fn()

    render(
      <ParishOrgChart
        {...baseProps}
        onSelectPerson={onSelectPerson}
        onEdit={onEdit}
        onDelete={onDelete}
        onEditTerm={onEditTerm}
        onDeleteTerm={onDeleteTerm}
        onAddSubUnit={onAddSubUnit}
        onAddTerm={onAddTerm}
      />
    )

    // Click vào nhân sự
    const personItem = screen.getByText('Trần Văn Minh')
    fireEvent.click(personItem)
    expect(onSelectPerson).toHaveBeenCalledWith(mockPeople[0])

    // Click nút sửa đơn vị
    const editUnitBtn = screen.getByLabelText('Sửa Ban Điều Hành Xứ Đoàn')
    fireEvent.click(editUnitBtn)
    expect(onEdit).toHaveBeenCalledWith(mockUnits[0])

    // Click nút thêm đơn vị trực thuộc
    const addSubUnitBtn = screen.getByLabelText('Thêm đơn vị trực thuộc Ban Điều Hành Xứ Đoàn')
    fireEvent.click(addSubUnitBtn)
    expect(onAddSubUnit).toHaveBeenCalledWith('U-BOARD')

    // Click nút thêm nhân sự
    const addTermBtn = screen.getByLabelText('Thêm nhân sự cho Ban Điều Hành Xứ Đoàn')
    fireEvent.click(addTermBtn)
    expect(onAddTerm).toHaveBeenCalledWith('U-BOARD')

    // Click nút sửa nhiệm kỳ
    const editTermBtn = screen.getByLabelText('Sửa Trưởng Xứ đoàn')
    fireEvent.click(editTermBtn)
    expect(onEditTerm).toHaveBeenCalledWith(mockTerms[0])
  })

  it('hiển thị trạng thái rỗng chuẩn khi danh sách trống', () => {
    render(
      <ParishOrgChart
        {...baseProps}
        units={[]}
        terms={[]}
      />
    )

    expect(screen.getByText('Chưa thiết lập Ban Điều Hành')).toBeTruthy()
    expect(screen.getByText('Chưa có Ngành nào')).toBeTruthy()
    expect(screen.getByText('Chưa có Ban chuyên môn nào')).toBeTruthy()
  })
})
