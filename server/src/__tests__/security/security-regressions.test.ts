import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { generateId } from '../../utils/id.js'
import { generateTokens } from '../../middleware/auth.js'
import verificationRouter from '../../routes/verification.js'
import leaveRequestsRouter from '../../routes/leaveRequests.js'
import notificationsRouter from '../../routes/notifications.js'
import { db } from '../../db/index.js'
import {
  users,
  branches,
  academicYears,
  classes,
  students,
  catechistAssignments,
  leaveRequests,
} from '../../db/schema.js'

const parishId = `security-reg-${Date.now()}`
const now = new Date().toISOString()
const adminId = generateId('USR')
const catechistId = generateId('USR')
const otherCatechistId = generateId('USR')
const branchId = generateId('BR')
const yearId = generateId('AY')
const classAId = generateId('CLS')
const classBId = generateId('CLS')
const studentBId = generateId('STU')
const leaveId = generateId('LRQ')

const catechistToken = generateTokens({
  userId: catechistId,
  username: 'security-catechist',
  role: 'chunhiem',
  parishId,
  tokenVersion: 1,
}).accessToken

const jsonHeaders = { 'Content-Type': 'application/json' }

describe('Security regression tests', () => {
  beforeAll(async () => {
    await db.insert(branches).values({
      id: branchId,
      name: 'Security Branch',
      scarfColor: 'Xanh',
      ageMin: 6,
      ageMax: 9,
      parishId,
    })
    await db.insert(academicYears).values({
      id: yearId,
      startDate: '2025-09-01',
      endDate: '2026-05-31',
      parishId,
    })
    await db.insert(users).values([
      { id: adminId, username: 'security-admin', fullName: 'Security Admin', passwordHash: 'hash', role: 'admin', parishId, status: 'ACTIVE', tokenVersion: 1, createdAt: now },
      { id: catechistId, username: 'security-catechist', fullName: 'Security Catechist', passwordHash: 'hash', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1, createdAt: now },
      { id: otherCatechistId, username: 'security-other', fullName: 'Security Other', passwordHash: 'hash', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1, createdAt: now },
    ])
    await db.insert(classes).values([
      { id: classAId, code: 'SEC-A', name: 'Security A', branchId, academicYearId: yearId, parishId, createdAt: now, updatedAt: now },
      { id: classBId, code: 'SEC-B', name: 'Security B', branchId, academicYearId: yearId, parishId, createdAt: now, updatedAt: now },
    ])
    await db.insert(catechistAssignments).values({
      id: generateId('ASN'),
      userId: catechistId,
      classId: classAId,
      roleInClass: 'chunhiem',
      parishId,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(students).values({
      id: studentBId,
      code: 'SEC-STU-B',
      holyName: 'Maria',
      fullName: 'Security Student B',
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'Parent B',
      parentPhone: '0900000000',
      address: 'Security Address',
      branch: 'AuNhi',
      classId: classBId,
      parishId,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(leaveRequests).values({
      id: leaveId,
      parishId,
      studentId: studentBId,
      classId: classBId,
      parentId: otherCatechistId,
      parentName: 'Parent B',
      parentPhone: '0900000000',
      date: '2025-10-05',
      sessionTypes: JSON.stringify(['CatechismClass']),
      reason: 'Security test',
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    })
  })

  afterAll(async () => {
    await db.delete(leaveRequests).where((await import('drizzle-orm')).eq(leaveRequests.parishId, parishId))
    await db.delete(students).where((await import('drizzle-orm')).eq(students.parishId, parishId))
    await db.delete(catechistAssignments).where((await import('drizzle-orm')).eq(catechistAssignments.parishId, parishId))
    await db.delete(classes).where((await import('drizzle-orm')).eq(classes.parishId, parishId))
    await db.delete(users).where((await import('drizzle-orm')).eq(users.parishId, parishId))
    await db.delete(branches).where((await import('drizzle-orm')).eq(branches.parishId, parishId))
    await db.delete(academicYears).where((await import('drizzle-orm')).eq(academicYears.parishId, parishId))
  })

  it('does not allow anonymous callers to mint verification signatures', async () => {
    const response = await verificationRouter.request('/sign', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ studentId: 'arbitrary-student', academicYear: '2025-2026', certId: 'arbitrary-cert' }),
    })
    expect(response.status).toBe(401)
  })

  it('does not allow a catechist to cancel a pending request outside assigned classes', async () => {
    const response = await leaveRequestsRouter.request(`/${leaveId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${catechistToken}` },
    })
    expect(response.status).toBe(403)
  })

  it('does not allow a catechist to use parish-wide push broadcast', async () => {
    const response = await notificationsRouter.request('/send', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${catechistToken}` },
      body: JSON.stringify({ title: 'Security test', body: 'Security test' }),
    })
    expect(response.status).toBe(403)
  })
})
