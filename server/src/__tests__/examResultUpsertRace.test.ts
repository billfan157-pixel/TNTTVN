import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  academicYears,
  auditLogs,
  branches,
  classes,
  examResults,
  examSessions,
  students,
  users,
} from '../db/schema.js'
import { upsertExamResults } from '../services/examService.js'

const parishId = 'parish-exam-upsert-race'
const branchId = 'br-exam-upsert-race'
const academicYearId = '2026-2027-upsert-race'
const classId = 'cl-exam-upsert-race'
const studentId = 'st-exam-upsert-race'
const userId = 'usr-exam-upsert-race'
const sessionId = 'EXS-UPSERTRACE0001'

function isSqliteBusy(error: unknown): boolean {
  let current: unknown = error
  const visited = new Set<unknown>()
  for (let depth = 0; depth < 8 && current && typeof current === 'object' && !visited.has(current); depth++) {
    visited.add(current)
    const candidate = current as { code?: unknown; extendedCode?: unknown; cause?: unknown }
    if (
      (typeof candidate.code === 'string' && candidate.code.startsWith('SQLITE_BUSY'))
      || (typeof candidate.extendedCode === 'string' && candidate.extendedCode.startsWith('SQLITE_BUSY'))
    ) return true
    current = candidate.cause
  }
  return false
}

async function retryCleanupContention<T>(operation: () => Promise<T>, maxAttempts = 16): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await operation()
    } catch (error) {
      attempt++
      if (!isSqliteBusy(error) || attempt >= maxAttempts) throw error
      await new Promise(resolve => setTimeout(resolve, Math.min(250, 20 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 30)))
    }
  }
}

async function cleanup(): Promise<void> {
  await retryCleanupContention(() => db.delete(auditLogs).where(eq(auditLogs.parishId, parishId)))
  await retryCleanupContention(() => db.delete(examResults).where(eq(examResults.parishId, parishId)))
  await retryCleanupContention(() => db.delete(examSessions).where(eq(examSessions.parishId, parishId)))
  await retryCleanupContention(() => db.delete(students).where(eq(students.parishId, parishId)))
  await retryCleanupContention(() => db.delete(classes).where(eq(classes.parishId, parishId)))
  await retryCleanupContention(() => db.delete(users).where(eq(users.parishId, parishId)))
  await retryCleanupContention(() => db.delete(branches).where(eq(branches.parishId, parishId)))
  await retryCleanupContention(() => db.delete(academicYears).where(eq(academicYears.parishId, parishId)))
}

describe('exam result atomic upsert', () => {
  beforeAll(async () => {
    await cleanup()
    const now = new Date().toISOString()

    await db.insert(branches).values({
      id: branchId,
      name: 'Ấu Nhi Upsert Race',
      scarfColor: 'Xanh',
      ageMin: 6,
      ageMax: 9,
      parishId,
    })
    await db.insert(academicYears).values({
      id: academicYearId,
      startDate: '2026-09-01',
      endDate: '2027-05-31',
      parishId,
    })
    await db.insert(classes).values({
      id: classId,
      code: 'CL-UPRACE',
      name: 'Lớp Atomic Upsert',
      branchId,
      academicYearId,
      parishId,
    })
    await db.insert(users).values({
      id: userId,
      username: 'exam_upsert_race',
      fullName: 'Atomic Upsert Tester',
      passwordHash: 'hash',
      role: 'admin',
      parishId,
    })
    await db.insert(students).values({
      id: studentId,
      code: 'ST-UPRACE',
      holyName: 'Giu-se',
      fullName: 'Thiếu Nhi Atomic',
      gender: 'Nam',
      dateOfBirth: '2016-01-01',
      parentName: 'Phụ huynh',
      parentPhone: '0000000000',
      address: 'Test',
      branch: 'AuNhi',
      classId,
      parishId,
    })
    await db.insert(examSessions).values({
      id: sessionId,
      parishId,
      classId,
      subject: 'Atomic Upsert',
      scoreType: '15m',
      maxScore: 10,
      semester: 1,
      academicYear: academicYearId,
      status: 'draft',
      createdBy: userId,
      examType: 'written',
      idempotencyKey: 'idem-exam-upsert-race',
      createdAt: now,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('production save path converges concurrent writes into exactly one row', async () => {
    const scores = [4, 5, 6, 7, 8]
    const settled = await Promise.allSettled(scores.map(score => upsertExamResults(
      sessionId,
      [{ studentId, score, source: 'quick_entry' }],
      userId,
      parishId,
      '127.0.0.1',
      'vitest',
      null,
    )))

    const failures = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(failures, failures.map(result => String(result.reason)).join('\n')).toHaveLength(0)

    const writes = settled
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof upsertExamResults>>> => result.status === 'fulfilled')
      .map(result => result.value)

    expect(writes).toHaveLength(scores.length)
    expect(writes.every(result => result.total === 1)).toBe(true)
    expect(writes.reduce((sum, result) => sum + result.saved, 0)).toBe(1)
    expect(writes.reduce((sum, result) => sum + result.upserted, 0)).toBe(scores.length - 1)

    const rows = await db
      .select({ id: examResults.id, score: examResults.score })
      .from(examResults)
      .where(and(
        eq(examResults.parishId, parishId),
        eq(examResults.examSessionId, sessionId),
        eq(examResults.studentId, studentId),
      ))

    expect(rows).toHaveLength(1)
    expect(scores).toContain(rows[0].score)
  })
})
