import { describe, it, expect, beforeAll } from 'vitest'
import classesApp from '../routes/classes.js'
import studentsApp from '../routes/students.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { academicYears, branches, classes, students, users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const parishNoYear = 'parish-gate-noyear'
const parishNoClass = 'parish-gate-noclass'
const branchNoYear = 'br-gate-noyear'
const branchNoClass = 'br-gate-noclass'
const yearNoYear = 'gate-2025-2026'
const yearNoClass = 'gate2-2025-2026'
const classId = 'cl-gate-01'
const classCode = 'CL-GATE'

function adminHeaders(parishId: string) {
  const userId = `usr-gate-${parishId}`
  const { accessToken } = generateTokens({
    userId,
    username: `admin_${parishId}`,
    role: 'admin',
    parishId,
    tokenVersion: 1,
  })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

async function cleanup(): Promise<void> {
  for (const p of [parishNoYear, parishNoClass]) {
    await db.delete(students).where(eq(students.parishId, p))
    await db.delete(classes).where(eq(classes.parishId, p))
    await db.delete(academicYears).where(eq(academicYears.parishId, p))
    await db.delete(branches).where(eq(branches.parishId, p))
    await db.delete(users).where(eq(users.parishId, p))
  }
}

async function seedAdmin(parishId: string): Promise<void> {
  await db.insert(users).values({
    id: `usr-gate-${parishId}`,
    username: `admin_${parishId}`,
    fullName: 'Admin Gate',
    passwordHash: 'hash',
    role: 'admin',
    tokenVersion: 1,
    parishId,
  }).onConflictDoNothing()
}

describe('Onboarding Gates — Năm học → Lớp → Học sinh', () => {
  beforeAll(async () => {
    await cleanup()
    await seedAdmin(parishNoYear)
    await seedAdmin(parishNoClass)
  })

  it('1. POST /api/classes rejected (409) when parish has NO academic year', async () => {
    const res = await classesApp.request('/', {
      method: 'POST',
      headers: adminHeaders(parishNoYear),
      body: JSON.stringify({ code: classCode, name: 'Lớp Gate', branchId: branchNoYear, academicYearId: yearNoYear }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as any
    expect(body.error.code).toBe('ACADEMIC_YEAR_REQUIRED')
    expect(body.error.message).toMatch(/tạo năm học trước/i)
  })

  it('2. POST /api/classes succeeds (201) after an academic year exists', async () => {
    await db.insert(branches).values({ id: branchNoYear, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: parishNoYear }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearNoYear, startDate: '2025-09-01', endDate: '2026-05-31', parishId: parishNoYear }).onConflictDoNothing()

    const res = await classesApp.request('/', {
      method: 'POST',
      headers: adminHeaders(parishNoYear),
      body: JSON.stringify({ code: classCode, name: 'Lớp Gate', branchId: branchNoYear, academicYearId: yearNoYear }),
    })
    expect(res.status).toBe(201)
  })

  it('3. POST /api/students rejected (409) when parish has NO class', async () => {
    const res = await studentsApp.request('/', {
      method: 'POST',
      headers: adminHeaders(parishNoClass),
      body: JSON.stringify({
        holyName: 'Anna', fullName: 'Nguyễn Thị An', gender: 'Nữ',
        dateOfBirth: '2015-01-01', branch: 'AuNhi', classId,
      }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as any
    expect(body.error.code).toBe('CLASS_REQUIRED')
    expect(body.error.message).toMatch(/tạo lớp học trước/i)
  })

  it('4. POST /api/students succeeds (201) after a class exists', async () => {
    await db.insert(branches).values({ id: branchNoClass, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: parishNoClass }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearNoClass, startDate: '2025-09-01', endDate: '2026-05-31', parishId: parishNoClass }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: classCode, name: 'Lớp Gate', branchId: branchNoClass, academicYearId: yearNoClass, parishId: parishNoClass }).onConflictDoNothing()

    const res = await studentsApp.request('/', {
      method: 'POST',
      headers: adminHeaders(parishNoClass),
      body: JSON.stringify({
        holyName: 'Anna', fullName: 'Nguyễn Thị An', gender: 'Nữ',
        dateOfBirth: '2015-01-01', branch: 'AuNhi', classId,
      }),
    })
    expect(res.status).toBe(201)
  })
})
