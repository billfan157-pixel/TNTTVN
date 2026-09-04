import { create } from 'zustand'
import { api } from '../lib/api'
import type {
  Fund,
  FinancialTransaction,
  StudentFeeRecord,
  FinanceSummary,
  CreateTransactionInput,
  CreateFundInput,
  UpdateStudentFeeInput,
} from '../types/finance'

interface PaginationState {
  page: number
  pageSize: number
  total: number
}

/**
 * Filter server-side cho sổ giao dịch (P0.6 audit desktop 2026-08-22).
 * Server hỗ trợ sẵn query params type/startDate/endDate (server/routes/finances.ts)
 * — lọc ở store để setPage/setSelectedFundId/refresh giữ nguyên filter.
 */
export interface LedgerFilters {
  type: 'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER'
  startDate: string
  endDate: string
}

interface FinanceState {
  summary: FinanceSummary | null
  funds: Fund[]
  transactions: FinancialTransaction[]
  classFeeRecords: StudentFeeRecord[]
  selectedFundId: string
  selectedAcademicYear: string
  ledgerFilters: LedgerFilters
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
  updateStudentFee: (classId: string, data: UpdateStudentFeeInput) => Promise<StudentFeeRecord | null>
  updateStudentFeesBatch: (classId: string, records: UpdateStudentFeeInput[]) => Promise<StudentFeeRecord[] | null>
  setSelectedFundId: (id: string) => void
  setSelectedAcademicYear: (ay: string) => void
  setLedgerFilters: (partial: Partial<LedgerFilters>) => void
  resetLedgerFilters: () => void
  setPage: (page: number) => void
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  summary: null,
  funds: [],
  transactions: [],
  classFeeRecords: [],
  selectedFundId: 'ALL',
  selectedAcademicYear: '2025-2026',
  ledgerFilters: { type: 'ALL', startDate: '', endDate: '' },
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
      const { type, startDate, endDate } = get().ledgerFilters
      if (type !== 'ALL') {
        queryParams.type = type
      }
      if (startDate) {
        queryParams.startDate = startDate
      }
      if (endDate) {
        queryParams.endDate = endDate
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
    set({ isLoading: true, error: null })
    try {
      const res = await api.finances.updateStudentFee(classId, data)
      set((state) => ({
        classFeeRecords: state.classFeeRecords.map((r) =>
          r.studentId === data.studentId ? { ...r, ...res } : r
        ),
      }))
      await get().fetchSummary()
      set({ isLoading: false })
      return res
    } catch (err: any) {
      console.error('Failed to update student fee:', err)
      set({ error: err?.message || 'Không thể cập nhật khoản phí', isLoading: false })
      return null
    }
  },

  updateStudentFeesBatch: async (classId, records) => {
    set({ isLoading: true, error: null })
    try {
      const saved = await api.finances.updateStudentFeesBatch(classId, records)
      const byStudent = new Map(saved.map(record => [record.studentId, record]))
      set((state) => ({
        classFeeRecords: state.classFeeRecords.map(record => byStudent.get(record.studentId) || record),
      }))
      await get().fetchSummary()
      set({ isLoading: false })
      return saved
    } catch (err: any) {
      console.error('Failed to update student fees batch:', err)
      set({ error: err?.message || 'Không thể thu phí hàng loạt', isLoading: false })
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

  setLedgerFilters: (partial) => {
    set({ ledgerFilters: { ...get().ledgerFilters, ...partial }, pagination: { ...get().pagination, page: 1 } })
    get().fetchTransactions()
  },

  resetLedgerFilters: () => {
    set({ ledgerFilters: { type: 'ALL', startDate: '', endDate: '' }, pagination: { ...get().pagination, page: 1 } })
    get().fetchTransactions()
  },

  setPage: (page) => {
    set({ pagination: { ...get().pagination, page } })
    get().fetchTransactions()
  },
}))
