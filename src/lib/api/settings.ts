import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const settingsApi = {
  getSettings: () => request<any>('GET', '/settings'),
  updateSettings: (data: Record<string, unknown>) => request<any>('PUT', '/settings', data),
}
