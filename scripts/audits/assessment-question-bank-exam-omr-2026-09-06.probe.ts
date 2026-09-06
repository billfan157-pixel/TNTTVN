import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../../server/src/db/index.js'
import {
  academicYears,
  auditLogs,
  branches,
  classes,
  examQuestionSnapshots,
  examResultMutations,
  examResults,
  examSessions,
  questionBankItems,
  questionBankVersions,
  students,
  users,
} from '../../server/src/db/schema.js'
import { upsertExamResults } from '../../server/src/services/examService.js'
import { buildExamFromBank } from '../../server/src/services/questionBankService.js'
import { initDB, getDB } from '../../src/lib/db'
import { decryptQueueValue } from '../../src/lib/offlineCipher'
import { useExamStore } from '../../src/stores/examStore'

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const parishId = `assessment-audit-${suffix}`
const branchId = `assessment-branch-${suffix}`
const academicYearId = `assessment-year-${suffix}`
const classId = `assessment-class-${suffix}`
const userId = `assessment-admin-${suffix}`
const studentId = `assessment-student-${suffix}`
const mixedSessionId = `EXS-MIXED-AUDIT-${suffix}`
const omrSessionId = `EXS-OMR-AUDIT-${suffix}`
const questionId = `QB-AUDIT-${suffix}`
const questionVersionId = `QBV-AUDIT-${suffix}`

const actor = { userId, parishId, role: 'admin' }

