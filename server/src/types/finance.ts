export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER'

export type FeeStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'EXEMPTED'

export type FeeType = 'NIEN_LIEM' | 'TRAI_HE' | 'DONG_PHUC' | 'GIAO_LY' | 'OTHER'

export interface Fund {
  id: string
  name: string
  code: string
  description?: string | null
  initialBalance: number
  currentBalance: number
  totalIncome: number
  totalExpense: number
  isDefault: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface FinancialTransaction {
  id: string
  parishId: string
  fundId: string
  fundName?: string
  targetFundId?: string | null
  targetFundName?: string | null
  studentId?: string | null
  studentName?: string | null
  classId?: string | null
  className?: string | null
  academicYear: string
  type: TransactionType
  amount: number
  category: string
  title: string
  description?: string | null
  personName?: string | null
  personPhone?: string | null
  receiptNumber?: string | null
  receiptUrl?: string | null
  proofUrl?: string | null
  transactionDate: string
  recordedBy: string
  recordedByName?: string
  createdAt: string
  updatedAt?: string
}

export interface StudentFeeRecord {
  id: string
  parishId: string
  studentId: string
  holyName?: string
  studentName?: string
  studentCode?: string
  classId: string
  className?: string
  academicYear: string
  feeType: FeeType
  title: string
  expectedAmount: number
  paidAmount: number
  status: FeeStatus
  paidAt?: string | null
  receiptNumber?: string | null
  transactionId?: string | null
  note?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface FinanceSummary {
  totalBalance: number
  totalIncome: number
  totalExpense: number
  academicYear: string
  funds: Fund[]
  recentTransactions: FinancialTransaction[]
  monthlyStats: {
    month: string
    income: number
    expense: number
  }[]
  feeStats: {
    totalStudents: number
    paidCount: number
    unpaidCount: number
    exemptedCount: number
    totalExpected: number
    totalCollected: number
    collectionRate: number
  }
}

export interface CreateTransactionInput {
  fundId: string
  type: TransactionType
  amount: number
  category: string
  title: string
  description?: string
  personName?: string
  personPhone?: string
  transactionDate?: string
  receiptNumber?: string
  proofUrl?: string
  targetFundId?: string
  studentId?: string
  classId?: string
  academicYear?: string
}

export interface CreateFundInput {
  name: string
  code?: string
  description?: string
  initialBalance?: number
  isDefault?: boolean
}
