import { beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import exams from '../routes/exams.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { academicYears, auditLogs, branches, catechistAssignments, classes, examResults, examSessions, semesterLocks, students, users } from '../db/schema.js'

const parishId = 'exam-definition-edit'
const classId = 'edit-class'
const adminId = 'edit-admin'
const studentId = 'edit-student'
const tokenFor = (userId: string, role: 'admin' | 'phuta', parish = parishId) =>
  generateTokens({ userId, username: userId, role, parishId: parish, tokenVersion: 1 }).accessToken
const adminToken = tokenFor(adminId, 'admin')
const teacherToken = tokenFor('edit-teacher', 'phuta')
const otherTeacherToken = tokenFor('edit-other-teacher', 'phuta')
const otherParishToken = tokenFor('edit-other-admin', 'admin', 'edit-other-parish')
const base = { classId, subject: 'Đề ban đầu', scoreType: '15m', semester: 1, academicYear: '2026-2027', maxScore: 10, examType: 'written' }
const mc = (index: number) => ({ index, type: 'multiple_choice', question: `Câu hỏi ${index}`, options: { A: 'Một', B: 'Hai', C: 'Ba', D: 'Bốn' }, correctOption: 'A', points: 5 })
const mcInput = { ...base, examType: 'multiple_choice', questionCount: 2, answerKey: JSON.stringify({ 1: 'A', 2: 'A' }), questions: JSON.stringify([mc(1), mc(2)]) }

async function request(path: string, method = 'GET', body?: unknown, token = adminToken) {
  const response = await exams.request(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, ...await response.json() as { data: any; error?: { code: string; message: string } } }
}
async function create(input = base) {
  const response = await request('/', 'POST', input)
  expect(response.status).toBe(201)
  return response.data
}
async function context(id: string) {
  const response = await request(`/${id}/definition`)
  expect(response.status).toBe(200)
  return response.data
}
async function edit(id: string, hash: string, input: Record<string, unknown> = base, token = adminToken) {
  return request(`/${id}/definition`, 'PUT', { ...input, expectedDefinitionHash: hash }, token)
}
async function persisted(id: string) {
  const [row] = await db.select().from(examSessions).where(and(eq(examSessions.parishId, parishId), eq(examSessions.id, id)))
  return row
}

beforeAll(async () => {
  await db.insert(users).values([
    { id: adminId, username: adminId, fullName: 'Admin', role: 'admin', passwordHash: 'hash', parishId },
    { id: 'edit-teacher', username: 'edit-teacher', fullName: 'Teacher', role: 'phuta', passwordHash: 'hash', parishId },
    { id: 'edit-other-teacher', username: 'edit-other-teacher', fullName: 'Other', role: 'phuta', passwordHash: 'hash', parishId },
    { id: 'edit-other-admin', username: 'edit-other-admin', fullName: 'Other Admin', role: 'admin', passwordHash: 'hash', parishId: 'edit-other-parish' },
  ])
  await db.insert(branches).values({ id: 'edit-branch', name: 'Branch', scarfColor: 'Blue', ageMin: 6, ageMax: 15, parishId })
  await db.insert(academicYears).values({ id: base.academicYear, startDate: '2026-08-01', endDate: '2027-06-30', parishId })
  await db.insert(classes).values({ id: classId, code: classId, name: 'Class', branchId: 'edit-branch', academicYearId: base.academicYear, parishId })
  await db.insert(catechistAssignments).values({ id: 'edit-assignment', userId: 'edit-teacher', classId, roleInClass: 'phuta', parishId })
  await db.insert(students).values({ id: studentId, code: studentId, fullName: 'Student', holyName: '', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: '', parentPhone: '', address: '', branch: 'AuNhi', classId, parishId })
})

describe('exam definition editing before grading', () => {
  it('edits the existing session and uses the new question count and key for server scoring', async () => {
    const session = await create()
    const original = await context(session.id)
    const input = { ...mcInput, subject: 'Đề đã sửa', maxScore: 8, questionCount: 1, answerKey: '{"1":"C"}', questions: JSON.stringify([{ ...mc(1), question: 'Nội dung mới', points: 8 }]) }
    const updated = await edit(session.id, original.definitionHash, input, teacherToken)
    expect(updated.status).toBe(200)
    expect(updated.data).toMatchObject({ id: session.id, createdBy: adminId, classId, subject: 'Đề đã sửa', questionCount: 1, maxScore: 8 })
    expect(JSON.parse(updated.data.questions)[0]).toMatchObject({ question: 'Nội dung mới', correctOption: 'C' })
    const fresh = await context(session.id)
    expect(fresh.definitionHash).not.toBe(original.definitionHash)
    const score = await request(`/${session.id}/results`, 'POST', { results: [{ studentId, definitionHash: fresh.definitionHash, source: 'omr', score: 0, answers: '{"1":"C"}', scanMetadata: JSON.stringify({ detectionStatus: 'accepted', examVersion: 'A', questionCount: 1 }) }] })
    expect(score.status).toBe(200)
    expect(score.data.items[0].serverScore).toBe(8)
    const audit = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishId), eq(auditLogs.entityId, session.id), eq(auditLogs.action, 'EXAM_EDIT_DEFINITION')))
    expect(audit).toHaveLength(1)
  })

  it('rebuilds all materialized variants together and preserves them for a title-only edit', async () => {
    const session = await create(mcInput)
    const generated = await request(`/${session.id}/variant-manifests`, 'POST', { variantCount: 4, seed: 'edit-variants' })
    expect(generated.status).toBe(200)
    const before = await context(session.id)
    const renamed = await edit(session.id, before.definitionHash, { ...mcInput, subject: 'Tên mới' })
    expect(renamed.status).toBe(200)
    expect(renamed.data.variantManifests).toBe(generated.data.session.variantManifests)
    const current = await context(session.id)
    const changed = await edit(session.id, current.definitionHash, { ...mcInput, answerKey: '{"1":"D","2":"B"}', questions: JSON.stringify([{ ...mc(1), question: 'Câu mới' }, mc(2)]) })
    expect(changed.status).toBe(200)
    const manifests = JSON.parse(changed.data.variantManifests)
    expect(Object.keys(manifests.variants)).toEqual(['A', 'B', 'C', 'D'])
    expect(manifests.sourceHash).not.toBe(JSON.parse(generated.data.session.variantManifests).sourceHash)
    expect(manifests.variants.A.answerKey).toEqual({ 1: 'D', 2: 'B' })
    expect(JSON.parse(changed.data.answerVariants)).toEqual(Object.fromEntries(Object.entries(manifests.variants).map(([code, variant]: [string, any]) => [code, variant.answerKey])))
  })

  it('rejects valid edit requests outside the assigned class or parish without changing data', async () => {
    const session = await create()
    const { definitionHash } = await context(session.id)
    expect((await edit(session.id, definitionHash, { ...base, subject: 'Forbidden' }, otherTeacherToken)).status).toBe(403)
    expect((await edit(session.id, definitionHash, { ...base, subject: 'Forbidden' }, otherParishToken)).status).toBe(404)
    expect((await persisted(session.id)).subject).toBe(base.subject)
  })

  it('rejects after grading, even when every result was subsequently deleted', async () => {
    const session = await create()
    const { definitionHash } = await context(session.id)
    expect((await request(`/${session.id}/results`, 'POST', { results: [{ studentId, score: 6, source: 'quick_entry', clientMutationId: `edit-save-${session.id}` }] })).status).toBe(200)
    expect((await edit(session.id, definitionHash)).status).toBe(409)
    const [result] = await db.select().from(examResults).where(and(eq(examResults.parishId, parishId), eq(examResults.examSessionId, session.id)))
    const deletion = await request(`/${session.id}/results/${studentId}?expectedResultId=${result.id}&expectedResultVersion=${result.resultVersion}&clientMutationId=edit-delete-${session.id}`, 'DELETE')
    expect(deletion.status).toBe(200)
    expect((await contextDenied(session.id)).status).toBe(409)
    expect((await edit(session.id, definitionHash, { ...base, subject: 'After deletion' })).status).toBe(409)
    expect((await persisted(session.id)).subject).toBe(base.subject)
  })

  it('preserves the legacy history lock without a remaining result or receipt', async () => {
    const session = await create()
    const { definitionHash } = await context(session.id)
    await db.insert(auditLogs).values({ id: `edit-legacy-${session.id}`, userId: adminId, parishId, action: 'EXAM_SAVE_RESULTS', entityType: 'exam_session', entityId: session.id })
    expect((await edit(session.id, definitionHash)).status).toBe(409)
  })

  it('rejects stale edits and accepts only one of two concurrent edits', async () => {
    const session = await create()
    const { definitionHash } = await context(session.id)
    const outcomes = await Promise.all([edit(session.id, definitionHash, { ...base, subject: 'First' }), edit(session.id, definitionHash, { ...base, subject: 'Second' })])
    expect(outcomes.map(r => r.status).sort()).toEqual([200, 409])
    expect(['First', 'Second']).toContain((await persisted(session.id)).subject)
    expect((await edit(session.id, definitionHash, { ...base, subject: 'Stale' })).status).toBe(409)
  })

  it('rejects grading queued against an old definition and permits a refreshed command', async () => {
    const session = await create()
    const old = await context(session.id)
    const edited = await edit(session.id, old.definitionHash, { ...base, subject: 'Đề mới' })
    expect(edited.status).toBe(200)
    const score = { studentId, score: 7, source: 'quick_entry', clientMutationId: `edit-stale-score-${session.id}` }
    expect((await request(`/${session.id}/results`, 'POST', { results: [{ ...score, definitionHash: old.definitionHash }] })).status).toBe(409)
    expect((await request(`/${session.id}/results`, 'POST', { results: [score] })).status).toBe(409)
    expect((await request(`/${session.id}/results`, 'POST', { results: [{ ...score, definitionHash: edited.data.definitionHash }] })).status).toBe(200)
    // The acknowledged command remains replayable; changing its hash is a
    // different payload even when its score is unchanged.
    expect((await request(`/${session.id}/results`, 'POST', { results: [{ ...score, definitionHash: edited.data.definitionHash }] })).status).toBe(200)
    expect((await request(`/${session.id}/results`, 'POST', { results: [{ ...score, definitionHash: old.definitionHash }] })).status).toBe(409)
  })

  it('does not bypass completed state, semester locks or fixed academic scope', async () => {
    const session = await create()
    const { definitionHash } = await context(session.id)
    expect((await edit(session.id, definitionHash, { ...base, semester: 2 })).status).toBe(400)
    await db.update(examSessions).set({ status: 'completed' }).where(and(eq(examSessions.parishId, parishId), eq(examSessions.id, session.id)))
    expect((await edit(session.id, definitionHash)).status).toBe(409)
    await db.update(examSessions).set({ status: 'draft' }).where(and(eq(examSessions.parishId, parishId), eq(examSessions.id, session.id)))
    await db.insert(semesterLocks).values({ id: 'edit-semester-lock', parishId, academicYear: base.academicYear, semester: 1, isLocked: 1 })
    try { expect((await edit(session.id, definitionHash)).status).toBe(403) }
    finally { await db.delete(semesterLocks).where(eq(semesterLocks.id, 'edit-semester-lock')) }
    expect((await persisted(session.id)).subject).toBe(base.subject)
  })

  it('validates edits like creation and rolls back unsafe variant regeneration', async () => {
    const session = await create(mcInput)
    expect((await request(`/${session.id}/variant-manifests`, 'POST', { variantCount: 2 })).status).toBe(200)
    const { definitionHash } = await context(session.id)
    expect((await edit(session.id, definitionHash, { ...mcInput, answerKey: '{"1":"A"}' })).status).toBe(400)
    const unsafe = [{ ...mc(1), options: { A: 'Một', B: 'Một', C: 'Ba', D: 'Bốn' } }, mc(2)]
    expect((await edit(session.id, definitionHash, { ...mcInput, questions: JSON.stringify(unsafe) })).status).toBe(400)
    expect((await context(session.id)).definitionHash).toBe(definitionHash)
  })
})

const contextDenied = (id: string) => request(`/${id}/definition`)
