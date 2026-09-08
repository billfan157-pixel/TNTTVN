import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
vi.mock('../services/notificationQueue.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/notificationQueue.js')>()),
  enqueueNotification: vi.fn().mockResolvedValue('NOT-LEAVE-TEST'),
}))
import { ACADEMIC_NOTIFICATION_MESSAGE, enqueueNotification } from '../services/notificationQueue.js'
import leaveRequestsRouter from '../routes/leaveRequests.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, students, classes, branches, academicYears, catechistAssignments, leaveRequests, attendance, auditLogs } from '../db/schema.js'
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

  it.each(['current', 'relinked', 'locked', 'deleted-parent', 'deleted-child'] as const)('XD-05: delivery revalidates current relationship/status (%s)', async (scenario) => {
    const index = ['current', 'relinked', 'locked', 'deleted-parent', 'deleted-child'].indexOf(scenario)
    const created = await leaveRequestsRouter.request('/', { method: 'POST', headers: parentHeaders(), body: JSON.stringify({ studentId, date: `2026-11-${20 + index}`, sessionTypes: ['SundayMass'], reason: 'Synthetic privacy check' }) })
    expect(created.status).toBe(201)
    const requestId = ((await created.json()) as any).data.id
    try {
      if (scenario === 'relinked') await db.update(students).set({ parentPhone: '0999999999' }).where(and(eq(students.id, studentId), eq(students.parishId, parishId)))
      if (scenario === 'locked') await db.update(users).set({ status: 'LOCKED' }).where(and(eq(users.id, parentId), eq(users.parishId, parishId)))
      if (scenario === 'deleted-parent') await db.update(users).set({ deletedAt: new Date().toISOString() }).where(and(eq(users.id, parentId), eq(users.parishId, parishId)))
      if (scenario === 'deleted-child') await db.update(students).set({ deletedAt: new Date().toISOString() }).where(and(eq(students.id, studentId), eq(students.parishId, parishId)))
      vi.mocked(enqueueNotification).mockClear()
      const reviewed = await leaveRequestsRouter.request(`/${requestId}/review`, { method: 'PATCH', headers: teacherHeaders(), body: JSON.stringify({ status: 'REJECTED', reviewNote: 'Private note must remain inside app' }) })
      expect(reviewed.status).toBe(scenario === 'deleted-child' ? 404 : 200)
      if (scenario === 'current') {
        expect(enqueueNotification).toHaveBeenCalledWith(
          'webpush', 'absence', ACADEMIC_NOTIFICATION_MESSAGE, {}, parishId, undefined,
          { webpushUserIds: [parentId], studentId },
        )
      } else {
        expect(enqueueNotification).not.toHaveBeenCalled()
      }
    } finally {
      await db.delete(leaveRequests).where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.parishId, parishId)))
      await db.update(users).set({ status: 'ACTIVE', deletedAt: null }).where(and(eq(users.id, parentId), eq(users.parishId, parishId)))
      await db.update(students).set({ parentPhone: '0912345678', deletedAt: null }).where(and(eq(students.id, studentId), eq(students.parishId, parishId)))
    }
  })

  afterAll(async () => {
    await db.delete(attendance).where(and(eq(attendance.parishId, parishId), eq(attendance.studentId, studentId)))
    await db.delete(leaveRequests).where(eq(leaveRequests.parishId, parishId))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(classes).where(eq(classes.id, classId))
    await db.delete(academicYears).where(eq(academicYears.id, yearId))
    await db.delete(branches).where(eq(branches.id, branchId))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
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

    const [audit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.entityId, createdRequestId),
      eq(auditLogs.action, 'CREATE_LEAVE_REQUEST'),
    ))
    expect(audit).toBeDefined()
    expect(audit.newValue).not.toContain('sốt xuất huyết')
    expect(audit.newValue).not.toContain('Nguyễn Thị Hoa')
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

    const [audit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.entityId, createdRequestId),
      eq(auditLogs.action, 'REVIEW_LEAVE_REQUEST'),
    ))
    expect(audit).toBeDefined()
    expect(audit.newValue).not.toContain('chúc em mau khỏe')
    expect(audit.newValue).not.toContain('GLV Nguyễn Văn B')
  })

  it('5. Concurrent reviewers cannot both commit or duplicate review audit', async () => {
    const createResponse = await leaveRequestsRouter.request('/', {
      method: 'POST',
      headers: parentHeaders(),
      body: JSON.stringify({
        studentId,
        date: '2026-08-23',
        sessionTypes: ['SundayMass'],
        reason: 'Em có việc gia đình cần xin nghỉ',
      }),
    })
    const requestId = ((await createResponse.json()) as any).data.id as string
    const makeReview = () => leaveRequestsRouter.request(`/${requestId}/review`, {
      method: 'PATCH',
      headers: teacherHeaders(),
      body: JSON.stringify({ status: 'APPROVED', reviewNote: 'Đồng ý' }),
    })
    const responses = await Promise.all([makeReview(), makeReview()])
    const statuses = responses.map(response => response.status)
    expect(statuses.filter(status => status === 200)).toHaveLength(1)
    expect(statuses.filter(status => status === 400 || status === 409)).toHaveLength(1)

    const audits = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.entityId, requestId),
      eq(auditLogs.action, 'REVIEW_LEAVE_REQUEST'),
    ))
    expect(audits).toHaveLength(1)
  })
})



