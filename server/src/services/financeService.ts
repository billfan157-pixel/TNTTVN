import { eq, and, sql, desc, isNull, gte, lte, inArray, or } from 'drizzle-orm'
import { db, runDbTransaction } from '../db/index.js'
import {
  funds,
  financialTransactions,
  studentFeeRecords,
  students,
  classes,
  academicYears,
  academicYearSnapshots,
} from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { normalizeAcademicYear, isAcademicYearClosedForWrite } from '../utils/academicYear.js'
import { getActiveAcademicYearId } from './academicYearService.js'

import type {
  TransactionType,
  FeeStatus,
  FeeType,
  Fund,
  FinancialTransaction,
  StudentFeeRecord,
  FinanceSummary,
} from '../types/finance.js'

// Backward-compatible command exports. The implementation lives exclusively in
// FinanceApplicationService so legacy imports cannot bypass its ACID boundary.
export {
  createFund,
  createTransaction,
  deleteTransaction,
  updateStudentFee,
} from './FinanceApplicationService.js'

const DEFAULT_FUNDS = [
  { code: 'GENERAL', name: 'Quỹ Chung Xứ Đoàn', description: 'Quỹ hoạt động chính của Xứ Đoàn TNTT', isDefault: true },
  { code: 'CHARITY', name: 'Quỹ Bác Ái', description: 'Quỹ hỗ trợ thiếu nhi khó khăn và bác ái mùa Chay', isDefault: false },
  { code: 'CAMP', name: 'Quỹ Trại Hè & Sự Kiện', description: 'Quỹ tổ chức sa mạc huấn luyện, trại hè và các ngày lễ lớn', isDefault: false },
  { code: 'LEADERS', name: 'Quỹ Huynh Trưởng', description: 'Quỹ sinh hoạt và đào tạo Ban Huynh Trưởng', isDefault: false },
]

/**
 * Ensures default funds exist for a parish.
 *
 * A single INSERT statement is used so first-use initialization is atomic at the
 * SQLite statement level; retries remain harmless via ON CONFLICT DO NOTHING.
 */
export async function ensureDefaultFunds(parishId: string): Promise<void> {
  const existing = await db.select({ id: funds.id }).from(funds).where(eq(funds.parishId, parishId)).limit(1)
  if (existing.length > 0) return

  const now = new Date().toISOString()
  await db.insert(funds).values(DEFAULT_FUNDS.map((df) => ({
    id: generateId('FND'),
    parishId,
    name: df.name,
    code: df.code,
    description: df.description,
    initialBalance: 0,
    isDefault: df.isDefault,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }))).onConflictDoNothing()
}

/**
 * Lists all funds with aggregated current balance, total income, and total expense.
 */
export async function listFunds(parishId: string): Promise<Fund[]> {
  await ensureDefaultFunds(parishId)

  const fundRows = await db
    .select()
    .from(funds)
    .where(eq(funds.parishId, parishId))

  const fundStats = await db
    .select({
      fundId: financialTransactions.fundId,
      type: financialTransactions.type,
      total: sql<number>`SUM(${financialTransactions.amount})`.mapWith(Number),
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.parishId, parishId))
    .groupBy(financialTransactions.fundId, financialTransactions.type)

  const transferStats = await db
    .select({
      targetFundId: financialTransactions.targetFundId,
      total: sql<number>`SUM(${financialTransactions.amount})`.mapWith(Number),
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.parishId, parishId),
        eq(financialTransactions.type, 'TRANSFER'),
        sql`${financialTransactions.targetFundId} IS NOT NULL`,
      ),
    )
    .groupBy(financialTransactions.targetFundId)

  const statsMap = new Map<string, { income: number; expense: number }>()

  for (const stat of fundStats) {
    if (!stat.fundId) continue
    const current = statsMap.get(stat.fundId) || { income: 0, expense: 0 }
    if (stat.type === 'INCOME') {
      current.income += stat.total
    } else if (stat.type === 'EXPENSE' || stat.type === 'TRANSFER') {
      current.expense += stat.total
    }
    statsMap.set(stat.fundId, current)
  }

  for (const stat of transferStats) {
    if (!stat.targetFundId) continue
    const current = statsMap.get(stat.targetFundId) || { income: 0, expense: 0 }
    current.income += stat.total
    statsMap.set(stat.targetFundId, current)
  }

  return fundRows.map((f) => {
    const stats = statsMap.get(f.id) || { income: 0, expense: 0 }
    const currentBalance = (f.initialBalance || 0) + stats.income - stats.expense

    return {
      id: f.id,
      parishId: f.parishId,
      name: f.name,
      code: f.code,
      description: f.description,
      initialBalance: f.initialBalance || 0,
      currentBalance,
      totalIncome: stats.income,
      totalExpense: stats.expense,
      isDefault: Boolean(f.isDefault),
      isActive: Boolean(f.isActive),
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }
  })
}

