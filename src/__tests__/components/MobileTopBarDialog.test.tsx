import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MobileTopBar } from '../../components/mobile/MobileTopBar'
import { useAuthStore } from '../../stores/authStore'
import { useStudentStore } from '../../stores/studentStore'
import { useFilterStore } from '../../stores/filterStore'
import { useSyncStore } from '../../stores/syncStore'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouterState: () => ({ location: { pathname: '/dashboard' } }),
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

describe('MobileTopBar control sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
    useAuthStore.setState({
      user: {
        id: 'mobile-topbar-user',
        username: 'phuta',
        fullName: 'Phụ tá Mobile',
        role: 'phuta',
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

  it('portals the control sheet above the shell and shares the dialog lifecycle', () => {
    const { container } = render(<MobileTopBar />)

    fireEvent.click(screen.getByRole('button', { name: 'Mở bảng điều khiển' }))

    const dialog = screen.getByRole('dialog', { name: 'Bảng điều khiển' })
    expect(document.body).toContainElement(dialog)
    expect(container).not.toContainElement(dialog)
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Bảng điều khiển' })).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })
})
