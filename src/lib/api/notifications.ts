import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const notificationsApi = {
  sendReportCards: (data: { students: any[] }) =>
    request<{ sent: number; total: number }>('POST', '/notifications/smart/report-cards', data),
}
