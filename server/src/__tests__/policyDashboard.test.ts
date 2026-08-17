import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { generateTokens } from '../middleware/auth.js'
import auditLogsApp from '../routes/auditLogs.js'
import { db } from '../db/index.js'
import { users, branches, academicYears, classes, students, grades, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

// P3 (2026-08-17): Policy Visualization Dashboard — integration test for
// GET /api/audit-logs/policy-history enrichment:
//  - grade_override → resolves gradeId → studentId → student name (tenant-scoped)
//  - promotion_record → resolves studentId → student name
//  - meta.summary exposes dashboard header stats
//  - tenant isolation: other-parish audit logs are never returned
const parishId = 'parish-policy-dash'
const otherParish = 'parish-policy-other'

async function jsonReq(app: any, path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
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

describe('P3 POLICY-DASHBOARD: GET /api/audit-logs/policy-history enrichment', () => {
  const adminToken = generateTokens({ userId: 'usr-policy-admin', username: 'policy_admin', role: 'admin', parishId }).accessToken
  const now = new Date().toISOString()

  let gradeId: string

  beforeAll(async () => {
    // Clean any leftover test data
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
    await db.delete(grades).where(eq(grades.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(classes).where(eq(classes.parishId, parishId))
    await db.delete(branches).where(eq(branches.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))

    await db.insert(branches).values({ id: 'br-policy-01', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId }).onConflictDoNothing()
    await db.insert(branches).values({ id: 'br-policy-01', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: otherParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-09-01', endDate: '2026-05-31', parishId }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-09-01', endDate: '2026-05-31', parishId: otherParish }).onConflictDoNothing()
    await db.insert(classes).values([
      { id: 'cl-policy-01', code: 'CL-POLICY', name: 'Lớp Policy', branchId: 'br-policy-01', academicYearId: '2025-2026', parishId },
      { id: 'cl-other-01', code: 'CL-OTHER', name: 'Lớp Khác', branchId: 'br-policy-01', academicYearId: '2025-2026', parishId: otherParish },
    ]).onConflictDoNothing()

    const passwordHash = await bcrypt.hash('Test@123456', 10)
    await db.insert(users).values({
      id: 'usr-policy-admin', username: 'policy_admin', fullName: 'Admin Policy', passwordHash, role: 'admin', parishId,
    }).onConflictDoNothing()

    await db.insert(students).values([
      {
        id: 'st-policy-01', code: 'ST-POLICY-1', holyName: 'Giu-se', fullName: 'Nguyen Van A',
        gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '0901234567',
        address: 'X', branch: 'AuNhi', classId: 'cl-policy-01', parishId,
      },
      {
        id: 'st-other-01', code: 'ST-OTHER-1', holyName: 'Maria', fullName: 'OTHER PARISH STUDENT',
        gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'Q', parentPhone: '0909999999',
        address: 'Y', branch: 'AuNhi', classId: 'cl-other-01', parishId: otherParish,
      },
    ]).onConflictDoNothing()

    // Grade row for override enrichment (grade_override audit stores only gradeId)
    await db.insert(grades).values({
      id: 'gr-policy-01', studentId: 'st-policy-01', academicYear: '2025-2026', semester: 1,
      scoreOral: 8, score15m: 7, score1Period: 9, scoreMidterm: 8, scoreFinal: 8,
      version: 1, parishId,
    }).onConflictDoNothing()

    gradeId = 'gr-policy-01'
  })

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
    await db.delete(grades).where(eq(grades.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(classes).where(eq(classes.parishId, parishId))
    await db.delete(branches).where(eq(branches.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, otherParish))
    await db.delete(grades).where(eq(grades.parishId, otherParish))
    await db.delete(students).where(eq(students.parishId, otherParish))
    await db.delete(classes).where(eq(classes.parishId, otherParish))
    await db.delete(branches).where(eq(branches.parishId, otherParish))
    await db.delete(academicYears).where(eq(academicYears.parishId, otherParish))
  })

  it('returns grade_override entry with resolved studentId/studentName (tenant-scoped)', async () => {
    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: 'usr-policy-admin',
      action: 'OVERRIDE_GRADE',
      entityType: 'grade_override',
      entityId: 'grov-policy-01',
      newValue: JSON.stringify({
        gradeId: gradeId,
        scoreField: 'scoreFinal',
        manualValue: 9.5,
        policyVersionId: 'policy-settings-parish-policy-dash-2026-08-17T00:00:00Z',
      }),
      parishId,
      createdAt: now,
    })

    const { status, body } = await jsonReq(auditLogsApp, '/policy-history?limit=10', { token: adminToken })
    expect(status).toBe(200)

    const override = body.data.find((e: any) => e.entityType === 'grade_override')
    expect(override).toBeDefined()
    expect(override.policyMetadata.type).toBe('GRADE_OVERRIDE')
    expect(override.policyMetadata.gradeId).toBe(gradeId)
    // Enrichment: gradeId → studentId → name
    expect(override.studentId).toBe('st-policy-01')
    expect(override.studentName).toBe('Giu-se Nguyen Van A')
    expect(override.policyMetadata.studentId).toBe('st-policy-01')
    expect(override.policyMetadata.studentName).toBe('Giu-se Nguyen Van A')
  })

  it('returns promotion_record entry with resolved student name', async () => {
    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: 'usr-policy-admin',
      action: 'APPROVE_PROMOTION',
      entityType: 'promotion_record',
      entityId: 'prm-policy-01',
      newValue: JSON.stringify({
        studentId: 'st-policy-01',
        gpaSnapshot: 8.4,
        finalDecision: 'PROMOTED',
        policyVersionId: 'policy-settings-parish-policy-dash-2026-08-17T00:00:00',
      }),
      parishId,
      createdAt: new Date(Date.now() + 1000).toISOString(),
    })

    const { body } = await jsonReq(auditLogsApp, '/policy-history?limit=10', { token: adminToken })
    const promo = body.data.find((e: any) => e.entityType === 'promotion_record')
    expect(promo).toBeDefined()
    expect(promo.policyMetadata.type).toBe('PROMOTION_DECISION')
    expect(promo.studentId).toBe('st-policy-01')
    expect(promo.studentName).toBe('Giu-se Nguyen Van A')
    expect(promo.policyMetadata.gpa).toBe(8.4)
    expect(promo.policyMetadata.decision).toBe('PROMOTED')
  })

  it('returns meta.summary stats derived from full matching set', async () => {
    const { body } = await jsonReq(auditLogsApp, '/policy-history?limit=10', { token: adminToken })
    expect(body.meta.summary).toBeDefined()
    expect(body.meta.summary.gradeOverrides).toBeGreaterThanOrEqual(1)
    expect(body.meta.summary.promotionDecisions).toBeGreaterThanOrEqual(1)
    expect(body.meta.summary.policyUpdates).toBe(0)
    expect(body.meta.summary.total).toBeGreaterThanOrEqual(2)
  })

  it('enforces tenant isolation — other-parish audit logs never returned', async () => {
    // Insert a grade_override log pointing to a grade from another parish.
    await db.insert(grades).values({
      id: 'gr-other-01', studentId: 'st-other-01', academicYear: '2025-2026', semester: 1,
      scoreOral: 7, score15m: 7, score1Period: 7, scoreMidterm: 7, scoreFinal: 7,
      version: 1, parishId: otherParish,
    }).onConflictDoNothing()
    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: 'usr-policy-admin',
      action: 'OVERRIDE_GRADE',
      entityType: 'grade_override',
      entityId: 'grov-other-01',
      newValue: JSON.stringify({
        gradeId: 'gr-other-01',
        scoreField: 'scoreFinal',
        manualValue: 7.5,
        policyVersionId: 'policy-settings-parish-policy-other-2026-08-17T00:00:00',
      }),
      parishId: otherParish,
      createdAt: new Date(Date.now() + 2000).toISOString(),
    })

    const { body } = await jsonReq(auditLogsApp, '/policy-history?limit=10', { token: adminToken })
    // No entry from otherParish should appear
    const foreign = body.data.filter((e: any) => e.policyMetadata?.gradeId === 'gr-other-01')
    expect(foreign.length).toBe(0)
    // And the other parish's log must not inflate our summary.
    expect(body.meta.summary.total).toBeLessThanOrEqual(2)
  })
})