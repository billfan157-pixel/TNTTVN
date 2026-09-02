import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import questionBankRouter from '../routes/questionBank.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import {
  academicYears, auditLogs, branches, classes, examBlueprintRules, examBlueprints, examQuestionSnapshots, examSessions,
  questionBankItems, questionBankVersions, users,
} from '../db/schema.js'

const suffix = Date.now()
const parishA = `qb-a-${suffix}`
const parishB = `qb-b-${suffix}`
const adminA = `qb-admin-a-${suffix}`
const teacherA = `qb-teacher-a-${suffix}`
const parentA = `qb-parent-a-${suffix}`
const adminB = `qb-admin-b-${suffix}`
const branchA = `qb-branch-a-${suffix}`
const branchB = `qb-branch-b-${suffix}`
const classA = `qb-class-a-${suffix}`

const token = (userId: string, username: string, role: 'admin'|'chunhiem'|'phuta'|'phuhuynh', parishId: string) =>
  generateTokens({ userId, username, role, parishId, tokenVersion: 1 }).accessToken
const adminToken = token(adminA, `qb_admin_a_${suffix}`, 'admin', parishA)
const teacherToken = token(teacherA, `qb_teacher_a_${suffix}`, 'phuta', parishA)
const parentToken = token(parentA, `qb_parent_a_${suffix}`, 'phuhuynh', parishA)
const otherTenantToken = token(adminB, `qb_admin_b_${suffix}`, 'admin', parishB)

