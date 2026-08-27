import React, {  } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeaderBar } from '../../components/common/HeaderBar'

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: Object.assign(
    (selector?: any) => {
      const state = { students: [] as any[] }
      return selector ? selector(state) : state
    },
    { getState: () => ({ students: [] }), setState: vi.fn() },
  ),
}))

vi.mock('../../stores/classStore', () => ({
  useClassStore: Object.assign(
    (selector?: any) => {
      const state = { classes: [], getClassList: () => [] }
      return selector ? selector(state) : state
    },
    { getState: () => ({ getClassList: () => [] }) },
  ),
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: (selector?: any) => selector ? selector({ currentYear: '2025-2026' }) : { currentYear: '2025-2026' },
}))

vi.mock('../../hooks/useSemesterAccess', () => ({
  useSemesterAccess: () => ({ restricted: false, openSemester: vi.fn() }),
}))

vi.mock('../../stores/filterStore', () => ({
  useFilterStore: Object.assign(
    (selector?: any) => {
      const state = {
        viewMode: 'auto',
        searchQuery: '',
        selectedSemester: 1,
        selectedClassId: 'all',
        setViewMode: vi.fn(),
        setSearchQuery: vi.fn(),
        setSelectedSemester: vi.fn(),
        setSelectedClassId: vi.fn(),
      }
      return selector ? selector(state) : state
    },
    { getState: () => ({}), setState: vi.fn() },
  ),
}))

vi.mock('../../hooks/useEffectiveMode', () => ({ useEffectiveMode: () => 'desktop' }))
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }))
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: 'admin' }, role: 'admin', isAdmin: true, can: () => true, isChunhiem: false, isPhuta: false, isPhuhuynh: false }),
}))
const { getMockAuthUser, setMockAuthUser } = vi.hoisted(() => {
  let mockAuthUser: any = { role: 'admin', fullName: 'Quản Trị' }
  return {
    getMockAuthUser: () => mockAuthUser,
    setMockAuthUser: (u: any) => { mockAuthUser = u },
  }
})
vi.mock('../../stores/authStore', () => ({
  useAuthStore: Object.assign(
    (selector?: any) => {
      const state = { user: getMockAuthUser(), setUser: vi.fn(), logout: vi.fn() }
      return selector ? selector(state) : state
    },
    { getState: () => ({ user: getMockAuthUser(), setUser: vi.fn(), logout: vi.fn() }) },
  ),
}))
vi.mock('../../stores/resetStores', () => ({ resetAllStoresToDefault: vi.fn() }))
vi.mock('../../lib/api', () => ({ clearTokens: vi.fn(), isAuthenticated: () => false }))
vi.mock('../../constants/branches', () => ({
  BRANCHES: { AuNhi: { id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A' } },
}))
vi.mock('../../assets/logo-tntt.png', () => ({ default: 'logo.png' }))
vi.mock('../../assets/logo-gia-ton.png', () => ({ default: 'logo.png' }))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mockNavigate }))

describe('HeaderBar Component', () => {
  beforeEach(() => {
    localStorage.clear()
    setMockAuthUser({ role: 'admin', fullName: 'Quản Trị' })
  })

  it('renders the header with title', () => {
    render(<HeaderBar />)
    expect(screen.getByText('Xứ Đoàn Đức Mẹ Fatima')).toBeDefined()
  })

  it('renders search input', () => {
    render(<HeaderBar />)
    expect(screen.getByRole('textbox', { name: 'Tìm tên, mã thiếu nhi' })).toBeDefined()
  })

  it('renders semester toggle buttons', () => {
    render(<HeaderBar />)
    expect(screen.getByText('HK I')).toBeDefined()
    expect(screen.getByText('HK II')).toBeDefined()
  })

  it('renders logout button when user is logged in', () => {
    render(<HeaderBar />)
    expect(screen.getByTitle('Đăng xuất')).toBeDefined()
  })

  it('renders login button when no user is logged in', () => {
    setMockAuthUser(null)
    render(<HeaderBar />)
    expect(screen.getByText('Đăng Nhập')).toBeDefined()
  })

  it('renders class switcher dropdown for admin', () => {
    render(<HeaderBar />)
    expect(screen.getByText('Tất cả lớp học')).toBeDefined()
  })

  it('hides class switcher dropdown for non-admin users', () => {
    setMockAuthUser({ role: 'chunhiem', fullName: 'GLV' })
    render(<HeaderBar />)
    expect(screen.queryByText('Tất cả lớp học')).toBeNull()
  })
})
