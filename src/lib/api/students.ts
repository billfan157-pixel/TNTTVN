import { request, newIdempotencyKey } from './core'
import type { Student } from '../../types'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const studentsApi = {
  getStudents: (params?: { updatedAfter?: string; updatedBefore?: string; limit?: number; page?: number; afterId?: string }) => {
    const qs = new URLSearchParams()
    if (params?.updatedAfter) qs.set('updatedAfter', params.updatedAfter)
    if (params?.updatedBefore) qs.set('updatedBefore', params.updatedBefore)
    if (params?.afterId !== undefined) qs.set('afterId', params.afterId)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.page) qs.set('page', String(params.page))
    const q = qs.toString()
    return request<{ success: boolean; data: any[]; total: number }>(
      'GET', `/students${q ? `?${q}` : ''}`, undefined, 0, undefined, false, 'json', true,
    ).then(envelope => ({ data: envelope.data || [], total: envelope.total ?? 0 }))
  },
  getStudent: (id: string) => request<any>('GET', `/students/${id}`),
  // A12: auto-generate Idempotency-Key khi caller không truyền — key ổn định suốt chuỗi
  // retry (key nằm trong body → allowRetry=true cho phép retry; server dedup qua
  // idx_students_idempotency khi response bị mất).
  createStudent: (data: Record<string, unknown>) => {
    const withKey = data.idempotencyKey ? data : { ...data, idempotencyKey: newIdempotencyKey() }
    return request<any>('POST', '/students', withKey, 0, undefined, true)
  },
  updateStudent: (id: string, data: Record<string, unknown>) => request<any>('PUT', `/students/${id}`, data),
  deleteStudent: (id: string) => request<{ success: boolean }>('DELETE', `/students/${id}`),
  validateStudents: (rows: any[], academicYearId: string) => request<{ rows: any[]; classesNotFound: string[]; suggestedNewClasses?: { name: string; branch: string; academicYearId: string }[]; contentHash?: string; previousImport?: { batchId: string; fileName: string | null; createdAt: string; totalRows: number } | null }>('POST', '/students/validate', { rows, academicYearId }),
  importStudents: (payload: { rows: any[]; academicYearId: string; classMappings: Record<string, string | null>; newClasses: { name: string; branch: string; academicYearId: string }[]; duplicateActions: Record<string, 'skip' | 'update' | 'create'>; fileName?: string; serviceExclusions?: number[] }) =>
    request<{ imported: number; skipped: number; errors: number; classesCreated: string[]; batchId: string; studentChanges: Array<{ action: 'created' | 'updated'; student: Student }>; report: any[] }>('POST', '/students/import', payload),
  undoImport: (batchId: string) => request<{
    undone: number
    errors: string[]
    items: { rowIndex: number; studentId: string; action: 'created' | 'updated'; status: 'undone' | 'blocked' | 'already_undone'; message?: string }[]
    classesDeleted: string[]
  }>('POST', `/students/undo/${batchId}`),
  getImportHistory: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return request<any[]>('GET', `/students/history${q ? `?${q}` : ''}`)
  },
  getBatchDetail: (batchId: string) =>
    request<{ rows: any[]; counts: Record<string, number> }>('GET', `/students/batch/${batchId}`),
}
