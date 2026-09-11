import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ParishRecordModal } from '../../components/parish/ParishRecordModal'
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
  records: [
    {
      id: 'PRC-1',
      parishId: 'gia-ton',
      recordType: 'MILESTONE',
      title: 'Thành lập Xứ đoàn Đức Mẹ Fatima',
      summary: 'Khai sinh phong trào tại giáo xứ.',
      content: 'Ngày 13/05/1998 cha xứ công bố quyết định thành lập.',
      occurredOn: '1998-05-13',
      endedOn: null,
      location: 'Nhà thờ Giáo xứ',
      status: 'PUBLISHED',
      visibility: 'STAFF',
      showOnTimeline: true,
      sourceEventId: null,
      personIds: ['PPE-1'],
      assetIds: ['PAS-1'],
      publishedAt: '2026-08-31T00:00:00Z',
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    },
  ],
  assets: [
    {
      id: 'PAS-1',
      parishId: 'gia-ton',
      assetType: 'IMAGE',
      title: 'Ảnh khai sinh Xứ đoàn',
      description: 'Lễ thành lập năm 1998.',
      capturedOn: '1998-05-13',
      storageType: 'UPLOAD',
      externalUrl: null,
      originalFilename: 'khai-sinh.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 102400,
      visibility: 'STAFF',
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    },
    {
      id: 'PAS-2',
      parishId: 'gia-ton',
      assetType: 'DOCUMENT',
      title: 'Văn thư công nhận',
      description: 'Quyết định bổ nhiệm.',
      capturedOn: '1998-05-13',
      storageType: 'EXTERNAL',
      externalUrl: 'https://example.com/vanthu.pdf',
      originalFilename: 'vanthu.pdf',
      mimeType: 'application/pdf',
      sizeBytes: null,
      visibility: 'STAFF',
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    },
  ],
  timeline: [],
  accounts: [],
  permissions: { canManage: true, canUpload: true },
}

