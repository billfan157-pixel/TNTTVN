import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db, client } from '../db/index.js'
import { academicYears, academicYearSnapshots, branches, classes, students, users, auditLogs, assessmentEntries, systemSettings, studentFeeRecords, outboxMessages, attendanceSessions, catechistAssignments, notifications, funds, financialTransactions, gradeImportHashes, mappingMemory, questionBankItems, questionBankVersions, examSessions, examQuestionSnapshots } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import backupRouter from '../routes/backup.js'
import { writeSafetySnapshot } from '../services/safetySnapshot.js'
import { DEFAULT_PURGE_VERSION, PURGE_VERSION_KEY } from '../services/purgeService.js'

vi.mock('../services/safetySnapshot.js', async importOriginal => ({ ...await importOriginal<typeof import('../services/safetySnapshot.js')>(), writeSafetySnapshot: vi.fn().mockResolvedValue('synthetic-safety'), pruneSafetySnapshots: vi.fn().mockResolvedValue(undefined) }))
let sequence = 0
async function fixture() {
  const parishId = `restore-lifecycle-${Date.now()}-${++sequence}`
  const password = 'Synthetic-Audit-Only-123'
  await db.insert(users).values({ id: 'admin', parishId, username: 'restore-admin', fullName: 'Synthetic', role: 'admin', status: 'ACTIVE', tokenVersion: 1, passwordHash: await bcrypt.hash(password, 4) })
  await db.insert(branches).values({ id: 'AuNhi', parishId, name: 'Ấu', scarfColor: 'green', ageMin: 7, ageMax: 10 })
  await db.insert(academicYears).values({ id: '2025-2026', parishId, startDate: '2025-08-01', endDate: '2026-07-31' })
  await db.insert(classes).values({ id: 'class', parishId, code: 'AU1', name: 'Ấu 1', branchId: 'AuNhi', academicYearId: '2025-2026' })
  await db.insert(students).values({ id: 'student', parishId, code: 'S1', holyName: 'Synthetic', fullName: 'Synthetic', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Synthetic', parentPhone: '0901234567', address: 'Synthetic', branch: 'AuNhi', classId: 'class' })
  const { accessToken } = generateTokens({ userId: 'admin', parishId, role: 'admin', username: 'restore-admin', tokenVersion: 1 })
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  const exportBackup = () => backupRouter.request('/export', { method: 'POST', headers, body: JSON.stringify({ adminPassword: password }) })
  const exported = await exportBackup()
  expect(exported.status).toBe(200)
  const payload = await exported.json() as Record<string, unknown>
  return {
    parishId,
    exportBackup,
    restore: (restorePayload: Record<string, unknown> = payload) => backupRouter.request('/restore', {
      method: 'POST', headers, body: JSON.stringify({ ...restorePayload, adminPassword: password }),
    }),
  }
}

describe('XD-09 partial JSON restore lifecycle preflight', () => {
  // Each synthetic scenario is a separate client. Hono test requests have
  // no socket address; isolate only their shared test bucket, not middleware.
  beforeEach(async () => {
    await client.execute({ sql: 'DELETE FROM rate_limits WHERE key = ?', args: ['admin-reauth:unknown'] })
    vi.mocked(writeSafetySnapshot).mockClear()
  })
  it.each(['update', 'insert', 'delete'] as const)('aborts before replacing data when a %s commits during safety publication', async change => {
    const f = await fixture()
    let committed: unknown
    vi.mocked(writeSafetySnapshot).mockImplementationOnce(async () => {
      if (change === 'update') await db.update(students).set({ fullName: 'Concurrent edit' }).where(eq(students.parishId, f.parishId))
      if (change === 'insert') {
        const [student] = await db.select().from(students).where(eq(students.parishId, f.parishId))
        await db.insert(students).values({ ...student, id: 'new', code: 'NEW' })
      }
      if (change === 'delete') await db.delete(students).where(eq(students.parishId, f.parishId))
      committed = await db.select().from(students).where(eq(students.parishId, f.parishId))
      return 'synthetic-safety'
    })
    const response = await f.restore()
    expect(response.status).toBe(409)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('SAFETY_SNAPSHOT_STALE')
    expect(await db.select().from(students).where(eq(students.parishId, f.parishId))).toEqual(committed)
    expect(await db.select().from(systemSettings).where(and(eq(systemSettings.parishId, f.parishId), eq(systemSettings.key, PURGE_VERSION_KEY)))).toHaveLength(0)
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, f.parishId), eq(auditLogs.action, 'RESTORE_BACKUP')))).toHaveLength(0)
    // A new explicit attempt captures the changed state and may proceed.
    expect((await f.restore()).status).toBe(200)
  })
  it.each(['FINALIZED', 'PROMOTED', 'ARCHIVED', 'snapshot-only'] as const)('rejects protected state before safety-write or destructive operations (%s)', async mode => {
    const f = await fixture()
    if (mode !== 'snapshot-only') await db.update(academicYears).set({ status: mode }).where(eq(academicYears.parishId, f.parishId))
    await db.insert(academicYearSnapshots).values({ id: 'snapshot', parishId: f.parishId, studentId: 'student', academicYearId: '2025-2026', yearGpa: 7, generatedBy: 'admin' })
    vi.mocked(writeSafetySnapshot).mockClear()
    const response = await f.restore()
    expect(response.status).toBe(409)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('RESTORE_PROTECTED_ACADEMIC_STATE')
    expect(writeSafetySnapshot).not.toHaveBeenCalled()
    expect(await db.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, f.parishId))).toHaveLength(1)
    expect(await db.select().from(students).where(eq(students.parishId, f.parishId))).toHaveLength(1)
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, f.parishId), eq(auditLogs.action, 'RESTORE_BACKUP')))).toHaveLength(0)
  })

  it('rechecks inside the restore transaction if finalize commits during safety-write', async () => {
    const f = await fixture()
    vi.mocked(writeSafetySnapshot).mockImplementationOnce(async () => {
      await db.update(academicYears).set({ status: 'FINALIZED' }).where(eq(academicYears.parishId, f.parishId))
      await db.insert(academicYearSnapshots).values({ id: 'snapshot', parishId: f.parishId, studentId: 'student', academicYearId: '2025-2026', yearGpa: 7, generatedBy: 'admin' })
      return 'synthetic-safety'
    })
    expect((await f.restore()).status).toBe(409)
    expect(await db.select().from(academicYearSnapshots).where(eq(academicYearSnapshots.parishId, f.parishId))).toHaveLength(1)
    expect(await db.select().from(students).where(eq(students.parishId, f.parishId))).toHaveLength(1)
  })

  it('a non-exported manual ledger blocks partial restore without losing student or ledger rows', async () => {
    const f = await fixture()
    await db.insert(assessmentEntries).values({ id: 'manual', parishId: f.parishId, studentId: 'student',
      academicYear: '2025-2026', semester: 1, scoreType: 'oral', rawScore: 8, maxScore: 10, score: 8,
      source: 'manual_entry', createdBy: 'admin' })
    const before = await db.select().from(students).where(eq(students.parishId, f.parishId))
    const response = await f.restore()
    expect(response.status).toBe(409)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('RESTORE_UNSUPPORTED_DEPENDENCIES')
    expect(writeSafetySnapshot).not.toHaveBeenCalled()
    expect(await db.select().from(students).where(eq(students.parishId, f.parishId))).toEqual(before)
    expect(await db.select().from(assessmentEntries).where(eq(assessmentEntries.parishId, f.parishId))).toHaveLength(1)
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, f.parishId), eq(auditLogs.action, 'RESTORE_BACKUP')))).toHaveLength(0)
    expect(await db.select().from(systemSettings).where(and(eq(systemSettings.parishId, f.parishId), eq(systemSettings.key, PURGE_VERSION_KEY)))).toHaveLength(0)
  })

  it('blocks non-exported finance facts before replacing their student/class parents', async () => {
    const f = await fixture()
    await db.insert(studentFeeRecords).values({
      id: 'fee', parishId: f.parishId, studentId: 'student', classId: 'class', academicYear: '2025-2026',
      feeType: 'NIEN_LIEM', title: 'Synthetic fee', expectedAmount: 100, paidAmount: 100, status: 'PAID',
    })

    const response = await f.restore()
    expect(response.status).toBe(409)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('RESTORE_UNSUPPORTED_DEPENDENCIES')
    expect(writeSafetySnapshot).not.toHaveBeenCalled()
    expect(await db.select().from(studentFeeRecords).where(eq(studentFeeRecords.parishId, f.parishId))).toHaveLength(1)
    expect(await db.select().from(students).where(eq(students.parishId, f.parishId))).toHaveLength(1)
  })

  it('individually blocks excluded class, notification and manual-ledger dependencies', async () => {
    for (const kind of ['attendance-session', 'staff-assignment', 'notification', 'financial-transaction', 'grade-import-receipt', 'mapping-memory'] as const) {
      await client.execute({ sql: 'DELETE FROM rate_limits WHERE key = ?', args: ['admin-reauth:unknown'] })
      const f = await fixture()
      if (kind === 'attendance-session') {
        await db.insert(attendanceSessions).values({
          id: 'attendance-session', parishId: f.parishId, classId: 'class', date: '2025-09-07', type: 'SundayMass',
        })
      } else if (kind === 'staff-assignment') {
        await db.insert(catechistAssignments).values({
          id: 'assignment', parishId: f.parishId, userId: 'admin', classId: 'class', roleInClass: 'chunhiem',
        })
      } else if (kind === 'notification') {
        await db.insert(notifications).values({
          id: 'notification', parishId: f.parishId, studentId: 'student', type: 'web_push',
          channel: 'report_card', status: 'retrying', recipient: 'Synthetic', triggeredByType: 'system',
        })
      } else if (kind === 'financial-transaction') {
        await db.insert(funds).values({ id: 'fund', parishId: f.parishId, name: 'Synthetic', code: 'SYNTHETIC' })
        await db.insert(financialTransactions).values({
          id: 'transaction', parishId: f.parishId, fundId: 'fund', type: 'INCOME', amount: 100,
          category: 'Synthetic', title: 'Synthetic', studentId: 'student', classId: 'class',
          academicYear: '2025-2026', transactionDate: '2025-09-07', recordedBy: 'admin', recordedByName: 'Synthetic',
        })
      } else if (kind === 'grade-import-receipt') {
        await db.insert(gradeImportHashes).values({
          id: 'grade-import', parishId: f.parishId, hash: 'synthetic-hash', classId: 'class',
          semester: 1, academicYear: '2025-2026', totalRows: 1, userId: 'admin',
        })
      } else {
        await db.insert(mappingMemory).values({
          id: 'mapping', parishId: f.parishId, scope: 'student', alias: 'synthetic alias',
          entityId: 'student', entityName: 'Synthetic', createdBy: 'admin',
        })
      }

      const response = await f.restore()
      expect(response.status, kind).toBe(409)
      expect((await response.json() as { error: { code: string } }).error.code, kind)
        .toBe('RESTORE_UNSUPPORTED_DEPENDENCIES')
      expect(await db.select().from(students).where(eq(students.parishId, f.parishId)), kind).toHaveLength(1)
    }
    expect(writeSafetySnapshot).not.toHaveBeenCalled()
  })

  it('blocks undispatched outbox intent but ignores it in another parish', async () => {
    const other = await fixture()
    await db.insert(outboxMessages).values({ id: 'pending', parishId: other.parishId, aggregateId: 'student', eventType: 'Synthetic', payload: '{}', status: 'pending' })
    const f = await fixture()
    await db.insert(outboxMessages).values({ id: 'pending', parishId: f.parishId, aggregateId: 'student', eventType: 'Synthetic', payload: '{}', status: 'pending' })

    const blocked = await f.restore()
    expect(blocked.status).toBe(409)
    expect((await blocked.json() as { error: { code: string } }).error.code).toBe('RESTORE_UNSUPPORTED_DEPENDENCIES')
    await db.delete(outboxMessages).where(eq(outboxMessages.parishId, f.parishId))
    expect((await f.restore()).status).toBe(200)
    expect(await db.select().from(outboxMessages).where(eq(outboxMessages.parishId, other.parishId))).toHaveLength(1)
  })

  it('rejects a legacy 2.0 profile before deleting exam question provenance it cannot carry', async () => {
    const f = await fixture()
    await db.insert(questionBankItems).values({ id: 'question', parishId: f.parishId, createdBy: 'admin' })
    await db.insert(questionBankVersions).values({
      id: 'question-v1', parishId: f.parishId, questionId: 'question', version: 1,
      questionType: 'multiple_choice', stem: 'Synthetic?', answerData: '{"options":["A","B"],"correct":"A"}',
      metadataSnapshot: '{}', contentHash: 'synthetic', createdBy: 'admin',
    })
    await db.insert(examSessions).values({
      id: 'session', parishId: f.parishId, classId: 'class', subject: 'Synthetic', scoreType: 'final',
      semester: 1, academicYear: '2025-2026', createdBy: 'admin',
    })
    await db.insert(examQuestionSnapshots).values({
      id: 'snapshot', parishId: f.parishId, examSessionId: 'session', questionId: 'question',
      questionVersionId: 'question-v1', sourcePosition: 1, snapshotJson: '{}', contentHash: 'synthetic',
    })

    const currentResponse = await f.exportBackup()
    expect(currentResponse.status).toBe(200)
    const current = await currentResponse.json() as any
    const legacyData = {
      students: current.data.students,
      grades: current.data.grades,
      attendance: current.data.attendance,
      classes: current.data.classes,
      semesterLocks: current.data.semesterLocks,
      gradeOverrides: current.data.gradeOverrides,
      promotionSnapshots: current.data.promotionSnapshots,
      examSessions: current.data.examSessions,
      examResults: current.data.examResults,
    }
    const legacyPayload = {
      ...current,
      version: '2.0-production',
      data: legacyData,
      checksum: createHash('sha256').update(JSON.stringify(legacyData)).digest('hex'),
    }
    const response = await f.restore(legacyPayload)
    expect(response.status).toBe(409)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('RESTORE_UNSUPPORTED_DEPENDENCIES')
    expect(await db.select().from(examQuestionSnapshots).where(eq(examQuestionSnapshots.parishId, f.parishId))).toHaveLength(1)
    expect(writeSafetySnapshot).not.toHaveBeenCalled()
  })

  it('an unprotected parish still restores; protected state in another parish is not a blocker', async () => {
    const other = await fixture()
    await db.update(academicYears).set({ status: 'FINALIZED' }).where(eq(academicYears.parishId, other.parishId))
    const f = await fixture()
    const response = await f.restore()
    expect(response.status).toBe(200)
    const body = await response.json() as { purgeVersion: number }
    expect(body.purgeVersion).toBe(DEFAULT_PURGE_VERSION + 1)
    const [generation] = await db.select().from(systemSettings)
      .where(and(eq(systemSettings.parishId, f.parishId), eq(systemSettings.key, PURGE_VERSION_KEY)))
    expect(Number(generation.value)).toBe(body.purgeVersion)
    const [successAudit] = await db.select().from(auditLogs)
      .where(and(eq(auditLogs.parishId, f.parishId), eq(auditLogs.action, 'RESTORE_BACKUP')))
    expect(JSON.parse(successAudit.newValue || '{}').purgeVersion).toBe(body.purgeVersion)
    expect((await db.select().from(academicYears).where(eq(academicYears.parishId, other.parishId)))[0].status).toBe('FINALIZED')
  })
})
