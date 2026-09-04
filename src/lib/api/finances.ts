import { request } from './core'
import type { Fund, FinancialTransaction, StudentFeeRecord, FinanceSummary, CreateTransactionInput, CreateFundInput } from '../../types'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const financesApi = {
    getSummary: (academicYear?: string) =>
      request<FinanceSummary>('GET', academicYear ? `/finances/summary?academicYear=${encodeURIComponent(academicYear)}` : '/finances/summary'),

    getFunds: () =>
      request<Fund[]>('GET', '/finances/funds'),

    createFund: (data: CreateFundInput) =>
      request<Fund>('POST', '/finances/funds', data),

    getTransactions: async (params?: Record<string, string>) => {
      const query = params ? '?' + new URLSearchParams(params).toString() : ''
      // SEC-NET-1 (2026-08-24): chuyển từ fetch thô sang pipeline request() chung —
      // trước đây endpoint này KHÔNG có retry, refresh-on-401 lẫn timeout:
      // 401 sau 15m không tự refresh → lỗi "Failed to fetch transactions" giả.
      // keepEnvelope=true vì listResponse trả { success, data, total }.
      const json = await request<{ success: boolean; data: FinancialTransaction[]; total: number }>(
        'GET',
        `/finances/transactions${query}`,
        undefined,
        0,
        undefined,
        false,
        'json',
        true,
      )
      return { data: json.data || [], total: json.total ?? 0 }
    },

    createTransaction: (data: CreateTransactionInput) =>
      request<FinancialTransaction>('POST', '/finances/transactions', data),

    deleteTransaction: (id: string) =>
      request<{ deleted: boolean }>('DELETE', `/finances/transactions/${encodeURIComponent(id)}`),

    getClassFeeRecords: (classId: string, academicYear?: string, feeType?: string) => {
      const params = new URLSearchParams()
      if (academicYear) params.append('academicYear', academicYear)
      if (feeType) params.append('feeType', feeType)
      const q = params.toString() ? `?${params.toString()}` : ''
      return request<StudentFeeRecord[]>('GET', `/finances/classes/${encodeURIComponent(classId)}/fees${q}`)
    },

    updateStudentFee: (classId: string, data: import('../../types/finance').UpdateStudentFeeInput) =>
      request<StudentFeeRecord>('POST', `/finances/classes/${encodeURIComponent(classId)}/fees`, data),

    updateStudentFeesBatch: (classId: string, records: import('../../types/finance').UpdateStudentFeeInput[]) =>
      request<StudentFeeRecord[]>('POST', `/finances/classes/${encodeURIComponent(classId)}/fees/batch`, { records }),
}