async function cleanupServerFixtures(): Promise<void> {
  await db.delete(examResultMutations).where(eq(examResultMutations.parishId, parishId))
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(examResults).where(eq(examResults.parishId, parishId))
  await db.delete(examQuestionSnapshots).where(eq(examQuestionSnapshots.parishId, parishId))
  await db.delete(examSessions).where(eq(examSessions.parishId, parishId))
  await db.delete(questionBankVersions).where(eq(questionBankVersions.parishId, parishId))
  await db.delete(questionBankItems).where(eq(questionBankItems.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
}

beforeAll(async () => {
  await cleanupServerFixtures()
  await db.insert(branches).values({
    id: branchId,
    parishId,
    name: 'Assessment audit branch',
    scarfColor: 'Xanh',
    ageMin: 9,
    ageMax: 12,
  })
  await db.insert(academicYears).values({
    id: academicYearId,
    parishId,
    startDate: '2026-09-01',
    endDate: '2027-05-31',
  })
  await db.insert(users).values({
    id: userId,
    parishId,
    username: `assessment_admin_${suffix}`,
    fullName: 'Assessment Audit Admin',
    passwordHash: 'hash',
    role: 'admin',
  })
  await db.insert(classes).values({
    id: classId,
    parishId,
    code: `ASM-${suffix}`,
    name: 'Assessment Audit Class',
    branchId,
    academicYearId,
  })
  await db.insert(students).values({
    id: studentId,
    parishId,
    code: `ST-${suffix}`,
    holyName: 'Giu-se',
    fullName: 'Assessment Audit Student',
    gender: 'Nam',
    dateOfBirth: '2015-01-01',
    parentName: 'Parent',
    parentPhone: '0000000000',
    address: 'Audit',
    branch: 'ThieuNhi',
    classId,
  })

  const questions = JSON.stringify([
    { index: 1, type: 'multiple_choice', question: 'Q1', options: { A: 'A1', B: 'B1', C: 'C1', D: 'D1' }, correctOption: 'A', points: 1 },
    { index: 2, type: 'multiple_choice', question: 'Q2', options: { A: 'A2', B: 'B2', C: 'C2', D: 'D2' }, correctOption: 'A', points: 1 },
    { index: 3, type: 'essay', question: 'Essay', points: 8 },
  ])
  await db.insert(examSessions).values([
    {
      id: mixedSessionId,
      parishId,
      classId,
      subject: 'Mixed variant preservation probe',
      scoreType: '1period',
      maxScore: 10,
      semester: 1,
      academicYear: academicYearId,
      status: 'draft',
      createdBy: userId,
      examType: 'mixed',
      questionCount: 2,
      answerKey: JSON.stringify({ 1: 'A', 2: 'A' }),
      answerVariants: JSON.stringify({ A: { 1: 'A', 2: 'A' }, B: { 1: 'B', 2: 'B' } }),
      questions,
      idempotencyKey: `assessment-mixed-${suffix}`,
    },
    {
      id: omrSessionId,
      parishId,
      classId,
      subject: 'OMR provenance probe',
      scoreType: '15m',
      maxScore: 10,
      semester: 1,
      academicYear: academicYearId,
      status: 'draft',
      createdBy: userId,
      examType: 'multiple_choice',
      questionCount: 2,
      answerKey: JSON.stringify({ 1: 'A', 2: 'A' }),
      answerVariants: JSON.stringify({ A: { 1: 'A', 2: 'A' } }),
      questions,
      idempotencyKey: `assessment-omr-${suffix}`,
    },
  ])

  await db.insert(questionBankItems).values({
    id: questionId,
    parishId,
    status: 'active',
    currentVersion: 1,
    branchId,
    curriculumLevel: 'Thiếu Nhi 1',
    difficulty: 'recognition',
    tags: '[]',
    provenance: 'human',
    createdBy: userId,
  })
  await db.insert(questionBankVersions).values({
    id: questionVersionId,
    parishId,
    questionId,
    version: 1,
    questionType: 'multiple_choice',
    stem: 'Question Bank retry probe',
    answerData: JSON.stringify({
      options: [
        { id: 'A', text: 'One' },
        { id: 'B', text: 'Two' },
        { id: 'C', text: 'Three' },
        { id: 'D', text: 'Four' },
      ],
      correctOptionIds: ['A'],
    }),
    metadataSnapshot: '{}',
    contentHash: `hash-${suffix}`,
    createdBy: userId,
  })
})

afterAll(async () => {
  await cleanupServerFixtures()
  try {
    const clientDb = getDB()
    await clientDb.syncQueue.clear()
  } catch {
    // Client DB may not have been initialized if an earlier server probe failed.
  }
})

describe('Assessment audit reproducibility probes', () => {
  it('verifies variant/provenance is retained when essay score follows a B-form OMR result', async () => {
    await upsertExamResults(mixedSessionId, [{
      studentId,
      score: 0,
      source: 'omr',
      examVersion: 'B',
      answers: JSON.stringify({ 1: 'B', 2: 'B' }),
      scanMetadata: JSON.stringify({ detectionStatus: 'accepted', engineVersion: 'probe', examVersion: 'B', questionCount: 2 }),
      attemptFingerprint: `mixed-attempt-${suffix}`,
      capturedAt: '2026-09-06T00:00:00.000Z',
      clientMutationId: `mixed-omr-${suffix}`,
    }], userId, parishId, '127.0.0.1', 'assessment-audit', null)

    await upsertExamResults(mixedSessionId, [{
      studentId,
      score: 5,
      essayScore: 5,
      source: 'quick_entry',
      clientMutationId: `mixed-essay-${suffix}`,
      expectedResultVersion: 1,
    }], userId, parishId, '127.0.0.1', 'assessment-audit', null)

    const [row] = await db.select().from(examResults).where(and(
      eq(examResults.parishId, parishId),
      eq(examResults.examSessionId, mixedSessionId),
      eq(examResults.studentId, studentId),
    ))
    expect(row.score).toBe(7)
    expect(row.examVersion).toBe('B')
    expect(row.source).toBe('omr')
    expect(row.scanMetadata).toContain('"examVersion":"B"')
    expect(row.attemptFingerprint).toBe(`mixed-attempt-${suffix}`)
    expect(row.resultVersion).toBe(2)
  })

  it('verifies a retried Question Bank build returns the original draft exam', async () => {
    const input = {
      mode: 'manual' as const,
      questionIds: [questionId],
      classId,
      subject: 'Question Bank retry probe',
      scoreType: '15m' as const,
      semester: 1 as const,
      academicYear: academicYearId,
      maxScore: 10,
      variantCount: 2,
      seed: `stable-seed-${suffix}`,
      buildCommandId: `build-command-${suffix}`,
    }
    const first = await buildExamFromBank(input, actor)
    const retry = await buildExamFromBank(input, actor)
    expect(retry.id).toBe(first.id)
    const rows = await db.select().from(examSessions).where(and(
      eq(examSessions.parishId, parishId),
      eq(examSessions.subject, input.subject),
    ))
    expect(rows).toHaveLength(1)
  })

  it('verifies server rejects an OMR-labelled result without accepted detection metadata', async () => {
    await expect(upsertExamResults(omrSessionId, [{
      studentId,
      score: 0,
      source: 'omr',
      examVersion: 'A',
      answers: JSON.stringify({ 1: 'A', 2: 'A' }),
      clientMutationId: `omr-no-metadata-${suffix}`,
    }], userId, parishId, '127.0.0.1', 'assessment-audit', null)).rejects.toThrow('scanMetadata')

    const [row] = await db.select().from(examResults).where(and(
      eq(examResults.parishId, parishId),
      eq(examResults.examSessionId, omrSessionId),
      eq(examResults.studentId, studentId),
    ))
    expect(row).toBeUndefined()
  })

  it('verifies same-student queue replacement supersedes the old ledger entry', async () => {
    await initDB()
    await getDB().syncQueue.clear()
    localStorage.setItem('parish_current_user', JSON.stringify({ id: userId, parishId }))
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    useExamStore.setState({
      selectedSessionId: mixedSessionId,
      sessions: [{
        id: mixedSessionId,
        parishId,
        classId,
        subject: 'Client queue probe',
        scoreType: '1period',
        maxScore: 10,
        semester: 1,
        academicYear: academicYearId,
        status: 'draft',
        createdBy: userId,
        createdAt: new Date().toISOString(),
        examType: 'mixed',
      }],
      results: [],
      queuedResultMutations: {},
    })

    const first = await useExamStore.getState().queueScores([{
      studentId,
      score: 6,
      source: 'qr_scan',
      clientMutationId: `queue-old-${suffix}`,
    }])
    const second = await useExamStore.getState().queueScores([{
      studentId,
      score: 8,
      source: 'qr_scan',
      clientMutationId: `queue-new-${suffix}`,
    }])
    expect(first?.queuedMutations[0].queueOpId).toBe(second?.queuedMutations[0].queueOpId)

    const pending = await useExamStore.getState().queuedResultMutations
    expect(pending[`queue-old-${suffix}`].status).toBe('superseded')
    expect(pending[`queue-new-${suffix}`].status).toBe('pending')
    const queue = await getDB().syncQueue.toArray()
    expect(queue).toHaveLength(1)
    const payload = JSON.parse((await decryptQueueValue(queue[0].payload)) ?? '{}')
    expect(payload.score.clientMutationId).toBe(`queue-new-${suffix}`)
  })
})
