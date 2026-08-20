import { eq, and, sql, desc, inArray, isNull, gte, lte } from 'drizzle-orm'
import { db, type DbTransaction } from '../db/index.js'
import {
  funds,
  financialTransactions,
  studentFeeRecords,
  students,
  classes,
  auditLogs,
} from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { getCurrentAcademicYear } from '../utils/academicYear.js'
import type {
  TransactionType,
  FeeStatus,
  FeeType,
  Fund,
  FinancialTransaction,
  StudentFeeRecord,
  FinanceSummary,
  CreateTransactionInput,
  CreateFundInput,
} from '../types/finance.js'

function audit(
  tx: DbTransaction,
  params: {
    userId: string
    parishId: string
    ip: string
    userAgent: string
    action: string
    entityType: string
    entityId: string
    oldValue?: string | null
    newValue?: string | null
  }
) {
  return tx.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    oldValue: params.oldValue ?? null,
    newValue: params.newValue ?? null,
    ip: params.ip,
    userAgent: params.userAgent,
    parishId: params.parishId,
    createdAt: new Date().toISOString(),
  })
}

const DEFAULT_FUNDS = [
  { code: 'GENERAL', name: 'Quỹ Chung Xứ Đoàn', description: 'Quỹ hoạt động chính của Xứ Đoàn TNTT', isDefault: true },
  { code: 'CHARITY', name: 'Quỹ Bác Ái', description: 'Quỹ hỗ trợ thiếu nhi khó khăn và bác ái mùa Chay', isDefault: false },
  { code: 'CAMP', name: 'Quỹ Trại Hè & Sự Kiện', description: 'Quỹ tổ chức sa mạc huấn luyện, trại hè và các ngày lễ lớn', isDefault: false },
  { code: 'LEADERS', name: 'Quỹ Huynh Trưởng', description: 'Quỹ sinh hoạt và đào tạo Ban Huynh Trưởng', isDefault: false },
]

function financeBadRequest(message: string): never {
  const err = new Error(message) as Error & { status: number }
  err.status = 400
  throw err
}

async function assertActiveFundInParish(fundId: string, parishId: string): Promise<void> {
  const [fund] = await db
    .select({ id: funds.id, isActive: funds.isActive })
    .from(funds)
    .where(and(eq(funds.id, fundId), eq(funds.parishId, parishId)))
    .limit(1)
  if (!fund || !fund.isActive) financeBadRequest('Quỹ không tồn tại hoặc đã ngừng hoạt động trong giáo xứ hiện tại')
}

async function assertClassInParish(classId: string, parishId: string): Promise<void> {
  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) financeBadRequest('Lớp học không tồn tại trong giáo xứ hiện tại')
}

async function assertStudentClassInParish(studentId: string, classId: string | undefined, parishId: string): Promise<void> {
  const [student] = await db
    .select({ id: students.id, classId: students.classId })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
    .limit(1)
  if (!student) financeBadRequest('Thiếu nhi không tồn tại trong giáo xứ hiện tại')
  if (classId && student.classId !== classId) financeBadRequest('Thiếu nhi không thuộc lớp học đã chọn')
  await assertClassInParish(classId || student.classId, parishId)
}

async function assertTransactionReferences(data: CreateTransactionInput, parishId: string): Promise<void> {
  await assertActiveFundInParish(data.fundId, parishId)

  if (data.type === 'TRANSFER') {
    if (!data.targetFundId) financeBadRequest('Chuyển quỹ phải chọn quỹ nhận')
    if (data.targetFundId === data.fundId) financeBadRequest('Quỹ nhận phải khác quỹ nguồn')
    await assertActiveFundInParish(data.targetFundId, parishId)
  }

  if (data.studentId) {
    await assertStudentClassInParish(data.studentId, data.classId, parishId)
  } else if (data.classId) {
    await assertClassInParish(data.classId, parishId)
  }
}

/**
 * Ensures default funds exist for a parish.
 */
export async function ensureDefaultFunds(parishId: string): Promise<void> {
  const existing = await db.select().from(funds).where(eq(funds.parishId, parishId))
  if (existing.length === 0) {
    const now = new Date().toISOString()
    for (const df of DEFAULT_FUNDS) {
      await db.insert(funds).values({
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
      }).onConflictDoNothing()
    }
  }
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
      total: sql<number>`SUM(${financialTransactions.amount})`.mapWith(Number)
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.parishId, parishId))
    .groupBy(financialTransactions.fundId, financialTransactions.type)

  const transferStats = await db
    .select({
      targetFundId: financialTransactions.targetFundId,
      total: sql<number>`SUM(${financialTransactions.amount})`.mapWith(Number)
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.parishId, parishId),
        eq(financialTransactions.type, 'TRANSFER'),
        sql`${financialTransactions.targetFundId} IS NOT NULL`
      )
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
 * Creates a new custom fund.
 */
