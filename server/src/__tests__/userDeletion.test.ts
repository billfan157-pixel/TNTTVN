import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import authRouter from '../routes/auth.js'
import usersRouter from '../routes/users.js'
import { db } from '../db/index.js'
import {
  academicYears,
  auditLogs,
  branches,
  catechistAssignments,
  classes,
  parishPeople,
  passwordResetRequests,
  pushSubscriptions,
  refreshTokens,
  telegramLinks,
  telegramLinkTokens,
  users,
} from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import { issueTokensWithSession, rotateRefreshSession } from '../services/refreshSessionService.js'

const stamp = Date.now()
const parishA = `parish-user-delete-a-${stamp}`
const parishB = `parish-user-delete-b-${stamp}`
const adminId = `usr-delete-admin-${stamp}`
const targetId = `usr-delete-target-${stamp}`
const viewerId = `usr-delete-viewer-${stamp}`
const foreignId = `usr-delete-foreign-${stamp}`
const branchId = `branch-delete-${stamp}`
const academicYearId = `year-delete-${stamp}`
const classId = `class-delete-${stamp}`
const password = 'AdminDelete@123'
const targetUsername = `glv_delete_${stamp}`

const jsonHeaders = { 'Content-Type': 'application/json' }

function headers(userId: string, username: string, role: 'admin' | 'chunhiem' | 'phuta', parishId = parishA) {
  const { accessToken } = generateTokens({ userId, username, role, parishId, tokenVersion: 1 })
  return { ...jsonHeaders, Authorization: `Bearer ${accessToken}` }
}

const adminHeaders = () => headers(adminId, `admin_delete_${stamp}`, 'admin')
const viewerHeaders = () => headers(viewerId, `viewer_delete_${stamp}`, 'phuta')

