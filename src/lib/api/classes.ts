import { request, newIdempotencyKey } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const classesApi = {
  getClasses: (params?: { updatedAfter?: string; updatedBefore?: string }) => {
    const qs = new URLSearchParams()
    if (params?.updatedAfter) qs.set('updatedAfter', params.updatedAfter)
    if (params?.updatedBefore) qs.set('updatedBefore', params.updatedBefore)
    const q = qs.toString()
    return request<any[]>('GET', `/classes${q ? `?${q}` : ''}`)
  },
  getClass: (id: string) => request<any>('GET', `/classes/${id}`),
  getClassBranches: () => request<any[]>('GET', '/classes/branches'),
  getClassAcademicYears: () => request<any[]>('GET', '/classes/academic-years'),
  createAcademicYear: (data: { id: string; startDate?: string; endDate?: string }) =>
    request<any>('POST', '/classes/academic-years', data),
  getAvailableTeachers: () => request<{ id: string; fullName: string; username: string; role: string }[]>('GET', '/classes/available-teachers'),
  createClass: (data: Record<string, unknown>) => {
    // A12: đảm bảo luôn có Idempotency-Key (classStore thường tự truyền; nếu không,
    // auto-generate) → retry an toàn, server dedup qua idx_classes_idempotency.
    const withKey = data.idempotencyKey ? data : { ...data, idempotencyKey: newIdempotencyKey() }
    return request<any>('POST', '/classes', withKey, 0, undefined, true)
  },
  updateClass: (id: string, data: Record<string, unknown>) => request<any>('PUT', `/classes/${id}`, data),
  deleteClass: (id: string) => request<{ success: boolean }>('DELETE', `/classes/${id}`),
  assignClassTeacher: (classId: string, userId: string, roleInClass: 'chunhiem' | 'phuta') =>
    request<{ ok: boolean }>('POST', `/classes/${classId}/assignments`, { userId, roleInClass }),
  replaceClassAssignments: (classId: string, data: { homeroomTeacherId: string | null; assistantTeacherIds: string[] }) =>
    request<{ ok: boolean; classId: string }>('PUT', `/classes/${classId}/assignments`, data),
  unassignClassTeacher: (classId: string, userId: string) =>
    request<{ ok: boolean }>('DELETE', `/classes/${classId}/assignments/${userId}`),
}
