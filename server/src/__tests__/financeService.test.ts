import { describe, it, expect, beforeAll } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { financesRouter } from '../routes/finances.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, classes, students, branches, academicYears, financialTransactions, studentFeeRecords, auditLogs } from '../db/schema.js'
import {
  listFunds,
  getFinanceSummary,
  listClassFeeRecords,
} from '../services/financeService.js'
import {
  createFund,
  createTransaction,
  updateStudentFee,
} from '../services/FinanceApplicationService.js'

const PREFIX = Date.now()
const parishId = `parish-fin-${PREFIX}`
const otherParishId = `parish-fin-other-${PREFIX}`
const adminId = `usr-fin-admin-${PREFIX}`
const teacherId = `usr-fin-teacher-${PREFIX}`
const classId = `cls-fin-${PREFIX}`
const studentId = `st-fin-${PREFIX}`

const jsonHeaders = { 'Content-Type': 'application/json' }

function adminHeaders() {
  const { accessToken } = generateTokens({
    userId: adminId,
    username: 'fin_admin',
    role: 'admin',
    parishId,
    tokenVersion: 1,
  })
  return { ...jsonHeaders, Authorization: `Bearer ${accessToken}` }
}

function teacherHeaders() {
  const { accessToken } = generateTokens({
    userId: teacherId,
    username: 'fin_teacher',
    role: 'chunhiem',
    parishId,
    tokenVersion: 1,
  })
  return { ...jsonHeaders, Authorization: `Bearer ${accessToken}` }
}

