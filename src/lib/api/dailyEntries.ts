import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const dailyEntriesApi = {
  saveDailyEntries: (entries: { id: string; studentId: string; academicYear: string; semester: number; scoreType: string; value: number; date?: string }[]) =>
    request<{ saved: number; duplicates: number; errorCount: number; total: number; items: { id: string; studentId: string; scoreType: string; status: 'created' | 'duplicate' | 'error'; serverScore: number | null; reason?: string }[] }>('POST', '/daily-entries/batch', { entries }),
  deleteDailyEntry: (id: string) => request<{ deleted: boolean; id: string }>('DELETE', `/daily-entries/${encodeURIComponent(id)}`),
  getDailyEntries: (params: { classId?: string; studentId?: string; semester?: number; academicYear?: string; scoreType?: string }) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v))
    const q = qs.toString()
    return request<{ id: string; studentId: string; academicYear: string; semester: number; scoreType: string; value: number; date: string | null; origin: 'manual' | 'machine'; examSessionId: string | null; createdAt: string }[]>('GET', `/daily-entries${q ? `?${q}` : ''}`)
  },
}
