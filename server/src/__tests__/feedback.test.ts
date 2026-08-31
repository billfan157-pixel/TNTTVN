import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import feedbackApp from '../routes/feedback.js'
import { client, db } from '../db/index.js'
import { assertDatabaseReady } from '../db/schemaHealth.js'
import {
  academicYears,
  auditLogs,
  branches,
  catechistAssignments,
  classes,
  feedbackMessages,
  students,
  users,
} from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import { applyLogPrivacy } from '../middleware/logger.js'

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const parishId = `feedback-parish-${suffix}`
const otherParishId = `feedback-other-${suffix}`
const ids = {
  admin: `feedback-admin-${suffix}`,
  parent: `feedback-parent-${suffix}`,
  teacher: `feedback-teacher-${suffix}`,
  otherTeacher: `feedback-other-teacher-${suffix}`,
  branch: `feedback-branch-${suffix}`,
  year: `feedback-year-${suffix}`,
  class: `feedback-class-${suffix}`,
  otherClass: `feedback-other-class-${suffix}`,
  student: `feedback-student-${suffix}`,
}

function headers(userId: string, role: 'admin' | 'chunhiem' | 'phuhuynh', targetParish = parishId) {
  const { accessToken } = generateTokens({ userId, username: userId, role, parishId: targetParish, tokenVersion: 1 })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

describe('feedback privacy, RBAC and tenant boundary', () => {
  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: ids.branch, name: 'Ngành góp ý', scarfColor: '#fff', ageMin: 8, ageMax: 12, parishId })
    await db.insert(academicYears).values({ id: ids.year, startDate: '2026-09-01', endDate: '2027-06-30', parishId })
    await db.insert(classes).values([
      { id: ids.class, code: `FB-A-${suffix}`, name: 'Lớp của con', branchId: ids.branch, academicYearId: ids.year, parishId },
      { id: ids.otherClass, code: `FB-B-${suffix}`, name: 'Lớp khác', branchId: ids.branch, academicYearId: ids.year, parishId },
    ])
    await db.insert(users).values([
      { id: ids.admin, username: ids.admin, passwordHash: 'hash', fullName: 'Admin góp ý', role: 'admin', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: ids.parent, username: ids.parent, passwordHash: 'hash', fullName: 'Phụ huynh góp ý', phone: '0901234567', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: ids.teacher, username: ids.teacher, passwordHash: 'hash', fullName: 'GLV chủ nhiệm', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: ids.otherTeacher, username: ids.otherTeacher, passwordHash: 'hash', fullName: 'GLV lớp khác', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
    ])
    await db.insert(students).values({
      id: ids.student,
      code: `FB-ST-${suffix}`,
      holyName: 'Maria',
      fullName: 'Thiếu nhi thử nghiệm',
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'Phụ huynh góp ý',
      parentPhone: '0901234567',
      address: 'Test',
      branch: 'AuNhi',
      classId: ids.class,
      parishId,
      status: 'Đang học',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(catechistAssignments).values([
      { id: `asg-a-${suffix}`, userId: ids.teacher, classId: ids.class, roleInClass: 'chunhiem', parishId },
      { id: `asg-b-${suffix}`, userId: ids.otherTeacher, classId: ids.otherClass, roleInClass: 'chunhiem', parishId },
    ])
  })

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
    await db.delete(feedbackMessages).where(eq(feedbackMessages.parishId, parishId))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(classes).where(eq(classes.parishId, parishId))
    await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
    await db.delete(branches).where(eq(branches.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
  })

  it('requires authentication', async () => {
    expect((await feedbackApp.request('/targets')).status).toBe(401)
    expect((await feedbackApp.request('/', { method: 'POST' })).status).toBe(401)
  })

  it('passes the executable schema readiness gate with feedback privacy constraints', async () => {
    await expect(assertDatabaseReady(client)).resolves.toBeUndefined()
  })

  it('admin can receive parish mail but cannot submit feedback', async () => {
    const response = await feedbackApp.request('/', {
      method: 'POST',
      headers: headers(ids.admin, 'admin'),
      body: JSON.stringify({
        targetType: 'PARISH',
        visibility: 'PUBLIC',
        subject: 'Admin không được gửi',
        content: 'Backend phải chặn thao tác gửi thư của admin.',
      }),
    })
    expect(response.status).toBe(403)

    const submitted = await feedbackApp.request('/', {
      method: 'POST',
      headers: headers(ids.parent, 'phuhuynh'),
      body: JSON.stringify({
        targetType: 'PARISH',
        visibility: 'PUBLIC',
        subject: 'Thư gửi về Xứ đoàn',
        content: 'Admin phải tiếp nhận được thư này trong hộp thư Xứ đoàn.',
      }),
    })
    expect(submitted.status).toBe(201)

    const inboxResponse = await feedbackApp.request('/inbox', { headers: headers(ids.admin, 'admin') })
    expect(inboxResponse.status).toBe(200)
    const inboxBody = await inboxResponse.json() as any
    expect(inboxBody.data.some((item: any) => item.subject === 'Thư gửi về Xứ đoàn')).toBe(true)
  })

  it('returns only homeroom teachers linked to the parent children', async () => {
    const response = await feedbackApp.request('/targets', { headers: headers(ids.parent, 'phuhuynh') })
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.data.map((target: any) => target.userId)).toContain(ids.teacher)
    expect(body.data.map((target: any) => target.userId)).not.toContain(ids.otherTeacher)
  })

  it('stores anonymous feedback without sender identity or sender audit', async () => {
    const response = await feedbackApp.request('/', {
      method: 'POST',
      headers: headers(ids.parent, 'phuhuynh'),
      body: JSON.stringify({
        targetType: 'PARISH',
        visibility: 'ANONYMOUS',
        subject: 'Góp ý ẩn danh',
        content: 'Nội dung góp ý đủ dài để kiểm thử.',
      }),
    })
    expect(response.status).toBe(201)
    const body = await response.json() as any
    expect(body.data.senderName).toBe('Ẩn danh')

    const [stored] = await db.select().from(feedbackMessages).where(and(
      eq(feedbackMessages.parishId, parishId),
      eq(feedbackMessages.id, body.data.id),
    ))
    expect(stored.senderUserId).toBeNull()

    const senderAudit = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.entityId, body.data.id),
    ))
    expect(senderAudit).toHaveLength(0)
  })

  it('rejects a parent targeting a teacher outside their children classes', async () => {
    const response = await feedbackApp.request('/', {
      method: 'POST',
      headers: headers(ids.parent, 'phuhuynh'),
      body: JSON.stringify({
        targetType: 'HOMEROOM_TEACHER',
        targetUserId: ids.otherTeacher,
        visibility: 'ANONYMOUS',
        subject: 'Sai người nhận',
        content: 'Nội dung này không được phép gửi tới lớp khác.',
      }),
    })
    expect(response.status).toBe(403)
  })

  it('delivers teacher feedback only to the exact target and public sent mail stays attributable', async () => {
    const response = await feedbackApp.request('/', {
      method: 'POST',
      headers: headers(ids.parent, 'phuhuynh'),
      body: JSON.stringify({
        targetType: 'HOMEROOM_TEACHER',
        targetUserId: ids.teacher,
        visibility: 'PUBLIC',
        subject: 'Trao đổi công khai',
        content: 'Xin góp ý trực tiếp với giáo lý viên chủ nhiệm.',
      }),
    })
    expect(response.status).toBe(201)

    const ownInbox = await feedbackApp.request('/inbox', { headers: headers(ids.teacher, 'chunhiem') })
    const otherInbox = await feedbackApp.request('/inbox', { headers: headers(ids.otherTeacher, 'chunhiem') })
    const sent = await feedbackApp.request('/sent', { headers: headers(ids.parent, 'phuhuynh') })
    expect((await ownInbox.json() as any).data.some((item: any) => item.subject === 'Trao đổi công khai')).toBe(true)
    expect((await otherInbox.json() as any).data.some((item: any) => item.subject === 'Trao đổi công khai')).toBe(false)
    expect((await sent.json() as any).data.some((item: any) => item.subject === 'Trao đổi công khai')).toBe(true)
  })

  it('DB constraint rejects identity on an anonymous row', async () => {
    await expect(db.insert(feedbackMessages).values({
      id: `feedback-invalid-${suffix}`,
      parishId,
      targetType: 'PARISH',
      visibility: 'ANONYMOUS',
      senderUserId: ids.parent,
      subject: 'Không hợp lệ',
      content: 'Constraint phải từ chối bản ghi này.',
    })).rejects.toThrow()
  })

  it('redacts identity and network metadata from anonymous application logs', () => {
    const redacted = applyLogPrivacy({
      requestId: 'req-1',
      timestamp: '2026-08-31T00:00:00.000Z',
      method: 'POST',
      path: '/api/feedback',
      userId: ids.parent,
      parishId,
      ip: '203.0.113.10',
      userAgent: 'test-browser',
    }, 'anonymous-feedback')
    expect(redacted).not.toHaveProperty('userId')
    expect(redacted).not.toHaveProperty('parishId')
    expect(redacted).not.toHaveProperty('ip')
    expect(redacted).not.toHaveProperty('userAgent')
    expect(redacted.path).toBe('/api/feedback/anonymous')
  })

  it('does not cross tenant boundaries', async () => {
    const foreignToken = generateTokens({ userId: ids.admin, username: ids.admin, role: 'admin', parishId: otherParishId, tokenVersion: 1 }).accessToken
    const response = await feedbackApp.request('/inbox', { headers: { Authorization: `Bearer ${foreignToken}` } })
    expect(response.status).toBe(401)
  })
})
