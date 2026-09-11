import { request } from './core'

// Calendar is a read model. Operations commands own all event mutations.
export const parishEventsApi = {
  getParishEvents: (params?: { from?: string; to?: string; category?: string }) => {
    const qs = new URLSearchParams()
    if (params?.from) qs.set('from', params.from)
    if (params?.to) qs.set('to', params.to)
    if (params?.category) qs.set('category', params.category)
    const q = qs.toString()
    return request<any[]>('GET', `/parish-events${q ? `?${q}` : ''}`)
  },
}
