import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const parishEventsApi = {
  getParishEvents: (params?: { from?: string; to?: string; category?: string }) => {
    const qs = new URLSearchParams()
    if (params?.from) qs.set('from', params.from)
    if (params?.to) qs.set('to', params.to)
    if (params?.category) qs.set('category', params.category)
    const q = qs.toString()
    return request<any[]>('GET', `/parish-events${q ? `?${q}` : ''}`)
  },
  createParishEvent: (data: { date: string; title: string; category: string; categoryName?: string; time?: string; location?: string }) =>
    request<any>('POST', '/parish-events', data),
  updateParishEvent: (id: string, data: any) =>
    request<any>('PUT', `/parish-events/${encodeURIComponent(id)}`, data),
  deleteParishEvent: (id: string) =>
    request<{ deleted: boolean }>('DELETE', `/parish-events/${encodeURIComponent(id)}`),
}
