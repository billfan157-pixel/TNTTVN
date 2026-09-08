// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  auditLogs,
  notifications,
  operationBlockouts,
  operationChecklistItems,
  operationEventParticipants,
  operationEvents,
  operationMutationReceipts,
  operationReminders,
  operationTaskAssignees,
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
import { compactOperationsMutationReceiptResponses } from '../services/operationsIdempotency.js'

const suffix = Date.now()
const parishA = `ops-a-${suffix}`
const parishB = `ops-b-${suffix}`
const adminId = `ops-admin-${suffix}`
const ownerId = `ops-owner-${suffix}`
const contributorId = `ops-contributor-${suffix}`
const leaderId = `ops-leader-${suffix}`
const expiredLeaderId = `ops-expired-${suffix}`
const parishLeaderId = `ops-parish-leader-${suffix}`
const committeeLeaderId = `ops-committee-leader-${suffix}`
const parentId = `ops-parent-${suffix}`
const parentPersonId = `ops-parent-person-${suffix}`
const unlinkedPersonId = `ops-unlinked-person-${suffix}`
const foreignAdminId = `ops-foreign-${suffix}`
const branchId = `ops-branch-${suffix}`
const otherBranchId = `ops-other-branch-${suffix}`
const boardId = `ops-board-${suffix}`
const committeeId = `ops-committee-${suffix}`
const sourceEventId = `ops-source-${suffix}`
let keySequence = 0

