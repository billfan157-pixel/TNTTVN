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

const parishA = 'parish-domain2-same-id-a'
const parishB = 'parish-domain2-same-id-b'
const parishes = [parishA, parishB]

const branchId = 'br-domain2-shared'
const academicYearId = 'ay-domain2-shared'
const classId = 'cl-domain2-shared'
const userId = 'usr-domain2-shared'
const studentId = 'st-domain2-shared'
const sessionId = 'EXS-DOMAIN2-SHARED'
const classCode = 'D2-SHARED'

async function cleanupParish(parishId: string): Promise<void> {
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(examResults).where(eq(examResults.parishId, parishId))
  await db.delete(examSessions).where(eq(examSessions.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
}

async function seedParish(parishId: string, suffix: string): Promise<void> {
  await db.insert(branches).values({
    id: branchId,
    parishId,
    name: `Ấu Nhi ${suffix}`,
    scarfColor: 'Xanh',
    ageMin: 6,
    ageMax: 9,
  })

  await db.insert(academicYears).values({
    id: academicYearId,
    parishId,
    startDate: '2026-09-01',
    endDate: '2027-05-31',
  })

  // Same class ID + code + academic year is intentional. Migration 126 must
  // scope the unique key by parish_id so this second insert remains valid.
  await db.insert(classes).values({
    id: classId,
    parishId,
    code: classCode,
    name: `Lớp Domain 2 ${suffix}`,
    branchId,
    academicYearId,
    idempotencyKey: `class-domain2-${suffix}`,
  })

  await db.insert(users).values({
    id: userId,
    parishId,
    username: 'domain2_same_user',
    fullName: `Domain 2 User ${suffix}`,
    passwordHash: 'hash',
    role: 'admin',
  })

  await db.insert(students).values({
    id: studentId,
    parishId,
    code: 'ST-D2-SHARED',
    holyName: 'Giu-se',
    fullName: `Thiếu Nhi ${suffix}`,
    gender: 'Nam',
    dateOfBirth: '2016-01-01',
    parentName: `Phụ huynh ${suffix}`,
    parentPhone: suffix === 'A' ? '0900000001' : '0900000002',
    address: 'Test',
    branch: 'AuNhi',
    classId,
  })

  await db.insert(examSessions).values({
    id: sessionId,
    parishId,
    classId,
    subject: `Domain 2 ${suffix}`,
    scoreType: '15m',
    maxScore: 10,
    semester: 1,
    academicYear: academicYearId,
    status: 'draft',
    createdBy: userId,
    examType: 'written',
    idempotencyKey: `exam-domain2-${suffix}`,
  })
}

describe('Domain 2 same-ID tenant isolation', () => {
  beforeAll(async () => {
    for (const parishId of parishes) await cleanupParish(parishId)
    await seedParish(parishA, 'A')
    await seedParish(parishB, 'B')
  })

  afterAll(async () => {
    for (const parishId of parishes) await cleanupParish(parishId)
  })

  it('allows the same class, student and exam session IDs to coexist across parishes', async () => {
    const classRows = await db
      .select({ parishId: classes.parishId, id: classes.id, code: classes.code })
      .from(classes)
      .where(eq(classes.id, classId))

    const studentRows = await db
      .select({ parishId: students.parishId, id: students.id })
      .from(students)
      .where(eq(students.id, studentId))

    const sessionRows = await db
      .select({ parishId: examSessions.parishId, id: examSessions.id })
      .from(examSessions)
      .where(eq(examSessions.id, sessionId))

    expect(classRows.filter(row => parishes.includes(row.parishId))).toHaveLength(2)
    expect(classRows.filter(row => parishes.includes(row.parishId)).every(row => row.code === classCode)).toBe(true)
    expect(studentRows.filter(row => parishes.includes(row.parishId))).toHaveLength(2)
    expect(sessionRows.filter(row => parishes.includes(row.parishId))).toHaveLength(2)
  })

  it('upserts identical session/student IDs independently within each parish', async () => {
    await upsertExamResults(
      sessionId,
      [{ studentId, score: 6, source: 'quick_entry' }],
      userId,
      parishA,
      '127.0.0.1',
      'vitest-domain2',
      null,
    )

    await upsertExamResults(
      sessionId,
      [{ studentId, score: 9, source: 'quick_entry' }],
      userId,
      parishB,
      '127.0.0.1',
      'vitest-domain2',
      null,
    )

    const [resultA] = await db
      .select({ score: examResults.score })
      .from(examResults)
      .where(and(
        eq(examResults.parishId, parishA),
        eq(examResults.examSessionId, sessionId),
        eq(examResults.studentId, studentId),
      ))
      .limit(1)

    const [resultB] = await db
      .select({ score: examResults.score })
      .from(examResults)
      .where(and(
        eq(examResults.parishId, parishB),
        eq(examResults.examSessionId, sessionId),
        eq(examResults.studentId, studentId),
      ))
      .limit(1)

    expect(resultA?.score).toBe(6)
    expect(resultB?.score).toBe(9)

    const sharedLogicalRows = await db
      .select({ parishId: examResults.parishId, score: examResults.score })
      .from(examResults)
      .where(and(
        eq(examResults.examSessionId, sessionId),
        eq(examResults.studentId, studentId),
      ))

    expect(sharedLogicalRows.filter(row => parishes.includes(row.parishId))).toHaveLength(2)
  })
})
