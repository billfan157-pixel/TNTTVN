import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { runDbTransaction, type DbTransaction } from '../db/index.js'
import {
  auditLogs,
  classes,
  financialTransactions,
  funds,
  studentFeeRecords,
  students,
} from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { getCurrentAcademicYear } from '../utils/academicYear.js'
import { maskPhoneForAudit } from '../utils/auditRedact.js'
import type {
  CreateFundInput,
  CreateTransactionInput,
  FeeStatus,
  FeeType,
  FinancialTransaction,
  Fund,
  StudentFeeRecord,
} from '../types/finance.js'

interface AuditParams {
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

interface UpdateStudentFeeInput {
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
}

function financeBadRequest(message: string): never {
  const err = new Error(message) as Error & { status: number }
  err.status = 400
  throw err
}

function audit(tx: DbTransaction, params: AuditParams) {
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

async function assertActiveFundInParish(tx: DbTransaction, fundId: string, parishId: string): Promise<void> {
  const [fund] = await tx
    .select({ id: funds.id, isActive: funds.isActive })
    .from(funds)
    .where(and(eq(funds.id, fundId), eq(funds.parishId, parishId)))
    .limit(1)

  if (!fund || !fund.isActive) {
    financeBadRequest('Quỹ không tồn tại hoặc đã ngừng hoạt động trong giáo xứ hiện tại')
  }
}

async function assertClassInParish(tx: DbTransaction, classId: string, parishId: string): Promise<void> {
  const [cls] = await tx
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.parishId, parishId), isNull(classes.deletedAt)))
    .limit(1)

  if (!cls) financeBadRequest('Lớp học không tồn tại trong giáo xứ hiện tại')
}

async function assertStudentClassInParish(
  tx: DbTransaction,
  studentId: string,
  classId: string | undefined,
  parishId: string,
): Promise<void> {
  const [student] = await tx
    .select({ id: students.id, classId: students.classId })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
    .limit(1)

  if (!student) financeBadRequest('Thiếu nhi không tồn tại trong giáo xứ hiện tại')
  if (classId && student.classId !== classId) financeBadRequest('Thiếu nhi không thuộc lớp học đã chọn')
  await assertClassInParish(tx, classId || student.classId, parishId)
}

async function assertTransactionReferences(
  tx: DbTransaction,
  data: CreateTransactionInput,
  parishId: string,
): Promise<void> {
  await assertActiveFundInParish(tx, data.fundId, parishId)

  if (data.type === 'TRANSFER') {
    if (!data.targetFundId) financeBadRequest('Chuyển quỹ phải chọn quỹ nhận')
    if (data.targetFundId === data.fundId) financeBadRequest('Quỹ nhận phải khác quỹ nguồn')
    await assertActiveFundInParish(tx, data.targetFundId, parishId)
  }

  if (data.studentId) {
    await assertStudentClassInParish(tx, data.studentId, data.classId, parishId)
  } else if (data.classId) {
    await assertClassInParish(tx, data.classId, parishId)
  }
}

async function createTransactionInTx(
  tx: DbTransaction,
  data: CreateTransactionInput,
  userId: string,
  userName: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<FinancialTransaction> {
  await assertTransactionReferences(tx, data, parishId)

  // FIN-1 (audit 2026-08-21): receiptNumber do client cung cấp phải duy nhất trong
  // giáo xứ — trước đây insert im lặng chấp nhận trùng. Auto-allocation (không có
  // client receiptNumber) KHÔNG cần check: runDbTransaction = BEGIN IMMEDIATE
  // (@libsql/core transactionModeToBegin) nên SELECT-max → INSERT được serialize,
  // không thể hai tx cùng tính ra một số.
  if (data.receiptNumber) {
    const [dupReceipt] = await tx
      .select({ id: financialTransactions.id })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.parishId, parishId),
          eq(financialTransactions.receiptNumber, data.receiptNumber),
        ),
      )
      .limit(1)
    if (dupReceipt) {
      financeBadRequest(`Số phiếu "${data.receiptNumber}" đã tồn tại trong giáo xứ`)
    }
  }

  const id = generateId('TXN')
  const now = new Date().toISOString()
  const academicYear = data.academicYear || getCurrentAcademicYear()
  const transactionDate = data.transactionDate || now.slice(0, 10)

  let receiptNumber = data.receiptNumber
  if (!receiptNumber) {
    const prefix = data.type === 'INCOME' ? 'PT' : data.type === 'EXPENSE' ? 'PC' : 'UNC'
    const yearSuffix = transactionDate.slice(0, 4)
    const pattern = `${prefix}-${yearSuffix}-%`

    const maxTxResult = await tx
      .select({ receiptNumber: financialTransactions.receiptNumber })
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.parishId, parishId),
          sql`${financialTransactions.receiptNumber} LIKE ${pattern}`,
        ),
      )
      .orderBy(desc(financialTransactions.receiptNumber))
      .limit(1)

    let nextNum = 1
    if (maxTxResult.length > 0 && maxTxResult[0].receiptNumber) {
      const match = maxTxResult[0].receiptNumber.match(/-(\d+)$/)
      if (match) nextNum = Number.parseInt(match[1], 10) + 1
    }
    receiptNumber = `${prefix}-${yearSuffix}-${nextNum.toString().padStart(4, '0')}`
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

  await tx.insert(financialTransactions).values(row)
  // AUDIT-F5 (2026-08-22): bản sao audit KHÔNG lưu SĐT người nộp/nhận nguyên vẹn —
  // che giữ 4 số cuối như quy ước A16 cho student (auditRedact). personName giữ
  // nguyên văn để truy vết nghiệp vụ (nhất quán với fullName học sinh).
  await audit(tx, {
    userId,
    parishId,
    ip,
    userAgent,
    action: `TXN_${data.type}`,
    entityType: 'financial_transaction',
    entityId: id,
    newValue: JSON.stringify({ ...row, personPhone: maskPhoneForAudit(row.personPhone) }),
  })

  return row as FinancialTransaction
}