const accessToken = (userId: string, role: 'admin' | 'chunhiem' | 'phuta', parishId: string) => generateTokens({ userId, username: userId, role, parishId, tokenVersion: 1 }).accessToken
const adminToken = accessToken(adminId, 'admin', parishA)
const ownerToken = accessToken(ownerId, 'chunhiem', parishA)
const contributorToken = accessToken(contributorId, 'chunhiem', parishA)
const leaderToken = accessToken(leaderId, 'chunhiem', parishA)
const expiredLeaderToken = accessToken(expiredLeaderId, 'chunhiem', parishA)
const parishLeaderToken = accessToken(parishLeaderId, 'phuta', parishA)
const committeeLeaderToken = accessToken(committeeLeaderId, 'phuta', parishA)
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
      { id: committeeLeaderId, username: committeeLeaderId, passwordHash: 'hash', fullName: 'Committee Leader', role: 'phuta', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: parentId, username: parentId, passwordHash: 'hash', fullName: 'Parent Without Operations Access', role: 'phuhuynh', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: foreignAdminId, username: foreignAdminId, passwordHash: 'hash', fullName: 'Foreign Admin', role: 'admin', parishId: parishB, status: 'ACTIVE', tokenVersion: 1 },
    ])
    await db.insert(parishOrganizationUnits).values([
      { id: branchId, parishId: parishA, parentId: null, name: 'Ngành Thiếu', unitType: 'BRANCH', createdBy: adminId, updatedBy: adminId },
      { id: otherBranchId, parishId: parishA, parentId: null, name: 'Ngành Nghĩa', unitType: 'BRANCH', createdBy: adminId, updatedBy: adminId },
      { id: boardId, parishId: parishA, parentId: null, name: 'Ban điều hành', unitType: 'BOARD', createdBy: adminId, updatedBy: adminId },
      { id: committeeId, parishId: parishA, parentId: boardId, name: 'Ban Phụng vụ', unitType: 'COMMITTEE', createdBy: adminId, updatedBy: adminId },
    ])
    await db.insert(parishPeople).values([
      { id: `person-leader-${suffix}`, parishId: parishA, linkedUserId: leaderId, fullName: 'Branch Leader', createdBy: adminId, updatedBy: adminId },
      { id: `person-contributor-${suffix}`, parishId: parishA, linkedUserId: contributorId, fullName: 'Deputy Branch Leader', createdBy: adminId, updatedBy: adminId },
      { id: `person-expired-${suffix}`, parishId: parishA, linkedUserId: expiredLeaderId, fullName: 'Expired Leader', createdBy: adminId, updatedBy: adminId },
      { id: `person-parish-leader-${suffix}`, parishId: parishA, linkedUserId: parishLeaderId, fullName: 'Parish Leader', createdBy: adminId, updatedBy: adminId },
      { id: `person-committee-leader-${suffix}`, parishId: parishA, linkedUserId: committeeLeaderId, fullName: 'Committee Leader', createdBy: adminId, updatedBy: adminId },
      { id: parentPersonId, parishId: parishA, linkedUserId: parentId, fullName: 'Parent-linked Person', createdBy: adminId, updatedBy: adminId },
      { id: unlinkedPersonId, parishId: parishA, linkedUserId: null, fullName: 'Unlinked Operations Person', createdBy: adminId, updatedBy: adminId },
    ])
    await db.insert(parishServiceTerms).values([
      { id: `term-leader-${suffix}`, parishId: parishA, personId: `person-leader-${suffix}`, unitId: branchId, positionTitle: 'Trưởng ngành', positionCode: 'BRANCH_LEADER', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-contributor-${suffix}`, parishId: parishA, personId: `person-contributor-${suffix}`, unitId: branchId, positionTitle: 'Phó trưởng ngành', positionCode: null, startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-expired-${suffix}`, parishId: parishA, personId: `person-expired-${suffix}`, unitId: branchId, positionTitle: 'Trưởng ngành', positionCode: 'BRANCH_LEADER', startDate: '2025-01-01', endDate: '2025-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-parish-leader-${suffix}`, parishId: parishA, personId: `person-parish-leader-${suffix}`, unitId: boardId, positionTitle: 'Trưởng Xứ đoàn', positionCode: 'PARISH_LEADER', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
      { id: `term-committee-leader-${suffix}`, parishId: parishA, personId: `person-committee-leader-${suffix}`, unitId: committeeId, positionTitle: 'Trưởng ban', positionCode: 'COMMITTEE_LEADER', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId, updatedBy: adminId },
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
    await db.delete(operationTaskComments).where(eq(operationTaskComments.parishId, parishA))
    await db.delete(operationChecklistItems).where(eq(operationChecklistItems.parishId, parishA))
    await db.delete(operationTaskDependencies).where(eq(operationTaskDependencies.parishId, parishA))
    await db.delete(operationTaskAssignees).where(eq(operationTaskAssignees.parishId, parishA))
    await db.delete(operationTasks).where(eq(operationTasks.parishId, parishA))
    await db.delete(operationWorkstreamMembers).where(eq(operationWorkstreamMembers.parishId, parishA))
    await db.delete(operationWorkstreams).where(eq(operationWorkstreams.parishId, parishA))
    await db.delete(parishRecords).where(eq(parishRecords.parishId, parishA))
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
    const created = await request('/workstreams', adminToken, 'POST', { name: 'Ban Phụng vụ', isRequired: true }, stableKey)
    expect(created.status).toBe(201)
    workstreamId = (await data(created)).id
    const replay = await request('/workstreams', adminToken, 'POST', { name: 'Ban Phụng vụ', isRequired: true }, stableKey)
    expect(replay.status).toBe(200)
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true')
    expect((await data(replay)).id).toBe(workstreamId)
    const conflict = await request('/workstreams', adminToken, 'POST', { name: 'Payload khác' }, stableKey)
    expect(conflict.status).toBe(409)

    await db.update(operationMutationReceipts).set({ createdAt: '2020-01-01T00:00:00.000Z' }).where(and(
      eq(operationMutationReceipts.parishId, parishA),
      eq(operationMutationReceipts.actorUserId, adminId),
      eq(operationMutationReceipts.idempotencyKey, stableKey),
    ))
    expect(await compactOperationsMutationReceiptResponses(new Date('2021-01-01T00:00:00.000Z'), 10)).toBe(1)
    const expiredReplay = await request('/workstreams', adminToken, 'POST', { name: 'Ban Phụng vụ', isRequired: true }, stableKey)
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
    expect((await request('/tasks?limit=501', adminToken)).status).toBe(400)
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

    const observer = await request(`/tasks/${taskId}/assign`, adminToken, 'POST', { version: 3, userId: leaderId, assignmentRole: 'OBSERVER' })
    expect(observer.status).toBe(201)
    expect((await data(observer)).taskVersion).toBe(4)

    const duplicateOwner = await request(`/tasks/${taskId}/assign`, adminToken, 'POST', { version: 4, userId: leaderId, assignmentRole: 'OWNER' })
    expect(duplicateOwner.status).toBe(409)
    const adminExecute = await request(`/tasks/${taskId}/transition`, adminToken, 'POST', { version: 4, status: 'IN_PROGRESS' })
    expect(adminExecute.status).toBe(403)
    const observerExecute = await request(`/tasks/${taskId}/transition`, leaderToken, 'POST', { version: 4, status: 'IN_PROGRESS' })
    expect(observerExecute.status).toBe(403)
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
    const task = await data(await request('/tasks', adminToken, 'POST', { eventId: event.id, workstreamId: workstream.id, title: 'Combined role task', requiresApproval: true }))
    const permissions = async () => (await data(await request(`/tasks/${task.id}`, ownerToken))).permissions
    expect(await permissions()).toMatchObject({ 'operations.task.execute': false, 'operations.task.approve': false })
    const assigned = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    expect((await permissions())['operations.task.execute']).toBe(false)
    expect((await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: assigned.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    expect((await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: assigned.taskVersion, status: 'IN_PROGRESS' })).status).toBe(200)
    const approver = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: assigned.taskVersion + 1, userId: ownerId, assignmentRole: 'APPROVER' }))
    expect((await permissions())['operations.task.approve']).toBe(false)
    expect((await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: approver.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    expect((await request(`/tasks/${task.id}/approve`, ownerToken, 'POST', { version: approver.taskVersion, decision: 'APPROVED' })).status).toBe(200)
  })

  it('reads workstream membership in resource scope and excludes revoked memberships', async () => {
    const workstream = await data(await request('/workstreams', adminToken, 'POST', { name: 'Private workstream' }))
    expect((await request(`/workstreams/${workstream.id}`, foreignToken)).status).toBe(403)
    expect((await request(`/workstreams/${workstream.id}`, ownerToken)).status).toBe(403)
    const member = await data(await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', { version: 1, userId: ownerId, operationRole: 'WORKSTREAM_LEAD' }))
    const detail = await data(await request(`/workstreams/${workstream.id}`, ownerToken))
    expect(detail.workstream.id).toBe(workstream.id)
    expect(detail.members.map((row: { id: string }) => row.id)).toEqual([member.id])
    expect(detail.permissions['operations.workstream.manage']).toBe(true)
    expect(detail.permissions['operations.task.execute']).toBe(false)
    expect((await request(`/workstreams/${workstream.id}/members/${member.id}/remove`, adminToken, 'POST', { version: 2, memberVersion: 1, reason: 'Kết thúc phân công' })).status).toBe(200)
    expect((await request(`/workstreams/${workstream.id}`, ownerToken)).status).toBe(403)
    expect((await data(await request(`/workstreams/${workstream.id}`, adminToken))).members).toEqual([])
  })

  it('invalidates approval when approved task content changes, but not for scheduling metadata', async () => {
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Review content', requiresApproval: true }))
    const owner = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    const approver = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: owner.taskVersion, userId: contributorId, assignmentRole: 'APPROVER' }))
    await request(`/tasks/${task.id}/acknowledge`, ownerToken, 'POST', { assignmentId: owner.assignment.id, version: 1, status: 'ACCEPTED' })
    await request(`/tasks/${task.id}/acknowledge`, contributorToken, 'POST', { assignmentId: approver.assignment.id, version: 1, status: 'ACCEPTED' })
    const approved = await data(await request(`/tasks/${task.id}/approve`, contributorToken, 'POST', { version: approver.taskVersion, decision: 'APPROVED' }))
    const rescheduled = await data(await request(`/tasks/${task.id}`, adminToken, 'PUT', { version: approved.version, priority: 'HIGH' }))
    expect(rescheduled.approvalStatus).toBe('APPROVED')
    const changed = await data(await request(`/tasks/${task.id}`, adminToken, 'PUT', { version: rescheduled.version, description: 'Different deliverable' }))
    expect(changed).toMatchObject({ approvalStatus: 'PENDING', approvedBy: null, approvedAt: null })
    expect((await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: changed.version, status: 'DONE' })).status).toBe(409)
    const reapproved = await data(await request(`/tasks/${task.id}/approve`, contributorToken, 'POST', { version: changed.version, decision: 'APPROVED' }))
    const checklist = await data(await request(`/tasks/${task.id}/checklist`, adminToken, 'POST', { version: reapproved.version, label: 'New required evidence', isRequired: true }))
    expect(checklist.taskVersion).toBe(reapproved.version + 1)
    expect(checklist.approvalStatus).toBe('PENDING')
    expect((await data(await request(`/tasks/${task.id}`, adminToken))).task.approvalStatus).toBe('PENDING')
    const approvedAgain = await data(await request(`/tasks/${task.id}/approve`, contributorToken, 'POST', { version: checklist.taskVersion, decision: 'APPROVED' }))
    const unchanged = await data(await request(`/tasks/${task.id}/checklist/${checklist.item.id}`, ownerToken, 'POST', { version: approvedAgain.version, isDone: false }))
    expect(unchanged.approvalStatus).toBe('APPROVED')
    const toggled = await data(await request(`/tasks/${task.id}/checklist/${checklist.item.id}`, ownerToken, 'POST', { version: unchanged.taskVersion, isDone: true }))
    expect(toggled.approvalStatus).toBe('PENDING')
    expect((await request(`/tasks/${task.id}/transition`, ownerToken, 'POST', { version: toggled.taskVersion, status: 'DONE' })).status).toBe(409)
  })

  it('fails closed across parishes and for unscoped staff', async () => {
    const foreignList = await request('/tasks', foreignToken)
    expect(foreignList.status).toBe(200)
    expect(await data(foreignList)).toEqual([])
    const unscoped = await request('/tasks', ownerToken, 'POST', { title: 'Unscoped task' })
    expect(unscoped.status).toBe(403)
  })

  it('blocks event closure on required unfinished tasks even with readiness override', async () => {
    const event = await createEvent({ title: 'Closure guard' })
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Required follow-through', eventId: event.id, isRequired: true }))
    let current = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: 1, status: 'PLANNING' }))
    for (const status of ['READY', 'LIVE']) current = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status, override: true, reason: 'Start with managed exception' }))
    const response = await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: current.version, status: 'COMPLETED', outcomeSummary: 'Summary cannot replace required work', override: true, reason: 'Not a closure permission' })
    expect(response.status).toBe(409)
    expect((await response.json() as any).error.code).toBe('COMPLETION_BLOCKED')
    const latest = await data(await request(`/events/${event.id}`, adminToken))
    expect(latest.event.status).toBe('LIVE')
    expect(latest.tasks.some((row: any) => row.id === task.id && row.status === 'TODO')).toBe(true)
  })

  it('filters the approval queue by effective authority before pagination', async () => {
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Approval queue fixture', requiresApproval: true }))
    const assignment = await data(await request(`/tasks/${task.id}/assign`, adminToken, 'POST', { version: 1, userId: contributorId, assignmentRole: 'APPROVER' }))
    const before = await data(await request('/tasks?queue=approval', contributorToken))
    expect(before.some((row: any) => row.id === task.id)).toBe(false)
    await request(`/tasks/${task.id}/acknowledge`, contributorToken, 'POST', { assignmentId: assignment.assignment.id, version: 1, status: 'ACCEPTED' })
    const after = await data(await request('/tasks?queue=approval', contributorToken))
    expect(after.some((row: any) => row.id === task.id)).toBe(true)
    expect((await data(await request('/tasks?queue=approval', foreignToken))).some((row: any) => row.id === task.id)).toBe(false)
    expect((await data(await request('/tasks?queue=approval', adminToken))).some((row: any) => row.id === task.id)).toBe(false)
    await request(`/tasks/${task.id}/approve`, contributorToken, 'POST', { version: assignment.taskVersion, decision: 'APPROVED' })
    expect((await data(await request('/tasks?queue=approval', contributorToken))).some((row: any) => row.id === task.id)).toBe(false)
  })

  it('includes scoped workstream approvers without direct task assignment and removes revoked authority', async () => {
    const group = await data(await request('/workstreams', adminToken, 'POST', { name: 'Queue review group' }))
    const membership = await data(await request(`/workstreams/${group.id}/members`, adminToken, 'POST', { version: 1, userId: ownerId, operationRole: 'APPROVER' }))
    const task = await data(await request('/tasks', adminToken, 'POST', { title: 'Group review only', workstreamId: group.id, requiresApproval: true }))
    const queue = await data(await request('/tasks?queue=approval', ownerToken))
    expect(queue.some((row: any) => row.id === task.id)).toBe(true)
    const mine = await data(await request('/tasks?mine=true', ownerToken))
    expect(mine.some((row: any) => row.id === task.id)).toBe(false)
    const removed = await request(`/workstreams/${group.id}/members/${membership.id}/remove`, adminToken, 'POST', { version: 2, memberVersion: 1, reason: 'End review assignment' })
    expect(removed.status).toBe(200)
    expect((await data(await request('/tasks?queue=approval', ownerToken))).some((row: any) => row.id === task.id)).toBe(false)
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

  it('derives Trưởng ngành authority from active service-term unit scope only', async () => {
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

  it('keeps parish_events authoritative for public calendar summaries', async () => {
    const noSource = await request('/events', adminToken, 'POST', {
      title: 'Không có lịch nguồn', eventType: 'CAMP', startsAt: '2026-10-06T08:00:00+07:00', endsAt: '2026-10-06T17:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh', visibility: 'PUBLIC_SUMMARY',
    })
    expect(noSource.status).toBe(400)
    const event = await createEvent({ title: 'Trại hè', eventType: 'CAMP', visibility: 'PUBLIC_SUMMARY', sourceParishEventId: sourceEventId, expectedHeadcount: 80 })
    const duplicate = await request('/events', adminToken, 'POST', {
      sourceParishEventId: sourceEventId, title: 'Bản Operations trùng', eventType: 'CAMP', startsAt: '2026-10-01T08:00:00+07:00', endsAt: '2026-10-01T10:00:00+07:00', timezone: 'Asia/Ho_Chi_Minh', visibility: 'PUBLIC_SUMMARY',
    })
    expect(duplicate.status).toBe(409)

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
    expect(item).toMatchObject({ id: sourceEventId, operationEventId: event.id, title: 'Lịch Trại hè' })
    expect(item).not.toHaveProperty('description')

    const existingMemoryId = `memory-existing-${suffix}`
    await db.insert(parishRecords).values({
      id: existingMemoryId, parishId: parishA, recordType: 'MILESTONE', title: 'Mốc lịch sử do người dùng quản lý', summary: 'Không thuộc Operations', content: null,
      occurredOn: '2026-10-01', endedOn: null, location: null, status: 'DRAFT', visibility: 'STAFF', showOnTimeline: true,
      sourceEventId, createdBy: adminId, updatedBy: adminId, publishedBy: null, publishedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null,
    })

    const planning = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: 1, status: 'PLANNING' }))
    const ready = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: planning.version, status: 'READY' }))
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
      eq(parishRecords.sourceEventId, sourceEventId),
    ))
    expect(records).toHaveLength(2)
    expect(records.find(record => record.id === existingMemoryId)).toMatchObject({
      recordType: 'MILESTONE',
      title: 'Mốc lịch sử do người dùng quản lý',
      summary: 'Không thuộc Operations',
    })
    expect(records.find(record => record.id !== existingMemoryId)).toMatchObject({
      recordType: 'ACTIVITY',
      sourceEventId,
      summary: '80 em tham dự, chương trình hoàn tất an toàn.',
    })
    expect((await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Không thêm task sau completed' })).status).toBe(409)
    expect((await request('/workstreams', adminToken, 'POST', { eventId: event.id, name: 'Không thêm workstream sau completed' })).status).toBe(409)
    expect((await request(`/events/${event.id}/participants`, adminToken, 'POST', { userId: contributorId, participantRole: 'ATTENDEE' })).status).toBe(409)
  })

  it('enforces dependency cycles, checklist completion and approval roles', async () => {
    const event = await createEvent({ title: 'Huấn luyện' })
    const first = await data(await request('/tasks', adminToken, 'POST', { title: 'Chuẩn bị tài liệu', eventId: event.id }))
    const second = await data(await request('/tasks', adminToken, 'POST', { title: 'Gửi tài liệu', eventId: event.id }))
    const edge = await request(`/tasks/${second.id}/dependencies`, adminToken, 'POST', { version: 1, dependsOnTaskId: first.id })
    expect(edge.status).toBe(201)
    const cycle = await request(`/tasks/${first.id}/dependencies`, adminToken, 'POST', { version: 1, dependsOnTaskId: second.id })
    expect(cycle.status).toBe(409)

    const gated = await data(await request('/tasks', adminToken, 'POST', { title: 'Task cần duyệt', eventId: event.id, requiresApproval: true }))
    const owner = await data(await request(`/tasks/${gated.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    const approver = await data(await request(`/tasks/${gated.id}/assign`, adminToken, 'POST', { version: owner.taskVersion, userId: contributorId, assignmentRole: 'APPROVER' }))
    expect((await request(`/tasks/${gated.id}/acknowledge`, ownerToken, 'POST', { assignmentId: owner.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    expect((await request(`/tasks/${gated.id}/acknowledge`, contributorToken, 'POST', { assignmentId: approver.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    const checklist = await data(await request(`/tasks/${gated.id}/checklist`, adminToken, 'POST', { version: approver.taskVersion, label: 'Đã kiểm tra', isRequired: true }))
    expect((await request(`/tasks/${gated.id}/transition`, ownerToken, 'POST', { version: checklist.taskVersion, status: 'DONE' })).status).toBe(409)
    const checked = await data(await request(`/tasks/${gated.id}/checklist/${checklist.item.id}`, ownerToken, 'POST', { version: checklist.taskVersion, isDone: true }))
    expect((await request(`/tasks/${gated.id}/transition`, ownerToken, 'POST', { version: checked.taskVersion, status: 'DONE' })).status).toBe(409)
    const approved = await data(await request(`/tasks/${gated.id}/approve`, contributorToken, 'POST', { version: checked.taskVersion, decision: 'APPROVED' }))
    const done = await request(`/tasks/${gated.id}/transition`, ownerToken, 'POST', { version: approved.version, status: 'DONE', completionNote: 'Hoàn tất' })
    expect(done.status).toBe(200)
    const doneTask = await data(done)
    for (const mutation of [
      () => request(`/tasks/${gated.id}`, adminToken, 'PUT', { version: doneTask.version, title: 'Không sửa task đã xong' }),
      () => request(`/tasks/${gated.id}/checklist`, adminToken, 'POST', { version: doneTask.version, label: 'Không thêm checklist', isRequired: true }),
      () => request(`/tasks/${gated.id}/dependencies`, adminToken, 'POST', { version: doneTask.version, dependsOnTaskId: first.id }),
      () => request(`/tasks/${gated.id}/approve`, contributorToken, 'POST', { version: doneTask.version, decision: 'REJECTED', reason: 'Không đảo approval sau DONE' }),
    ]) {
      const response = await mutation()
      expect(response.status).toBe(409)
      expect((await response.json() as any).error.code).toBe('TASK_IMMUTABLE')
    }

    const rejectedTask = await data(await request('/tasks', adminToken, 'POST', { title: 'Task bị từ chối', eventId: event.id, requiresApproval: true }))
    const rejectedOwner = await data(await request(`/tasks/${rejectedTask.id}/assign`, adminToken, 'POST', { version: 1, userId: ownerId, assignmentRole: 'OWNER' }))
    const rejectedApprover = await data(await request(`/tasks/${rejectedTask.id}/assign`, adminToken, 'POST', { version: rejectedOwner.taskVersion, userId: contributorId, assignmentRole: 'APPROVER' }))
    expect((await request(`/tasks/${rejectedTask.id}/acknowledge`, ownerToken, 'POST', { assignmentId: rejectedOwner.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    expect((await request(`/tasks/${rejectedTask.id}/acknowledge`, contributorToken, 'POST', { assignmentId: rejectedApprover.assignment.id, version: 1, status: 'ACCEPTED' })).status).toBe(200)
    const rejected = await data(await request(`/tasks/${rejectedTask.id}/approve`, contributorToken, 'POST', { version: rejectedApprover.taskVersion, decision: 'REJECTED', reason: 'Cần làm lại' }))
    expect((await request(`/tasks/${rejectedTask.id}/transition`, ownerToken, 'POST', { version: rejected.version, status: 'DONE' })).status).toBe(409)
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
    const ready = await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: 2, status: 'READY' })
    expect(ready.status).toBe(409)
    expect((await ready.json() as any).error.code).toBe('READINESS_BLOCKED')
  })

  it('revalidates readiness when READY transitions to LIVE', async () => {
    const event = await createEvent({ title: 'Event readiness revalidation' })
    const planning = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: 1, status: 'PLANNING' }))
    const ready = await data(await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: planning.version, status: 'READY' }))
    expect((await request('/tasks', adminToken, 'POST', { eventId: event.id, title: 'Required task added after READY', isRequired: true })).status).toBe(201)
    const live = await request(`/events/${event.id}/transition`, adminToken, 'POST', { version: ready.version, status: 'LIVE' })
    expect(live.status).toBe(409)
    expect((await live.json() as any).error.code).toBe('READINESS_BLOCKED')
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
    const leadTask = await request('/tasks', ownerToken, 'POST', { workstreamId: workstream.id, title: 'Mua nước' })
    expect(leadTask.status).toBe(201)
    const eventTransition = await request(`/events/${event.id}/transition`, ownerToken, 'POST', { version: 1, status: 'PLANNING' })
    expect(eventTransition.status).toBe(403)

    const removed = await request(`/workstreams/${workstream.id}/members/${memberRow.id}/remove`, adminToken, 'POST', { version: 2, memberVersion: 1, reason: 'Đổi trưởng nhóm' })
    expect(removed.status).toBe(200)
    const ownerPermissions = await data(await request(`/permissions?workstreamId=${workstream.id}`, ownerToken))
    expect(ownerPermissions.permissions['operations.task.manage']).toBe(false)

    const expiredMember = await request(`/workstreams/${workstream.id}/members`, adminToken, 'POST', { version: 3, userId: expiredLeaderId, operationRole: 'CONTRIBUTOR', startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-12-31T23:59:59Z' })
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

  it('cancels pending reminders atomically with receipts and refuses already queued delivery', async () => {
    const event = await createEvent({ organizerUserId: ownerId })
    const reminder = await data(await request('/reminders', adminToken, 'POST', { eventId: event.id, recipientUserId: ownerId, triggerAt: '2099-01-01T00:00:00Z', kind: 'EVENT_START' }))
    expect((await request(`/reminders/${reminder.id}/cancel`, foreignToken, 'POST', { reason: 'Foreign' })).status).toBe(404)
    expect((await request(`/reminders/${reminder.id}/cancel`, contributorToken, 'POST', { reason: 'Unscoped' })).status).toBe(403)
    const receipt = `cancel-${suffix}`
    expect((await request(`/reminders/${reminder.id}/cancel`, ownerToken, 'POST', { reason: 'Không cần' }, receipt)).status).toBe(200)
    expect((await request(`/reminders/${reminder.id}/cancel`, ownerToken, 'POST', { reason: 'Không cần' }, receipt)).status).toBe(200)
    const [stored] = await db.select().from(operationReminders).where(eq(operationReminders.id, reminder.id))
    expect(stored.status).toBe('CANCELLED')
    expect(stored.notificationId).toBeNull()
    const queued = await data(await request('/reminders', adminToken, 'POST', { eventId: event.id, recipientUserId: ownerId, triggerAt: '2099-01-02T00:00:00Z', kind: 'EVENT_START' }))
    await db.update(operationReminders).set({ status: 'ENQUEUED' }).where(eq(operationReminders.id, queued.id))
    expect((await request(`/reminders/${queued.id}/cancel`, ownerToken, 'POST', { reason: 'Quá muộn' })).status).toBe(409)
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
    expect(inboxReminder).toMatchObject({ id: reminder.id, parishId: parishA, status: 'SENT', kind: 'TASK_DUE' })
    expect(inboxReminder).not.toHaveProperty('dedupeKey')
    expect(inboxReminder).not.toHaveProperty('notificationId')
    expect(inboxReminder).not.toHaveProperty('attemptCount')
    expect(inboxReminder).not.toHaveProperty('error')
    expect(inboxReminder).not.toHaveProperty('taskId')
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
})
