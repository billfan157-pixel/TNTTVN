import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const mappingApi = {
  getMappingMemory: (params?: { scope?: 'class' | 'student'; academicYearId?: string }) => {
    const qs = new URLSearchParams()
    if (params?.scope) qs.set('scope', params.scope)
    if (params?.academicYearId) qs.set('academicYearId', params.academicYearId)
    const q = qs.toString()
    return request<any[]>('GET', `/students/mappings${q ? `?${q}` : ''}`)
  },
  saveMappingMemory: (data: { scope: 'class' | 'student'; alias: string; entityId: string; entityName?: string; academicYearId?: string }) =>
    request<{ success: boolean }>('POST', '/students/mappings', data),
  deleteMappingMemory: (id: string) => request<{ success: boolean }>('DELETE', `/students/mappings/${id}`),
}
