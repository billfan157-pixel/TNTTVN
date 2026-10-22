import { request } from './core'

export interface NotificationHistoryItem {
  id: string
  type: string
  channel: string
  deliveryKind: string | null
  status: 'sent' | 'failed' | 'retrying'
  recipient: string
  message: string | null
  error: string | null
  attemptCount: number
  maxAttempts: number
  createdAt: string
  sentAt: string | null
  nextAttemptAt: string | null
}

export interface NotificationHistoryResponse {
  items: NotificationHistoryItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface LiturgicalReminderPreferences {
  enabled: boolean
  time: string
  timeZone: 'Asia/Ho_Chi_Minh'
}

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const notificationsApi = {
  getLiturgicalReminder: () => request<LiturgicalReminderPreferences>('GET', '/notifications/liturgical-reminder'),
  saveLiturgicalReminder: (data: Pick<LiturgicalReminderPreferences, 'enabled' | 'time'>) => request<LiturgicalReminderPreferences>('PUT', '/notifications/liturgical-reminder', data),
  sendReportCards: (data: { students: any[] }) =>
    request<{ sent: number; total: number }>('POST', '/notifications/smart/report-cards', data),
  getHistory: (params?: { status?: string; channel?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.channel) query.set('channel', params.channel)
    if (params?.page) query.set('page', String(params.page))
    if (params?.limit) query.set('limit', String(params.limit))
    const qs = query.toString()
    return request<NotificationHistoryResponse>('GET', `/notifications${qs ? `?${qs}` : ''}`)
  },
}
