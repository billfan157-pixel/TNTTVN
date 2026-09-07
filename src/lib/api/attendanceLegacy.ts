import { request } from './core'
import type { AcademicPullResponse } from '../academicPull'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const attendanceLegacyApi = {
  pullAttendance: (updatedAfter?: string, scopeRevision?: string | null) => {
    const qs = new URLSearchParams({ includeScope: 'true' })
    if (updatedAfter) qs.set('updatedAfter', updatedAfter)
    if (scopeRevision) qs.set('scopeRevision', scopeRevision)
    return request<AcademicPullResponse>('GET', `/attendance?${qs}`)
  },
  getAttendance: (params?: { studentId?: string; date?: string; type?: string; updatedAfter?: string }) => {
    const qs = new URLSearchParams()
    if (params?.studentId) qs.set('studentId', params.studentId)
    if (params?.date) qs.set('date', params.date)
    if (params?.type) qs.set('type', params.type)
    if (params?.updatedAfter) qs.set('updatedAfter', params.updatedAfter)
    const q = qs.toString()
    return request<any[]>('GET', `/attendance${q ? `?${q}` : ''}`)
  },
  upsertAttendance: (data: Record<string, unknown>) => request<any>('POST', '/attendance', data),
  batchUpsertAttendance: (date: string, type: string, records: { studentId: string; status: string; note?: string; version?: number }[]) =>
    request<{ results: { studentId: string; status: 'saved' | 'skipped' | 'conflict' | 'error'; reason?: string; record?: any }[]; total: number; successCount: number; skippedCount: number; conflictCount: number; errorCount: number }>('POST', '/attendance/batch', { date, type, records }),
}
