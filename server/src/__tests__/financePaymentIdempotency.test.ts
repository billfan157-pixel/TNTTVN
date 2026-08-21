import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  academicYears,
  auditLogs,
  branches,
  classes,
  financialTransactions,
  funds,
  studentFeeRecords,
  students,
  users,
} from '../db/schema.js'
import { updateStudentFee } from '../services/FinanceApplicationService.js'

const parishId = 'finance-idempotency-test'
const branchId = 'br-fin-idem'
const academicYearId = 'ay-fin-idem'
const classId = 'cl-fin-idem'
const studentId = 'st-fin-idem'
const userId = 'usr-fin-idem'
const fundId = 'fnd-fin-idem'

async function cleanup() {
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(studentFeeRecords).where(eq(studentFeeRecords.parishId, parishId))
  await db.delete(financialTransactions).where(eq(financialTransactions.parishId, parishId))
  await db.delete(funds).where(eq(funds.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
}

describe('Finance payment command idempotency', () => {
  beforeAll(async () => {
    await cleanup()
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: branchId, parishId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9 })
    await db.insert(academicYears).values({ id: academicYearId, parishId, startDate: '2026-09-01', endDate: '2027-05-31' })
    await db.insert(classes).values({ id: classId, parishId, code: 'FIN-IDEM', name: 'Finance Idempotency', branchId, academicYearId })
    await db.insert(students).values({
      id: studentId,
      parishId,
      code: 'FIN-IDEM-ST',
      holyName: 'Giuse',
      fullName: 'Finance Retry Student',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Parent',
      parentPhone: '0900000000',
      address: 'Test',
      branch: 'AuNhi',
      classId,
    })
    await db.insert(users).values({
      id: userId,
      parishId,
      username: 'finance_idempotency_admin',
      passwordHash: 'hash',
      fullName: 'Finance Admin',
      role: 'admin',
      status: 'ACTIVE',
      tokenVersion: 1,
      createdAt: now,
    })
    await db.insert(funds).values({
      id: fundId,
      parishId,
      name: 'Quỹ Test',
      code: 'FIN_IDEM',
      initialBalance: 0,
      isDefault: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('replaying an identical paid-fee command reuses the original ledger entry', async () => {
    const command = {
      studentId,
      classId,
      academicYear: '2026-2027',
      feeType: 'NIEN_LIEM' as const,
      title: 'Niên liễm 2026-2027',
      expectedAmount: 150000,
      paidAmount: 150000,
      status: 'PAID' as const,
      createTransaction: true,
      fundId,
    }

    const first = await updateStudentFee(parishId, command, userId, 'Finance Admin', '127.0.0.1', 'vitest')
    const second = await updateStudentFee(parishId, command, userId, 'Finance Admin', '127.0.0.1', 'vitest')

    expect(first.id).toBe(second.id)
    expect(first.transactionId).toBeTruthy()
    expect(second.transactionId).toBe(first.transactionId)

    const ledgerRows = await db
      .select({ id: financialTransactions.id, amount: financialTransactions.amount })
      .from(financialTransactions)
      .where(and(
        eq(financialTransactions.parishId, parishId),
        eq(financialTransactions.studentId, studentId),
        eq(financialTransactions.academicYear, '2026-2027'),
      ))

    expect(ledgerRows).toHaveLength(1)
    expect(ledgerRows[0].id).toBe(first.transactionId)
    expect(ledgerRows[0].amount).toBe(150000)
  })
})
