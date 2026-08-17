import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BackupRestoreModal } from '../../components/common/BackupRestoreModal'
import { httpFetch } from '../../lib/api'

vi.mock('../../lib/db', () => ({
  db: { stores: { put: vi.fn() } },
}))

vi.mock('../../lib/api', () => ({
  httpFetch: {
    get: vi.fn().mockResolvedValue({
      version: '2.0-production',
      data: { students: [{ id: 'ST-1', fullName: 'Test' }], grades: [], attendance: [] }
    }),
    post: vi.fn().mockResolvedValue({
      success: true,
      message: 'Khôi phục thành công dữ liệu 1 em thiếu nhi!'
    })
  }
}))

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: Object.assign(
    (selector?: any) => {
      const state = { students: [], setStudents: vi.fn() }
      return selector ? selector(state) : state
    },
    { getState: () => ({ students: [] }), setState: vi.fn() },
  ),
}))

vi.mock('../../stores/gradeStore', () => ({
  useGradeStore: Object.assign(
    (selector?: any) => {
      const state = { grades: [], setGrades: vi.fn() }
      return selector ? selector(state) : state
    },
    { getState: () => ({ grades: [] }), setState: vi.fn() },
  ),
}))

vi.mock('../../stores/attendanceStore', () => ({
  useAttendanceStore: Object.assign(
    (selector?: any) => {
      const state = { attendance: [], setAttendance: vi.fn() }
      return selector ? selector(state) : state
    },
    { getState: () => ({ attendance: [] }), setState: vi.fn() },
  ),
}))

vi.mock('lucide-react', () => ({
  Database: 'svg', Download: 'svg', Upload: 'svg', CheckCircle: 'svg', X: 'svg', Loader2: 'svg',
}))

const mockCreateObjectURL = vi.fn(() => 'blob:test-url')
const mockRevokeObjectURL = vi.fn()

const ADMIN_PASSWORD = 'AdminXacNhan@123'

function typeAdminPassword(container: HTMLElement, value: string = ADMIN_PASSWORD) {
  const input = container.querySelector('#admin-password-confirm') as HTMLInputElement
  fireEvent.change(input, { target: { value } })
}

describe('BackupRestoreModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    fireEvent.click(screen.getByText('Đóng'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn()
    render(<BackupRestoreModal isOpen={true} onClose={onClose} />)
    const buttons = screen.getAllByRole('button')
    const xBtn = buttons.find(b => b.innerHTML.includes('svg'))
    fireEvent.click(xBtn!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows success message after export', async () => {
    const { container } = render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword(container)
    const exportBtn = screen.getByRole('button', { name: /Sao lưu dữ liệu/i })
    fireEvent.click(exportBtn)
    await vi.waitFor(() => {
      expect(screen.getByText(/Đã tạo và tải bản sao lưu/i)).toBeDefined()
    })
  })

  it('calls URL.createObjectURL during export', async () => {
    const { container } = render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword(container)
    const exportBtn = screen.getByRole('button', { name: /Sao lưu dữ liệu/i })
    fireEvent.click(exportBtn)
    await vi.waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled()
    })
  })

  // A-NEW-28 (2026-08-11): export gửi adminPassword trong BODY (POST) — không còn
  // trong query param (credential trong URL bị rò qua nginx access log / cache proxy).
  it('sends adminPassword in export POST body', async () => {
    const { container } = render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword(container, 'AdminXacNhan@123')
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

    const { container } = render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword(container)
    const input = container.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    await vi.waitFor(() => {
      expect(screen.getByText(/Khôi phục thành công/i)).toBeDefined()
    }, { timeout: 3000 })
  })

  // A07: restore phải gửi kèm adminPassword trong body (server bắt buộc re-auth)
  it('sends adminPassword in restore body', async () => {
    const fileContent = JSON.stringify({
      data: { students: [{ id: 'ST-001', fullName: 'Test Student' }], grades: [], attendance: [] },
    })
    const file = new File([fileContent], 'backup.json', { type: 'application/json' })

    const { container } = render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    typeAdminPassword(container, ADMIN_PASSWORD)
    const input = container.querySelector('input[type="file"]')!
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

    const { container } = render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />)
    const input = container.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    await vi.waitFor(() => {
      expect(screen.getByText('Vui lòng nhập mật khẩu Admin để xác nhận khôi phục')).toBeDefined()
    }, { timeout: 3000 })
    expect(httpFetch.post).not.toHaveBeenCalled()
  })


})
