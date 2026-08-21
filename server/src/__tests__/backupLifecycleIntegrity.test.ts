import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import backupRouter from '../routes/backup.js'
import { client, db } from '../db/index.js'
import {
  academicYears,
  assessmentEntries,
  auditLogs,
  branches,
  classes,
  examFinalizationItems,
  examFinalizations,
  examResults,
  examSessions,
  financialTransactions,
  funds,
  leaveRequests,
  studentFeeRecords,
  students,
  users,
} from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'

const parishId = 'backup-lifecycle-integrity'
const userId = 'usr-backup-lifecycle'
const branchId = 'br-backup-lifecycle'
const academicYearId = 'ay-backup-lifecycle'
const classId = 'cl-backup-lifecycle'
const studentId = 'st-backup-lifecycle'
const examSessionId = 'exs-backup-lifecycle'
const examResultId = 'exr-backup-lifecycle'
const finalizationId = 'exf-backup-lifecycle'
const fundId = 'fnd-backup-lifecycle'
const password = 'BackupLifecycle@123'

const { accessToken } = generateTokens({
  userId,
  username: 'backup_lifecycle_admin',
  role: 'admin',
  parishId,
  tokenVersion: 1,
})

async function cleanup() {
  await db.delete(examFinalizationItems).where(eq(examFinalizationItems.parishId, parishId))
  await db.delete(assessmentEntries).where(eq(assessmentEntries.parishId, parishId))
  await db.delete(examFinalizations).where(eq(examFinalizations.parishId, parishId))
  await db.delete(studentFeeRecords).where(eq(studentFeeRecords.parishId, parishId))
  await db.delete(leaveRequests).where(eq(leaveRequests.parishId, parishId))
  await db.delete(financialTransactions).where(eq(financialTransactions.parishId, parishId))
  await db.delete(funds).where(eq(funds.parishId, parishId))
  await db.delete(examResults).where(eq(examResults.parishId, parishId))
  await db.delete(examSessions).where(eq(examSessions.parishId, parishId))
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
}

async function exportSnapshot() {
  const res = await backupRouter.request('/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ adminPassword: password }),
  })
  expect(res.status).toBe(200)
  return await res.json() as any
}

async function restoreSnapshot(snapshot: any) {
  return backupRouter.request('/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ ...snapshot, adminPassword: password }),
  })
}

