import { create } from 'zustand'
import { api } from '../lib/api'
import type {
  Fund,
  FinancialTransaction,
  StudentFeeRecord,
  FinanceSummary,
  CreateTransactionInput,
  CreateFundInput,
} from '../types/finance'

interface PaginationState {
  page: number
  pageSize: number
  total: number
}

interface FinanceState {
  summary: FinanceSummary | null
  funds: Fund[]
  transactions: FinancialTransaction[]
  classFeeRecords: StudentFeeRecord[]
  selectedFundId: string
  selectedAcademicYear: string
  isLoading: boolean
  error: string | null
  pagination: PaginationState

  // Actions
  fetchSummary: (academicYear?: string) => Promise<void>
  fetchFunds: () => Promise<void>
  createFund: (data: CreateFundInput) => Promise<Fund | null>
  fetchTransactions: (params?: Record<string, string>) => Promise<void>
  createTransaction: (data: CreateTransactionInput) => Promise<FinancialTransaction | null>
  deleteTransaction: (id: string) => Promise<boolean>
  fetchClassFeeRecords: (classId: string, academicYear?: string, feeType?: string) => Promise<void>
  updateStudentFee: (classId: string, data: any) => Promise<StudentFeeRecord | null>
  setSelectedFundId: (id: string) => void
  setSelectedAcademicYear: (ay: string) => void
  setPage: (page: number) => void
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  summary: null,
  funds: [],
  transactions: [],
  classFeeRecords: [],
  selectedFundId: 'ALL',
  selectedAcademicYear: '2025-2026',
  isLoading: false,
  error: null,
  pagination: { page: 1, pageSize: 50, total: 0 },

  fetchSummary: async (academicYear) => {
    set({ isLoading: true, error: null })
    try {
      const targetAY = academicYear || get().selectedAcademicYear
      const summary = await api.finances.getSummary(targetAY)
      set({ summary, funds: summary.funds, isLoading: false })
    } catch (err: any) {
      set({ error: err?.message || 'Không thể tải thống kê tài chính', isLoading: false })
    }
  },

  fetchFunds: async () => {
    try {
      const funds = await api.finances.getFunds()
      set({ funds })
    } catch (err: any) {
      console.error('Failed to fetch funds:', err)
    }
  },

  createFund: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const fund = await api.finances.createFund(data)
      await get().fetchSummary()
      set({ isLoading: false })
      return fund
    } catch (err: any) {
      set({ error: err?.message || 'Không thể tạo quỹ mới', isLoading: false })
      return null
    }
  },

  fetchTransactions: async (params) => {
    set({ isLoading: true, error: null })
    try {
      const { pagination } = get()
      const queryParams: Record<string, string> = {
        academicYear: get().selectedAcademicYear,
        limit: String(pagination.pageSize),
        offset: String((pagination.page - 1) * pagination.pageSize),
        ...(params || {}),
      }
      if (get().selectedFundId !== 'ALL') {
        queryParams.fundId = get().selectedFundId
      }

      const result = await api.finances.getTransactions(queryParams)
      set({
        transactions: result.data,
        pagination: { ...pagination, total: result.total },
        isLoading: false,
      })
    } catch (err: any) {
      set({ error: err?.message || 'Không thể tải sổ giao dịch', isLoading: false })
    }
  },

  createTransaction: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const tx = await api.finances.createTransaction({
        ...data,
        academicYear: data.academicYear || get().selectedAcademicYear,
      })
      await get().fetchSummary()
      await get().fetchTransactions()
      set({ isLoading: false })
      return tx
    } catch (err: any) {
      set({ error: err?.message || 'Không thể ghi nhận giao dịch', isLoading: false })
      return null
    }
  },

  deleteTransaction: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await api.finances.deleteTransaction(id)
      await get().fetchSummary()
      await get().fetchTransactions()
      set({ isLoading: false })
      return true
    } catch (err: any) {
      set({ error: err?.message || 'Không thể xóa giao dịch', isLoading: false })
      return false
    }
  },

  fetchClassFeeRecords: async (classId, academicYear, feeType) => {
    set({ isLoading: true, error: null })
    try {
      const ay = academicYear || get().selectedAcademicYear
      const records = await api.finances.getClassFeeRecords(classId, ay, feeType)
      set({ classFeeRecords: records, isLoading: false })
    } catch (err: any) {
      set({ error: err?.message || 'Không thể tải danh sách đóng tiền của lớp', isLoading: false })
    }
  },

  updateStudentFee: async (classId, data) => {
    try {
      const res = await api.finances.updateStudentFee(classId, data)
      set((state) => ({
        classFeeRecords: state.classFeeRecords.map((r) =>
          r.studentId === data.studentId ? { ...r, ...res } : r
        ),
      }))
      get().fetchSummary()
      return res
    } catch (err: any) {
      console.error('Failed to update student fee:', err)
      return null
    }
  },

  setSelectedFundId: (id) => {
    set({ selectedFundId: id, pagination: { ...get().pagination, page: 1 } })
    get().fetchTransactions()
  },

  setSelectedAcademicYear: (ay) => {
    set({ selectedAcademicYear: ay, pagination: { ...get().pagination, page: 1 } })
    get().fetchSummary(ay)
    get().fetchTransactions({ academicYear: ay })
  },

  setPage: (page) => {
    set({ pagination: { ...get().pagination, page } })
    get().fetchTransactions()
  },
}))
