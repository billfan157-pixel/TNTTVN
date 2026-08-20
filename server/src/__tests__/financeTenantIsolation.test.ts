import { beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { academicYears, branches, classes, financialTransactions, funds, studentFeeRecords, students } from '../db/schema.js'
import { createTransaction, updateStudentFee } from '../services/financeService.js'

const PARISH_A = 'finance-tenant-a'
const PARISH_B = 'finance-tenant-b'

async function seedClass(parishId: string, suffix: string) {
  const now = new Date().toISOString()
  const branchId = `FIN-BR-${suffix}`
  const yearId = `FIN-AY-${suffix}`
  const classId = `FIN-CLS-${suffix}`
  await db.insert(branches).values({
    id: branchId, name: `Finance Branch ${suffix}`, scarfColor: '#111111', ageMin: 8, ageMax: 18,
    parishId, createdAt: now, updatedAt: now,
  }).onConflictDoNothing()
  await db.insert(academicYears).values({
    id: yearId, startDate: '2026-08-01', endDate: '2027-05-31', isLocked: 0,
    status: 'OPEN', currentSemester: 1, parishId, createdAt: now, updatedAt: now,
  }).onConflictDoNothing()
  await db.insert(classes).values({
    id: classId, code: `FIN-${suffix}`, name: `Finance Class ${suffix}`,
    branchId, academicYearId: yearId, parishId, createdAt: now, updatedAt: now,
  }).onConflictDoNothing()
  return classId
}

describe('finance tenant reference isolation', () => {
  let classA1: string
  let classA2: string
  let classB: string

  beforeAll(async () => {
    classA1 = await seedClass(PARISH_A, 'A1')
    classA2 = await seedClass(PARISH_A, 'A2')
    classB = await seedClass(PARISH_B, 'B1')
    const now = new Date().toISOString()

    await db.insert(funds).values([
      { id: 'FIN-FUND-A', parishId: PARISH_A, name: 'Fund A', code: 'FUND_A', initialBalance: 0, isDefault: true, isActive: true, createdAt: now, updatedAt: now },
      { id: 'FIN-FUND-B', parishId: PARISH_B, name: 'Fund B', code: 'FUND_B', initialBalance: 0, isDefault: true, isActive: true, createdAt: now, updatedAt: now },
    ]).onConflictDoNothing()

    await db.insert(students).values([
      {
        id: 'FIN-ST-A', code: 'FIN-ST-A', holyName: 'Phêrô', fullName: 'Student A', gender: 'Nam',
        dateOfBirth: '2014-01-01', parentName: 'Parent A', parentPhone: '0900000001', address: 'A',
        branch: 'ThieuNhi', classId: classA1, status: 'Đang học', parishId: PARISH_A, createdAt: now, updatedAt: now,
      },
      {
        id: 'FIN-ST-B', code: 'FIN-ST-B', holyName: 'Phaolô', fullName: 'Student B', gender: 'Nam',
        dateOfBirth: '2014-02-02', parentName: 'Parent B', parentPhone: '0900000002', address: 'B',
        branch: 'ThieuNhi', classId: classB, status: 'Đang học', parishId: PARISH_B, createdAt: now, updatedAt: now,
      },
    ]).onConflictDoNothing()
  })

  it('rejects a source fund owned by another parish before writing a transaction', async () => {
    await expect(createTransaction({
      fundId: 'FIN-FUND-B', type: 'INCOME', amount: 100000, category: 'Test', title: 'Cross tenant fund',
    }, 'FIN-USER-A', 'Admin A', PARISH_A, '127.0.0.1', 'vitest')).rejects.toMatchObject({ status: 400 })

    const rows = await db.select().from(financialTransactions).where(and(
      eq(financialTransactions.parishId, PARISH_A),
      eq(financialTransactions.title, 'Cross tenant fund'),
    ))
    expect(rows).toHaveLength(0)
  })

  it('rejects a transfer target fund owned by another parish', async () => {
    await expect(createTransaction({
      fundId: 'FIN-FUND-A', targetFundId: 'FIN-FUND-B', type: 'TRANSFER', amount: 50000,
      category: 'Transfer', title: 'Cross tenant target',
    }, 'FIN-USER-A', 'Admin A', PARISH_A, '127.0.0.1', 'vitest')).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a student/class mismatch inside the same parish', async () => {
    await expect(createTransaction({
      fundId: 'FIN-FUND-A', type: 'INCOME', amount: 50000, category: 'Fee', title: 'Wrong class',
      studentId: 'FIN-ST-A', classId: classA2,
    }, 'FIN-USER-A', 'Admin A', PARISH_A, '127.0.0.1', 'vitest')).rejects.toMatchObject({ status: 400 })
  })

  it('rejects fee updates that reference another parish and leaves fee/transaction tables unchanged', async () => {
    const beforeFees = await db.select().from(studentFeeRecords).where(eq(studentFeeRecords.parishId, PARISH_A))
    const beforeTx = await db.select().from(financialTransactions).where(eq(financialTransactions.parishId, PARISH_A))

    await expect(updateStudentFee(PARISH_A, {
      studentId: 'FIN-ST-B', classId: classB, academicYear: '2026-2027', feeType: 'NIEN_LIEM',
      title: 'Niên liễm', expectedAmount: 100000, paidAmount: 100000, status: 'PAID',
      createTransaction: true, fundId: 'FIN-FUND-A',
    }, 'FIN-USER-A', 'Admin A', '127.0.0.1', 'vitest')).rejects.toMatchObject({ status: 400 })

    const afterFees = await db.select().from(studentFeeRecords).where(eq(studentFeeRecords.parishId, PARISH_A))
    const afterTx = await db.select().from(financialTransactions).where(eq(financialTransactions.parishId, PARISH_A))
    expect(afterFees).toHaveLength(beforeFees.length)
    expect(afterTx).toHaveLength(beforeTx.length)
  })
})
