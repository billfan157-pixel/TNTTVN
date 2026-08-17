import { describe, it, expect, beforeAll } from 'vitest'
import reportingRouter from '../../routes/reporting.js'
import { db } from '../../db/index.js'
import { users, students, classes, branches, academicYears, catechistAssignments } from '../../db/schema.js'
import { generateId } from '../../utils/id.js'
import { generateTokens } from '../../middleware/auth.js'

describe('Reporting & Parent-Child IDOR Authorization Tests', () => {
  const parishId = 'parish-idor-test'

  const adminId = generateId('USR')
  const parentAUserId = generateId('USR')
  const parentBUserId = generateId('USR')
  const glvClassAId = generateId('USR')

  let adminToken: string
  let parentAToken: string
  let _parentBToken: string
  let glvClassAToken: string

  const childAId = generateId('STU')
  const childBId = generateId('STU')
  const classAId = generateId('CLS')
  const classBId = generateId('CLS')
  const branchId = generateId('BR')
  const ayId = generateId('AY')

  beforeAll(async () => {
    const now = new Date().toISOString()

    // 1. Seed branches & academicYears FIRST
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi IDOR', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId })
    await db.insert(academicYears).values({ id: ayId, startDate: '2025-09-01', endDate: '2026-05-31', parishId })

    // 2. Seed users
    await db.insert(users).values([
      { id: adminId, username: generateId('adm'), fullName: 'Admin IDOR', passwordHash: 'hash', role: 'admin', parishId, tokenVersion: 1, status: 'ACTIVE', createdAt: now },
      { id: parentAUserId, username: generateId('pa'), fullName: 'Phụ Huynh A', phone: '0901111111', passwordHash: 'hash', role: 'phuhuynh', parishId, tokenVersion: 1, status: 'ACTIVE', createdAt: now },
      { id: parentBUserId, username: generateId('pb'), fullName: 'Phụ Huynh B', phone: '0902222222', passwordHash: 'hash', role: 'phuhuynh', parishId, tokenVersion: 1, status: 'ACTIVE', createdAt: now },
      { id: glvClassAId, username: generateId('glv'), fullName: 'GLV Lớp A', passwordHash: 'hash', role: 'chunhiem', parishId, tokenVersion: 1, status: 'ACTIVE', createdAt: now },
    ])

    // 3. Seed classes
    await db.insert(classes).values([
      { id: classAId, code: generateId('C1'), name: 'Ấu Nhi 1A IDOR', branchId, academicYearId: ayId, parishId, createdAt: now, updatedAt: now },
      { id: classBId, code: generateId('C2'), name: 'Ấu Nhi 1B IDOR', branchId, academicYearId: ayId, parishId, createdAt: now, updatedAt: now },
    ])

    // 4. Seed catechist assignment
    await db.insert(catechistAssignments).values({
      id: generateId('ASN'),
      classId: classAId,
      userId: glvClassAId,
      roleInClass: 'chunhiem',
      parishId,
      createdAt: now,
      updatedAt: now,
    })

    // 5. Seed students
    await db.insert(students).values([
      {
        id: childAId, code: generateId('S1'), holyName: 'Maria', fullName: 'Nguyễn Văn A', gender: 'Nam', dateOfBirth: '2015-01-01',
        parentName: 'Phụ Huynh A', parentPhone: '0901111111', address: 'Address A', branch: 'AuNhi', classId: classAId, parishId, createdAt: now, updatedAt: now
      },
      {
        id: childBId, code: generateId('S2'), holyName: 'Giuse', fullName: 'Trần Văn B', gender: 'Nam', dateOfBirth: '2015-02-02',
        parentName: 'Phụ Huynh B', parentPhone: '0902222222', address: 'Address B', branch: 'AuNhi', classId: classBId, parishId, createdAt: now, updatedAt: now
      },
    ])

    // 6. Generate tokens
    adminToken = generateTokens({ userId: adminId, username: 'admin_idor', role: 'admin', parishId, tokenVersion: 1 }).accessToken
    parentAToken = generateTokens({ userId: parentAUserId, username: 'parent_a', role: 'phuhuynh', parishId, tokenVersion: 1 }).accessToken
    _parentBToken = generateTokens({ userId: parentBUserId, username: 'parent_b', role: 'phuhuynh', parishId, tokenVersion: 1 }).accessToken
    glvClassAToken = generateTokens({ userId: glvClassAId, username: 'glv_class_a', role: 'chunhiem', parishId, tokenVersion: 1 }).accessToken
  })

  it('1. Parent A viewing Child A -> 200 OK', async () => {
    const res = await reportingRouter.request(`/report-card/${childAId}?academicYear=${ayId}`, {
      headers: { Authorization: `Bearer ${parentAToken}` }
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.data.student.id).toBe(childAId)
  })

  it('2. Parent A viewing Child B -> 403 Forbidden', async () => {
    const res = await reportingRouter.request(`/report-card/${childBId}?academicYear=${ayId}`, {
      headers: { Authorization: `Bearer ${parentAToken}` }
    })
    expect(res.status).toBe(403)
    const json = (await res.json()) as any
    const errCode = typeof json.error === 'object' ? json.error.code : json.error
    expect(errCode).toBe('FORBIDDEN')
  })

  it('3. Giáo lý viên Class A accessing Student Class B -> 403 Forbidden', async () => {
    const res = await reportingRouter.request(`/report-card/${childBId}?academicYear=${ayId}`, {
      headers: { Authorization: `Bearer ${glvClassAToken}` }
    })
    expect(res.status).toBe(403)
    const json = (await res.json()) as any
    const errCode = typeof json.error === 'object' ? json.error.code : json.error
    expect(errCode).toBe('FORBIDDEN')
  })

  it('4. Admin accessing all resources -> 200 OK', async () => {
    const resA = await reportingRouter.request(`/report-card/${childAId}?academicYear=${ayId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    })
    expect(resA.status).toBe(200)

    const resB = await reportingRouter.request(`/report-card/${childBId}?academicYear=${ayId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    })
    expect(resB.status).toBe(200)
  })
})
