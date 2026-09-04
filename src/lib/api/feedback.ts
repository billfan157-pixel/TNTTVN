import { request } from './core'
import type { FeedbackTarget, FeedbackMessage, FeedbackStatus, CreateFeedbackInput } from '../../types'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const feedbackApi = {
  getFeedbackTargets: () => request<FeedbackTarget[]>('GET', '/feedback/targets'),
  getFeedbackInbox: () => request<FeedbackMessage[]>('GET', '/feedback/inbox'),
  getPublicSentFeedback: () => request<FeedbackMessage[]>('GET', '/feedback/sent'),
  createFeedback: (data: CreateFeedbackInput) => request<FeedbackMessage>('POST', '/feedback', data),
  updateFeedbackStatus: (id: string, status: Exclude<FeedbackStatus, 'NEW'>) =>
    request<FeedbackMessage>('PATCH', `/feedback/${encodeURIComponent(id)}/status`, { status }),
}
