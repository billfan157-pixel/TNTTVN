import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AttendancePage } from '../../pages/AttendancePage'
import { useAuthStore } from '../../stores/authStore'
import { useEffectiveMode } from '../../hooks/useEffectiveMode'

vi.mock('../../hooks/useEffectiveMode', () => ({
  useEffectiveMode: vi.fn(),
}))

vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('../../components/desktop/DesktopAttendanceGrid', () => ({
  default: ({ onOpenTiniImport }: { onOpenTiniImport?: () => void }) => (
    <div data-testid="desktop-attendance-grid">
      <span>Desktop Attendance Grid</span>
      {onOpenTiniImport && (
        <button onClick={onOpenTiniImport}>Nhập Điểm Danh TINI</button>
      )}
    </div>
  ),
  DesktopAttendanceGrid: ({ onOpenTiniImport }: { onOpenTiniImport?: () => void }) => (
    <div data-testid="desktop-attendance-grid">
      <span>Desktop Attendance Grid</span>
      {onOpenTiniImport && (
        <button onClick={onOpenTiniImport}>Nhập Điểm Danh TINI</button>
      )}
    </div>
  ),
}))

vi.mock('../../components/attendance/TiniAttendanceImportPanel', () => ({
  default: () => <div data-testid="tini-import-panel">Nội Dung TINI Import Panel</div>,
  TiniAttendanceImportPanel: () => <div data-testid="tini-import-panel">Nội Dung TINI Import Panel</div>,
}))

describe('AttendancePage - TINI Import Entry Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useEffectiveMode).mockReturnValue('desktop')
  })

  it('hides TINI button when user is not admin', async () => {
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({ user: { role: 'chunhiem' } })
    )

    render(<AttendancePage />)
    expect(await screen.findByTestId('desktop-attendance-grid')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nhập Điểm Danh TINI/i })).not.toBeInTheDocument()
  })

  it('renders TINI button for admin and transitions to TiniAttendanceImportPanel with back button', async () => {
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({ user: { role: 'admin' } })
    )

    render(<AttendancePage />)
    expect(await screen.findByTestId('desktop-attendance-grid')).toBeInTheDocument()
    const tiniBtn = screen.getByRole('button', { name: /Nhập Điểm Danh TINI/i })
    expect(tiniBtn).toBeInTheDocument()

    // Click TINI import button
    fireEvent.click(tiniBtn)

    // Should display PageHeader and TiniAttendanceImportPanel
    expect(await screen.findByTestId('tini-import-panel')).toBeInTheDocument()
    expect(screen.getByText('Nhập Điểm Danh TINI (CCAMS)')).toBeInTheDocument()

    // Back button should return to grid
    const backBtn = screen.getByRole('button', { name: /Quay lại sổ điểm danh/i })
    expect(backBtn).toBeInTheDocument()
    fireEvent.click(backBtn)

    expect(await screen.findByTestId('desktop-attendance-grid')).toBeInTheDocument()
    expect(screen.queryByTestId('tini-import-panel')).not.toBeInTheDocument()
  })
})
