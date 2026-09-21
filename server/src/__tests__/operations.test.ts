// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  auditLogs,
  notifications,
  operationBlockouts,
  operationChecklistItems,
  operationEventParticipants,
  operationEventRetrospectives,
  operationEventTemplates,
  operationEventTemplateVersions,
  operationEvents,
  operationMutationReceipts,
  operationReminders,
  operationTaskAssignees,
  operationTaskDispatches,
  operationTaskComments,
  operationTaskDependencies,
  operationTasks,
  operationWorkstreamMembers,
  operationWorkstreams,
  parishEvents,
  parishOrganizationUnits,
  parishPeople,
  parishRecords,
  parishServiceTerms,
  users,
} from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import operationsRouter from '../routes/operations.js'
import { processDueOperationReminders } from '../services/operationsReminderService.js'
import { processDueManagerPrepReminders } from '../services/operationsManagerReminderService.js'
import { processDueOperationEventTransitions } from '../services/operationsEventLifecycleService.js'
import { processDueOperationTaskDispatches } from '../services/operationsTaskDispatchService.js'
import { compactOperationsMutationReceiptResponses, runIdempotentOperationsCommand } from '../services/operationsIdempotency.js'
import { runOperationsReceiptMaintenance } from '../services/operationsReceiptMaintenance.js'
import { resolveOperationsAuthorization, resolveOperationsUserAuthorization } from '../services/operationsAuthorization.js'
import { isOperationsAdminMutationOverrideEnabled } from '../utils/operationsAdminOverride.js'

const suffix = Date.now()
const parishA = `ops-a-${suffix}`
const parishB = `ops-b-${suffix}`
const adminId = `ops-admin-${suffix}`
const ownerId = `ops-owner-${suffix}`
const contributorId = `ops-contributor-${suffix}`
const leaderId = `ops-leader-${suffix}`
const expiredLeaderId = `ops-expired-${suffix}`
const parishLeaderId = `ops-parish-leader-${suffix}`
const parishSecretaryId = `ops-secretary-${suffix}`
const parishDeputyId = `ops-parish-deputy-${suffix}`
const committeeLeaderId = `ops-committee-leader-${suffix}`
const boardMemberId = `ops-board-member-${suffix}`
const parentId = `ops-parent-${suffix}`
const parentPersonId = `ops-parent-person-${suffix}`
const unlinkedPersonId = `ops-unlinked-person-${suffix}`
const foreignAdminId = `ops-foreign-${suffix}`
const branchId = `ops-branch-${suffix}`
const otherBranchId = `ops-other-branch-${suffix}`
const boardId = `ops-board-${suffix}`
const committeeId = `ops-committee-${suffix}`
const dualCommitteeId = `ops-dual-committee-${suffix}`
const sourceEventId = `ops-source-${suffix}`
let keySequence = 0

const accessToken = (userId: string, role: 'admin' | 'chunhiem' | 'phuta', parishId: string) => generateTokens({ userId, username: userId, role, parishId, tokenVersion: 1 }).accessToken
const adminToken = accessToken(adminId, 'admin', parishA)
const ownerToken = accessToken(ownerId, 'chunhiem', parishA)
const contributorToken = accessToken(contributorId, 'chunhiem', parishA)
const leaderToken = accessToken(leaderId, 'chunhiem', parishA)
const expiredLeaderToken = accessToken(expiredLeaderId, 'chunhiem', parishA)
const parishLeaderToken = accessToken(parishLeaderId, 'phuta', parishA)
const secretaryToken = accessToken(parishSecretaryId, 'phuta', parishA)
const parishDeputyToken = accessToken(parishDeputyId, 'phuta', parishA)
const committeeLeaderToken = accessToken(committeeLeaderId, 'phuta', parishA)
const boardMemberToken = accessToken(boardMemberId, 'phuta', parishA)
const foreignToken = accessToken(foreignAdminId, 'admin', parishB)

