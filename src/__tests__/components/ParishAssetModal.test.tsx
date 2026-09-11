import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { ParishAssetModal } from '../../components/parish/ParishAssetModal'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import type { ParishArchiveAsset, ParishProfileSnapshot } from '../../types/parishProfile'

beforeAll(() => {
  if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  }
  if (!global.URL.revokeObjectURL) {
    global.URL.revokeObjectURL = vi.fn()
  }
})

const mockSnapshot: ParishProfileSnapshot = {
  profile: {
    parishId: 'test-parish',
    displayName: 'Xứ Đoàn Kitô Vua',
    patronName: 'Chúa Kitô Vua',
    foundedDate: '2010-11-21',
    motto: 'Hy Sinh - Phụng Sự',
    description: 'Xứ đoàn TNTT',
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
  },
  people: [
    {
      id: 'PPE-1',
      parishId: 'test-parish',
      linkedUserId: 'USR-1',
      holyName: 'Giuse',
      fullName: 'Nguyễn Văn A',
      birthYear: 1995,
      biography: null,
      serviceStatus: 'ACTIVE',
      visibility: 'STAFF',
      createdAt: '',
      updatedAt: '',
    },
  ],
  units: [],
  terms: [],
  records: [
    {
      id: 'REC-1',
      parishId: 'test-parish',
      recordType: 'ACTIVITY',
      title: 'Hội Trại Sa Mạc Vươn Lên 2026',
      summary: 'Trại huấn luyện kỹ năng',
      content: 'Chi tiết hội trại',
      occurredOn: '2026-07-15',
      endedOn: '2026-07-17',
      location: 'Đồng Nai',
      status: 'PUBLISHED',
      visibility: 'STAFF',
      showOnTimeline: true,
      sourceEventId: null,
      personIds: [],
      assetIds: [],
      publishedAt: null,
      createdAt: '',
      updatedAt: '',
    },
  ],
  assets: [],
  timeline: [],
  accounts: [],
  permissions: { canManage: true, canUpload: true },
}