/**
 * Lists financial transactions with filters.
 */
export async function listTransactions(
  parishId: string,
  filters: {
    fundId?: string
    type?: TransactionType
    category?: string
    academicYear?: string
    startDate?: string
    endDate?: string
    classId?: string
    limit?: number
    offset?: number
  } = {},
): Promise<{ transactions: FinancialTransaction[]; total: number }> {
  const conditions = [eq(financialTransactions.parishId, parishId)]

  if (filters.fundId) {
    conditions.push(
      sql`(${financialTransactions.fundId} = ${filters.fundId} OR ${financialTransactions.targetFundId} = ${filters.fundId})`,
    )
  }
  if (filters.type) conditions.push(eq(financialTransactions.type, filters.type))
  if (filters.category) conditions.push(eq(financialTransactions.category, filters.category))
  if (filters.academicYear) conditions.push(eq(financialTransactions.academicYear, filters.academicYear))
  if (filters.classId) conditions.push(eq(financialTransactions.classId, filters.classId))
  if (filters.startDate) conditions.push(gte(financialTransactions.transactionDate, filters.startDate))
  if (filters.endDate) conditions.push(lte(financialTransactions.transactionDate, filters.endDate))

  return runDbTransaction(async (tx) => {
    const rows = await tx
      .select({
        tx: financialTransactions,
        fundName: funds.name,
        studentFullName: students.fullName,
        studentHolyName: students.holyName,
        className: classes.name,
      })
      .from(financialTransactions)
      .leftJoin(funds, and(eq(funds.id, financialTransactions.fundId), eq(funds.parishId, parishId)))
      .leftJoin(students, and(eq(students.id, financialTransactions.studentId), eq(students.parishId, parishId)))
      .leftJoin(classes, and(eq(classes.id, financialTransactions.classId), eq(classes.parishId, parishId)))
      .where(and(...conditions))
      .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.createdAt))
      .limit(filters.limit ?? 100)
      .offset(filters.offset ?? 0)

    const countRows = await tx
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(financialTransactions)
      .where(and(...conditions))
    const allFunds = await tx
      .select({ id: funds.id, name: funds.name })
      .from(funds)
      .where(eq(funds.parishId, parishId))
    const fundMap = new Map(allFunds.map((f) => [f.id, f.name]))

    const transactions: FinancialTransaction[] = rows.map((r) => ({
      ...r.tx,
      type: r.tx.type as TransactionType,
      fundName: r.fundName || fundMap.get(r.tx.fundId) || 'Quỹ',
      targetFundName: r.tx.targetFundId ? fundMap.get(r.tx.targetFundId) || 'Quỹ nhận' : null,
      studentName: r.studentFullName ? `${r.studentHolyName ? `${r.studentHolyName} ` : ''}${r.studentFullName}` : null,
      className: r.className || null,
    }))

    return { transactions, total: Number(countRows[0]?.total || 0) }
  })
}

/**
 * Gets full financial summary & dashboard statistics.
 */
export async function getFinanceSummary(parishId: string, academicYear?: string): Promise<FinanceSummary> {
  const targetAY = academicYear || await getActiveAcademicYearId(parishId)
  const allFunds = await listFunds(parishId)

  let totalBalance = 0
  for (const fund of allFunds) totalBalance += fund.currentBalance

  const { transactions: recentTransactions } = await listTransactions(parishId, {
    academicYear: targetAY,
    limit: 10,
  })

  const monthlyStats = Array.from({ length: 12 }, (_, index) => ({
    month: `T${String(index + 1).padStart(2, '0')}`,
    income: 0,
    expense: 0,
  }))

  const yearTransactions = await db
    .select()
    .from(financialTransactions)
    .where(and(eq(financialTransactions.parishId, parishId), eq(financialTransactions.academicYear, targetAY)))
  let totalIncome = 0
  let totalExpense = 0

  for (const transaction of yearTransactions) {
    if (transaction.type === 'INCOME') totalIncome += transaction.amount
    else if (transaction.type === 'EXPENSE') totalExpense += transaction.amount
    if (!transaction.transactionDate || transaction.transactionDate.length < 7) continue
    const month = Number.parseInt(transaction.transactionDate.slice(5, 7), 10)
    if (month < 1 || month > 12) continue
    if (transaction.type === 'INCOME') monthlyStats[month - 1].income += transaction.amount
    else if (transaction.type === 'EXPENSE') monthlyStats[month - 1].expense += transaction.amount
  }

  const feeRows = await db
    .select()
    .from(studentFeeRecords)
    .where(and(eq(studentFeeRecords.parishId, parishId), eq(studentFeeRecords.academicYear, targetAY)))

  const totalStudents = feeRows.length
  let paidCount = 0
  let unpaidCount = 0
  let exemptedCount = 0
  let totalExpected = 0
  let totalCollected = 0

  for (const fee of feeRows) {
    totalExpected += fee.expectedAmount || 0
    totalCollected += fee.paidAmount || 0
    if (fee.status === 'PAID') paidCount++
    else if (fee.status === 'EXEMPTED') exemptedCount++
    else unpaidCount++
  }

  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0

  return {
    totalBalance,
    totalIncome,
    totalExpense,
    academicYear: targetAY,
    funds: allFunds,
    recentTransactions,
    monthlyStats,
    feeStats: {
      totalStudents,
      paidCount,
      unpaidCount,
      exemptedCount,
      totalExpected,
      totalCollected,
      collectionRate,
    },
  }
}

