import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GradesPage } from '../../pages/GradesPage'

const mockNavigate = vi.fn()
let mockSearchParams: Record<string, any> = {}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearchParams,
}))

vi.mock('../../hooks/useEffectiveMode', () => ({
  useEffectiveMode: () => 'desktop',
}))

vi.mock('../../stores/uiStore', () => ({
  useUIStore: () => ({
    openReport: vi.fn(),
    openReportForPrint: vi.fn(),
  }),
}))

vi.mock('../../utils/lazyWithRetry', () => ({
  lazyWithRetry: (_loader: any, name: string) => {
    const Component = () => <div data-testid={`lazy-${name}`}>{name}</div>
    Component.displayName = name
    return Component
  },
}))

describe('GradesPage URL Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = {}
  })

  it('defaults to matrix view when no view param is in URL', async () => {
    mockSearchParams = {}
    await act(async () => {
      render(<GradesPage />)
    })

    expect(screen.getByTestId('lazy-DesktopGradeMatrix')).toBeDefined()
  })

  it('renders exam view when view=exam is passed in URL', async () => {
    mockSearchParams = { view: 'exam' }
    await act(async () => {
      render(<GradesPage />)
    })

    expect(screen.getByTestId('lazy-ExamSessionView')).toBeDefined()
  })

  it('renders question bank when view=bank is passed in URL', async () => {
    mockSearchParams = { view: 'bank' }
    await act(async () => {
      render(<GradesPage />)
    })

    expect(screen.getByTestId('lazy-QuestionBankView')).toBeDefined()
  })

  it('calls navigate with new view param when tab is clicked', async () => {
    mockSearchParams = { view: 'matrix' }
    await act(async () => {
      render(<GradesPage />)
    })

    const comparisonTab = screen.getByRole('tab', { name: /So Sánh/ })
    fireEvent.click(comparisonTab)

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/grades',
        replace: true,
      })
    )
  })
})