describe('Backup v3 lifecycle integrity', () => {
  beforeAll(async () => {
    await cleanup()
    const now = new Date().toISOString()
    await db.insert(users).values({
      id: userId,
      parishId,
      username: 'backup_lifecycle_admin',
      passwordHash: await bcrypt.hash(password, 4),
      fullName: 'Backup Lifecycle Admin',
      role: 'admin',
      status: 'ACTIVE',
      tokenVersion: 1,
    })
    await db.insert(branches).values({ id: branchId, parishId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9 })
    await db.insert(academicYears).values({ id: academicYearId, parishId, startDate: '2026-09-01', endDate: '2027-05-31' })
    await db.insert(classes).values({ id: classId, parishId, code: 'BK-LC', name: 'Backup Lifecycle', branchId, academicYearId })
    await db.insert(students).values({
      id: studentId,
      parishId,
      code: 'BK-LC-ST',
      holyName: 'Giuse',
      fullName: 'Backup Lifecycle Student',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Parent',
      parentPhone: '0900000000',
      address: 'Test',
      branch: 'AuNhi',
      classId,
    })
    await db.insert(examSessions).values({
      id: examSessionId,
      parishId,
      classId,
      subject: 'Giáo lý',
      scoreType: 'oral',
      semester: 1,
      academicYear: '2026-2027',
      status: 'completed',
      createdBy: userId,
      completedBy: userId,
      completedAt: now,
      examType: 'written',
      idempotencyKey: 'backup-lifecycle-exam',
      createdAt: now,
    })
    await db.insert(examResults).values({
      id: examResultId,
      parishId,
      examSessionId,
      studentId,
      score: 8,
      source: 'quick_entry',
      examVersion: 'A',
      createdAt: now,
    })
    await db.insert(assessmentEntries).values({
      id: 'asm-backup-lifecycle',
      parishId,
      studentId,
      examSessionId,
      academicYear: '2026-2027',
      semester: 1,
      scoreType: 'oral',
      rawScore: 8,
      maxScore: 10,
      score: 8,
      source: 'exam_finalization',
      createdBy: userId,
      createdAt: now,
    })
    await db.insert(examFinalizations).values({ id: finalizationId, parishId, examSessionId, completedBy: userId, completedAt: now, createdAt: now })
    await db.insert(examFinalizationItems).values({
      id: 'efi-backup-lifecycle',
      parishId,
      finalizationId,
      examResultId,
      studentId,
      gradeId: null,
      scoreField: 'scoreOral',
      status: 'committed',
      rawScore: 8,
      finalScore: 8,
      createdAt: now,
    })
    await db.insert(leaveRequests).values({
      id: 'leave-backup-lifecycle',
      parishId,
      studentId,
      classId,
      parentName: 'Parent',
      parentPhone: '0900000000',
      date: '2026-10-02',
      sessionTypes: JSON.stringify(['CatechismClass']),
      reason: 'Test',
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(funds).values({ id: fundId, parishId, name: 'Backup Fund', code: 'BK_LC', initialBalance: 0, isDefault: true, isActive: true, createdAt: now, updatedAt: now })
    await db.insert(financialTransactions).values({
      id: 'txn-backup-lifecycle',
      parishId,
      fundId,
      type: 'INCOME',
      amount: 100000,
      category: 'Niên liễm',
      title: 'Thu test',
      studentId,
      classId,
      academicYear: '2026-2027',
      transactionDate: '2026-10-02',
      receiptNumber: 'PT-2026-9001',
      recordedBy: userId,
      recordedByName: 'Backup Lifecycle Admin',
      createdAt: now,
    })
    await db.insert(studentFeeRecords).values({
      id: 'fee-backup-lifecycle',
      parishId,
      studentId,
      classId,
      academicYear: '2026-2027',
      feeType: 'NIEN_LIEM',
      title: 'Niên liễm',
      expectedAmount: 100000,
      paidAmount: 100000,
      status: 'PAID',
      paidDate: '2026-10-02',
      transactionId: 'txn-backup-lifecycle',
      createdAt: now,
      updatedAt: now,
    })
  })

  afterAll(async () => {
    try { await client.execute('DROP TRIGGER IF EXISTS test_block_restore_success_audit') } catch {}
    await cleanup()
  })

  it('exports and restores dependent exam, leave and finance state without cascade loss', async () => {
    const snapshot = await exportSnapshot()
    expect(snapshot.version).toBe('3.0-operational')
    expect(snapshot.data.assessmentEntries).toHaveLength(1)
    expect(snapshot.data.examFinalizations).toHaveLength(1)
    expect(snapshot.data.examFinalizationItems).toHaveLength(1)
    expect(snapshot.data.leaveRequests).toHaveLength(1)
    expect(snapshot.data.financialTransactions).toHaveLength(1)
    expect(snapshot.data.studentFeeRecords).toHaveLength(1)

    const restoreRes = await restoreSnapshot(snapshot)
    expect(restoreRes.status).toBe(200)

    expect(await db.select().from(assessmentEntries).where(eq(assessmentEntries.parishId, parishId))).toHaveLength(1)
    expect(await db.select().from(examFinalizations).where(eq(examFinalizations.parishId, parishId))).toHaveLength(1)
    expect(await db.select().from(examFinalizationItems).where(eq(examFinalizationItems.parishId, parishId))).toHaveLength(1)
    expect(await db.select().from(leaveRequests).where(eq(leaveRequests.parishId, parishId))).toHaveLength(1)
    expect(await db.select().from(financialTransactions).where(eq(financialTransactions.parishId, parishId))).toHaveLength(1)
    expect(await db.select().from(studentFeeRecords).where(eq(studentFeeRecords.parishId, parishId))).toHaveLength(1)
  })

  it('rolls back the destructive restore when the RESTORE_BACKUP success audit cannot be written', async () => {
    const snapshot = await exportSnapshot()
    await db.update(students)
      .set({ fullName: 'Mutated After Snapshot' })
      .where(and(eq(students.parishId, parishId), eq(students.id, studentId)))

    await client.execute(`
      CREATE TRIGGER test_block_restore_success_audit
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'RESTORE_BACKUP' AND NEW.parish_id = '${parishId}'
      BEGIN
        SELECT RAISE(ABORT, 'test blocks restore success audit');
      END
    `)

    try {
      const restoreRes = await restoreSnapshot(snapshot)
      expect(restoreRes.status).toBe(500)
    } finally {
      await client.execute('DROP TRIGGER IF EXISTS test_block_restore_success_audit')
    }

    const [student] = await db.select({ fullName: students.fullName }).from(students)
      .where(and(eq(students.parishId, parishId), eq(students.id, studentId)))
      .limit(1)
    expect(student?.fullName).toBe('Mutated After Snapshot')
  })
})