async function req(path: string, options: { method?: string; body?: unknown; auth?: string } = {}) {
  const response = await questionBankRouter.request(path, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.auth ? { Authorization: `Bearer ${options.auth}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  let json: any = null
  try { json = await response.json() } catch {}
  return { status: response.status, data: json?.data, error: json?.error }
}

const mc = (stem: string) => ({
  questionType: 'multiple_choice', stem, difficulty: 'recognition', curriculumLevel: 'Thiếu Nhi 1', lessonOrder: 3,
  answerData: { options: [{ id: 'A', text: 'Một' }, { id: 'B', text: 'Hai' }, { id: 'C', text: 'Ba' }, { id: 'D', text: 'Bốn' }], correctOptionIds: ['B'] },
  explanation: 'Đáp án bí mật B', tags: ['bí tích'], provenance: 'human',
})

describe('Question Bank + Blueprint + immutable Exam snapshot', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: adminA, username: `qb_admin_a_${suffix}`, passwordHash: 'hash', fullName: 'QB Admin A', role: 'admin', parishId: parishA },
      { id: teacherA, username: `qb_teacher_a_${suffix}`, passwordHash: 'hash', fullName: 'QB Teacher A', role: 'phuta', parishId: parishA },
      { id: parentA, username: `qb_parent_a_${suffix}`, passwordHash: 'hash', fullName: 'QB Parent A', role: 'phuhuynh', parishId: parishA },
      { id: adminB, username: `qb_admin_b_${suffix}`, passwordHash: 'hash', fullName: 'QB Admin B', role: 'admin', parishId: parishB },
    ])
    await db.insert(branches).values([
      { id: branchA, name: 'Thiếu Nhi A', scarfColor: 'Xanh', ageMin: 9, ageMax: 12, parishId: parishA },
      { id: branchB, name: 'Thiếu Nhi B', scarfColor: 'Xanh', ageMin: 9, ageMax: 12, parishId: parishB },
    ])
    await db.insert(academicYears).values({ id: '2026-2027', startDate: '2026-09-01', endDate: '2027-05-31', parishId: parishA })
    await db.insert(classes).values({ id: classA, code: `QB-${suffix}`, name: 'Thiếu Nhi 1A', branchId: branchA, academicYearId: '2026-2027', parishId: parishA })
  })

  afterAll(async () => {
    await db.delete(examQuestionSnapshots).where(eq(examQuestionSnapshots.parishId, parishA))
    await db.delete(examSessions).where(eq(examSessions.parishId, parishA))
    await db.delete(examBlueprintRules).where(eq(examBlueprintRules.parishId, parishA))
    await db.delete(examBlueprints).where(eq(examBlueprints.parishId, parishA))
    await db.delete(examBlueprints).where(eq(examBlueprints.parishId, parishB))
    await db.delete(questionBankVersions).where(eq(questionBankVersions.parishId, parishA))
    await db.delete(questionBankItems).where(eq(questionBankItems.parishId, parishA))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishA))
    await db.delete(classes).where(eq(classes.parishId, parishA))
    await db.delete(academicYears).where(eq(academicYears.parishId, parishA))
    await db.delete(branches).where(eq(branches.parishId, parishA))
    await db.delete(branches).where(eq(branches.parishId, parishB))
    await db.delete(users).where(eq(users.parishId, parishA))
    await db.delete(users).where(eq(users.parishId, parishB))
  })

  it('blocks unauthenticated and parent access', async () => {
    expect((await req('/questions')).status).toBe(401)
    expect((await req('/questions', { auth: parentToken })).status).toBe(403)
  })

  let mcId = ''
  let essayId = ''
  let essayId2 = ''
  it('enforces draft → review → approved → active and admin-only approval', async () => {
    const created = await req('/questions', { method: 'POST', auth: teacherToken, body: mc('Ai lập Bí tích Thánh Thể?') })
    expect(created.status).toBe(201)
    mcId = created.data.id
    expect(created.data.status).toBe('draft')

    expect((await req(`/questions/${mcId}/lifecycle`, { method: 'POST', auth: teacherToken, body: { action: 'submit' } })).data.status).toBe('in_review')
    expect((await req(`/questions/${mcId}/lifecycle`, { method: 'POST', auth: teacherToken, body: { action: 'approve' } })).status).toBe(403)
    expect((await req(`/questions/${mcId}/lifecycle`, { method: 'POST', auth: adminToken, body: { action: 'approve' } })).data.status).toBe('approved')
    expect((await req(`/questions/${mcId}/lifecycle`, { method: 'POST', auth: adminToken, body: { action: 'activate' } })).data.status).toBe('active')

    const essay = await req('/questions', { method: 'POST', auth: adminToken, body: { questionType: 'essay', stem: 'Trình bày ý nghĩa Bí tích Thánh Thể.', answerData: { rubric: 'Nêu đủ hai ý.' }, explanation: 'Rubric chấm', difficulty: 'application' } })
    essayId = essay.data.id
    for (const action of ['submit', 'approve', 'activate'] as const) await req(`/questions/${essayId}/lifecycle`, { method: 'POST', auth: adminToken, body: { action } })
    const essay2 = await req('/questions', { method: 'POST', auth: adminToken, body: { questionType: 'essay', stem: 'Nêu một việc chuẩn bị trước Thánh lễ.', answerData: { rubric: 'Một việc phù hợp.' }, explanation: 'Rubric chấm', difficulty: 'understanding' } })
    essayId2 = essay2.data.id
    for (const action of ['submit', 'approve', 'activate'] as const) await req(`/questions/${essayId2}/lifecycle`, { method: 'POST', auth: adminToken, body: { action } })
  })

  it('keeps tenant queries isolated and never writes answer content to audit', async () => {
    const other = await req('/questions', { auth: otherTenantToken })
    expect(other.data.items).toHaveLength(0)
    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.entityId, mcId)))
    expect(JSON.stringify(audits)).not.toContain('Đáp án bí mật B')
    expect(JSON.stringify(audits)).not.toContain('"correctOptionIds"')
  })

  it('database trigger rejects a cross-parish blueprint reference', async () => {
    const blueprintId = `qb-blueprint-b-${suffix}`
    await db.insert(examBlueprints).values({
      id: blueprintId,
      parishId: parishB,
      name: 'Blueprint giáo xứ B',
      status: 'draft',
      totalQuestions: 1,
      maxScore: 10,
      createdBy: adminB,
      updatedBy: adminB,
    })
    const crossSessionId = `EXS-QB-CROSS-${suffix}`
    await expect(db.insert(examSessions).values({
      id: crossSessionId,
      parishId: parishA,
      classId: classA,
      subject: 'Cross tenant blueprint',
      scoreType: '15m',
      maxScore: 10,
      semester: 1,
      academicYear: '2026-2027',
      createdBy: adminA,
      blueprintId,
    })).rejects.toThrow()
    expect(await db.select().from(examSessions).where(and(
      eq(examSessions.parishId, parishA),
      eq(examSessions.id, crossSessionId),
    ))).toHaveLength(0)
  })

  let sessionId = ''
  it('builds a mixed exam atomically with source IDs, immutable snapshots and variant manifests', async () => {
    const built = await req('/exams/build', { method: 'POST', auth: adminToken, body: {
      mode: 'manual', questionIds: [mcId, essayId, essayId2], classId: classA, subject: 'Kiểm tra Question Bank', scoreType: '1period',
      semester: 1, academicYear: '2026-2027', maxScore: 10, variantCount: 2,
    } })
    expect(built.status).toBe(201)
    sessionId = built.data.id
    expect(built.data).toMatchObject({ sourceType: 'question_bank', examType: 'mixed', questionCount: 1 })
    const manifest = JSON.parse(built.data.variantManifests)
    expect(manifest.variants.A.sourceQuestionIds).toEqual([mcId, essayId, essayId2])
    const snapshots = await db.select().from(examQuestionSnapshots).where(and(eq(examQuestionSnapshots.parishId, parishA), eq(examQuestionSnapshots.examSessionId, sessionId)))
    expect(snapshots).toHaveLength(3)
    expect(snapshots.reduce((sum, snapshot) => sum + snapshot.points, 0)).toBe(10)
  })

  it('creates a new bank version without mutating the historical exam snapshot', async () => {
    const before = await db.select().from(examQuestionSnapshots).where(and(eq(examQuestionSnapshots.parishId, parishA), eq(examQuestionSnapshots.questionId, mcId)))
    const revised = await req(`/questions/${mcId}`, { method: 'PUT', auth: adminToken, body: mc('Ai thiết lập Bí tích Thánh Thể?') })
    expect(revised.status).toBe(200)
    expect(revised.data.currentVersion).toBe(2)
    expect(revised.data.status).toBe('draft')
    const after = await db.select().from(examQuestionSnapshots).where(and(eq(examQuestionSnapshots.parishId, parishA), eq(examQuestionSnapshots.questionId, mcId)))
    expect(after[0].snapshotJson).toBe(before[0].snapshotJson)
    expect(after[0].questionVersionId).toBe(before[0].questionVersionId)
  })

  it('fails closed when an active blueprint cannot satisfy a rule', async () => {
    const blueprint = await req('/blueprints', { method: 'POST', auth: adminToken, body: {
      name: 'Ma trận thiếu dữ liệu', totalQuestions: 2, maxScore: 10,
      rules: [{ questionType: 'multiple_choice', difficulty: 'recognition', questionCount: 2, pointsEach: 5 }],
    } })
    expect(blueprint.status).toBe(201)
    await req(`/blueprints/${blueprint.data.id}/status`, { method: 'POST', auth: adminToken, body: { status: 'active' } })
    const countBefore = (await db.select().from(examSessions).where(eq(examSessions.parishId, parishA))).length
    const generated = await req('/exams/build', { method: 'POST', auth: adminToken, body: {
      mode: 'blueprint', blueprintId: blueprint.data.id, classId: classA, subject: 'Không đủ câu', scoreType: 'midterm', semester: 1,
      academicYear: '2026-2027', maxScore: 10, variantCount: 1,
    } })
    expect(generated.status).toBe(422)
    expect(generated.error.code).toBe('BLUEPRINT_SHORTAGE')
    expect((await db.select().from(examSessions).where(eq(examSessions.parishId, parishA))).length).toBe(countBefore)
  })
})
