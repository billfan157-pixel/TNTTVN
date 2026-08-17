import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { eq, and } from 'drizzle-orm'
import gradesApp from '../routes/grades.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, academicYears, branches, classes, students, catechistAssignments, grades } from '../db/schema.js'

const PREFIX = Date.now()
const parishId = `parish-semfilter-${PREFIX}`
const yearId = `AY-${PREFIX}-1`
const adminId = `usr-semfilter-admin-${PREFIX}`
const catId = `usr-semfilter-cat-${PREFIX}`
const adminUsername = `semfilter_admin_${PREFIX}`
const catUsername = `semfilter_cat_${PREFIX}`
const STRONG = 'Parish@123456'

const now = new Date()
const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

describe('Server RBAC Semester Filter Gating Tests', () => {
  let adminToken: string
  let catToken: string

  beforeAll(async () => {
    await db.insert(users).values([
      {
        id: adminId,
        username: adminUsername,
        fullName: 'SemFilter Admin',
        passwordHash: await bcrypt.hash(STRONG, 4),
        role: 'admin',
        parishId,
        tokenVersion: 1,
        status: 'ACTIVE',
        createdAt: now.toISOString(),
      },
      {
        id: catId,
        username: catUsername,
        fullName: 'SemFilter Catechist',
        passwordHash: await bcrypt.hash(STRONG, 4),
        role: 'chunhiem',
        parishId,
        tokenVersion: 1,
        status: 'ACTIVE',
        createdAt: now.toISOString(),
      },
    ]).onConflictDoNothing()

    await db.insert(academicYears).values({
      id: yearId,
      startDate,
      endDate,
      isLocked: 0,
      currentSemester: 2,
      parishId,
    }).onConflictDoNothing()

    await db.insert(branches).values({
      id: `br-semfilter-${PREFIX}`,
      name: 'Ấu Nhi',
      scarfColor: 'Xanh',
      ageMin: 6,
      ageMax: 9,
      parishId,
    }).onConflictDoNothing()

    await db.insert(classes).values({
      id: `cl-semfilter-${PREFIX}`,
      code: 'CL-SEMFILTER',
      name: 'Lớp SemFilter',
      branchId: `br-semfilter-${PREFIX}`,
      academicYearId: yearId,
      parishId,
    }).onConflictDoNothing()

    await db.insert(students).values({
      id: `st-semfilter-${PREFIX}`,
      code: `ST-SEMFILTER-${PREFIX}`,
      holyName: 'Maria',
      fullName: 'Nguyen Thi SemFilter',
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '000',
      address: 'X',
      branch: 'AuNhi',
      classId: `cl-semfilter-${PREFIX}`,
      parishId,
    }).onConflictDoNothing()

    await db.insert(catechistAssignments).values({
      id: `ct-semfilter-${PREFIX}`,
      classId: `cl-semfilter-${PREFIX}`,
      userId: catId,
      roleInClass: 'chunhiem',
      parishId,
    }).onConflictDoNothing()

    await db.insert(grades).values([
      {
        id: `gr-semfilter-s1-${PREFIX}`,
        studentId: `st-semfilter-${PREFIX}`,
        academicYear: yearId,
        semester: 1,
        scoreOral: 8,
        scoreMidterm: 9,
        scoreFinal: 9,
        parishId,
      },
      {
        id: `gr-semfilter-s2-${PREFIX}`,
        studentId: `st-semfilter-${PREFIX}`,
        academicYear: yearId,
        semester: 2,
        scoreOral: 9,
        scoreMidterm: 8,
        scoreFinal: 10,
        parishId,
      },
    ]).onConflictDoNothing()

    adminToken = generateTokens({ userId: adminId, username: adminUsername, role: 'admin', parishId, tokenVersion: 1 }).accessToken
    catToken = generateTokens({ userId: catId, username: catUsername, role: 'chunhiem', parishId, tokenVersion: 1 }).accessToken
  })

  afterAll(async () => {
    await db.delete(grades).where(eq(grades.parishId, parishId))
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
    await db.delete(students).where(eq(students.parishId, parishId))
    await db.delete(classes).where(eq(classes.parishId, parishId))
    await db.delete(branches).where(eq(branches.parishId, parishId))
    await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
    await db.delete(users).where(eq(users.parishId, parishId))
  })

  it('non-admin GET /grades chỉ trả học kỳ đang mở (current_semester=2)', async () => {
    const res = await gradesApp.request('/', {
      headers: { Authorization: `Bearer ${catToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBe(1)
    expect(body.data[0].semester).toBe(2)
  })

  it('non-admin KHÔNG đọc được HK1 qua query param semester=1 (param bị bỏ qua)', async () => {
    const res = await gradesApp.request('/?semester=1', {
      headers: { Authorization: `Bearer ${catToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.length).toBe(1)
    expect(body.data[0].semester).toBe(2)
  })

  it('admin GET /grades vẫn đọc được cả HK1 + HK2', async () => {
    const res = await gradesApp.request('/', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.length).toBe(2)
    const semesters = new Set(body.data.map((g: any) => g.semester))
    expect(semesters.has(1)).toBe(true)
    expect(semesters.has(2)).toBe(true)
  })

  it('khi năm học đang mở HK1 (current_semester=1), non-admin chỉ thấy HK1', async () => {
    await db
      .update(academicYears)
      .set({ currentSemester: 1 })
      .where(and(eq(academicYears.id, yearId), eq(academicYears.parishId, parishId)))

    const res = await gradesApp.request('/', {
      headers: { Authorization: `Bearer ${catToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.length).toBe(1)
    expect(body.data[0].semester).toBe(1)

    await db
      .update(academicYears)
      .set({ currentSemester: 2 })
      .where(and(eq(academicYears.id, yearId), eq(academicYears.parishId, parishId)))
  })
})
