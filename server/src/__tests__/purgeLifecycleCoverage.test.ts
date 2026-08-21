import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  academicYears,
  assessmentEntries,
  auditLogs,
  branches,
  classes,
  financialTransactions,
  funds,
  leaveRequests,
  studentFeeRecords,
  students,
  systemSettings,
  users,
} from '../db/schema.js'
import { purgeParishData, PURGE_TABLES } from '../services/purgeService.js'

const parishId = 'purge-lifecycle-coverage'
const userId = 'usr-purge-lifecycle'
const branchId = 'br-purge-lifecycle'
const academicYearId = 'ay-purge-lifecycle'
const classId = 'cl-purge-lifecycle'
const studentId = 'st-purge-lifecycle'
const fundId = 'fnd-purge-lifecycle'

async function count(table: any): Promise<number> {
  const rows = await db.select().from(table).where(eq(table.parishId, parishId))
  return rows.length
}

describe('SYSTEM_PURGE data-lifecycle coverage', () => {
  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(users).values({ id: userId, parishId, username: 'purge_lifecycle_admin', passwordHash: 'hash', fullName: 'Purge Admin', role: 'admin' }).onConflictDoNothing()
    await db.insert(branches).values({ id: branchId, parishId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9 }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: academicYearId, parishId, startDate: '2026-09-01', endDate: '2027-05-31' }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, parishId, code: 'PURGE-LC', name: 'Purge Lifecycle', branchId, academicYearId }).onConflictDoNothing()
    await db.insert(students).values({
      id: studentId,
      parishId,
      code: 'PURGE-LC-ST',
      holyName: 'Giuse',
      fullName: 'Purge Lifecycle Student',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Parent',
      parentPhone: '0900000000',
      address: 'Test',
      branch: 'AuNhi',
      classId,
    }).onConflictDoNothing()

    // Regression: exam_session_id=NULL means this row is NOT removed by an exam
    // cascade. Old purge skipped assessment_entries and then failed deleting the
    // student because this FK uses ON DELETE RESTRICT.
    await db.insert(assessmentEntries).values({
      id: 'asm-purge-legacy-baseline',
      parishId,
      studentId,
      examSessionId: null,
      academicYear: '2026-2027',
      semester: 1,
      scoreType: 'oral',
      rawScore: 8,
      maxScore: 10,
      score: 8,
      source: 'legacy_baseline',
      createdBy: 'system',
      createdAt: now,
    })

    await db.insert(leaveRequests).values({
      id: 'leave-purge-lifecycle',
      parishId,
      studentId,
      classId,
      parentName: 'Parent',
      parentPhone: '0900000000',
      date: '2026-10-01',
      sessionTypes: JSON.stringify(['CatechismClass']),
      reason: 'Test',
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(funds).values({
      id: fundId,
      parishId,
      name: 'Purge Fund',
      code: 'PURGE_LC',
      initialBalance: 0,
      isDefault: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(financialTransactions).values({
      id: 'txn-purge-lifecycle',
      parishId,
      fundId,
      type: 'INCOME',
      amount: 100000,
      category: 'Niên liễm',
      title: 'Thu test',
      studentId,
      classId,
      academicYear: '2026-2027',
      transactionDate: '2026-10-01',
      receiptNumber: 'PT-2026-9999',
      recordedBy: userId,
      recordedByName: 'Purge Admin',
      createdAt: now,
    })
    await db.insert(studentFeeRecords).values({
      id: 'fee-purge-lifecycle',
      parishId,
      studentId,
      classId,
      academicYear: '2026-2027',
      feeType: 'NIEN_LIEM',
      title: 'Niên liễm',
      expectedAmount: 100000,
      paidAmount: 100000,
      status: 'PAID',
      paidDate: '2026-10-01',
      transactionId: 'txn-purge-lifecycle',
      createdAt: now,
      updatedAt: now,
    })
  })

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
    await db.delete(systemSettings).where(eq(systemSettings.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
    await db.delete(branches).where(eq(branches.parishId, parishId))
  })

  it('purges finance, leave and legacy assessment rows before their parents', async () => {
    const result = await purgeParishData({ parishId, userId })

    expect(result.countsBefore.assessment_entries).toBe(1)
    expect(result.countsBefore.leave_requests).toBe(1)
    expect(result.countsBefore.financial_transactions).toBe(1)
    expect(result.countsBefore.student_fee_records).toBe(1)
    expect(result.countsBefore.funds).toBe(1)

    expect(await count(assessmentEntries)).toBe(0)
    expect(await count(leaveRequests)).toBe(0)
    expect(await count(financialTransactions)).toBe(0)
    expect(await count(studentFeeRecords)).toBe(0)
    expect(await count(funds)).toBe(0)
    expect(await count(students)).toBe(0)
    expect(await count(classes)).toBe(0)
    expect(await count(academicYears)).toBe(0)

    expect(PURGE_TABLES).toContain('assessment_entries')
    expect(PURGE_TABLES).toContain('financial_transactions')
  })
})