describe('D3 admin-only soft deletion of user accounts', () => {
  let targetAccessToken = ''
  let targetRefreshToken = ''

  beforeAll(async () => {
    const now = new Date().toISOString()
    const passwordHash = await bcrypt.hash(password, 4)
    await db.insert(users).values([
      { id: adminId, username: `admin_delete_${stamp}`, fullName: 'Delete Admin', passwordHash, role: 'admin', status: 'ACTIVE', tokenVersion: 1, parishId: parishA, createdAt: now },
      { id: targetId, username: targetUsername, fullName: 'GLV To Delete', holyName: 'Phêrô', phone: '0901234567', passwordHash, role: 'chunhiem', status: 'ACTIVE', tokenVersion: 1, parishId: parishA, createdAt: now },
      { id: viewerId, username: `viewer_delete_${stamp}`, fullName: 'Viewer GLV', passwordHash, role: 'phuta', status: 'ACTIVE', tokenVersion: 1, parishId: parishA, createdAt: now },
      { id: foreignId, username: `foreign_delete_${stamp}`, fullName: 'Foreign User', passwordHash, role: 'phuta', status: 'ACTIVE', tokenVersion: 1, parishId: parishB, createdAt: now },
    ])
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: '#fff', ageMin: 7, ageMax: 9, parishId: parishA })
    await db.insert(academicYears).values({ id: academicYearId, startDate: '2026-08-01', endDate: '2027-05-31', status: 'OPEN', currentSemester: 1, parishId: parishA })
    await db.insert(classes).values({ id: classId, code: `DEL-${stamp}`, name: 'Lớp Xóa', branchId, academicYearId, parishId: parishA, createdAt: now })
    await db.insert(catechistAssignments).values({ id: `asg-delete-${stamp}`, userId: targetId, classId, roleInClass: 'chunhiem', parishId: parishA, createdAt: now, updatedAt: now })
    await db.insert(pushSubscriptions).values({ id: `push-delete-${stamp}`, endpoint: `https://push.example/${stamp}`, p256dh: 'p256dh', auth: 'auth', userId: targetId, parishId: parishA, createdAt: now })
    await db.insert(telegramLinkTokens).values({ id: `tlt-delete-${stamp}`, userId: targetId, tokenHash: `hash-delete-${stamp}`, expiresAt: '2099-01-01T00:00:00.000Z', parishId: parishA, createdAt: now })
    await db.insert(telegramLinks).values({ id: `tgl-delete-${stamp}`, userId: targetId, chatId: `chat-delete-${stamp}`, status: 'ACTIVE', notificationsEnabled: 1, parishId: parishA, linkedAt: now, createdAt: now, updatedAt: now })
    await db.insert(passwordResetRequests).values({ id: `pwr-delete-${stamp}`, userId: targetId, status: 'PENDING', requestCount: 1, lastRequestedAt: now, parishId: parishA, createdAt: now, updatedAt: now })
    await db.insert(parishPeople).values({ id: `person-delete-${stamp}`, linkedUserId: targetId, fullName: 'Hồ sơ GLV', serviceStatus: 'ACTIVE', visibility: 'STAFF', createdBy: adminId, updatedBy: adminId, parishId: parishA, createdAt: now, updatedAt: now })
    await db.insert(parishPeople).values({ id: `person-delete-historical-${stamp}`, linkedUserId: targetId, fullName: 'Hồ sơ GLV lưu trữ', serviceStatus: 'FORMER', visibility: 'STAFF', deletedAt: now, createdBy: adminId, updatedBy: adminId, parishId: parishA, createdAt: now, updatedAt: now })

    const tokens = await issueTokensWithSession({ id: targetId, username: targetUsername, role: 'chunhiem', parishId: parishA }, 1)
    targetAccessToken = tokens.accessToken
    targetRefreshToken = tokens.refreshToken
  })

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishA))
    await db.delete(parishPeople).where(eq(parishPeople.parishId, parishA))
    await db.delete(passwordResetRequests).where(eq(passwordResetRequests.parishId, parishA))
    await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.parishId, parishA))
    await db.delete(telegramLinks).where(eq(telegramLinks.parishId, parishA))
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.parishId, parishA))
    await db.delete(refreshTokens).where(eq(refreshTokens.parishId, parishA))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishA))
    await db.delete(classes).where(eq(classes.parishId, parishA))
    await db.delete(branches).where(eq(branches.parishId, parishA))
    await db.delete(academicYears).where(eq(academicYears.parishId, parishA))
    await db.delete(users).where(eq(users.parishId, parishA))
    await db.delete(users).where(eq(users.parishId, parishB))
  })

  it('allows phuta to read only the sanitized catechist directory', async () => {
    const directory = await usersRouter.request('/catechists', { headers: viewerHeaders() })
    expect(directory.status).toBe(200)
    const body = (await directory.json()) as any
    const target = body.data.find((item: any) => item.id === targetId)
    expect(target).toMatchObject({ id: targetId, fullName: 'GLV To Delete', holyName: 'Phêrô', role: 'chunhiem' })
    expect(target.username).toBeUndefined()
    expect(target.phone).toBeUndefined()
    expect(target.status).toBeUndefined()
    expect(target.lastLoginAt).toBeUndefined()

    const management = await usersRouter.request('/', { headers: viewerHeaders() })
    expect(management.status).toBe(403)
    const deletion = await usersRouter.request(`/${targetId}`, {
      method: 'DELETE',
      headers: viewerHeaders(),
      body: JSON.stringify({ adminPassword: password }),
    })
    expect(deletion.status).toBe(403)
  })

  it('blocks self-delete, Admin trưởng delete and cross-tenant targets', async () => {
    const self = await usersRouter.request(`/${adminId}`, {
      method: 'DELETE', headers: adminHeaders(), body: JSON.stringify({ adminPassword: password }),
    })
    expect(self.status).toBe(403)

    const superAdmin = await usersRouter.request('/USR-001', {
      method: 'DELETE', headers: adminHeaders(), body: JSON.stringify({ adminPassword: password }),
    })
    expect(superAdmin.status).toBe(403)

    const foreign = await usersRouter.request(`/${foreignId}`, {
      method: 'DELETE', headers: adminHeaders(), body: JSON.stringify({ adminPassword: password }),
    })
    expect(foreign.status).toBe(404)
    const [foreignRow] = await db.select().from(users).where(and(eq(users.id, foreignId), eq(users.parishId, parishB)))
    expect(foreignRow.deletedAt).toBeNull()
  })

  it('requires admin re-authentication and audits failed confirmation', async () => {
    const response = await usersRouter.request(`/${targetId}`, {
      method: 'DELETE',
      headers: adminHeaders(),
      body: JSON.stringify({ adminPassword: 'WrongPassword@123' }),
    })
    expect(response.status).toBe(401)
    const [audit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishA),
      eq(auditLogs.action, 'DELETE_USER_ACCOUNT_FAILED'),
      eq(auditLogs.entityId, targetId),
    )).limit(1)
    expect(audit).toBeDefined()
  })

  it('soft-deletes atomically, revokes access and preserves the personnel profile', async () => {
    const response = await usersRouter.request(`/${targetId}`, {
      method: 'DELETE',
      headers: adminHeaders(),
      body: JSON.stringify({ adminPassword: password }),
    })
    expect(response.status).toBe(200)
    expect((await response.json() as any).data).toMatchObject({ id: targetId, deleted: true, alreadyDeleted: false })

    const [row] = await db.select().from(users).where(and(eq(users.id, targetId), eq(users.parishId, parishA)))
    expect(row.status).toBe('INACTIVE')
    expect(row.deletedAt).toBeTruthy()
    expect(row.tokenVersion).toBe(2)

    expect(await db.select().from(catechistAssignments).where(eq(catechistAssignments.userId, targetId))).toHaveLength(0)
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, targetId))).toHaveLength(0)
    const targetSessions = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, targetId))
    expect(targetSessions).toHaveLength(1)
    expect(targetSessions[0].revokedAt).toBeTruthy()
    expect(await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.userId, targetId))).toHaveLength(0)
    expect(await db.select().from(telegramLinkTokens).where(eq(telegramLinkTokens.userId, targetId))).toHaveLength(0)
    const [telegram] = await db.select().from(telegramLinks).where(eq(telegramLinks.userId, targetId))
    expect(telegram.status).toBe('REVOKED')
    const [person] = await db.select().from(parishPeople).where(eq(parishPeople.linkedUserId, targetId))
    expect(person).toBeUndefined()
    const [preservedPerson] = await db.select().from(parishPeople).where(eq(parishPeople.id, `person-delete-${stamp}`))
    expect(preservedPerson.fullName).toBe('Hồ sơ GLV')
    expect(preservedPerson.linkedUserId).toBeNull()
    const [historicalPerson] = await db.select().from(parishPeople).where(eq(parishPeople.id, `person-delete-historical-${stamp}`))
    expect(historicalPerson.deletedAt).toBeTruthy()
    expect(historicalPerson.linkedUserId).toBeNull()

    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, 'DELETE_USER_ACCOUNT'), eq(auditLogs.entityId, targetId))).limit(1)
    expect(audit?.userId).toBe(adminId)
    expect(audit?.oldValue).not.toContain('GLV To Delete')

    const oldAccess = await usersRouter.request('/catechists', { headers: { Authorization: `Bearer ${targetAccessToken}` } })
    expect(oldAccess.status).toBe(401)
    expect((await rotateRefreshSession(targetRefreshToken)).status).toBe('rejected')

    const login = await authRouter.request('/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ username: targetUsername, password, parishId: parishA }),
    })
    expect(login.status).toBe(401)

    const directory = await usersRouter.request('/catechists', { headers: viewerHeaders() })
    const directoryBody = (await directory.json()) as any
    expect(directoryBody.data.some((item: any) => item.id === targetId)).toBe(false)
  })

  it('is idempotent for an authenticated retry after the delete committed', async () => {
    const response = await usersRouter.request(`/${targetId}`, {
      method: 'DELETE',
      headers: adminHeaders(),
      body: JSON.stringify({ adminPassword: password }),
    })
    expect(response.status).toBe(200)
    expect((await response.json() as any).data.alreadyDeleted).toBe(true)
  })
})