describe('ParishAssetModal', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
  })

  it('renders modal with title, segmented mode switcher, upload zone, type chips, and submit button', () => {
    render(
      <ParishAssetModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByText('Thêm Tư Liệu Xứ Đoàn Mới')).toBeTruthy()
    expect(screen.getByText(/Tải tệp từ máy/i)).toBeTruthy()
    expect(screen.getByText(/Liên kết ngoài/i)).toBeTruthy()
    expect(screen.getByText(/1\. Chọn & Kéo Thả Tệp/i)).toBeTruthy()
    expect(screen.getByText(/2\. Phân Loại Tư Liệu/i)).toBeTruthy()
    expect(screen.getByText(/Ảnh tư liệu/i)).toBeTruthy()
    expect(screen.getByText(/Poster \/ Banner/i)).toBeTruthy()
    expect(screen.getByText(/3\. Thông Tin Chi Tiết & Bảo Mật/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Lưu tư liệu/i })).toBeTruthy()
  })

  it('switches between UPLOAD and EXTERNAL storage modes', () => {
    render(
      <ParishAssetModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Switch to External
    const externalBtn = screen.getByRole('button', { name: /Liên kết ngoài/i })
    fireEvent.click(externalBtn)

    expect(screen.getByText(/1\. Liên Kết Tư Liệu Ngoại Vi/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/https:\/\/www\.youtube\.com/i)).toBeTruthy()

    // Switch back to Upload
    const uploadBtn = screen.getByRole('button', { name: /Tải tệp từ máy/i })
    fireEvent.click(uploadBtn)

    expect(screen.getByText(/1\. Chọn & Kéo Thả Tệp/i)).toBeTruthy()
  })

  it('handles file selection and displays preview card with file details', () => {
    render(
      <ParishAssetModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const file = new File(['image dummy content'], 'trai-he-2026.png', { type: 'image/png' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(screen.getByText('trai-he-2026.png')).toBeTruthy()
    expect(screen.getAllByText(/PNG/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Đã chọn 1 tệp/i)).toBeTruthy()
  })

  it('shows warning when a file exceeds 8MB limit', () => {
    render(
      <ParishAssetModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    // Create a 9MB file
    const largeContent = new Uint8Array(9 * 1024 * 1024)
    const largeFile = new File([largeContent], 'video-lon.pdf', { type: 'application/pdf' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(fileInput, { target: { files: [largeFile] } })

    expect(screen.getByText(/Vượt 8MB/i)).toBeTruthy()
    expect(screen.getByText(/Một số tệp vượt quá 8 MiB cho phép/i)).toBeTruthy()
  })

  it('auto-detects assetType from external URL', () => {
    render(
      <ParishAssetModal
        initialStorageMode="EXTERNAL"
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const urlInput = screen.getByPlaceholderText(/https:\/\/www\.youtube\.com/i)

    // Type YouTube URL
    fireEvent.change(urlInput, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } })

    // Should auto-select Video
    const videoChip = screen.getByRole('button', { name: /Video Phóng sự, clip tóm tắt hoạt động/i })
    expect(videoChip.className).toContain('bg-parish-primary')
  })

  it('applies date presets correctly', () => {
    render(
      <ParishAssetModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const todayBtn = screen.getByRole('button', { name: /Hôm nay/i })
    fireEvent.click(todayBtn)

    const dateInput = screen.getByLabelText(/Ngày ghi hình \/ phát hành/i) as HTMLInputElement
    expect(dateInput.value).toBe(new Date().toISOString().slice(0, 10))

    const sundayBtn = screen.getByRole('button', { name: /Chủ nhật vừa qua/i })
    fireEvent.click(sundayBtn)
    expect(dateInput.value).toBeTruthy()
  })

  it('validates required fields and shows toast when submitting without files in UPLOAD mode', async () => {
    render(
      <ParishAssetModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const submitBtn = screen.getByRole('button', { name: /Lưu tư liệu/i })
    fireEvent.click(submitBtn)

    expect(useToastStore.getState().toasts[0]?.message).toMatch(/Vui lòng chọn ít nhất một tệp/i)
  })

  it('validates external URL and requires HTTPS protocol in EXTERNAL mode', async () => {
    render(
      <ParishAssetModal
        initialStorageMode="EXTERNAL"
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const titleInput = screen.getByPlaceholderText(/Nhập tên hoặc tiêu đề ngắn gọn của tư liệu/i)
    fireEvent.change(titleInput, { target: { value: 'Video Lễ Bổn Mạng' } })

    const urlInput = screen.getByPlaceholderText(/https:\/\/www\.youtube\.com/i)
    fireEvent.change(urlInput, { target: { value: 'http://insecure-site.com/video.mp4' } })

    const submitBtn = screen.getByRole('button', { name: /Lưu tư liệu/i })
    fireEvent.click(submitBtn)

    expect(useToastStore.getState().toasts[0]?.message).toMatch(/giao thức HTTPS bảo mật/i)
  })

  it('uploads files successfully when form is valid', async () => {
    const uploadAssetsMock = vi.fn().mockResolvedValue(true)
    vi.spyOn(useParishProfileStore.getState(), 'uploadAssets').mockImplementation(uploadAssetsMock)

    render(
      <ParishAssetModal
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    const file = new File(['content'], 'thanh-le.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    const titleInput = screen.getByPlaceholderText(/Nhập tên hoặc tiêu đề ngắn gọn của tư liệu/i)
    fireEvent.change(titleInput, { target: { value: 'Thánh Lễ Khai Giảng' } })

    const submitBtn = screen.getByRole('button', { name: /Lưu tư liệu/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(uploadAssetsMock).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalled()
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('retains previews when adding files and allocates no URL for duplicate selections', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const { unmount } = render(<ParishAssetModal snapshot={mockSnapshot} onClose={onClose} onSuccess={onSuccess} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const first = new File(['a'], 'first.jpg', { type: 'image/jpeg' })
    const second = new File(['b'], 'second.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [first, first] } })
    fireEvent.change(input, { target: { files: [first, second] } })
    expect(create).toHaveBeenCalledTimes(2)
    expect(revoke).not.toHaveBeenCalled()
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:first')
    expect(revoke).toHaveBeenCalledWith('blob:second')
  })

  it('retries only the unacknowledged file after a partial upload', async () => {
    const upload = vi.spyOn(useParishProfileStore.getState(), 'uploadAssets')
      .mockImplementationOnce(async (_inputs, progress) => { progress?.(1, 2); return false })
      .mockResolvedValueOnce(true)
    render(<ParishAssetModal snapshot={mockSnapshot} onClose={onClose} onSuccess={onSuccess} />)
    const first = new File(['a'], 'first.jpg', { type: 'image/jpeg' })
    const second = new File(['b'], 'second.jpg', { type: 'image/jpeg' })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [first, second] } })
    fireEvent.submit(document.getElementById('parish-asset-modal-form')!)
    await waitFor(() => expect(screen.queryByText('first.jpg')).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Lưu tư liệu/i }))
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
    expect(upload.mock.calls[1][0].map(input => input.file)).toEqual([second])
  })

  it('renders edit mode with existing asset data and submits update', async () => {
    const existingAsset: ParishArchiveAsset = {
      id: 'AST-1',
      parishId: 'test-parish',
      assetType: 'POSTER',
      title: 'Poster Hội Trại 2026',
      description: 'Ấn phẩm truyền thông chính thức',
      capturedOn: '2026-06-01',
      storageType: 'EXTERNAL',
      externalUrl: 'https://images.unsplash.com/photo-example',
      originalFilename: null,
      mimeType: 'image/jpeg',
      sizeBytes: 102400,
      visibility: 'STAFF',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
    }

    const updateAssetMock = vi.fn().mockResolvedValue(true)
    vi.spyOn(useParishProfileStore.getState(), 'updateAsset').mockImplementation(updateAssetMock)

    render(
      <ParishAssetModal
        asset={existingAsset}
        snapshot={mockSnapshot}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByText('Chỉnh Sửa Tư Liệu Xứ Đoàn')).toBeTruthy()
    expect(screen.getByText('Tư Liệu Hiện Tại')).toBeTruthy()
    expect(screen.getByDisplayValue('Poster Hội Trại 2026')).toBeTruthy()
    expect(screen.getByDisplayValue('Ấn phẩm truyền thông chính thức')).toBeTruthy()

    const submitBtn = screen.getByRole('button', { name: /Lưu thay đổi/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(updateAssetMock).toHaveBeenCalledWith('AST-1', expect.objectContaining({
        title: 'Poster Hội Trại 2026',
        assetType: 'POSTER',
      }))
      expect(onClose).toHaveBeenCalled()
    })
  })
})
