import { create } from 'zustand'
import { api } from '../lib/api'
import type { LeaveRequest, LeaveRequestStatus } from '../types'
import { useToastStore } from './toastStore'

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message
  }
  return fallback
}

interface LeaveRequestState {
  requests: LeaveRequest[]
  loading: boolean
  error: string | null
  pendingCount: number
  fetchRequests: (params?: { classId?: string; status?: string; date?: string; studentId?: string }) => Promise<void>
  fetchPendingCount: () => Promise<void>
  submitRequest: (data: { studentId: string; date: string; sessionTypes: string[]; reason: string }) => Promise<LeaveRequest>
  reviewRequest: (id: string, status: 'APPROVED' | 'REJECTED', reviewNote?: string) => Promise<LeaveRequest>
  cancelRequest: (id: string) => Promise<void>
}

export const useLeaveRequestStore = create<LeaveRequestState>((set, _get) => ({
  requests: [],
  loading: false,
  error: null,
  pendingCount: 0,

  fetchRequests: async (params) => {
    set({ loading: true, error: null })
    try {
      const data = await api.getLeaveRequests(params)
      set({ requests: data || [], loading: false })
    } catch (err) {
      const msg = getErrorMessage(err, 'Không thể tải danh sách đơn xin nghỉ')
      set({ error: msg, loading: false })
    }
  },

  fetchPendingCount: async () => {
    try {
      const res = await api.getPendingLeaveRequestsCount()
      set({ pendingCount: res?.pendingCount || 0 })
    } catch {
      // Quiet fail for polling/header
    }
  },

  submitRequest: async (data) => {
    try {
      const created = await api.createLeaveRequest(data)
      set((state) => ({
        requests: [created, ...state.requests],
        pendingCount: state.pendingCount + 1,
      }))
      useToastStore.getState().addToast('Đã gửi đơn xin phép nghỉ thành công!', 'success')
      return created
    } catch (err) {
      const msg = getErrorMessage(err, 'Lỗi khi gửi đơn xin phép')
      useToastStore.getState().addToast(msg, 'error')
      throw err
    }
  },

  reviewRequest: async (id, status, reviewNote) => {
    try {
      const updated = await api.reviewLeaveRequest(id, { status, reviewNote })
      set((state) => ({
        requests: state.requests.map((r) => (r.id === id ? { ...r, ...updated } : r)),
        pendingCount: Math.max(0, state.pendingCount - 1),
      }))
      useToastStore.getState().addToast(
        status === 'APPROVED' ? 'Đã duyệt đơn và đồng bộ điểm danh thành công!' : 'Đã từ chối đơn xin nghỉ',
        status === 'APPROVED' ? 'success' : 'info'
      )
      return updated
    } catch (err) {
      const msg = getErrorMessage(err, 'Lỗi khi xử lý đơn xin nghỉ')
      useToastStore.getState().addToast(msg, 'error')
      throw err
    }
  },

  cancelRequest: async (id) => {
    try {
      await api.cancelLeaveRequest(id)
      set((state) => ({
        requests: state.requests.map((r) => (r.id === id ? { ...r, status: 'CANCELLED' as LeaveRequestStatus } : r)),
        pendingCount: Math.max(0, state.pendingCount - 1),
      }))
      useToastStore.getState().addToast('Đã hủy đơn xin nghỉ', 'info')
    } catch (err) {
      const msg = getErrorMessage(err, 'Lỗi khi hủy đơn xin nghỉ')
      useToastStore.getState().addToast(msg, 'error')
      throw err
    }
  },
}))
