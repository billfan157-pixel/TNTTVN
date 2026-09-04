import { request } from './core'
import type { LeaveRequest } from '../../types'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const leaveRequestsApi = {
  getLeaveRequests: (params?: { classId?: string; status?: string; date?: string; studentId?: string }) => {
    const qs = new URLSearchParams()
    if (params?.classId) qs.set('classId', params.classId)
    if (params?.status) qs.set('status', params.status)
    if (params?.date) qs.set('date', params.date)
    if (params?.studentId) qs.set('studentId', params.studentId)
    const q = qs.toString()
    return request<LeaveRequest[]>('GET', `/leave-requests${q ? `?${q}` : ''}`)
  },
  getPendingLeaveRequestsCount: () =>
    request<{ pendingCount: number }>('GET', '/leave-requests/pending-count'),
  createLeaveRequest: (data: { studentId: string; date: string; sessionTypes: string[]; reason: string; parentName?: string; parentPhone?: string }) =>
    request<LeaveRequest>('POST', '/leave-requests', data),
  reviewLeaveRequest: (id: string, data: { status: 'APPROVED' | 'REJECTED'; reviewNote?: string }) =>
    request<LeaveRequest>('PATCH', `/leave-requests/${id}/review`, data),
  cancelLeaveRequest: (id: string) =>
    request<{ ok: boolean; id: string; status: string }>('DELETE', `/leave-requests/${id}`),
}
