import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedbackPage from '../pages/FeedbackPage'

let mockRole: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh' = 'admin'

const apiMocks = vi.hoisted(() => ({
  getFeedbackTargets: vi.fn(),
  getFeedbackInbox: vi.fn(),
  getPublicSentFeedback: vi.fn(),
  createFeedback: vi.fn(),
  updateFeedbackStatus: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ role: mockRole }),
}))

vi.mock('../lib/api', () => ({ api: apiMocks }))

vi.mock('../stores/toastStore', () => ({
  useToastStore: (selector: (state: { addToast: ReturnType<typeof vi.fn> }) => unknown) => selector({ addToast: vi.fn() }),
}))

describe('FeedbackPage role experience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.getFeedbackTargets.mockResolvedValue([{ type: 'PARISH', userId: null, label: 'Ban điều hành Xứ đoàn', detail: 'Hộp thư chung' }])
    apiMocks.getFeedbackInbox.mockResolvedValue([])
    apiMocks.getPublicSentFeedback.mockResolvedValue([])
  })

  it('renders admin as receive-only without compose or sent controls', async () => {
    mockRole = 'admin'
    render(<FeedbackPage />)

    expect(screen.getByRole('tab', { name: 'Thư đến' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Viết thư' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Đã gửi công khai' })).not.toBeInTheDocument()
    await waitFor(() => expect(apiMocks.getFeedbackInbox).toHaveBeenCalledTimes(1))
    expect(apiMocks.getFeedbackTargets).not.toHaveBeenCalled()
    expect(apiMocks.getPublicSentFeedback).not.toHaveBeenCalled()
  })

  it('lets parents compose and view only their public sent mail', async () => {
    mockRole = 'phuhuynh'
    render(<FeedbackPage />)

    expect(screen.getByRole('tab', { name: 'Viết thư' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Đã gửi công khai' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Thư đến' })).not.toBeInTheDocument()
    await waitFor(() => expect(apiMocks.getFeedbackTargets).toHaveBeenCalledTimes(1))
    expect(apiMocks.getFeedbackInbox).not.toHaveBeenCalled()
  })
})
