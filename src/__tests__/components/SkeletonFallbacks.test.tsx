import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GradesPage } from '../../pages/GradesPage'
import { StudentsPage } from '../../pages/StudentsPage'

const mockNavigate = vi.fn()
let mockSearchParams: Record<string, any> = {}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearchParams,
}))

vi.mock('../../hooks/useEffectiveMode', () => ({
  useEffectiveMode: () => 'desktop',
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ role: 'admin', can: () => true }),
}))

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector?: any) => {
    const state = {
      openReport: vi.fn(),
      openReportForPrint: vi.fn(),
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: (selector?: any) => {
    const state = {
      students: [],
      loading: false,
      error: null,
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('../../stores/classStore', () => ({
  useClassStore: (selector?: any) => {
    const state = {
      classes: [],
      findClassById: () => null,
      getClassList: () => [],
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: (selector?: any) => {
    const state = {
      currentYear: '2025-2026',
      isCurrentYearLocked: () => false,
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('../../stores/filterStore', () => ({
  useFilterStore: (selector?: any) => {
    const state = {
      selectedClassId: 'all',
      selectedSemester: 1,
      searchQuery: '',
    }
    return selector ? selector(state) : state
  },
}))

// Mock lazyWithRetry to return a lazy component that never resolves during the test render,
// so Suspense fallback is guaranteed to display.
vi.mock('../../utils/lazyWithRetry', () => ({
  lazyWithRetry: () => {
    return React.lazy(() => new Promise(() => {}))
  },
}))

describe('Skeleton Fallbacks (CLS Prevention)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = {}
  })

  it('renders SkeletonTable fallback when GradesPage is in matrix view and loading', () => {
    mockSearchParams = { view: 'matrix' }
    render(<GradesPage />)

    const skeletonTable = screen.getByRole('status', { name: 'Đang tải bảng dữ liệu' })
    expect(skeletonTable).toBeDefined()
  })

  it('renders SkeletonCardGrid fallback when GradesPage is in exam view and loading', () => {
    mockSearchParams = { view: 'exam' }
    render(<GradesPage />)

    const skeletonCards = screen.getByRole('status', { name: 'Đang tải dữ liệu' })
    expect(skeletonCards).toBeDefined()
  })

  it('renders SkeletonTable fallback when StudentsPage is loading students list', () => {
    mockSearchParams = { tab: 'students' }
    render(<StudentsPage />)

    const skeletonTable = screen.getByRole('status', { name: 'Đang tải bảng dữ liệu' })
    expect(skeletonTable).toBeDefined()
  })
})
