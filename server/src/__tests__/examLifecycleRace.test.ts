import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  academicYears,
  auditLogs,
  branches,
  classes,
  examFinalizationItems,
  examFinalizations,
  examResults,
  examSessions,
  grades,
  students,
  users,
} from '../db/schema.js'
import { deleteExamResult, deleteExamSession, finalizeExamSession } from '../services/examService.js'

const parishId = 'parish-exam-lifecycle-race'
const branchId = 'br-exam-lifecycle-race'
const academicYearId = '2026-2027-exam-lifecycle-race'
const classId = 'cl-exam-lifecycle-race'
const studentId = 'st-exam-lifecycle-race'
const userId = 'usr-exam-lifecycle-race'

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

async function retryContention<T>(operation: () => Promise<T>, maxAttempts = 16): Promise<T> {
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

async function cleanup() {
  await retryContention(() => db.delete(examFinalizationItems).where(eq(examFinalizationItems.parishId, parishId)))
  await retryContention(() => db.delete(examFinalizations).where(eq(examFinalizations.parishId, parishId)))
  await retryContention(() => db.delete(examResults).where(eq(examResults.parishId, parishId)))
  await retryContention(() => db.delete(examSessions).where(eq(examSessions.parishId, parishId)))
  await retryContention(() => db.delete(grades).where(eq(grades.parishId, parishId)))
  await retryContention(() => db.delete(auditLogs).where(eq(auditLogs.parishId, parishId)))
  await retryContention(() => db.delete(students).where(eq(students.parishId, parishId)))
  await retryContention(() => db.delete(classes).where(eq(classes.parishId, parishId)))
  await retryContention(() => db.delete(users).where(eq(users.parishId, parishId)))
  await retryContention(() => db.delete(branches).where(eq(branches.parishId, parishId)))
  await retryContention(() => db.delete(academicYears).where(eq(academicYears.parishId, parishId)))
}

async function seedSession(sessionId: string, resultId: string) {
  const now = new Date().toISOString()
  await db.insert(examSessions).values({
    id: sessionId,
    parishId,
    classId,
    subject: 'Race Test',
    scoreType: 'final',
    maxScore: 10,
    semester: 1,
    academicYear: academicYearId,
    status: 'draft',
    createdBy: userId,
    examType: 'written',
    idempotencyKey: `idem-${sessionId}`,
    createdAt: now,
  })
  await db.insert(examResults).values({
    id: resultId,
    parishId,
    examSessionId: sessionId,
    studentId,
    score: 8,
    source: 'quick_entry',
    examVersion: 'A',
    createdAt: now,
  })
}

describe('exam lifecycle mutation serialization', () => {
  beforeAll(async () => {
    await cleanup()
    await db.insert(branches).values({ id: branchId, parishId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9 })
    await db.insert(academicYears).values({ id: academicYearId, parishId, startDate: '2026-09-01', endDate: '2027-05-31' })
    await db.insert(classes).values({ id: classId, parishId, code: 'EX-RACE', name: 'Exam Race', branchId, academicYearId })
    await db.insert(users).values({ id: userId, parishId, username: 'exam_lifecycle_race_admin', passwordHash: 'hash', fullName: 'Exam Race Admin', role: 'admin' })
    await db.insert(students).values({
      id: studentId,
      parishId,
      code: 'EX-RACE-ST',
      holyName: 'Giuse',
      fullName: 'Exam Race Student',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Parent',
      parentPhone: '0900000000',
      address: 'Test',
      branch: 'AuNhi',
      classId,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('never leaves a completed session after its only result was concurrently deleted', async () => {
    const sessionId = 'EXS-RACE-RESULT-DELETE'
    const resultId = 'EXR-RACE-RESULT-DELETE'
    await seedSession(sessionId, resultId)

    await Promise.allSettled([
      finalizeExamSession(sessionId, userId, parishId, '127.0.0.1', 'vitest', null),
      deleteExamResult(sessionId, studentId, userId, parishId, '127.0.0.1', 'vitest', null),
    ])

    const [session] = await db.select().from(examSessions)
      .where(and(eq(examSessions.parishId, parishId), eq(examSessions.id, sessionId)))
      .limit(1)
    const results = await db.select().from(examResults)
      .where(and(eq(examResults.parishId, parishId), eq(examResults.examSessionId, sessionId)))
    const finalizations = await db.select().from(examFinalizations)
      .where(and(eq(examFinalizations.parishId, parishId), eq(examFinalizations.examSessionId, sessionId)))

    expect(session).toBeDefined()
    if (session!.status === 'completed') {
      expect(results).toHaveLength(1)
      expect(finalizations).toHaveLength(1)
    } else {
      expect(session!.status).toBe('draft')
      expect(results).toHaveLength(0)
      expect(finalizations).toHaveLength(0)
    }
  })

  it('never deletes a session after concurrent finalization has committed', async () => {
    const sessionId = 'EXS-RACE-SESSION-DELETE'
    const resultId = 'EXR-RACE-SESSION-DELETE'
    await seedSession(sessionId, resultId)

    await Promise.allSettled([
      finalizeExamSession(sessionId, userId, parishId, '127.0.0.1', 'vitest', null),
      deleteExamSession(sessionId, userId, parishId, '127.0.0.1', 'vitest', null),
    ])

    const [session] = await db.select().from(examSessions)
      .where(and(eq(examSessions.parishId, parishId), eq(examSessions.id, sessionId)))
      .limit(1)

    if (!session) {
      const results = await db.select().from(examResults)
        .where(and(eq(examResults.parishId, parishId), eq(examResults.examSessionId, sessionId)))
      const finalizations = await db.select().from(examFinalizations)
        .where(and(eq(examFinalizations.parishId, parishId), eq(examFinalizations.examSessionId, sessionId)))
      expect(results).toHaveLength(0)
      expect(finalizations).toHaveLength(0)
    } else {
      expect(session.status).toBe('completed')
      const results = await db.select().from(examResults)
        .where(and(eq(examResults.parishId, parishId), eq(examResults.examSessionId, sessionId)))
      const finalizations = await db.select().from(examFinalizations)
        .where(and(eq(examFinalizations.parishId, parishId), eq(examFinalizations.examSessionId, sessionId)))
      expect(results).toHaveLength(1)
      expect(finalizations).toHaveLength(1)
    }
  })
})
