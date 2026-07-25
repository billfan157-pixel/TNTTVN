import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
vi.mock('../../stores/resetStores', () => ({ resetAllStoresToDefault: vi.fn() }))
vi.mock('../../lib/api', () => ({ clearTokens: vi.fn() }))
vi.mock('../../constants/branches', () => ({
  BRANCHES: { AuNhi: { id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A' } },
}))
vi.mock('../../assets/logo-tntt.png', () => ({ default: 'logo.png' }))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mockNavigate }))

describe('HeaderBar Component', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the header with title', () => {
    render(<HeaderBar />)
    expect(screen.getByText('Giáo Lý Thiếu Nhi Thánh Thể')).toBeDefined()
  })

  it('renders search input', () => {
    render(<HeaderBar />)
    expect(screen.getByPlaceholderText('Tìm tên, mã...')).toBeDefined()
  })

  it('renders semester toggle buttons', () => {
    render(<HeaderBar />)
    expect(screen.getByText('HK I')).toBeDefined()
    expect(screen.getByText('HK II')).toBeDefined()
  })

  it('renders login button when no user is logged in', () => {
    render(<HeaderBar />)
    expect(screen.getByText('Đăng Nhập')).toBeDefined()
  })

  it('renders class switcher dropdown', () => {
    render(<HeaderBar />)
    expect(screen.getByText('Tất cả lớp học')).toBeDefined()
  })
})