async function request(path: string, token: string, method = 'GET', body?: unknown, idempotencyKey?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  if (method !== 'GET' && idempotencyKey !== null) headers['Idempotency-Key'] = idempotencyKey ?? `ops-test-${suffix}-${++keySequence}`
  return operationsRouter.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

async function data(response: Response) {
  return (await response.json() as any).data
}

async function createEvent(overrides: Record<string, unknown> = {}) {
  const response = await request('/events', adminToken, 'POST', {
    title: 'Sinh hoạt Operations',
    eventType: 'MEETING',
    startsAt: '2026-10-01T08:00:00+07:00',
    endsAt: '2026-10-01T10:00:00+07:00',
    timezone: 'Asia/Ho_Chi_Minh',
    ...overrides,
  })
  expect(response.status).toBe(201)
  return data(response)
}

describe('Operations tenant, authority, OCC, idempotency and delivery boundaries', () => {
  let workstreamId = ''
  let taskId = ''
  let ownerAssignmentId = ''

  beforeAll(async () => {
    await db.insert(users).values([
      { id: adminId, username: adminId, passwordHash: 'hash', fullName: 'Operations Admin', role: 'admin', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: ownerId, username: ownerId, passwordHash: 'hash', fullName: 'Task Owner', role: 'chunhiem', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: contributorId, username: contributorId, passwordHash: 'hash', fullName: 'Contributor', role: 'chunhiem', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: leaderId, username: leaderId, passwordHash: 'hash', fullName: 'Branch Leader', role: 'chunhiem', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: expiredLeaderId, username: expiredLeaderId, passwordHash: 'hash', fullName: 'Expired Leader', role: 'chunhiem', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: parishLeaderId, username: parishLeaderId, passwordHash: 'hash', fullName: 'Parish Leader', role: 'phuta', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: parishSecretaryId, username: parishSecretaryId, passwordHash: 'hash', fullName: 'Parish Secretary', role: 'phuta', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: parishDeputyId, username: parishDeputyId, passwordHash: 'hash', fullName: 'Parish Deputy', role: 'phuta', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: committeeLeaderId, username: committeeLeaderId, passwordHash: 'hash', fullName: 'Committee Leader', role: 'phuta', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: boardMemberId, username: boardMemberId, passwordHash: 'hash', fullName: 'Board Secretary', role: 'phuta', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: parentId, username: parentId, passwordHash: 'hash', fullName: 'Parent Without Operations Access', role: 'phuhuynh', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: foreignAdminId, username: foreignAdminId, passwordHash: 'hash', fullName: 'Foreign Admin', role: 'admin', parishId: parishB, status: 'ACTIVE', tokenVersion: 1 },
    ])
    await db.insert(parishOrganizationUnits).values([
      { id: boardId, parishId: parishA, parentId: null, name: 'Ban điều hành', unitType: 'BOARD', createdBy: adminId, updatedBy: adminId },
      { id: branchId, parishId: parishA, parentId: boardId, name: 'Ngành Thiếu', unitType: 'BRANCH', createdBy: adminId, updatedBy: adminId },
      { id: otherBranchId, parishId: parishA, parentId: boardId, name: 'Ngành Nghĩa', unitType: 'BRANCH', createdBy: adminId, updatedBy: adminId },
      { id: committeeId, parishId: parishA, parentId: boardId, name: 'Ban Phụng vụ', unitType: 'COMMITTEE', createdBy: adminId, updatedBy: adminId },
      { id: dualCommitteeId, parishId: parishA, parentId: boardId, name: 'Ban Truyền thông', unitType: 'COMMITTEE', createdBy: adminId, updatedBy: adminId },
    ])
    await db.insert(parishPeople).values([
      { id: `person-leader-${suffix}`, parishId: parishA, linkedUserId: leaderId, fullName: 'Branch Leader', createdBy: adminId, updatedBy: adminId },
      { id: `person-contributor-${suffix}`, parishId: parishA, linkedUserId: contributorId, fullName: 'Deputy Branch Leader', createdBy: adminId, updatedBy: adminId },
      { id: `person-expired-${suffix}`, parishId: parishA, linkedUserId: expiredLeaderId, fullName: 'Expired Leader', createdBy: adminId, updatedBy: adminId },
      { id: `person-parish-leader-${suffix}`, parishId: parishA, linkedUserId: parishLeaderId, fullName: 'Parish Leader', createdBy: adminId, updatedBy: adminId },
      { id: `person-secretary-${suffix}`, parishId: parishA, linkedUserId: parishSecretaryId, fullName: 'Parish Secretary', createdBy: adminId, updatedBy: adminId },
      { id: `person-parish-deputy-${suffix}`, parishId: parishA, linkedUserId: parishDeputyId, fullName: 'Parish Deputy', createdBy: adminId, updatedBy: adminId },
      { id: `person-committee-leader-${suffix}`, parishId: parishA, linkedUserId: committeeLeaderId, fullName: 'Committee Leader', createdBy: adminId, updatedBy: adminId },
      { id: `person-board-member-${suffix}`, parishId: parishA, linkedUserId: boardMemberId, fullName: 'Board Secretary', createdBy: adminId, updatedBy: adminId },
      { id: parentPersonId, parishId: parishA, linkedUserId: parentId, fullName: 'Parent-linked Person', createdBy: adminId, updatedBy: adminId },
      { id: unlinkedPersonId, parishId: parishA, linkedUserId: null, fullName: 'Unlinked Operations Person', createdBy: adminId, updatedBy: adminId },
    ])
    await db.insert(parishServiceTerms).values([
      { id: `term-leader-${suffix}`, parishId: parishA, personId: `person-leader-${suffix}`, unitId: branchId, positionTitle: 'Trưởng ngành', positionCode: 'BRANCH_LEADER', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-contributor-${suffix}`, parishId: parishA, personId: `person-contributor-${suffix}`, unitId: branchId, positionTitle: 'Phó trưởng ngành', positionCode: null, startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-expired-${suffix}`, parishId: parishA, personId: `person-expired-${suffix}`, unitId: branchId, positionTitle: 'Trưởng ngành', positionCode: 'BRANCH_LEADER', startDate: '2025-01-01', endDate: '2025-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-parish-leader-${suffix}`, parishId: parishA, personId: `person-parish-leader-${suffix}`, unitId: boardId, positionTitle: 'Trưởng Xứ đoàn', positionCode: 'PARISH_LEADER', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-secretary-${suffix}`, parishId: parishA, personId: `person-secretary-${suffix}`, unitId: boardId, positionTitle: 'Thư ký', positionCode: 'PARISH_SECRETARY', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-parish-deputy-${suffix}`, parishId: parishA, personId: `person-parish-deputy-${suffix}`, unitId: boardId, positionTitle: 'Phó Xứ đoàn', positionCode: 'PARISH_DEPUTY', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-committee-leader-${suffix}`, parishId: parishA, personId: `person-committee-leader-${suffix}`, unitId: committeeId, positionTitle: 'Trưởng ban', positionCode: 'COMMITTEE_LEADER', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-board-member-${suffix}`, parishId: parishA, personId: `person-board-member-${suffix}`, unitId: boardId, positionTitle: 'Thư ký', positionCode: null, startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
    ])
    await db.insert(parishEvents).values({ id: sourceEventId, parishId: parishA, date: '2026-10-01', title: 'Lịch Trại hè', category: 'CAMP', createdBy: adminId })
  })

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishA))
    await db.delete(notifications).where(eq(notifications.parishId, parishA))
    await db.delete(operationMutationReceipts).where(eq(operationMutationReceipts.parishId, parishA))
    await db.delete(operationReminders).where(eq(operationReminders.parishId, parishA))
    await db.delete(operationBlockouts).where(eq(operationBlockouts.parishId, parishA))
    await db.delete(operationEventParticipants).where(eq(operationEventParticipants.parishId, parishA))
    await db.delete(operationEventRetrospectives).where(eq(operationEventRetrospectives.parishId, parishA))
    await db.delete(operationTaskComments).where(eq(operationTaskComments.parishId, parishA))
    await db.delete(operationChecklistItems).where(eq(operationChecklistItems.parishId, parishA))
    await db.delete(operationTaskDependencies).where(eq(operationTaskDependencies.parishId, parishA))
    await db.delete(operationTaskDispatches).where(eq(operationTaskDispatches.parishId, parishA))
    await db.delete(operationTaskAssignees).where(eq(operationTaskAssignees.parishId, parishA))
    await db.delete(operationTasks).where(eq(operationTasks.parishId, parishA))
    await db.delete(operationWorkstreamMembers).where(eq(operationWorkstreamMembers.parishId, parishA))
    await db.delete(operationWorkstreams).where(eq(operationWorkstreams.parishId, parishA))
    await db.delete(parishRecords).where(eq(parishRecords.parishId, parishA))
    await db.delete(operationEvents).where(and(eq(operationEvents.parishId, parishA), sql`${operationEvents.sourceTemplateId} IS NOT NULL`))
    await db.delete(operationEventTemplateVersions).where(eq(operationEventTemplateVersions.parishId, parishA))
    await db.delete(operationEventTemplates).where(eq(operationEventTemplates.parishId, parishA))
    await db.delete(operationEvents).where(eq(operationEvents.parishId, parishA))
    await db.delete(parishServiceTerms).where(eq(parishServiceTerms.parishId, parishA))
    await db.delete(parishPeople).where(eq(parishPeople.parishId, parishA))
    await db.delete(parishOrganizationUnits).where(eq(parishOrganizationUnits.parishId, parishA))
    await db.delete(parishEvents).where(eq(parishEvents.parishId, parishA))
    await db.delete(users).where(eq(users.parishId, parishA))
    await db.delete(users).where(eq(users.parishId, parishB))
  })

  it('requires mutation keys and replays the same command without duplicate effects', async () => {
    const missing = await request('/workstreams', adminToken, 'POST', { name: 'Ban Phụng vụ' }, null)
    expect(missing.status).toBe(400)
    expect((await missing.json() as any).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')

    const stableKey = `stable-workstream-${suffix}`
    const created = await request('/workstreams', adminToken, 'POST', { name: 'Ban Phụng vụ', sourceUnitId: branchId, isRequired: true }, stableKey)
    expect(created.status).toBe(201)
    workstreamId = (await data(created)).id
    const replay = await request('/workstreams', adminToken, 'POST', { name: 'Ban Phụng vụ', sourceUnitId: branchId, isRequired: true }, stableKey)
    expect(replay.status).toBe(200)
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true')
    expect((await data(replay)).id).toBe(workstreamId)
    const conflict = await request('/workstreams', adminToken, 'POST', { name: 'Payload khác', sourceUnitId: branchId }, stableKey)
    expect(conflict.status).toBe(409)

    await db.update(operationMutationReceipts).set({ createdAt: '2020-01-01T00:00:00.000Z' }).where(and(
      eq(operationMutationReceipts.parishId, parishA),
      eq(operationMutationReceipts.actorUserId, adminId),
      eq(operationMutationReceipts.idempotencyKey, stableKey),
    ))
    expect(await compactOperationsMutationReceiptResponses(new Date('2021-01-01T00:00:00.000Z'), 10)).toBe(1)
    const expiredReplay = await request('/workstreams', adminToken, 'POST', { name: 'Ban Phụng vụ', sourceUnitId: branchId, isRequired: true }, stableKey)
    expect(expiredReplay.status).toBe(409)
    expect((await expiredReplay.json() as any).error.code).toBe('IDEMPOTENCY_REPLAY_EXPIRED')
    const [receiptTombstone] = await db.select().from(operationMutationReceipts).where(and(
      eq(operationMutationReceipts.parishId, parishA),
      eq(operationMutationReceipts.actorUserId, adminId),
      eq(operationMutationReceipts.idempotencyKey, stableKey),
    ))
    expect(receiptTombstone.requestHash).toHaveLength(64)
    expect(receiptTombstone.responsePrunedAt).toBeTruthy()
    expect(receiptTombstone.responseJson).toBe('{"receiptResponsePruned":true}')

    const task = await request('/tasks', adminToken, 'POST', { title: 'Chuẩn bị nghi thức', workstreamId, priority: 'HIGH' })
    expect(task.status).toBe(201)
    taskId = (await data(task)).id
    const paginationSentinel = await request('/tasks', adminToken, 'POST', { title: 'Pagination sentinel', workstreamId })
    expect(paginationSentinel.status).toBe(201)

    const page = await request('/tasks?page=1&limit=1', adminToken)
    const pageBody = await page.json() as any
    expect(page.status).toBe(200)
    expect(pageBody.data).toHaveLength(1)
    expect(pageBody.meta).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 })
    const secondPageBody = await (await request('/tasks?page=2&limit=1', adminToken)).json() as any
    expect(secondPageBody.data).toHaveLength(1)
    expect(secondPageBody.data[0].id).not.toBe(pageBody.data[0].id)
    const otherWorkstream = await data(await request('/workstreams', adminToken, 'POST', { name: 'Nhóm khác', sourceUnitId: branchId }))
    const otherTask = await data(await request('/tasks', adminToken, 'POST', { title: 'Task nhóm khác', workstreamId: otherWorkstream.id }))
    const filtered = await request(`/tasks?workstreamId=${workstreamId}&page=1&limit=1`, adminToken)
    const filteredBody = await filtered.json() as any
    expect(filteredBody.meta).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 })
    expect(filteredBody.data).toHaveLength(1)
    expect(filteredBody.data[0].workstreamId).toBe(workstreamId)
    const otherFiltered = await data(await request(`/tasks?workstreamId=${otherWorkstream.id}`, adminToken))
    expect(otherFiltered).toEqual([expect.objectContaining({ id: otherTask.id, workstreamId: otherWorkstream.id })])
    const foreignFiltered = await request(`/tasks?workstreamId=${workstreamId}`, foreignToken)
    expect((await foreignFiltered.json() as any).meta.total).toBe(0)
    expect((await request('/tasks?limit=501', adminToken)).status).toBe(400)
  })

  it('W2.13: pushes q/status/scope filters into GET /events before authz and pagination', async () => {
    const unique = `W213-${suffix}`
    const matchA = await createEvent({ title: `${unique} Trại hè`, location: `Rừng ${unique}`, startsAt: '2027-01-01T08:00:00+07:00', endsAt: '2027-01-01T16:00:00+07:00' })
    const matchB = await createEvent({ title: `Họp ${unique}`, location: `Hoa viên ${unique}`, scopeUnitId: branchId, startsAt: '2027-01-02T08:00:00+07:00', endsAt: '2027-01-02T10:00:00+07:00' })
    const noMatch = await createEvent({ title: 'Không liên quan W213-zzz', location: 'Không liên quan W213-zzz', startsAt: '2027-01-03T08:00:00+07:00', endsAt: '2027-01-03T10:00:00+07:00' })

    // Title and location both match; DRAFT is still visible to admin (viewer rule).
    const body = await (await request(`/events?q=${encodeURIComponent(unique)}`, adminToken)).json() as any
    expect(body.data.map((row: any) => row.id).sort()).toEqual([matchA.id, matchB.id].sort())
    expect(body.meta).toMatchObject({ page: 1, total: 2 })

    // Location-only match.
    const locationOnly = await (await request(`/events?q=${encodeURIComponent('Rừng ' + unique)}`, adminToken)).json() as any
    expect(locationOnly.data.map((row: any) => row.id)).toEqual([matchA.id])

    // status filter narrows the same base set (created events are DRAFT).
    const draftFiltered = await (await request(`/events?q=${encodeURIComponent(unique)}&status=DRAFT`, adminToken)).json() as any
    expect(draftFiltered.meta.total).toBe(2)
    const planningFiltered = await (await request(`/events?q=${encodeURIComponent(unique)}&status=PLANNING`, adminToken)).json() as any
    expect(planningFiltered.meta.total).toBe(0)
    await request(`/events/${matchA.id}/transition`, adminToken, 'POST', { version: matchA.version, status: 'PLANNING' })
    const planningNow = await (await request(`/events?q=${encodeURIComponent(unique)}&status=PLANNING`, adminToken)).json() as any
    expect(planningNow.data.map((row: any) => row.id)).toEqual([matchA.id])

    // scope=XU_DOAN means scopeUnitId NULL; UNIT the opposite.
    const xuDoan = await (await request(`/events?q=${encodeURIComponent(unique)}&scope=XU_DOAN`, adminToken)).json() as any
    expect(xuDoan.data.map((row: any) => row.id)).toEqual([matchA.id])
    const unit = await (await request(`/events?q=${encodeURIComponent(unique)}&scope=UNIT`, adminToken)).json() as any
    expect(unit.data.map((row: any) => row.id)).toEqual([matchB.id])

    // Pagination respects the filtered set (total stays 2 for the base query).
    const page2 = await (await request(`/events?q=${encodeURIComponent(unique)}&page=2&limit=1`, adminToken)).json() as any
    expect(page2.data).toHaveLength(1)
    expect(page2.meta).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 })
    expect([page2.data[0].id]).not.toEqual([noMatch.id])

    // Cross-tenant filter stays fail-closed.
    const foreign = await (await request(`/events?q=${encodeURIComponent(unique)}`, foreignToken)).json() as any
    expect(foreign.meta.total).toBe(0)
    // Invalid enum values reject instead of silently ignoring the filter.
    expect((await request('/events?status=NOT_A_STATUS', adminToken)).status).toBe(400)
    expect((await request('/events?scope=OTHER', adminToken)).status).toBe(400)
  })

  it('supports multiple assignees while keeping OWNER unique and personal actions role-bound', async () => {
    const parentTarget = await request(`/tasks/${taskId}/assign`, adminToken, 'POST', { version: 1, userId: parentId, assignmentRole: 'CONTRIBUTOR' })
    expect(parentTarget.status).toBe(400)
    expect((await parentTarget.json() as any).error.code).toBe('INVALID_OPERATIONS_TARGET')
    const parentPersonTarget = await request(`/tasks/${taskId}/assign`, adminToken, 'POST', { version: 1, personId: parentPersonId, assignmentRole: 'CONTRIBUTOR' })
    expect(parentPersonTarget.status).toBe(400)
    expect((await parentPersonTarget.json() as any).error.code).toBe('INVALID_OPERATIONS_TARGET')

    const owner = await request(`/tasks/${taskId}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' })
    expect(owner.status).toBe(201)
    const ownerResult = await data(owner)
    ownerAssignmentId = ownerResult.assignment.id
    expect(ownerResult.taskVersion).toBe(2)

    const contributor = await request(`/tasks/${taskId}/assign`, adminToken, 'POST', { version: 2, userId: contributorId, assignmentRole: 'CONTRIBUTOR' })
    expect(contributor.status).toBe(201)
    const contributorResult = await data(contributor)
    expect(contributorResult.taskVersion).toBe(3)

    const watcher = await request(`/tasks/${taskId}/assign`, adminToken, 'POST', { version: 3, userId: committeeLeaderId, assignmentRole: 'CONTRIBUTOR' })
    expect(watcher.status).toBe(201)
    expect((await data(watcher)).taskVersion).toBe(4)

    const duplicateOwner = await request(`/tasks/${taskId}/assign`, adminToken, 'POST', { version: 4, userId: leaderId, assignmentRole: 'OWNER' })
    expect(duplicateOwner.status).toBe(409)
    const adminExecute = await request(`/tasks/${taskId}/transition`, adminToken, 'POST', { version: 4, status: 'IN_PROGRESS' })
    expect(adminExecute.status).toBe(403)
    const watcherExecute = await request(`/tasks/${taskId}/transition`, committeeLeaderToken, 'POST', { version: 4, status: 'IN_PROGRESS' })
    expect(watcherExecute.status).toBe(403)
    const pendingContributorExecute = await request(`/tasks/${taskId}/transition`, contributorToken, 'POST', { version: 4, status: 'IN_PROGRESS' })
    expect(pendingContributorExecute.status).toBe(403)

    const accepted = await request(`/tasks/${taskId}/acknowledge`, ownerToken, 'POST', { assignmentId: ownerAssignmentId, version: 1, status: 'ACCEPTED' })
    expect(accepted.status).toBe(200)
    const contributorAccepted = await request(`/tasks/${taskId}/acknowledge`, contributorToken, 'POST', { assignmentId: contributorResult.assignment.id, version: 1, status: 'ACCEPTED' })
    expect(contributorAccepted.status).toBe(200)
    const started = await request(`/tasks/${taskId}/transition`, contributorToken, 'POST', { version: 4, status: 'IN_PROGRESS' })
    expect(started.status).toBe(200)
    const contributorDeclined = await request(`/tasks/${taskId}/acknowledge`, contributorToken, 'POST', { assignmentId: contributorResult.assignment.id, version: 2, status: 'DECLINED', note: 'Không thể tiếp tục' })
    expect(contributorDeclined.status).toBe(200)
    const declinedContributorExecute = await request(`/tasks/${taskId}/transition`, contributorToken, 'POST', { version: 5, status: 'BLOCKED', blockedReason: 'Thiếu người thực hiện' })
    expect(declinedContributorExecute.status).toBe(403)
  })

  it.each(['EVENT_ORGANIZER', 'WORKSTREAM_LEAD'])('composes %s with accepted personal task roles without implicit execution rights', async managementRole => {
    const event = await createEvent(managementRole === 'EVENT_ORGANIZER' ? { organizerUserId: ownerId } : {})
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { eventId: event.id, name: 'Combined roles' }))
    if (managementRole === 'WORKSTREAM_LEAD') {
      expect((await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', { version: 1, userId: ownerId, operationRole: managementRole })).status).toBe(201)
    }
    await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    const workstreamPermissions = (await data(await request(`/workstreams/${workstream.id}`, ownerToken))).permissions
    // Target Authorization Model (BUSINESS_RULES rule 18): EVENT_CREATOR /
    // EVENT_ORGANIZER / WORKSTREAM_LEAD manage content but never auto-delegate —
    // assign_lead comes only from unit-leader position scope (or admin override).
    expect(workstreamPermissions['operations.workstream.assign_lead']).toBe(false)
    const task = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, workstreamId: workstream.id, title: 'Combined role task' }))
    const permissions = async () => (await data(await request(`/tasks/${task.id}`, ownerToken))).permissions
    expect(await permissions()).toMatchObject({ 'operations.task.execute': false })
    const assigned = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    expect((await permissions())['operations.task.execute']).toBe(false)
    expect((await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: assigned.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    expect((await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: assigned.taskVersion, status: 'IN_PROGRESS' })).status).toBe(200)
  })

  it('reads workstream membership in resource scope and excludes revoked memberships', async () => {
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { name: 'Private workstream', sourceUnitId: branchId }))
    expect((await request(`/workstreams/${workstream.id}`, foreignToken)).status).toBe(403)
    expect((await request(`/workstreams/${workstream.id}`, ownerToken)).status).toBe(403)
    // Field lead must be the unit leader; the lead sees the workstream through
    // the membership (and their position), and revoking removes the membership.
    const member = await data(await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', { version: 1, userId: leaderId, operationRole: 'WORKSTREAM_LEAD' }))
    const detail = await data(await request(`/workstreams/${workstream.id}`, leaderToken))
    expect(detail.workstream.id).toBe(workstream.id)
    expect(detail.members.map((row: { id: string }) => row.id)).toEqual([member.id])
    expect(detail.permissions['operations.workstream.manage']).toBe(true)
    expect(detail.permissions['operations.task.execute']).toBe(false)
    expect((await request(`/workstreams/${workstream.id}/members/${member.id}/remove`, adminToken, 'POST', { version: 2, memberVersion: 1, reason: 'Kết thúc phân công' })).status).toBe(200)
    expect((await data(await request(`/workstreams/${workstream.id}`, adminToken))).members).toEqual([])
  })

  it('deletes workstream cleanly when empty, and rejects deletion when active tasks exist', async () => {
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { name: 'Mảng thử nghiệm xóa', sourceUnitId: branchId }))
    // Deleting with version mismatch fails with 409
    expect((await request(`/workstreams/${workstream.id}`, adminToken, 'DELETE', { version: 999 })).status).toBe(409)

    // Creating an active task under this workstream blocks deletion
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Việc trong mảng', workstreamId: workstream.id }))
    const blockedDelete = await request(`/workstreams/${workstream.id}`, adminToken, 'DELETE', { version: 1 })
    const blockedJson = await blockedDelete.json() as any
    expect(blockedJson.error.code).toBe('WORKSTREAM_NOT_EMPTY')
    expect(blockedJson.error.message).toContain('nhiệm vụ đang thực hiện')

    // Cancelling the task unblocks deletion
    const assigned = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: assigned.assignment.id, version: 1, status: 'ACCEPTED' })
    const cancelled = await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: assigned.taskVersion, status: 'CANCELLED', cancellationReason: 'Không cần nữa' })
    expect(cancelled.status).toBe(200)

    const deleteRes = await request(`/workstreams/${workstream.id}`, adminToken, 'DELETE', { version: 1 })
    expect(deleteRes.status).toBe(200)

    // The workstream is soft-deleted and inaccessible
    const [deletedRow] = await db.select().from(operationWorkstreams).where(and(eq(operationWorkstreams.parishId, parishA), eq(operationWorkstreams.id, workstream.id)))
    expect(deletedRow?.deletedAt).toBeTruthy()
    const listRes = await data(await request('/workstreams?limit=100', adminToken))
    expect(listRes.some((w: any) => w.id === workstream.id)).toBe(false)
  })

  it('reopens acknowledgement when task content changes, but not for scheduling metadata', async () => {
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Review content' }))
    const owner = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    const contributor = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: owner.taskVersion, userId: contributorId, assignmentRole: 'CONTRIBUTOR' }))
    await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: owner.assignment.id, version: 1, status: 'ACCEPTED' })
    await request(`/tasks/${task.id}/acknowledge`, contributorToken, 'POST', { assignmentId: contributor.assignment.id, version: 1, status: 'ACCEPTED' })
    const rescheduled = await data(await request(`/tasks/${task.id}`, adminToken, 'PUT', { version: contributor.taskVersion, priority: 'HIGH' }))
    expect(rescheduled).toMatchObject({ acknowledgementReset: false, resetAssignments: [] })
    const changed = await data(await request(`/tasks/${task.id}`, adminToken, 'PUT', { version: rescheduled.task.version, description: 'Different deliverable' }))
    expect(changed.acknowledgementReset).toBe(true)
    expect(changed.resetAssignments.map((row: { id: string }) => row.id).sort()).toEqual([owner.assignment.id, contributor.assignment.id].sort())
    expect((await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: owner.assignment.id, version: 3, status: 'ACCEPTED' })).status).toBe(200)
    expect((await request(`/tasks/${task.id}/acknowledge`, contributorToken, 'POST', { assignmentId: contributor.assignment.id, version: 3, status: 'ACCEPTED' })).status).toBe(200)
    const checklist = await data(await request(`/tasks/${task.id}/checklist`, adminToken, 'POST', { version: changed.task.version, label: 'New required evidence', isRequired: true }))
    expect(checklist.taskVersion).toBe(changed.task.version + 1)
    const toggled = await data(await request(`/tasks/${task.id}/checklist/${checklist.item.id}`, ownerToken, 'POST', { version: checklist.taskVersion, isDone: true }))
    // No approval gate remains: a fully evidenced task completes.
    const done = await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: toggled.taskVersion, status: 'DONE' })
    expect(done.status).toBe(200)
    expect((await data(done)).status).toBe('DONE')
  })

  it('serializes overlapping required-checklist toggles through task OCC', async () => {
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Concurrent checklist' }))
    const owner = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: owner.assignment.id, version: 1, status: 'ACCEPTED' })
    const checklist = await data(await request(`/tasks/${task.id}/checklist`, adminToken, 'POST', { version: owner.taskVersion, label: 'Bằng chứng', isRequired: true }))
    // Two overlapping toggles off the same base version: exactly one commits.
    const first = await request(`/tasks/${task.id}/checklist/${checklist.item.id}`, ownerToken, 'POST', { version: checklist.taskVersion, isDone: true })
    const second = await request(`/tasks/${task.id}/checklist/${checklist.item.id}`, ownerToken, 'POST', { version: checklist.taskVersion, isDone: true })
    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    expect(((await second.json()) as any).error.code).toBe('VERSION_CONFLICT')
    const final = await data(await request(`/tasks/${task.id}`, adminToken))
    expect(final.task).toMatchObject({ version: checklist.taskVersion + 1 })
    expect(final.checklist).toEqual(expect.arrayContaining([expect.objectContaining({ id: checklist.item.id, isDone: true })]))
  })

  it('classifies task updates server-side: deadline/shift changes reopen acknowledgement, priority and no-ops do not', async () => {
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Báo cáo hậu cần', dueAt: '2026-10-01T00:00:00Z' }))
    const assigned = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    const assignmentId = assigned.assignment.id
    expect((await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    // Priority is explicitly not important: the acceptance survives.
    const priorityOnly = await data(await request(`/tasks/${task.id}`, adminToken, 'PUT', { version: assigned.taskVersion, priority: 'HIGH' }))
    expect(priorityOnly).toMatchObject({ acknowledgementReset: false, resetAssignments: [] })
    // A deadline change reopens the acknowledgement obligation server-side.
    const rescheduled = await data(await request(`/tasks/${task.id}`, adminToken, 'PUT', { version: priorityOnly.task.version, dueAt: '2026-10-02T00:00:00Z' }))
    expect(rescheduled).toMatchObject({ acknowledgementReset: true, resetAssignments: [{ id: assignmentId }] })
    const [resetRow] = await db.select().from(operationTaskAssignees).where(eq(operationTaskAssignees.id, assignmentId))
    expect(resetRow).toMatchObject({ acknowledgementStatus: 'PENDING', respondedAt: null, version: 3 })
    // Repeating the same values is a no-op and never resets again.
    const same = await data(await request(`/tasks/${task.id}`, adminToken, 'PUT', { version: rescheduled.task.version, dueAt: '2026-10-02T00:00:00Z' }))
    expect(same).toMatchObject({ acknowledgementReset: false, resetAssignments: [] })
    // The audit trail records the server verdict.
    const updateAudits = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.action, 'UPDATE'), eq(auditLogs.entityId, task.id)))
    expect(updateAudits.some(row => row.newValue?.includes('"acknowledgementReset":true'))).toBe(true)
    expect(updateAudits.some(row => row.newValue?.includes('"acknowledgementReset":false'))).toBe(true)
  })

  it('nudges event managers once per parish day only when preparation acceptance is complete', async () => {
    const event = await createEvent({ title: 'Nhắc chuyển chuẩn bị' })
    await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Chuẩn bị sân khấu', eventId: event.id, isRequired: true }))
    const assigned = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: contributorId, assignmentRole: 'OWNER' }))
    // Isolation: earlier tests in this file may leave their own eligible PLANNING events;
    // assert deltas scoped to this event instead of global parish counts.
    const managerReminders = () => db.select().from(operationReminders).where(and(eq(operationReminders.parishId, parishA), eq(operationReminders.kind, 'MANAGER_PREP'), eq(operationReminders.eventId, event.id)))
    const knownIds = new Set((await managerReminders()).map(row => row.id))
    const newForEvent = async () => (await managerReminders()).filter(row => !knownIds.has(row.id))
    // Owner has not accepted yet: not eligible, nothing is created for this event.
    await processDueManagerPrepReminders(new Date('2026-10-01T09:00:00+07:00'))
    expect(await newForEvent()).toHaveLength(0)
    // Owner accepts: eligible, managers (creator + auto-assigned Xứ đoàn trưởng organizer) each get exactly one daily reminder.
    expect((await request(`/tasks/${task.id}/acknowledge`, contributorToken, 'POST', { assignmentId: assigned.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    await processDueManagerPrepReminders(new Date('2026-10-01T09:05:00+07:00'))
    const first = await newForEvent()
    expect(first).toHaveLength(2)
    expect(first.map(row => row.recipientUserId).sort()).toEqual([adminId, parishLeaderId].sort())
    expect(first[0]).toMatchObject({ eventId: event.id, status: 'ENQUEUED' })
    expect(await db.select().from(notifications).where(eq(notifications.parishId, parishA))).toContainEqual(expect.objectContaining({ id: `NOT-${first[0].id}`, status: 'retrying' }))
    for (const row of first) knownIds.add(row.id)
    // Same parish day: the dedupe key holds and nothing new is created.
    await processDueManagerPrepReminders(new Date('2026-10-01T15:00:00+07:00'))
    expect(await newForEvent()).toHaveLength(0)
    // Next parish day: the daily cadence produces fresh reminders (one per manager).
    await processDueManagerPrepReminders(new Date('2026-10-02T09:00:00+07:00'))
    expect(await newForEvent()).toHaveLength(2)
    for (const row of await newForEvent()) knownIds.add(row.id)
    // Leaving PLANNING stops the nudges entirely.
    const detail = await data(await request(`/events/${event.id}`, adminToken))
    await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: detail.event.version, status: 'PREPARING' })
    await processDueManagerPrepReminders(new Date('2026-10-03T09:00:00+07:00'))
    expect(await newForEvent()).toHaveLength(0)
  })

  it('fails closed across parishes and for unscoped staff', async () => {
    const foreignList = await request('/tasks', foreignToken)
    expect(foreignList.status).toBe(200)
    expect(await data(foreignList)).toEqual([])
    const unscoped = await request('/tasks', ownerToken, 'POST', { title: 'Unscoped task' })
    expect(unscoped.status).toBe(403)
  })

  it.each(['EXECUTION', 'FOLLOW_UP'])('allows accepted %s work at start but requires completion at closure', async phase => {
    const event = await createEvent({ title: `Phase ${phase}` })
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'During or after', eventId: event.id, phase, isRequired: true }))
    expect(task.phase).toBe(phase)
    const assignment = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    let current = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: 1, status: 'PLANNING' }))
    expect((await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status: 'READY' })).status).toBe(409)
    const pendingAcceptance = await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status: 'PREPARING' })
    expect(pendingAcceptance.status).toBe(409)
    expect((await pendingAcceptance.json() as any).error.code).toBe('TASK_ACCEPTANCE_PENDING')
    await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: assignment.assignment.id, version: 1, status: 'ACCEPTED' })
    for (const status of ['PREPARING', 'READY', 'LIVE']) {
      const result = await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status })
      expect(result.status).toBe(200); current = await data(result)
    }
    expect((await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status: 'COMPLETED', outcomeSummary: 'Not finished' })).status).toBe(409)
    expect((await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: assignment.taskVersion, status: 'DONE' })).status).toBe(200)
    expect((await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status: 'COMPLETED', outcomeSummary: 'Finished' })).status).toBe(200)
    expect((await request(`/events/${event.id}/retrospective`, adminToken, 'PUT', { expectedVersion: null, lessonsLearned: `Hậu kiểm ${phase}` })).status).toBe(200)
  })

  it('blocks event closure on required unfinished tasks even with readiness override', async () => {
    const event = await createEvent({ title: 'Closure guard' })
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Required follow-through', eventId: event.id, isRequired: true }))
    let current = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: 1, status: 'PLANNING' }))
    for (const status of ['PREPARING', 'READY', 'LIVE']) current = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status, override: true, reason: 'Start with managed exception' }))
    const response = await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status: 'COMPLETED', outcomeSummary: 'Summary cannot replace required work', override: true, reason: 'Not a closure permission' })
    expect(response.status).toBe(409)
    expect((await response.json() as any).error.code).toBe('COMPLETION_BLOCKED')
    const latest = await data(await request(`/events/${event.id}`, adminToken))
    expect(latest.event.status).toBe('LIVE')
    expect(latest.tasks.some((row: any) => row.id === task.id && row.status === 'TODO')).toBe(true)
  })

  it('hands over OWNER atomically with OCC, authority and replay protection', async () => {
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Atomic handover', dueAt: '2027-02-01T09:00:00Z' }))
    const blockout = await data(await request('/blockouts', contributorToken, 'POST', { personId: `person-contributor-${suffix}`, startsAt: '2027-02-01T08:00:00Z', endsAt: '2027-02-01T10:00:00Z', reason: 'Private handover conflict' }))
    const first = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    const body = { version: first.taskVersion, assignmentId: first.assignment.id, assignmentVersion: 1, userId: contributorId, reason: 'Đổi lịch phục vụ' }
    expect((await request(`/tasks/${task.id}/handover`, ownerToken, 'POST', body)).status).toBe(403)
    expect((await request(`/tasks/${task.id}/handover`, foreignToken, 'POST', body)).status).toBe(403)
    expect((await request(`/tasks/${task.id}/handover`, adminToken, 'POST', { ...body, userId: 'missing-user' })).status).toBeGreaterThanOrEqual(400)
    const unchanged = await data(await request(`/tasks/${task.id}`, adminToken))
    expect(unchanged.assignees.filter((row: any) => row.assignmentRole === 'OWNER')).toHaveLength(1)
    expect(unchanged.assignees[0].id).toBe(first.assignment.id)
    const key = `handover-${suffix}`
    const changed = await data(await request(`/tasks/${task.id}/handover`, adminToken, 'POST', body, key))
    expect(changed.assignment).toMatchObject({ userId: contributorId, acknowledgementStatus: 'PENDING' })
    expect(changed.taskVersion).toBe(first.taskVersion + 1)
    expect(changed.conflictWarnings).toEqual([{ id: blockout.id, startsAt: '2027-02-01T08:00:00.000Z', endsAt: '2027-02-01T10:00:00.000Z' }])
    expect(JSON.stringify(changed.conflictWarnings)).not.toContain('Private handover conflict')
    const replay = await data(await request(`/tasks/${task.id}/handover`, adminToken, 'POST', body, key))
    expect(replay.assignment.id).toBe(changed.assignment.id)
    expect(replay.conflictWarnings).toEqual(changed.conflictWarnings)
    expect((await request(`/tasks/${task.id}/handover`, adminToken, 'POST', { ...body, assignmentId: changed.assignment.id })).status).toBe(409)
    const current = await data(await request(`/tasks/${task.id}`, adminToken))
    expect(current.assignees.filter((row: any) => row.assignmentRole === 'OWNER')).toHaveLength(1)
    expect(current.assignees[0].id).toBe(changed.assignment.id)
    expect((await request(`/tasks/${task.id}/handover`, adminToken, 'POST', { version: changed.taskVersion, assignmentId: changed.assignment.id, assignmentVersion: 1, personId: `person-contributor-${suffix}`, reason: 'Same person alias' })).status).toBe(409)
    const afterAlias = await data(await request(`/tasks/${task.id}`, adminToken))
    expect(afterAlias.task.version).toBe(changed.taskVersion)
    expect(afterAlias.assignees[0].id).toBe(changed.assignment.id)
  })

  it('keeps blockout reasons private and supports self edit/revoke with OCC', async () => {
    const created = await data(await request('/blockouts', contributorToken, 'POST', {
      userId: contributorId, startsAt: '2027-03-01T08:00:00Z', endsAt: '2027-03-01T10:00:00Z', reason: 'Việc gia đình riêng tư',
    }))
    expect(created.version).toBe(1)
    const mine = await data(await request('/blockouts/mine?limit=500', contributorToken))
    expect(mine.find((row: any) => row.id === created.id)).toMatchObject({ reason: 'Việc gia đình riêng tư', version: 1 })
    expect((await data(await request('/blockouts/mine?limit=500', adminToken))).some((row: any) => row.id === created.id)).toBe(false)
    expect((await request(`/blockouts/${created.id}`, adminToken, 'PUT', {
      version: 1, startsAt: '2027-03-01T09:00:00Z', endsAt: '2027-03-01T11:00:00Z', reason: 'Admin không được đọc/sửa lý do',
    })).status).toBe(404)

    const changed = await data(await request(`/blockouts/${created.id}`, contributorToken, 'PUT', {
      version: 1, startsAt: '2027-03-01T09:00:00Z', endsAt: '2027-03-01T11:00:00Z', reason: 'Lịch riêng đã đổi',
    }))
    expect(changed).toMatchObject({ id: created.id, startsAt: '2027-03-01T09:00:00.000Z', endsAt: '2027-03-01T11:00:00.000Z', reason: 'Lịch riêng đã đổi', version: 2 })
    expect((await request(`/blockouts/${created.id}`, contributorToken, 'PUT', {
      version: 1, startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T12:00:00Z', reason: null,
    })).status).toBe(409)
    const revoked = await data(await request(`/blockouts/${created.id}/revoke`, contributorToken, 'POST', { version: 2 }))
    expect(revoked).toMatchObject({ id: created.id, version: 3 })
    expect(revoked.deletedAt).toBeTruthy()
    expect((await data(await request('/blockouts/mine?limit=500', contributorToken))).some((row: any) => row.id === created.id)).toBe(false)
    expect((await request(`/blockouts/${created.id}/revoke`, contributorToken, 'POST', { version: 2 })).status).toBe(404)

    const auditRows = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.entityId, created.id)))
    expect(JSON.stringify(auditRows)).not.toContain('Việc gia đình riêng tư')
    expect(JSON.stringify(auditRows)).not.toContain('Lịch riêng đã đổi')
  })

  it('derives Trưởng ngành authority from active service-term unit scope only', async () => {
    const leaderUnits = await data(await request('/units?limit=500', leaderToken))
    expect(leaderUnits.map((unit: any) => unit.id)).toEqual([branchId])
    expect(Object.keys(leaderUnits[0]).sort()).toEqual(['id', 'name', 'parentId', 'parishId', 'unitType'].sort())
    expect((await data(await request('/units?limit=500', committeeLeaderToken))).map((unit: any) => unit.id)).toEqual([committeeId])
    // Target model (rule 18): /units lists units where the caller holds
    // workstream.create. The parish leader holds no unit scope (Xu Doan scope
    // only), so the list is empty for them.
    expect((await data(await request('/units?limit=500', parishLeaderToken))).map((unit: any) => unit.id)).toEqual([])
    const missingStandaloneScope = await request('/workstreams', adminToken, 'POST', { name: 'Nhóm không có đơn vị' })
    expect(missingStandaloneScope.status).toBe(400)
    expect((await missingStandaloneScope.json() as any).error.code).toBe('STANDALONE_WORKSTREAM_SCOPE_REQUIRED')
    const standalone = await data(await request('/workstreams', leaderToken, 'POST', { sourceUnitId: branchId, name: 'Nhóm thường trực Ngành Thiếu' }))
    expect(standalone).toMatchObject({ operationEventId: null, sourceUnitId: branchId })
    expect((await request('/workstreams', leaderToken, 'POST', { sourceUnitId: otherBranchId, name: 'Nhóm ngoài ngành' })).status).toBe(403)
    const standaloneList = await data(await request('/workstreams?standalone=true&limit=500', leaderToken))
    expect(standaloneList).toEqual(expect.arrayContaining([expect.objectContaining({ id: standalone.id, operationEventId: null, sourceUnitId: branchId })]))
    expect(standaloneList.every((group: any) => group.operationEventId === null)).toBe(true)

    const inScope = await request('/events', leaderToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Sinh hoạt Ngành Thiếu', eventType: 'MEETING', startsAt: '2026-10-03T08:00:00+07:00', endsAt: '2026-10-03T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(inScope.status).toBe(201)
    const inScopeRow = await data(inScope)
    expect(inScopeRow.startsAt).toBe('2026-10-03T01:00:00.000Z')
    expect(inScopeRow.endsAt).toBe('2026-10-03T03:00:00.000Z')
    const outside = await request('/events', leaderToken, 'POST', {
      scopeUnitId: otherBranchId,
      title: 'Ngoài phạm vi', eventType: 'MEETING', startsAt: '2026-10-04T08:00:00+07:00', endsAt: '2026-10-04T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(outside.status).toBe(403)
    expect((await request(`/events/${inScopeRow.id}`, leaderToken, 'PUT', { version: 1, scopeUnitId: otherBranchId })).status).toBe(403)
    const scopedWorkstream = await data(await request('/workstreams', leaderToken, 'POST', {
      eventId: inScopeRow.id, sourceUnitId: branchId, name: 'Workstream trong ngành',
    }))
    expect((await request(`/workstreams/${scopedWorkstream.id}`, leaderToken, 'PUT', { version: 1, sourceUnitId: otherBranchId })).status).toBe(403)
    const organizerEvent = await createEvent({ title: 'Event organizer scope', scopeUnitId: branchId, organizerUserId: ownerId })
    await data(await request(`/events/${organizerEvent.id}/transition`, adminToken, 'POST', { version: organizerEvent.version, status: 'PLANNING' }))
    expect((await request('/workstreams', ownerToken, 'POST', { eventId: organizerEvent.id, sourceUnitId: branchId, name: 'Trong scope event' })).status).toBe(201)
    expect((await request('/workstreams', ownerToken, 'POST', { eventId: organizerEvent.id, sourceUnitId: otherBranchId, name: 'Không được mở rộng scope' })).status).toBe(403)
    const expired = await request('/events', expiredLeaderToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Nhiệm kỳ hết hạn', eventType: 'MEETING', startsAt: '2026-10-05T08:00:00+07:00', endsAt: '2026-10-05T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(expired.status).toBe(403)
    const deputy = await request('/events', contributorToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Phó trưởng không mặc nhiên có quyền trưởng ngành', eventType: 'MEETING', startsAt: '2026-10-05T08:00:00+07:00', endsAt: '2026-10-05T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(deputy.status).toBe(403)
    const boardMember = await request('/events', boardMemberToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Thành viên Ban Điều hành không phải Trưởng Xứ đoàn', eventType: 'MEETING', startsAt: '2026-10-05T08:00:00+07:00', endsAt: '2026-10-05T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(boardMember.status).toBe(403)
    expect((await request(`/events/${inScopeRow.id}`, boardMemberToken)).status).toBe(403)
    expect((await data(await request('/events', boardMemberToken))).map((event: any) => event.id)).not.toContain(inScopeRow.id)
  })

  it('keeps another creator draft private across event, task and list reads until planning', async () => {
    const createdResponse = await request('/events', leaderToken, 'POST', {
      scopeUnitId: branchId,
      organizerUserId: leaderId,
      title: 'Bản nháp riêng của Trưởng ngành',
      eventType: 'MEETING',
      startsAt: '2026-10-08T08:00:00+07:00',
      endsAt: '2026-10-08T10:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(createdResponse.status).toBe(201)
    const event = await data(createdResponse)
    const task = await data(await request('/tasks', leaderToken, 'POST', { eventId: event.id, title: 'Phân công kín trong nháp' }))
    await data(await request(`/tasks/${task.id}/assign`, leaderToken, 'POST', { version: task.version, userId: contributorId, assignmentRole: 'OWNER' }))

    expect((await request(`/events/${event.id}`, leaderToken)).status).toBe(200)
    expect((await request(`/events/${event.id}`, adminToken)).status).toBe(200)
    for (const token of [ownerToken, contributorToken, committeeLeaderToken]) {
      expect((await request(`/events/${event.id}`, token)).status).toBe(403)
      expect((await request(`/tasks/${task.id}`, token)).status).toBe(403)
      expect((await data(await request('/events?limit=500', token))).map((row: any) => row.id)).not.toContain(event.id)
      expect((await data(await request('/tasks?limit=500', token))).map((row: any) => row.id)).not.toContain(task.id)
    }
    // Target model (rule 18): Văn phòng xứ keeps parish-wide VIEW, including
    // DRAFTs (view-only) — the parish leader sees the draft event/task and
    // lists while it stays hidden from everyone else without a role on it.
    expect((await request(`/events/${event.id}`, parishLeaderToken)).status).toBe(200)
    expect((await request(`/tasks/${task.id}`, parishLeaderToken)).status).toBe(200)
    expect((await data(await request('/events?limit=500', parishLeaderToken))).map((row: any) => row.id)).toContain(event.id)
    expect((await data(await request('/tasks?limit=500', parishLeaderToken))).map((row: any) => row.id)).toContain(task.id)

    const planning = await data(await request(`/events/${event.id}/transition`, leaderToken, 'POST', { version: event.version, status: 'PLANNING' }))
    expect(planning.status).toBe('PLANNING')
    expect((await request(`/events/${event.id}`, parishLeaderToken)).status).toBe(200)
    expect((await request(`/tasks/${task.id}`, parishLeaderToken)).status).toBe(200)
    // The pending task assignment grants task visibility needed to respond; it
    // does not broaden into event-level visibility through ordinary membership.
    expect((await request(`/events/${event.id}`, contributorToken)).status).toBe(403)
    expect((await request(`/tasks/${task.id}`, contributorToken)).status).toBe(200)
    expect((await request(`/events/${event.id}`, ownerToken)).status).toBe(403)
    expect((await request(`/tasks/${task.id}`, ownerToken)).status).toBe(403)
    expect((await request(`/events/${event.id}`, committeeLeaderToken)).status).toBe(403)
    expect((await request(`/tasks/${task.id}`, committeeLeaderToken)).status).toBe(403)
  })

  it('does not turn an ordinary service term into Operations event or task read authority', async () => {
    const event = await data(await request('/events', leaderToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Sinh hoạt chỉ dành cho vai trò vận hành',
      eventType: 'MEETING',
      startsAt: '2026-10-09T08:00:00+07:00',
      endsAt: '2026-10-09T10:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
    }))
    const task = await data(await request('/tasks', leaderToken, 'POST', {
      eventId: event.id,
      title: 'Chuẩn bị nội dung',
    }))
    await data(await request(`/events/${event.id}/transition`, leaderToken, 'POST', {
      version: event.version,
      status: 'PLANNING',
    }))

    // contributorId has a current term in branchId, but no authority-bearing
    // position code and no role on these resources.
    expect((await request(`/events/${event.id}`, contributorToken)).status).toBe(403)
    expect((await request(`/tasks/${task.id}`, contributorToken)).status).toBe(403)
    expect((await data(await request('/events?limit=500', contributorToken))).map((row: any) => row.id)).not.toContain(event.id)
    expect((await data(await request('/tasks?limit=500', contributorToken))).map((row: any) => row.id)).not.toContain(task.id)

    // Legitimate organizational and creator authority remains intact.
    expect((await request(`/events/${event.id}`, leaderToken)).status).toBe(200)
    expect((await request(`/tasks/${task.id}`, leaderToken)).status).toBe(200)
    expect((await request(`/events/${event.id}`, parishLeaderToken)).status).toBe(200)
    expect((await request(`/tasks/${task.id}`, parishLeaderToken)).status).toBe(200)
  })

  it('exposes business creation options and enforces Xu Doan versus unit scope', async () => {
    const parishOptions = await data(await request('/creation-options', parishLeaderToken))
    expect(parishOptions.canCreateXuDoanEvent).toBe(true)
    expect(parishOptions.xuDoanOrganizers.map((person: { userId: string }) => person.userId)).toContain(parishLeaderId)
    const branchOptions = await data(await request('/creation-options', leaderToken))
    expect(branchOptions.canCreateXuDoanEvent).toBe(false)
    expect(branchOptions.units.map((unit: { id: string }) => unit.id)).toContain(branchId)
    expect(branchOptions.units.map((unit: { id: string }) => unit.id)).not.toContain(otherBranchId)
    const memberOptions = await data(await request('/creation-options', ownerToken))
    expect(memberOptions.canCreateXuDoanEvent).toBe(false)
    expect(memberOptions.units).toEqual([])

    // Xứ đoàn event without organizer auto-assigns the active parish leader.
    const xuDoan = await data(await request('/events', parishLeaderToken, 'POST', {
      eventScopeType: 'XU_DOAN',
      title: 'Sa mạc hè', eventType: 'CAMP', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-12T17:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    }))
    expect(xuDoan).toMatchObject({ eventScopeType: 'XU_DOAN', scopeUnitId: null, organizerUserId: parishLeaderId, createdBy: parishLeaderId })
    // Scope/type mismatch fails closed.
    expect((await request('/events', parishLeaderToken, 'POST', {
      eventScopeType: 'XU_DOAN', scopeUnitId: branchId,
      title: 'Sai phạm vi', eventType: 'MEETING', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-10T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })).status).toBe(400)
    // Non-leader organizer for a unit event is rejected for business actors.
    expect((await request('/events', leaderToken, 'POST', {
      scopeUnitId: branchId, organizerUserId: contributorId,
      title: 'Organizer không phải trưởng', eventType: 'MEETING', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-10T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })).status).toBe(400)
    // Trưởng Xứ đoàn chỉ đứng tên event Xứ đoàn: tự đứng tên event chuyên môn bị chặn…
    const parishLeaderUnit = await request('/events', parishLeaderToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Trưởng xứ đứng tên event ngành', eventType: 'MEETING', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-10T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(parishLeaderUnit.status).toBe(403)
    expect((await parishLeaderUnit.json() as any).error.code).toBe('FORBIDDEN')
    // …kể cả khi chỉ định đúng Trưởng unit làm organizer: Trưởng Xứ đoàn không
    // tạo event chuyên môn dưới mọi hình thức (rule 18 — fail closed ở lớp
    // authorization trước cả organizer rule).
    const parishCreatedUnit = await request('/events', parishLeaderToken, 'POST', {
      scopeUnitId: branchId, organizerUserId: leaderId,
      title: 'Trưởng xứ tạo event ngành cho Trưởng ngành', eventType: 'MEETING', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-10T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(parishCreatedUnit.status).toBe(403)
    expect((await parishCreatedUnit.json() as any).error.code).toBe('FORBIDDEN')
    // …và Trưởng Xứ đoàn cũng không có manage trên event chuyên môn để đổi organizer…
    const leaderUnitEvent = await data(await request('/events', leaderToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Event ngành để thử đổi organizer', eventType: 'MEETING', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-10T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    }))
    const parishSwapDenied = await request(`/events/${leaderUnitEvent.id}`, parishLeaderToken, 'PUT', { version: leaderUnitEvent.version, organizerUserId: parishLeaderId })
    expect(parishSwapDenied.status).toBe(403)
    // …trong khi Trưởng ngành đổi organizer sang người không phải Trưởng unit
    // vẫn chạm đúng organizer rule.
    const organizerSwap = await request(`/events/${leaderUnitEvent.id}`, leaderToken, 'PUT', { version: leaderUnitEvent.version, organizerUserId: parishLeaderId })
    expect(organizerSwap.status).toBe(400)
    expect((await organizerSwap.json() as any).error.code).toBe('ORGANIZER_MUST_BE_UNIT_LEADER')
    // Field without a unit in a Xu Doan event is rejected; deputy lead is rejected.
    const field = await data(await request('/workstreams', parishLeaderToken, 'POST', { eventId: xuDoan.id, sourceUnitId: branchId, name: 'Field Phụng vụ' }))
    expect((await request('/workstreams', parishLeaderToken, 'POST', { eventId: xuDoan.id, name: 'Field thiếu unit' })).status).toBe(400)
    await db.insert(users).values([{ id: `deputy-${suffix}`, username: `deputy-${suffix}`, passwordHash: 'hash', fullName: 'Phó Ngành', role: 'chunhiem', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 }])
    await db.insert(parishPeople).values([{ id: `person-deputy-${suffix}`, parishId: parishA, linkedUserId: `deputy-${suffix}`, fullName: 'Phó Ngành', createdBy: adminId, updatedBy: adminId }])
    await db.insert(parishServiceTerms).values([{
      id: `term-deputy-${suffix}`, parishId: parishA, personId: `person-deputy-${suffix}`, unitId: branchId,
      positionTitle: 'Phó Ngành', positionCode: 'BRANCH_DEPUTY', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId,
    }])
    const deputyLead = await request(`/workstreams/${field.id}/members`, parishLeaderToken, 'POST', { version: 1, userId: `deputy-${suffix}`, operationRole: 'WORKSTREAM_LEAD' })
    expect(deputyLead.status).toBe(403)
    expect((await deputyLead.json() as { error: { code: string } }).error.code).toBe('WORKSTREAM_LEAD_OUTSIDE_UNIT')
    expect((await request(`/workstreams/${field.id}/members`, parishLeaderToken, 'POST', { version: 1, userId: leaderId, operationRole: 'WORKSTREAM_LEAD' })).status).toBe(201)
  })

  it('allows one person to hold parallel Branch Leader and Committee Leader scopes without hierarchy leakage', async () => {
    const dualTermId = `term-dual-leader-${suffix}`
    await db.insert(parishServiceTerms).values({
      id: dualTermId,
      parishId: parishA,
      personId: `person-leader-${suffix}`,
      unitId: dualCommitteeId,
      positionTitle: 'Trưởng ban kiêm nhiệm',
      positionCode: 'COMMITTEE_LEADER',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      createdBy: adminId,
      updatedBy: adminId,
    })
    try {
      const units = await data(await request('/units?limit=500', leaderToken))
      expect(units.map((unit: any) => unit.id)).toEqual(expect.arrayContaining([branchId, dualCommitteeId]))
      expect(units.map((unit: any) => unit.id)).not.toContain(otherBranchId)

      const branchDecision = await resolveOperationsUserAuthorization(parishA, leaderId, 'operations.event.create', { resourceUnitId: branchId })
      const committeeDecision = await resolveOperationsUserAuthorization(parishA, leaderId, 'operations.event.create', { resourceUnitId: dualCommitteeId })
      const siblingBranchDecision = await resolveOperationsUserAuthorization(parishA, leaderId, 'operations.event.create', { resourceUnitId: otherBranchId })
      expect(branchDecision).toMatchObject({ allowed: true, reason: 'POSITION_SCOPE' })
      expect(committeeDecision).toMatchObject({ allowed: true, reason: 'POSITION_SCOPE' })
      expect(siblingBranchDecision).toMatchObject({ allowed: false, reason: 'POSITION_SCOPE' })
    } finally {
      await db.delete(parishServiceTerms).where(and(eq(parishServiceTerms.parishId, parishA), eq(parishServiceTerms.id, dualTermId)))
    }
  })

  it('evaluates service-term authority using the server parish date instead of UTC', async () => {
    const previousTimeZone = process.env.PARISH_TIME_ZONE
    await db.insert(parishServiceTerms).values({
      id: `term-leader-next-${suffix}`,
      parishId: parishA,
      personId: `person-leader-${suffix}`,
      unitId: otherBranchId,
      positionTitle: 'Trưởng ngành nhiệm kỳ mới',
      positionCode: 'BRANCH_LEADER',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
      createdBy: adminId,
      updatedBy: adminId,
    })
    try {
      process.env.PARISH_TIME_ZONE = 'Asia/Ho_Chi_Minh'
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-12-31T17:30:00.000Z'))

      const newTerm = await resolveOperationsUserAuthorization(
        parishA,
        leaderId,
        'operations.event.create',
        { resourceUnitId: otherBranchId },
      )
      const endedTerm = await resolveOperationsUserAuthorization(
        parishA,
        leaderId,
        'operations.event.create',
        { resourceUnitId: branchId },
      )

      expect(newTerm).toMatchObject({ allowed: true, reason: 'POSITION_SCOPE', unitIds: [otherBranchId] })
      expect(endedTerm).toMatchObject({ allowed: false, reason: 'POSITION_SCOPE', unitIds: [otherBranchId] })
    } finally {
      vi.useRealTimers()
      if (previousTimeZone === undefined) delete process.env.PARISH_TIME_ZONE
      else process.env.PARISH_TIME_ZONE = previousTimeZone
      await db.delete(parishServiceTerms).where(and(
        eq(parishServiceTerms.parishId, parishA),
        eq(parishServiceTerms.id, `term-leader-next-${suffix}`),
      ))
    }
  })

  it('limits unit leaders to candidates and assignments inside their organization unit', async () => {
    const event = await data(await request('/events', leaderToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Điều phối nội bộ Ngành Thiếu', eventType: 'MEETING', startsAt: '2026-11-03T08:00:00+07:00', endsAt: '2026-11-03T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    }))
    const task = await data(await request('/tasks', leaderToken, 'POST', { eventId: event.id, title: 'Phân công trong ngành' }))
    const candidatesResponse = await request(`/candidates?taskId=${task.id}&limit=500`, leaderToken)
    expect(candidatesResponse.status).toBe(200)
    const candidates = await data(candidatesResponse)
    expect(candidates.map((candidate: any) => candidate.personId)).toEqual(expect.arrayContaining([
      `person-leader-${suffix}`,
      `person-contributor-${suffix}`,
    ]))
    expect(candidates.map((candidate: any) => candidate.personId)).not.toEqual(expect.arrayContaining([
      `person-committee-leader-${suffix}`,
      `person-parish-leader-${suffix}`,
      parentPersonId,
    ]))
    expect(candidates.find((candidate: any) => candidate.personId === `person-contributor-${suffix}`)).toEqual({
      parishId: parishA,
      personId: `person-contributor-${suffix}`,
      userId: contributorId,
      displayName: 'Deputy Branch Leader',
      eligibility: 'ACTIONABLE',
      inResourceScope: true,
    })
    expect(Object.keys(candidates[0]).sort()).toEqual(['displayName', 'eligibility', 'inResourceScope', 'parishId', 'personId', 'userId'].sort())

    const outsideAssignment = await request(`/tasks/${task.id}/assign`, leaderToken, 'POST', { version: 1, personId: `person-committee-leader-${suffix}`, assignmentRole: 'CONTRIBUTOR' })
    expect(outsideAssignment.status).toBe(403)
    expect((await outsideAssignment.json() as any).error.code).toBe('TARGET_OUTSIDE_ORGANIZATION_SCOPE')
    const insideAssignment = await request(`/tasks/${task.id}/assign`, leaderToken, 'POST', { version: 1, personId: `person-contributor-${suffix}`, assignmentRole: 'CONTRIBUTOR' })
    expect(insideAssignment.status).toBe(201)

    const workstream = await data(await request('/workstreams', leaderToken, 'POST', { eventId: event.id, sourceUnitId: branchId, name: 'Nhóm trong ngành' }))
    const outsideMember = await request(`/workstreams/${workstream.id}/members`, leaderToken, 'POST', { version: 1, personId: `person-committee-leader-${suffix}`, operationRole: 'OBSERVER' })
    expect(outsideMember.status).toBe(403)
    expect((await outsideMember.json() as any).error.code).toBe('TARGET_OUTSIDE_ORGANIZATION_SCOPE')
    expect((await request(`/workstreams/${workstream.id}/members`, leaderToken, 'POST', { version: 1, personId: `person-contributor-${suffix}`, operationRole: 'OBSERVER' })).status).toBe(201)

    expect((await request(`/candidates?taskId=${task.id}&eventId=${event.id}`, leaderToken)).status).toBe(400)
    expect((await request(`/candidates?taskId=${task.id}`, foreignToken)).status).toBe(403)
  })

  it('denies Trưởng Xứ đoàn unit-event creation and position-based assignment (rule 18)', async () => {
    // Trưởng Xứ đoàn không tạo event chuyên môn — kể cả khi organizer là Trưởng ngành.
    const deniedEvent = await request('/events', parishLeaderToken, 'POST', {
      scopeUnitId: branchId, organizerUserId: leaderId,
      title: 'Điều phối toàn Xứ đoàn trong sự kiện ngành', eventType: 'MEETING', startsAt: '2026-11-04T08:00:00+07:00', endsAt: '2026-11-04T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(deniedEvent.status).toBe(403)
    expect((await deniedEvent.json() as any).error.code).toBe('FORBIDDEN')

    // Trên task độc lập, Trưởng Xứ đoàn không delegate qua position scope…
    const standalone = await data(await request('/tasks', adminToken, 'POST', { scopeUnitId: branchId, title: 'Việc độc lập chờ phân công' }))
    const parishAssign = await request(`/tasks/${standalone.id}/assign`, parishLeaderToken, 'POST', { version: 1, personId: `person-committee-leader-${suffix}`, assignmentRole: 'CONTRIBUTOR' })
    expect(parishAssign.status).toBe(403)
    // …nhưng admin override vẫn phân công parish-wide được.
    expect((await request(`/tasks/${standalone.id}/assign`, adminToken, 'POST', { version: 1, personId: `person-committee-leader-${suffix}`, assignmentRole: 'CONTRIBUTOR' })).status).toBe(201)
  })

  it('updates only membership validity with aggregate and member OCC', async () => {
    const event = await createEvent({ title: 'Validity event', scopeUnitId: branchId })
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { eventId: event.id, sourceUnitId: branchId, name: 'Validity group' }))
    const added = await data(await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', {
      version: 1, personId: `person-contributor-${suffix}`, operationRole: 'OBSERVER',
    }))

    expect((await request(`/workstreams/${workstream.id}/members/${added.id}/validity`, adminToken, 'PUT', {
      version: 2, memberVersion: 1, startsAt: '2026-12-02T09:00:00+07:00', endsAt: '2026-12-02T08:00:00+07:00', reason: 'Khoảng sai',
    })).status).toBe(400)

    const changed = await data(await request(`/workstreams/${workstream.id}/members/${added.id}/validity`, adminToken, 'PUT', {
      version: 2, memberVersion: 1, startsAt: '2026-12-01T08:00:00+07:00', endsAt: '2026-12-31T17:00:00+07:00', reason: 'Phân công tháng 12',
    }))
    expect(changed.workstreamVersion).toBe(3)
    expect(changed.member).toMatchObject({
      id: added.id,
      operationRole: 'OBSERVER',
      personId: `person-contributor-${suffix}`,
      startsAt: '2026-12-01T01:00:00.000Z',
      endsAt: '2026-12-31T10:00:00.000Z',
      version: 2,
    })
    expect((await request(`/workstreams/${workstream.id}/members/${added.id}/validity`, adminToken, 'PUT', {
      version: 2, memberVersion: 1, startsAt: null, endsAt: null, reason: 'Stale edit',
    })).status).toBe(409)
    expect((await request(`/workstreams/${workstream.id}/members/${added.id}/validity`, foreignToken, 'PUT', {
      version: 3, memberVersion: 2, startsAt: null, endsAt: null, reason: 'Cross parish',
    })).status).toBe(404)
    const auditRows = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.entityId, workstream.id), eq(auditLogs.action, 'UPDATE_MEMBER_VALIDITY')))
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]?.newValue).toContain('Phân công tháng 12')
  })

  it('replaces a LIVE workstream lead atomically and closes split-command bypasses', async () => {
    const event = await createEvent({ title: 'LIVE lead replacement', scopeUnitId: branchId })
    const workstream = await data(await request('/workstreams', adminToken, 'POST', {
      eventId: event.id, sourceUnitId: branchId, name: 'Điều phối hiện trường',
    }))
    const currentLead = await data(await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', {
      version: 1, userId: ownerId, operationRole: 'WORKSTREAM_LEAD',
    }))
    let eventState = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: 1, status: 'PLANNING' }))
    eventState = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: eventState.version, status: 'PREPARING' }))
    eventState = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: eventState.version, status: 'READY' }))
    eventState = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: eventState.version, status: 'LIVE' }))
    expect(eventState.status).toBe('LIVE')

    for (const response of [
      await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', { version: 2, userId: contributorId, operationRole: 'WORKSTREAM_LEAD' }),
      await request(`/workstreams/${workstream.id}/members/${currentLead.id}/remove`, adminToken, 'POST', { version: 2, memberVersion: 1, reason: 'Đường vòng gỡ' }),
      await request(`/workstreams/${workstream.id}/members/${currentLead.id}/validity`, adminToken, 'PUT', { version: 2, memberVersion: 1, startsAt: null, endsAt: '2026-09-01T00:00:00Z', reason: 'Đường vòng hết hạn' }),
    ]) {
      expect(response.status).toBe(409)
      expect((await response.json() as any).error.code).toBe('USE_LEAD_REPLACEMENT')
    }

    expect((await request(`/workstreams/${workstream.id}/lead/replace`, adminToken, 'POST', {
      version: 1, currentLeadMemberId: currentLead.id, currentLeadMemberVersion: 1,
      userId: contributorId, reason: 'Stale aggregate',
    })).status).toBe(409)
    const planningOnly = await request(`/workstreams/${workstream.id}/lead/replace`, adminToken, 'POST', {
      version: 2, currentLeadMemberId: currentLead.id, currentLeadMemberVersion: 1,
      personId: unlinkedPersonId, reason: 'Không có tài khoản trực ca',
    })
    expect(planningOnly.status).toBe(400)
    expect((await planningOnly.json() as any).error.code).toBe('INVALID_OPERATIONS_TARGET')
    const outsideScope = await request(`/workstreams/${workstream.id}/lead/replace`, leaderToken, 'POST', {
      version: 2, currentLeadMemberId: currentLead.id, currentLeadMemberVersion: 1,
      personId: `person-committee-leader-${suffix}`, reason: 'Điều động ngoài ngành',
    })
    expect(outsideScope.status).toBe(403)
    expect((await outsideScope.json() as any).error.code).toBe('TARGET_OUTSIDE_ORGANIZATION_SCOPE')

    const replacementKey = `replace-live-lead-${suffix}`
    const replacedResponse = await request(`/workstreams/${workstream.id}/lead/replace`, leaderToken, 'POST', {
      version: 2, currentLeadMemberId: currentLead.id, currentLeadMemberVersion: 1,
      userId: leaderId, reason: 'Bàn giao ca trực',
    }, replacementKey)
    expect(replacedResponse.status).toBe(201)
    const replaced = await data(replacedResponse)
    expect(replaced).toMatchObject({
      previousLead: { id: currentLead.id, version: 2 },
      newLead: { userId: leaderId, personId: null, operationRole: 'WORKSTREAM_LEAD', version: 1 },
      workstreamVersion: 3,
    })
    expect(replaced.previousLead.removedAt).toBeTruthy()
    expect(replaced.newLead.startsAt).toBeTruthy()

    const replay = await request(`/workstreams/${workstream.id}/lead/replace`, leaderToken, 'POST', {
      version: 2, currentLeadMemberId: currentLead.id, currentLeadMemberVersion: 1,
      userId: leaderId, reason: 'Bàn giao ca trực',
    }, replacementKey)
    expect(replay.status).toBe(200)
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true')
    expect((await data(replay)).newLead.id).toBe(replaced.newLead.id)

    const missingCurrent = await request(`/workstreams/${workstream.id}/lead/replace`, adminToken, 'POST', {
      version: 3, userId: ownerId, reason: 'Bỏ qua người đang trực',
    })
    expect(missingCurrent.status).toBe(409)
    expect((await missingCurrent.json() as any).error.code).toBe('CURRENT_LEAD_REQUIRED')
    const linkedAlias = await request(`/workstreams/${workstream.id}/lead/replace`, leaderToken, 'POST', {
      version: 3, currentLeadMemberId: replaced.newLead.id, currentLeadMemberVersion: 1,
      personId: `person-leader-${suffix}`, reason: 'Cùng một người qua person id',
    })
    expect(linkedAlias.status).toBe(409)
    expect((await linkedAlias.json() as any).error.code).toBe('LEAD_TARGET_ALREADY_ACTIVE')

    const activeLeads = await db.select().from(operationWorkstreamMembers).where(and(
      eq(operationWorkstreamMembers.parishId, parishA), eq(operationWorkstreamMembers.workstreamId, workstream.id),
      eq(operationWorkstreamMembers.operationRole, 'WORKSTREAM_LEAD'),
    ))
    expect(activeLeads.filter(member => !member.removedAt)).toEqual([expect.objectContaining({ id: replaced.newLead.id, userId: leaderId })])
    expect(activeLeads.find(member => member.id === currentLead.id)?.removedAt).toBeTruthy()
    const auditRows = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishA), eq(auditLogs.entityId, workstream.id), eq(auditLogs.action, 'REPLACE_LEAD'),
    ))
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]?.newValue).toContain('Bàn giao ca trực')

    const liveWorkstreamWithoutLead = await data(await request('/workstreams', adminToken, 'POST', {
      eventId: event.id, sourceUnitId: branchId, name: 'Nhóm phát sinh tại hiện trường',
    }))
    const genericAppointment = await request(`/workstreams/${liveWorkstreamWithoutLead.id}/members`, adminToken, 'POST', {
      version: 1, userId: ownerId, operationRole: 'WORKSTREAM_LEAD',
    })
    expect(genericAppointment.status).toBe(409)
    expect((await genericAppointment.json() as any).error.code).toBe('USE_LEAD_REPLACEMENT')
    const appointed = await request(`/workstreams/${liveWorkstreamWithoutLead.id}/lead/replace`, adminToken, 'POST', {
      version: 1, userId: ownerId, reason: 'Bổ nhiệm cho nhóm phát sinh',
    })
    expect(appointed.status).toBe(201)
    expect(await data(appointed)).toMatchObject({
      previousLead: null,
      newLead: { userId: ownerId, operationRole: 'WORKSTREAM_LEAD' },
      workstreamVersion: 2,
    })
  })

  it('keeps Trưởng Xứ đoàn and Trưởng ban as scoped positions, not account roles', async () => {
    const parishWide = await request('/events', parishLeaderToken, 'POST', {
      title: 'Điều phối toàn Xứ đoàn', eventType: 'MEETING', startsAt: '2026-10-07T08:00:00+07:00', endsAt: '2026-10-07T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(parishWide.status).toBe(201)
    const committeeScoped = await request('/events', committeeLeaderToken, 'POST', {
      scopeUnitId: committeeId, title: 'Chuẩn bị phụng vụ', eventType: 'MEETING', startsAt: '2026-10-08T08:00:00+07:00', endsAt: '2026-10-08T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(committeeScoped.status).toBe(201)
    const outsideCommittee = await request('/events', committeeLeaderToken, 'POST', {
      scopeUnitId: branchId, title: 'Ngoài ban', eventType: 'MEETING', startsAt: '2026-10-09T08:00:00+07:00', endsAt: '2026-10-09T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(outsideCommittee.status).toBe(403)
  })

  it('rejects invalid IANA event timezones at the API boundary', async () => {
    const response = await request('/events', adminToken, 'POST', {
      title: 'Timezone không hợp lệ',
      eventType: 'MEETING',
      startsAt: '2026-10-01T08:00:00+07:00',
      endsAt: '2026-10-01T10:00:00+07:00',
      timezone: 'Not/A_Real_Time_Zone',
    })
    expect(response.status).toBe(400)
  })

  it('owns public calendar projection and durable parent notification without exposing operations data', async () => {
    const internal = await createEvent({
      title: 'Họp nội bộ', eventType: 'MEETING', startsAt: '2026-10-06T08:00:00+07:00', endsAt: '2026-10-06T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh', visibility: 'INTERNAL',
    })
    expect(internal.sourceParishEventId).toBeNull()
    const event = await createEvent({
      title: 'Trại hè',
      eventType: 'CAMP',
      startsAt: '2026-10-01T00:30:00+07:00',
      endsAt: '2026-10-01T02:30:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
      visibility: 'PUBLIC_SUMMARY',
      location: 'Sân giáo xứ',
      expectedHeadcount: 80,
    })
    expect(event.sourceParishEventId).toBeNull()
    expect((await db.select().from(parishEvents).where(and(eq(parishEvents.parishId, parishA), eq(parishEvents.title, 'Trại hè'))))).toHaveLength(0)
    expect((await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-OPS-PUBLIC-${event.id}-1`))))).toHaveLength(0)
    expect((await db.select().from(parishEvents).where(and(eq(parishEvents.parishId, parishA), eq(parishEvents.title, 'Họp nội bộ'))))).toHaveLength(0)
    const clientManagedLink = await request('/events', adminToken, 'POST', {
      sourceParishEventId: sourceEventId, title: 'Client tự chọn nguồn', eventType: 'CAMP', startsAt: '2026-10-01T08:00:00+07:00', endsAt: '2026-10-01T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh', visibility: 'PUBLIC_SUMMARY',
    })
    expect(clientManagedLink.status).toBe(400)
    expect((await clientManagedLink.json() as any).error.code).toBe('CALENDAR_LINK_SERVER_MANAGED')

    const changed = await data(await request(`/events/${event.id}`, adminToken, 'PUT', {
      version: event.version, title: 'Trại hè cập nhật', startsAt: '2026-10-01T01:15:00+07:00', endsAt: '2026-10-01T03:15:00+07:00', location: 'Sân lớn', visibility: 'PUBLIC_SUMMARY',
    }))
    expect(changed.sourceParishEventId).toBeNull()
    const planning = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: changed.version, status: 'PLANNING' }))
    const generatedSourceEventId = planning.sourceParishEventId
    expect(generatedSourceEventId).toMatch(/^EVT-/)
    const projected = (await db.select().from(parishEvents).where(and(eq(parishEvents.parishId, parishA), eq(parishEvents.id, generatedSourceEventId))))[0]
    expect(projected).toMatchObject({ date: '2026-10-01', title: 'Trại hè cập nhật', category: 'CAMP', time: '01:15', location: 'Sân lớn', deletedAt: null })
    expect((await db.select().from(parishEvents).where(and(eq(parishEvents.parishId, parishA), eq(parishEvents.id, generatedSourceEventId))))[0]).toMatchObject({ title: 'Trại hè cập nhật', time: '01:15', location: 'Sân lớn' })
    const [parentNotice] = await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-OPS-PUBLIC-${event.id}-${planning.version}`)))
    expect(JSON.parse(parentNotice.targetUserIds!)).toEqual([parentId])
    expect(parentNotice.message).toContain('2026-10-01 lúc 01:15, tại Sân lớn')
    expect(parentNotice.message).not.toContain('task')

    const temporaryPublic = await createEvent({ title: 'Sự kiện chuyển nội bộ', visibility: 'PUBLIC_SUMMARY' })
    const temporaryPlanning = await data(await request(`/events/${temporaryPublic.id}/transition`, adminToken, 'POST', { version: temporaryPublic.version, status: 'PLANNING' }))
    const temporarySourceId = temporaryPlanning.sourceParishEventId
    const hidden = await data(await request(`/events/${temporaryPublic.id}`, adminToken, 'PUT', { version: temporaryPlanning.version, visibility: 'INTERNAL' }))
    expect(hidden).toMatchObject({ visibility: 'INTERNAL', sourceParishEventId: null })
    expect((await db.select().from(parishEvents).where(and(eq(parishEvents.parishId, parishA), eq(parishEvents.id, temporarySourceId))))[0].deletedAt).not.toBeNull()

    const rewindPublic = await createEvent({ title: 'Sự kiện công khai lùi về nháp', visibility: 'PUBLIC_SUMMARY' })
    const rewindPlanning = await data(await request(`/events/${rewindPublic.id}/transition`, adminToken, 'POST', { version: rewindPublic.version, status: 'PLANNING' }))
    const rewindSourceId = rewindPlanning.sourceParishEventId
    const draftAgain = await data(await request(`/events/${rewindPublic.id}/transition`, adminToken, 'POST', {
      version: rewindPlanning.version, status: 'DRAFT', reason: 'Rà soát lại nội dung trước khi công bố',
    }))
    expect(draftAgain).toMatchObject({ status: 'DRAFT', sourceParishEventId: null, automationPaused: true })
    expect((await db.select().from(parishEvents).where(and(eq(parishEvents.parishId, parishA), eq(parishEvents.id, rewindSourceId))))[0].deletedAt).not.toBeNull()
    expect(await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-OPS-PUBLIC-${rewindPublic.id}-${rewindPlanning.version}`)))).toHaveLength(1)

    const participant = await request(`/events/${event.id}/participants`, adminToken, 'POST', { userId: ownerId, participantRole: 'ATTENDEE' })
    expect(participant.status).toBe(201)
    const participantRow = await data(participant)
    expect(participantRow.id).toMatch(/^OPS-/)
    expect((await request(`/events/${event.id}/participants`, adminToken, 'POST', { userId: ownerId, participantRole: 'VOLUNTEER' })).status).toBe(409)
    const attended = await request(`/events/${event.id}/participants/${participantRow.id}/status`, adminToken, 'POST', { version: 1, status: 'ATTENDED' })
    expect(attended.status).toBe(200)
    expect((await request(`/events/${event.id}/participants/${participantRow.id}/status`, adminToken, 'POST', { version: 1, status: 'ABSENT' })).status).toBe(409)
    const headcount = await data(await request(`/events/${event.id}/headcount`, adminToken))
    expect(headcount).toMatchObject({ expected: 80, total: 1 })
    const summary = await data(await request('/events/public-summary', adminToken))
    const item = summary.find((candidate: any) => candidate.operationEventId === event.id)
    expect(item).toMatchObject({ id: generatedSourceEventId, operationEventId: event.id, title: 'Trại hè cập nhật', time: '01:15', location: 'Sân lớn' })
    expect(item).not.toHaveProperty('description')

    const existingMemoryId = `memory-existing-${suffix}`
    await db.insert(parishRecords).values({
      id: existingMemoryId, parishId: parishA, recordType: 'MILESTONE', title: 'Mốc lịch sử do người dùng quản lý', summary: 'Không thuộc Operations', content: null,
      occurredOn: '2026-10-01', endedOn: null, location: null, status: 'DRAFT', visibility: 'STAFF', showOnTimeline: true,
      sourceEventId: generatedSourceEventId, createdBy: adminId, updatedBy: adminId, publishedBy: null, publishedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null,
    })

    const preparing = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: planning.version, status: 'PREPARING' }))
    const ready = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: preparing.version, status: 'READY' }))
    const live = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: ready.version, status: 'LIVE' }))
    const editLive = await request(`/events/${event.id}`, adminToken, 'PUT', { version: live.version, title: 'Không được sửa lịch sử LIVE' })
    expect(editLive.status).toBe(409)
    expect((await editLive.json() as any).error.code).toBe('EVENT_IMMUTABLE')
    const completionBody = {
      version: live.version,
      status: 'COMPLETED',
      outcomeSummary: '80 em tham dự, chương trình hoàn tất an toàn.',
    }
    const completionKey = `complete-event-${suffix}`
    const completed = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', completionBody, completionKey))
    expect(completed.status).toBe('COMPLETED')
    const completionReplay = await request(`/events/${event.id}/transition`, adminToken, 'POST', completionBody, completionKey)
    expect(completionReplay.status).toBe(200)
    expect(completionReplay.headers.get('Idempotency-Replayed')).toBe('true')
    const records = await db.select().from(parishRecords).where(and(
      eq(parishRecords.parishId, parishA),
      eq(parishRecords.sourceEventId, generatedSourceEventId),
    ))
    expect(records).toHaveLength(2)
    expect(records.find(record => record.id === existingMemoryId)).toMatchObject({
      recordType: 'MILESTONE',
      title: 'Mốc lịch sử do người dùng quản lý',
      summary: 'Không thuộc Operations',
    })
    const ownedCompletionRecord = records.find(record => record.id !== existingMemoryId)
    expect(ownedCompletionRecord).toMatchObject({
      recordType: 'ACTIVITY',
      sourceEventId: generatedSourceEventId,
      summary: '80 em tham dự, chương trình hoàn tất an toàn.',
      occurredOn: '2026-10-01',
      endedOn: '2026-10-01',
    })
    expect(completed.completionRecordId).toBe(ownedCompletionRecord?.id)

    const rewindTerminal = await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: completed.version, status: 'LIVE' })
    expect(rewindTerminal.status).toBe(409)
    expect((await rewindTerminal.json() as any).error.code).toBe('EVENT_COMPLETED_TERMINAL')
    const rewindTerminalReason = await request(`/events/${event.id}/transition`, adminToken, 'POST', {
      version: completed.version, status: 'LIVE', reason: 'Mở lại để bổ sung biên bản hiện trường',
    })
    expect(rewindTerminalReason.status).toBe(409)
    expect((await rewindTerminalReason.json() as any).error.code).toBe('EVENT_COMPLETED_TERMINAL')
    const resumeCompleted = await request(`/events/${event.id}/automation/resume`, adminToken, 'POST', { version: completed.version, reason: 'Phiên bản cũ' })
    expect(resumeCompleted.status).toBe(409)
    expect((await resumeCompleted.json() as any).error.code).toBe('AUTOMATION_NOT_PAUSED')
    const lifecycleAudit = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.entityId, event.id)))
    expect(lifecycleAudit.filter(entry => entry.action === 'REWIND')).toHaveLength(0)
    expect((await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Không thêm task sau completed' })).status).toBe(409)
    expect((await request('/workstreams', adminToken, 'POST', { eventId: event.id, name: 'Không thêm workstream sau completed' })).status).toBe(409)
    expect((await request(`/events/${event.id}/participants`, adminToken, 'POST', { userId: contributorId, participantRole: 'ATTENDEE' })).status).toBe(409)
  })

  it('reserves public event projection for Trưởng Xứ đoàn while unit leaders remain internal-only', async () => {
    const denied = await request('/events', leaderToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Thông báo ngành chưa được duyệt', eventType: 'MEETING',
      startsAt: '2026-10-20T08:00:00+07:00', endsAt: '2026-10-20T10:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh', visibility: 'PUBLIC_SUMMARY',
    })
    expect(denied.status).toBe(403)

    const internal = await request('/events', leaderToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Họp nội bộ ngành', eventType: 'MEETING',
      startsAt: '2026-10-20T08:00:00+07:00', endsAt: '2026-10-20T10:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh', visibility: 'INTERNAL',
    })
    expect(internal.status).toBe(201)

    // Target model (rule 18): Trưởng Xứ đoàn không tạo event chuyên môn (kể cả
    // PUBLIC) — projection công khai của Xứ đoàn đi qua event Xứ đoàn, nơi
    // Trưởng Xứ đoàn giữ publish_public.
    const published = await request('/events', parishLeaderToken, 'POST', {
      eventScopeType: 'XU_DOAN',
      title: 'Thông báo toàn Xứ đoàn đã duyệt', eventType: 'MEETING',
      startsAt: '2026-10-21T08:00:00+07:00', endsAt: '2026-10-21T10:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh', visibility: 'PUBLIC_SUMMARY',
    })
    expect(published.status).toBe(201)
    let publishedEvent = await data(published)
    expect(publishedEvent.sourceParishEventId).toBeNull()
    publishedEvent = await data(await request(`/events/${publishedEvent.id}/transition`, parishLeaderToken, 'POST', { version: publishedEvent.version, status: 'PLANNING' }))
    expect(publishedEvent.sourceParishEventId).toMatch(/^EVT-/)

    const organizerCancel = await request(`/events/${publishedEvent.id}/transition`, leaderToken, 'POST', {
      version: publishedEvent.version, status: 'CANCELLED', reason: 'Organizer thử tắt lịch công khai',
    })
    expect(organizerCancel.status).toBe(403)
    expect((await db.select().from(parishEvents).where(and(
      eq(parishEvents.parishId, parishA), eq(parishEvents.id, publishedEvent.sourceParishEventId), isNull(parishEvents.deletedAt),
    )))).toHaveLength(1)

    const parishLeaderCancel = await request(`/events/${publishedEvent.id}/transition`, parishLeaderToken, 'POST', {
      version: publishedEvent.version, status: 'CANCELLED', reason: 'Trưởng Xứ đoàn duyệt hủy',
    })
    expect(parishLeaderCancel.status).toBe(200)
    expect((await db.select().from(parishEvents).where(and(
      eq(parishEvents.parishId, parishA), eq(parishEvents.id, publishedEvent.sourceParishEventId), isNull(parishEvents.deletedAt),
    )))).toHaveLength(0)
  })

  it('grants admin parish-scoped authority in production regardless of legacy flags', async () => {
    expect(isOperationsAdminMutationOverrideEnabled({})).toBe(true)
    expect(isOperationsAdminMutationOverrideEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(isOperationsAdminMutationOverrideEnabled({ OPERATIONS_ADMIN_MUTATION_OVERRIDE: 'false' })).toBe(true)
    expect(isOperationsAdminMutationOverrideEnabled({ NODE_ENV: 'production', OPERATIONS_ADMIN_MUTATION_OVERRIDE: 'true' })).toBe(true)
    const previousNodeEnv = process.env.NODE_ENV
    const previousOverride = process.env.OPERATIONS_ADMIN_MUTATION_OVERRIDE
    try {
      process.env.NODE_ENV = 'production'
      process.env.OPERATIONS_ADMIN_MUTATION_OVERRIDE = 'true'
      expect((await resolveOperationsAuthorization(
        { userId: adminId, role: 'admin', parishId: parishA },
        'operations.event.view',
        { parishId: parishA },
      )).allowed).toBe(true)
      expect((await resolveOperationsAuthorization(
        { userId: adminId, role: 'admin', parishId: parishA },
        'operations.event.create',
        { parishId: parishA },
      )).allowed).toBe(true)
      expect((await resolveOperationsAuthorization(
        { userId: adminId, role: 'admin', parishId: parishA },
        'operations.event.create', { parishId: parishB },
      )).allowed).toBe(false)
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      if (previousOverride === undefined) delete process.env.OPERATIONS_ADMIN_MUTATION_OVERRIDE
      else process.env.OPERATIONS_ADMIN_MUTATION_OVERRIDE = previousOverride
    }
  })

  it('rejects new tasks during LIVE even for admin, including tasks reached through a workstream', async () => {
    const event = await createEvent({ title: 'Giới hạn tạo task' })
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { eventId: event.id, name: 'Nhóm thực hiện' }))
    await db.update(operationEvents).set({ status: 'LIVE' }).where(and(eq(operationEvents.parishId, parishA), eq(operationEvents.id, event.id)))
    for (const target of [{ eventId: event.id }, { workstreamId: workstream.id }]) {
      const response = await request('/tasks', adminToken, 'POST', { ...target, title: 'Không được tạo khi đang diễn ra' })
      expect(response.status).toBe(409)
      expect((await response.json() as any).error.code).toBe('EVENT_IMMUTABLE')
    }
  })

  it('stores a tenant-scoped OCC retrospective without copying its content into audit history', async () => {
    const event = await createEvent({ title: 'Hậu kiểm trại', scopeUnitId: branchId })
    const beforeLive = await request(`/events/${event.id}/retrospective`, adminToken, 'PUT', { expectedVersion: null, lessonsLearned: 'Chưa được ghi sớm.' })
    expect(beforeLive.status).toBe(409)
    expect((await beforeLive.json() as any).error.code).toBe('RETROSPECTIVE_REQUIRES_COMPLETED')

    let current = event
    for (const status of ['PLANNING', 'PREPARING', 'READY', 'LIVE'] as const) current = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status }))

    const whileLive = await request(`/events/${event.id}/retrospective`, leaderToken, 'PUT', { expectedVersion: null, lessonsLearned: 'Chưa được ghi khi đang diễn ra.' })
    expect(whileLive.status).toBe(409)
    expect((await whileLive.json() as any).error.code).toBe('RETROSPECTIVE_REQUIRES_COMPLETED')
    const liveDetail = await data(await request(`/events/${event.id}`, leaderToken))
    expect(liveDetail.closure.blockers).toEqual([])
    current = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status: 'COMPLETED', outcomeSummary: 'Chương trình hoàn thành an toàn.' }))

    const stableKey = `retrospective-${suffix}`
    const createdResponse = await request(`/events/${event.id}/retrospective`, leaderToken, 'PUT', { expectedVersion: null, lessonsLearned: 'Phân công sớm giúp giảm chờ đợi.', improvementNotes: 'Chốt vật dụng trước ba ngày.' }, stableKey)
    expect(createdResponse.status).toBe(200)
    expect(await data(createdResponse)).toMatchObject({ parishId: parishA, eventId: event.id, version: 1 })
    const replay = await request(`/events/${event.id}/retrospective`, leaderToken, 'PUT', { expectedVersion: null, lessonsLearned: 'Phân công sớm giúp giảm chờ đợi.', improvementNotes: 'Chốt vật dụng trước ba ngày.' }, stableKey)
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true')

    const stale = await request(`/events/${event.id}/retrospective`, leaderToken, 'PUT', { expectedVersion: null, lessonsLearned: 'Ghi đè lỗi.' })
    expect(stale.status).toBe(409)
    expect((await stale.json() as any).error.code).toBe('VERSION_CONFLICT')
    const changed = await data(await request(`/events/${event.id}/retrospective`, leaderToken, 'PUT', { expectedVersion: 1, lessonsLearned: 'Phân công sớm và xác nhận rõ.', improvementNotes: null }))
    expect(changed).toMatchObject({ version: 2, improvementNotes: null })

    const detail = await data(await request(`/events/${event.id}`, leaderToken))
    expect(detail.retrospective).toMatchObject({ eventId: event.id, lessonsLearned: 'Phân công sớm và xác nhận rõ.', version: 2 })
    const audits = await db.select({ oldValue: auditLogs.oldValue, newValue: auditLogs.newValue }).from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.entityId, event.id), eq(auditLogs.action, 'UPDATE_RETROSPECTIVE')))
    expect(JSON.stringify(audits)).not.toContain('Phân công sớm')
    expect(JSON.stringify(audits)).not.toContain('Chốt vật dụng')
    expect(current.status).toBe('COMPLETED')
  })

  it('creates a completed-event follow-up and its actionable OWNER atomically within organization scope', async () => {
    const event = await createEvent({ title: 'Follow-up hậu kiểm', scopeUnitId: branchId })
    let current = event
    for (const status of ['PLANNING', 'PREPARING', 'READY', 'LIVE'] as const) current = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status }))
    current = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status: 'COMPLETED', outcomeSummary: 'Đã hoàn tất.' }))
    expect((await request(`/events/${event.id}/retrospective`, leaderToken, 'PUT', { expectedVersion: null, lessonsLearned: 'Đã rà soát sau khi đóng.' })).status).toBe(200)

    const outside = await request(`/events/${event.id}/follow-ups`, leaderToken, 'POST', { eventVersion: current.version, title: 'Ngoài phạm vi', dueAt: '2026-10-20T08:00:00+07:00', userId: committeeLeaderId })
    expect(outside.status).toBe(403)
    expect((await outside.json() as any).error.code).toBe('TARGET_OUTSIDE_ORGANIZATION_SCOPE')
    const planningOnly = await request(`/events/${event.id}/follow-ups`, leaderToken, 'POST', { eventVersion: current.version, title: 'Không có đường nhận việc', dueAt: '2026-10-20T08:00:00+07:00', personId: unlinkedPersonId })
    expect(planningOnly.status).toBe(400)
    expect((await planningOnly.json() as any).error.code).toBe('INVALID_OPERATIONS_TARGET')

    await request('/blockouts', contributorToken, 'POST', { userId: contributorId, startsAt: '2026-10-20T07:00:00+07:00', endsAt: '2026-10-20T09:00:00+07:00', reason: 'Lịch riêng không được lộ' })
    const stableKey = `follow-up-${suffix}`
    const payload = { eventVersion: current.version, title: 'Chốt bộ checklist dùng lại', description: 'Rút kinh nghiệm thành hành động.', dueAt: '2026-10-20T08:00:00+07:00', userId: contributorId, priority: 'HIGH' }
    const createdResponse = await request(`/events/${event.id}/follow-ups`, leaderToken, 'POST', payload, stableKey)
    expect(createdResponse.status).toBe(201)
    const created = await data(createdResponse)
    expect(created.task).toMatchObject({ parishId: parishA, operationEventId: event.id, phase: 'FOLLOW_UP', status: 'TODO', priority: 'HIGH', isRequired: false, version: 1 })
    expect(created.assignment).toMatchObject({ taskId: created.task.id, userId: contributorId, assignmentRole: 'OWNER', acknowledgementStatus: 'PENDING', version: 1 })
    expect(created.eventVersion).toBe(current.version + 1)
    expect(created.conflictWarnings).toEqual([expect.objectContaining({ startsAt: '2026-10-20T00:00:00.000Z', endsAt: '2026-10-20T02:00:00.000Z' })])
    expect(JSON.stringify(created.conflictWarnings)).not.toContain('Lịch riêng')

    const replay = await request(`/events/${event.id}/follow-ups`, leaderToken, 'POST', payload, stableKey)
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true')
    expect((await data(replay)).task.id).toBe(created.task.id)
    const stale = await request(`/events/${event.id}/follow-ups`, leaderToken, 'POST', { ...payload, title: 'Stale child' })
    expect(stale.status).toBe(409)
    const persistedTasks = await db.select().from(operationTasks).where(and(eq(operationTasks.parishId, parishA), eq(operationTasks.operationEventId, event.id)))
    const persistedOwners = await db.select().from(operationTaskAssignees).where(and(eq(operationTaskAssignees.parishId, parishA), eq(operationTaskAssignees.taskId, created.task.id), eq(operationTaskAssignees.assignmentRole, 'OWNER')))
    expect(persistedTasks.filter(task => task.title === payload.title)).toHaveLength(1)
    expect(persistedTasks.some(task => task.title === 'Stale child')).toBe(false)
    expect(persistedOwners).toHaveLength(1)
  })

  it('enforces dependency cycles and checklist completion before DONE', async () => {
    const event = await createEvent({ title: 'Huấn luyện' })
    const first = await data(await request('/tasks', adminToken, 'POST', { title: 'Chuẩn bị tài liệu', eventId: event.id }))
    const second = await data(await request('/tasks', adminToken, 'POST', { title: 'Gửi tài liệu', eventId: event.id }))
    const edge = await request(`/tasks/${second.id}/dependencies`, adminToken, 'POST', { version: 1, dependsOnTaskId: first.id })
    expect(edge.status).toBe(201)
    // W4.2b: task detail ships dependency edges enriched with the source
    // title/status so the client can render a read-only "waiting on" list.
    const secondDetail = await data(await request(`/tasks/${second.id}`, adminToken))
    expect(secondDetail.dependencies).toEqual([
      expect.objectContaining({
        taskId: second.id,
        dependsOnTaskId: first.id,
        dependencyType: 'BLOCKED_BY',
        dependsOnTitle: 'Chuẩn bị tài liệu',
        dependsOnStatus: 'TODO',
      }),
    ])
    const cycle = await request(`/tasks/${first.id}/dependencies`, adminToken, 'POST', { version: 1, dependsOnTaskId: second.id })
    expect(cycle.status).toBe(409)

    const gated = await data(await request('/tasks', adminToken, 'POST', { title: 'Task có checklist', eventId: event.id }))
    const owner = await data(await request(`/tasks/${gated.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    expect((await request(`/tasks/${gated.id}/acknowledge`, ownerToken, 'POST', { assignmentId: owner.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    const checklist = await data(await request(`/tasks/${gated.id}/checklist`, adminToken, 'POST', { version: owner.taskVersion, label: 'Đã kiểm tra', isRequired: true }))
    expect((await request(`/tasks/${gated.id}/transition`, ownerToken, 'POST', { version: checklist.taskVersion, status: 'DONE' })).status).toBe(409)
    const checked = await data(await request(`/tasks/${gated.id}/checklist/${checklist.item.id}`, ownerToken, 'POST', { version: checklist.taskVersion, isDone: true }))
    const done = await request(`/tasks/${gated.id}/transition`, ownerToken, 'POST', { version: checked.taskVersion, status: 'DONE', completionNote: 'Hoàn tất' })
    expect(done.status).toBe(200)
    const doneTask = await data(done)
    for (const mutation of [
      () => request(`/tasks/${gated.id}`, adminToken, 'PUT', { version: doneTask.version, title: 'Không sửa task đã xong' }),
      () => request(`/tasks/${gated.id}/checklist`, adminToken, 'POST', { version: doneTask.version, label: 'Không thêm checklist', isRequired: true }),
      () => request(`/tasks/${gated.id}/dependencies`, adminToken, 'POST', { version: doneTask.version, dependsOnTaskId: first.id }),
    ]) {
      const response = await mutation()
      expect(response.status).toBe(409)
      expect((await response.json() as any).error.code).toBe('TASK_IMMUTABLE')
    }
  })

  it('derives readiness blockers for missing lead, owner, overdue work and dependencies', async () => {
    const event = await createEvent({ title: 'Event readiness' })
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { eventId: event.id, name: 'Phụng vụ', isRequired: true }))
    const dependency = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, workstreamId: workstream.id, title: 'Duyệt chương trình' }))
    const required = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, workstreamId: workstream.id, title: 'Chuẩn bị bàn thờ', isRequired: true, dueAt: '2020-01-01T00:00:00Z' }))
    expect((await request(`/tasks/${required.id}/dependencies`, adminToken, 'POST', { version: 1, dependsOnTaskId: dependency.id })).status).toBe(201)
    expect((await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: 1, status: 'PLANNING' })).status).toBe(200)

    const state = await data(await request(`/events/${event.id}/readiness`, adminToken))
    expect(state.blockers.map((item: any) => item.type)).toEqual(expect.arrayContaining([
      'WORKSTREAM_NOT_READY', 'WORKSTREAM_LEAD_MISSING', 'TASK_NOT_DONE', 'TASK_OWNER_MISSING', 'TASK_OVERDUE', 'TASK_DEPENDENCY_BLOCKED',
    ]))
    const unlinkedLead = await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', { version: 1, personId: unlinkedPersonId, operationRole: 'WORKSTREAM_LEAD' })
    expect(unlinkedLead.status).toBe(201)
    const unlinkedLeadState = await data(await request(`/events/${event.id}/readiness`, adminToken))
    expect(unlinkedLeadState.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'WORKSTREAM_LEAD_MISSING', id: workstream.id }),
    ]))
    const overdueBeforeCancellation = await data(await request(`/tasks?eventId=${event.id}&overdue=true`, adminToken))
    expect(overdueBeforeCancellation.map((task: any) => task.id)).toContain(required.id)

    const cancelledRequired = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Việc bắt buộc bị hủy', isRequired: true, dueAt: '2020-01-01T00:00:00Z' }))
    const cancelledOwner = await data(await request(`/tasks/${cancelledRequired.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    const pendingOwnerState = await data(await request(`/events/${event.id}/readiness`, adminToken))
    expect(pendingOwnerState.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'TASK_OWNER_MISSING', id: cancelledRequired.id }),
    ]))
    expect((await request(`/tasks/${cancelledRequired.id}/acknowledge`, ownerToken, 'POST', { assignmentId: cancelledOwner.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    const acceptedOwnerState = await data(await request(`/events/${event.id}/readiness`, adminToken))
    expect(acceptedOwnerState.blockers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'TASK_OWNER_MISSING', id: cancelledRequired.id }),
    ]))
    await db.update(users).set({ status: 'LOCKED' }).where(and(eq(users.parishId, parishA), eq(users.id, ownerId)))
    const lockedOwnerState = await data(await request(`/events/${event.id}/readiness`, adminToken))
    expect(lockedOwnerState.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'TASK_OWNER_MISSING', id: cancelledRequired.id }),
    ]))
    await db.update(users).set({ status: 'ACTIVE' }).where(and(eq(users.parishId, parishA), eq(users.id, ownerId)))
    const overdueBeforeRequiredCancellation = await data(await request(`/tasks?eventId=${event.id}&overdue=true`, adminToken))
    expect(overdueBeforeRequiredCancellation.map((task: any) => task.id)).toContain(cancelledRequired.id)
    expect((await request(`/tasks/${cancelledRequired.id}/transition`, ownerToken, 'POST', { version: cancelledOwner.taskVersion, status: 'CANCELLED' })).status).toBe(400)
    expect((await request(`/tasks/${cancelledRequired.id}/transition`, ownerToken, 'POST', { version: cancelledOwner.taskVersion, status: 'CANCELLED', cancellationReason: 'Không còn cần công việc này' })).status).toBe(200)
    const afterCancellation = await data(await request(`/events/${event.id}/readiness`, adminToken))
    expect(afterCancellation.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'TASK_NOT_DONE', id: cancelledRequired.id }),
    ]))
    const overdueAfterCancellation = await data(await request(`/tasks?eventId=${event.id}&overdue=true`, adminToken))
    expect(overdueAfterCancellation.map((task: any) => task.id)).toContain(required.id)
    expect(overdueAfterCancellation.map((task: any) => task.id)).not.toContain(cancelledRequired.id)
    const preparing = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: 2, status: 'PREPARING', override: true }))
    const ready = await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: preparing.version, status: 'READY' })
    expect(ready.status).toBe(409)
    expect((await ready.json() as any).error.code).toBe('READINESS_BLOCKED')
  })

  it('revalidates readiness when READY transitions to LIVE', async () => {
    const event = await createEvent({ title: 'Event readiness revalidation' })
    const planning = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: 1, status: 'PLANNING' }))
    const preparing = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: planning.version, status: 'PREPARING' }))
    const ready = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: preparing.version, status: 'READY' }))
    expect((await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Required task added after READY', isRequired: true })).status).toBe(201)
    const live = await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: ready.version, status: 'LIVE' })
    expect(live.status).toBe(409)
    expect((await live.json() as any).error.code).toBe('READINESS_BLOCKED')
  })

  it('restores a cancelled task with manager authority, OCC, receipt replay and audit history', async () => {
    const event = await createEvent({ title: 'Event khôi phục task' })
    const task = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Việc bắt buộc cần khôi phục', isRequired: true }))
    const assigned = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: task.version, userId: ownerId, assignmentRole: 'OWNER' }))
    await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    expect((await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: assigned.assignment.id, version: assigned.assignment.version, status: 'ACCEPTED' })).status).toBe(200)
    const started = await data(await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: assigned.taskVersion, status: 'IN_PROGRESS' }))
    const cancelled = await data(await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: started.version, status: 'CANCELLED', cancellationReason: 'Tạm thời không còn nhân lực', completionNote: 'Ghi chú cũ không được giữ khi mở lại' }))

    expect((await request(`/tasks/${task.id}/restore`, adminToken, 'POST', { version: cancelled.version })).status).toBe(400)
    expect((await request(`/tasks/${task.id}/restore`, ownerToken, 'POST', { version: cancelled.version, reason: 'Owner không có quyền quản lý' })).status).toBe(403)
    expect((await request(`/tasks/${task.id}/restore`, foreignToken, 'POST', { version: cancelled.version, reason: 'Sai giáo xứ' })).status).toBe(404)

    const receipt = `restore-task-${suffix}`
    const restoredResponse = await request(`/tasks/${task.id}/restore`, adminToken, 'POST', { version: cancelled.version, reason: 'Đây vẫn là điều kiện bắt buộc để đóng sự kiện' }, receipt)
    expect(restoredResponse.status).toBe(200)
    const restored = await data(restoredResponse)
    expect(restored).toMatchObject({ id: task.id, status: 'TODO', cancellationReason: null, blockedReason: null, startedAt: null, completedAt: null, completedBy: null, completionNote: null, version: cancelled.version + 1 })
    const replay = await request(`/tasks/${task.id}/restore`, adminToken, 'POST', { version: cancelled.version, reason: 'Đây vẫn là điều kiện bắt buộc để đóng sự kiện' }, receipt)
    expect(replay.status).toBe(200)
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true')
    expect((await data(replay)).version).toBe(restored.version)
    const stale = await request(`/tasks/${task.id}/restore`, adminToken, 'POST', { version: cancelled.version, reason: 'Request cũ' })
    expect(stale.status).toBe(409)

    const [restoreAudit] = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.action, 'RESTORE'), eq(auditLogs.entityId, task.id)))
    expect(restoreAudit.oldValue).toContain('Tạm thời không còn nhân lực')
    expect(restoreAudit.newValue).toContain('Đây vẫn là điều kiện bắt buộc để đóng sự kiện')

    const closedEvent = await createEvent({ title: 'Event đã hủy' })
    const closedTask = await data(await request('/tasks', adminToken, 'POST', { eventId: closedEvent.id, title: 'Task trong event đóng' }))
    const closedAssignment = await data(await request(`/tasks/${closedTask.id}/assign`, adminToken, 'POST', { version: closedTask.version, userId: ownerId, assignmentRole: 'OWNER' }))
    const closedPlanning = await data(await request(`/events/${closedEvent.id}/transition`, adminToken, 'POST', { version: closedEvent.version, status: 'PLANNING' }))
    expect((await request(`/tasks/${closedTask.id}/acknowledge`, ownerToken, 'POST', { assignmentId: closedAssignment.assignment.id, version: closedAssignment.assignment.version, status: 'ACCEPTED' })).status).toBe(200)
    const closedCancelledTask = await data(await request(`/tasks/${closedTask.id}/transition`, ownerToken, 'POST', { version: closedAssignment.taskVersion, status: 'CANCELLED', cancellationReason: 'Hủy cùng event' }))
    expect((await request(`/events/${closedEvent.id}/transition`, adminToken, 'POST', { version: closedPlanning.version, status: 'CANCELLED', reason: 'Không tổ chức' })).status).toBe(200)
    const rejected = await request(`/tasks/${closedTask.id}/restore`, adminToken, 'POST', { version: closedCancelledTask.version, reason: 'Không được mở lại child của event đóng' })
    expect(rejected.status).toBe(409)
    expect((await rejected.json() as any).error.code).toBe('EVENT_IMMUTABLE')
  })

  it('restores a cancelled event back to planning with mandatory reason, OCC, and audit', async () => {
    const eventSuffix = `${Date.now()}-event`
    const event = await createEvent({ title: `Event hủy để khôi phục ${eventSuffix}` })
    const planning = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    const cancelled = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: planning.version, status: 'CANCELLED', reason: 'Hoãn kế hoạch tạm thời' }))

    // Missing reason -> 400
    expect((await request(`/events/${event.id}/restore`, adminToken, 'POST', { version: cancelled.version })).status).toBe(400)
    // Wrong parish -> 404
    expect((await request(`/events/${event.id}/restore`, foreignToken, 'POST', { version: cancelled.version, reason: 'Sai giáo xứ' })).status).toBe(404)

    const receipt = `restore-event-${eventSuffix}`
    const restoredResponse = await request(`/events/${event.id}/restore`, adminToken, 'POST', { version: cancelled.version, reason: 'Khởi động lại sự kiện' }, receipt)
    expect(restoredResponse.status).toBe(200)
    const restored = await data(restoredResponse)
    expect(restored).toMatchObject({ id: event.id, status: 'PLANNING', automationPaused: true, version: cancelled.version + 1 })

    // Idempotent replay
    const replay = await request(`/events/${event.id}/restore`, adminToken, 'POST', { version: cancelled.version, reason: 'Khởi động lại sự kiện' }, receipt)
    expect(replay.status).toBe(200)
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true')
    expect((await data(replay)).version).toBe(restored.version)

    // Stale version -> 409
    const stale = await request(`/events/${event.id}/restore`, adminToken, 'POST', { version: cancelled.version, reason: 'Request cũ' })
    expect(stale.status).toBe(409)

    // Already restored -> not cancelled -> 409
    const notCancelled = await request(`/events/${event.id}/restore`, adminToken, 'POST', { version: restored.version, reason: 'Khôi phục lần hai' })
    expect(notCancelled.status).toBe(409)

    const [restoreAudit] = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.action, 'RESTORE'), eq(auditLogs.entityId, event.id)))
    expect(restoreAudit.newValue).toContain('Khởi động lại sự kiện')
  })

  it('snapshots, previews, versions and atomically instantiates scoped event templates without copying authority state', async () => {
    const source = await createEvent({
      title: 'Trại nguồn v1', description: 'Nội dung riêng chỉ nằm trong snapshot mẫu', scopeUnitId: branchId,
      startsAt: '2026-10-01T01:00:00Z', endsAt: '2026-10-01T04:00:00Z', location: 'Sân xứ đoàn', expectedHeadcount: 80,
    })
    const sourceTask = await data(await request('/tasks', adminToken, 'POST', {
      eventId: source.id, title: 'Chuẩn bị cổng trại', description: 'Dựng cổng chính', phase: 'PREPARATION', priority: 'HIGH',
      isRequired: true, dueAt: '2026-10-01T00:00:00Z', scheduledStartAt: '2026-10-01T01:30:00Z', scheduledEndAt: '2026-10-01T02:30:00Z',
    }))
    const checklistResult = await data(await request(`/tasks/${sourceTask.id}/checklist`, adminToken, 'POST', { version: sourceTask.version, label: 'Kiểm tra độ chắc chắn', isRequired: true, sortOrder: 2 }))
    const assignment = await data(await request(`/tasks/${sourceTask.id}/assign`, adminToken, 'POST', { version: checklistResult.taskVersion, userId: ownerId, assignmentRole: 'OWNER' }))
    expect(assignment.assignment.acknowledgementStatus).toBe('PENDING')
    const publishedSource = await data(await request(`/events/${source.id}/transition`, adminToken, 'POST', { version: source.version, status: 'PLANNING' }))

    const createKey = `template-create-${suffix}`
    const createdResponse = await request(`/events/${source.id}/templates`, leaderToken, 'POST', { eventVersion: publishedSource.version, name: 'Mẫu trại Ngành Thiếu', description: 'Mẫu nội bộ của ngành' }, createKey)
    expect(createdResponse.status).toBe(201)
    const template = await data(createdResponse)
    expect(template).toMatchObject({ parishId: parishA, scopeUnitId: branchId, latestVersion: 1, version: 1, isActive: true })
    const replay = await request(`/events/${source.id}/templates`, leaderToken, 'POST', { eventVersion: publishedSource.version, name: 'Mẫu trại Ngành Thiếu', description: 'Mẫu nội bộ của ngành' }, createKey)
    expect(replay.status).toBe(200)
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true')
    expect((await data(replay)).id).toBe(template.id)

    const leaderTemplates = await data(await request('/templates', leaderToken))
    expect(leaderTemplates).toEqual(expect.arrayContaining([expect.objectContaining({ id: template.id })]))
    const committeeTemplates = await data(await request('/templates', committeeLeaderToken))
    expect(committeeTemplates.map((item: any) => item.id)).not.toContain(template.id)
    expect((await request(`/templates/${template.id}/preview?startsAt=${encodeURIComponent('2027-02-01T01:00:00Z')}`, foreignToken)).status).toBe(404)

    const previewV1 = await data(await request(`/templates/${template.id}/preview?version=1&startsAt=${encodeURIComponent('2027-02-01T01:00:00Z')}`, leaderToken))
    expect(previewV1.preview.event).toMatchObject({ title: 'Trại nguồn v1', startsAt: '2027-02-01T01:00:00.000Z', endsAt: '2027-02-01T04:00:00.000Z' })
    expect(previewV1.preview.tasks).toEqual([
      expect.objectContaining({ title: 'Chuẩn bị cổng trại', phase: 'PREPARATION', dueAt: '2027-02-01T00:00:00.000Z', scheduledStartAt: '2027-02-01T01:30:00.000Z', scheduledEndAt: '2027-02-01T02:30:00.000Z', checklist: [expect.objectContaining({ label: 'Kiểm tra độ chắc chắn', isRequired: true, sortOrder: 2 })] }),
    ])
    expect(previewV1.preview.tasks[0]).not.toHaveProperty('status')

    const organizerCandidatesResponse = await request(`/candidates?eventId=${source.id}&limit=500`, leaderToken)
    expect(organizerCandidatesResponse.status, await organizerCandidatesResponse.clone().text()).toBe(200)
    expect((await data(organizerCandidatesResponse)).map((candidate: any) => candidate.userId)).toContain(leaderId)

    const instantiateKey = `template-instantiate-${suffix}`
    const instantiatedResponse = await request(`/templates/${template.id}/instantiate`, leaderToken, 'POST', {
      templateVersion: 1, startsAt: '2027-02-01T08:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh', visibility: 'INTERNAL', organizerUserId: leaderId,
    }, instantiateKey)
    expect(instantiatedResponse.status, await instantiatedResponse.clone().text()).toBe(201)
    const instantiated = await data(instantiatedResponse)
    expect(instantiated.event).toMatchObject({ parishId: parishA, scopeUnitId: branchId, sourceTemplateId: template.id, sourceTemplateVersion: 1, status: 'DRAFT', startsAt: '2027-02-01T01:00:00.000Z' })
    expect(instantiated.tasks).toEqual([expect.objectContaining({ operationEventId: instantiated.event.id, status: 'TODO', dueAt: '2027-02-01T00:00:00.000Z', scheduledStartAt: '2027-02-01T01:30:00.000Z', scheduledEndAt: '2027-02-01T02:30:00.000Z' })])
    expect(instantiated.tasks[0]).not.toHaveProperty('approvalStatus')
    expect(instantiated.checklist).toEqual([expect.objectContaining({ taskId: instantiated.tasks[0].id, label: 'Kiểm tra độ chắc chắn', isDone: false })])
    expect(await db.select().from(operationTaskAssignees).where(and(eq(operationTaskAssignees.parishId, parishA), eq(operationTaskAssignees.taskId, instantiated.tasks[0].id)))).toHaveLength(0)
    const instantiateReplay = await request(`/templates/${template.id}/instantiate`, leaderToken, 'POST', {
      templateVersion: 1, startsAt: '2027-02-01T08:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh', visibility: 'INTERNAL', organizerUserId: leaderId,
    }, instantiateKey)
    expect(instantiateReplay.status).toBe(200)
    expect((await data(instantiateReplay)).event.id).toBe(instantiated.event.id)

    const updatedSource = await data(await request(`/events/${source.id}`, leaderToken, 'PUT', { version: publishedSource.version, title: 'Trại nguồn v2' }))
    const version2Response = await request(`/templates/${template.id}/versions`, leaderToken, 'POST', {
      expectedVersion: 1, expectedLatestVersion: 1, sourceEventId: source.id, sourceEventVersion: updatedSource.version, reason: 'Chuẩn hóa tên chương trình',
    })
    expect(version2Response.status).toBe(201)
    expect(await data(version2Response)).toMatchObject({ id: template.id, latestVersion: 2, version: 2 })
    const staleVersion = await request(`/templates/${template.id}/versions`, leaderToken, 'POST', {
      expectedVersion: 1, expectedLatestVersion: 1, sourceEventId: source.id, sourceEventVersion: updatedSource.version, reason: 'Request cũ',
    })
    expect(staleVersion.status).toBe(409)
    const oldPreview = await data(await request(`/templates/${template.id}/preview?version=1&startsAt=${encodeURIComponent('2027-03-01T01:00:00Z')}`, leaderToken))
    const latestPreview = await data(await request(`/templates/${template.id}/preview?startsAt=${encodeURIComponent('2027-03-01T01:00:00Z')}`, leaderToken))
    expect(oldPreview.preview.event.title).toBe('Trại nguồn v1')
    expect(latestPreview.preview.event.title).toBe('Trại nguồn v2')

    expect((await request(`/templates/${template.id}/archive`, leaderToken, 'POST', { expectedVersion: 2, expectedLatestVersion: 2 })).status).toBe(400)
    expect((await request(`/templates/${template.id}/archive`, committeeLeaderToken, 'POST', { expectedVersion: 2, expectedLatestVersion: 2, reason: 'Ngoài phạm vi' })).status).toBe(403)
    expect((await request(`/templates/${template.id}/archive`, foreignToken, 'POST', { expectedVersion: 2, expectedLatestVersion: 2, reason: 'Sai giáo xứ' })).status).toBe(404)
    expect((await request(`/templates/${template.id}/archive`, leaderToken, 'POST', { expectedVersion: 2, expectedLatestVersion: 1, reason: 'Phiên bản cũ' })).status).toBe(409)
    const archiveKey = `template-archive-${suffix}`
    const archivedResponse = await request(`/templates/${template.id}/archive`, leaderToken, 'POST', { expectedVersion: 2, expectedLatestVersion: 2, reason: 'Tạm ẩn mẫu để rà soát' }, archiveKey)
    expect(archivedResponse.status).toBe(200)
    expect(await data(archivedResponse)).toMatchObject({ id: template.id, latestVersion: 2, version: 3, isActive: false })
    const archivedReplay = await request(`/templates/${template.id}/archive`, leaderToken, 'POST', { expectedVersion: 2, expectedLatestVersion: 2, reason: 'Tạm ẩn mẫu để rà soát' }, archiveKey)
    expect(archivedReplay.status).toBe(200)
    expect(archivedReplay.headers.get('Idempotency-Replayed')).toBe('true')
    expect((await data(await request('/templates', leaderToken))).map((item: any) => item.id)).not.toContain(template.id)
    expect(await data(await request('/templates?archived=true', leaderToken))).toEqual(expect.arrayContaining([expect.objectContaining({ id: template.id, isActive: false })]))
    expect((await request(`/templates/${template.id}/preview?startsAt=${encodeURIComponent('2027-03-01T01:00:00Z')}`, leaderToken)).status).toBe(404)
    expect((await request(`/templates/${template.id}/versions`, leaderToken, 'POST', { expectedVersion: 3, expectedLatestVersion: 2, sourceEventId: source.id, sourceEventVersion: updatedSource.version, reason: 'Không sửa mẫu đã archive' })).status).toBe(404)
    expect((await request(`/templates/${template.id}/instantiate`, leaderToken, 'POST', { templateVersion: 2, startsAt: '2027-04-01T01:00:00Z', timezone: 'Asia/Ho_Chi_Minh' })).status).toBe(404)
    expect((await request(`/templates/${template.id}/archive`, leaderToken, 'POST', { expectedVersion: 3, expectedLatestVersion: 2, reason: 'Không archive hai lần' })).status).toBe(409)
    expect((await request(`/templates/${template.id}/restore`, leaderToken, 'POST', { expectedVersion: 3, expectedLatestVersion: 2 })).status).toBe(400)
    expect((await request(`/templates/${template.id}/restore`, committeeLeaderToken, 'POST', { expectedVersion: 3, expectedLatestVersion: 2, reason: 'Ngoài phạm vi' })).status).toBe(403)
    expect((await request(`/templates/${template.id}/restore`, foreignToken, 'POST', { expectedVersion: 3, expectedLatestVersion: 2, reason: 'Sai giáo xứ' })).status).toBe(404)
    expect((await request(`/templates/${template.id}/restore`, leaderToken, 'POST', { expectedVersion: 2, expectedLatestVersion: 2, reason: 'Command cũ' })).status).toBe(409)

    const restoreKey = `template-restore-${suffix}`
    const restoredResponse = await request(`/templates/${template.id}/restore`, leaderToken, 'POST', { expectedVersion: 3, expectedLatestVersion: 2, reason: 'Đã rà soát xong' }, restoreKey)
    expect(restoredResponse.status).toBe(200)
    expect(await data(restoredResponse)).toMatchObject({ id: template.id, latestVersion: 2, version: 4, isActive: true })
    const restoredReplay = await request(`/templates/${template.id}/restore`, leaderToken, 'POST', { expectedVersion: 3, expectedLatestVersion: 2, reason: 'Đã rà soát xong' }, restoreKey)
    expect(restoredReplay.status).toBe(200)
    expect(restoredReplay.headers.get('Idempotency-Replayed')).toBe('true')
    expect((await request(`/templates/${template.id}/restore`, leaderToken, 'POST', { expectedVersion: 4, expectedLatestVersion: 2, reason: 'Không restore hai lần' })).status).toBe(409)
    expect((await request(`/templates/${template.id}/archive`, leaderToken, 'POST', { expectedVersion: 3, expectedLatestVersion: 2, reason: 'Command lifecycle cũ sau vòng archive/restore' })).status).toBe(409)
    expect((await data(await request('/templates', leaderToken))).map((item: any) => item.id)).toContain(template.id)
    expect((await data(await request('/templates?archived=true', leaderToken))).map((item: any) => item.id)).not.toContain(template.id)

    const [templateAudit] = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.entityType, 'operation_event_template'), eq(auditLogs.entityId, template.id), eq(auditLogs.action, 'CREATE')))
    expect(templateAudit.newValue).not.toContain('Nội dung riêng chỉ nằm trong snapshot mẫu')
    const lifecycleAudits = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.entityType, 'operation_event_template'), eq(auditLogs.entityId, template.id)))
    expect(lifecycleAudits).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'ARCHIVE', newValue: expect.stringContaining('Tạm ẩn mẫu để rà soát') }),
      expect.objectContaining({ action: 'RESTORE', newValue: expect.stringContaining('Đã rà soát xong') }),
    ]))
  })

  it('rejects mixed resource identifiers instead of combining unrelated operational roles', async () => {
    const organizedEvent = await createEvent({ title: 'Event do owner tổ chức', organizerUserId: ownerId })
    const unrelatedEvent = await createEvent({ title: 'Event không liên quan' })
    const unrelatedTask = await data(await request('/tasks', adminToken, 'POST', { eventId: unrelatedEvent.id, title: 'Task không liên quan' }))

    const permissions = await data(await request(`/permissions?eventId=${organizedEvent.id}&taskId=${unrelatedTask.id}`, ownerToken))
    expect(Object.values(permissions.permissions)).toEqual(expect.arrayContaining([false]))
    expect(Object.values(permissions.permissions).every(value => value === false)).toBe(true)
  })

  it('scopes workstream lead powers and expires operational memberships', async () => {
    const event = await createEvent({ title: 'Event có workstream' })
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { eventId: event.id, name: 'Hậu cần' }))
    const member = await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', { version: 1, userId: ownerId, operationRole: 'WORKSTREAM_LEAD' })
    expect(member.status).toBe(201)
    const memberRow = await data(member)
    const planning = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    const leadTask = await request('/tasks', ownerToken, 'POST', { workstreamId: workstream.id, title: 'Mua nước' })
    expect(leadTask.status).toBe(201)
    const eventTransition = await request(`/events/${event.id}/transition`, ownerToken, 'POST', { version: planning.version, status: 'PREPARING' })
    expect(eventTransition.status).toBe(403)

    const removed = await request(`/workstreams/${workstream.id}/members/${memberRow.id}/remove`, adminToken, 'POST', { version: 2, memberVersion: 1, reason: 'Đổi trưởng nhóm' })
    expect(removed.status).toBe(200)
    const ownerPermissions = await data(await request(`/permissions?workstreamId=${workstream.id}`, ownerToken))
    expect(ownerPermissions.permissions['operations.task.manage']).toBe(false)

    const expiredMember = await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', { version: 3, userId: expiredLeaderId, operationRole: 'OBSERVER', startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-12-31T23:59:59Z' })
    expect(expiredMember.status).toBe(201)
    const permissions = await data(await request(`/permissions?workstreamId=${workstream.id}`, expiredLeaderToken))
    expect(permissions.permissions['operations.task.view']).toBe(false)
  })

  it('keeps stale OCC commands atomic and auditable', async () => {
    const [before] = await db.select({ version: operationTasks.version }).from(operationTasks).where(and(eq(operationTasks.parishId, parishA), eq(operationTasks.id, taskId)))
    const stale = await request(`/tasks/${taskId}`, adminToken, 'PUT', { version: 1, title: 'Stale update' })
    expect(stale.status).toBe(409)
    expect((await stale.json() as any).error.code).toBe('VERSION_CONFLICT')
    const [after] = await db.select({ version: operationTasks.version }).from(operationTasks).where(and(eq(operationTasks.parishId, parishA), eq(operationTasks.id, taskId)))
    expect(after.version).toBe(before.version)
  })

  it('revokes an assignment atomically before allowing a replacement owner', async () => {
    const replacementTask = await data(await request('/tasks', adminToken, 'POST', { title: 'Thay người phụ trách' }))
    const first = await data(await request(`/tasks/${replacementTask.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    const removed = await request(`/tasks/${replacementTask.id}/assignments/${first.assignment.id}/remove`, adminToken, 'POST', { version: 2, assignmentVersion: 1, reason: 'Người cũ bận' })
    expect(removed.status).toBe(200)
    const replacement = await request(`/tasks/${replacementTask.id}/assign`, adminToken, 'POST', { version: 3, userId: contributorId, assignmentRole: 'OWNER' })
    expect(replacement.status).toBe(201)
  })

  it('validates blockout ownership and surfaces assignment conflicts without bypassing authority', async () => {
    const invalid = await request('/blockouts', ownerToken, 'POST', { startsAt: '2026-10-02T08:00:00+07:00', endsAt: '2026-10-02T09:00:00+07:00' })
    expect(invalid.status).toBe(400)
    const otherUser = await request('/blockouts', ownerToken, 'POST', { userId: contributorId, startsAt: '2026-10-02T08:00:00+07:00', endsAt: '2026-10-02T09:00:00+07:00' })
    expect(otherUser.status).toBe(403)
    const own = await request('/blockouts', ownerToken, 'POST', { userId: ownerId, startsAt: '2026-10-02T08:00:00+07:00', endsAt: '2026-10-02T09:00:00+07:00' })
    expect(own.status).toBe(201)
    const personId = `person-contributor-${suffix}`
    for (const target of [{ userId: contributorId }, { personId }]) {
      expect((await request('/blockouts', contributorToken, 'POST', { ...target, startsAt: '2026-10-02T08:00:00+07:00', endsAt: '2026-10-02T09:00:00+07:00', reason: 'Private appointment' })).status).toBe(201)
    }
    for (const target of [{ userId: contributorId }, { personId }]) {
      const scheduledTask = await data(await request('/tasks', adminToken, 'POST', { title: 'Warning parity', dueAt: '2026-10-02T08:30:00+07:00' }))
      const assigned = await data(await request(`/tasks/${scheduledTask.id}/assign`, adminToken, 'POST', { version: 1, ...target, assignmentRole: 'CONTRIBUTOR' }))
      expect(assigned.conflictWarnings).toHaveLength(2)
      expect(assigned.conflictWarnings.every((warning: object) => !('reason' in warning))).toBe(true)
    }
  })

  it('validates task shift windows and warns only for true interval overlap', async () => {
    expect((await request('/tasks', adminToken, 'POST', {
      title: 'Ca thiếu giờ kết thúc', scheduledStartAt: '2031-04-01T09:00:00Z',
    })).status).toBe(400)
    expect((await request('/tasks', adminToken, 'POST', {
      title: 'Ca đảo thời gian', scheduledStartAt: '2031-04-01T10:00:00Z', scheduledEndAt: '2031-04-01T09:00:00Z',
    })).status).toBe(400)

    const before = await data(await request('/blockouts', contributorToken, 'POST', {
      userId: contributorId, startsAt: '2031-04-01T08:00:00Z', endsAt: '2031-04-01T09:00:00Z', reason: 'Chạm biên trước',
    }))
    const overlap = await data(await request('/blockouts', contributorToken, 'POST', {
      userId: contributorId, startsAt: '2031-04-01T09:30:00Z', endsAt: '2031-04-01T10:30:00Z', reason: 'Giao ca riêng tư',
    }))
    const after = await data(await request('/blockouts', contributorToken, 'POST', {
      userId: contributorId, startsAt: '2031-04-01T10:00:00Z', endsAt: '2031-04-01T11:00:00Z', reason: 'Chạm biên sau',
    }))
    const task = await data(await request('/tasks', adminToken, 'POST', {
      title: 'Ca phục vụ chính', dueAt: '2031-04-01T18:00:00Z', scheduledStartAt: '2031-04-01T09:00:00Z', scheduledEndAt: '2031-04-01T10:00:00Z',
    }))
    expect(task).toMatchObject({ scheduledStartAt: '2031-04-01T09:00:00.000Z', scheduledEndAt: '2031-04-01T10:00:00.000Z' })
    const assigned = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: task.version, userId: contributorId, assignmentRole: 'CONTRIBUTOR' }))
    expect(assigned.conflictWarnings).toEqual([{ id: overlap.id, startsAt: '2031-04-01T09:30:00.000Z', endsAt: '2031-04-01T10:30:00.000Z' }])
    expect(assigned.conflictWarnings.map((warning: any) => warning.id)).not.toEqual(expect.arrayContaining([before.id, after.id]))
    expect(JSON.stringify(assigned.conflictWarnings)).not.toContain('Giao ca riêng tư')

    const invalidUpdate = await request(`/tasks/${task.id}`, adminToken, 'PUT', { version: assigned.taskVersion, scheduledStartAt: '2031-04-01T11:30:00Z' })
    expect(invalidUpdate.status).toBe(400)
    expect((await invalidUpdate.json() as any).error.code).toBe('INVALID_TASK_SCHEDULE')
    const cleared = await data(await request(`/tasks/${task.id}`, adminToken, 'PUT', { version: assigned.taskVersion, scheduledStartAt: null, scheduledEndAt: null }))
    expect(cleared.task).toMatchObject({ scheduledStartAt: null, scheduledEndAt: null, version: assigned.taskVersion + 1 })
  })

  it('cancels pending reminders atomically with receipts and refuses already queued delivery', async () => {
    const event = await createEvent({ organizerUserId: ownerId })
    await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    const reminder = await data(await request('/reminders', adminToken, 'POST', { eventId: event.id, recipientUserId: ownerId, triggerAt: '2099-01-01T00:00:00Z', kind: 'EVENT_START' }))
    expect((await request(`/reminders/${reminder.id}/cancel`, foreignToken, 'POST', { expectedVersion: reminder.version, reason: 'Foreign' })).status).toBe(404)
    expect((await request(`/reminders/${reminder.id}/cancel`, contributorToken, 'POST', { expectedVersion: reminder.version, reason: 'Unscoped' })).status).toBe(403)
    expect((await request(`/reminders/${reminder.id}/cancel`, ownerToken, 'POST', { reason: 'Legacy client' })).status).toBe(400)
    const receipt = `cancel-${suffix}`
    expect((await request(`/reminders/${reminder.id}/cancel`, ownerToken, 'POST', { expectedVersion: reminder.version, reason: 'Không cần' }, receipt)).status).toBe(200)
    expect((await request(`/reminders/${reminder.id}/cancel`, ownerToken, 'POST', { expectedVersion: reminder.version, reason: 'Không cần' }, receipt)).status).toBe(200)
    const [stored] = await db.select().from(operationReminders).where(eq(operationReminders.id, reminder.id))
    expect(stored).toMatchObject({ status: 'CANCELLED', version: reminder.version + 1 })
    expect(stored.notificationId).toBeNull()
    const queued = await data(await request('/reminders', adminToken, 'POST', { eventId: event.id, recipientUserId: ownerId, triggerAt: '2099-01-02T00:00:00Z', kind: 'EVENT_START' }))
    await db.update(operationReminders).set({ status: 'ENQUEUED' }).where(eq(operationReminders.id, queued.id))
    expect((await request(`/reminders/${queued.id}/cancel`, ownerToken, 'POST', { expectedVersion: queued.version, reason: 'Quá muộn' })).status).toBe(409)
  })

  it('reschedules with OCC and prevents a worker candidate from enqueueing the old due time', async () => {
    const event = await createEvent({ organizerUserId: ownerId })
    await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    const original = await data(await request('/reminders', adminToken, 'POST', { eventId: event.id, recipientUserId: ownerId, triggerAt: '2020-01-01T00:00:00Z', kind: 'EVENT_START' }))
    expect(original.version).toBe(1)

    let interleaved = false
    const run = await processDueOperationReminders(new Date('2026-10-01T00:00:00Z'), {
      beforeClaim: async candidate => {
        if (candidate.id !== original.id || interleaved) return
        interleaved = true
        const changed = await request(`/reminders/${original.id}/reschedule`, adminToken, 'POST', {
          expectedVersion: original.version,
          triggerAt: '2099-03-01T00:00:00Z',
          reason: 'Dời giờ sự kiện',
        }, `reschedule-race-${suffix}`)
        expect(changed.status).toBe(200)
        expect(await data(changed)).toMatchObject({ id: original.id, status: 'PENDING', version: 2, triggerAt: '2099-03-01T00:00:00.000Z' })
      },
    })
    expect(interleaved).toBe(true)
    expect(run.enqueued).toBe(0)
    expect(await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-${original.id}`)))).toHaveLength(0)
    const [stored] = await db.select().from(operationReminders).where(and(eq(operationReminders.parishId, parishA), eq(operationReminders.id, original.id)))
    expect(stored).toMatchObject({ status: 'PENDING', version: 2, triggerAt: '2099-03-01T00:00:00.000Z', nextAttemptAt: null, error: null })

    const resourceList = await request(`/reminders?eventId=${event.id}`, ownerToken)
    expect(resourceList.status).toBe(200)
    const visible = await data(resourceList)
    expect(visible).toEqual(expect.arrayContaining([expect.objectContaining({ id: original.id, recipientUserId: ownerId, version: 2 })]))
    expect(visible[0]).not.toHaveProperty('dedupeKey')
    expect(visible[0]).not.toHaveProperty('notificationId')
    expect((await request(`/reminders?eventId=${event.id}`, foreignToken)).status).toBe(403)

    const stale = await request(`/reminders/${original.id}/reschedule`, adminToken, 'POST', { expectedVersion: 1, triggerAt: '2099-04-01T00:00:00Z', reason: 'Stale edit' })
    expect(stale.status).toBe(409)
    expect((await stale.json() as any).error.code).toBe('VERSION_CONFLICT')

    const collision = await data(await request('/reminders', adminToken, 'POST', { eventId: event.id, recipientUserId: ownerId, triggerAt: '2099-04-01T00:00:00Z', kind: 'EVENT_START' }))
    expect(collision.id).not.toBe(original.id)
    const collisionEdit = await request(`/reminders/${original.id}/reschedule`, adminToken, 'POST', { expectedVersion: 2, triggerAt: collision.triggerAt, reason: 'Trùng lịch hiện tại' })
    expect(collisionEdit.status).toBe(409)
    const [unchanged] = await db.select().from(operationReminders).where(and(eq(operationReminders.parishId, parishA), eq(operationReminders.id, original.id)))
    expect(unchanged).toMatchObject({ version: 2, triggerAt: '2099-03-01T00:00:00.000Z' })
  })

  it('persists reminder delivery through the shared queue and reconciles provider outcome', async () => {
    const parentReminder = await request('/reminders', adminToken, 'POST', { taskId, recipientUserId: parentId, triggerAt: '2020-01-01T00:00:00Z', kind: 'TASK_DUE' })
    expect(parentReminder.status).toBe(400)
    expect((await parentReminder.json() as any).error.code).toBe('INVALID_OPERATIONS_TARGET')

    const reminderBody = { taskId, recipientUserId: ownerId, triggerAt: '2020-01-01T00:00:00Z', kind: 'TASK_DUE' }
    const stableKey = `reminder-${suffix}`
    const created = await request('/reminders', adminToken, 'POST', reminderBody, stableKey)
    expect(created.status).toBe(201)
    const reminder = await data(created)
    const replay = await request('/reminders', adminToken, 'POST', reminderBody, stableKey)
    expect(replay.status).toBe(200)
    expect((await data(replay)).id).toBe(reminder.id)
    const duplicate = await request('/reminders', adminToken, 'POST', reminderBody)
    expect(duplicate.status).toBe(409)

    const run = await processDueOperationReminders(new Date('2026-10-01T00:00:00Z'))
    expect(run.enqueued).toBeGreaterThanOrEqual(1)
    const [queued] = await db.select().from(operationReminders).where(and(eq(operationReminders.parishId, parishA), eq(operationReminders.id, reminder.id)))
    expect(queued.status).toBe('ENQUEUED')
    expect(queued.notificationId).toBeTruthy()
    const [notification] = await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, queued.notificationId!)))
    expect(notification.status).toBe('retrying')
    expect(notification.message).toBe('Bạn có nhắc việc mới trong Catevia. Vui lòng đăng nhập để xem.')
    expect(notification.message).not.toContain('Chuẩn bị nghi thức')

    // Simulate damaged reminder state after the durable notification already exists.
    // Reconciliation must reattach the deterministic queue row, not enqueue a duplicate.
    await db.update(operationReminders).set({ status: 'PENDING', notificationId: null, enqueuedAt: null }).where(and(eq(operationReminders.parishId, parishA), eq(operationReminders.id, reminder.id)))
    await processDueOperationReminders(new Date('2026-10-01T00:00:01Z'))
    const reminderNotifications = await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-${reminder.id}`)))
    expect(reminderNotifications).toHaveLength(1)
    const [reattached] = await db.select().from(operationReminders).where(and(eq(operationReminders.parishId, parishA), eq(operationReminders.id, reminder.id)))
    expect(reattached.notificationId).toBe(`NOT-${reminder.id}`)

    await db.update(notifications).set({ status: 'sent', sentAt: '2026-10-01T00:00:05Z' }).where(and(eq(notifications.parishId, parishA), eq(notifications.id, reattached.notificationId!)))
    const reconciled = await processDueOperationReminders(new Date('2026-10-01T00:00:10Z'))
    expect(reconciled.delivered).toBeGreaterThanOrEqual(1)
    const [sent] = await db.select().from(operationReminders).where(and(eq(operationReminders.parishId, parishA), eq(operationReminders.id, reminder.id)))
    expect(sent.status).toBe('SENT')

    const inboxResponse = await request('/reminders/inbox', ownerToken)
    expect(inboxResponse.status).toBe(200)
    const inbox = await data(inboxResponse)
    const inboxReminder = inbox.find((item: any) => item.id === reminder.id)
    expect(inboxReminder).toMatchObject({ id: reminder.id, parishId: parishA, status: 'SENT', kind: 'TASK_DUE', taskId, eventId: null })
    expect(inboxReminder).not.toHaveProperty('dedupeKey')
    expect(inboxReminder).not.toHaveProperty('notificationId')
    expect(inboxReminder).not.toHaveProperty('attemptCount')
    expect(inboxReminder).not.toHaveProperty('error')
    // W1.2: recipient-scoped resource pointers (taskId/eventId) are projected so
    // the inbox can resolve titles from the recipient's own scoped lists; the
    // recipient identity itself and queue internals remain absent.
    expect(inboxReminder).not.toHaveProperty('recipientUserId')

    const ambiguous = await data(await request('/reminders', adminToken, 'POST', { ...reminderBody, kind: 'OVERDUE' }))
    await processDueOperationReminders(new Date('2026-10-01T00:00:20Z'))
    await db.delete(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-${ambiguous.id}`)))
    await processDueOperationReminders(new Date('2026-10-01T00:00:30Z'))
    const [failed] = await db.select().from(operationReminders).where(and(eq(operationReminders.parishId, parishA), eq(operationReminders.id, ambiguous.id)))
    expect(failed).toMatchObject({ status: 'FAILED', error: 'MISSING_NOTIFICATION_ROW' })
    await processDueOperationReminders(new Date('2026-10-01T00:00:40Z'))
    expect(await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-${ambiguous.id}`)))).toHaveLength(0)
  })

  it('terminally suppresses a due reminder after the recipient loses resource access', async () => {
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Reminder authority recheck' }))
    const assignment = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: contributorId, assignmentRole: 'CONTRIBUTOR' }))
    expect((await request(`/tasks/${task.id}/acknowledge`, contributorToken, 'POST', { assignmentId: assignment.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    const reminder = await data(await request('/reminders', adminToken, 'POST', { taskId: task.id, recipientUserId: contributorId, triggerAt: '2020-01-01T00:00:00Z', kind: 'TASK_DUE' }))
    expect((await request(`/tasks/${task.id}/assignments/${assignment.assignment.id}/remove`, adminToken, 'POST', { version: assignment.taskVersion, assignmentVersion: 2, reason: 'Recipient no longer assigned' })).status).toBe(200)

    await processDueOperationReminders(new Date('2026-10-01T00:00:00Z'))
    const [failed] = await db.select().from(operationReminders).where(and(eq(operationReminders.parishId, parishA), eq(operationReminders.id, reminder.id)))
    expect(failed).toMatchObject({ status: 'FAILED', error: 'RECIPIENT_NOT_AUTHORIZED' })
    expect(await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-${reminder.id}`)))).toHaveLength(0)
  })

  it('terminally suppresses a stale reminder after its task is completed or cancelled', async () => {
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Reminder for terminal task' }))
    const assignment = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    expect((await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: assignment.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    const reminder = await data(await request('/reminders', adminToken, 'POST', { taskId: task.id, recipientUserId: ownerId, triggerAt: '2020-01-01T00:00:00Z', kind: 'TASK_DUE' }))
    expect((await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: assignment.taskVersion, status: 'CANCELLED', cancellationReason: 'Không còn cần thực hiện' })).status).toBe(200)

    await processDueOperationReminders(new Date('2026-10-01T00:00:00Z'))
    const [failed] = await db.select().from(operationReminders).where(and(eq(operationReminders.parishId, parishA), eq(operationReminders.id, reminder.id)))
    expect(failed).toMatchObject({ status: 'FAILED', error: 'RESOURCE_TERMINAL' })
    expect(await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-${reminder.id}`)))).toHaveLength(0)
  })

  it('stores comments but keeps sensitive content out of generic audit payloads', async () => {
    const created = await request(`/tasks/${taskId}/comments`, ownerToken, 'POST', { content: 'Đã liên hệ ban hậu cần', evidenceUrl: 'https://example.test/evidence/1' })
    expect(created.status).toBe(201)
    const comment = await data(created)
    const [auditRow] = await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parishA), eq(auditLogs.action, 'COMMENT'), eq(auditLogs.entityId, taskId)))
    expect(auditRow.newValue).not.toContain('Đã liên hệ ban hậu cần')
    expect(auditRow.newValue).toContain(comment.id)
    expect((await request(`/tasks/${taskId}/comments`, ownerToken, 'POST', { content: 'Bad URL', evidenceUrl: 'http://example.test' })).status).toBe(400)
  })

  it('invites a reserve at 70 percent and atomically assigns the first valid acceptance', async () => {
    const event = await createEvent({ title: 'Phân công chính và dự bị', scopeUnitId: branchId, startsAt: '2035-01-01T08:00:00Z', endsAt: '2035-01-01T12:00:00Z' })
    const task = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Trực cổng chính' }))
    const dispatchResponse = await request(`/tasks/${task.id}/dispatch`, adminToken, 'POST', {
      version: task.version, primaryUserId: ownerId, reserveUserId: contributorId, acknowledgeBy: '2034-01-01T00:00:00Z',
    })
    expect(dispatchResponse.status).toBe(201)
    const scheduled = await data(dispatchResponse)
    expect(scheduled.dispatch).toMatchObject({ status: 'SCHEDULED', primaryInvitedAt: null, reserveInviteAt: null, version: 1 })
    expect(await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-OPS-DISPATCH-${scheduled.dispatch.id}-PRIMARY`)))).toHaveLength(0)
    const ownerBypass = await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: scheduled.taskVersion, userId: ownerId, assignmentRole: 'OWNER' })
    expect(ownerBypass.status).toBe(409)
    expect((await ownerBypass.json() as any).error.code).toBe('TASK_DISPATCH_ACTIVE')

    const planning = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    expect(planning.status).toBe('PLANNING')
    const [pending] = await db.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, parishA), eq(operationTaskDispatches.id, scheduled.dispatch.id)))
    expect(pending).toMatchObject({ status: 'PENDING', version: 2 })
    expect(pending.primaryInvitedAt).toBeTruthy()
    expect(pending.reserveInviteAt).toBeTruthy()
    expect(await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-OPS-DISPATCH-${pending.id}-PRIMARY`)))).toHaveLength(1)
    expect(await data(await request('/dispatches/inbox', ownerToken))).toEqual([
      expect.objectContaining({ id: pending.id, taskId: task.id, target: 'PRIMARY', taskTitle: 'Trực cổng chính', eventTitle: 'Phân công chính và dự bị' }),
    ])
    expect(await data(await request('/dispatches/inbox', contributorToken))).toEqual([])

    const hiddenAgain = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: planning.version, status: 'DRAFT', reason: 'Điều chỉnh lại nội dung nháp' }))
    expect(await data(await request('/dispatches/inbox', ownerToken))).toEqual([])
    const hiddenAcceptance = await request(`/tasks/${task.id}/dispatches/${pending.id}/accept`, ownerToken, 'POST', { version: pending.version, target: 'PRIMARY' })
    expect(hiddenAcceptance.status).toBe(409)
    expect((await hiddenAcceptance.json() as any).error.code).toBe('DISPATCH_EVENT_NOT_OPEN')
    expect((await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: hiddenAgain.version, status: 'PLANNING' })).status).toBe(200)

    await processDueOperationTaskDispatches(new Date(new Date(pending.reserveInviteAt!).getTime() - 1))
    expect((await db.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, parishA), eq(operationTaskDispatches.id, pending.id))))[0].reserveInvitedAt).toBeNull()
    const reserveRun = await processDueOperationTaskDispatches(new Date(pending.reserveInviteAt!))
    expect(reserveRun.invited).toBeGreaterThanOrEqual(1)
    const [reserveInvited] = await db.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, parishA), eq(operationTaskDispatches.id, pending.id)))
    expect(reserveInvited).toMatchObject({ status: 'PENDING', version: 3, reserveInvitedAt: pending.reserveInviteAt })
    expect(await db.select().from(notifications).where(and(eq(notifications.parishId, parishA), eq(notifications.id, `NOT-OPS-DISPATCH-${pending.id}-RESERVE`)))).toHaveLength(1)
    expect(await data(await request('/dispatches/inbox', contributorToken))).toEqual([
      expect.objectContaining({ id: pending.id, target: 'RESERVE' }),
    ])

    const primaryWin = await request(`/tasks/${task.id}/dispatches/${pending.id}/accept`, ownerToken, 'POST', { version: reserveInvited.version, target: 'PRIMARY' })
    expect(primaryWin.status).toBe(200)
    const accepted = await data(primaryWin)
    expect(accepted).toMatchObject({ dispatch: { status: 'ACCEPTED', acceptedTarget: 'PRIMARY' }, assignment: { userId: ownerId, assignmentRole: 'OWNER', acknowledgementStatus: 'ACCEPTED' } })
    const reserveLost = await request(`/tasks/${task.id}/dispatches/${pending.id}/accept`, contributorToken, 'POST', { version: reserveInvited.version, target: 'RESERVE' })
    expect(reserveLost.status).toBe(409)
    expect((await reserveLost.json() as any).error.code).toBe('VERSION_CONFLICT')
    expect(await db.select().from(operationTaskAssignees).where(and(eq(operationTaskAssignees.parishId, parishA), eq(operationTaskAssignees.taskId, task.id), eq(operationTaskAssignees.assignmentRole, 'OWNER'), isNull(operationTaskAssignees.removedAt)))).toHaveLength(1)

    const reserveTask = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Trực cổng dự phòng' }))
    const immediate = await data(await request(`/tasks/${reserveTask.id}/dispatch`, adminToken, 'POST', {
      version: reserveTask.version, primaryUserId: ownerId, reserveUserId: contributorId, acknowledgeBy: '2034-02-01T00:00:00Z',
    }))
    expect(immediate.dispatch).toMatchObject({ status: 'PENDING', version: 1 })
    await processDueOperationTaskDispatches(new Date(immediate.dispatch.reserveInviteAt))
    const [secondInvited] = await db.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, parishA), eq(operationTaskDispatches.id, immediate.dispatch.id)))
    const reserveWin = await request(`/tasks/${reserveTask.id}/dispatches/${secondInvited.id}/accept`, contributorToken, 'POST', { version: secondInvited.version, target: 'RESERVE' })
    expect(reserveWin.status).toBe(200)
    expect(await data(reserveWin)).toMatchObject({ dispatch: { acceptedTarget: 'RESERVE' }, assignment: { userId: contributorId, acknowledgementStatus: 'ACCEPTED' } })
    expect((await request(`/tasks/${reserveTask.id}/dispatches/${secondInvited.id}/accept`, ownerToken, 'POST', { version: secondInvited.version, target: 'PRIMARY' })).status).toBe(409)
  })

  it('cancels open dispatches when their task or event is closed', async () => {
    const event = await createEvent({ title: 'Đóng lời mời', scopeUnitId: branchId, startsAt: '2035-01-01T08:00:00Z', endsAt: '2035-01-01T12:00:00Z' })
    const task = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Task bị hủy' }))
    const dispatch = await data(await request(`/tasks/${task.id}/dispatch`, adminToken, 'POST', {
      version: task.version, primaryUserId: ownerId, reserveUserId: contributorId, acknowledgeBy: '2034-01-01T00:00:00Z',
    }))
    const planning = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    const executor = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: dispatch.taskVersion, userId: ownerId, assignmentRole: 'CONTRIBUTOR' }))
    expect((await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: executor.assignment.id, version: executor.assignment.version, status: 'ACCEPTED' })).status).toBe(200)
    expect((await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: executor.taskVersion, status: 'CANCELLED', cancellationReason: 'Không còn cần công việc' })).status).toBe(200)
    expect((await db.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, parishA), eq(operationTaskDispatches.id, dispatch.dispatch.id))))[0].status).toBe('CANCELLED')

    const eventTask = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Task đóng cùng sự kiện' }))
    const eventDispatch = await data(await request(`/tasks/${eventTask.id}/dispatch`, adminToken, 'POST', {
      version: eventTask.version, primaryUserId: ownerId, acknowledgeBy: '2034-01-01T00:00:00Z',
    }))
    expect((await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: planning.version, status: 'CANCELLED', reason: 'Hủy sự kiện thử nghiệm' })).status).toBe(200)
    expect((await db.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, parishA), eq(operationTaskDispatches.id, eventDispatch.dispatch.id))))[0].status).toBe('CANCELLED')
  })

  it('converges due event phases with multi-instance CAS while preserving unfinished work', async () => {
    const starting = await createEvent({
      title: 'Tự động bắt đầu', startsAt: '2032-01-01T08:00:00Z', endsAt: '2032-01-01T12:00:00Z',
    })
    const startingPlanning = await data(await request(`/events/${starting.id}/transition`, adminToken, 'POST', { version: starting.version, status: 'PLANNING' }))

    const ending = await createEvent({
      title: 'Tự động hoàn thành', visibility: 'PUBLIC_SUMMARY', startsAt: '2032-01-01T08:00:00Z', endsAt: '2032-01-01T10:00:00Z',
    })
    const unfinishedTask = await data(await request('/tasks', adminToken, 'POST', { eventId: ending.id, title: 'Task còn dang dở', isRequired: true }))
    const unfinishedChecklist = await data(await request(`/tasks/${unfinishedTask.id}/checklist`, adminToken, 'POST', { version: unfinishedTask.version, label: 'Mục chưa đánh dấu', isRequired: true }))
    const unfinishedDispatch = await data(await request(`/tasks/${unfinishedTask.id}/dispatch`, adminToken, 'POST', {
      version: unfinishedChecklist.taskVersion, primaryUserId: ownerId, reserveUserId: contributorId, acknowledgeBy: '2033-01-01T00:00:00Z',
    }))
    const endingPlanning = await data(await request(`/events/${ending.id}/transition`, adminToken, 'POST', { version: ending.version, status: 'PLANNING' }))

    const paused = await createEvent({
      title: 'Tạm dừng tự động', startsAt: '2032-01-01T08:00:00Z', endsAt: '2032-01-01T12:00:00Z',
    })
    const pausedPlanning = await data(await request(`/events/${paused.id}/transition`, adminToken, 'POST', { version: paused.version, status: 'PLANNING' }))
    const pausedPreparing = await data(await request(`/events/${paused.id}/transition`, adminToken, 'POST', { version: pausedPlanning.version, status: 'PREPARING' }))
    const pausedAgain = await data(await request(`/events/${paused.id}/transition`, adminToken, 'POST', {
      version: pausedPreparing.version, status: 'PLANNING', reason: 'Tạm dừng kiểm tra tại hiện trường',
    }))

    const raced = await createEvent({
      title: 'Ứng viên bị instance khác cập nhật', startsAt: '2032-01-01T08:00:00Z', endsAt: '2032-01-01T12:00:00Z',
    })
    const racedPlanning = await data(await request(`/events/${raced.id}/transition`, adminToken, 'POST', { version: raced.version, status: 'PLANNING' }))
    let interleaved = false
    const run = await processDueOperationEventTransitions(new Date('2032-01-01T11:00:00Z'), {
      beforeClaim: async candidate => {
        if (candidate.id !== raced.id || interleaved) return
        interleaved = true
        await db.update(operationEvents).set({ version: racedPlanning.version + 1, updatedAt: '2032-01-01T10:59:59Z' }).where(and(
          eq(operationEvents.parishId, parishA), eq(operationEvents.id, raced.id), eq(operationEvents.version, racedPlanning.version),
        ))
      },
    })
    expect(interleaved).toBe(true)
    expect(run.started).toBeGreaterThanOrEqual(1)
    expect(run.completed).toBeGreaterThanOrEqual(1)
    expect(run.skipped).toBeGreaterThanOrEqual(1)

    const [startedRow] = await db.select().from(operationEvents).where(and(eq(operationEvents.parishId, parishA), eq(operationEvents.id, starting.id)))
    expect(startedRow).toMatchObject({ status: 'LIVE', version: startingPlanning.version + 1, updatedBy: 'SYSTEM_OPERATIONS_LIFECYCLE' })
    const [endingRow] = await db.select().from(operationEvents).where(and(eq(operationEvents.parishId, parishA), eq(operationEvents.id, ending.id)))
    expect(endingRow).toMatchObject({ status: 'COMPLETED', version: endingPlanning.version + 1 })
    expect(endingRow.outcomeSummary).toContain('còn 1 task và 1 mục checklist chưa hoàn tất')
    expect(endingRow.completionRecordId).toBeTruthy()
    const [completionRecord] = await db.select().from(parishRecords).where(and(eq(parishRecords.parishId, parishA), eq(parishRecords.id, endingRow.completionRecordId!)))
    expect(completionRecord).toMatchObject({ recordType: 'ACTIVITY', sourceEventId: endingPlanning.sourceParishEventId, summary: endingRow.outcomeSummary })
    const [unchangedTask] = await db.select().from(operationTasks).where(and(eq(operationTasks.parishId, parishA), eq(operationTasks.id, unfinishedTask.id)))
    const [unchangedChecklist] = await db.select().from(operationChecklistItems).where(and(eq(operationChecklistItems.parishId, parishA), eq(operationChecklistItems.id, unfinishedChecklist.item.id)))
    expect(unchangedTask.status).toBe('TODO')
    expect(unchangedChecklist.isDone).toBe(false)
    expect((await db.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, parishA), eq(operationTaskDispatches.id, unfinishedDispatch.dispatch.id))))[0].status).toBe('CANCELLED')

    const [pausedRow] = await db.select().from(operationEvents).where(and(eq(operationEvents.parishId, parishA), eq(operationEvents.id, paused.id)))
    expect(pausedRow).toMatchObject({ status: 'PLANNING', version: pausedAgain.version, automationPaused: true })
    const [racedRow] = await db.select().from(operationEvents).where(and(eq(operationEvents.parishId, parishA), eq(operationEvents.id, raced.id)))
    expect(racedRow).toMatchObject({ status: 'PLANNING', version: racedPlanning.version + 1 })
    const [autoStartAudit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishA), eq(auditLogs.entityId, starting.id), eq(auditLogs.action, 'AUTO_TRANSITION'),
    ))
    expect(autoStartAudit.newValue).toContain('"missedReady":true')
    expect(autoStartAudit.newValue).toContain('chưa ở trạng thái Sẵn sàng')
  })

  it('P1-1/P1-3: event-scoped dependency cycles and admin audit authorizationReason', async () => {
    const eventA = await createEvent({ title: 'P1 event A' })
    const eventB = await createEvent({ title: 'P1 event B' })
    const a1 = await data(await request('/tasks', adminToken, 'POST', { title: 'A1', eventId: eventA.id }))
    const a2 = await data(await request('/tasks', adminToken, 'POST', { title: 'A2', eventId: eventA.id }))
    const b1 = await data(await request('/tasks', adminToken, 'POST', { title: 'B1', eventId: eventB.id }))
    const b2 = await data(await request('/tasks', adminToken, 'POST', { title: 'B2', eventId: eventB.id }))

    expect((await request(`/tasks/${a2.id}/dependencies`, adminToken, 'POST', { version: 1, dependsOnTaskId: a1.id })).status).toBe(201)
    expect((await request(`/tasks/${b2.id}/dependencies`, adminToken, 'POST', { version: 1, dependsOnTaskId: b1.id })).status).toBe(201)
    // Cross-event dependency still rejected by same-event guard.
    expect((await request(`/tasks/${a1.id}/dependencies`, adminToken, 'POST', { version: 1, dependsOnTaskId: b1.id })).status).toBe(400)
    // Cycle detection remains correct inside event A even when event B also has edges.
    const cycle = await request(`/tasks/${a1.id}/dependencies`, adminToken, 'POST', { version: 1, dependsOnTaskId: a2.id })
    expect(cycle.status).toBe(409)

    const [createAudit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishA),
      eq(auditLogs.entityType, 'operation_event'),
      eq(auditLogs.entityId, eventA.id),
      eq(auditLogs.action, 'CREATE'),
    ))
    expect(createAudit?.newValue).toContain('"authorizationReason":"ADMIN_OVERRIDE"')

    // Prefer a scope with no EVENT_CREATOR/OPERATION_ROLE so ADMIN_OVERRIDE is visible.
    const decision = await resolveOperationsAuthorization(
      { userId: adminId, role: 'admin', parishId: parishA },
      'operations.event.create',
      { parishId: parishA, resourceUnitId: otherBranchId },
    )
    expect(decision).toMatchObject({ allowed: true, reason: 'ADMIN_OVERRIDE' })
  })

  it('P1-3: admin target-scope bypass is also stamped ADMIN_OVERRIDE in audit', async () => {
    // Standalone workstream rooted in branchId; the committee-leader person has
    // no service term in that unit tree, so a scoped actor would fail with
    // TARGET_OUTSIDE_ORGANIZATION_SCOPE while admin bypasses via parishWide.
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { name: 'P1-3 scope probe', sourceUnitId: branchId, isRequired: false }))
    const added = await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', {
      version: 1,
      personId: `person-committee-leader-${suffix}`,
      operationRole: 'OBSERVER',
    })
    expect(added.status).toBe(201)
    const [assignAudit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishA),
      eq(auditLogs.entityType, 'operation_workstream'),
      eq(auditLogs.entityId, workstream.id),
      eq(auditLogs.action, 'ASSIGN_MEMBER'),
    ))
    expect(assignAudit?.newValue).toContain('"authorizationReason":"ADMIN_OVERRIDE"')

    // Control: the same cross-unit assignment is rejected for a scoped leader.
    const leaderWorkstream = await data(await request('/workstreams', leaderToken, 'POST', { name: 'P1-3 leader scope', sourceUnitId: branchId, isRequired: false }))
    const outside = await request(`/workstreams/${leaderWorkstream.id}/members`, leaderToken, 'POST', {
      version: 1,
      personId: `person-committee-leader-${suffix}`,
      operationRole: 'OBSERVER',
    })
    expect(outside.status).toBe(403)
    expect(((await outside.json()) as any).error.code).toBe('TARGET_OUTSIDE_ORGANIZATION_SCOPE')
  })

  it('P1-12: marks workstreams READY/BLOCKED with OCC and a mandatory block reason', async () => {
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { name: 'P1-12 readiness', sourceUnitId: branchId, isRequired: false }))
    // BLOCKED without a reason fails closed and does not bump the version.
    expect((await request(`/workstreams/${workstream.id}/ready`, adminToken, 'POST', { version: 1, status: 'BLOCKED' })).status).toBe(400)
    const ready = await data(await request(`/workstreams/${workstream.id}/ready`, adminToken, 'POST', { version: 1, status: 'READY' }))
    expect(ready).toMatchObject({ status: 'READY', version: 2 })
    // Stale OCC base is rejected.
    expect((await request(`/workstreams/${workstream.id}/ready`, adminToken, 'POST', { version: 1, status: 'READY' })).status).toBe(409)
    const blocked = await data(await request(`/workstreams/${workstream.id}/ready`, adminToken, 'POST', { version: 2, status: 'BLOCKED', reason: 'Thiếu người trực' }))
    expect(blocked).toMatchObject({ status: 'BLOCKED', version: 3, blockedReason: 'Thiếu người trực' })
    const audits = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishA), eq(auditLogs.entityId, workstream.id), eq(auditLogs.action, 'MARK_READY'),
    ))
    expect(audits.length).toBeGreaterThanOrEqual(2)
  })

  it('P1-12: tracks reminder read state with OCC and per-recipient isolation', async () => {
    const event = await createEvent({ title: 'P1-12 reminder read', organizerUserId: ownerId })
    await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    const reminder = await data(await request('/reminders', adminToken, 'POST', { eventId: event.id, recipientUserId: ownerId, triggerAt: '2099-05-01T00:00:00Z', kind: 'EVENT_START' }))
    const first = await data(await request(`/reminders/${reminder.id}/read`, ownerToken, 'POST', {}))
    expect(first).toMatchObject({ id: reminder.id, version: reminder.version + 1 })
    expect(first.readAt).toBeTruthy()
    // A second read keeps the original readAt; the row stays recipient-owned.
    const second = await data(await request(`/reminders/${reminder.id}/read`, ownerToken, 'POST', {}))
    expect(second.readAt).toBe(first.readAt)
    expect(second.version).toBe(first.version + 1)
    // Stale OCC base and foreign identities fail closed.
    expect((await request(`/reminders/${reminder.id}/read`, ownerToken, 'POST', { expectedVersion: reminder.version })).status).toBe(409)
    expect((await request(`/reminders/${reminder.id}/read`, contributorToken, 'POST', {})).status).toBe(404)
    expect((await request(`/reminders/${reminder.id}/read`, foreignToken, 'POST', {})).status).toBe(404)
  })

  it('P1-12: lists task dispatches for viewers without leaking other tasks', async () => {
    const event = await createEvent({ title: 'P1-12 dispatch history', scopeUnitId: branchId, startsAt: '2035-03-01T08:00:00Z', endsAt: '2035-03-01T12:00:00Z' })
    const task = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Nhiệm vụ có lịch sử phân công' }))
    const dispatch = await data(await request(`/tasks/${task.id}/dispatch`, adminToken, 'POST', {
      version: task.version, primaryUserId: ownerId, acknowledgeBy: '2034-03-01T00:00:00Z',
    }))
    const listed = await data(await request(`/tasks/${task.id}/dispatches`, adminToken))
    expect(listed.map((row: { id: string }) => row.id)).toContain(dispatch.dispatch.id)
    expect(listed.every((row: { parishId: string; taskId: string }) => row.parishId === parishA && row.taskId === task.id)).toBe(true)
    // Unknown task IDs fail closed instead of leaking an empty oracle.
    expect((await request('/tasks/does-not-exist/dispatches', adminToken)).status).toBe(403)
    expect((await request(`/tasks/${task.id}/dispatches`, foreignToken)).status).toBe(403)
  })

  it('P1-12: dispatch worker skips a candidate mutated by a concurrent instance', async () => {
    const event = await createEvent({ title: 'P1-12 dispatch race', scopeUnitId: branchId, startsAt: '2035-04-01T08:00:00Z', endsAt: '2035-04-01T12:00:00Z' })
    const task = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Trực cổng đua' }))
    const created = await data(await request(`/tasks/${task.id}/dispatch`, adminToken, 'POST', {
      version: task.version, primaryUserId: ownerId, reserveUserId: contributorId, acknowledgeBy: '2034-04-01T00:00:00Z',
    }))
    await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: event.version, status: 'PLANNING' }))
    const [pending] = await db.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, parishA), eq(operationTaskDispatches.id, created.dispatch.id)))
    expect(pending.reserveInviteAt).toBeTruthy()
    // A concurrent instance claims the row first: the worker must skip, not double-invite.
    let interleaved = false
    const run = await processDueOperationTaskDispatches(new Date(pending.reserveInviteAt!), {
      beforeClaim: async candidate => {
        if (candidate.id !== pending.id || interleaved) return
        interleaved = true
        await db.update(operationTaskDispatches).set({ version: pending.version + 1 }).where(and(
          eq(operationTaskDispatches.parishId, parishA), eq(operationTaskDispatches.id, pending.id), eq(operationTaskDispatches.version, pending.version),
        ))
      },
    })
    expect(interleaved).toBe(true)
    expect(run.invited).toBe(0)
    const [stored] = await db.select().from(operationTaskDispatches).where(and(eq(operationTaskDispatches.parishId, parishA), eq(operationTaskDispatches.id, pending.id)))
    expect(stored.reserveInvitedAt).toBeNull()
    expect(stored.version).toBe(pending.version + 1)
  })

  it('P1-12: receipt maintenance compacts old batches and expires their replays', async () => {
    const actor = { userId: adminId, role: 'admin' as const, parishId: parishA }
    const expiring = await runIdempotentOperationsCommand(actor, `p1-12-expiry-${suffix}`, 'operations.test.probe', { n: 1 }, async () => ({ ok: 1 }))
    expect(expiring.replayed).toBe(false)
    const bulkKeys = Array.from({ length: 501 }, (_, index) => `p1-12-bulk-${suffix}-${index}`)
    // Chunked inserts stay under the SQLite bound-variable limit on every driver.
    for (let index = 0; index < bulkKeys.length; index += 100) {
      await db.insert(operationMutationReceipts).values(bulkKeys.slice(index, index + 100).map(key => ({
        parishId: parishA, actorUserId: adminId, idempotencyKey: key, command: 'operations.test.bulk',
        requestHash: 'hash', responseJson: '{"ok":true}', createdAt: '2020-01-01T00:00:00.000Z',
      })))
    }
    await db.update(operationMutationReceipts).set({ createdAt: '2020-01-01T00:00:00.000Z' }).where(and(
      eq(operationMutationReceipts.parishId, parishA), eq(operationMutationReceipts.actorUserId, adminId),
      eq(operationMutationReceipts.idempotencyKey, `p1-12-expiry-${suffix}`),
    ))
    const previous = process.env.OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS
    process.env.OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS = '30'
    try {
      // 502 stale rows prove the 500-row batch loop iterates instead of stopping early.
      expect(await runOperationsReceiptMaintenance()).toBe(502)
    } finally {
      if (previous === undefined) delete process.env.OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS
      else process.env.OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS = previous
    }
    const [pruned] = await db.select().from(operationMutationReceipts).where(and(
      eq(operationMutationReceipts.parishId, parishA), eq(operationMutationReceipts.actorUserId, adminId),
      eq(operationMutationReceipts.idempotencyKey, bulkKeys[0]),
    ))
    expect(pruned.responsePrunedAt).toBeTruthy()
    // Same key/payload after compaction is rejected, never re-executed.
    await expect(runIdempotentOperationsCommand(actor, `p1-12-expiry-${suffix}`, 'operations.test.probe', { n: 1 }, async () => ({ ok: 2 })))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_REPLAY_EXPIRED' })
  })

  it('P1-12: same-key different-payload replays are rejected without executing', async () => {
    const actor = { userId: adminId, role: 'admin' as const, parishId: parishA }
    const key = `p1-12-conflict-${suffix}`
    const first = await runIdempotentOperationsCommand(actor, key, 'operations.test.race', { n: 1 }, async () => ({ ok: 1 }))
    expect(first.replayed).toBe(false)
    // The UNIQUE-violation recovery inside the transaction (a true concurrent
    // committer) cannot be scheduled deterministically in-process — SQLite
    // reports BUSY instead — so it is pinned by a dedicated mocked unit test
    // (operationsIdempotencyRace.test.ts); here the pre-transaction check path.
    await expect(runIdempotentOperationsCommand(actor, key, 'operations.test.race', { n: 2 }, async () => ({ ok: 2 })))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })

  it('requires field leads to be the active leader of the responsible unit', async () => {
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { name: 'Lead scope probe', sourceUnitId: branchId, isRequired: false }))
    // An ordinary in-unit member cannot lead, even when appointed by a leader.
    const memberLead = await request(`/workstreams/${workstream.id}/members`, leaderToken, 'POST', {
      version: 1, userId: contributorId, operationRole: 'WORKSTREAM_LEAD',
    })
    expect(memberLead.status).toBe(403)
    expect(((await memberLead.json()) as any).error.code).toBe('WORKSTREAM_LEAD_OUTSIDE_UNIT')
    // Even the parish leader cannot appoint a field lead on a standalone field:
    // the U-20 assign_lead exception only opens Mảng of a Xứ đoàn event, so
    // authorization denies (FORBIDDEN) before unit-leader eligibility is even
    // evaluated. The rule is still strictly the responsible unit's own leader.
    const parishLeadLead = await request(`/workstreams/${workstream.id}/members`, parishLeaderToken, 'POST', {
      version: 1, userId: parishLeaderId, operationRole: 'WORKSTREAM_LEAD',
    })
    expect(parishLeadLead.status).toBe(403)
    expect(((await parishLeadLead.json()) as any).error.code).toBe('FORBIDDEN')
    // The responsible unit leader can.
    expect((await request(`/workstreams/${workstream.id}/members`, leaderToken, 'POST', {
      version: 1, userId: leaderId, operationRole: 'WORKSTREAM_LEAD',
    })).status).toBe(201)
  })

  it('U-20 Gói A: task inside a Xu Doan workstream belongs to the owning unit', async () => {
    const event = await data(await request('/events', parishLeaderToken, 'POST', {
      eventScopeType: 'XU_DOAN',
      title: 'Sa mạc field-layer', eventType: 'CAMP', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-12T17:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    }))
    const field = await data(await request('/workstreams', parishLeaderToken, 'POST', { eventId: event.id, sourceUnitId: branchId, name: 'Field layer probe' }))
    // Non-creators act on the event only from PLANNING on (DRAFT stays
    // creator/admin/parish-leader-only under both models).
    await data(await request(`/events/${event.id}/transition`, parishLeaderToken, 'POST', { version: event.version, status: 'PLANNING' }))
    // The owning unit leader creates tasks in their own field.
    expect((await request('/tasks', leaderToken, 'POST', { eventId: event.id, workstreamId: field.id, title: 'Việc của ngành' })).status).toBe(201)
    // The Xu Doan organizer (parish leader) is NOT a bypass for field tasks…
    const organizerTask = await request('/tasks', parishLeaderToken, 'POST', { eventId: event.id, workstreamId: field.id, title: 'Việc của xứ' })
    expect(organizerTask.status).toBe(403)
    expect(((await organizerTask.json()) as any).error.code).toBe('FORBIDDEN')
    // …nor is an unrelated staff member.
    expect((await request('/tasks', ownerToken, 'POST', { eventId: event.id, workstreamId: field.id, title: 'Việc ngoài' })).status).toBe(403)
    // Tasks in a Xu Doan event must live inside a field (non-admin).
    const orphanTask = await request('/tasks', leaderToken, 'POST', { eventId: event.id, title: 'Task không mảng' })
    expect(orphanTask.status).toBe(400)
    expect(((await orphanTask.json()) as any).error.code).toBe('TASK_WORKSTREAM_REQUIRED')
    // U-20 exception: the parish leader appoints the owning unit leader as field lead…
    expect((await request(`/workstreams/${field.id}/members`, parishLeaderToken, 'POST', {
      version: 1, userId: leaderId, operationRole: 'WORKSTREAM_LEAD',
    })).status).toBe(201)
    // …and the event-level permission map reflects field authority: no field
    // authority for the coordinator, field authority for the unit leader.
    const parishMap = (await data(await request(`/permissions?eventId=${event.id}`, parishLeaderToken))).permissions
    expect(parishMap['operations.task.create']).toBe(false)
    const leaderMap = (await data(await request(`/permissions?eventId=${event.id}`, leaderToken))).permissions
    expect(leaderMap['operations.task.create']).toBe(true)
  })

  it('U-20 Mức 3: unit deputy delegates inside the unit only and never leads', async () => {
    // Self-contained deputy fixture on the committee (the branch already has
    // its single active deputy — the overlap trigger forbids two).
    const depUserId = `u20-dep-${suffix}`
    const depPersonId = `u20-dep-person-${suffix}`
    await db.insert(users).values([{ id: depUserId, username: depUserId, passwordHash: 'hash', fullName: 'U20 Deputy', role: 'chunhiem', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 }])
    await db.insert(parishPeople).values([{ id: depPersonId, parishId: parishA, linkedUserId: depUserId, fullName: 'U20 Deputy', createdBy: adminId, updatedBy: adminId }])
    await db.insert(parishServiceTerms).values([{
      id: `u20-dep-term-${suffix}`, parishId: parishA, personId: depPersonId, unitId: committeeId,
      positionTitle: 'Phó Ban U20', positionCode: 'COMMITTEE_DEPUTY', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId,
    }])
    const depToken = accessToken(depUserId, 'chunhiem', parishA)
    const event = await data(await request('/events', committeeLeaderToken, 'POST', {
      scopeUnitId: committeeId,
      title: 'Event deputy312', eventType: 'MEETING', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-10T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    }))
    const task = await data(await request('/tasks', committeeLeaderToken, 'POST', { eventId: event.id, title: 'Việc chờ phó phân công' }))
    // Assignments need a non-DRAFT event (DRAFT only serves creator/admin).
    await data(await request(`/events/${event.id}/transition`, committeeLeaderToken, 'POST', { version: event.version, status: 'PLANNING' }))
    // Deputy assigns inside the own unit…
    expect((await request(`/tasks/${task.id}/assign`, depToken, 'POST', { version: 1, personId: `person-committee-leader-${suffix}`, assignmentRole: 'CONTRIBUTOR' })).status).toBe(201)
    // …but not outside it…
    const outside = await request(`/tasks/${task.id}/assign`, depToken, 'POST', { version: 2, personId: `person-contributor-${suffix}`, assignmentRole: 'CONTRIBUTOR' })
    expect(outside.status).toBe(403)
    expect(((await outside.json()) as any).error.code).toBe('TARGET_OUTSIDE_ORGANIZATION_SCOPE')
    // …and never appoints field leads (no assign_lead).
    const field = await data(await request('/workstreams', committeeLeaderToken, 'POST', { sourceUnitId: committeeId, name: 'Field deputy probe' }))
    const leadBid = await request(`/workstreams/${field.id}/members`, depToken, 'POST', {
      version: 1, userId: committeeLeaderId, operationRole: 'WORKSTREAM_LEAD',
    })
    expect(leadBid.status).toBe(403)
    expect(((await leadBid.json()) as any).error.code).toBe('FORBIDDEN')
    // Deputy keeps unit-event creation in the own unit (naming the unit leader
    // as organizer — organizer must still be the active leader).
    expect((await request('/events', depToken, 'POST', {
      scopeUnitId: committeeId, organizerUserId: committeeLeaderId,
      title: 'Event của phó ban', eventType: 'MEETING', startsAt: '2026-11-11T08:00:00+07:00', endsAt: '2026-11-11T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })).status).toBe(201)
  })

  it('lets a parish deputy create Xu-Doan events as creator with the parish leader as organizer', async () => {
    const created = await request('/events', parishDeputyToken, 'POST', {
      eventScopeType: 'XU_DOAN',
      title: 'Sa mạc do Phó xứ tạo', eventType: 'CAMP', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-12T17:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(created.status).toBe(201)
    expect(await data(created)).toMatchObject({
      eventScopeType: 'XU_DOAN', scopeUnitId: null, createdBy: parishDeputyId, organizerUserId: parishLeaderId,
    })
  })

  it('hides unit creation from parish deputies: no menu options and no unit events', async () => {
    // Phó Xứ đoàn chỉ tạo Event Xứ đoàn — option chuyên môn/Task độc lập ẩn hẳn.
    const options = await data(await request('/creation-options', parishDeputyToken))
    expect(options.canCreateXuDoanEvent).toBe(true)
    expect(options.units).toEqual([])
    // Gọi trực tiếp cũng fail closed: deputy chỉ tạo Event Xứ đoàn nên
    // capability event.create với scope chuyên môn bị từ chối (FORBIDDEN) ngay
    // ở lớp authorization, trước cả organizer scope rule.
    const unitEvent = await request('/events', parishDeputyToken, 'POST', {
      scopeUnitId: branchId, organizerUserId: leaderId,
      title: 'Event chuyên môn của Phó xứ', eventType: 'MEETING', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-10T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(unitEvent.status).toBe(403)
    expect(((await unitEvent.json()) as any).error.code).toBe('FORBIDDEN')
  })

  // Hardening fixtures (V1/V2/V3/V5/V7/V8): a second branch leader owning
  // otherBranchId. Each test calls ensureHardLeaderB() so the cases stay
  // order-independent under `-t` filters.
  async function ensureHardLeaderB() {
    const id = `ops-hard-leader-b-${suffix}`
    const [existing] = await db.select({ id: users.id }).from(users).where(and(eq(users.parishId, parishA), eq(users.id, id))).limit(1)
    if (!existing) {
      await db.insert(users).values([
        { id, username: id, passwordHash: 'hash', fullName: 'Other Branch Leader', role: 'chunhiem', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      ])
      await db.insert(parishPeople).values([
        { id: `person-hard-b-${suffix}`, parishId: parishA, linkedUserId: id, fullName: 'Other Branch Leader', createdBy: adminId, updatedBy: adminId },
      ])
      await db.insert(parishServiceTerms).values([
        { id: `term-hard-b-${suffix}`, parishId: parishA, personId: `person-hard-b-${suffix}`, unitId: otherBranchId, positionTitle: 'Trưởng ngành', positionCode: 'BRANCH_LEADER', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
      ])
    }
    return { id, token: accessToken(id, 'chunhiem', parishA) }
  }

  it('V1/V2: rejects pinning another unit scope onto a foreign event (scope coherence)', async () => {
    const { id: otherLeaderId, token: otherLeaderToken } = await ensureHardLeaderB()
    const victimResponse = await request('/events', otherLeaderToken, 'POST', {
      scopeUnitId: otherBranchId, organizerUserId: otherLeaderId,
      title: 'Sự kiện nạn nhân scope B', eventType: 'MEETING', startsAt: '2026-11-20T08:00:00+07:00', endsAt: '2026-11-20T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(victimResponse.status).toBe(201)
    const victimCreated = await data(victimResponse)
    const victim = await data(await request(`/events/${victimCreated.id}/transition`, otherLeaderToken, 'POST', { version: victimCreated.version, status: 'PLANNING' }))
    expect(victim.status).toBe('PLANNING')

    // V1: leader of branch A pins scopeUnitId=A onto event B → 403.
    expect((await request('/tasks', leaderToken, 'POST', { eventId: victim.id, scopeUnitId: branchId, title: 'Task ngoài phạm vi' })).status).toBe(403)
    // Coherent control: same-scope leader creates with matching scope → 201.
    const ownTask = await request('/tasks', otherLeaderToken, 'POST', { eventId: victim.id, scopeUnitId: otherBranchId, title: 'Task trong phạm vi' })
    expect(ownTask.status).toBe(201)
    // Fallback control (no explicit scope, derived from the graph) still works.
    expect((await request('/tasks', otherLeaderToken, 'POST', { eventId: victim.id, title: 'Task suy scope' })).status).toBe(201)

    // V2: leader of branch A pins sourceUnitId=A onto event B → 403.
    expect((await request('/workstreams', leaderToken, 'POST', { eventId: victim.id, sourceUnitId: branchId, name: 'Nhóm ngoài phạm vi' })).status).toBe(403)
    const ownGroup = await request('/workstreams', otherLeaderToken, 'POST', { eventId: victim.id, sourceUnitId: otherBranchId, name: 'Nhóm trong phạm vi' })
    expect(ownGroup.status).toBe(201)
  })

  it('V3: rejects template creation snapshotting another creator DRAFT', async () => {
    const { token: otherLeaderToken } = await ensureHardLeaderB()
    const draftResponse = await request('/events', otherLeaderToken, 'POST', {
      scopeUnitId: otherBranchId, organizerUserId: `ops-hard-leader-b-${suffix}`,
      title: 'Bản nháp riêng B', eventType: 'MEETING', startsAt: '2026-11-21T08:00:00+07:00', endsAt: '2026-11-21T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(draftResponse.status).toBe(201)
    const draft = await data(draftResponse)
    // Parish-wide leader holds event.create in every scope but must not read
    // another creator DRAFT through the template snapshot path.
    expect((await request(`/events/${draft.id}/templates`, parishLeaderToken, 'POST', { eventVersion: 1, name: 'Mẫu từ nháp người khác' })).status).toBe(403)
    // The creator keeps the path for their own draft.
    const ownTemplateResponse = await request(`/events/${draft.id}/templates`, otherLeaderToken, 'POST', { eventVersion: 1, name: 'Mẫu của chính mình' })
    expect(ownTemplateResponse.status).toBe(201)
    const ownTemplate = await data(ownTemplateResponse)
    // Versions route: sourceEventId pointing at another creator DRAFT → 403.
    const draft2 = await data(await request('/events', otherLeaderToken, 'POST', {
      scopeUnitId: otherBranchId, organizerUserId: `ops-hard-leader-b-${suffix}`,
      title: 'Bản nháp nguồn B2', eventType: 'MEETING', startsAt: '2026-11-22T08:00:00+07:00', endsAt: '2026-11-22T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    }))
    expect((await request(`/templates/${ownTemplate.id}/versions`, parishLeaderToken, 'POST', {
      expectedVersion: 1, expectedLatestVersion: 1, sourceEventId: draft2.id, sourceEventVersion: 1, reason: 'Phiên bản từ nháp người khác',
    })).status).toBe(403)
    // Admin keeps the compatibility path (DRAFT gate admits admin).
    expect((await request(`/events/${draft.id}/templates`, adminToken, 'POST', { eventVersion: 1, name: 'Mẫu admin từ nháp' })).status).toBe(201)
  })

  it('V5: rejects acknowledgement after the event turns CANCELLED', async () => {
    const { id: otherLeaderId, token: otherLeaderToken } = await ensureHardLeaderB()
    const created = await data(await request('/events', otherLeaderToken, 'POST', {
      scopeUnitId: otherBranchId, organizerUserId: otherLeaderId,
      title: 'Sự kiện sẽ hủy', eventType: 'MEETING', startsAt: '2026-11-23T08:00:00+07:00', endsAt: '2026-11-23T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    }))
    const planning = await data(await request(`/events/${created.id}/transition`, otherLeaderToken, 'POST', { version: created.version, status: 'PLANNING' }))
    const task = await data(await request('/tasks', otherLeaderToken, 'POST', { eventId: created.id, title: 'Việc sẽ hủy' }))
    const assigned = await data(await request(`/tasks/${task.id}/assign`, otherLeaderToken, 'POST', { version: 1, userId: otherLeaderId, assignmentRole: 'OWNER' }))
    expect((await request(`/tasks/${task.id}/acknowledge`, otherLeaderToken, 'POST', { assignmentId: assigned.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    const cancelled = await data(await request(`/events/${created.id}/transition`, otherLeaderToken, 'POST', { version: planning.version, status: 'CANCELLED', reason: 'Hủy để kiểm thử acknowledgement' }))
    expect(cancelled.status).toBe('CANCELLED')
    const late = await request(`/tasks/${task.id}/acknowledge`, otherLeaderToken, 'POST', { assignmentId: assigned.assignment.id, version: 2, status: 'DECLINED' })
    expect(late.status).toBe(409)
    expect(((await late.json()) as any).error.code).toBe('EVENT_NOT_OPEN')
  })

  it('V5b: follow-up tasks under a COMPLETED event stay acknowledgeable (designed exemption)', async () => {
    const { id: otherLeaderId, token: otherLeaderToken } = await ensureHardLeaderB()
    const created = await data(await request('/events', otherLeaderToken, 'POST', {
      scopeUnitId: otherBranchId, organizerUserId: otherLeaderId,
      title: 'Sự kiện có follow-up', eventType: 'MEETING', startsAt: '2026-11-26T08:00:00+07:00', endsAt: '2026-11-26T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    }))
    let current = created
    for (const status of ['PLANNING', 'PREPARING', 'READY', 'LIVE'] as const) current = await data(await request(`/events/${created.id}/transition`, otherLeaderToken, 'POST', { version: current.version, status }))
    current = await data(await request(`/events/${created.id}/transition`, otherLeaderToken, 'POST', { version: current.version, status: 'COMPLETED', outcomeSummary: 'Hoàn tất, còn việc tiếp nối.' }))
    expect(current.status).toBe('COMPLETED')
    const followUp = await data(await request(`/events/${created.id}/follow-ups`, otherLeaderToken, 'POST', {
      eventVersion: current.version, title: 'Việc tiếp nối', dueAt: '2026-12-01T08:00:00+07:00', userId: otherLeaderId,
    }))
    expect(followUp.task).toMatchObject({ phase: 'FOLLOW_UP', status: 'TODO' })
    // The parent event is COMPLETED, yet the follow-up OWNER must acknowledge
    // to start — the V5 terminal guard exempts FOLLOW_UP by design.
    expect((await request(`/tasks/${followUp.task.id}/acknowledge`, otherLeaderToken, 'POST', { assignmentId: followUp.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
  })

  it('V7: rejects dependency edges pointing at tasks the caller cannot view', async () => {
    const { token: otherLeaderToken } = await ensureHardLeaderB()
    const parishEvent = await data(await request('/events', parishLeaderToken, 'POST', {
      eventScopeType: 'XU_DOAN',
      title: 'Sự kiện Xứ đoàn hai Field', eventType: 'MEETING', startsAt: '2026-11-24T08:00:00+07:00', endsAt: '2026-11-24T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    }))
    await data(await request(`/events/${parishEvent.id}/transition`, parishLeaderToken, 'POST', { version: parishEvent.version, status: 'PLANNING' }))
    const fieldA = await data(await request('/workstreams', leaderToken, 'POST', { eventId: parishEvent.id, sourceUnitId: branchId, name: 'Field A' }))
    const fieldB = await data(await request('/workstreams', otherLeaderToken, 'POST', { eventId: parishEvent.id, sourceUnitId: otherBranchId, name: 'Field B' }))
    const taskA = await data(await request('/tasks', leaderToken, 'POST', { eventId: parishEvent.id, workstreamId: fieldA.id, title: 'Việc Field A' }))
    const taskB = await data(await request('/tasks', otherLeaderToken, 'POST', { eventId: parishEvent.id, workstreamId: fieldB.id, title: 'Việc Field B' }))
    // Leader A manages A but cannot view B: the edge must not be creatable
    // (and the attempt must not confirm or deny B beyond a uniform 403).
    expect((await request(`/tasks/${taskA.id}/dependencies`, leaderToken, 'POST', { version: 1, dependsOnTaskId: taskB.id })).status).toBe(403)
    // Control: edge inside the caller own scope still works.
    const taskA2 = await data(await request('/tasks', leaderToken, 'POST', { eventId: parishEvent.id, workstreamId: fieldA.id, title: 'Việc Field A2' }))
    expect((await request(`/tasks/${taskA2.id}/dependencies`, leaderToken, 'POST', { version: 1, dependsOnTaskId: taskA.id })).status).toBe(201)
  })

  it('V8: dependency removal is OCC-guarded, audited and requires management', async () => {
    const { token: otherLeaderToken } = await ensureHardLeaderB()
    const created = await data(await request('/events', otherLeaderToken, 'POST', {
      scopeUnitId: otherBranchId, organizerUserId: `ops-hard-leader-b-${suffix}`,
      title: 'Sự kiện gỡ dependency', eventType: 'MEETING', startsAt: '2026-11-25T08:00:00+07:00', endsAt: '2026-11-25T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    }))
    const first = await data(await request('/tasks', otherLeaderToken, 'POST', { eventId: created.id, title: 'Việc nguồn' }))
    const second = await data(await request('/tasks', otherLeaderToken, 'POST', { eventId: created.id, title: 'Việc bị chặn' }))
    const edge = await data(await request(`/tasks/${second.id}/dependencies`, otherLeaderToken, 'POST', { version: 1, dependsOnTaskId: first.id }))
    expect(edge.taskVersion).toBe(2)
    // No management over the blocked task → 403, edge untouched.
    expect((await request(`/tasks/${second.id}/dependencies/${first.id}/remove`, committeeLeaderToken, 'POST', { version: 2, reason: 'Người ngoài scope' })).status).toBe(403)
    // Stale version → 409, edge untouched.
    expect((await request(`/tasks/${second.id}/dependencies/${first.id}/remove`, otherLeaderToken, 'POST', { version: 1, reason: 'Version cũ' })).status).toBe(409)
    // Correct removal bumps the source task and clears the gate.
    const removed = await data(await request(`/tasks/${second.id}/dependencies/${first.id}/remove`, otherLeaderToken, 'POST', { version: 2, reason: 'Thêm nhầm dependency' }))
    expect(removed.taskVersion).toBe(3)
    const detail = await data(await request(`/tasks/${second.id}`, otherLeaderToken))
    expect(detail.dependencies).toEqual([])
    // Removing again → 404, never a silent no-op success.
    expect((await request(`/tasks/${second.id}/dependencies/${first.id}/remove`, otherLeaderToken, 'POST', { version: 3, reason: 'Gỡ lại' })).status).toBe(404)
  })

  it('scopes the parish secretary to Xu-Doan creation, own events and parish-wide read', async () => {
    // Secretary creates Xu-Doan events like a deputy: creator self, organizer leader.
    const created = await request('/events', secretaryToken, 'POST', {
      eventScopeType: 'XU_DOAN',
      title: 'Họp do Thư ký tạo', eventType: 'MEETING', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-10T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })
    expect(created.status).toBe(201)
    const ownEvent = await data(created)
    expect(ownEvent).toMatchObject({ createdBy: parishSecretaryId, organizerUserId: parishLeaderId })
    // ...but cannot create unit-scoped events.
    expect((await request('/events', secretaryToken, 'POST', {
      scopeUnitId: branchId,
      title: 'Event chuyên môn của Thư ký', eventType: 'MEETING', startsAt: '2026-11-10T08:00:00+07:00', endsAt: '2026-11-10T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh',
    })).status).toBe(403)
    // Full rights on own events through the creator role.
    expect((await request(`/events/${ownEvent.id}/transition`, secretaryToken, 'POST', { version: ownEvent.version, status: 'PLANNING' })).status).toBe(200)
    // Read-only on other events: view works once published past DRAFT
    // (drafts stay creator-private), management does not.
    const other = await createEvent({ title: 'Event của admin' })
    const otherPlanning = await data(await request(`/events/${other.id}/transition`, adminToken, 'POST', { version: other.version, status: 'PLANNING' }))
    expect((await request(`/events/${other.id}`, secretaryToken)).status).toBe(200)
    expect((await request(`/events/${other.id}/transition`, secretaryToken, 'POST', { version: otherPlanning.version, status: 'PREPARING' })).status).toBe(403)
    // Creation menu offers Xu-Doan but no unit scopes.
    const options = await data(await request('/creation-options', secretaryToken))
    expect(options.canCreateXuDoanEvent).toBe(true)
    expect(options.units).toEqual([])
  })
})
