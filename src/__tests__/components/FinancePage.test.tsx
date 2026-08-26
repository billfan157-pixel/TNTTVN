import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { FinancePage } from '../../pages/FinancePage'
import { useAuthStore } from '../../stores/authStore'

vi.mock(import('../../lib/api'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      ...actual.api,
      finances: {
        getSummary: vi.fn().mockResolvedValue({
          totalBalance: 12000000,
          totalIncome: 15000000,
          totalExpense: 3000000,
          academicYear: '2025-2026',
          funds: [
            { id: 'f1', name: 'Quỹ Chung Xứ Đoàn', code: 'GENERAL', currentBalance: 10000000, totalIncome: 12000000, totalExpense: 2000000, isDefault: true },
            { id: 'f2', name: 'Quỹ Bác Ái', code: 'CHARITY', currentBalance: 2000000, totalIncome: 3000000, totalExpense: 1000000, isDefault: false },
          ],
          recentTransactions: [
            { id: 'tx-1', type: 'INCOME', amount: 500000, category: 'Niên liễm', title: 'Thu niên liễm Khai Tâm 1', fundName: 'Quỹ Chung Xứ Đoàn', transactionDate: '2026-08-15', recordedByName: 'Admin' },
          ],
          monthlyStats: [],
          feeStats: {
            totalStudents: 50,
            paidCount: 45,
            unpaidCount: 5,
            exemptedCount: 0,
            totalExpected: 5000000,
            totalCollected: 4500000,
            collectionRate: 90,
          },
        }),
        getFunds: vi.fn().mockResolvedValue([]),
        createFund: vi.fn(),
        getTransactions: vi.fn().mockResolvedValue({ data: [], total: 0 }),
        createTransaction: vi.fn(),
        deleteTransaction: vi.fn(),
        getClassFeeRecords: vi.fn().mockResolvedValue([]),
        updateStudentFee: vi.fn(),
      },
      classes: {
        getAll: vi.fn().mockResolvedValue([]),
      },
    },
  }
})

vi.mock('../../stores/toastStore', () => ({
  useToastStore: (selector: any) => {
    const state = { addToast: vi.fn() }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: (selector: any) => {
    const state = { currentYear: '2025-2026', academicYears: ['2025-2026'] }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

describe('FinancePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders permission denied message for non-admin role', async () => {
    useAuthStore.setState({ user: { id: 'u1', username: 'glv', role: 'chunhiem', fullName: 'GLV A', parishId: 'gia-ton' } as any })
    await act(async () => {
      render(<FinancePage />)
    })

    expect(screen.getByText('Giới Hạn Quyền Quản Trị')).toBeDefined()
    expect(screen.getByText(/chỉ dành cho tài khoản có quyền Quản Trị/)).toBeDefined()
  })

  it('renders full dashboard for admin role', async () => {
    useAuthStore.setState({ user: { id: 'admin1', username: 'bill', role: 'admin', fullName: 'Xứ Đoàn Trưởng', parishId: 'gia-ton' } as any })

    await act(async () => {
      render(<FinancePage />)
    })

    expect(screen.getByText('Quản Lý Quỹ & Thu Chi Xứ Đoàn')).toBeDefined()
    expect(screen.getByText('Tạo Phiếu Thu')).toBeDefined()
    expect(screen.getByText('Tạo Phiếu Chi')).toBeDefined()
    expect(screen.getByText('Chuyển Quỹ')).toBeDefined()
    expect(screen.getByText('Thu Niên Liễm')).toBeDefined()
  })
})