/**
 * Lists student fee records for a class.
 */
export async function listClassFeeRecords(
  parishId: string,
  classId: string,
  academicYear: string,
  feeType: FeeType = 'NIEN_LIEM',
): Promise<StudentFeeRecord[]> {
  return runDbTransaction(async (tx) => {
    const existingRecords = await tx.select().from(studentFeeRecords).where(and(
      eq(studentFeeRecords.classId, classId), eq(studentFeeRecords.parishId, parishId),
      eq(studentFeeRecords.academicYear, academicYear), eq(studentFeeRecords.feeType, feeType),
    ))
    const [cls] = await tx.select().from(classes).where(and(eq(classes.id, classId), eq(classes.parishId, parishId))).limit(1)
    if (!cls) return []
    const [year] = await tx.select().from(academicYears).where(and(eq(academicYears.id, cls.academicYearId), eq(academicYears.parishId, parishId))).limit(1)
    const matchesClassYear = normalizeAcademicYear(cls.academicYearId) === normalizeAcademicYear(academicYear)
    const frozen = !!year && isAcademicYearClosedForWrite(year)
    const cohort = frozen && matchesClassYear ? await tx.select({ studentId: academicYearSnapshots.studentId }).from(academicYearSnapshots).where(and(
      eq(academicYearSnapshots.parishId, parishId), eq(academicYearSnapshots.academicYearId, year.id),
      eq(academicYearSnapshots.sourceClassId, classId),
    )) : []
    // Fee facts retain their original class even after membership changes.
    // Legacy frozen years without cohort evidence show facts only, never invented debts.
    const historicalIds = [...new Set([...existingRecords.map(r => r.studentId), ...cohort.map(r => r.studentId)])]
    const rosterScope = frozen || !matchesClassYear
      ? (historicalIds.length ? inArray(students.id, historicalIds) : sql`0 = 1`)
      : or(eq(students.classId, classId), historicalIds.length ? inArray(students.id, historicalIds) : sql`0 = 1`)
    const classStudents = await tx
      .select({
        id: students.id,
        code: students.code,
        fullName: students.fullName,
        holyName: students.holyName,
        classId: students.classId,
      })
      .from(students)
      .where(and(rosterScope, eq(students.parishId, parishId), isNull(students.deletedAt)))
      .orderBy(students.fullName)

    const recordMap = new Map(existingRecords.map((record) => [record.studentId, record]))
    const className = cls?.name || 'Lớp'

    return classStudents.map((student) => {
      const record = recordMap.get(student.id)
      if (record) {
        return {
          id: record.id,
          parishId: record.parishId,
          studentId: student.id,
          studentName: student.fullName,
          holyName: student.holyName,
          studentCode: student.code,
          classId,
          className,
          academicYear,
          feeType: record.feeType as FeeType,
          title: record.title,
          expectedAmount: record.expectedAmount,
          paidAmount: record.paidAmount,
          status: record.status as FeeStatus,
          paidDate: record.paidDate,
          transactionId: record.transactionId,
          note: record.note,
          updatedBy: record.updatedBy,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }
      }

      return {
        id: `fee-tmp-${student.id}`,
        parishId,
        studentId: student.id,
        studentName: student.fullName,
        holyName: student.holyName,
        studentCode: student.code,
        classId,
        className,
        academicYear,
        feeType,
        title: `Niên liễm niên khóa ${academicYear}`,
        expectedAmount: 100000,
        paidAmount: 0,
        status: 'UNPAID' as FeeStatus,
        paidDate: null,
        transactionId: null,
        note: null,
        updatedBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    })
  })
}