describe('Parish Financial & Fund Management Tests (ADR-039)', () => {
  beforeAll(async () => {
    const now = new Date().toISOString()

    // Create test admin user
    await db.insert(users).values({
      id: adminId,
      username: `fin_admin_${PREFIX}`,
      passwordHash: 'hash',
      fullName: 'Finance Admin',
      role: 'admin',
      parishId,
      status: 'ACTIVE',
      tokenVersion: 1,
      createdAt: now,
    })

    // Create test teacher user
    await db.insert(users).values({
      id: teacherId,
      username: `fin_teacher_${PREFIX}`,
      passwordHash: 'hash',
      fullName: 'Finance Teacher',
      role: 'chunhiem',
      parishId,
      status: 'ACTIVE',
      tokenVersion: 1,
      createdAt: now,
    })

    // Create branch & academic year for foreign keys
    await db.insert(branches).values({
      id: 'KT',
      parishId,
      name: 'Khai Tâm',
      scarfColor: 'Hồng',
      ageMin: 6,
      ageMax: 7,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(academicYears).values({
      id: '2025-2026',
      parishId,
      startDate: '2025-09-01',
      endDate: '2026-05-31',
      status: 'OPEN',
      currentSemester: 1,
      createdAt: now,
      updatedAt: now,
    })

    // Create test class
    await db.insert(classes).values({
      id: classId,
      parishId,
      code: `KT1-${PREFIX}`,
      name: 'Lớp Khai Tâm 1',
      branchId: 'KT',
      academicYearId: '2025-2026',
      createdAt: now,
      updatedAt: now,
    })

    // Create test student
    await db.insert(students).values({
      id: studentId,
      parishId,
      code: `ST-${PREFIX}`,
      fullName: 'Nguyễn Văn An',
      holyName: 'Phêrô',
      gender: 'Nam',
      dateOfBirth: '2018-01-01',
      parentName: 'Nguyễn Văn Bố',
      parentPhone: '0901234567',
      address: '123 Đường Xứ Đoàn',
      branch: 'AuNhi',
      classId,
      createdAt: now,
      updatedAt: now,
    })
  })

  it('automatically ensures 4 default funds on first query', async () => {
    const fundsList = await listFunds(parishId)
    expect(fundsList.length).toBeGreaterThanOrEqual(4)

    const codes = fundsList.map((f) => f.code)
    expect(codes).toContain('GENERAL')
    expect(codes).toContain('CHARITY')
    expect(codes).toContain('CAMP')
    expect(codes).toContain('LEADERS')

    const general = fundsList.find((f) => f.code === 'GENERAL')
    expect(general?.isDefault).toBe(true)
    expect(general?.currentBalance).toBe(0)
  })

  it('can create a custom fund account', async () => {
    const newFund = await createFund(
      {
        name: 'Quỹ Xây Dựng Hang Đá',
        code: 'HANG_DA',
        description: 'Tài trợ Giáng Sinh',
        initialBalance: 500000,
      },
      adminId,
      parishId,
      '127.0.0.1',
      'TestAgent'
    )

    expect(newFund.id).toBeDefined()
    expect(newFund.name).toBe('Quỹ Xây Dựng Hang Đá')
    expect(newFund.currentBalance).toBe(500000)

    const all = await listFunds(parishId)
    const found = all.find((f) => f.id === newFund.id)
    expect(found).toBeDefined()
    expect(found?.currentBalance).toBe(500000)
  })

  it('records income and expense transactions and computes accurate balances', async () => {
    const fundsList = await listFunds(parishId)
    const generalFund = fundsList.find((f) => f.code === 'GENERAL')!

    // Record Income 1,000,000 VND
    const incTx = await createTransaction(
      {
        fundId: generalFund.id,
        type: 'INCOME',
        amount: 1000000,
        category: 'Ủng hộ',
        title: 'Ân nhân tài trợ liên hoan',
        personName: 'Ông Giuse Trần Văn B',
        academicYear: '2025-2026',
        transactionDate: '2026-08-15',
      },
      adminId,
      'Admin',
      parishId,
      '127.0.0.1',
      'TestAgent'
    )

    expect(incTx.id).toBeDefined()
    expect(incTx.amount).toBe(1000000)
    expect(incTx.receiptNumber).toMatch(/^PT-/)

    // Record Expense 300,000 VND
    const expTx = await createTransaction(
      {
        fundId: generalFund.id,
        type: 'EXPENSE',
        amount: 300000,
        category: 'Phần thưởng',
        title: 'Mua quà đố vui Thánh Kinh',
        personName: 'Chị Maria Mai',
        academicYear: '2025-2026',
        transactionDate: '2026-08-15',
      },
      adminId,
      'Admin',
      parishId,
      '127.0.0.1',
      'TestAgent'
    )

    expect(expTx.id).toBeDefined()
    expect(expTx.amount).toBe(300000)
    expect(expTx.receiptNumber).toMatch(/^PC-/)

    // Check balances
    const updatedFunds = await listFunds(parishId)
    const updatedGeneral = updatedFunds.find((f) => f.id === generalFund.id)!
    expect(updatedGeneral.totalIncome).toBe(1000000)
    expect(updatedGeneral.totalExpense).toBe(300000)
    expect(updatedGeneral.currentBalance).toBe(700000)
  })

  it('supports fund transfer transaction', async () => {
    const fundsList = await listFunds(parishId)
    const generalFund = fundsList.find((f) => f.code === 'GENERAL')!
    const charityFund = fundsList.find((f) => f.code === 'CHARITY')!

    const transferTx = await createTransaction(
      {
        fundId: generalFund.id,
        type: 'TRANSFER',
        targetFundId: charityFund.id,
        amount: 200000,
        category: 'Trích quỹ',
        title: 'Trích quỹ chung sang quỹ Bác Ái',
        academicYear: '2025-2026',
        transactionDate: '2026-08-15',
      },
      adminId,
      'Admin',
      parishId,
      '127.0.0.1',
      'TestAgent'
    )

    expect(transferTx.type).toBe('TRANSFER')

    const updatedFunds = await listFunds(parishId)
    const updatedGeneral = updatedFunds.find((f) => f.id === generalFund.id)!
    const updatedCharity = updatedFunds.find((f) => f.id === charityFund.id)!

    // General had 700k -> minus 200k = 500k
    expect(updatedGeneral.currentBalance).toBe(500000)
    // Charity had 0 -> plus 200k = 200k
    expect(updatedCharity.currentBalance).toBe(200000)
  })

  it('manages class fee records and updates student payment', async () => {
    const feeRecords = await listClassFeeRecords(parishId, classId, '2025-2026', 'NIEN_LIEM')
    expect(feeRecords.length).toBe(1)
    expect(feeRecords[0].studentId).toBe(studentId)
    expect(feeRecords[0].status).toBe('UNPAID')

    // Mark as PAID with auto transaction creation
    const updatedFee = await updateStudentFee(
      parishId,
      {
        studentId,
        classId,
        academicYear: '2025-2026',
        feeType: 'NIEN_LIEM',
        title: 'Niên liễm 2025-2026',
        expectedAmount: 150000,
        paidAmount: 150000,
        status: 'PAID',
        createTransaction: true,
      },
      adminId,
      'Admin',
      '127.0.0.1',
      'TestAgent'
    )

    expect(updatedFee.status).toBe('PAID')
    expect(updatedFee.paidAmount).toBe(150000)
    expect(updatedFee.transactionId).toBeDefined()

    // Verify summary statistics
    const summary = await getFinanceSummary(parishId, '2025-2026')
    expect(summary.feeStats.paidCount).toBe(1)
    expect(summary.feeStats.totalCollected).toBe(150000)
    expect(summary.feeStats.collectionRate).toBe(100)
  })

  it('rolls back payment ledger and audit when the fee write fails', async () => {
    const fundsList = await listFunds(parishId)
    const generalFund = fundsList.find((f) => f.code === 'GENERAL')!
    const rollbackAcademicYear = `ROLLBACK-${PREFIX}`

    await expect(updateStudentFee(
      parishId,
      {
        studentId,
        classId,
        academicYear: rollbackAcademicYear,
        feeType: 'OTHER',
        // Runtime-invalid value intentionally bypasses the TypeScript contract.
        // The ledger insert happens first; fee.title NOT NULL then forces the later write to fail.
        title: null as unknown as string,
        expectedAmount: 123000,
        paidAmount: 123000,
        status: 'PAID',
        createTransaction: true,
        fundId: generalFund.id,
      },
      adminId,
      'Admin',
      '127.0.0.1',
      'TestAgent'
    )).rejects.toThrow()

    const orphanTransactions = await db
      .select()
      .from(financialTransactions)
      .where(and(
        eq(financialTransactions.parishId, parishId),
        eq(financialTransactions.studentId, studentId),
        eq(financialTransactions.academicYear, rollbackAcademicYear),
      ))
    expect(orphanTransactions).toHaveLength(0)

    const partialFeeRows = await db
      .select()
      .from(studentFeeRecords)
      .where(and(
        eq(studentFeeRecords.parishId, parishId),
        eq(studentFeeRecords.studentId, studentId),
        eq(studentFeeRecords.academicYear, rollbackAcademicYear),
      ))
    expect(partialFeeRows).toHaveLength(0)

    const leakedAuditRows = await db
      .select()
      .from(auditLogs)
      .where(and(
        eq(auditLogs.parishId, parishId),
        sql`${auditLogs.newValue} LIKE ${`%${rollbackAcademicYear}%`}`,
      ))
    expect(leakedAuditRows).toHaveLength(0)
  })

  it('FIN-1: receiptNumber do client cung cấp phải duy nhất trong giáo xứ', async () => {
    const fundsList = await listFunds(parishId)
    const generalFund = fundsList.find((f) => f.code === 'GENERAL')!

    const first = await createTransaction(
      {
        fundId: generalFund.id,
        type: 'INCOME',
        amount: 500000,
        category: 'Ủng hộ',
        title: 'Phiếu thủ công FIN-1',
        receiptNumber: 'PT-FIN1-MANUAL',
        academicYear: '2025-2026',
      },
      adminId,
      'Admin',
      parishId,
      '127.0.0.1',
      'TestAgent',
    )
    expect(first.receiptNumber).toBe('PT-FIN1-MANUAL')

    // Trùng số phiếu → từ chối, không ghi ledger
    await expect(
      createTransaction(
        {
          fundId: generalFund.id,
          type: 'INCOME',
          amount: 999,
          category: 'Ủng hộ',
          title: 'Phiếu trùng số',
          receiptNumber: 'PT-FIN1-MANUAL',
          academicYear: '2025-2026',
        },
        adminId,
        'Admin',
        parishId,
        '127.0.0.1',
        'TestAgent',
      ),
    ).rejects.toThrow(/đã tồn tại/)

    const dupCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(financialTransactions)
      .where(and(eq(financialTransactions.parishId, parishId), eq(financialTransactions.receiptNumber, 'PT-FIN1-MANUAL')))
    expect(Number(dupCount[0].count)).toBe(1)
  })

  it('enforces RBAC: non-admin roles receive 403 Forbidden on finance routes', async () => {
    // Admin request should succeed (200)
    const adminRes = await financesRouter.request('/summary', {
      method: 'GET',
      headers: adminHeaders(),
    })
    expect(adminRes.status).toBe(200)

    // Teacher (GLV) request should be rejected (403)
    const teacherRes = await financesRouter.request('/summary', {
      method: 'GET',
      headers: teacherHeaders(),
    })
    expect(teacherRes.status).toBe(403)

    const teacherPostRes = await financesRouter.request('/transactions', {
      method: 'POST',
      headers: teacherHeaders(),
      body: JSON.stringify({
        fundId: 'fnd-1',
        type: 'INCOME',
        amount: 10000,
        category: 'Test',
        title: 'Test',
      }),
    })
    expect(teacherPostRes.status).toBe(403)
  })

  it('maps tenant-scoped finance validation failures to a safe 400 response', async () => {
    const invalidFee = {
      studentId: `unknown-student-${PREFIX}`,
      classId,
      academicYear: '2025-2026',
      feeType: 'NIEN_LIEM',
      title: 'Niên liễm 2025-2026',
      expectedAmount: 150000,
      paidAmount: 150000,
      status: 'PAID',
      createTransaction: true,
    }

    const singleRes = await financesRouter.request(`/classes/${classId}/fees`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(invalidFee),
    })
    expect(singleRes.status).toBe(400)
    await expect(singleRes.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST' },
    })

    const batchRes = await financesRouter.request(`/classes/${classId}/fees/batch`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ records: [invalidFee] }),
    })
    expect(batchRes.status).toBe(400)
    await expect(batchRes.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST' },
    })
  })

  it('maintains strict multi-tenant parish isolation', async () => {
    const summaryOther = await getFinanceSummary(otherParishId, '2025-2026')
    expect(summaryOther.totalIncome).toBe(0)
    expect(summaryOther.totalExpense).toBe(0)
  })
})
