import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import classesApp from '../routes/classes.js'
import usersApp from '../routes/users.js'
import { db } from '../db/index.js'
import { academicYears, auditLogs, branches, catechistAssignments, classes, users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'

const parishId = 'parish-class-assignment-atomic'
const adminId = 'usr-class-assignment-admin'
const oldTeacherId = 'usr-class-assignment-old'
const newTeacherId = 'usr-class-assignment-new'
const assistantId = 'usr-class-assignment-assistant'
const parentId = 'usr-class-assignment-parent'
const classId = 'class-assignment-target'
const secondClassId = 'class-assignment-second'
const raceClassId = 'class-assignment-race'
const raceTeacherAId = 'usr-class-assignment-race-a'
const raceTeacherBId = 'usr-class-assignment-race-b'

function headers() {
  const { accessToken } = generateTokens({
    userId: adminId,
    username: 'assignment_admin',
    role: 'admin',
    parishId,
    tokenVersion: 1,
  })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

async function cleanup() {
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
}

describe('class assignment integrity', () => {
  beforeAll(async () => {
    await cleanup()
    await db.insert(users).values([
      { id: adminId, username: 'assignment_admin', passwordHash: 'hash', fullName: 'Admin', role: 'admin', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: oldTeacherId, username: 'assignment_old', passwordHash: 'hash', fullName: 'Old', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: newTeacherId, username: 'assignment_new', passwordHash: 'hash', fullName: 'New', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: assistantId, username: 'assignment_assistant', passwordHash: 'hash', fullName: 'Assistant', role: 'phuta', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: parentId, username: 'assignment_parent', passwordHash: 'hash', fullName: 'Parent', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: raceTeacherAId, username: 'assignment_race_a', passwordHash: 'hash', fullName: 'Race A', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: raceTeacherBId, username: 'assignment_race_b', passwordHash: 'hash', fullName: 'Race B', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
    ])
    await db.insert(branches).values({ id: 'branch-assignment', name: 'Thiếu', scarfColor: 'Xanh', ageMin: 9, ageMax: 12, parishId })
    await db.insert(academicYears).values({ id: 'year-assignment', startDate: '2026-09-01', endDate: '2027-05-31', parishId })
    await db.insert(classes).values([
      { id: classId, code: 'ATOMIC-1', name: 'Atomic', branchId: 'branch-assignment', academicYearId: 'year-assignment', parishId },
      { id: secondClassId, code: 'ATOMIC-2', name: 'Atomic Second', branchId: 'branch-assignment', academicYearId: 'year-assignment', parishId },
      { id: raceClassId, code: 'ATOMIC-RACE', name: 'Atomic Race', branchId: 'branch-assignment', academicYearId: 'year-assignment', parishId },
    ])
    await db.insert(catechistAssignments).values({ id: 'assignment-old', userId: oldTeacherId, classId, roleInClass: 'chunhiem', parishId })
  })

  afterAll(cleanup)

  it('rejects assigning a parent even through the legacy single-assignment endpoint', async () => {
    const response = await classesApp.request(`/${classId}/assignments`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ userId: parentId, roleInClass: 'phuta' }),
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as any).error.code).toBe('ASSIGNMENTS_NOT_ALLOWED')
  })

  it('rejects assigning an admin account as classroom personnel', async () => {
    const response = await classesApp.request(`/${secondClassId}/assignments`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ userId: adminId, roleInClass: 'phuta' }),
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as any).error.code).toBe('ASSIGNMENTS_NOT_ALLOWED')
  })

  it('rolls back the replacement when any requested user is invalid', async () => {
    const response = await classesApp.request(`/${classId}/assignments`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ homeroomTeacherId: newTeacherId, assistantTeacherIds: ['missing-user'] }),
    })
    expect(response.status).toBe(404)

    const rows = await db.select().from(catechistAssignments).where(and(
      eq(catechistAssignments.parishId, parishId),
      eq(catechistAssignments.classId, classId),
    ))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: oldTeacherId, roleInClass: 'chunhiem' })
  })

  it('replaces the complete selection and audit atomically', async () => {
    const response = await classesApp.request(`/${classId}/assignments`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ homeroomTeacherId: newTeacherId, assistantTeacherIds: [assistantId] }),
    })
    expect(response.status).toBe(200)

    const rows = await db.select().from(catechistAssignments).where(and(
      eq(catechistAssignments.parishId, parishId),
      eq(catechistAssignments.classId, classId),
    ))
    expect(rows.map(row => [row.userId, row.roleInClass]).sort()).toEqual([
      [assistantId, 'phuta'],
      [newTeacherId, 'chunhiem'],
    ].sort())
    const audits = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.action, 'REPLACE_CLASS_ASSIGNMENTS'),
    ))
    expect(audits).toHaveLength(1)
  })

  it('rejects user-centric replacement that would make one user homeroom of two classes', async () => {
    const response = await usersApp.request(`/${newTeacherId}/assignments`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ assignedClasses: [classId, secondClassId] }),
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as any).error.code).toBe('USER_ALREADY_CN')

    const rows = await db.select().from(catechistAssignments).where(and(
      eq(catechistAssignments.parishId, parishId),
      eq(catechistAssignments.userId, newTeacherId),
    ))
    expect(rows.map(row => row.classId)).toEqual([classId])
  })

  it('blocks deleting a class while assignments still reference it', async () => {
    const response = await classesApp.request(`/${classId}`, {
      method: 'DELETE',
      headers: headers(),
    })
    expect(response.status).toBe(409)
    expect(((await response.json()) as any).error.code).toBe('CLASS_HAS_DEPENDENCIES')
  })

  it('serializes concurrent homeroom claims and persists exactly one owner', async () => {
    const claim = (userId: string) => classesApp.request(`/${raceClassId}/assignments`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ userId, roleInClass: 'chunhiem' }),
    })

    const responses = await Promise.all([claim(raceTeacherAId), claim(raceTeacherBId)])
    expect(responses.map(response => response.status).sort()).toEqual([200, 400])

    const rows = await db.select().from(catechistAssignments).where(and(
      eq(catechistAssignments.parishId, parishId),
      eq(catechistAssignments.classId, raceClassId),
      eq(catechistAssignments.roleInClass, 'chunhiem'),
    ))
    expect(rows).toHaveLength(1)
    expect([raceTeacherAId, raceTeacherBId]).toContain(rows[0].userId)
  })
})
