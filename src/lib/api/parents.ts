import { request } from './core'
import type { ReportCardDTO } from '../../types'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const parentsApi = {
  getMyChildren: () => request<any[]>('GET', '/parents/my-children'),
  getStudentReportCard: (studentId: string, academicYear: string) =>
    request<ReportCardDTO>('GET', `/reports/report-card/${studentId}?academicYear=${encodeURIComponent(academicYear)}`),

  // ADR-022: liên kết Telegram — PH tự quản lý (link token 10 phút / status / toggle / revoke)
  getTelegramLinkStatus: () =>
    request<Array<{ chatId: string; telegramUsername: string | null; status: string; notificationsEnabled: number; linkedAt: string | null; lastSeenAt: string | null }>>('GET', '/parents/telegram/status'),
  createTelegramLinkToken: () =>
    request<{ token: string; expiresAt: string }>('POST', '/parents/telegram/link-token', {}),
  setTelegramNotifications: (enabled: boolean) =>
    request<{ enabled: boolean; updatedLinks: number }>('POST', '/parents/telegram/notifications', { enabled }),
  revokeTelegramLink: () =>
    request<{ revokedLinks: number }>('DELETE', '/parents/telegram/link'),
}
