import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const noticesApi = {
  getNotices: (updatedAfter?: string) => {
    const params = new URLSearchParams({ limit: '10000' })
    if (updatedAfter) params.set('updatedAfter', updatedAfter)
    const q = `?${params.toString()}`
    return request<any[]>('GET', `/notices${q}`)
  },
  createNotice: (data: Record<string, unknown>) => request<any>('POST', '/notices', data),
  updateNotice: (id: string, data: Record<string, unknown>) => request<any>('PUT', `/notices/${id}`, data),
  deleteNotice: (id: string) => request<{ success: boolean }>('DELETE', `/notices/${id}`),
}
