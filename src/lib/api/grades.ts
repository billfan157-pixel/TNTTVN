import { request } from './core'
import type { AcademicPullResponse } from '../academicPull'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const gradesApi = {
  pullGrades: (updatedAfter?: string, scopeRevision?: string | null) => {
    const qs = new URLSearchParams({ includeScope: 'true' })
    if (updatedAfter) qs.set('updatedAfter', updatedAfter)
    if (scopeRevision) qs.set('scopeRevision', scopeRevision)
    return request<AcademicPullResponse>('GET', `/grades?${qs}`)
  },
  getGrades: (params?: { studentId?: string; semester?: number; updatedAfter?: string }) => {
    const qs = new URLSearchParams()
    if (params?.studentId) qs.set('studentId', params.studentId)
    if (params?.semester) qs.set('semester', String(params.semester))
    if (params?.updatedAfter) qs.set('updatedAfter', params.updatedAfter)
    const q = qs.toString()
    return request<any[]>('GET', `/grades${q ? `?${q}` : ''}`)
  },
  upsertGrade: (data: Record<string, unknown>) => request<any>('POST', '/grades', data),
  batchUpsertGrades: (dataList: Record<string, unknown>[]) => request<{ results: { studentId: string; status: 'saved' | 'conflict' | 'error'; error?: string; currentGrade?: any; record?: any }[] }>('POST', '/grades/batch', { grades: dataList }),
  checkGradeImportDuplicate: (params: { hash: string; classId: string; semester: number; academicYear: string }) =>
    request<{ isDuplicate: boolean; importedAt?: string; totalRows?: number }>('POST', '/grades/check-import-duplicate', params),
  registerGradeImport: (params: { hash: string; classId: string; semester: number; academicYear: string; totalRows: number }) =>
    request<{ registered: boolean }>('POST', '/grades/register-import', params),
  // ADR-039: Khôi phục đợt nhập điểm (CREATE → xóa row, UPDATE → về trạng thái trước import).
  undoGradeImport: (params: { semester: number; academicYear: string; studentIds: string[] }) =>
    request<{ results: { studentId: string; status: 'restored' | 'deleted' | 'not-found' | 'no-audit' | 'not-clean' | 'expired' | 'forbidden' | 'locked' | 'error'; message?: string }[] }>('POST', '/grades/undo-import', params),

  // Override Endpoints
  overrideGrade: (id: string, data: { scoreField: string; manualValue: number; reasonCode?: string; reasonNote?: string; studentId?: string; academicYear?: string; semester?: number }, idempotencyKey?: string) => {
    const headers: Record<string, string> = {}
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
    return request<any>('PATCH', `/grades/${id}/override`, data, 0, headers)
  },
  getGradeOverrideHistory: (id: string) =>
    request<any[]>('GET', `/grades/${id}/override/history`),
}
