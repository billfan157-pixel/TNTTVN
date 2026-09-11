import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ParishProfilePage from '../../pages/ParishProfilePage'
import { api } from '../../lib/api'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { setTenantScope } from '../../lib/tenantScope'
import type { ParishProfileSnapshot } from '../../types/parishProfile'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

const snapshot: ParishProfileSnapshot = {
  profile: {
    parishId: 'gia-ton', displayName: 'Xứ Đoàn Đức Mẹ Fatima', patronName: 'Đức Mẹ Fatima',
    foundedDate: '1998-05-13', motto: 'Cầu nguyện – Rước lễ – Hy sinh – Làm tông đồ',
    description: 'Cùng nhau phụng sự.', updatedBy: 'USR-1', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  },
  people: [{
    id: 'PPE-1', parishId: 'gia-ton', linkedUserId: null, holyName: 'Giuse', fullName: 'Nguyễn Văn A', birthYear: 1990,
    biography: 'Phục vụ từ năm 2010.', serviceStatus: 'ACTIVE', visibility: 'STAFF', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  }],
  units: [{
    id: 'POU-1', parishId: 'gia-ton', parentId: null, name: 'Ban Điều Hành', unitType: 'BOARD', description: null,
    sortOrder: 0, isActive: true, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  }],
  terms: [{
    id: 'PST-1', parishId: 'gia-ton', personId: 'PPE-1', unitId: 'POU-1', positionTitle: 'Xứ đoàn trưởng', positionCode: 'PARISH_LEADER', rankTitle: 'Huynh trưởng cấp III',
    startDate: '2024-01-01', endDate: null, notes: null, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  }],
  records: [
    { id: 'PRC-1', parishId: 'gia-ton', recordType: 'MILESTONE', title: 'Ngày thành lập', summary: 'Cột mốc khai sinh Xứ đoàn.', content: null, occurredOn: '1998-05-13', endedOn: null, location: null, status: 'PUBLISHED', visibility: 'STAFF', showOnTimeline: true, sourceEventId: null, personIds: [], assetIds: [], publishedAt: '2026-08-31T00:00:00Z', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z' },
    { id: 'PRC-2', parishId: 'gia-ton', recordType: 'ACTIVITY', title: 'Trại hè 2026', summary: null, content: null, occurredOn: '2026-06-01', endedOn: null, location: 'Giáo xứ', status: 'PUBLISHED', visibility: 'STAFF', showOnTimeline: true, sourceEventId: null, personIds: ['PPE-1'], assetIds: [], publishedAt: '2026-08-31T00:00:00Z', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z' },
  ],
  assets: [],
  timeline: [{ id: 'PRC-2', kind: 'RECORD', date: '2026-06-01', endDate: null, title: 'Trại hè 2026', summary: null, recordType: 'ACTIVITY' }],
  accounts: [],
  permissions: { canManage: true, canUpload: true },
}

describe('ParishProfilePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setTenantScope({ parishId: 'gia-ton', userId: 'USR-1' })
    useParishProfileStore.getState().clear()
    vi.spyOn(api.parishProfile, 'getSnapshot').mockResolvedValue(snapshot)
  })

  afterEach(() => {
    setTenantScope(null)
  })

  it('hiển thị hồ sơ cấp Xứ đoàn và sáu phân khu nghiệp vụ', async () => {
    render(<ParishProfilePage />)
    expect(await screen.findByRole('heading', { name: 'Xứ Đoàn Đức Mẹ Fatima' })).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(6)
    expect(screen.getByText('Cột mốc khai sinh Xứ đoàn.')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Timeline/i }))
    expect(screen.getByText('Trại hè 2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Cơ cấu/i }))
    expect(screen.getAllByText('Ban Điều Hành')).toHaveLength(2)
    expect(screen.getByText(/Xứ đoàn trưởng/)).toBeTruthy()
    expect(screen.getAllByText('Điều phối').length).toBeGreaterThan(0)
  })

  it('xếp nhiệm kỳ có quyền điều phối trước nhiệm kỳ không quyền', async () => {
    vi.mocked(api.parishProfile.getSnapshot).mockResolvedValue({
      ...snapshot,
      terms: [
        {
          id: 'PST-0', parishId: 'gia-ton', personId: 'PPE-1', unitId: 'POU-1', positionTitle: 'Thủ quỹ', positionCode: null, rankTitle: null,
          startDate: '2024-01-01', endDate: null, notes: null, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
        },
        ...snapshot.terms,
      ],
    })
    render(<ParishProfilePage />)
    await screen.findByText('Xứ Đoàn Đức Mẹ Fatima')
    fireEvent.click(screen.getByRole('tab', { name: /Cơ cấu/i }))
    const titles = await screen.findAllByText(/Xứ đoàn trưởng|Thủ quỹ/)
    expect(titles[0].textContent).toMatch(/Xứ đoàn trưởng/)
  })

  it('hiển thị Ngành và Ban chuyên môn ngang cấp và cho một người kiêm hai nhiệm kỳ', async () => {
    vi.mocked(api.parishProfile.getSnapshot).mockResolvedValue({
      ...snapshot,
      units: [
        ...snapshot.units,
        {
          id: 'POU-BRANCH', parishId: 'gia-ton', parentId: 'POU-1', name: 'Ngành Thiếu', unitType: 'BRANCH', description: null,
          sortOrder: 1, isActive: true, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
        },
        {
          id: 'POU-COMMITTEE', parishId: 'gia-ton', parentId: 'POU-1', name: 'Ban Truyền thông', unitType: 'COMMITTEE', description: null,
          sortOrder: 2, isActive: true, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
        },
      ],
      terms: [
        ...snapshot.terms,
        {
          id: 'PST-BRANCH', parishId: 'gia-ton', personId: 'PPE-1', unitId: 'POU-BRANCH', positionTitle: 'Trưởng ngành', positionCode: 'BRANCH_LEADER', rankTitle: null,
          startDate: '2026-01-01', endDate: null, notes: null, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
        },
        {
          id: 'PST-COMMITTEE', parishId: 'gia-ton', personId: 'PPE-1', unitId: 'POU-COMMITTEE', positionTitle: 'Trưởng ban', positionCode: 'COMMITTEE_LEADER', rankTitle: null,
          startDate: '2026-01-01', endDate: null, notes: null, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
        },
      ],
    })

    render(<ParishProfilePage />)
    await screen.findByText('Xứ Đoàn Đức Mẹ Fatima')
    fireEvent.click(screen.getByRole('tab', { name: /Cơ cấu/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Sơ đồ phân cấp' }))

    expect(screen.getByRole('heading', { name: /Ngành & Ban chuyên môn — song song \(2\)/i })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Các Ngành' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Các Ban chuyên môn' })).toBeTruthy()
    expect(screen.getByText(/Trưởng ngành phụ trách công tác giáo lý/)).toBeTruthy()
    expect(screen.getAllByText(/Nguyễn Văn A/)).toHaveLength(3)
    expect(screen.getByText('Trưởng ngành')).toBeTruthy()
    expect(screen.getByText('Trưởng ban')).toBeTruthy()
  })

  it('không hiện thao tác quản trị khi snapshot chỉ cho phép đọc', async () => {
    vi.mocked(api.parishProfile.getSnapshot).mockResolvedValue({ ...snapshot, permissions: { canManage: false, canUpload: false } })
    render(<ParishProfilePage />)
    await waitFor(() => expect(screen.getByText('Xứ Đoàn Đức Mẹ Fatima')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Cập nhật' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Sửa Ngày thành lập/ })).toBeNull()
  })

  it('uses the shared vertical form-group contract inside the editor modal', async () => {
    render(<ParishProfilePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cập nhật' }))

    const nameInput = screen.getByLabelText('Tên Xứ đoàn *')
    expect(nameInput.closest('label')?.classList.contains('form-group')).toBe(true)
    expect(document.querySelector('.form-field')).toBeNull()
  })

  it('hiển thị danh sách kho tư liệu kèm nút sắp xếp và ảnh xem trước', async () => {
    vi.mocked(api.parishProfile.getSnapshot).mockResolvedValue({
      ...snapshot,
      assets: [
        {
          id: 'ASSET-1',
          parishId: 'gia-ton',
          assetType: 'IMAGE',
          title: 'Ảnh Bế mạc năm học',
          description: 'Hình chụp bế giảng',
          capturedOn: '2026-05-15',
          storageType: 'EXTERNAL',
          externalUrl: 'https://example.com/photo-b.jpg',
          originalFilename: 'photo-b.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 102400,
          visibility: 'STAFF',
          createdAt: '2026-05-15T00:00:00Z',
          updatedAt: '2026-05-15T00:00:00Z',
        },
        {
          id: 'ASSET-2',
          parishId: 'gia-ton',
          assetType: 'IMAGE',
          title: 'Ảnh Khai giảng năm học',
          description: 'Hình chụp khai giảng',
          capturedOn: '2026-09-01',
          storageType: 'EXTERNAL',
          externalUrl: 'https://example.com/photo-a.jpg',
          originalFilename: 'photo-a.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 204800,
          visibility: 'STAFF',
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
      ],
    })

    render(<ParishProfilePage />)
    fireEvent.click(await screen.findByRole('tab', { name: /Kho tư liệu/i }))

    expect(screen.getByText('Ảnh Bế mạc năm học')).toBeTruthy()
    expect(screen.getByText('Ảnh Khai giảng năm học')).toBeTruthy()

    // Preview images exist
    const previewImages = screen.getAllByRole('img')
    const externalImg = previewImages.find(img => img.getAttribute('src') === 'https://example.com/photo-a.jpg')
    expect(externalImg).toBeTruthy()

    // Sort control is available
    const sortSelect = screen.getByLabelText('Sắp xếp tư liệu') as HTMLSelectElement
    expect(sortSelect).toBeTruthy()
    expect(sortSelect.value).toBe('newest')

    // Change sort to title_asc
    fireEvent.change(sortSelect, { target: { value: 'title_asc' } })
    expect(sortSelect.value).toBe('title_asc')

    // In title_asc order: 'Ảnh Bế mạc năm học' comes before 'Ảnh Khai giảng năm học'
    const headings = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
    const idxB = headings.indexOf('Ảnh Bế mạc năm học')
    const idxA = headings.indexOf('Ảnh Khai giảng năm học')
    expect(idxB).toBeLessThan(idxA)
  })

  it('cho phép chọn và tải lên nhiều tư liệu ảnh cùng lúc', async () => {
    const uploadSpy = vi.spyOn(api.parishProfile, 'uploadAsset').mockResolvedValue({} as any)

    render(<ParishProfilePage />)
    fireEvent.click(await screen.findByRole('tab', { name: /Kho tư liệu/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tư liệu' }))

    // Modal opens
    expect(await screen.findByRole('heading', { name: /Tư liệu Xứ đoàn/i })).toBeTruthy()

    // File input with multiple attribute exists
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    expect(fileInput.multiple).toBe(true)

    // Simulate selecting 2 files
    const file1 = new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['content2'], 'photo2.png', { type: 'image/png' })
    fireEvent.change(fileInput, { target: { files: [file1, file2] } })

    // Check list of selected files rendered
    expect(await screen.findByText('photo1.jpg')).toBeTruthy()
    expect(screen.getByText('photo2.png')).toBeTruthy()
    expect(screen.getByText(/Đã chọn 2 tệp/)).toBeTruthy()

    // Set common title prefix
    const titleInput = screen.getByLabelText(/Tiêu đề/)
    fireEvent.change(titleInput, { target: { value: 'Trại hè 2026' } })

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Tải lên 2 tệp' }))

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledTimes(2)
    })
    expect(uploadSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: 'Trại hè 2026 (1)',
      file: file1,
    }))
    expect(uploadSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: 'Trại hè 2026 (2)',
      file: file2,
    }))
  })

  it('chuyển hướng về Tổng Quan Xứ Đoàn khi bấm breadcrumb hoặc nút Về Tổng Quan', async () => {
    render(<ParishProfilePage />)
    await screen.findByText('Xứ Đoàn Đức Mẹ Fatima')

    // Click breadcrumb
    const breadcrumbBtn = screen.getByTitle('Quay về trang Tổng Quan Xứ Đoàn')
    fireEvent.click(breadcrumbBtn)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/parish' })

    // Click Về Tổng Quan header button
    const backHeaderBtn = screen.getByRole('button', { name: /Về Tổng Quan/i })
    fireEvent.click(backHeaderBtn)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/parish' })
  })

  it('tự động kích hoạt đúng tab khi URL có query parameter tab=organization', async () => {
    window.history.pushState({}, '', '/parish-profile?tab=organization')
    render(<ParishProfilePage />)
    await screen.findByText('Xứ Đoàn Đức Mẹ Fatima')

    const orgTab = screen.getByRole('tab', { name: /Cơ Cấu/i })
    expect(orgTab).toHaveAttribute('aria-selected', 'true')
  })
})
