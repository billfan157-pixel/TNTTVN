import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BackupRestoreModal } from '../../components/common/BackupRestoreModal'
import { httpFetch } from '../../lib/api'

const recoveryFns = vi.hoisted(() => ({
  resetClientData: vi.fn().mockResolvedValue(undefined),
  getOwnUnsettledSyncOperations: vi.fn().mockResolvedValue([]),
  logout: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  httpFetch: {
    get: vi.fn().mockResolvedValue({
      version: '2.0-production',
      data: { students: [{ id: 'ST-1', fullName: 'Test' }], grades: [], attendance: [] }
    }),
    post: vi.fn().mockResolvedValue({
      success: true,
      message: 'Khôi phục thành công dữ liệu 1 em thiếu nhi!',
      purgeVersion: 2,
    })
  }
}))

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))
vi.mock('../../lib/resetClientData', () => ({ resetClientData: recoveryFns.resetClientData }))
vi.mock('../../stores/syncStore', () => ({ getOwnUnsettledSyncOperations: recoveryFns.getOwnUnsettledSyncOperations }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: { getState: () => ({ logout: recoveryFns.logout }) } }))

vi.mock('lucide-react', () => ({
  Database: 'svg', Download: 'svg', Upload: 'svg', CheckCircle: 'svg', X: 'svg', Loader2: 'svg',
}))

const mockCreateObjectURL = vi.fn(() => 'blob:test-url')
const mockRevokeObjectURL = vi.fn()

const ADMIN_PASSWORD = 'AdminXacNhan@123'

function typeAdminPassword(value: string = ADMIN_PASSWORD) {
  fireEvent.change(screen.getByLabelText('Mật Khẩu Admin (xác nhận)'), { target: { value } })
}

function getRestoreInput() {
  return screen.getByLabelText(/Khôi phục dữ liệu \(Chọn file\)/i)
}

