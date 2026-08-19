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

async function cleanup(): Promise<void> {
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(examResults).where(eq(examResults.parishId, parishId))
  await db.delete(examSessions).where(eq(examSessions.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
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

  it('serializes concurrent saves into exactly one row without unique violations', async () => {
    const scores = [4, 5, 6, 7, 8]
    const writes = await Promise.all(scores.map(score => upsertExamResults(
      sessionId,
      [{ studentId, score, source: 'quick_entry' }],
      userId,
      parishId,
      '127.0.0.1',
      'vitest',
      null,
    )))

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
