import React from 'react'
import { create } from 'zustand'
import {
  promotionApiClient,
  ApprovePromotionPayload,
  PromotionDecisionDTO,
  PromotionSnapshotDTO,
  BatchPromotionResponseDTO,
} from '../lib/api/promotion'
import { ApiError } from '../lib/api'

export interface PromotionState {
  evaluationMap: Record<string, PromotionDecisionDTO>
  activeSnapshotMap: Record<string, PromotionSnapshotDTO>
  isEvaluating: boolean
  isApproving: boolean
  isBatchApproving: boolean
  batchResult: BatchPromotionResponseDTO | null
  error: string | null
  lockError: string | null
  done: boolean

  // Actions
  evaluateStudent: (studentId: string, academicYear?: string) => Promise<PromotionDecisionDTO | null>
  approveStudent: (payload: ApprovePromotionPayload) => Promise<PromotionSnapshotDTO | null>
  batchApproveStudents: (items: ApprovePromotionPayload[], chunkSize?: number) => Promise<BatchPromotionResponseDTO | null>
  clearBatchResult: () => void
  clearErrors: () => void
  setDone: (done: boolean) => void
}

export const usePromotionStore = create<PromotionState>((set, get) => ({
  evaluationMap: {},
  activeSnapshotMap: {},
  isEvaluating: false,
  isApproving: false,
  isBatchApproving: false,
  batchResult: null,
  error: null,
  lockError: null,
  done: false,

  evaluateStudent: async (studentId: string, academicYear = '2025-2026') => {
    set({ isEvaluating: true, error: null, lockError: null })
    try {
      const decision = await promotionApiClient.evaluateStudent(studentId, academicYear)
      set((state) => ({
        evaluationMap: { ...state.evaluationMap, [studentId]: decision },
        isEvaluating: false,
      }))
      return decision
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : 'Lỗi khi đánh giá điều kiện xét lên lớp'
      if (err instanceof ApiError && err.status === 403) {
        set({ lockError: msg, isEvaluating: false })
      } else {
        set({ error: msg, isEvaluating: false })
      }
      return null
    }
  },

  approveStudent: async (payload: ApprovePromotionPayload) => {
    // ADR-015: Immediate double-click guard
    if (get().isApproving) return null
    set({ isApproving: true, error: null, lockError: null })

    try {
      const snapshot = await promotionApiClient.approveStudent(payload)
      set((state) => ({
        activeSnapshotMap: { ...state.activeSnapshotMap, [payload.studentId]: snapshot },
        isApproving: false,
      }))
      return snapshot
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : 'Lỗi khi phê duyệt xét lên lớp'
      if (err instanceof ApiError && err.status === 403) {
        set({ lockError: msg, isApproving: false })
      } else {
        set({ error: msg, isApproving: false })
      }
      return null
    }
  },

  batchApproveStudents: async (items: ApprovePromotionPayload[], chunkSize = 10) => {
    // ADR-015: Double-click submit guard
    if (get().isBatchApproving) return null
    set({ isBatchApproving: true, error: null, lockError: null, batchResult: null })

    try {
      const result = await promotionApiClient.batchApproveStudents(items, chunkSize)
      
      // Update local snapshots for successfully saved items
      const updatedSnapshots = { ...get().activeSnapshotMap }
      for (const item of result.results) {
        if (item.status === 'saved' && item.snapshot) {
          updatedSnapshots[item.studentId] = item.snapshot
        }
      }

      set({
        batchResult: result,
        activeSnapshotMap: updatedSnapshots,
        isBatchApproving: false,
      })
      return result
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : 'Lỗi khi phê duyệt hàng loạt'
      if (err instanceof ApiError && err.status === 403) {
        set({ lockError: msg, isBatchApproving: false })
      } else {
        set({ error: msg, isBatchApproving: false })
      }
      return null
    }
  },

  clearBatchResult: () => set({ batchResult: null }),
  clearErrors: () => set({ error: null, lockError: null }),
  setDone: (done) => set({ done }),
}))