describe('BackupRestoreModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    recoveryFns.resetClientData.mockResolvedValue(undefined)
    recoveryFns.getOwnUnsettledSyncOperations.mockResolvedValue([])
    vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL })
    vi.stubGlobal('alert', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<BackupRestoreModal isOpen={false} onClose={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders UI when open', () => {
    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Sao Lưu & Khôi Phục Dữ Liệu')).toBeDefined()
    expect(screen.getByText(/Tạo Bản Sao Lưu Dữ Liệu/)).toBeDefined()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<BackupRestoreModal isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn()
    render(<BackupRestoreModal isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows success message after export', async () => {
    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword()
    const exportBtn = screen.getByRole('button', { name: /Sao lưu dữ liệu/i })
    fireEvent.click(exportBtn)
    await vi.waitFor(() => {
      expect(screen.getByText(/Đã tạo và tải bản sao lưu/i)).toBeDefined()
    })
  })

  it('calls URL.createObjectURL during export', async () => {
    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword()
    const exportBtn = screen.getByRole('button', { name: /Sao lưu dữ liệu/i })
    fireEvent.click(exportBtn)
    await vi.waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled()
    })
  })

  // A-NEW-28 (2026-08-11): export gửi adminPassword trong BODY (POST) — không còn
  // trong query param (credential trong URL bị rò qua nginx access log / cache proxy).
  it('sends adminPassword in export POST body', async () => {
    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword('AdminXacNhan@123')
    fireEvent.click(screen.getByRole('button', { name: /Sao lưu dữ liệu/i }))
    await vi.waitFor(() => {
      expect(httpFetch.post).toHaveBeenCalledWith('/backup/export', { adminPassword: 'AdminXacNhan@123' })
    })
  })

  // A07 (negative): thiếu mật khẩu → chỉ báo lỗi, KHÔNG gọi API
  it('blocks export without admin password', async () => {
    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Sao lưu dữ liệu/i }))
    await vi.waitFor(() => {
      expect(screen.getByText('Vui lòng nhập mật khẩu Admin để xác nhận sao lưu')).toBeDefined()
    })
    expect(httpFetch.post).not.toHaveBeenCalled()
  })

  it('imports backup file and shows success', async () => {
    const fileContent = JSON.stringify({
      data: { students: [{ id: 'ST-001', fullName: 'Test Student' }], grades: [], attendance: [] },
    })
    const file = new File([fileContent], 'backup.json', { type: 'application/json' })

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword()
    const input = getRestoreInput()
    fireEvent.change(input, { target: { files: [file] } })

    await vi.waitFor(() => {
      expect(screen.getByText(/Khôi phục thành công/i)).toBeDefined()
    }, { timeout: 3000 })
    expect(recoveryFns.resetClientData).toHaveBeenCalledWith(2)
    expect(recoveryFns.logout).toHaveBeenCalledTimes(1)
  })

  it('does not report a committed restore as failed when local generation reset is temporarily unavailable', async () => {
    recoveryFns.resetClientData.mockRejectedValueOnce(new Error('quota'))
    const file = new File([JSON.stringify({
      data: { students: [{ id: 'UNTRUSTED', fullName: 'Uploaded row' }], grades: [], attendance: [] },
    })], 'backup.json', { type: 'application/json' })

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword()
    fireEvent.change(getRestoreInput(), { target: { files: [file] } })

    await vi.waitFor(() => {
      expect(screen.getByText(/Khôi phục trên máy chủ đã thành công/i)).toBeDefined()
    })
    expect(recoveryFns.logout).not.toHaveBeenCalled()
  })

  it('blocks restore while this device owns unsettled offline mutations', async () => {
    recoveryFns.getOwnUnsettledSyncOperations.mockResolvedValueOnce([{ id: 'pending-op' }] as any)
    const file = new File([JSON.stringify({ data: { students: [], grades: [], attendance: [] } })], 'backup.json', { type: 'application/json' })

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword()
    fireEvent.change(getRestoreInput(), { target: { files: [file] } })

    await vi.waitFor(() => {
      expect(screen.getByText(/còn 1 thay đổi chưa hoàn tất/i)).toBeDefined()
    })
    expect(httpFetch.post).not.toHaveBeenCalledWith('/backup/restore', expect.anything())
    expect(recoveryFns.resetClientData).not.toHaveBeenCalled()
  })

  // A07: restore phải gửi kèm adminPassword trong body (server bắt buộc re-auth)
  it('sends adminPassword in restore body', async () => {
    const fileContent = JSON.stringify({
      data: { students: [{ id: 'ST-001', fullName: 'Test Student' }], grades: [], attendance: [] },
    })
    const file = new File([fileContent], 'backup.json', { type: 'application/json' })

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword(ADMIN_PASSWORD)
    const input = getRestoreInput()
    fireEvent.change(input, { target: { files: [file] } })

    await vi.waitFor(() => {
      expect(httpFetch.post).toHaveBeenCalledWith(
        '/backup/restore',
        expect.objectContaining({
          adminPassword: ADMIN_PASSWORD,
          data: expect.objectContaining({ students: [{ id: 'ST-001', fullName: 'Test Student' }] }),
        }),
      )
    }, { timeout: 3000 })
  })

  // A07 (negative): thiếu mật khẩu khi restore → KHÔNG gọi API
  it('blocks restore without admin password', async () => {
    const fileContent = JSON.stringify({
      data: { students: [{ id: 'ST-001', fullName: 'Test Student' }], grades: [], attendance: [] },
    })
    const file = new File([fileContent], 'backup.json', { type: 'application/json' })

    render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    const input = getRestoreInput()
    fireEvent.change(input, { target: { files: [file] } })

    await vi.waitFor(() => {
      expect(screen.getByText('Vui lòng nhập mật khẩu Admin để xác nhận khôi phục')).toBeDefined()
    }, { timeout: 3000 })
    expect(httpFetch.post).not.toHaveBeenCalled()
  })


})
