import { describe, it, expect, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { generateTokens } from '../middleware/auth.js'
import gradesApp from '../routes/grades.js'
import auditLogsApp from '../routes/auditLogs.js'
import settingsApp from '../routes/settings.js'
import authApp from '../routes/auth.js'
import parentsApp from '../routes/parents.js'
import { db } from '../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, auditLogs,  telegramLinks } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'

// GRADE-SYNC-1 (2026-08-14): E2E mô phỏng luồng frontend upsertGrade → backend
// ghi audit_logs → GET /api/audit-logs trả về đúng. Xác nhận root-cause fix:
// server đã ghi audit; issue gốc nằm ở frontend không trigger sync (xem gradeStore).
const parishId = 'parish-audit-sync'
const cnToken = generateTokens({ userId: 'usr-audit-cn', username: 'audit_cn', role: 'chunhiem', parishId }).accessToken

async function jsonReq(app: any, path: string, options: { method?: string; body?: unknown; token?: string; parishId?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`
  const res = await app.request(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  let body: any = null
  try { body = (await res.json()) as any } catch {}
  return { status: res.status, body }
}

describe('GRADE-SYNC-1: upsertGrade → audit_logs → GET /api/audit-logs', () => {
  beforeAll(async () => {
    await db.insert(branches).values({ id: 'br-audit-01', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-09-01', endDate: '2026-05-31', parishId }).onConflictDoNothing()
    await db.insert(classes).values({ id: 'cl-audit-01', code: 'CL-AUDIT', name: 'Lớp Audit', branchId: 'br-audit-01', academicYearId: '2025-2026', parishId }).onConflictDoNothing()
    const passwordHash = await bcrypt.hash('Test@123456', 10)
    await db.insert(users).values([
      { id: 'usr-audit-cn', username: 'audit_cn', fullName: 'CN Audit', passwordHash, role: 'chunhiem', parishId },
      { id: 'usr-audit-admin', username: 'audit_admin', fullName: 'Admin Audit', passwordHash, role: 'admin', parishId },
      { id: 'usr-audit-parent', username: 'audit_parent', fullName: 'Parent Audit', passwordHash, role: 'phuhuynh', phone: '0901234567', parishId },
      // Parish khác dùng cùng userId -> kiểm chứng tenant isolation của join auditLogs
      { id: 'usr-audit-cn', username: 'audit_cn', fullName: 'OTHER PARISH USER', passwordHash, role: 'chunhiem', parishId: 'parish-other' },
    ]).onConflictDoNothing()
    await db.insert(students).values({
      id: 'st-audit-01', code: 'ST-AUDIT-1', holyName: 'Giu-se', fullName: 'Nguyen Van C',
      gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '0901234567',
      address: 'X', branch: 'AuNhi', classId: 'cl-audit-01', parishId,
    }).onConflictDoNothing()
    await db.insert(catechistAssignments).values({
      id: 'asg-audit-01', userId: 'usr-audit-cn', classId: 'cl-audit-01', roleInClass: 'chunhiem', parishId,
    }).onConflictDoNothing()
    await db.insert(telegramLinks).values({
      id: 'tg-audit-01', userId: 'usr-audit-parent', parishId, chatId: 'chat_test_123', status: 'ACTIVE', notificationsEnabled: 1,
    }).onConflictDoNothing()
  })

  it('POST /api/grades ghi audit_logs (CREATE) cho thao tác nhập điểm', async () => {
    const { status } = await jsonReq(gradesApp, '/', {
      method: 'POST',
      token: cnToken,
      body: { studentId: 'st-audit-01', semester: 1, academicYear: '2025-2026', score15m: 8 },
    })
    expect(status).toBe(200)

    const [audit] = await db
      .select({ action: auditLogs.action, entityType: auditLogs.entityType, userId: auditLogs.userId, parishId: auditLogs.parishId, entityId: auditLogs.entityId })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'grade'), eq(auditLogs.userId, 'usr-audit-cn'), eq(auditLogs.parishId, parishId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1)

    expect(audit).toBeDefined()
    expect(audit?.action).toBe('CREATE')
    expect(audit?.entityType).toBe('grade')
    expect(audit?.parishId).toBe(parishId)
  })

  it('PUT /api/settings ghi audit_logs (UPDATE, settings) khi cập nhật cấu hình', async () => {
    const adminToken = generateTokens({ userId: 'usr-audit-admin', username: 'audit_admin', role: 'admin', parishId }).accessToken
    const { status } = await jsonReq(settingsApp, '/', {
      method: 'PUT',
      token: adminToken,
      body: { sundayMassTime: '07:30' },
    })
    expect(status).toBe(200)

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'settings'), eq(auditLogs.userId, 'usr-audit-admin'), eq(auditLogs.parishId, parishId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1)

    expect(audit).toBeDefined()
    expect(audit?.action).toBe('UPDATE')
    expect(audit?.entityType).toBe('settings')
    expect(audit?.entityId).toBe('parish_system_settings')
  })

  it('POST /api/auth/login ghi audit_logs (LOGIN & LOGIN_FAILED)', async () => {
    // 1. Thất bại (sai pass)
    const resFail = await jsonReq(authApp, '/login', {
      method: 'POST',
      body: { username: 'audit_admin', password: 'WrongPassword@123', parishId },
    })
    expect(resFail.status).toBe(401)

    const [auditFail] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'auth'), eq(auditLogs.action, 'LOGIN_FAILED'), eq(auditLogs.entityId, 'usr-audit-admin')))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1)

    expect(auditFail).toBeDefined()
    expect(auditFail?.action).toBe('LOGIN_FAILED')

    // 2. Thành công
    const resSuccess = await jsonReq(authApp, '/login', {
      method: 'POST',
      body: { username: 'audit_admin', password: 'Test@123456', parishId },
    })
    expect(resSuccess.status).toBe(200)

    const [auditSuccess] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'auth'), eq(auditLogs.action, 'LOGIN'), eq(auditLogs.entityId, 'usr-audit-admin')))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1)

    expect(auditSuccess).toBeDefined()
    expect(auditSuccess?.action).toBe('LOGIN')
  })

  it('POST /api/parents/telegram/notifications ghi audit_logs (parent)', async () => {
    const parentToken = generateTokens({ userId: 'usr-audit-parent', username: 'audit_parent', role: 'phuhuynh', parishId }).accessToken
    const { status } = await jsonReq(parentsApp, '/telegram/notifications', {
      method: 'POST',
      token: parentToken,
      body: { enabled: false },
    })
    expect(status).toBe(200)

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'parent'), eq(auditLogs.action, 'UPDATE_TELEGRAM_NOTIFICATIONS'), eq(auditLogs.userId, 'usr-audit-parent')))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1)

    expect(audit).toBeDefined()
    expect(audit?.action).toBe('UPDATE_TELEGRAM_NOTIFICATIONS')
  })

  it('GET /api/audit-logs hiển thị userName đúng parish (tenant isolation join)', async () => {
    const adminToken = generateTokens({ userId: 'usr-audit-admin', username: 'audit_admin', role: 'admin', parishId }).accessToken
    const { status, body } = await jsonReq(auditLogsApp, '/', { method: 'GET', token: adminToken })

    expect(status).toBe(200)
    const data = body?.data ?? body?.logs ?? []
    const rows = Array.isArray(data) ? data : (data as any)?.rows ?? []
    const target = rows.find((r: any) => r.entityType === 'grade' && r.userId === 'usr-audit-cn')
    expect(target).toBeDefined()
    // KHÔNG được trả về user "OTHER PARISH USER" dù cùng userId — thiếu parish trong join
    expect(target?.userName).toBe('CN Audit')
    expect(target?.userName).not.toBe('OTHER PARISH USER')
  })

  it('GET /api/audit-logs chỉ trả log thuộc parish hiện tại', async () => {
    const adminToken = generateTokens({ userId: 'usr-audit-admin', username: 'audit_admin', role: 'admin', parishId }).accessToken
    const { status, body } = await jsonReq(auditLogsApp, '/', { method: 'GET', token: adminToken })
    expect(status).toBe(200)
    const data = body?.data ?? body?.logs ?? []
    const rows = Array.isArray(data) ? data : (data as any)?.rows ?? []
    for (const r of rows) {
      expect(r.parishId ?? parishId).toBe(parishId)
    }
  })
})
