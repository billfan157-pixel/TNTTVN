import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ParishPersonDetailModal } from '../../components/parish/ParishPersonDetailModal'
import { useToastStore } from '../../stores/toastStore'
import type {
  ParishArchiveAsset,
  ParishOrganizationUnit,
  ParishPerson,
  ParishProfileSnapshot,
  ParishRecord,
  ParishServiceTerm,
} from '../../types/parishProfile'

const mockPerson: ParishPerson = {
  id: 'PPE-1',
  parishId: 'gia-ton',
  linkedUserId: 'USR-1',
  holyName: 'Giuse',
  fullName: 'Nguyễn Văn An',
  birthYear: 1996,
  biography: 'Đã tuyên hứa Huynh trưởng năm 2018. Đã tham gia Sa mạc Huấn luyện Horeb X.',
  serviceStatus: 'ACTIVE',
  visibility: 'STAFF',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
}

const mockAccounts: ParishProfileSnapshot['accounts'] = [
  {
    id: 'USR-1',
    holyName: 'Giuse',
    fullName: 'Nguyễn Văn An',
    role: 'admin',
    status: 'ACTIVE',
  },
]

const mockUnits: ParishOrganizationUnit[] = [
  {
    id: 'POU-BOARD',
    parishId: 'gia-ton',
    parentId: null,
    name: 'Ban Quản Trị',
    unitType: 'BOARD',
    description: null,
    sortOrder: 1,
    isActive: true,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'POU-BRANCH-THIEU',
    parishId: 'gia-ton',
    parentId: 'POU-BOARD',
    name: 'Ngành Thiếu',
    unitType: 'BRANCH',
    description: null,
    sortOrder: 2,
    isActive: true,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
]

const mockTerms: ParishServiceTerm[] = [
  {
    id: 'PST-1',
    parishId: 'gia-ton',
    personId: 'PPE-1',
    unitId: 'POU-BRANCH-THIEU',
    positionTitle: 'Trưởng ngành',
    positionCode: 'BRANCH_LEADER',
    rankTitle: 'Huynh trưởng Cấp II',
    startDate: '2023-09-01',
    endDate: null,
    notes: 'Phụ trách sinh hoạt ngành Thiếu',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'PST-2',
    parishId: 'gia-ton',
    personId: 'PPE-1',
    unitId: 'POU-BRANCH-THIEU',
    positionTitle: 'Phó ngành',
    positionCode: null,
    rankTitle: 'Huynh trưởng Cấp I',
    startDate: '2021-09-01',
    endDate: '2023-08-31',
    notes: 'Nhiệm kỳ hoàn thành xuất sắc',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
]

const mockRecords: ParishRecord[] = [
  {
    id: 'REC-ACHIEVE-1',
    parishId: 'gia-ton',
    recordType: 'ACHIEVEMENT',
    title: 'Giải Nhất Hội thi Giáo lý Giáo hạt',
    summary: 'Đoàn sinh và huynh trưởng đạt thành tích xuất sắc',
    content: null,
    occurredOn: '2024-06-15',
    endedOn: null,
    location: 'Giáo xứ Chính Tòa',
    status: 'PUBLISHED',
    visibility: 'STAFF',
    showOnTimeline: true,
    sourceEventId: null,
    personIds: ['PPE-1'],
    assetIds: ['AST-1'],
    publishedAt: '2024-06-16T00:00:00Z',
    createdAt: '2024-06-16T00:00:00Z',
    updatedAt: '2024-06-16T00:00:00Z',
  },
  {
    id: 'REC-ACT-1',
    parishId: 'gia-ton',
    recordType: 'ACTIVITY',
    title: 'Sa mạc Huấn luyện Vươn Lên',
    summary: 'Huấn luyện kỹ năng sinh hoạt và dã ngoại ngoài trời',
    content: null,
    occurredOn: '2023-07-20',
    endedOn: '2023-07-22',
    location: 'Đồi Foyer de Charité',
    status: 'PUBLISHED',
    visibility: 'STAFF',
    showOnTimeline: true,
    sourceEventId: null,
    personIds: ['PPE-1'],
    assetIds: [],
    publishedAt: '2023-07-23T00:00:00Z',
    createdAt: '2023-07-23T00:00:00Z',
    updatedAt: '2023-07-23T00:00:00Z',
  },
]

const mockAssets: ParishArchiveAsset[] = [
  {
    id: 'AST-1',
    parishId: 'gia-ton',
    assetType: 'IMAGE',
    title: 'Ảnh trao giải Hội thi Giáo lý',
    description: null,
    capturedOn: '2024-06-15',
    storageType: 'EXTERNAL',
    externalUrl: 'https://example.com/award.jpg',
    originalFilename: 'award.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 102400,
    visibility: 'STAFF',
    createdAt: '2024-06-16T00:00:00Z',
    updatedAt: '2024-06-16T00:00:00Z',
  },
]

describe('ParishPersonDetailModal', () => {
  const unitsById = new Map(mockUnits.map(u => [u.id, u]))
  const onClose = vi.fn()
  const onEdit = vi.fn()
  const onAddTerm = vi.fn()
  const onEditTerm = vi.fn()
  const onViewAsset = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
  })

  it('renders hero section with holy name, full name, avatar letters, age, rank and service status badge', () => {
    render(
      <ParishPersonDetailModal
        person={mockPerson}
        terms={mockTerms}
        records={mockRecords}
        unitsById={unitsById}
        accounts={mockAccounts}
        assets={mockAssets}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('Hồ Sơ Huynh Trưởng / GLV')).toBeInTheDocument()
    expect(screen.getByText('Giuse')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.getByText('GN')).toBeInTheDocument() // Avatar initials (Giuse Nguyễn)
    expect(screen.getByText('Đang phục vụ')).toBeInTheDocument()
    expect(screen.getAllByText('Huynh trưởng Cấp II')[0]).toBeInTheDocument()
    expect(screen.getByText(/Sinh năm 1996/)).toBeInTheDocument()
  })

  it('renders linked user account information with role badge and full name', () => {
    render(
      <ParishPersonDetailModal
        person={mockPerson}
        terms={mockTerms}
        records={mockRecords}
        unitsById={unitsById}
        accounts={mockAccounts}
        assets={mockAssets}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('Tài khoản Catevia:')).toBeInTheDocument()
    expect(screen.getByText('Ban Quản trị')).toBeInTheDocument()
  })

  it('renders key metrics correctly (terms count, active roles, records count, service span)', () => {
    render(
      <ParishPersonDetailModal
        person={mockPerson}
        terms={mockTerms}
        records={mockRecords}
        unitsById={unitsById}
        accounts={mockAccounts}
        assets={mockAssets}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('Nhiệm kỳ')).toBeInTheDocument()
    expect(screen.getByTestId('metric-terms-count')).toHaveTextContent('2')
    expect(screen.getByText('Đang đảm trách')).toBeInTheDocument()
    expect(screen.getByTestId('metric-active-count')).toHaveTextContent('1')
    expect(screen.getByText('Bản ghi & Mốc')).toBeInTheDocument()
    expect(screen.getByTestId('metric-records-count')).toHaveTextContent('2')
    expect(screen.getByText('Thời gian phục vụ')).toBeInTheDocument()
    expect(screen.getByTestId('metric-service-span')).toHaveTextContent(/2021 – nay/)
  })

  it('switches between tabs (overview, terms, records)', () => {
    render(
      <ParishPersonDetailModal
        person={mockPerson}
        terms={mockTerms}
        records={mockRecords}
        unitsById={unitsById}
        accounts={mockAccounts}
        assets={mockAssets}
        onClose={onClose}
      />,
    )

    // Tab 1 (Overview) is active by default
    expect(screen.getByText('Tiểu sử & Ghi nhận Tông đồ')).toBeInTheDocument()

    // Switch to Tab 2 (Terms)
    const termsTab = screen.getByRole('button', { name: /Lịch sử Nhiệm kỳ/i })
    fireEvent.click(termsTab)
    expect(screen.getByText(/Toàn bộ dòng thời gian đảm nhiệm/i)).toBeInTheDocument()

    // Switch to Tab 3 (Records)
    const recordsTab = screen.getByRole('button', { name: /Hoạt động & Thành tích/i })
    fireEvent.click(recordsTab)
    expect(screen.getByText(/Khen thưởng & Thành tích đạt được/i)).toBeInTheDocument()
  })

  it('displays active positions and biography quote in overview tab', () => {
    render(
      <ParishPersonDetailModal
        person={mockPerson}
        terms={mockTerms}
        records={mockRecords}
        unitsById={unitsById}
        accounts={mockAccounts}
        assets={mockAssets}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('Trưởng ngành')).toBeInTheDocument()
    expect(screen.getByText('Ngành Thiếu')).toBeInTheDocument()
    expect(screen.getByText('Điều phối')).toBeInTheDocument()
    expect(screen.getByText(/Đã tuyên hứa Huynh trưởng năm 2018/)).toBeInTheDocument()
  })

  it('separates active terms from past terms in terms tab and displays term notes', () => {
    render(
      <ParishPersonDetailModal
        person={mockPerson}
        terms={mockTerms}
        records={mockRecords}
        unitsById={unitsById}
        accounts={mockAccounts}
        assets={mockAssets}
        onClose={onClose}
      />,
    )

    const termsTab = screen.getByRole('button', { name: /Lịch sử Nhiệm kỳ/i })
    fireEvent.click(termsTab)

    expect(screen.getByText(/Đang phục vụ \(1\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Nhiệm kỳ tiền nhiệm \(1\)/i)).toBeInTheDocument()
    expect(screen.getByText('"Phụ trách sinh hoạt ngành Thiếu"')).toBeInTheDocument()
    expect(screen.getByText('"Nhiệm kỳ hoàn thành xuất sắc"')).toBeInTheDocument()
  })

  it('separates achievements from activities in records tab with award styling', () => {
    render(
      <ParishPersonDetailModal
        person={mockPerson}
        terms={mockTerms}
        records={mockRecords}
        unitsById={unitsById}
        accounts={mockAccounts}
        assets={mockAssets}
        onClose={onClose}
      />,
    )

    const recordsTab = screen.getByRole('button', { name: /Hoạt động & Thành tích/i })
    fireEvent.click(recordsTab)

    expect(screen.getByText('Giải Nhất Hội thi Giáo lý Giáo hạt')).toBeInTheDocument()
    expect(screen.getByText('Giáo xứ Chính Tòa')).toBeInTheDocument()
    expect(screen.getByText('Sa mạc Huấn luyện Vươn Lên')).toBeInTheDocument()
    expect(screen.getByText('Đồi Foyer de Charité')).toBeInTheDocument()
  })

  it('displays related assets gallery and invokes onViewAsset when clicked', () => {
    render(
      <ParishPersonDetailModal
        person={mockPerson}
        terms={mockTerms}
        records={mockRecords}
        unitsById={unitsById}
        accounts={mockAccounts}
        assets={mockAssets}
        onClose={onClose}
        onViewAsset={onViewAsset}
      />,
    )

    const recordsTab = screen.getByRole('button', { name: /Hoạt động & Thành tích/i })
    fireEvent.click(recordsTab)

    expect(screen.getByText(/Kho Tư liệu & Hình ảnh liên quan/i)).toBeInTheDocument()
    const assetBtn = screen.getByRole('button', { name: /Ảnh trao giải Hội thi Giáo lý/i })
    fireEvent.click(assetBtn)
    expect(onViewAsset).toHaveBeenCalledWith(mockAssets[0])
  })

  it('copies person id to clipboard and triggers success toast', async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } })

    render(
      <ParishPersonDetailModal
        person={mockPerson}
        terms={mockTerms}
        records={mockRecords}
        unitsById={unitsById}
        accounts={mockAccounts}
        assets={mockAssets}
        onClose={onClose}
      />,
    )

    const copyBtn = screen.getByRole('button', { name: /Sao chép mã định danh/i })
    fireEvent.click(copyBtn)

    expect(writeTextSpy).toHaveBeenCalledWith('PPE-1')
    await waitFor(() => {
      expect(useToastStore.getState().toasts.some(t => t.message.includes('Đã sao chép mã định danh'))).toBe(true)
    })
  })

  it('handles action buttons: edit person, add term, edit term, and close modal', () => {
    render(
      <ParishPersonDetailModal
        person={mockPerson}
        terms={mockTerms}
        records={mockRecords}
        unitsById={unitsById}
        accounts={mockAccounts}
        assets={mockAssets}
        canManage={true}
        onClose={onClose}
        onEdit={onEdit}
        onAddTerm={onAddTerm}
        onEditTerm={onEditTerm}
      />,
    )

    // Edit person
    const editBtn = screen.getByRole('button', { name: /Chỉnh sửa/i })
    fireEvent.click(editBtn)
    expect(onEdit).toHaveBeenCalled()

    // Add term from footer
    const addTermBtn = screen.getByRole('button', { name: /Thêm nhiệm kỳ/i })
    fireEvent.click(addTermBtn)
    expect(onAddTerm).toHaveBeenCalled()

    // Edit term from overview active term card
    const editTermBtn = screen.getByRole('button', { name: /Sửa nhiệm kỳ Trưởng ngành/i })
    fireEvent.click(editTermBtn)
    expect(onEditTerm).toHaveBeenCalledWith(mockTerms[0])

    // Close modal
    const closeButtons = screen.getAllByRole('button', { name: /Đóng/i })
    fireEvent.click(closeButtons[closeButtons.length - 1])
    expect(onClose).toHaveBeenCalled()
  })
})