// ─── LV-1 (audit 2026-08-21) — GLV tạo đơn xin phép theo class-scope ───
describe('LV-1: GLV tạo đơn xin phép theo class-scope', () => {
  const lvParish = 'parish-lv-audit'
  const adminToken = generateTokens({ userId: 'usr-lv-admin', username: 'lv_admin', role: 'admin', parishId: lvParish }).accessToken
  const cnAssignedToken = generateTokens({ userId: 'usr-lv-cn', username: 'lv_cn', role: 'chunhiem', parishId: lvParish }).accessToken
  const cnFreeToken = generateTokens({ userId: 'usr-lv-cn-free', username: 'lv_cn_free', role: 'chunhiem', parishId: lvParish }).accessToken

  async function lvReq(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`
    const res = await leaveRequestsRouter.request(path, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
    let body: any = null
    try { body = await res.json() } catch {}
    return { status: res.status, data: body?.data }
  }

  beforeAll(async () => {
    // Dọn dữ liệu cũ của parish test (FK order con → cha)
    await db.delete(auditLogs).where(eq(auditLogs.parishId, lvParish))
    await db.delete(leaveRequests).where(eq(leaveRequests.parishId, lvParish))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, lvParish))
    await db.delete(students).where(eq(students.parishId, lvParish))
    await db.delete(classes).where(eq(classes.parishId, lvParish))
    await db.delete(academicYears).where(eq(academicYears.parishId, lvParish))
    await db.delete(users).where(eq(users.parishId, lvParish))

    await db.insert(branches).values({ id: 'br-lv', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: lvParish })
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', parishId: lvParish })
    await db.insert(classes).values([
      { id: 'cl-lv-a', code: 'LV-A', name: 'Lớp A', branchId: 'br-lv', academicYearId: '2025-2026', parishId: lvParish },
      { id: 'cl-lv-b', code: 'LV-B', name: 'Lớp B', branchId: 'br-lv', academicYearId: '2025-2026', parishId: lvParish },
    ])
    await db.insert(users).values([
      { id: 'usr-lv-admin', username: 'lv_admin', fullName: 'Admin LV', passwordHash: 'hash', role: 'admin', parishId: lvParish },
      { id: 'usr-lv-cn', username: 'lv_cn', fullName: 'CN LV', passwordHash: 'hash', role: 'chunhiem', parishId: lvParish },
      { id: 'usr-lv-cn-free', username: 'lv_cn_free', fullName: 'CN Free LV', passwordHash: 'hash', role: 'chunhiem', parishId: lvParish },
    ])
    await db.insert(catechistAssignments).values({
      id: 'asg-lv-cn', userId: 'usr-lv-cn', classId: 'cl-lv-a', roleInClass: 'chunhiem', parishId: lvParish,
    })
    for (const [id, code, cls] of [
      ['st-lv-a1', 'ST-LV-A1', 'cl-lv-a'],
      ['st-lv-b1', 'ST-LV-B1', 'cl-lv-b'],
    ] as const) {
      await db.insert(students).values({
        id, code, holyName: 'Anrê', fullName: `Hoc Sinh ${code}`, gender: 'Nam',
        dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X',
        branch: 'AuNhi', classId: cls, parishId: lvParish,
      })
    }
  })

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.parishId, lvParish))
    await db.delete(leaveRequests).where(eq(leaveRequests.parishId, lvParish))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, lvParish))
    await db.delete(students).where(eq(students.parishId, lvParish))
    await db.delete(classes).where(eq(classes.parishId, lvParish))
    await db.delete(academicYears).where(eq(academicYears.parishId, lvParish))
    await db.delete(users).where(eq(users.parishId, lvParish))
  })

  it('chunhiem nộp đơn cho HS THUỘC lớp mình → thành công', async () => {
    const res = await lvReq('/', {
      method: 'POST',
      token: cnAssignedToken,
      body: { studentId: 'st-lv-a1', date: '2026-03-15', sessionTypes: ['SundayMass'], reason: 'Việc gia đình' },
    })
    expect(res.status).toBe(201)
  })

  it('LV-1: chunhiem nộp đơn cho HS NGOÀI lớp phụ trách → 403, không ghi DB', async () => {
    const res = await lvReq('/', {
      method: 'POST',
      token: cnAssignedToken,
      body: { studentId: 'st-lv-b1', date: '2026-03-16', sessionTypes: ['CatechismClass'], reason: 'Ngoài lớp' },
    })
    expect(res.status).toBe(403)

    const rows = await db.select().from(leaveRequests).where(and(eq(leaveRequests.parishId, lvParish), eq(leaveRequests.studentId, 'st-lv-b1')))
    expect(rows).toHaveLength(0)
  })

  it('LV-1: chunhiem chưa được phân công lớp nào → 403 với mọi học sinh', async () => {
    const res = await lvReq('/', {
      method: 'POST',
      token: cnFreeToken,
      body: { studentId: 'st-lv-a1', date: '2026-03-17', sessionTypes: ['SundayMass'], reason: 'Không phân công' },
    })
    expect(res.status).toBe(403)
  })

  it('LV-1: admin vẫn được nộp đơn cho học sinh bất kỳ trong giáo xứ', async () => {
    const res = await lvReq('/', {
      method: 'POST',
      token: adminToken,
      body: { studentId: 'st-lv-b1', date: '2026-03-18', sessionTypes: ['SundayMass'], reason: 'Admin thay mặt' },
    })
    expect(res.status).toBe(201)

    const rows = await db.select().from(leaveRequests).where(and(eq(leaveRequests.parishId, lvParish), eq(leaveRequests.studentId, 'st-lv-b1')))
    expect(rows).toHaveLength(1)
  })
})