export async function createFund(
  data: CreateFundInput,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string
): Promise<Fund> {
  const id = generateId('FND')
  const now = new Date().toISOString()

  const row = {
    id,
    parishId,
    name: data.name.trim(),
    code: (data.code || data.name).trim().toUpperCase().replace(/\s+/g, '_'),
    description: data.description?.trim() || null,
    initialBalance: data.initialBalance ?? 0,
    isDefault: Boolean(data.isDefault),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(funds).values(row)

  await audit(db as any, {
    userId,
    parishId,
    ip,
    userAgent,
    action: 'FUND_CREATE',
    entityType: 'fund',
    entityId: id,
    newValue: JSON.stringify(row),
  })

  return {
    ...row,
    currentBalance: row.initialBalance,
    totalIncome: 0,
    totalExpense: 0,
  }
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
  } = {}
): Promise<{ transactions: FinancialTransaction[]; total: number }> {
  const conditions = [eq(financialTransactions.parishId, parishId)]

  if (filters.fundId) {
    conditions.push(
      sql`(${financialTransactions.fundId} = ${filters.fundId} OR ${financialTransactions.targetFundId} = ${filters.fundId})`
    )
  }
  if (filters.type) {
    conditions.push(eq(financialTransactions.type, filters.type))
  }
  if (filters.category) {
    conditions.push(eq(financialTransactions.category, filters.category))
  }
  if (filters.academicYear) {
    conditions.push(eq(financialTransactions.academicYear, filters.academicYear))
  }
  if (filters.classId) {
    conditions.push(eq(financialTransactions.classId, filters.classId))
  }
  if (filters.startDate) {
    conditions.push(gte(financialTransactions.transactionDate, filters.startDate))
  }
  if (filters.endDate) {
    conditions.push(lte(financialTransactions.transactionDate, filters.endDate))
  }

  const whereClause = and(...conditions)

  const rows = await db
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
    .where(whereClause)
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.createdAt))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0)

  // Map fund names
  const allFunds = await db.select({ id: funds.id, name: funds.name }).from(funds).where(eq(funds.parishId, parishId))
  const fundMap = new Map(allFunds.map((f) => [f.id, f.name]))

  const transactions: FinancialTransaction[] = rows.map((r) => ({
    ...r.tx,
    type: r.tx.type as TransactionType,
    fundName: r.fundName || fundMap.get(r.tx.fundId) || 'Quỹ',
    targetFundName: r.tx.targetFundId ? fundMap.get(r.tx.targetFundId) || 'Quỹ nhận' : null,
    studentName: r.studentFullName ? `${r.studentHolyName ? r.studentHolyName + ' ' : ''}${r.studentFullName}` : null,
    className: r.className || null,
  }))

  return {
    transactions,
    total: transactions.length,
  }
}

/**
 * Creates a financial transaction.
 */
export async function createTransaction(
  data: CreateTransactionInput,
  userId: string,
  userName: string,
  parishId: string,
  ip: string,
  userAgent: string
): Promise<FinancialTransaction> {
  await assertTransactionReferences(data, parishId)

  const id = generateId('TXN')
  const now = new Date().toISOString()
  const academicYear = data.academicYear || getCurrentAcademicYear()
  const transactionDate = data.transactionDate || now.slice(0, 10)

  // Auto-generate receipt number if omitted
  let receiptNumber = data.receiptNumber
  if (!receiptNumber) {
    const prefix = data.type === 'INCOME' ? 'PT' : data.type === 'EXPENSE' ? 'PC' : 'UNC'
    const yearSuffix = transactionDate.slice(0, 4)
    const pattern = `${prefix}-${yearSuffix}-%`

    const maxTxResult = await db
      .select({ receiptNumber: financialTransactions.receiptNumber })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.parishId, parishId),
          sql`${financialTransactions.receiptNumber} LIKE ${pattern}`
        )
      )
      .orderBy(desc(financialTransactions.receiptNumber))
      .limit(1)

    let nextNum = 1
    if (maxTxResult.length > 0 && maxTxResult[0].receiptNumber) {
      const match = maxTxResult[0].receiptNumber.match(/-(\d+)$/)
      if (match) {
        nextNum = parseInt(match[1], 10) + 1
      }
    }
    const paddedNum = nextNum.toString().padStart(4, '0')
    receiptNumber = `${prefix}-${yearSuffix}-${paddedNum}`
  }

  const row = {
    id,
    parishId,
    fundId: data.fundId,
    type: data.type,
    amount: Math.abs(data.amount),
    category: data.category.trim(),
    title: data.title.trim(),
    description: data.description?.trim() || null,
    personName: data.personName?.trim() || null,
    personPhone: data.personPhone?.trim() || null,
    studentId: data.studentId || null,
    classId: data.classId || null,
    academicYear,
    transactionDate,
    receiptNumber,
    proofUrl: data.proofUrl || null,
    targetFundId: data.type === 'TRANSFER' ? data.targetFundId || null : null,
    recordedBy: userId,
    recordedByName: userName,
    createdAt: now,
  }

  await db.insert(financialTransactions).values(row)

  await audit(db as any, {
    userId,
    parishId,
    ip,
    userAgent,
    action: `TXN_${data.type}`,
    entityType: 'financial_transaction',
    entityId: id,
    newValue: JSON.stringify(row),
  })

  return row as FinancialTransaction
}

