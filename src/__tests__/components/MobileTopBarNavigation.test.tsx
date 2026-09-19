import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MobileTopBar } from '../../components/mobile/MobileTopBar'
import { useAuthStore } from '../../stores/authStore'
import { useStudentStore } from '../../stores/studentStore'
import { useFilterStore } from '../../stores/filterStore'
import { useSyncStore } from '../../stores/syncStore'

const { mockNavigate, mockState } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockState: { pathname: '/dashboard' },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useRouterState: () => ({ location: { pathname: mockState.pathname } }),
}))

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}))

vi.mock('../../hooks/useSemesterAccess', () => ({
  useSemesterAccess: () => ({ restricted: false, openSemester: 1 }),
}))

vi.mock('../../hooks/useInstallPrompt', () => ({
  useInstallPrompt: () => ({ canInstall: false, install: vi.fn() }),
}))

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => true,
}))

vi.mock('../../components/desktop/SystemDiagnosticsModal', () => ({
  SystemDiagnosticsModal: () => null,
}))

describe('MobileTopBar navigation and smart back button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.pathname = '/dashboard'
    useAuthStore.setState({
      user: {
        id: 'mobile-nav-user',
        username: 'admin_test',
        fullName: 'Admin Mobile',
        role: 'admin',
        status: 'ACTIVE',
        parishId: 'test-parish',
      },
    })
    useStudentStore.setState({ students: [] })
    useFilterStore.setState({
      selectedClassId: 'all',
      searchQuery: '',
      selectedSemester: 1,
    })
    useSyncStore.setState({ status: 'idle', pendingCount: 0 })
  })

  it('renders brand mark logo and does not render back button on root tab route', () => {
    mockState.pathname = '/dashboard'
    render(<MobileTopBar activeWorkspace="academic" />)

    const logo = screen.getByAltText('Logo Xứ Đoàn Đức Mẹ Fatima')
    expect(logo).toBeInTheDocument()

    const backBtn = screen.queryByRole('button', { name: 'Quay lại trang trước' })
    expect(backBtn).not.toBeInTheDocument()
  })

  it('renders back button instead of logo on child/secondary route', () => {
    mockState.pathname = '/finances'
    render(<MobileTopBar activeWorkspace="academic" />)

    const logo = screen.queryByAltText('Logo Xứ Đoàn Đức Mẹ Fatima')
    expect(logo).not.toBeInTheDocument()

    const backBtn = screen.getByRole('button', { name: 'Quay lại trang trước' })
    expect(backBtn).toBeInTheDocument()
  })

  it('calls window.history.back when back button is clicked and history exists', () => {
    mockState.pathname = '/settings'
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    Object.defineProperty(window.history, 'length', { value: 3, configurable: true })

    render(<MobileTopBar activeWorkspace="academic" />)

    const backBtn = screen.getByRole('button', { name: 'Quay lại trang trước' })
    fireEvent.click(backBtn)

    expect(backSpy).toHaveBeenCalled()
    backSpy.mockRestore()
  })

  it('falls back to workspace landing path when history is empty', () => {
    mockState.pathname = '/finances'
    Object.defineProperty(window.history, 'length', { value: 1, configurable: true })

    render(<MobileTopBar activeWorkspace="academic" />)

    const backBtn = screen.getByRole('button', { name: 'Quay lại trang trước' })
    fireEvent.click(backBtn)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' })
  })
})