describe('ParishRecordModal', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    useParishProfileStore.getState().clear()
    useToastStore.setState({ toasts: [] })
  })

  it('renders modal with title, 4 structured sections, and submit buttons', () => {
    render(
      <ParishRecordModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Thêm Cột Mốc Lịch Sử Mới' })).toBeTruthy()
    expect(screen.getByText(/1\. Phân Loại & Thông Tin Cốt Lõi/)).toBeTruthy()
    expect(screen.getByText(/2\. Nội Dung & Tóm Tắt Bản Ghi/)).toBeTruthy()
    expect(screen.getByText(/3\. Gắn Thẻ Nhân Sự & Tư Liệu Số Liên Quan/)).toBeTruthy()
    expect(screen.getByText(/4\. Trạng Thái Xuất Bản & Dòng Thời Gian/)).toBeTruthy()
    expect(screen.getByText(/Xem trước thẻ bản ghi \(Live Preview\):/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Lưu bản ghi/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Hủy bỏ/i })).toBeTruthy()
  })

  it('renders in edit mode with existing record data pre-filled', () => {
    const existingRecord = mockSnapshot.records[0]
    render(
      <ParishRecordModal
        record={existingRecord}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Cập Nhật Bản Ghi Xứ Đoàn' })).toBeTruthy()
    expect(screen.getByDisplayValue('Thành lập Xứ đoàn Đức Mẹ Fatima')).toBeTruthy()
    expect(screen.getByDisplayValue('1998-05-13')).toBeTruthy()
    expect(screen.getByDisplayValue('Nhà thờ Giáo xứ')).toBeTruthy()
    expect(screen.getByDisplayValue('Khai sinh phong trào tại giáo xứ.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Lưu cập nhật/i })).toBeTruthy()
  })

  it('switches record type and updates title suggestions', () => {
    render(
      <ParishRecordModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Switch to ACHIEVEMENT
    const achievementBtn = screen.getByRole('button', { name: /Khen thưởng & Thành tích/i })
    fireEvent.click(achievementBtn)

    expect(screen.getByRole('heading', { name: 'Ghi Nhận Thành Tích & Khen Thưởng' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Giải Nhất Hội thi Giáo lý Toàn Giáo hạt/i })).toBeTruthy()

    // Click suggestion
    const suggestionBtn = screen.getByRole('button', { name: /Giải Nhất Hội thi Giáo lý Toàn Giáo hạt/i })
    fireEvent.click(suggestionBtn)

    expect(screen.getByDisplayValue('Giải Nhất Hội thi Giáo lý Toàn Giáo hạt')).toBeTruthy()
  })

  it('tags and untags personnel using smart person picker', () => {
    render(
      <ParishRecordModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Click "+ Gắn thẻ nhân sự"
    const openPickerBtn = screen.getByRole('button', { name: /\+ Gắn thẻ nhân sự/i })
    fireEvent.click(openPickerBtn)

    // Search for Maria
    const searchInput = screen.getByPlaceholderText(/Tìm theo tên thánh hoặc họ tên/i)
    fireEvent.change(searchInput, { target: { value: 'Maria' } })

    // Click to add Maria
    const addMariaBtn = screen.getByRole('button', { name: /Thêm Maria Trần Thị Bình/i })
    fireEvent.click(addMariaBtn)

    // Maria should be in the selected chips and live preview
    expect(screen.getAllByText('Maria Trần Thị Bình').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Gỡ thẻ Trần Thị Bình/i })).toBeTruthy()

    // Remove Maria
    const removeBtn = screen.getByRole('button', { name: /Gỡ thẻ Trần Thị Bình/i })
    fireEvent.click(removeBtn)

    expect(screen.queryByRole('button', { name: /Gỡ thẻ Trần Thị Bình/i })).toBeNull()
  })

  it('tags and untags assets using smart asset picker', () => {
    render(
      <ParishRecordModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Click "+ Gắn thẻ tư liệu"
    const openPickerBtn = screen.getByRole('button', { name: /\+ Gắn thẻ tư liệu/i })
    fireEvent.click(openPickerBtn)

    // Add first asset
    const addAssetBtn = screen.getByRole('button', { name: /Thêm Ảnh khai sinh Xứ đoàn/i })
    fireEvent.click(addAssetBtn)

    // Asset should be in chips
    expect(screen.getByText('Ảnh khai sinh Xứ đoàn')).toBeTruthy()

    // Remove asset
    const removeBtn = screen.getByRole('button', { name: /Gỡ thẻ Ảnh khai sinh Xứ đoàn/i })
    fireEvent.click(removeBtn)

    expect(screen.queryByRole('button', { name: /Gỡ thẻ Ảnh khai sinh Xứ đoàn/i })).toBeNull()
  })

  it('blocks submit if title is empty', async () => {
    render(
      <ParishRecordModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const submitBtn = screen.getByRole('button', { name: /Lưu bản ghi/i })
    fireEvent.click(submitBtn)

    expect(useToastStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Vui lòng nhập tiêu đề bản ghi', type: 'error' }),
      ]),
    )
  })

  it('blocks submit if endedOn is before occurredOn', async () => {
    render(
      <ParishRecordModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/VD: Thành lập Xứ đoàn/i), { target: { value: 'Trại hè' } })
    fireEvent.change(screen.getByLabelText(/Ngày bắt đầu/i), { target: { value: '2026-07-15' } })
    fireEvent.change(screen.getByLabelText(/Ngày kết thúc/i), { target: { value: '2026-07-10' } })

    const submitBtn = screen.getByRole('button', { name: /Lưu bản ghi/i })
    fireEvent.click(submitBtn)

    expect(useToastStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Ngày kết thúc không được trước ngày bắt đầu', type: 'error' }),
      ]),
    )
  })

  it('creates new record successfully and triggers callbacks', async () => {
    const createRecordSpy = vi.spyOn(useParishProfileStore.getState(), 'createRecord').mockResolvedValue(true)

    render(
      <ParishRecordModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/VD: Thành lập Xứ đoàn/i), {
      target: { value: 'Đại hội Giới trẻ 2026' },
    })
    fireEvent.change(screen.getByLabelText(/Ngày bắt đầu/i), { target: { value: '2026-08-15' } })
    fireEvent.change(screen.getByPlaceholderText(/VD: Hoa viên Giáo xứ/i), { target: { value: 'Trung tâm Mục vụ' } })
    fireEvent.change(screen.getByPlaceholderText(/Tóm tắt 1-2 câu/i), { target: { value: 'Ngày hội giao lưu.' } })

    const submitBtn = screen.getByRole('button', { name: /Lưu bản ghi/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(createRecordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          recordType: 'MILESTONE',
          title: 'Đại hội Giới trẻ 2026',
          occurredOn: '2026-08-15',
          location: 'Trung tâm Mục vụ',
          summary: 'Ngày hội giao lưu.',
        }),
      )
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('updates existing record successfully', async () => {
    const updateRecordSpy = vi.spyOn(useParishProfileStore.getState(), 'updateRecord').mockResolvedValue(true)
    const existingRecord = mockSnapshot.records[0]

    render(
      <ParishRecordModal
        record={existingRecord}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByDisplayValue('Thành lập Xứ đoàn Đức Mẹ Fatima'), {
      target: { value: 'Thành lập Xứ đoàn Đức Mẹ Fatima (Chính thức)' },
    })

    const submitBtn = screen.getByRole('button', { name: /Lưu cập nhật/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(updateRecordSpy).toHaveBeenCalledWith(
        'PRC-1',
        expect.objectContaining({
          title: 'Thành lập Xứ đoàn Đức Mẹ Fatima (Chính thức)',
        }),
      )
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('displays error toast when store returns false', async () => {
    vi.spyOn(useParishProfileStore.getState(), 'createRecord').mockImplementation(async () => {
      useParishProfileStore.setState({ error: 'Lỗi ghi nhận bản ghi máy chủ' })
      return false
    })

    render(
      <ParishRecordModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/VD: Thành lập Xứ đoàn/i), {
      target: { value: 'Lễ Bổn Mạng' },
    })

    const submitBtn = screen.getByRole('button', { name: /Lưu bản ghi/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: 'Lỗi ghi nhận bản ghi máy chủ', type: 'error' }),
        ]),
      )
    })
  })
})
