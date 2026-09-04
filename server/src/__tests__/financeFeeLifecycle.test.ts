import { beforeAll, describe, expect, it } from 'vitest'
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
} from '../db/schema.js'
import {
  updateStudentFee,
  updateStudentFeesBatch,
  type UpdateStudentFeeInput,
} from '../services/FinanceApplicationService.js'

const suffix = Date.now().toString(36)
const parishId = `fee-lifecycle-${suffix}`
const classId = `fee-class-${suffix}`
const fundId = `fee-fund-${suffix}`
const studentA = `fee-student-a-${suffix}`
const studentB = `fee-student-b-${suffix}`
const year = `2026-${suffix}`
const actor = `fee-admin-${suffix}`

function fee(studentId: string, feeType: 'NIEN_LIEM' | 'TRAI_HE' | 'DONG_PHUC' | 'GIAO_LY' | 'OTHER' = 'NIEN_LIEM') {
  return {
    studentId,
    classId,
    academicYear: year,
    feeType,
    title: 'Khoản phí kiểm thử',
    expectedAmount: 150_000,
    paidAmount: 150_000,
    status: 'PAID' as const,
    createTransaction: true,
    fundId,
  }
}

describe('FIN-LEDGER-1 fee payment lifecycle', () => {
  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({
      id: `fee-branch-${suffix}`, parishId, name: 'Fee Branch', scarfColor: '#123456',
      ageMin: 6, ageMax: 18, createdAt: now, updatedAt: now,
    })
    await db.insert(academicYears).values({
      id: year, parishId, startDate: '2026-08-01', endDate: '2027-05-31',
      status: 'OPEN', currentSemester: 1, createdAt: now, updatedAt: now,
    })
    await db.insert(classes).values({
      id: classId, parishId, code: `FEE-${suffix}`, name: 'Fee Class',
      branchId: `fee-branch-${suffix}`, academicYearId: year, createdAt: now, updatedAt: now,
    })
    await db.insert(funds).values({
      id: fundId, parishId, name: 'Fee Fund', code: `FEE_FUND_${suffix}`,
      initialBalance: 0, isDefault: true, isActive: true, createdAt: now, updatedAt: now,
    })
    for (const [id, code, name] of [[studentA, 'A', 'An'], [studentB, 'B', 'Bình']] as const) {
      await db.insert(students).values({
        id, parishId, code: `FEE-${code}-${suffix}`, holyName: 'Phêrô', fullName: name, gender: 'Nam',
        dateOfBirth: '2015-01-01', parentName: 'Phụ huynh', parentPhone: `09000000${code === 'A' ? '01' : '02'}`,
        address: 'Xứ đoàn', branch: 'ThieuNhi', classId, createdAt: now, updatedAt: now,
      })
    }
  })

  it('reuses one linked transaction across replay and reconciles amount changes', async () => {
    const first = await updateStudentFee(parishId, fee(studentA), actor, 'Admin', '127.0.0.1', 'vitest')
    const replay = await updateStudentFee(parishId, fee(studentA), actor, 'Admin', '127.0.0.1', 'vitest')
    expect(replay.transactionId).toBe(first.transactionId)

    const changed = await updateStudentFee(
      parishId,
      { ...fee(studentA), paidAmount: 175_000, expectedAmount: 175_000 },
      actor,
      'Admin',
      '127.0.0.1',
      'vitest',
    )
    expect(changed.transactionId).toBe(first.transactionId)

    const linked = await db.select().from(financialTransactions).where(and(
      eq(financialTransactions.parishId, parishId),
      eq(financialTransactions.studentId, studentA),
      eq(financialTransactions.academicYear, year),
    ))
    expect(linked).toHaveLength(1)
    expect(linked[0].amount).toBe(175_000)
  })

  it('removes the linked receipt when payment is cancelled or exempted', async () => {
    const paid = await updateStudentFee(parishId, fee(studentA, 'TRAI_HE'), actor, 'Admin', '127.0.0.1', 'vitest')
    const cancelled = await updateStudentFee(
      parishId,
      { ...fee(studentA, 'TRAI_HE'), paidAmount: 0, status: 'UNPAID', createTransaction: false },
      actor,
      'Admin',
      '127.0.0.1',
      'vitest',
    )
    expect(cancelled.transactionId).toBeNull()
    expect(await db.select().from(financialTransactions).where(and(
      eq(financialTransactions.parishId, parishId),
      eq(financialTransactions.id, paid.transactionId!),
    ))).toHaveLength(0)

    const repaid = await updateStudentFee(parishId, fee(studentA, 'TRAI_HE'), actor, 'Admin', '127.0.0.1', 'vitest')
    const exempted = await updateStudentFee(
      parishId,
      { ...fee(studentA, 'TRAI_HE'), paidAmount: 0, status: 'EXEMPTED', createTransaction: false },
      actor,
      'Admin',
      '127.0.0.1',
      'vitest',
    )
    expect(exempted.transactionId).toBeNull()
    expect(await db.select().from(financialTransactions).where(and(
      eq(financialTransactions.parishId, parishId),
      eq(financialTransactions.id, repaid.transactionId!),
    ))).toHaveLength(0)

    const reversals = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.action, 'TXN_FEE_REVERSED'),
    ))
    expect(reversals).toHaveLength(2)
  })

  it('collects a class atomically and replay does not duplicate receipts', async () => {
    const records = [fee(studentA, 'DONG_PHUC'), fee(studentB, 'DONG_PHUC')]
    const first = await updateStudentFeesBatch(parishId, records, actor, 'Admin', '127.0.0.1', 'vitest')
    const replay = await updateStudentFeesBatch(parishId, records, actor, 'Admin', '127.0.0.1', 'vitest')
    expect(replay.map(item => item.transactionId)).toEqual(first.map(item => item.transactionId))

    const transactions = await db.select().from(financialTransactions).where(and(
      eq(financialTransactions.parishId, parishId),
      eq(financialTransactions.academicYear, year),
      eq(financialTransactions.category, 'Đóng phí'),
    ))
    expect(transactions.filter(tx => tx.studentId === studentA || tx.studentId === studentB)).toHaveLength(2)
  })

  it('rolls back the entire class batch when one student is invalid', async () => {
    const beforeTransactions = await db.select().from(financialTransactions).where(and(
      eq(financialTransactions.parishId, parishId),
      eq(financialTransactions.studentId, studentA),
    ))
    await expect(updateStudentFeesBatch(
      parishId,
      [fee(studentA, 'GIAO_LY'), fee('UNKNOWN-STUDENT', 'GIAO_LY')],
      actor,
      'Admin',
      '127.0.0.1',
      'vitest',
    )).rejects.toMatchObject({ status: 400 })

    expect(await db.select().from(studentFeeRecords).where(and(
      eq(studentFeeRecords.parishId, parishId),
      eq(studentFeeRecords.academicYear, year),
      eq(studentFeeRecords.feeType, 'GIAO_LY'),
    ))).toHaveLength(0)
    const afterTransactions = await db.select().from(financialTransactions).where(and(
      eq(financialTransactions.parishId, parishId),
      eq(financialTransactions.studentId, studentA),
    ))
    expect(afterTransactions).toHaveLength(beforeTransactions.length)
  })

  it('rejects fee states whose status and paid amount would diverge from the ledger', async () => {
    await expect(updateStudentFee(
      parishId,
      { ...fee(studentA, 'OTHER'), status: 'PARTIAL' } as unknown as UpdateStudentFeeInput,
      actor,
      'Admin',
      '127.0.0.1',
      'vitest',
    )).rejects.toMatchObject({ status: 400 })

    await expect(updateStudentFee(
      parishId,
      { ...fee(studentA, 'OTHER'), status: 'UNPAID', createTransaction: false },
      actor,
      'Admin',
      '127.0.0.1',
      'vitest',
    )).rejects.toMatchObject({ status: 400 })
  })
})