/**
 * Deletes a transaction with audit log.
 */
export async function deleteTransaction(
  id: string,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(financialTransactions)
    .where(and(eq(financialTransactions.id, id), eq(financialTransactions.parishId, parishId)))
    .limit(1)

  if (!existing) return false

  await db
    .delete(financialTransactions)
    .where(and(eq(financialTransactions.id, id), eq(financialTransactions.parishId, parishId)))

  // Unlink fee record if exists
  await db
    .update(studentFeeRecords)
    .set({ transactionId: null, status: 'UNPAID', paidAmount: 0, paidDate: null })
    .where(and(eq(studentFeeRecords.transactionId, id), eq(studentFeeRecords.parishId, parishId)))

  await audit(db as any, {
    userId,
    parishId,
    ip,
    userAgent,
    action: 'TXN_DELETE',
    entityType: 'financial_transaction',
    entityId: id,
    oldValue: JSON.stringify(existing),
  })

  return true
}

/**
 * Gets full financial summary & dashboard statistics.
 */
export async function getFinanceSummary(parishId: string, academicYear?: string): Promise<FinanceSummary> {
  const targetAY = academicYear || getCurrentAcademicYear()
  const allFunds = await listFunds(parishId)

  let totalBalance = 0
  let totalIncome = 0
  let totalExpense = 0

  for (const f of allFunds) {
    totalBalance += f.currentBalance
    totalIncome += f.totalIncome
    totalExpense += f.totalExpense
  }

  const { transactions: recentTransactions } = await listTransactions(parishId, {
    academicYear: targetAY,
    limit: 10,
  })

  // Monthly stats (T01 - T12)
  const monthlyStats = Array.from({ length: 12 }, (_, i) => {
    const monthNum = String(i + 1).padStart(2, '0')
    return {
      month: `T${monthNum}`,
      income: 0,
      expense: 0,
    }
  })

  const yearTransactions = await db
    .select()
    .from(financialTransactions)
    .where(and(eq(financialTransactions.parishId, parishId), eq(financialTransactions.academicYear, targetAY)))

  for (const tx of yearTransactions) {
    if (tx.transactionDate && tx.transactionDate.length >= 7) {
      const m = parseInt(tx.transactionDate.slice(5, 7), 10)
      if (m >= 1 && m <= 12) {
        if (tx.type === 'INCOME') monthlyStats[m - 1].income += tx.amount
        else if (tx.type === 'EXPENSE') monthlyStats[m - 1].expense += tx.amount
      }
    }
  }

  // Student Fee Collection stats
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
  feeType: FeeType = 'NIEN_LIEM'
): Promise<StudentFeeRecord[]> {
  const classStudents = await db
    .select({
      id: students.id,
      code: students.code,
      fullName: students.fullName,
      holyName: students.holyName,
      classId: students.classId,
    })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.parishId, parishId), isNull(students.deletedAt)))
    .orderBy(students.fullName)

  const existingRecords = await db
    .select()
    .from(studentFeeRecords)
    .where(
      and(
        eq(studentFeeRecords.classId, classId),
        eq(studentFeeRecords.parishId, parishId),
        eq(studentFeeRecords.academicYear, academicYear),
        eq(studentFeeRecords.feeType, feeType)
      )
    )

  const recordMap = new Map(existingRecords.map((r) => [r.studentId, r]))

  const [cls] = await db.select({ name: classes.name }).from(classes).where(and(eq(classes.id, classId), eq(classes.parishId, parishId))).limit(1)
  const className = cls?.name || 'Lớp'

  return classStudents.map((st) => {
    const rec = recordMap.get(st.id)
    if (rec) {
      return {
        id: rec.id,
        parishId: rec.parishId,
        studentId: st.id,
        studentName: st.fullName,
        holyName: st.holyName,
        studentCode: st.code,
        classId,
        className,
        academicYear,
        feeType: rec.feeType as FeeType,
        title: rec.title,
        expectedAmount: rec.expectedAmount,
        paidAmount: rec.paidAmount,
        status: rec.status as FeeStatus,
        paidDate: rec.paidDate,
        transactionId: rec.transactionId,
        note: rec.note,
        updatedBy: rec.updatedBy,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
      }
    }

    // Default placeholder state if student doesn't have a record yet
    return {
      id: `fee-tmp-${st.id}`,
      parishId,
      studentId: st.id,
      studentName: st.fullName,
      holyName: st.holyName,
      studentCode: st.code,
      classId,
      className,
      academicYear,
      feeType,
      title: `Niên liễm niên khóa ${academicYear}`,
      expectedAmount: 100000, // Mặc định 100.000đ
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
}

/**
 * Updates / collects fee for a student.
 */
export async function updateStudentFee(
  parishId: string,
  data: {
    studentId: string
    classId: string
    academicYear: string
    feeType: FeeType
    title: string
    expectedAmount: number
    paidAmount: number
    status: FeeStatus
    note?: string
    createTransaction?: boolean
    fundId?: string
  },
  userId: string,
  userName: string,
  ip: string,
  userAgent: string
): Promise<StudentFeeRecord> {
  // Domain 2: validate ownership before any optional transaction or fee write.
  await assertStudentClassInParish(data.studentId, data.classId, parishId)

  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  let transactionId: string | null = null

  // Optionally create income transaction
  if (data.createTransaction && data.paidAmount > 0 && data.status === 'PAID') {
    let targetFundId = data.fundId
    if (!targetFundId) {
      const [defaultFund] = await db
        .select({ id: funds.id })
        .from(funds)
        .where(and(eq(funds.parishId, parishId), eq(funds.isDefault, true)))
        .limit(1)
      targetFundId = defaultFund?.id
    }

    if (targetFundId) {
      const [st] = await db
        .select()
        .from(students)
        .where(and(eq(students.id, data.studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
        .limit(1)
      const stName = st ? `${st.holyName ? st.holyName + ' ' : ''}${st.fullName}` : 'Học sinh'

      const tx = await createTransaction(
        {
          fundId: targetFundId,
          type: 'INCOME',
          amount: data.paidAmount,
          category: 'Niên liễm',
          title: `Thu ${data.title}: ${stName}`,
          studentId: data.studentId,
          classId: data.classId,
          academicYear: data.academicYear,
          transactionDate: today,
        },
        userId,
        userName,
        parishId,
        ip,
        userAgent
      )
      transactionId = tx.id
    }
  }

  const existing = await db
    .select()
    .from(studentFeeRecords)
    .where(
      and(
        eq(studentFeeRecords.studentId, data.studentId),
        eq(studentFeeRecords.parishId, parishId),
        eq(studentFeeRecords.academicYear, data.academicYear),
        eq(studentFeeRecords.feeType, data.feeType)
      )
    )
    .limit(1)

  const id = existing[0]?.id || generateId('FEE')

  const row = {
    id,
    parishId,
    studentId: data.studentId,
    classId: data.classId,
    academicYear: data.academicYear,
    feeType: data.feeType,
    title: data.title,
    expectedAmount: data.expectedAmount,
    paidAmount: data.paidAmount,
    status: data.status,
    paidDate: data.paidAmount > 0 ? today : null,
    transactionId: transactionId || existing[0]?.transactionId || null,
    note: data.note || null,
    updatedBy: userId,
    updatedAt: now,
  }

  if (existing.length > 0) {
    await db
      .update(studentFeeRecords)
      .set(row)
      .where(and(eq(studentFeeRecords.id, id), eq(studentFeeRecords.parishId, parishId)))
  } else {
    await db.insert(studentFeeRecords).values({
      ...row,
      createdAt: now,
    })
  }

  await audit(db as any, {
    userId,
    parishId,
    ip,
    userAgent,
    action: 'STUDENT_FEE_UPDATE',
    entityType: 'student_fee_record',
    entityId: id,
    newValue: JSON.stringify(row),
  })

  return row as StudentFeeRecord
}
