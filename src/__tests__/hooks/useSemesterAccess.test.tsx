import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'

const mockState = vi.hoisted(() => ({
  isAdmin: true,
  academicYears: [] as { id: string; startDate: string; endDate: string; isLocked: number; currentSemester?: number }[],
  currentYear: '',
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ isAdmin: mockState.isAdmin }),
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: (selector?: any) => {
    const state = {
      academicYears: mockState.academicYears,
      currentYear: mockState.currentYear,
    }
    return selector ? selector(state) : state
  },
}))

function Probe() {
  const { restricted, openSemester, ready } = useSemesterAccess()
  return <div data-testid="probe">{`restricted=${restricted}|open=${openSemester}|ready=${ready}`}</div>
}

describe('useSemesterAccess', () => {
  beforeEach(() => {
    mockState.isAdmin = true
    mockState.academicYears = []
    mockState.currentYear = ''
  })

  it('admin được tự do chuyển học kỳ (restricted=false)', () => {
    mockState.academicYears = [{ id: '2025-2026', startDate: '', endDate: '', isLocked: 0, currentSemester: 2 }]
    mockState.currentYear = '2025-2026'
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('restricted=false|open=2|ready=true')
  })

  it('non-admin bị khóa ở HK đang mở (currentSemester=2)', () => {
    mockState.isAdmin = false
    mockState.academicYears = [{ id: '2025-2026', startDate: '', endDate: '', isLocked: 0, currentSemester: 2 }]
    mockState.currentYear = '2025-2026'
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('restricted=true|open=2|ready=true')
  })

  it('non-admin + năm học đang mở HK1 → openSemester=1', () => {
    mockState.isAdmin = false
    mockState.academicYears = [{ id: '2025-2026', startDate: '', endDate: '', isLocked: 0, currentSemester: 1 }]
    mockState.currentYear = '2025-2026'
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('restricted=true|open=1|ready=true')
  })

  it('chưa có dữ liệu năm học (offline) → ready=false, fallback openSemester=1', () => {
    mockState.isAdmin = false
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('restricted=true|open=1|ready=false')
  })

  it('khớp currentYear theo normalize (id "2025-2026" vs currentYear "2025 - 2026")', () => {
    mockState.isAdmin = false
    mockState.academicYears = [{ id: '2025-2026', startDate: '', endDate: '', isLocked: 0, currentSemester: 2 }]
    mockState.currentYear = '2025 - 2026'
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('restricted=true|open=2|ready=true')
  })
})