/**
 * D3 data-integrity boundary: the fund row and its audit record commit together.
 */
export async function createFund(
  data: CreateFundInput,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<Fund> {
  return runDbTransaction(async (tx) => {
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

    await tx.insert(funds).values(row)
    await audit(tx, {
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
  })
}

/**
 * D3 data-integrity boundary: validation, receipt allocation, ledger insert and audit
 * execute inside one database transaction.
 */
export async function createTransaction(
  data: CreateTransactionInput,
  userId: string,
  userName: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<FinancialTransaction> {
  return runDbTransaction((tx) => createTransactionInTx(tx, data, userId, userName, parishId, ip, userAgent))
}

/**
 * D3 data-integrity boundary: ledger deletion, linked fee reset and audit are atomic.
 */
export async function deleteTransaction(
  id: string,
  userId: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<boolean> {
  return runDbTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(financialTransactions)
      .where(and(eq(financialTransactions.id, id), eq(financialTransactions.parishId, parishId)))
      .limit(1)

    if (!existing) return false

    await tx
      .delete(financialTransactions)
      .where(and(eq(financialTransactions.id, id), eq(financialTransactions.parishId, parishId)))

    await tx
      .update(studentFeeRecords)
      .set({ transactionId: null, status: 'UNPAID', paidAmount: 0, paidDate: null })
      .where(and(eq(studentFeeRecords.transactionId, id), eq(studentFeeRecords.parishId, parishId)))

    await audit(tx, {
      userId,
      parishId,
      ip,
      userAgent,
      action: 'TXN_DELETE',
      entityType: 'financial_transaction',
      entityId: id,
      // AUDIT-F5: che SĐT trong oldValue (A16 — như TXN_CREATE)
      oldValue: JSON.stringify({ ...existing, personPhone: maskPhoneForAudit((existing as { personPhone?: string }).personPhone) }),
    })

    return true
  })
}

/**
 * D3 data-integrity boundary: optional payment ledger entry, fee record and both
 * audit records share one transaction. A failure at any later step rolls back all
 * preceding writes, eliminating orphaned receipts.
 */
export async function updateStudentFee(
  parishId: string,
  data: UpdateStudentFeeInput,
  userId: string,
  userName: string,
  ip: string,
  userAgent: string,
): Promise<StudentFeeRecord> {
  return runDbTransaction(async (tx) => {
    await assertStudentClassInParish(tx, data.studentId, data.classId, parishId)

    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    let transactionId: string | null = null

    if (data.createTransaction && data.paidAmount > 0 && data.status === 'PAID') {
      let targetFundId = data.fundId
      if (!targetFundId) {
        const [defaultFund] = await tx
          .select({ id: funds.id })
          .from(funds)
          .where(and(eq(funds.parishId, parishId), eq(funds.isDefault, true)))
          .limit(1)
        targetFundId = defaultFund?.id
      }

      if (targetFundId) {
        const [student] = await tx
          .select({ fullName: students.fullName, holyName: students.holyName })
          .from(students)
          .where(and(eq(students.id, data.studentId), eq(students.parishId, parishId), isNull(students.deletedAt)))
          .limit(1)

        const studentName = student
          ? `${student.holyName ? `${student.holyName} ` : ''}${student.fullName}`
          : 'Học sinh'

        const payment = await createTransactionInTx(
          tx,
          {
            fundId: targetFundId,
            type: 'INCOME',
            amount: data.paidAmount,
            category: 'Niên liễm',
            title: `Thu ${data.title}: ${studentName}`,
            studentId: data.studentId,
            classId: data.classId,
            academicYear: data.academicYear,
            transactionDate: today,
          },
          userId,
          userName,
          parishId,
          ip,
          userAgent,
        )
        transactionId = payment.id
      }
    }

    const existing = await tx
      .select()
      .from(studentFeeRecords)
      .where(
        and(
          eq(studentFeeRecords.studentId, data.studentId),
          eq(studentFeeRecords.parishId, parishId),
          eq(studentFeeRecords.academicYear, data.academicYear),
          eq(studentFeeRecords.feeType, data.feeType),
        ),
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
      await tx
        .update(studentFeeRecords)
        .set(row)
        .where(and(eq(studentFeeRecords.id, id), eq(studentFeeRecords.parishId, parishId)))
    } else {
      await tx.insert(studentFeeRecords).values({ ...row, createdAt: now })
    }

    await audit(tx, {
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
  })
}
