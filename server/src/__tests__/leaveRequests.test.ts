import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import leaveRequestsRouter from '../routes/leaveRequests.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, students, classes, branches, academicYears, catechistAssignments, leaveRequests, attendance } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

const PREFIX = Date.now()
const parishId = `parish-lrq-${PREFIX}`
const parentId = `usr-parent-${PREFIX}`
const teacherId = `usr-teacher-${PREFIX}`
const adminId = `usr-admin-${PREFIX}`
const branchId = `br-lrq-${PREFIX}`
const yearId = `yr-lrq-${PREFIX}`
const classId = `cl-lrq-${PREFIX}`
const studentId = `st-lrq-${PREFIX}`

function parentHeaders() {
  const { accessToken } = generateTokens({ userId: parentId, username: `parent_${PREFIX}`, role: 'phuhuynh', parishId, tokenVersion: 1 })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

function teacherHeaders() {
  const { accessToken } = generateTokens({ userId: teacherId, username: `teacher_${PREFIX}`, role: 'chunhiem', parishId, tokenVersion: 1 })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

function adminHeaders() {
  const { accessToken } = generateTokens({ userId: adminId, username: `admin_${PREFIX}`, role: 'admin', parishId, tokenVersion: 1 })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

describe('Leave Requests Route & Attendance Auto-Sync Integration Tests', () => {
  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: '#00a', ageMin: 7, ageMax: 9, parishId })
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-06-30', parishId })
    await db.insert(classes).values({ id: classId, code: `CL-LRQ-${PREFIX}`, name: 'Ấu 1', branchId, academicYearId: yearId, parishId })

    await db.insert(users).values([
      { id: adminId, username: `admin_${PREFIX}`, passwordHash: 'hash', fullName: 'Admin Test', role: 'admin', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: teacherId, username: `teacher_${PREFIX}`, passwordHash: 'hash', fullName: 'GLV Nguyễn Văn B', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: parentId, username: `parent_${PREFIX}`, passwordHash: 'hash', fullName: 'Phụ Huynh A', phone: '0912345678', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
    ])

    // Assign teacher to class
    await db.insert(catechistAssignments).values({
      id: `ca-${PREFIX}`,
      userId: teacherId,
      classId,
      roleInClass: 'chunhiem',
      parishId,
    })

    // Create student linked to parent phone
    await db.insert(students).values({
      id: studentId,
      code: `ST-${PREFIX}`,
      holyName: 'Têrêsa',
      fullName: 'Nguyễn Thị Hoa',
      gender: 'Nữ',
      dateOfBirth: '2016-05-10',
      parentName: 'Phụ Huynh A',
      parentPhone: '0912345678',
      address: 'Xóm 1',
      branch: 'AuNhi',
      classId,
      parishId,
      status: 'Đang học',
      createdAt: now,
      updatedAt: now,
    })
  })

  afterAll(async () => {
    await db.delete(attendance).where(and(eq(attendance.parishId, parishId), eq(attendance.studentId, studentId)))
    await db.delete(leaveRequests).where(eq(leaveRequests.parishId, parishId))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(classes).where(eq(classes.id, classId))
    await db.delete(academicYears).where(eq(academicYears.id, yearId))
    await db.delete(branches).where(eq(branches.id, branchId))
    await db.delete(users).where(eq(users.parishId, parishId))
  })

  let createdRequestId: string

  it('1. Parent submits a leave request with multiple session types', async () => {
    const res = await leaveRequestsRouter.request('/', {
      method: 'POST',
      headers: parentHeaders(),
      body: JSON.stringify({
        studentId,
        date: '2026-08-16',
        sessionTypes: ['SundayMass', 'CatechismClass', 'EucharisticAdoration'],
        reason: 'Em bị sốt xuất huyết cần nghỉ điều trị',
      }),
    })

    expect(res.status).toBe(201)
    const json = (await res.json()) as any
    expect(json.data.id).toBeDefined()
    expect(json.data.status).toBe('PENDING')
    expect(json.data.sessionTypes).toEqual(['SundayMass', 'CatechismClass', 'EucharisticAdoration'])
    createdRequestId = json.data.id
  })

  it('2. Teacher gets pending count and requests list scoped to assigned class', async () => {
    const countRes = await leaveRequestsRouter.request('/pending-count', {
      method: 'GET',
      headers: teacherHeaders(),
    })
    expect(countRes.status).toBe(200)
    const countJson = (await countRes.json()) as any
    expect(countJson.data.pendingCount).toBe(1)

    const listRes = await leaveRequestsRouter.request('/', {
      method: 'GET',
      headers: teacherHeaders(),
    })
    expect(listRes.status).toBe(200)
    const listJson = (await listRes.json()) as any
    expect(listJson.data).toHaveLength(1)
    expect(listJson.data[0].id).toBe(createdRequestId)
    expect(listJson.data[0].studentName).toBe('Nguyễn Thị Hoa')
  })

  it('3. Parent cannot approve/review leave requests (403 Forbidden)', async () => {
    const res = await leaveRequestsRouter.request(`/${createdRequestId}/review`, {
      method: 'PATCH',
      headers: parentHeaders(),
      body: JSON.stringify({
        status: 'APPROVED',
        reviewNote: 'Hacker try',
      }),
    })
    expect(res.status).toBe(403)
  })

  it('4. Teacher approves the leave request -> automatically synchronizes attendance table for all sessions', async () => {
    const res = await leaveRequestsRouter.request(`/${createdRequestId}/review`, {
      method: 'PATCH',
      headers: teacherHeaders(),
      body: JSON.stringify({
        status: 'APPROVED',
        reviewNote: 'Đã nhận tin từ phụ huynh, chúc em mau khỏe!',
      }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.data.status).toBe('APPROVED')
    expect(json.data.reviewerName).toBe('GLV Nguyễn Văn B')

    // Verify auto-synced attendance in DB
    const attRows = await db
      .select()
      .from(attendance)
      .where(and(
        eq(attendance.parishId, parishId),
        eq(attendance.studentId, studentId),
        eq(attendance.date, '2026-08-16'),
      ))

    expect(attRows).toHaveLength(3)
    const types = attRows.map((r) => r.type)
    expect(types).toContain('SundayMass')
    expect(types).toContain('CatechismClass')
    expect(types).toContain('EucharisticAdoration')

    attRows.forEach((r) => {
      expect(r.status).toBe('AbsentExcused')
      expect(r.note).toContain('[Đơn online]')
    })
  })
})
