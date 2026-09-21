import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import notificationsApp from '../routes/notifications.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, students, classes, branches, academicYears, catechistAssignments, auditLogs, pushSubscriptions, notifications } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

describe('Server Notifications Route Handler Tests - Unauthenticated', () => {
  it('blocks unauthenticated POST /subscribe with 401', async () => {
    const res = await notificationsApp.request('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://example.com', keys: { p256dh: 'key', auth: 'auth' } }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /unsubscribe with 401', async () => {
    const res = await notificationsApp.request('/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://example.com' }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated native token registration and removal with 401', async () => {
    const registration = await notificationsApp.request('/native/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: '11111111-1111-4111-8111-111111111111', platform: 'android', token: 'native-token-1234567890' }),
    })
    const removal = await notificationsApp.request('/native/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: '11111111-1111-4111-8111-111111111111' }),
    })
    expect(registration.status).toBe(401)
    expect(removal.status).toBe(401)
  })

  it('blocks unauthenticated POST /send with 401', async () => {
    const res = await notificationsApp.request('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', body: 'Test body' }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated GET /subscriptions with 401', async () => {
    const res = await notificationsApp.request('/subscriptions')
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated GET / (history) with 401', async () => {
    const res = await notificationsApp.request('/')
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /smart/absence with 401', async () => {
    const res = await notificationsApp.request('/smart/absence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName: 'Test', holyName: 'Test', className: 'Lớp 1', date: '2025-01-01', status: 'AbsentUnexcused', parentName: 'Parent', parentPhone: '0901234567' }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /smart/report-cards with 401', async () => {
    const res = await notificationsApp.request('/smart/report-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: [{ studentName: 'A', holyName: 'B', className: 'Lớp 1', score: 8, rank: 'Giỏi', attendanceRate: 90, attendancePresent: 18, attendanceTotal: 20 }] }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /smart/reminder/sunday with 401', async () => {
    const res = await notificationsApp.request('/smart/reminder/sunday', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /smart/reminder/class with 401', async () => {
    const res = await notificationsApp.request('/smart/reminder/class', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ className: 'Lớp 1', date: '2025-01-01' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('Server Notifications Route Handler Tests - Authenticated & Audit Fixes', () => {
  const PREFIX = Date.now()
  const parishId = `parish-notif-route-${PREFIX}`
  const branchId = `br-route-${PREFIX}`
  const yearId = `yr-route-${PREFIX}`
  const classId = `cl-route-${PREFIX}`
  const adminId = `usr-admin-${PREFIX}`
  const chunhiemId = `usr-chunhiem-${PREFIX}`
  const phuhuynhId = `usr-phuhuynh-${PREFIX}`
  const student1Id = `st-route-1-${PREFIX}`
  const student2Id = `st-route-2-${PREFIX}`

  let adminToken: string
  let chunhiemToken: string
  let phuhuynhToken: string

  beforeAll(async () => {
    adminToken = generateTokens({ userId: adminId, username: `admin_${PREFIX}`, role: 'admin', parishId }).accessToken
    chunhiemToken = generateTokens({ userId: chunhiemId, username: `chunhiem_${PREFIX}`, role: 'chunhiem', parishId }).accessToken
    phuhuynhToken = generateTokens({ userId: phuhuynhId, username: `phuhuynh_${PREFIX}`, role: 'phuhuynh', parishId }).accessToken

    const now = new Date().toISOString()
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: '#fff', ageMin: 6, ageMax: 9, parishId })
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-06-30', parishId })
    await db.insert(classes).values({ id: classId, code: `CL-${PREFIX}`, name: 'Lớp 1A', branchId, academicYearId: yearId, parishId })
    await db.insert(users).values([
      { id: adminId, username: `admin_${PREFIX}`, passwordHash: 'hash', fullName: 'Admin User', role: 'admin', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: chunhiemId, username: `chunhiem_${PREFIX}`, passwordHash: 'hash', fullName: 'Chủ Nhiệm User', role: 'chunhiem', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: phuhuynhId, username: `phuhuynh_${PREFIX}`, passwordHash: 'hash', fullName: 'Phụ Huynh User', phone: '0901234567', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
    ])
    await db.insert(catechistAssignments).values({
      id: `asg-${PREFIX}`,
      classId,
      userId: chunhiemId,
      roleInClass: 'chunhiem',
      parishId,
    })
    // Sibling students sharing the same parentPhone
    await db.insert(students).values([
      { id: student1Id, code: `ST-1-${PREFIX}`, holyName: 'Giuse', fullName: 'Nguyễn Văn Anh', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Phụ Huynh User', parentPhone: '0901234567', address: 'X', branch: 'AuNhi', classId, parishId, status: 'Đang học', createdAt: now, updatedAt: now },
      { id: student2Id, code: `ST-2-${PREFIX}`, holyName: 'Maria', fullName: 'Nguyễn Thị Bình', gender: 'Nữ', dateOfBirth: '2017-02-02', parentName: 'Phụ Huynh User', parentPhone: '0901234567', address: 'X', branch: 'AuNhi', classId, parishId, status: 'Đang học', createdAt: now, updatedAt: now },
    ])
  })

  afterAll(async () => {
    await db.delete(notifications).where(eq(notifications.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
    await db.delete(classes).where(eq(classes.id, classId))
    await db.delete(academicYears).where(eq(academicYears.id, yearId))
    await db.delete(branches).where(eq(branches.id, branchId))
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.parishId, parishId))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
  })

  // NOTIF-02: GET / history endpoint
  it('GET / blocks unauthorized role phuhuynh with 403', async () => {
    const res = await notificationsApp.request('/', {
      headers: { Authorization: `Bearer ${phuhuynhToken}` },
    })
    expect(res.status).toBe(403)
  })

  it('GET / allows admin and chunhiem to query notification history with pagination and filters', async () => {
    // Insert a test notification row
    const testNotifId = generateId('NOT')
    await db.insert(notifications).values({
      id: testNotifId,
      parishId,
      type: 'web_push',
      channel: 'absence',
      deliveryKind: 'absence',
      status: 'retrying',
      recipient: 'Parent',
      message: 'Thông báo vắng mặt',
      triggeredByType: 'system',
      createdAt: new Date().toISOString(),
    })

    const res = await notificationsApp.request('/?page=1&limit=10&status=retrying&channel=absence', {
      headers: { Authorization: `Bearer ${chunhiemToken}` },
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.data.items).toBeInstanceOf(Array)
    expect(json.data.items.length).toBeGreaterThanOrEqual(1)
    const found = json.data.items.find((item: { id: string }) => item.id === testNotifId)
    expect(found).toBeDefined()
    expect(found.recipient).toBe('Parent')
    expect(json.data.pagination.page).toBe(1)
    expect(json.data.pagination.limit).toBe(10)
  })

  // NOTIF-01: Sibling ambiguity detection
  it('POST /smart/absence returns 400 AMBIGUOUS_STUDENT with candidates when siblings share parentPhone', async () => {
    const res = await notificationsApp.request('/smart/absence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        studentName: 'Nguyễn Văn Anh',
        holyName: 'Giuse',
        className: 'Lớp 1A',
        date: '2025-01-01',
        status: 'AbsentUnexcused',
        parentName: 'Phụ Huynh User',
        parentPhone: '0901234567',
      }),
    })
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.error.code).toBe('AMBIGUOUS_STUDENT')
    expect(json.error.details.candidates).toHaveLength(2)
    expect(json.error.details.candidates.map((c: { studentId: string }) => c.studentId)).toContain(student1Id)
    expect(json.error.details.candidates.map((c: { studentId: string }) => c.studentId)).toContain(student2Id)
  })

  it('POST /smart/absence succeeds when studentId is explicitly supplied', async () => {
    const res = await notificationsApp.request('/smart/absence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        studentId: student1Id,
        studentName: 'Nguyễn Văn Anh',
        holyName: 'Giuse',
        className: 'Lớp 1A',
        date: '2025-01-01',
        status: 'AbsentUnexcused',
        parentName: 'Phụ Huynh User',
        parentPhone: '0901234567',
      }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.data.ok).toBe(true)
  })

  // NOTIF-08: Subscription audit logs and orphan unsubscribe safety
  it('POST /subscribe records audit log and POST /unsubscribe safely removes orphan subscriptions', async () => {
    const subEndpoint = `https://fcm.googleapis.com/test-endpoint-${PREFIX}`
    const resSub = await notificationsApp.request('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        endpoint: subEndpoint,
        keys: { p256dh: 'p256dh_key', auth: 'auth_key' },
      }),
    })
    expect(resSub.status).toBe(200)

    const subAudits = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.action, 'WEB_PUSH_SUBSCRIBE'),
    ))
    expect(subAudits.length).toBeGreaterThanOrEqual(1)

    // Insert an orphan subscription (userId IS NULL)
    const orphanEndpoint = `https://fcm.googleapis.com/test-orphan-${PREFIX}`
    await db.insert(pushSubscriptions).values({
      id: generateId('NOT'),
      endpoint: orphanEndpoint,
      p256dh: 'p256',
      auth: 'auth',
      userId: null,
      parishId,
    })

    const resUnsub = await notificationsApp.request('/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ endpoint: orphanEndpoint }),
    })
    expect(resUnsub.status).toBe(200)

    const remaining = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, orphanEndpoint))
    expect(remaining).toHaveLength(0)

    const unsubAudits = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.action, 'WEB_PUSH_UNSUBSCRIBE'),
    ))
    expect(unsubAudits.length).toBeGreaterThanOrEqual(1)
  })
})
